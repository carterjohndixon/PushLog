//! PushLog Incident Correlation Engine — deterministic, rule-based (MVP).
//!
//! Ingests structured error/alert events, groups by fingerprint, detects
//! spikes/regressions, correlates to deploy/commit windows, and emits
//! structured IncidentSummary JSON.
//!
//! No AI, no DB, no network; pure computation + in-memory state.

pub mod config;
pub mod correlation;
pub mod engine;
pub mod error;
pub mod fingerprint;
pub mod normalize;
pub mod stats;
pub mod types;

pub use config::Config;
pub use engine::Engine;
pub use error::EngineError;
pub use types::{InboundEvent, IncidentSummary};
