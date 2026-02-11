//! PushLog Risk Engine — rule-based scoring (V1); no AI, no DB, no network.
//! Used by the binary for stdin/stdout; can also be called as a library.

mod change_type;
mod risk;
mod score;
mod types;

pub use types::{Input, Output};

/// Run the engine on parsed input and return the output (no I/O).
pub fn run(input: &Input) -> Output {
  let risk_flags = risk::compute_risk_flags(&input.files_changed);
  let change_type_tags =
    change_type::compute_change_type_tags(&input.commit_message, &input.files_changed);
  let impact_score = score::compute_impact_score(input, &risk_flags);
  let hotspot_files = score::compute_hotspot_files(&input.files_changed, 10);
  let explanations = score::compute_explanations(&risk_flags, &change_type_tags);

  Output {
    impact_score,
    risk_flags,
    change_type_tags,
    hotspot_files,
    explanations,
  }
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn run_returns_valid_output_shape() {
    let input = Input {
      commit_message: "feat: add auth".to_string(),
      files_changed: vec![
        "src/auth/jwt.go".to_string(),
        "package-lock.json".to_string(),
      ],
      additions: 50,
      deletions: 10,
      diff_text: None,
    };
    let out = run(&input);
    assert!(out.impact_score <= 100);
    assert!(out.risk_flags.iter().any(|f| f == "auth"));
    assert!(out.risk_flags.iter().any(|f| f == "deps"));
    assert!(!out.change_type_tags.is_empty());
    assert!(out.hotspot_files.len() <= 10);
  }
}
