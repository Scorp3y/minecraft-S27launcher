use std::env;

#[derive(Clone, Debug)]

pub struct AppConfig {
    pub database_url: String,

    pub app_host: String,

    pub app_port: u16,

    pub jwt_secret: String,

    pub refresh_token_secret: String,

    pub email_encryption_key: String,
}

impl AppConfig {
    pub fn from_env() -> Self {
        let database_url = env::var("DATABASE_URL").expect("DATABASE_URL is not set");

        let app_host = env::var("APP_HOST").unwrap_or_else(|_| "127.0.0.1".to_string());

        let app_port = env::var("APP_PORT")
            .unwrap_or_else(|_| "3000".to_string())
            .parse::<u16>()
            .expect("APP_PORT must be a valid port number");

        let jwt_secret = env::var("JWT_SECRET").expect("JWT_SECRET is not set");

        let refresh_token_secret =
            env::var("REFRESH_TOKEN_SECRET").expect("REFRESH_TOKEN_SECRET is not set");

        let email_encryption_key =
            env::var("EMAIL_ENCRYPTION_KEY").expect("EMAIL_ENCRYPTION_KEY is not set");

        Self {
            database_url,

            app_host,

            app_port,

            jwt_secret,

            refresh_token_secret,

            email_encryption_key,
        }
    }

    pub fn bind_address(&self) -> String {
        format!("{}:{}", self.app_host, self.app_port)
    }
}
