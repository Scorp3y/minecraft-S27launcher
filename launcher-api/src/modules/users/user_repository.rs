use sqlx::PgPool;

use uuid::Uuid;

use super::user_entity::UserEntity;

pub struct CreateUserInput {
    pub email_encrypted: String,

    pub email_hash: String,

    pub nickname: String,

    pub nickname_normalized: String,

    pub password_hash: String,
}

pub struct UserRepository;

impl UserRepository {
    fn select_sql() -> &'static str {
        r#"

        SELECT

            id,

            email_encrypted,

            email_hash,

            nickname,

            nickname_normalized,

            password_hash,

            role::text AS role,

            status::text AS status,

            registered_at,

            email_verified_at,

            last_login_at,

            created_at,

            updated_at

        FROM users

        "#
    }

    pub async fn create(pool: &PgPool, input: CreateUserInput) -> Result<UserEntity, sqlx::Error> {
        let sql = format!(
            r#"

            INSERT INTO users (

                email_encrypted,

                email_hash,

                nickname,

                nickname_normalized,

                password_hash,

                status,

                email_verified_at

            )

            VALUES ($1, $2, $3, $4, $5, 'active', NOW())

            RETURNING

                id,

                email_encrypted,

                email_hash,

                nickname,

                nickname_normalized,

                password_hash,

                role::text AS role,

                status::text AS status,

                registered_at,

                email_verified_at,

                last_login_at,

                created_at,

                updated_at

            "#
        );

        sqlx::query_as::<_, UserEntity>(&sql)
            .bind(input.email_encrypted)
            .bind(input.email_hash)
            .bind(input.nickname)
            .bind(input.nickname_normalized)
            .bind(input.password_hash)
            .fetch_one(pool)
            .await
    }

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<UserEntity>, sqlx::Error> {
        let sql = format!("{} WHERE id = $1 LIMIT 1", Self::select_sql());

        sqlx::query_as::<_, UserEntity>(&sql)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    pub async fn find_by_email_hash(
        pool: &PgPool,

        email_hash: &str,
    ) -> Result<Option<UserEntity>, sqlx::Error> {
        let sql = format!("{} WHERE email_hash = $1 LIMIT 1", Self::select_sql());

        sqlx::query_as::<_, UserEntity>(&sql)
            .bind(email_hash)
            .fetch_optional(pool)
            .await
    }

    pub async fn find_by_nickname_normalized(
        pool: &PgPool,

        nickname_normalized: &str,
    ) -> Result<Option<UserEntity>, sqlx::Error> {
        let sql = format!(
            "{} WHERE nickname_normalized = $1 LIMIT 1",
            Self::select_sql()
        );

        sqlx::query_as::<_, UserEntity>(&sql)
            .bind(nickname_normalized)
            .fetch_optional(pool)
            .await
    }

    pub async fn update_last_login(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE users SET last_login_at = NOW() WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;

        Ok(())
    }
}
