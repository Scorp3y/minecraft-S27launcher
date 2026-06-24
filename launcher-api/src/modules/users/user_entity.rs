use chrono::{DateTime, Utc};

use sqlx::FromRow;

use uuid::Uuid;

#[derive(Debug, Clone, FromRow)]

pub struct UserEntity {
    pub id: Uuid,

    pub email_encrypted: String,

    pub email_hash: String,

    pub nickname: String,

    pub nickname_normalized: String,

    pub password_hash: String,

    pub role: String,

    pub status: String,

    pub registered_at: DateTime<Utc>,

    pub email_verified_at: Option<DateTime<Utc>>,

    pub last_login_at: Option<DateTime<Utc>>,

    pub created_at: DateTime<Utc>,

    pub updated_at: DateTime<Utc>,
}
