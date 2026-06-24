use chrono::{Duration, Utc};

use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};

use serde::{Deserialize, Serialize};

use uuid::Uuid;

use crate::errors::ApiError;

#[derive(Debug, Clone, Serialize, Deserialize)]

pub struct Claims {
    pub sub: String,

    pub exp: usize,

    pub token_type: String,
}

pub fn create_access_token(user_id: &Uuid, jwt_secret: &str) -> Result<String, ApiError> {
    let expires_at = Utc::now() + Duration::minutes(30);

    let claims = Claims {
        sub: user_id.to_string(),

        exp: expires_at.timestamp() as usize,

        token_type: "access".to_string(),
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(jwt_secret.as_bytes()),
    )
    .map_err(|error| {
        tracing::error!("jwt create error: {error}");

        ApiError::Internal("failed to create access token".to_string())
    })
}

pub fn validate_access_token(token: &str, jwt_secret: &str) -> Result<Uuid, ApiError> {
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| ApiError::Unauthorized("invalid access token".to_string()))?;

    if token_data.claims.token_type != "access" {
        return Err(ApiError::Unauthorized("invalid token type".to_string()));
    }

    Uuid::parse_str(&token_data.claims.sub)
        .map_err(|_| ApiError::Unauthorized("invalid token subject".to_string()))
}
