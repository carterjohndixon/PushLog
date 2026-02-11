//! Input/output types for the risk engine (JSON contract with Node).

use serde::{Deserialize, Serialize};

/// Input: one JSON object from Node (matches webhook pushData).
#[derive(Debug, Deserialize)]
pub struct Input {
  pub commit_message: String,
  pub files_changed: Vec<String>,
  pub additions: u32,
  pub deletions: u32,
  #[serde(default)]
  #[allow(dead_code)] // reserved for future diff-based rules
  pub diff_text: Option<String>,
}

/// Output: one JSON object to stdout for Node to parse.
#[derive(Debug, Serialize)]
pub struct Output {
  pub impact_score: u8,
  pub risk_flags: Vec<String>,
  pub change_type_tags: Vec<String>,
  pub hotspot_files: Vec<String>,
  pub explanations: Vec<String>,
}
