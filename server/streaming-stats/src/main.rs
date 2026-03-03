//! Binary entrypoint for the streaming stats engine.

use axum::{routing::get, routing::post, Router};
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::CorsLayer;

use sqlx::postgres::{PgConnectOptions, PgPoolOptions, PgSslMode};
use streaming_stats::AppState;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
  let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
  let port: u16 = std::env::var("PORT")
    .unwrap_or_else(|_| "5004".into())
    .parse()
    .expect("PORT must be a valid u16");

  // When connecting to Supabase (or DATABASE_SSL_CA_PATH set), use SSL.
  // If DATABASE_SSL_CA_PATH is set, use that cert to verify; otherwise SSL is used with default verification
  // (which can fail with "self-signed certificate" — then set DATABASE_SSL_CA_PATH to the Supabase cert path).
  let use_ssl = database_url.contains("supabase")
    || std::env::var("DATABASE_SSL_CA_PATH").is_ok();
  let ssl_ca_path = std::env::var("DATABASE_SSL_CA_PATH").ok();

  let mut opts: PgConnectOptions = database_url.parse()?;
  if use_ssl {
    opts = opts.ssl_mode(PgSslMode::Require);
    if let Some(ref path) = ssl_ca_path {
      opts = opts.ssl_root_cert(path.as_str());
    }
  }
  let pool = PgPoolOptions::new()
    .connect_with(opts)
    .await?;
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
