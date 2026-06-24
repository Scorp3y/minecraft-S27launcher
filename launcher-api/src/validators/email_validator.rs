use crate::errors::ApiError;

pub fn validate_email(email: &str) -> Result<(), ApiError> {
    let email = email.trim();

    if email.len() < 5 || email.len() > 254 {
        return Err(ApiError::BadRequest("invalid email length".to_string()));
    }

    if !email.contains('@') || !email.contains('.') {
        return Err(ApiError::BadRequest("invalid email format".to_string()));
    }

    Ok(())
}
