use axum::{routing::get, Router};

use crate::{app::AppState, modules::users::user_controller};

pub fn routes() -> Router<AppState> {
    Router::new().route("/api/users/me", get(user_controller::me))
}
