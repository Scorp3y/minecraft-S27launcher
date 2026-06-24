use sqlx::{postgres::PgPoolOptions, PgPool};

pub async fn create_pool(database_url: &str) -> anyhow::Result<PgPool> {
    let pool = PgPoolOptions::new()
        .max_connections(3)
        .connect(database_url)
        .await?;

    sqlx::query("SELECT 1").execute(&pool).await?;

    Ok(pool)
}
