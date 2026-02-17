//! Normalize inbound events into canonical internal Event models.

use chrono::{DateTime, Utc};

use crate::error::EngineError;
use crate::types::*;

/// Parse and normalize an InboundEvent into a canonical Event.
pub fn normalize(raw: &InboundEvent) -> Result<Event, EngineError> {
  // Validate + parse timestamp
  let timestamp: DateTime<Utc> = DateTime::parse_from_rfc3339(&raw.timestamp)
    .map_err(|e| EngineError::validation("timestamp", &format!("invalid RFC3339: {}", e)))?
    .with_timezone(&Utc);

  // Validate severity
  let severity = Severity::from_str_loose(&raw.severity)
    .ok_or_else(|| EngineError::validation("severity", "expected warning|error|critical"))?;

  // Validate required strings are non-empty
  if raw.source.is_empty() {
    return Err(EngineError::validation("source", "must not be empty"));
  }
  if raw.service.is_empty() {
    return Err(EngineError::validation("service", "must not be empty"));
  }
  if raw.environment.is_empty() {
    return Err(EngineError::validation("environment", "must not be empty"));
  }
  if raw.exception_type.is_empty() {
    return Err(EngineError::validation(
      "exception_type",
      "must not be empty",
    ));
  }
  if raw.message.is_empty() {
    return Err(EngineError::validation("message", "must not be empty"));
  }
  if raw.stacktrace.is_empty() {
    return Err(EngineError::validation(
      "stacktrace",
      "must have at least one frame",
    ));
  }

  // Normalize frames (strip line numbers, normalize paths)
  let frames: Vec<Frame> = raw
    .stacktrace
    .iter()
    .map(|f| Frame {
      file: normalize_path(&f.file),
      function: f.function.clone().unwrap_or_default(),
    })
    .collect();

  // Parse optional change window
  let change_window = match &raw.change_window {
    Some(cw) => {
      let deploy_time: DateTime<Utc> = DateTime::parse_from_rfc3339(&cw.deploy_time)
        .map_err(|e| {
          EngineError::validation(
            "change_window.deploy_time",
            &format!("invalid RFC3339: {}", e),
          )
        })?
        .with_timezone(&Utc);

      let commits = cw
        .commits
        .iter()
        .map(|c| {
          let ts = match &c.timestamp {
            Some(t) => Some(
              DateTime::parse_from_rfc3339(t)
                .map_err(|e| {
                  EngineError::validation(
                    "change_window.commits[].timestamp",
                    &format!("invalid RFC3339: {}", e),
                  )
                })?
                .with_timezone(&Utc),
            ),
            None => None,
          };
          Ok(CommitInfo {
            id: c.id.clone(),
            timestamp: ts,
            files: c.files.iter().map(|f| normalize_path(f)).collect(),
            risk_score: c.risk_score.filter(|&s| s <= 100),
          })
        })
        .collect::<Result<Vec<_>, EngineError>>()?;

      Some(ChangeWindow {
        deploy_time,
        commits,
      })
    }
    None => None,
  };

  let correlation_hints = raw
    .correlation_hints
    .as_ref()
    .map(|h| CorrelationHints {
      critical_paths: h.critical_paths.iter().map(|p| p.to_ascii_lowercase()).collect(),
      low_priority_paths: if h.low_priority_paths.is_empty() {
        vec![
          "docs/".into(),
          "doc/".into(),
          "tests/".into(),
          "test/".into(),
          "spec/".into(),
          "__tests__/".into(),
          ".md".into(),
        ]
      } else {
        h.low_priority_paths.iter().map(|p| p.to_ascii_lowercase()).collect()
      },
    })
    .unwrap_or_default();

  Ok(Event {
    source: raw.source.to_ascii_lowercase(),
    service: raw.service.to_ascii_lowercase(),
    environment: raw.environment.to_ascii_lowercase(),
    timestamp,
    severity,
    exception_type: raw.exception_type.clone(),
    message: raw.message.clone(),
    frames,
    tags: raw.tags.clone(),
    links: raw.links.clone(),
    change_window,
    correlation_hints,
  })
}

/// Normalize a file path for stable comparison:
/// - backslash -> forward slash
/// - collapse repeated slashes
/// - strip leading ./
/// - lowercase
fn normalize_path(p: &str) -> String {
  let s = p.replace('\\', "/");
  let mut out = String::with_capacity(s.len());
  let mut prev_slash = false;
  for ch in s.chars() {
    if ch == '/' {
      if !prev_slash {
        out.push('/');
      }
      prev_slash = true;
    } else {
      prev_slash = false;
      out.push(ch);
    }
  }
  let trimmed = out.strip_prefix("./").unwrap_or(&out);
  trimmed.to_ascii_lowercase()
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn normalize_path_basics() {
    assert_eq!(normalize_path("src\\auth\\jwt.go"), "src/auth/jwt.go");
    assert_eq!(normalize_path("./src//utils/index.ts"), "src/utils/index.ts");
    assert_eq!(normalize_path("SRC/App.tsx"), "src/app.tsx");
  }

  #[test]
  fn normalize_rejects_empty_source() {
    let raw = InboundEvent {
      source: "".into(),
      service: "api".into(),
      environment: "prod".into(),
      timestamp: "2025-01-15T10:30:00Z".into(),
      severity: "error".into(),
      exception_type: "TypeError".into(),
      message: "boom".into(),
      stacktrace: vec![InboundFrame {
        file: "src/a.rs".into(),
        function: Some("main".into()),
        line: Some(1),
      }],
      tags: Default::default(),
      links: Default::default(),
      change_window: None,
      correlation_hints: None,
    };
    let err = normalize(&raw).unwrap_err();
    assert!(err.to_string().contains("source"));
  }

  #[test]
  fn normalize_valid_event() {
    let raw = InboundEvent {
      source: "sentry".into(),
      service: "API".into(),
      environment: "Prod".into(),
      timestamp: "2025-01-15T10:30:00Z".into(),
      severity: "error".into(),
      exception_type: "TypeError".into(),
      message: "cannot read property x".into(),
      stacktrace: vec![InboundFrame {
        file: "src/handler.ts".into(),
        function: Some("handle".into()),
        line: Some(42),
      }],
      tags: Default::default(),
      links: Default::default(),
      change_window: None,
      correlation_hints: None,
    };
    let event = normalize(&raw).unwrap();
    assert_eq!(event.service, "api");
    assert_eq!(event.environment, "prod");
    assert_eq!(event.severity, Severity::Error);
    assert_eq!(event.frames[0].file, "src/handler.ts");
  }
}
