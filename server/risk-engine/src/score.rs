//! Impact score, hotspot files, and human-readable explanations.

use crate::types::Input;

/// Impact 0–100: base from file count + churn, then bump for risk flags.
pub fn compute_impact_score(input: &Input, risk_flags: &[String]) -> u8 {
  let file_factor = (input.files_changed.len() as u32).min(30) * 2;
  let churn = input.additions + input.deletions;
  let churn_factor = (churn / 10).min(40);
  let mut score = (file_factor + churn_factor) as i32;
  for flag in risk_flags {
    match flag.as_str() {
      "auth" | "secrets" | "payment" => score += 15,
      "migration" | "config" => score += 10,
      "deps" => score += 5,
      _ => {}
    }
  }
  score.min(100).max(0) as u8
}

/// Top N files to highlight (we don't have per-file churn; use order, cap at N).
pub fn compute_hotspot_files(files: &[String], n: usize) -> Vec<String> {
  files.iter().take(n).cloned().collect()
}

/// Short human-readable reasons.
pub fn compute_explanations(risk_flags: &[String], change_type_tags: &[String]) -> Vec<String> {
  let mut out = Vec::new();
  for flag in risk_flags {
    let s = match flag.as_str() {
      "deps" => "Touched dependency lockfiles or package manifests",
      "migration" => "Schema or migration changes",
      "auth" => "Auth or permission-related files changed",
      "config" => "Config or environment-related files changed",
      "secrets" => "Possible secrets or credentials area",
      "payment" => "Payment or billing-related code changed",
      _ => continue,
    };
    out.push(s.to_string());
  }
  if change_type_tags.contains(&"tests".to_string()) {
    out.push("Test files changed".to_string());
  }
  if change_type_tags.contains(&"docs".to_string()) {
    out.push("Documentation changed".to_string());
  }
  out
}

#[cfg(test)]
mod tests {
  use super::*;
  use crate::types::Input;

  fn make_input(files_len: usize, additions: u32, deletions: u32) -> Input {
    Input {
      commit_message: "test".to_string(),
      files_changed: (0..files_len).map(|i| format!("file{}.ts", i)).collect(),
      additions,
      deletions,
      diff_text: None,
    }
  }

  #[test]
  fn impact_score_bounds_0_100() {
    let input = make_input(0, 0, 0);
    let score = compute_impact_score(&input, &[]);
    assert!(score <= 100);
    let input = make_input(50, 5000, 5000);
    let score = compute_impact_score(&input, &["auth".to_string(), "secrets".to_string()]);
    assert!(score <= 100);
  }

  #[test]
  fn impact_score_increases_with_risk_flags() {
    let input = make_input(2, 10, 10);
    let base = compute_impact_score(&input, &[]);
    let with_deps = compute_impact_score(&input, &["deps".to_string()]);
    let with_auth = compute_impact_score(&input, &["auth".to_string()]);
    assert!(with_deps >= base);
    assert!(with_auth >= base);
  }

  #[test]
  fn hotspot_files_caps_at_n() {
    let files: Vec<String> = (0..20).map(|i| format!("f{}.ts", i)).collect();
    let out = compute_hotspot_files(&files, 5);
    assert_eq!(out.len(), 5);
    assert_eq!(out[0], "f0.ts");
  }
}
