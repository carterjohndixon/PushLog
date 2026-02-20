//! Core engine: maintains state, processes events, triggers incidents.

use std::collections::HashMap;

use crate::config::Config;
use crate::correlation;
use crate::error::EngineError;
use crate::fingerprint;
use crate::normalize;
use crate::stats;
use crate::types::*;

/// The incident correlation engine. Holds in-memory state across events.
pub struct Engine {
  config: Config,
  groups: HashMap<Fingerprint, IssueGroup>,
}

impl Engine {
  pub fn new(config: Config) -> Self {
    Self {
      config,
      groups: HashMap::new(),
    }
  }

  pub fn with_defaults() -> Self {
    Self::new(Config::default())
  }

  /// Process a single inbound event.
  ///
  /// Returns `Ok(Some(summary))` if an incident is triggered, `Ok(None)` otherwise.
  pub fn process(&mut self, raw: &InboundEvent) -> Result<Option<IncidentSummary>, EngineError> {
    let event = normalize::normalize(raw)?;
    let fp = fingerprint::compute(&event, self.config.fingerprint_max_frames);

    // Upsert issue group.
    let group = self.groups.entry(fp.clone()).or_insert_with(|| IssueGroup {
      fingerprint: fp.clone(),
      exception_type: event.exception_type.clone(),
      message: event.message.clone(),
      service: event.service.clone(),
      environment: event.environment.clone(),
      stats: StatsState::new(event.timestamp),
    });

    // Track whether this is a brand-new group (first event ever).
    let is_new = group.stats.total_count == 0;

    // Update streaming stats.
    let (spike_factor, is_regression) =
      stats::record_event(&mut group.stats, event.timestamp, &self.config);

    // Determine trigger reason (if any).
    // GitPush (deploy) events always emit an incident report.
    let trigger = if event.exception_type == "GitPush" {
      Some(TriggerReason::Deploy)
    } else if is_new && event.environment == "prod" {
      Some(TriggerReason::NewIssue)
    } else if is_regression && event.environment == "prod" {
      Some(TriggerReason::Regression)
    } else if spike_factor >= self.config.spike_threshold {
      Some(TriggerReason::Spike)
    } else {
      None
    };

    let trigger = match trigger {
      Some(t) => t,
      None => return Ok(None),
    };

    // Clone group to release the mutable borrow on self.groups.
    let group_snapshot = group.clone();

    // Assemble incident summary (use raw.stacktrace for output — has line numbers; event.frames strips them for fingerprinting).
    let summary = self.assemble_summary(&event, &group_snapshot, spike_factor, trigger, &raw.stacktrace);
    Ok(Some(summary))
  }

  fn assemble_summary(
    &self,
    event: &Event,
    group: &IssueGroup,
    spike_factor: f64,
    trigger: TriggerReason,
    raw_stacktrace: &[crate::types::InboundFrame],
  ) -> IncidentSummary {
    // Stable incident ID: hash of fingerprint + trigger + start_time date.
    let incident_id = {
      let mut hasher = blake3::Hasher::new();
      hasher.update(group.fingerprint.0.as_bytes());
      hasher.update(b"|");
      hasher.update(
        group
          .stats
          .first_seen
          .format("%Y-%m-%dT%H:%M")
          .to_string()
          .as_bytes(),
      );
      let hex = hasher.finalize().to_hex();
      format!("inc-{}", &hex[..16])
    };

    let title = format!(
      "{}: {} in {}/{}",
      match trigger {
        TriggerReason::Spike => "Spike",
        TriggerReason::NewIssue => "New issue",
        TriggerReason::Regression => "Regression",
        TriggerReason::Deploy => "Deploy",
      },
      group.exception_type,
      group.service,
      group.environment
    );

    // Priority score: severity base + trigger bonus + spike bonus.
    let trigger_bonus: u8 = match trigger {
      TriggerReason::NewIssue => 10,
      TriggerReason::Regression => 15,
      TriggerReason::Spike => 20,
      TriggerReason::Deploy => 5,
    };
    let spike_bonus = ((spike_factor - 1.0).max(0.0) * 2.0).min(20.0) as u8;
    let priority_score = (event.severity.score() + trigger_bonus + spike_bonus).min(100);

    // Top symptoms (just this group for MVP; later: multiple correlated groups).
    let symptom = IssueGroupSummary {
      fingerprint: group.fingerprint.0.clone(),
      exception_type: group.exception_type.clone(),
      message: group.message.clone(),
      count: group.stats.total_count,
      spike_factor: (spike_factor * 100.0).round() / 100.0,
    };

    // Correlation: rank suspects if change_window provided.
    let suspected_causes = match &event.change_window {
      Some(cw) => correlation::rank_suspects(
        &event.frames,
        cw,
        &event.timestamp,
        &event.correlation_hints,
        &self.config,
      ),
      None => Vec::new(),
    };

    // Rule-based recommended first actions.
    let mut actions: Vec<String> = Vec::new();
    match trigger {
      TriggerReason::Spike => {
        actions.push("Check dashboards for increased traffic or external dependency failures".into());
        actions.push("Review recent deploys that may have introduced the regression".into());
      }
      TriggerReason::NewIssue => {
        actions.push("Investigate the new exception type and its root cause".into());
        actions.push("Check if a recent deploy introduced this code path".into());
      }
      TriggerReason::Regression => {
        actions.push("Compare current stack trace with the previous occurrence".into());
        actions.push("Check if a recent change re-introduced a previously fixed bug".into());
      }
      TriggerReason::Deploy => {
        actions.push("Review the commit message and changed files for risk".into());
        actions.push("Monitor for errors correlated to this deploy".into());
      }
    }
    if !suspected_causes.is_empty() {
      actions.push(format!(
        "Review top suspect commit: {}",
        suspected_causes[0].commit_id
      ));
    }

    // Find peak time (bucket with highest count).
    let peak_time = group
      .stats
      .buckets
      .iter()
      .max_by_key(|(_, &count)| count)
      .map(|(bucket, _)| format!("{}:00Z", bucket));

    let stacktrace: Vec<_> = raw_stacktrace
      .iter()
      .map(|f| crate::types::StackFrameOutput {
        file: f.file.clone(),
        function: f.function.clone(),
        line: f.line,
      })
      .collect();

    IncidentSummary {
      incident_id,
      title,
      service: group.service.clone(),
      environment: group.environment.clone(),
      severity: event.severity,
      priority_score,
      trigger,
      start_time: group.stats.first_seen.to_rfc3339(),
      last_seen: group.stats.last_seen.to_rfc3339(),
      peak_time,
      top_symptoms: vec![symptom],
      suspected_causes,
      recommended_first_actions: actions,
      stacktrace,
      links: event.links.clone(),
      api_route: event.api_route.clone(),
      request_url: event.request_url.clone(),
    }
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  fn make_inbound(severity: &str, env: &str) -> InboundEvent {
    InboundEvent {
      source: "sentry".into(),
      service: "api".into(),
      environment: env.into(),
      timestamp: "2025-01-15T10:30:00Z".into(),
      severity: severity.into(),
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
      api_route: None,
      request_url: None,
    }
  }

  #[test]
  fn new_prod_issue_triggers_incident() {
    let mut engine = Engine::with_defaults();
    let event = make_inbound("error", "prod");
    let result = engine.process(&event).unwrap();
    assert!(result.is_some());
    let summary = result.unwrap();
    assert_eq!(summary.trigger, TriggerReason::NewIssue);
    assert!(summary.incident_id.starts_with("inc-"));
    assert_eq!(summary.service, "api");
    assert_eq!(summary.environment, "prod");
    assert!(!summary.top_symptoms.is_empty());
    assert!(summary.priority_score <= 100);
  }

  #[test]
  fn staging_event_does_not_trigger_new_issue() {
    let mut engine = Engine::with_defaults();
    let event = make_inbound("error", "staging");
    let result = engine.process(&event).unwrap();
    // Staging new issue does not trigger (only prod).
    assert!(result.is_none());
  }

  #[test]
  fn spike_triggers_in_any_env() {
    let mut engine = Engine::new(Config {
      spike_threshold: 2.0,
      ..Config::default()
    });

    // Seed a baseline.
    for i in 0..5 {
      let mut event = make_inbound("error", "staging");
      event.timestamp = format!("2025-01-15T10:0{}:00Z", i);
      let _ = engine.process(&event);
    }

    // Burst in one minute.
    let mut last_result = None;
    for _ in 0..20 {
      let mut event = make_inbound("error", "staging");
      event.timestamp = "2025-01-15T10:05:00Z".into();
      last_result = engine.process(&event).unwrap();
    }

    assert!(last_result.is_some());
    assert_eq!(last_result.unwrap().trigger, TriggerReason::Spike);
  }

  #[test]
  fn incident_id_is_stable() {
    let mut engine1 = Engine::with_defaults();
    let mut engine2 = Engine::with_defaults();
    let event = make_inbound("error", "prod");

    let s1 = engine1.process(&event).unwrap().unwrap();
    let s2 = engine2.process(&event).unwrap().unwrap();
    assert_eq!(s1.incident_id, s2.incident_id);
  }

  #[test]
  fn correlation_appears_with_change_window() {
    let mut engine = Engine::with_defaults();
    let mut event = make_inbound("error", "prod");
    event.change_window = Some(InboundChangeWindow {
      deploy_time: "2025-01-15T10:00:00Z".into(),
      commits: vec![InboundCommit {
        id: "abc123".into(),
        timestamp: Some("2025-01-15T09:50:00Z".into()),
        files: vec!["src/handler.ts".into()],
        risk_score: None,
      }],
    });

    let summary = engine.process(&event).unwrap().unwrap();
    assert!(!summary.suspected_causes.is_empty());
    assert_eq!(summary.suspected_causes[0].commit_id, "abc123");
  }

  #[test]
  fn invalid_event_returns_error() {
    let mut engine = Engine::with_defaults();
    let mut event = make_inbound("error", "prod");
    event.timestamp = "not-a-date".into();
    let err = engine.process(&event).unwrap_err();
    assert!(err.to_string().contains("timestamp"));
  }
}
