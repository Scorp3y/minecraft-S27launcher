use chrono::{DateTime, Utc};

use serde::Serialize;

use uuid::Uuid;

use super::user_entity::UserEntity;

#[derive(Debug, Serialize)]

pub struct UserResponse {
    pub id: Uuid,

    pub email: String,

    pub nickname: String,

    pub role: String,

    pub status: String,

    pub registered_at: DateTime<Utc>,

    pub email_verified_at: Option<DateTime<Utc>>,

    pub last_login_at: Option<DateTime<Utc>>,
}

impl UserResponse {
    pub fn from_entity(user: &UserEntity, email: String) -> Self {
        Self {
            id: user.id,

            email,

            nickname: user.nickname.clone(),

            role: user.role.clone(),

            status: user.status.clone(),

            registered_at: user.registered_at,

            email_verified_at: user.email_verified_at,

            last_login_at: user.last_login_at,
        }
    }
}
