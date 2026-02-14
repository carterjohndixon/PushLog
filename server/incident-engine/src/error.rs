//! Structured error types for the incident engine.

use thiserror::Error;

#[derive(Debug, Error)]
pub enum EngineError {
  #[error("validation: {field}: {reason}")]
  Validation { field: String, reason: String },

  #[error("parse: {0}")]
  Parse(String),

  #[error("json: {0}")]
  Json(#[from] serde_json::Error),
}

impl EngineError {
  pub fn validation(field: &str, reason: &str) -> Self {
    Self::Validation {
      field: field.to_string(),
      reason: reason.to_string(),
    }
  }

  pub fn parse(msg: impl Into<String>) -> Self {
    Self::Parse(msg.into())
  }
}
