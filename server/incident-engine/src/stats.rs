//! Streaming per-fingerprint statistics: minute bucketing, EWMA baseline, spike/regression detection.

use chrono::{DateTime, Utc};

use crate::config::Config;
use crate::types::StatsState;

/// Format a timestamp into a minute bucket key: "YYYY-MM-DDTHH:MM".
pub fn minute_bucket(ts: &DateTime<Utc>) -> String {
  ts.format("%Y-%m-%dT%H:%M").to_string()
}

/// Record an event and return (spike_factor, is_regression).
///
/// - Increments the count in the current minute bucket.
/// - Updates EWMA baseline from the *previous* bucket (not the current one).
/// - Computes spike_factor = current_bucket_count / baseline.
/// - Detects regression: was quiet for >= regression_quiet_minutes, then returned.
pub fn record_event(
  stats: &mut StatsState,
  ts: DateTime<Utc>,
  config: &Config,
) -> (f64, bool) {
  let bucket = minute_bucket(&ts);

  // Compute quiet minutes since last_seen (before we update last_seen).
  let elapsed_minutes = (ts - stats.last_seen).num_minutes().max(0) as u64;
  let is_regression = stats.total_count > 0 && elapsed_minutes >= config.regression_quiet_minutes;

  // Update quiet_minutes tracking.
  if elapsed_minutes > 0 {
    stats.quiet_minutes = elapsed_minutes;
  }

  // Increment bucket count.
  let count = stats.buckets.entry(bucket.clone()).or_insert(0);
  *count += 1;
  let current_count = *count;

  stats.total_count += 1;
  stats.last_seen = ts;

  // Update EWMA baseline from previous minute counts (exclude current bucket).
  // Only update when we see a new bucket for the first time.
  if current_count == 1 && stats.buckets.len() > 1 {
    // Average of all previous buckets.
    let prev_sum: u64 = stats
      .buckets
      .iter()
      .filter(|(k, _)| **k != bucket)
      .map(|(_, v)| *v)
      .sum();
    let prev_count = (stats.buckets.len() - 1) as f64;
    let prev_avg = prev_sum as f64 / prev_count;

    stats.baseline =
      config.ewma_alpha * prev_avg + (1.0 - config.ewma_alpha) * stats.baseline;
  }

  // Spike factor: current bucket count / baseline (guard against zero baseline).
  let spike_factor = if stats.baseline > 0.0 {
    current_count as f64 / stats.baseline
  } else if stats.total_count > 1 {
    // No meaningful baseline yet but we have history; use count directly.
    current_count as f64
  } else {
    // Very first event ever — not a spike.
    1.0
  };

  (spike_factor, is_regression)
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::config::Config;
  use crate::types::StatsState;
  use chrono::TimeZone;

  fn ts(min: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2025, 1, 15, 10, min, 0).unwrap()
  }

  #[test]
  fn minute_bucket_format() {
    let t = Utc.with_ymd_and_hms(2025, 6, 1, 14, 5, 30).unwrap();
    assert_eq!(minute_bucket(&t), "2025-06-01T14:05");
  }

  #[test]
  fn first_event_spike_factor_is_one() {
    let config = Config::default();
    let mut stats = StatsState::new(ts(0));
    let (spike, regression) = record_event(&mut stats, ts(0), &config);
    assert!((spike - 1.0).abs() < f64::EPSILON);
    assert!(!regression);
    assert_eq!(stats.total_count, 1);
  }

  #[test]
  fn spike_detected_with_burst() {
    let config = Config {
      spike_threshold: 3.0,
      ..Config::default()
    };
    let start = ts(0);
    let mut stats = StatsState::new(start);

    // Seed baseline: 1 event per minute for 5 minutes.
    for m in 0..5 {
      record_event(&mut stats, ts(m), &config);
    }

    // Now burst: 10 events in minute 5.
    let mut last_spike = 0.0;
    for _ in 0..10 {
      let (spike, _) = record_event(&mut stats, ts(5), &config);
      last_spike = spike;
    }

    assert!(
      last_spike >= config.spike_threshold,
      "spike_factor {} should exceed threshold {}",
      last_spike,
      config.spike_threshold
    );
  }

  #[test]
  fn regression_detected_after_quiet_window() {
    let config = Config {
      regression_quiet_minutes: 60,
      ..Config::default()
    };
    let mut stats = StatsState::new(ts(0));

    // First event.
    record_event(&mut stats, ts(0), &config);

    // 90 minutes later (exceeds quiet window).
    let late = Utc.with_ymd_and_hms(2025, 1, 15, 11, 30, 0).unwrap();
    let (_, regression) = record_event(&mut stats, late, &config);
    assert!(regression);
  }

  #[test]
  fn no_regression_within_quiet_window() {
    let config = Config {
      regression_quiet_minutes: 60,
      ..Config::default()
    };
    let mut stats = StatsState::new(ts(0));

    record_event(&mut stats, ts(0), &config);

    // 30 minutes later (within quiet window).
    let soon = Utc.with_ymd_and_hms(2025, 1, 15, 10, 30, 0).unwrap();
    let (_, regression) = record_event(&mut stats, soon, &config);
    assert!(!regression);
  }
}
