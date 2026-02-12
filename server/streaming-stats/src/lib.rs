//! PushLog Streaming Stats Engine
//!
//! HTTP service that ingests push events and updates user_daily_stats aggregates.
//! Bind to 127.0.0.1 by default (internal only).

mod date;
mod handlers;
mod state;
mod types;

pub use handlers::{health, ingest};
pub use state::AppState;
