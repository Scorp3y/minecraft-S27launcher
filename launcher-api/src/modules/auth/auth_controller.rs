use axum::{extract::State, Json};

use crate::{
    app::AppState,
    errors::ApiError,
    modules::auth::{
        auth_dto::{AuthResponse, LoginRequest, RegisterRequest},
        auth_service::AuthService,
    },
};

pub async fn register(
    State(state): State<AppState>,

    Json(request): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, ApiError> {
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
