use chrono::{DateTime, Utc};

use sqlx::FromRow;

use uuid::Uuid;

#[derive(Debug, Clone, FromRow)]
pub struct ErrorReportEntity {
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
