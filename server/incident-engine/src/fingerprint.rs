//! Stable fingerprint computation for grouping events into issues.

use crate::types::{Event, Fingerprint, Frame};

/// Compute a stable fingerprint from an event.
///
/// Key components: exception_type + top N normalized frames + service + env.
/// Uses blake3 for a fast, deterministic hash.
pub fn compute(event: &Event, max_frames: usize) -> Fingerprint {
  let mut hasher = blake3::Hasher::new();
  hasher.update(event.exception_type.as_bytes());
  hasher.update(b"|");
  hasher.update(event.service.as_bytes());
  hasher.update(b"|");
  hasher.update(event.environment.as_bytes());

  let top_frames: Vec<&Frame> = event.frames.iter().take(max_frames).collect();
  for frame in &top_frames {
    hasher.update(b"|");
    hasher.update(frame.file.as_bytes());
    hasher.update(b":");
    hasher.update(frame.function.as_bytes());
  }

  let hash = hasher.finalize();
  // Use first 16 bytes (32 hex chars) for a compact but collision-resistant ID.
  let hex = hash.to_hex();
  Fingerprint(hex[..32].to_string())
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::types::{Event, Frame, Severity};
  use chrono::Utc;
  use std::collections::HashMap;

  fn make_event(exc: &str, frames: Vec<(&str, &str)>, service: &str, env: &str) -> Event {
    Event {
      source: "sentry".into(),
      service: service.into(),
      environment: env.into(),
      timestamp: Utc::now(),
      severity: Severity::Error,
      exception_type: exc.into(),
      message: "test".into(),
      frames: frames
        .into_iter()
        .map(|(file, func)| Frame {
          file: file.into(),
          function: func.into(),
        })
        .collect(),
      tags: HashMap::new(),
      links: HashMap::new(),
      change_window: None,
      correlation_hints: crate::types::CorrelationHints::default(),
      api_route: None,
      request_url: None,
    }
  }

  #[test]
  fn same_input_same_fingerprint() {
    let e1 = make_event("TypeError", vec![("src/a.ts", "foo")], "api", "prod");
    let e2 = make_event("TypeError", vec![("src/a.ts", "foo")], "api", "prod");
    assert_eq!(compute(&e1, 5), compute(&e2, 5));
  }

  #[test]
  fn different_exception_different_fingerprint() {
    let e1 = make_event("TypeError", vec![("src/a.ts", "foo")], "api", "prod");
    let e2 = make_event("ValueError", vec![("src/a.ts", "foo")], "api", "prod");
    assert_ne!(compute(&e1, 5), compute(&e2, 5));
  }

  #[test]
  fn different_service_different_fingerprint() {
    let e1 = make_event("TypeError", vec![("src/a.ts", "foo")], "api", "prod");
    let e2 = make_event("TypeError", vec![("src/a.ts", "foo")], "worker", "prod");
    assert_ne!(compute(&e1, 5), compute(&e2, 5));
  }

  #[test]
  fn different_env_different_fingerprint() {
    let e1 = make_event("TypeError", vec![("src/a.ts", "foo")], "api", "prod");
    let e2 = make_event("TypeError", vec![("src/a.ts", "foo")], "api", "staging");
    assert_ne!(compute(&e1, 5), compute(&e2, 5));
  }

  #[test]
  fn extra_frames_beyond_max_ignored() {
    let e1 = make_event(
      "TypeError",
      vec![("src/a.ts", "foo"), ("src/b.ts", "bar"), ("src/c.ts", "baz")],
      "api",
      "prod",
    );
    let e2 = make_event(
      "TypeError",
      vec![("src/a.ts", "foo"), ("src/b.ts", "bar")],
      "api",
      "prod",
    );
    // With max_frames=2, extra frame in e1 should be ignored.
    assert_eq!(compute(&e1, 2), compute(&e2, 2));
  }

  #[test]
  fn fingerprint_is_32_hex_chars() {
    let e = make_event("TypeError", vec![("src/a.ts", "foo")], "api", "prod");
    let fp = compute(&e, 5);
    assert_eq!(fp.0.len(), 32);
    assert!(fp.0.chars().all(|c| c.is_ascii_hexdigit()));
  }
}
