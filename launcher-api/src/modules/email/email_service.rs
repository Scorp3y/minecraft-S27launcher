use lettre::{
    message::Mailbox, transport::smtp::authentication::Credentials, AsyncSmtpTransport,
    AsyncTransport, Message, Tokio1Executor,
};

use crate::{config::AppConfig, errors::ApiError};

pub struct EmailService;

impl EmailService {
    pub async fn send_verification_code(
        config: &AppConfig,

        to_email: &str,

        code: &str,
    ) -> Result<(), ApiError> {
        let subject = "SECTOR 27 Launcher — подтверждение почты";

        let body = format!(

            "Ваш код подтверждения SECTOR 27 Launcher: {code}\n\nКод действует 15 минут.\nЕсли вы не создавали аккаунт, просто игнорируйте это письмо."

        );

        Self::send_text_email(config, to_email, subject, &body).await
    }

    pub async fn send_password_reset_code(
        config: &AppConfig,

        to_email: &str,

        code: &str,
    ) -> Result<(), ApiError> {
        let subject = "SECTOR 27 Launcher — восстановление пароля";

        let body = format!(

            "Ваш код восстановления пароля SECTOR 27 Launcher: {code}\n\nКод действует 15 минут.\nЕсли вы не запрашивали восстановление, просто игнорируйте это письмо."

        );

        Self::send_text_email(config, to_email, subject, &body).await
    }

    async fn send_text_email(
        config: &AppConfig,

        to_email: &str,

        subject: &str,

        body: &str,
    ) -> Result<(), ApiError> {
        let from: Mailbox = config.smtp_from.parse().map_err(|error| {
            tracing::error!("invalid SMTP_FROM: {error}");

            ApiError::Internal("invalid smtp from".to_string())
        })?;

        let to: Mailbox = to_email
            .parse()
            .map_err(|_| ApiError::BadRequest("invalid recipient email".to_string()))?;

        let email = Message::builder()
            .from(from)
            .to(to)
            .subject(subject)
            .body(body.to_string())
            .map_err(|error| {
                tracing::error!("email build error: {error}");

                ApiError::Internal("failed to build email".to_string())
            })?;

        let credentials =
            Credentials::new(config.smtp_username.clone(), config.smtp_password.clone());

        let mailer = AsyncSmtpTransport::<Tokio1Executor>::relay(&config.smtp_host)
            .map_err(|error| {
                tracing::error!("smtp relay error: {error}");

                ApiError::Internal("failed to create smtp relay".to_string())
            })?
            .port(config.smtp_port)
            .credentials(credentials)
            .build();

        mailer.send(email).await.map_err(|error| {
            tracing::error!("email send error: {error}");

            ApiError::Internal("failed to send email".to_string())
        })?;

        Ok(())
    }
}
