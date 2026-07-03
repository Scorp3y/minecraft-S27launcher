use axum::{
    routing::{get, post},
    Router,
};

use crate::{app::AppState, modules::error_reports::error_report_controller};

pub fn routes() -> Router<AppState> {
    Router::new()
        .route(
            "/api/launcher/error-reports",
            post(error_report_controller::create_error_report),
        )
        .route(
            "/api/admin/error-reports",
            get(error_report_controller::list_error_reports),
        )
}
