use chrono::{DateTime, Utc};

use serde::{Deserialize, Serialize};

use uuid::Uuid;

use super::error_report_entity::ErrorReportEntity;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateErrorReportRequest {
    pub launcher_version: String,

    pub os: String,

    pub java_path: Option<String>,

    pub ram_min: Option<String>,

    pub ram_max: Option<String>,

    pub last_error: Option<String>,

    pub log_tail: String,
}

#[derive(Debug, Deserialize)]
pub struct ListErrorReportsQuery {
    pub limit: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorReportCreatedResponse {
    pub status: &'static str,

    pub message: String,

    pub report_id: Uuid,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ErrorReportListItem {
    pub id: Uuid,

    pub user_id: Uuid,

    pub nickname: String,

    pub user_role: String,

    pub user_status: String,

    pub launcher_version: String,

    pub os: String,

    pub java_path: Option<String>,

    pub ram_min: Option<String>,

    pub ram_max: Option<String>,

    pub last_error: Option<String>,

    pub log_tail: String,

    pub created_at: DateTime<Utc>,
}

impl From<ErrorReportEntity> for ErrorReportListItem {
    fn from(entity: ErrorReportEntity) -> Self {
        Self {
            id: entity.id,

            user_id: entity.user_id,

            nickname: entity.nickname,

            user_role: entity.user_role,

            user_status: entity.user_status,

            launcher_version: entity.launcher_version,

            os: entity.os,

            java_path: entity.java_path,

            ram_min: entity.ram_min,

            ram_max: entity.ram_max,

            last_error: entity.last_error,

            log_tail: entity.log_tail,

            created_at: entity.created_at,
        }
    }
}
