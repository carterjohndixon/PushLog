//! Application state shared across handlers.

use sqlx::PgPool;

pub struct AppState {
  pub pool: PgPool,
}
