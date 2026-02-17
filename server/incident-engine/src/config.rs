//! Engine configuration with sane defaults.
//! Weights can be overridden via env: INCIDENT_CORRELATION_FILE_WEIGHT, INCIDENT_CORRELATION_TIME_WEIGHT, INCIDENT_CORRELATION_RISK_WEIGHT.

/// Tunable thresholds for incident detection.
#[derive(Debug, Clone)]
pub struct Config {
  /// Spike factor threshold: current-minute count / baseline.
  pub spike_threshold: f64,
  /// EWMA smoothing factor (0..1). Higher = more reactive.
  pub ewma_alpha: f64,
  /// Minutes of silence before a recurrence counts as "regression".
  pub regression_quiet_minutes: u64,
  /// Max stack frames to include in fingerprint.
  pub fingerprint_max_frames: usize,
  /// Time proximity weight for correlation scoring (0..1).
  pub correlation_time_weight: f64,
  /// File overlap weight for correlation scoring (0..1).
  pub correlation_file_weight: f64,
  /// Risk/impact score weight for correlation (0..1). 0 = disabled.
  pub correlation_risk_weight: f64,
  /// Max hours after deploy to consider a commit as a suspect.
  pub correlation_max_hours: f64,
}

impl Default for Config {
  fn default() -> Self {
    Self {
      spike_threshold: 3.0,
      ewma_alpha: 0.3,
      regression_quiet_minutes: 60,
      fingerprint_max_frames: 5,
      correlation_time_weight: 0.3,
      correlation_file_weight: 0.7,
      correlation_risk_weight: 0.0,
      correlation_max_hours: 24.0,
    }
  }
}

impl Config {
  /// Build config from environment variables (fallback to defaults).
  pub fn from_env() -> Self {
    let default = Config::default();
    let file_weight = std::env::var("INCIDENT_CORRELATION_FILE_WEIGHT")
      .ok()
      .and_then(|s| s.parse().ok())
      .unwrap_or(default.correlation_file_weight);
    let time_weight = std::env::var("INCIDENT_CORRELATION_TIME_WEIGHT")
      .ok()
      .and_then(|s| s.parse().ok())
      .unwrap_or(default.correlation_time_weight);
    let risk_weight = std::env::var("INCIDENT_CORRELATION_RISK_WEIGHT")
      .ok()
      .and_then(|s| s.parse().ok())
      .unwrap_or(default.correlation_risk_weight);
    Config {
      correlation_file_weight: file_weight.clamp(0.0, 1.0),
      correlation_time_weight: time_weight.clamp(0.0, 1.0),
      correlation_risk_weight: risk_weight.clamp(0.0, 1.0),
      ..default
    }
  }
}
