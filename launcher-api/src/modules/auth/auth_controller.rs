use axum::{extract::State, Json};

use crate::{
    app::AppState,
    errors::ApiError,
    modules::auth::{
        auth_dto::{
            AuthResponse, LoginRequest, MessageResponse, PasswordResetConfirmRequest,
            PasswordResetRequest, RegisterRequest, ResendVerificationRequest, VerifyEmailRequest,
        },
        auth_service::AuthService,
    },
};

pub async fn register(
    State(state): State<AppState>,

    Json(request): Json<RegisterRequest>,
) -> Result<Json<MessageResponse>, ApiError> {
    let response = AuthService::register(&state, request).await?;

    Ok(Json(response))
}

pub async fn login(
    State(state): State<AppState>,

    Json(request): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, ApiError> {
    let response = AuthService::login(&state, request).await?;

    Ok(Json(response))
}

pub async fn verify_email(
    State(state): State<AppState>,

    Json(request): Json<VerifyEmailRequest>,
) -> Result<Json<AuthResponse>, ApiError> {
    let response = AuthService::verify_email(&state, request).await?;

    Ok(Json(response))
}

pub async fn resend_verification(
    State(state): State<AppState>,

    Json(request): Json<ResendVerificationRequest>,
) -> Result<Json<MessageResponse>, ApiError> {
    let response = AuthService::resend_verification(&state, request).await?;

    Ok(Json(response))
}

pub async fn request_password_reset(
    State(state): State<AppState>,

    Json(request): Json<PasswordResetRequest>,
) -> Result<Json<MessageResponse>, ApiError> {
    let response = AuthService::request_password_reset(&state, request).await?;

    Ok(Json(response))
}

pub async fn confirm_password_reset(
    State(state): State<AppState>,

    Json(request): Json<PasswordResetConfirmRequest>,
) -> Result<Json<MessageResponse>, ApiError> {
    let response = AuthService::confirm_password_reset(&state, request).await?;

    Ok(Json(response))
}
