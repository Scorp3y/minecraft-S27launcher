use axum::{routing::get, Json, Router};

use serde::Serialize;

use sqlx::PgPool;

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
    Router::new()
        .route("/api/health", get(health))
        .route("/api/health/db", get(health_db))
        .merge(auth_routes::routes())
        .merge(user_routes::routes())
        .with_state(state)
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
