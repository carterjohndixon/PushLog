//! Core types for the incident engine (JSON contracts + internal models).

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Inbound types (JSON contract — what the caller sends)
// ---------------------------------------------------------------------------

/// One inbound event line from stdin. Unknown fields are silently ignored.
#[derive(Debug, Clone, Deserialize)]
pub struct InboundEvent {
  pub source: String,
  pub service: String,
  pub environment: String,
  pub timestamp: String,
  pub severity: String,
  pub exception_type: String,
  pub message: String,
  pub stacktrace: Vec<InboundFrame>,
  #[serde(default)]
  pub tags: HashMap<String, String>,
  #[serde(default)]
  pub links: HashMap<String, String>,
  #[serde(default)]
  pub change_window: Option<InboundChangeWindow>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InboundFrame {
  pub file: String,
  #[serde(default)]
  pub function: Option<String>,
  #[serde(default)]
  pub line: Option<u32>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InboundChangeWindow {
  pub deploy_time: String,
  pub commits: Vec<InboundCommit>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct InboundCommit {
  pub id: String,
  #[serde(default)]
  pub timestamp: Option<String>,
  #[serde(default)]
  pub files: Vec<String>,
}

// ---------------------------------------------------------------------------
// Severity enum (normalized)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Severity {
  Warning,
  Error,
  Critical,
}

impl Severity {
  pub fn from_str_loose(s: &str) -> Option<Self> {
    match s.to_ascii_lowercase().as_str() {
      "warning" | "warn" => Some(Self::Warning),
      "error" | "err" => Some(Self::Error),
      "critical" | "fatal" | "crit" => Some(Self::Critical),
      _ => None,
    }
  }

  pub fn score(self) -> u8 {
    match self {
      Self::Warning => 30,
      Self::Error => 60,
      Self::Critical => 90,
    }
  }
}

// ---------------------------------------------------------------------------
// Internal normalized types
// ---------------------------------------------------------------------------

/// Normalized frame (path-normalized, line stripped for fingerprinting).
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize)]
pub struct Frame {
  pub file: String,
  pub function: String,
}

/// Canonical internal event after normalization + validation.
#[derive(Debug, Clone)]
pub struct Event {
  pub source: String,
  pub service: String,
  pub environment: String,
  pub timestamp: DateTime<Utc>,
  pub severity: Severity,
  pub exception_type: String,
  pub message: String,
  pub frames: Vec<Frame>,
  pub tags: HashMap<String, String>,
  pub links: HashMap<String, String>,
  pub change_window: Option<ChangeWindow>,
}

#[derive(Debug, Clone)]
pub struct ChangeWindow {
  pub deploy_time: DateTime<Utc>,
  pub commits: Vec<CommitInfo>,
}

#[derive(Debug, Clone)]
pub struct CommitInfo {
  pub id: String,
  pub timestamp: Option<DateTime<Utc>>,
  pub files: Vec<String>,
}

// ---------------------------------------------------------------------------
// Fingerprint
// ---------------------------------------------------------------------------

/// A stable hex string identifying a unique issue group.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct Fingerprint(pub String);

// ---------------------------------------------------------------------------
// Stats state (per-fingerprint, in-memory)
// ---------------------------------------------------------------------------

/// Streaming stats for one fingerprint.
#[derive(Debug, Clone)]
pub struct StatsState {
  /// Event counts keyed by minute bucket ("YYYY-MM-DDTHH:MM").
  pub buckets: HashMap<String, u64>,
  pub total_count: u64,
  pub first_seen: DateTime<Utc>,
  pub last_seen: DateTime<Utc>,
  /// Rolling baseline (EWMA of per-minute counts).
  pub baseline: f64,
  /// Minutes since last event before the current burst (for regression detection).
  pub quiet_minutes: u64,
}

impl StatsState {
  pub fn new(ts: DateTime<Utc>) -> Self {
    Self {
      buckets: HashMap::new(),
      total_count: 0,
      first_seen: ts,
      last_seen: ts,
      baseline: 0.0,
      quiet_minutes: 0,
    }
  }
}

// ---------------------------------------------------------------------------
// Issue group
// ---------------------------------------------------------------------------

/// Aggregated issue group keyed by fingerprint.
#[derive(Debug, Clone)]
pub struct IssueGroup {
  pub fingerprint: Fingerprint,
  pub exception_type: String,
  pub message: String,
  pub service: String,
  pub environment: String,
  pub stats: StatsState,
}

// ---------------------------------------------------------------------------
// Incident triggering
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TriggerReason {
  Spike,
  NewIssue,
  Regression,
}

// ---------------------------------------------------------------------------
// Output types (JSON contract — what we emit)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct IssueGroupSummary {
  pub fingerprint: String,
  pub exception_type: String,
  pub message: String,
  pub count: u64,
  pub spike_factor: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct SuspectedCause {
  pub commit_id: String,
  pub score: f64,
  pub evidence: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct IncidentSummary {
  pub incident_id: String,
  pub title: String,
  pub service: String,
  pub environment: String,
  pub severity: Severity,
  pub priority_score: u8,
  pub trigger: TriggerReason,
  pub start_time: String,
  pub last_seen: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub peak_time: Option<String>,
  pub top_symptoms: Vec<IssueGroupSummary>,
  pub suspected_causes: Vec<SuspectedCause>,
  pub recommended_first_actions: Vec<String>,
  #[serde(default, skip_serializing_if = "HashMap::is_empty")]
  pub links: HashMap<String, String>,
}

// ---------------------------------------------------------------------------
// CLI stream wrappers
// ---------------------------------------------------------------------------

/// Structured error output for invalid input lines.
#[derive(Debug, Clone, Serialize)]
pub struct ErrorOutput {
  pub error: bool,
  pub message: String,
  #[serde(skip_serializing_if = "Option::is_none")]
  pub field: Option<String>,
}

impl ErrorOutput {
  pub fn new(message: impl Into<String>) -> Self {
    Self {
      error: true,
      message: message.into(),
      field: None,
    }
  }

  pub fn with_field(mut self, field: impl Into<String>) -> Self {
    self.field = Some(field.into());
    self
  }
}
