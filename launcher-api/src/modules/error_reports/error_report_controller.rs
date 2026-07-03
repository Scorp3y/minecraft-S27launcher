use axum::{
    extract::{Query, State},
    http::HeaderMap,
    Json,
};

use crate::{
    app::AppState,
    errors::ApiError,
    modules::error_reports::{
        error_report_dto::{
            CreateErrorReportRequest, ErrorReportCreatedResponse, ErrorReportListItem,
            ListErrorReportsQuery,
        },
        error_report_service::ErrorReportService,
    },
};

pub async fn create_error_report(
    State(state): State<AppState>,

    headers: HeaderMap,

    Json(request): Json<CreateErrorReportRequest>,
) -> Result<Json<ErrorReportCreatedResponse>, ApiError> {
    let response = ErrorReportService::create(&state, &headers, request).await?;

    Ok(Json(response))
}

pub async fn list_error_reports(
    State(state): State<AppState>,

    headers: HeaderMap,

    Query(query): Query<ListErrorReportsQuery>,
) -> Result<Json<Vec<ErrorReportListItem>>, ApiError> {
    let response = ErrorReportService::list_admin(&state, &headers, query).await?;

    Ok(Json(response))
}
