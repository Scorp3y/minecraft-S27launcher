use argon2::{
    password_hash::{PasswordHash, PasswordHasher as _, PasswordVerifier, SaltString},
    Argon2,
};

use rand::rngs::OsRng;

use crate::errors::ApiError;

pub struct PasswordHasher;

impl PasswordHasher {
    pub fn hash(password: &str) -> Result<String, ApiError> {
        let salt = SaltString::generate(&mut OsRng);

        Argon2::default()
            .hash_password(password.as_bytes(), &salt)
            .map(|hash| hash.to_string())
            .map_err(|error| {
                tracing::error!("password hash error: {error}");

                ApiError::Internal("failed to hash password".to_string())
            })
    }

    pub fn verify(password: &str, password_hash: &str) -> Result<bool, ApiError> {
        let parsed_hash = PasswordHash::new(password_hash)
            .map_err(|_| ApiError::Unauthorized("invalid email or password".to_string()))?;

        Ok(Argon2::default()
            .verify_password(password.as_bytes(), &parsed_hash)
            .is_ok())
    }
}
