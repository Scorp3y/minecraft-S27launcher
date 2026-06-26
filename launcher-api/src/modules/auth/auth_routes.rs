use axum::{routing::post, Router};

use crate::{app::AppState, modules::auth::auth_controller};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("/api/auth/register", post(auth_controller::register))
        .route("/api/auth/login", post(auth_controller::login))
        .route(
            "/api/auth/verify-email",
            post(auth_controller::verify_email),
        )
        .route(
            "/api/auth/verify-email/resend",
            post(auth_controller::resend_verification),
        )
        .route(
            "/api/auth/password-reset/request",
            post(auth_controller::request_password_reset),
        )
        .route(
            "/api/auth/password-reset/confirm",
            post(auth_controller::confirm_password_reset),
        )
}
