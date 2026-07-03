use axum::http::{header::AUTHORIZATION, HeaderMap};

use uuid::Uuid;

use crate::{
    app::AppState,
    errors::ApiError,
    modules::{
        error_reports::{
            error_report_dto::{
                CreateErrorReportRequest, ErrorReportCreatedResponse, ErrorReportListItem,
                ListErrorReportsQuery,
            },
            error_report_repository::{CreateErrorReportInput, ErrorReportRepository},
        },
        users::{user_entity::UserEntity, user_repository::UserRepository},
    },
    security::jwt::validate_access_token,
};

const MAX_LOG_TAIL_CHARS: usize = 120_000;
const MAX_LAST_ERROR_CHARS: usize = 16_000;
const MAX_SHORT_FIELD_CHARS: usize = 512;

pub struct ErrorReportService;

impl ErrorReportService {
    pub async fn create(
        state: &AppState,

        headers: &HeaderMap,

        request: CreateErrorReportRequest,
    ) -> Result<ErrorReportCreatedResponse, ApiError> {
        let user = authenticated_user(state, headers).await?;

        if user.status != "active" {
            return Err(ApiError::Forbidden("user is not active".to_string()));
        }

        let log_tail = normalize_required_text(
            request.log_tail,
            "logTail is required",
            MAX_LOG_TAIL_CHARS,
        )?;

        let launcher_version = normalize_optional_text(
            Some(request.launcher_version),
            MAX_SHORT_FIELD_CHARS,
        )
        .unwrap_or_else(|| "unknown".to_string());

        let os = normalize_optional_text(Some(request.os), MAX_SHORT_FIELD_CHARS)
            .unwrap_or_else(|| "unknown".to_string());

        let input = CreateErrorReportInput {
            id: Uuid::new_v4(),

            user_id: user.id,

            nickname: user.nickname,

            user_role: user.role,

            user_status: user.status,

            launcher_version,

            os,

            java_path: normalize_optional_text(request.java_path, MAX_SHORT_FIELD_CHARS),

            ram_min: normalize_optional_text(request.ram_min, MAX_SHORT_FIELD_CHARS),

            ram_max: normalize_optional_text(request.ram_max, MAX_SHORT_FIELD_CHARS),

            last_error: normalize_optional_text(request.last_error, MAX_LAST_ERROR_CHARS),

            log_tail,
        };

        let created = ErrorReportRepository::create(&state.db, input).await?;

        Ok(ErrorReportCreatedResponse {
            status: "ok",

            message: "error report saved".to_string(),

            report_id: created.id,
        })
    }

    pub async fn list_admin(
        state: &AppState,

        headers: &HeaderMap,

        query: ListErrorReportsQuery,
    ) -> Result<Vec<ErrorReportListItem>, ApiError> {
        let user = authenticated_user(state, headers).await?;

        if user.role != "admin" {
            return Err(ApiError::Forbidden("admin role required".to_string()));
        }

        let limit = query.limit.unwrap_or(50).clamp(1, 200);

        let reports = ErrorReportRepository::list_latest(&state.db, limit).await?;

        Ok(reports.into_iter().map(ErrorReportListItem::from).collect())
    }
}

async fn authenticated_user(state: &AppState, headers: &HeaderMap) -> Result<UserEntity, ApiError> {
    let token = extract_bearer_token(headers)?;

    let user_id = validate_access_token(token, &state.config.jwt_secret)?;

    UserRepository::find_by_id(&state.db, user_id)
        .await?
        .ok_or_else(|| ApiError::NotFound("user not found".to_string()))
}

fn extract_bearer_token(headers: &HeaderMap) -> Result<&str, ApiError> {
    let header = headers
        .get(AUTHORIZATION)
        .ok_or_else(|| ApiError::Unauthorized("missing authorization header".to_string()))?
        .to_str()
        .map_err(|_| ApiError::Unauthorized("invalid authorization header".to_string()))?;

    header
        .strip_prefix("Bearer ")
        .ok_or_else(|| ApiError::Unauthorized("invalid authorization scheme".to_string()))
}

fn normalize_required_text(
    value: String,

    empty_error: &str,

    max_chars: usize,
) -> Result<String, ApiError> {
    let value = value.trim().to_string();

    if value.is_empty() {
        return Err(ApiError::BadRequest(empty_error.to_string()));
    }

    Ok(truncate_chars(value, max_chars))
}

fn normalize_optional_text(value: Option<String>, max_chars: usize) -> Option<String> {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .map(|item| truncate_chars(item, max_chars))
}

fn truncate_chars(value: String, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value;
    }

    value.chars().take(max_chars).collect()
}
