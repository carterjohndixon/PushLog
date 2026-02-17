//! Correlate incidents to recent deploys/commits.
//!
//! Scoring: weighted combination of stack-frame file overlap + time proximity + optional
//! critical-path boost, docs/tests downweight, and risk score.

use chrono::{DateTime, Utc};

use crate::config::Config;
use crate::types::{ChangeWindow, CorrelationHints, Frame, SuspectedCause};

/// Path matches a hint (prefix, path segment, or substring e.g. ".md").
fn path_matches_hint(path: &str, hint: &str) -> bool {
  let path = path.to_ascii_lowercase();
  let hint = hint.to_ascii_lowercase().trim_end_matches('/').to_string();
  if hint.is_empty() {
    return false;
  }
  path.starts_with(&hint)
    || path.starts_with(&format!("{}/", hint))
    || path.split('/').any(|seg| seg == hint || seg.ends_with(&hint))
    || path.contains(&hint)
}

/// Commit touches any of these path hints?
fn commit_touches_paths(files: &[String], paths: &[String]) -> bool {
  if paths.is_empty() {
    return false;
  }
  files.iter().any(|cf| {
    let cf = cf.to_ascii_lowercase();
    paths.iter().any(|p| path_matches_hint(&cf, p))
  })
}

/// Commit touches ONLY low-priority paths (docs/tests)? If so, we downweight.
fn commit_is_low_priority_only(files: &[String], low_priority: &[String]) -> bool {
  if files.is_empty() || low_priority.is_empty() {
    return false;
  }
  files.iter().all(|cf| {
    let cf = cf.to_ascii_lowercase();
    low_priority.iter().any(|p| path_matches_hint(&cf, p))
  })
}

/// Rank commits from a change window by relevance to the incident's stack frames.
///
/// Returns suspected causes sorted by score descending, then commit_id for determinism.
pub fn rank_suspects(
  frames: &[Frame],
  change_window: &ChangeWindow,
  event_time: &DateTime<Utc>,
  hints: &CorrelationHints,
  config: &Config,
) -> Vec<SuspectedCause> {
  let frame_files: Vec<&str> = frames.iter().map(|f| f.file.as_str()).collect();

  let mut suspects: Vec<SuspectedCause> = change_window
    .commits
    .iter()
    .filter_map(|commit| {
      let mut evidence = Vec::new();

      // File overlap score: fraction of commit files that appear in stack frames.
      let overlap_count = commit
        .files
        .iter()
        .filter(|cf| {
          let cf_lower = cf.to_ascii_lowercase();
          frame_files.iter().any(|ff| {
            ff.ends_with(&cf_lower) || cf_lower.ends_with(ff)
          })
        })
        .count();

      let file_score = if commit.files.is_empty() {
        0.0
      } else {
        overlap_count as f64 / commit.files.len() as f64
      };

      if overlap_count > 0 {
        evidence.push(format!("{}/{} changed files overlap stack frames", overlap_count, commit.files.len()));
      }

      // Time proximity score: closer deploy -> higher score.
      let hours_since_deploy =
        (*event_time - change_window.deploy_time).num_minutes() as f64 / 60.0;
      let time_score = if hours_since_deploy <= 0.0 || hours_since_deploy > config.correlation_max_hours {
        0.0
      } else {
        1.0 - (hours_since_deploy / config.correlation_max_hours)
      };

      if time_score > 0.0 {
        evidence.push(format!("{:.1}h after deploy", hours_since_deploy));
      }

      // Risk score component (0..1 when present).
      let risk_score = commit
        .risk_score
        .map(|s| (s as f64 / 100.0).min(1.0))
        .unwrap_or(0.0);
      if commit.risk_score.is_some() && config.correlation_risk_weight > 0.0 {
        evidence.push(format!("risk score {}", commit.risk_score.unwrap()));
      }

      // Critical-path boost: commit touches configured critical paths.
      let critical_boost = if commit_touches_paths(&commit.files, &hints.critical_paths) {
        0.15
      } else {
        0.0
      };
      if critical_boost > 0.0 {
        evidence.push("touches critical path".into());
      }

      // Docs/tests-only: exclude entirely when no stack overlap (don't list as suspect).
      let is_low_priority_only = commit_is_low_priority_only(&commit.files, &hints.low_priority_paths);
      if is_low_priority_only && overlap_count == 0 {
        return None;
      }
      let low_priority_penalty = if is_low_priority_only { -0.2 } else { 0.0 };
      if low_priority_penalty < 0.0 {
        evidence.push("docs/tests only".into());
      }

      let total = (config.correlation_file_weight * file_score
        + config.correlation_time_weight * time_score
        + config.correlation_risk_weight * risk_score
        + critical_boost
        + low_priority_penalty)
        .max(0.0);

      if total > 0.0 {
        Some(SuspectedCause {
          commit_id: commit.id.clone(),
          score: (total * 1000.0).round() / 1000.0,
          evidence,
        })
      } else {
        None
      }
    })
    .collect();

  // Deterministic sort: score desc, then commit_id asc.
  suspects.sort_by(|a, b| {
    b.score
      .partial_cmp(&a.score)
      .unwrap_or(std::cmp::Ordering::Equal)
      .then_with(|| a.commit_id.cmp(&b.commit_id))
  });

  suspects
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::config::Config;
  use crate::types::{ChangeWindow, CommitInfo, CorrelationHints, Frame};
  use chrono::{TimeZone, Utc};

  fn frame(file: &str, func: &str) -> Frame {
    Frame {
      file: file.into(),
      function: func.into(),
    }
  }

  fn default_hints() -> CorrelationHints {
    CorrelationHints::default()
  }

  #[test]
  fn overlapping_commit_ranks_higher() {
    let config = Config::default();
    let hints = default_hints();
    let deploy = Utc.with_ymd_and_hms(2025, 1, 15, 10, 0, 0).unwrap();
    let event_time = Utc.with_ymd_and_hms(2025, 1, 15, 10, 30, 0).unwrap();

    let cw = ChangeWindow {
      deploy_time: deploy,
      commits: vec![
        CommitInfo {
          id: "aaa".into(),
          timestamp: None,
          files: vec!["src/handler.ts".into()],
          risk_score: None,
        },
        CommitInfo {
          id: "bbb".into(),
          timestamp: None,
          files: vec!["src/unrelated.ts".into()],
          risk_score: None,
        },
      ],
    };

    let frames = vec![frame("src/handler.ts", "handle")];
    let suspects = rank_suspects(&frames, &cw, &event_time, &hints, &config);

    assert!(!suspects.is_empty());
    assert_eq!(suspects[0].commit_id, "aaa");
    if suspects.len() > 1 {
      assert!(suspects[0].score >= suspects[1].score);
    }
  }

  #[test]
  fn no_suspects_when_no_overlap_and_old_deploy() {
    let config = Config {
      correlation_max_hours: 1.0,
      ..Config::default()
    };
    let hints = default_hints();
    let deploy = Utc.with_ymd_and_hms(2025, 1, 14, 10, 0, 0).unwrap();
    let event_time = Utc.with_ymd_and_hms(2025, 1, 15, 10, 0, 0).unwrap();

    let cw = ChangeWindow {
      deploy_time: deploy,
      commits: vec![CommitInfo {
        id: "ccc".into(),
        timestamp: None,
        files: vec!["src/other.ts".into()],
        risk_score: None,
      }],
    };

    let frames = vec![frame("src/handler.ts", "handle")];
    let suspects = rank_suspects(&frames, &cw, &event_time, &hints, &config);
    assert!(suspects.is_empty());
  }

  #[test]
  fn deterministic_ordering_by_commit_id() {
    let config = Config::default();
    let hints = default_hints();
    let deploy = Utc.with_ymd_and_hms(2025, 1, 15, 10, 0, 0).unwrap();
    let event_time = Utc.with_ymd_and_hms(2025, 1, 15, 10, 30, 0).unwrap();

    let cw = ChangeWindow {
      deploy_time: deploy,
      commits: vec![
        CommitInfo {
          id: "zzz".into(),
          timestamp: None,
          files: vec!["src/handler.ts".into()],
          risk_score: None,
        },
        CommitInfo {
          id: "aaa".into(),
          timestamp: None,
          files: vec!["src/handler.ts".into()],
          risk_score: None,
        },
      ],
    };

    let frames = vec![frame("src/handler.ts", "handle")];
    let suspects = rank_suspects(&frames, &cw, &event_time, &hints, &config);

    assert_eq!(suspects.len(), 2);
    assert_eq!(suspects[0].commit_id, "aaa");
    assert_eq!(suspects[1].commit_id, "zzz");
  }

  #[test]
  fn critical_path_boost() {
    let config = Config::default();
    let hints = CorrelationHints {
      critical_paths: vec!["src/auth".into()],
      low_priority_paths: vec!["docs/".into(), "test/".into()],
    };
    let deploy = Utc.with_ymd_and_hms(2025, 1, 15, 10, 0, 0).unwrap();
    let event_time = Utc.with_ymd_and_hms(2025, 1, 15, 10, 30, 0).unwrap();

    let cw = ChangeWindow {
      deploy_time: deploy,
      commits: vec![
        CommitInfo {
          id: "critical".into(),
          timestamp: None,
          files: vec!["src/auth/jwt.ts".into()],
          risk_score: None,
        },
        CommitInfo {
          id: "other".into(),
          timestamp: None,
          files: vec!["src/utils/helper.ts".into()],
          risk_score: None,
        },
      ],
    };

    let frames = vec![frame("src/auth/jwt.ts", "verify")];
    let suspects = rank_suspects(&frames, &cw, &event_time, &hints, &config);

    assert_eq!(suspects.len(), 2);
    assert_eq!(suspects[0].commit_id, "critical");
    assert!(suspects[0].evidence.iter().any(|e| e.contains("critical path")));
  }

  #[test]
  fn docs_only_downweighted() {
    let config = Config::default();
    let hints = CorrelationHints {
      critical_paths: vec![],
      low_priority_paths: vec!["docs/".into(), "test/".into()],
    };
    let deploy = Utc.with_ymd_and_hms(2025, 1, 15, 10, 0, 0).unwrap();
    let event_time = Utc.with_ymd_and_hms(2025, 1, 15, 10, 30, 0).unwrap();

    let cw = ChangeWindow {
      deploy_time: deploy,
      commits: vec![CommitInfo {
        id: "docs-only".into(),
        timestamp: None,
        files: vec!["docs/readme.md".into(), "test/unit.test.ts".into()],
        risk_score: None,
      }],
    };

    let frames = vec![frame("src/handler.ts", "handle")];
    let suspects = rank_suspects(&frames, &cw, &event_time, &hints, &config);
    assert!(suspects.is_empty());
  }
}
