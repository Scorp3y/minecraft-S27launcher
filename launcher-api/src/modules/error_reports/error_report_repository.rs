use sqlx::PgPool;

use uuid::Uuid;

use super::error_report_entity::ErrorReportEntity;

pub struct CreateErrorReportInput {
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
}

pub struct ErrorReportRepository;

impl ErrorReportRepository {
    fn select_sql() -> &'static str {
        r#"
        SELECT
            id,
            user_id,
            nickname,
            user_role,
            user_status,
            launcher_version,
            os,
            java_path,
            ram_min,
            ram_max,
            last_error,
            log_tail,
            created_at
        FROM launcher_error_reports
        "#
    }

    pub async fn create(
        pool: &PgPool,

        input: CreateErrorReportInput,
    ) -> Result<ErrorReportEntity, sqlx::Error> {
        sqlx::query_as::<_, ErrorReportEntity>(
            r#"
            INSERT INTO launcher_error_reports (
                id,
                user_id,
                nickname,
                user_role,
                user_status,
                launcher_version,
                os,
                java_path,
                ram_min,
                ram_max,
                last_error,
                log_tail
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            RETURNING
                id,
                user_id,
                nickname,
                user_role,
                user_status,
                launcher_version,
                os,
                java_path,
                ram_min,
                ram_max,
                last_error,
                log_tail,
                created_at
            "#,
        )
        .bind(input.id)
        .bind(input.user_id)
        .bind(input.nickname)
        .bind(input.user_role)
        .bind(input.user_status)
        .bind(input.launcher_version)
        .bind(input.os)
        .bind(input.java_path)
        .bind(input.ram_min)
        .bind(input.ram_max)
        .bind(input.last_error)
        .bind(input.log_tail)
        .fetch_one(pool)
        .await
    }

    pub async fn list_latest(
        pool: &PgPool,

        limit: i64,
    ) -> Result<Vec<ErrorReportEntity>, sqlx::Error> {
        let sql = format!("{} ORDER BY created_at DESC LIMIT $1", Self::select_sql());

        sqlx::query_as::<_, ErrorReportEntity>(&sql)
            .bind(limit)
            .fetch_all(pool)
            .await
    }
}
