use crate::{
    app::AppState,
    errors::ApiError,
    modules::{
        auth::{
            auth_dto::{AuthResponse, LoginRequest, RegisterRequest},
            password_hasher::PasswordHasher,
        },
        users::{
            user_dto::UserResponse,
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
    ) -> Result<AuthResponse, ApiError> {
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

        let access_token = create_access_token(&user.id, &state.config.jwt_secret)?;

        Ok(AuthResponse {
            access_token,

            token_type: "Bearer",

            user: UserResponse::from_entity(&user, email),
        })
    }

    pub async fn login(state: &AppState, request: LoginRequest) -> Result<AuthResponse, ApiError> {
        let email = normalize_email(&request.email);

        validate_email(&email)?;

        let email_hash = sha256_hex(&email);

        let user = UserRepository::find_by_email_hash(&state.db, &email_hash)
            .await?
            .ok_or_else(|| ApiError::Unauthorized("invalid email or password".to_string()))?;

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

        let access_token = create_access_token(&user.id, &state.config.jwt_secret)?;

        let email_crypto = EmailCrypto::new(&state.config.email_encryption_key)?;

        let email = email_crypto.decrypt(&user.email_encrypted)?;

        Ok(AuthResponse {
            access_token,

            token_type: "Bearer",

            user: UserResponse::from_entity(&user, email),
        })
    }
}

fn normalize_email(email: &str) -> String {
    email.trim().to_lowercase()
}
