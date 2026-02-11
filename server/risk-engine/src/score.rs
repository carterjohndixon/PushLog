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
