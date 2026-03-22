//! Application state shared across handlers.

use sqlx_postgres::PgPool;

pub struct AppState {
  pub pool: PgPool,
}
