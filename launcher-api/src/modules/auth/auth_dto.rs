use serde::{Deserialize, Serialize};

use crate::modules::users::user_dto::UserResponse;

#[derive(Debug, Deserialize)]

pub struct RegisterRequest {
    pub email: String,

    pub nickname: String,

    pub password: String,
}

#[derive(Debug, Deserialize)]

pub struct LoginRequest {
    pub email: String,

    pub password: String,
}

#[derive(Debug, Deserialize)]

pub struct VerifyEmailRequest {
    pub email: String,

    pub code: String,
}

#[derive(Debug, Deserialize)]

pub struct ResendVerificationRequest {
    pub email: String,
}

#[derive(Debug, Deserialize)]

pub struct PasswordResetRequest {
    pub email: String,
}

#[derive(Debug, Deserialize)]

pub struct PasswordResetConfirmRequest {
    pub email: String,

    pub code: String,

    pub new_password: String,
}

#[derive(Debug, Serialize)]

pub struct AuthResponse {
    pub access_token: String,

    pub token_type: &'static str,

    pub user: UserResponse,
}

#[derive(Debug, Serialize)]

pub struct MessageResponse {
    pub status: &'static str,

    pub message: String,
}
