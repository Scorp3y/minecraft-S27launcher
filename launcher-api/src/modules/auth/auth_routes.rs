use axum::{routing::post, Router};

use crate::{app::AppState, modules::auth::auth_controller};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/auth/register", post(auth_controller::register))
        .route("/api/auth/login", post(auth_controller::login))
}
