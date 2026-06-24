use crate::errors::ApiError;

pub fn validate_password(password: &str) -> Result<(), ApiError> {
    if password.len() < 8 || password.len() > 128 {
        return Err(ApiError::BadRequest(
            "password must be 8-128 characters".to_string(),
        ));
    }

    if !password.chars().any(|c| c.is_ascii_lowercase()) {
        return Err(ApiError::BadRequest(
            "password must contain lowercase letter".to_string(),
        ));
    }

    if !password.chars().any(|c| c.is_ascii_uppercase()) {
        return Err(ApiError::BadRequest(
            "password must contain uppercase letter".to_string(),
        ));
    }

    if !password.chars().any(|c| c.is_ascii_digit()) {
        return Err(ApiError::BadRequest(
            "password must contain digit".to_string(),
        ));
    }

    Ok(())
}
