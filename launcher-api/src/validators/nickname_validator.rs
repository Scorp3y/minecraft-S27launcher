use crate::errors::ApiError;

pub fn normalize_nickname(nickname: &str) -> String {
    nickname.trim().to_lowercase()
}

pub fn validate_nickname(nickname: &str) -> Result<(), ApiError> {
    let nickname = nickname.trim();

    if nickname.len() < 3 || nickname.len() > 32 {
        return Err(ApiError::BadRequest(
            "nickname must be 3-32 characters".to_string(),
        ));
    }

    let valid = nickname
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');

    if !valid {
        return Err(ApiError::BadRequest(
            "nickname can contain only latin letters, numbers, _ and -".to_string(),
        ));
    }

    Ok(())
}
