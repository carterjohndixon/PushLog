//! Integration tests for the incident engine.

use incident_engine::{Config, Engine, InboundEvent};

fn fixture_event() -> InboundEvent {
  let json = r#"{
    "source": "sentry",
    "service": "api",
    "environment": "prod",
    "timestamp": "2025-01-15T10:30:00Z",
    "severity": "error",
    "exception_type": "TypeError",
    "message": "Cannot read property 'id' of undefined",
    "stacktrace": [
      {"file": "src/handler.ts", "function": "handleRequest", "line": 42},
      {"file": "src/middleware/auth.ts", "function": "verifyToken", "line": 18}
    ],
    "tags": {"release": "v1.2.3", "endpoint": "/api/payments"},
    "links": {"source_url": "https://sentry.io/issues/12345"},
    "change_window": {
      "deploy_time": "2025-01-15T10:00:00Z",
      "commits": [
        {"id": "abc123def", "timestamp": "2025-01-15T09:50:00Z", "files": ["src/handler.ts", "src/utils/format.ts"]},
        {"id": "fff999aaa", "timestamp": "2025-01-15T09:45:00Z", "files": ["src/unrelated/config.ts"]}
      ]
    }
  }"#;
  serde_json::from_str(json).unwrap()
}

#[test]
fn single_prod_event_produces_incident_summary() {
  let mut engine = Engine::with_defaults();
  let event = fixture_event();
  let result = engine.process(&event).unwrap();

  assert!(result.is_some(), "First prod event should trigger NewIssue");
  let summary = result.unwrap();

  // Structure checks.
  assert!(summary.incident_id.starts_with("inc-"));
  assert_eq!(summary.service, "api");
  assert_eq!(summary.environment, "prod");
  assert!(!summary.title.is_empty());
  assert!(summary.priority_score > 0 && summary.priority_score <= 100);

  // Symptoms.
  assert_eq!(summary.top_symptoms.len(), 1);
  assert_eq!(summary.top_symptoms[0].exception_type, "TypeError");

  // Correlation.
  assert!(
    !summary.suspected_causes.is_empty(),
    "Should have at least one suspect (abc123def overlaps stack frames)"
  );
  assert_eq!(summary.suspected_causes[0].commit_id, "abc123def");

  // Links preserved.
  assert!(summary.links.contains_key("source_url"));

  // Recommended actions.
  assert!(!summary.recommended_first_actions.is_empty());
}

#[test]
fn deterministic_output_across_runs() {
  let event = fixture_event();

  let mut engine1 = Engine::with_defaults();
  let s1 = engine1.process(&event).unwrap().unwrap();
  let json1 = serde_json::to_string(&s1).unwrap();

  let mut engine2 = Engine::with_defaults();
  let s2 = engine2.process(&event).unwrap().unwrap();
  let json2 = serde_json::to_string(&s2).unwrap();

  assert_eq!(json1, json2, "Same inputs must produce identical JSON output");
}

#[test]
fn unknown_fields_are_ignored() {
  let json = r#"{
    "source": "sentry",
    "service": "api",
    "environment": "prod",
    "timestamp": "2025-01-15T10:30:00Z",
    "severity": "error",
    "exception_type": "TypeError",
    "message": "boom",
    "stacktrace": [{"file": "src/a.ts", "function": "f", "line": 1}],
    "some_unknown_field": "should be ignored",
    "another": 42
  }"#;

  let raw: InboundEvent = serde_json::from_str(json).unwrap();
  let mut engine = Engine::with_defaults();
  let result = engine.process(&raw);
  assert!(result.is_ok());
}

#[test]
fn missing_required_field_gives_clear_error() {
  // Missing stacktrace (empty array).
  let json = r#"{
    "source": "sentry",
    "service": "api",
    "environment": "prod",
    "timestamp": "2025-01-15T10:30:00Z",
    "severity": "error",
    "exception_type": "TypeError",
    "message": "boom",
    "stacktrace": []
  }"#;

  let raw: InboundEvent = serde_json::from_str(json).unwrap();
  let mut engine = Engine::with_defaults();
  let err = engine.process(&raw).unwrap_err();
  assert!(
    err.to_string().contains("stacktrace"),
    "Error should mention the field: {}",
    err
  );
}

#[test]
fn spike_detection_over_multiple_events() {
  let mut engine = Engine::new(Config {
    spike_threshold: 3.0,
    ..Config::default()
  });

  // Baseline: 1 event per minute in staging (won't trigger NewIssue).
  for i in 0..5 {
    let json = format!(
      r#"{{
        "source":"sentry","service":"api","environment":"staging",
        "timestamp":"2025-01-15T10:0{}:00Z","severity":"error",
        "exception_type":"TypeError","message":"boom",
        "stacktrace":[{{"file":"src/a.ts","function":"f","line":1}}]
      }}"#,
      i
    );
    let raw: InboundEvent = serde_json::from_str(&json).unwrap();
    let _ = engine.process(&raw);
  }

  // Burst: 20 events in a single minute.
  let mut triggered = false;
  for _ in 0..20 {
    let json = r#"{
      "source":"sentry","service":"api","environment":"staging",
      "timestamp":"2025-01-15T10:05:00Z","severity":"error",
      "exception_type":"TypeError","message":"boom",
      "stacktrace":[{"file":"src/a.ts","function":"f","line":1}]
    }"#;
    let raw: InboundEvent = serde_json::from_str(json).unwrap();
    if let Ok(Some(summary)) = engine.process(&raw) {
      assert_eq!(summary.trigger, incident_engine::types::TriggerReason::Spike);
      triggered = true;
    }
  }

  assert!(triggered, "Spike should have been detected during the burst");
}
