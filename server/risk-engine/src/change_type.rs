//! Change type tags derived from commit message and file paths.

use std::collections::HashSet;

/// Change type tags from commit message and paths.
pub fn compute_change_type_tags(commit_message: &str, files: &[String]) -> Vec<String> {
  let mut tags = HashSet::new();
  let msg = commit_message.to_lowercase();

  if msg.starts_with("feat") || msg.contains("feature") {
    tags.insert("feature".to_string());
  }
  if msg.starts_with("fix") || msg.contains("bugfix") || msg.contains("bug fix") {
    tags.insert("bugfix".to_string());
  }
  if msg.starts_with("refactor") || msg.contains("refactor") {
    tags.insert("refactor".to_string());
  }
  if msg.starts_with("docs") || msg.contains("readme") || msg.contains("documentation") {
    tags.insert("docs".to_string());
  }
  if msg.starts_with("test") || msg.contains("test:") || msg.contains("tests") {
    tags.insert("tests".to_string());
  }
  if msg.starts_with("chore") || msg.contains("chore:") {
    tags.insert("chore".to_string());
  }

  for path in files {
    let p = path.to_lowercase();
    if p.contains("/test")
      || p.contains("_test.")
      || p.contains(".test.")
      || p.contains("/tests/")
      || p.contains("/spec")
    {
      tags.insert("tests".to_string());
    }
    if p.contains("/doc") || p.contains("readme") || p.ends_with(".md") {
      tags.insert("docs".to_string());
    }
  }

  let mut v: Vec<String> = tags.into_iter().collect();
  v.sort();
  v
}
