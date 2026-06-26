use chrono::{DateTime, Utc};

use sqlx::{FromRow, PgPool};

use uuid::Uuid;

#[derive(Debug, Clone, FromRow)]

pub struct EmailVerificationTokenEntity {
    pub id: Uuid,

    pub user_id: Uuid,

    pub code_hash: String,

    pub attempts: i32,

    pub max_attempts: i32,

    pub expires_at: DateTime<Utc>,

    pub used_at: Option<DateTime<Utc>>,

    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, FromRow)]

pub struct PasswordResetTokenEntity {
    pub id: Uuid,

    pub user_id: Uuid,

    pub token_hash: String,

    pub expires_at: DateTime<Utc>,

    pub used_at: Option<DateTime<Utc>>,

    pub created_at: DateTime<Utc>,
}

pub struct AuthRepository;

impl AuthRepository {
    pub async fn create_email_verification_code(
        pool: &PgPool,

        user_id: Uuid,

        code_hash: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"

            INSERT INTO email_verification_tokens (

                user_id,

                code_hash,

                expires_at

            )

            VALUES ($1, $2, NOW() + INTERVAL '15 minutes')

            "#,
        )
        .bind(user_id)
        .bind(code_hash)
        .execute(pool)
        .await?;

        Ok(())
    }

    pub async fn find_latest_email_verification_code(
        pool: &PgPool,

        user_id: Uuid,
    ) -> Result<Option<EmailVerificationTokenEntity>, sqlx::Error> {
        sqlx::query_as::<_, EmailVerificationTokenEntity>(
            r#"

            SELECT

                id,

                user_id,

                code_hash,

                attempts,

                max_attempts,

                expires_at,

                used_at,

                created_at

            FROM email_verification_tokens

            WHERE user_id = $1

            ORDER BY created_at DESC

            LIMIT 1

            "#,
        )
        .bind(user_id)
        .fetch_optional(pool)
        .await
    }

    pub async fn increment_email_verification_attempts(
        pool: &PgPool,

        token_id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE email_verification_tokens SET attempts = attempts + 1 WHERE id = $1")
            .bind(token_id)
            .execute(pool)
            .await?;

        Ok(())
    }

    pub async fn mark_email_verification_used(
        pool: &PgPool,

        token_id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE email_verification_tokens SET used_at = NOW() WHERE id = $1")
            .bind(token_id)
            .execute(pool)
            .await?;

        Ok(())
    }

    pub async fn create_password_reset_code(
        pool: &PgPool,

        user_id: Uuid,

        token_hash: &str,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"

            INSERT INTO password_reset_tokens (

                user_id,

                token_hash,

                expires_at

            )

            VALUES ($1, $2, NOW() + INTERVAL '15 minutes')

            "#,
        )
        .bind(user_id)
        .bind(token_hash)
        .execute(pool)
        .await?;

        Ok(())
    }

    pub async fn find_latest_password_reset_code(
        pool: &PgPool,

        user_id: Uuid,
    ) -> Result<Option<PasswordResetTokenEntity>, sqlx::Error> {
        sqlx::query_as::<_, PasswordResetTokenEntity>(
            r#"

            SELECT

                id,

                user_id,

                token_hash,

                expires_at,

                used_at,

                created_at

            FROM password_reset_tokens

            WHERE user_id = $1

            ORDER BY created_at DESC

            LIMIT 1

            "#,
        )
        .bind(user_id)
        .fetch_optional(pool)
        .await
    }

    pub async fn mark_password_reset_used(
        pool: &PgPool,

        token_id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1")
            .bind(token_id)
            .execute(pool)
            .await?;

        Ok(())
    }
}
