use axum::{extract::State, http::HeaderMap, Json};

use crate::{
    app::AppState,
    errors::ApiError,
    modules::users::{user_dto::UserResponse, user_service::UserService},
};

pub async fn me(
    State(state): State<AppState>,

    headers: HeaderMap,
) -> Result<Json<UserResponse>, ApiError> {
    let response = UserService::me(&state, &headers).await?;

    Ok(Json(response))
}
