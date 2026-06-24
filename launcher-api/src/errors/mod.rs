use axum::{http::StatusCode, response::IntoResponse, Json};

use serde::Serialize;

#[derive(Debug)]

pub enum ApiError {
    BadRequest(String),

    Unauthorized(String),

    Forbidden(String),

    NotFound(String),

    Conflict(String),

    Internal(String),
}

#[derive(Serialize)]

struct ErrorResponse {
    error: String,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> axum::response::Response {
        let (status, message) = match self {
            ApiError::BadRequest(message) => (StatusCode::BAD_REQUEST, message),

            ApiError::Unauthorized(message) => (StatusCode::UNAUTHORIZED, message),

            ApiError::Forbidden(message) => (StatusCode::FORBIDDEN, message),

            ApiError::NotFound(message) => (StatusCode::NOT_FOUND, message),

            ApiError::Conflict(message) => (StatusCode::CONFLICT, message),

            ApiError::Internal(message) => (StatusCode::INTERNAL_SERVER_ERROR, message),
        };

        (status, Json(ErrorResponse { error: message })).into_response()
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(error: sqlx::Error) -> Self {
        tracing::error!("database error: {error}");

        ApiError::Internal("database error".to_string())
    }
}
