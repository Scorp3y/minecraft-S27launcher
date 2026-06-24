use axum::http::{header::AUTHORIZATION, HeaderMap};

use crate::{
    app::AppState,
    errors::ApiError,
    modules::users::{user_dto::UserResponse, user_repository::UserRepository},
    security::{crypto::EmailCrypto, jwt::validate_access_token},
};

pub struct UserService;

impl UserService {
    pub async fn me(state: &AppState, headers: &HeaderMap) -> Result<UserResponse, ApiError> {
        let token = extract_bearer_token(headers)?;

        let user_id = validate_access_token(token, &state.config.jwt_secret)?;

        let user = UserRepository::find_by_id(&state.db, user_id)
            .await?
            .ok_or_else(|| ApiError::NotFound("user not found".to_string()))?;

        let email_crypto = EmailCrypto::new(&state.config.email_encryption_key)?;

        let email = email_crypto.decrypt(&user.email_encrypted)?;

        Ok(UserResponse::from_entity(&user, email))
    }
}

fn extract_bearer_token(headers: &HeaderMap) -> Result<&str, ApiError> {
    let header = headers
        .get(AUTHORIZATION)
        .ok_or_else(|| ApiError::Unauthorized("missing authorization header".to_string()))?
        .to_str()
        .map_err(|_| ApiError::Unauthorized("invalid authorization header".to_string()))?;

    header
        .strip_prefix("Bearer ")
        .ok_or_else(|| ApiError::Unauthorized("invalid authorization scheme".to_string()))
}
