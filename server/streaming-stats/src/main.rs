//! Binary entrypoint for the streaming stats engine.

use axum::{routing::get, routing::post, Router};
use std::net::SocketAddr;
use std::sync::Arc;
use tower_http::cors::CorsLayer;

use sqlx::postgres::{PgConnectOptions, PgPoolOptions, PgSslMode};
use streaming_stats::AppState;

const SUPABASE_SSL_HINT: &str = "\n\nFor Supabase: download the DB certificate from Project Settings → Database, save it on the server (e.g. /var/www/pushlog/config/supabase-db.crt), and set DATABASE_SSL_CA_PATH to that path in .env.production.";

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
  let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
  let port: u16 = std::env::var("PORT")
    .unwrap_or_else(|_| "5004".into())
    .parse()
    .expect("PORT must be a valid u16");

  // When connecting to Supabase (or DATABASE_SSL_CA_PATH set), use SSL.
  // If DATABASE_SSL_CA_PATH is set, use that cert to verify; otherwise SSL uses default verification,
  // which fails with Supabase's cert — set DATABASE_SSL_CA_PATH to the Supabase DB cert path.
  let use_ssl = database_url.contains("supabase")
    || std::env::var("DATABASE_SSL_CA_PATH").is_ok();
  let ssl_ca_path = std::env::var("DATABASE_SSL_CA_PATH").ok();

  if database_url.contains("supabase") && ssl_ca_path.is_none() {
    eprintln!(
      "streaming-stats: DATABASE_SSL_CA_PATH is not set. Supabase SSL will likely fail.{}",
      SUPABASE_SSL_HINT
    );
  }

  let mut opts: PgConnectOptions = database_url.parse()?;
  if use_ssl {
    opts = opts.ssl_mode(PgSslMode::Require);
    if let Some(ref path) = ssl_ca_path {
      opts = opts.ssl_root_cert(path.as_str());
    }
  }

  let pool = match PgPoolOptions::new().connect_with(opts).await {
    Ok(p) => p,
    Err(e) => {
      let msg = e.to_string();
      let hint = if msg.contains("certificate") || msg.contains("self-signed") || msg.contains("verify") {
        SUPABASE_SSL_HINT
      } else {
        ""
      };
      eprintln!("streaming-stats: database connection failed: {}{}", msg, hint);
      return Err(e.into());
    }
  };

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
