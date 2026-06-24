mod app;

mod config;

mod database;

mod errors;

mod modules;

mod security;

mod validators;

use app::{create_router, AppState};

use config::AppConfig;

use database::create_pool;

use tokio::net::TcpListener;

use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]

async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = AppConfig::from_env();

    let bind_address = config.bind_address();

    let db = create_pool(&config.database_url).await?;

    let app = create_router(AppState { db, config });

    let listener = TcpListener::bind(&bind_address).await?;

    tracing::info!("launcher-api listening on http://{}", bind_address);

    axum::serve(listener, app).await?;

    Ok(())
}
