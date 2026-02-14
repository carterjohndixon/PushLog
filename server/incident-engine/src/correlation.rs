//! Correlate incidents to recent deploys/commits.
//!
//! Scoring: weighted combination of stack-frame file overlap + time proximity to deploy.

use chrono::{DateTime, Utc};

use crate::config::Config;
use crate::types::{ChangeWindow, Frame, SuspectedCause};

/// Rank commits from a change window by relevance to the incident's stack frames.
///
/// Returns suspected causes sorted by score descending, then commit_id for determinism.
pub fn rank_suspects(
  frames: &[Frame],
  change_window: &ChangeWindow,
  event_time: &DateTime<Utc>,
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
            // Match on file name tail (e.g. "src/a.ts" matches "packages/src/a.ts").
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

      let total = config.correlation_file_weight * file_score
        + config.correlation_time_weight * time_score;

      if total > 0.0 {
        Some(SuspectedCause {
          commit_id: commit.id.clone(),
          score: (total * 1000.0).round() / 1000.0, // 3 decimal places
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
  use crate::types::{ChangeWindow, CommitInfo, Frame};
  use chrono::{TimeZone, Utc};

  fn frame(file: &str, func: &str) -> Frame {
    Frame {
      file: file.into(),
      function: func.into(),
    }
  }

  #[test]
  fn overlapping_commit_ranks_higher() {
    let config = Config::default();
    let deploy = Utc.with_ymd_and_hms(2025, 1, 15, 10, 0, 0).unwrap();
    let event_time = Utc.with_ymd_and_hms(2025, 1, 15, 10, 30, 0).unwrap();

    let cw = ChangeWindow {
      deploy_time: deploy,
      commits: vec![
        CommitInfo {
          id: "aaa".into(),
          timestamp: None,
          files: vec!["src/handler.ts".into()],
        },
        CommitInfo {
          id: "bbb".into(),
          timestamp: None,
          files: vec!["src/unrelated.ts".into()],
        },
      ],
    };

    let frames = vec![frame("src/handler.ts", "handle")];
    let suspects = rank_suspects(&frames, &cw, &event_time, &config);

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
    let deploy = Utc.with_ymd_and_hms(2025, 1, 14, 10, 0, 0).unwrap();
    let event_time = Utc.with_ymd_and_hms(2025, 1, 15, 10, 0, 0).unwrap();

    let cw = ChangeWindow {
      deploy_time: deploy,
      commits: vec![CommitInfo {
        id: "ccc".into(),
        timestamp: None,
        files: vec!["src/other.ts".into()],
      }],
    };

    let frames = vec![frame("src/handler.ts", "handle")];
    let suspects = rank_suspects(&frames, &cw, &event_time, &config);
    assert!(suspects.is_empty());
  }

  #[test]
  fn deterministic_ordering_by_commit_id() {
    let config = Config::default();
    let deploy = Utc.with_ymd_and_hms(2025, 1, 15, 10, 0, 0).unwrap();
    let event_time = Utc.with_ymd_and_hms(2025, 1, 15, 10, 30, 0).unwrap();

    let cw = ChangeWindow {
      deploy_time: deploy,
      commits: vec![
        CommitInfo {
          id: "zzz".into(),
          timestamp: None,
          files: vec!["src/handler.ts".into()],
        },
        CommitInfo {
          id: "aaa".into(),
          timestamp: None,
          files: vec!["src/handler.ts".into()],
        },
      ],
    };

    let frames = vec![frame("src/handler.ts", "handle")];
    let suspects = rank_suspects(&frames, &cw, &event_time, &config);

    assert_eq!(suspects.len(), 2);
    // Same score -> alphabetical commit_id.
    assert_eq!(suspects[0].commit_id, "aaa");
    assert_eq!(suspects[1].commit_id, "zzz");
  }
}
