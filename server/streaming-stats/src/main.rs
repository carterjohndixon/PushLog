//! Binary entrypoint for the streaming stats engine.

use axum::{routing::get, routing::post, Router};
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::CorsLayer;

use streaming_stats::AppState;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
  let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
  let port: u16 = std::env::var("PORT")
    .unwrap_or_else(|_| "5004".into())
    .parse()
    .expect("PORT must be a valid u16");

  let pool = sqlx::PgPool::connect(&database_url).await?;
  let state = Arc::new(AppState { pool });

  let app = Router::new()
    .route("/health", get(streaming_stats::health))
    .route("/ingest", post(streaming_stats::ingest))
    .layer(CorsLayer::permissive())
    .with_state(state);

  let addr = SocketAddr::from(([127, 0, 0, 1], port));
  println!("streaming-stats listening on http://{}", addr);

  let listener = tokio::net::TcpListener::bind(addr).await?;
  axum::serve(listener, app).await?;

  Ok(())
}
