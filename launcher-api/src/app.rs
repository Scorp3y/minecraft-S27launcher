use axum::{
    http::{header, HeaderValue, Method},
    routing::get,
    Json, Router,
};

use serde::Serialize;

use sqlx::PgPool;

use tower_http::cors::CorsLayer;

use crate::{
    config::AppConfig,
    modules::{auth::auth_routes, users::user_routes},
};

#[derive(Clone)]

pub struct AppState {
    pub db: PgPool,

    pub config: AppConfig,
}

#[derive(Serialize)]

struct HealthResponse {
    status: &'static str,

    service: &'static str,
}

#[derive(Serialize)]

struct DbHealthResponse {
    status: &'static str,

    database: &'static str,
}

pub fn create_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin([
            HeaderValue::from_static("http://localhost:1420"),
            HeaderValue::from_static("http://127.0.0.1:1420"),
            HeaderValue::from_static("tauri://localhost"),
            HeaderValue::from_static("https://tauri.localhost"),
        ])
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION]);

    Router::new()
        .route("/api/health", get(health))
        .route("/api/health/db", get(health_db))
        .merge(auth_routes::routes())
        .merge(user_routes::routes())
        .with_state(state)
        .layer(cors)
}

async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",

        service: "sector27-launcher-api",
    })
}

async fn health_db(
    axum::extract::State(state): axum::extract::State<AppState>,
) -> Result<Json<DbHealthResponse>, crate::errors::ApiError> {
    sqlx::query("SELECT 1").execute(&state.db).await?;

    Ok(Json(DbHealthResponse {
        status: "ok",

        database: "postgresql",
    }))
}
