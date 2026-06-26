use chrono::Utc;

use rand::Rng;

use crate::{
    app::AppState,
    errors::ApiError,
    modules::{
        auth::{
            auth_dto::{
                AuthResponse, LoginRequest, MessageResponse, PasswordResetConfirmRequest,
                PasswordResetRequest, RegisterRequest, ResendVerificationRequest,
                VerifyEmailRequest,
            },
            auth_repository::AuthRepository,
            password_hasher::PasswordHasher,
        },
        email::email_service::EmailService,
        users::{
            user_dto::UserResponse,
            user_entity::UserEntity,
            user_repository::{CreateUserInput, UserRepository},
        },
    },
    security::{
        crypto::{sha256_hex, EmailCrypto},
        jwt::create_access_token,
    },
    validators::{
        email_validator::validate_email,
        nickname_validator::{normalize_nickname, validate_nickname},
        password_validator::validate_password,
    },
};

pub struct AuthService;

impl AuthService {
    pub async fn register(
        state: &AppState,

        request: RegisterRequest,
    ) -> Result<MessageResponse, ApiError> {
        let email = normalize_email(&request.email);

        let nickname = request.nickname.trim().to_string();

        let nickname_normalized = normalize_nickname(&nickname);

        validate_email(&email)?;

        validate_nickname(&nickname)?;

        validate_password(&request.password)?;

        let email_hash = sha256_hex(&email);

        if UserRepository::find_by_email_hash(&state.db, &email_hash)
            .await?
            .is_some()
        {
            return Err(ApiError::Conflict("email already registered".to_string()));
        }

        if UserRepository::find_by_nickname_normalized(&state.db, &nickname_normalized)
            .await?
            .is_some()
        {
            return Err(ApiError::Conflict(
                "nickname already registered".to_string(),
            ));
        }

        let password_hash = PasswordHasher::hash(&request.password)?;

        let email_crypto = EmailCrypto::new(&state.config.email_encryption_key)?;

        let email_encrypted = email_crypto.encrypt(&email)?;

        let user = UserRepository::create(
            &state.db,
            CreateUserInput {
                email_encrypted,

                email_hash,

                nickname,

                nickname_normalized,

                password_hash,
            },
        )
        .await?;

        Self::create_and_send_verification_code(state, &user, &email).await?;

        Ok(MessageResponse {
            status: "ok",

            message: "verification code sent".to_string(),
        })
    }

    pub async fn login(state: &AppState, request: LoginRequest) -> Result<AuthResponse, ApiError> {
        let login = request.email.trim();

        if login.is_empty() {
            return Err(ApiError::BadRequest("login is required".to_string()));
        }

        let user = find_user_by_email_or_nickname(state, login)
            .await?
            .ok_or_else(|| ApiError::Unauthorized("invalid email or password".to_string()))?;

        if user.status == "pending_email_verification" {
            return Err(ApiError::Forbidden("email not verified".to_string()));
        }

        if user.status != "active" {
            return Err(ApiError::Forbidden("user is not active".to_string()));
        }

        let password_valid = PasswordHasher::verify(&request.password, &user.password_hash)?;

        if !password_valid {
            return Err(ApiError::Unauthorized(
                "invalid email or password".to_string(),
            ));
        }

        UserRepository::update_last_login(&state.db, user.id).await?;

        Self::auth_response(state, user).await
    }

    pub async fn verify_email(
        state: &AppState,

        request: VerifyEmailRequest,
    ) -> Result<AuthResponse, ApiError> {
        let email = normalize_email(&request.email);

        validate_email(&email)?;

        let email_hash = sha256_hex(&email);

        let user = UserRepository::find_by_email_hash(&state.db, &email_hash)
            .await?
            .ok_or_else(|| ApiError::NotFound("user not found".to_string()))?;

        let token = AuthRepository::find_latest_email_verification_code(&state.db, user.id)
            .await?
            .ok_or_else(|| ApiError::BadRequest("verification code not found".to_string()))?;

        if token.used_at.is_some() {
            return Err(ApiError::BadRequest(
                "verification code already used".to_string(),
            ));
        }

        if token.expires_at < Utc::now() {
            return Err(ApiError::BadRequest(
                "verification code expired".to_string(),
            ));
        }

        if token.attempts >= token.max_attempts {
            return Err(ApiError::BadRequest(
                "verification code attempts exceeded".to_string(),
            ));
        }

        let expected_hash = code_hash("email_verify", user.id, &request.code);

        if expected_hash != token.code_hash {
            AuthRepository::increment_email_verification_attempts(&state.db, token.id).await?;

            return Err(ApiError::BadRequest(
                "invalid verification code".to_string(),
            ));
        }

        AuthRepository::mark_email_verification_used(&state.db, token.id).await?;

        let activated_user = UserRepository::activate_email(&state.db, user.id).await?;

        Self::auth_response(state, activated_user).await
    }

    pub async fn resend_verification(
        state: &AppState,

        request: ResendVerificationRequest,
    ) -> Result<MessageResponse, ApiError> {
        let email = normalize_email(&request.email);

        validate_email(&email)?;

        let email_hash = sha256_hex(&email);

        let user = UserRepository::find_by_email_hash(&state.db, &email_hash)
            .await?
            .ok_or_else(|| ApiError::NotFound("user not found".to_string()))?;

        if user.status == "active" {
            return Err(ApiError::BadRequest("email already verified".to_string()));
        }

        Self::create_and_send_verification_code(state, &user, &email).await?;

        Ok(MessageResponse {
            status: "ok",

            message: "verification code sent".to_string(),
        })
    }

    pub async fn request_password_reset(
        state: &AppState,

        request: PasswordResetRequest,
    ) -> Result<MessageResponse, ApiError> {
        let email = normalize_email(&request.email);

        if validate_email(&email).is_ok() {
            let email_hash = sha256_hex(&email);

            if let Some(user) = UserRepository::find_by_email_hash(&state.db, &email_hash).await? {
                let code = generate_six_digit_code();

                let hash = code_hash("password_reset", user.id, &code);

                AuthRepository::create_password_reset_code(&state.db, user.id, &hash).await?;

                EmailService::send_password_reset_code(&state.config, &email, &code).await?;
            }
        }

        Ok(MessageResponse {
            status: "ok",

            message: "if account exists, reset code sent".to_string(),
        })
    }

    pub async fn confirm_password_reset(
        state: &AppState,

        request: PasswordResetConfirmRequest,
    ) -> Result<MessageResponse, ApiError> {
        let email = normalize_email(&request.email);

        validate_email(&email)?;

        validate_password(&request.new_password)?;

        let email_hash = sha256_hex(&email);

        let user = UserRepository::find_by_email_hash(&state.db, &email_hash)
            .await?
            .ok_or_else(|| ApiError::BadRequest("invalid reset code".to_string()))?;

        let token = AuthRepository::find_latest_password_reset_code(&state.db, user.id)
            .await?
            .ok_or_else(|| ApiError::BadRequest("invalid reset code".to_string()))?;

        if token.used_at.is_some() {
            return Err(ApiError::BadRequest("reset code already used".to_string()));
        }

        if token.expires_at < Utc::now() {
            return Err(ApiError::BadRequest("reset code expired".to_string()));
        }

        let expected_hash = code_hash("password_reset", user.id, &request.code);

        if expected_hash != token.token_hash {
            return Err(ApiError::BadRequest("invalid reset code".to_string()));
        }

        let new_password_hash = PasswordHasher::hash(&request.new_password)?;

        UserRepository::update_password(&state.db, user.id, &new_password_hash).await?;

        AuthRepository::mark_password_reset_used(&state.db, token.id).await?;

        Ok(MessageResponse {
            status: "ok",

            message: "password updated".to_string(),
        })
    }

    async fn auth_response(state: &AppState, user: UserEntity) -> Result<AuthResponse, ApiError> {
        let access_token = create_access_token(&user.id, &state.config.jwt_secret)?;

        let email_crypto = EmailCrypto::new(&state.config.email_encryption_key)?;

        let email = email_crypto.decrypt(&user.email_encrypted)?;

        Ok(AuthResponse {
            access_token,

            token_type: "Bearer",

            user: UserResponse::from_entity(&user, email),
        })
    }

    async fn create_and_send_verification_code(
        state: &AppState,

        user: &UserEntity,

        email: &str,
    ) -> Result<(), ApiError> {
        let code = generate_six_digit_code();

        let hash = code_hash("email_verify", user.id, &code);

        AuthRepository::create_email_verification_code(&state.db, user.id, &hash).await?;

        EmailService::send_verification_code(&state.config, email, &code).await?;

        Ok(())
    }
}

async fn find_user_by_email_or_nickname(
    state: &AppState,

    login: &str,
) -> Result<Option<UserEntity>, ApiError> {
    if login.contains('@') {
        let email = normalize_email(login);

        validate_email(&email)?;

        let email_hash = sha256_hex(&email);

        return Ok(UserRepository::find_by_email_hash(&state.db, &email_hash).await?);
    }

    let nickname_normalized = normalize_nickname(login);

    if nickname_normalized.len() < 3 || nickname_normalized.len() > 32 {
        return Ok(None);
    }

    Ok(UserRepository::find_by_nickname_normalized(&state.db, &nickname_normalized).await?)
}

fn normalize_email(email: &str) -> String {
    email.trim().to_lowercase()
}

fn generate_six_digit_code() -> String {
    let code = rand::thread_rng().gen_range(100000..=999999);

    code.to_string()
}

fn code_hash(scope: &str, user_id: uuid::Uuid, code: &str) -> String {
    sha256_hex(&format!("{scope}:{user_id}:{}", code.trim()))
}
