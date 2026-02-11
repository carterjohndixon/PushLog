//! Risk flags derived from file path patterns.

use std::collections::HashSet;

/// Risk flags from file path patterns (lowercase, no duplicates).
pub fn compute_risk_flags(files: &[String]) -> Vec<String> {
  let mut flags = HashSet::new();
  for path in files {
    let p = path.to_lowercase();
    if p.contains("package-lock.json")
      || p.contains("yarn.lock")
      || p.contains("cargo.lock")
      || p.ends_with("go.sum")
      || p.ends_with("go.mod")
      || p.contains("pnpm-lock")
    {
      flags.insert("deps".to_string());
    }
    if p.contains("migration")
      || p.contains("schema")
      || p.contains("prisma")
      || p.contains("/migrations/")
    {
      flags.insert("migration".to_string());
    }
    if p.contains("auth")
      || p.contains("jwt")
      || p.contains("oauth")
      || p.contains("session")
      || p.contains("/acl")
      || p.contains("permission")
    {
      flags.insert("auth".to_string());
    }
    if p.contains(".env")
      || p.contains("config")
      || p.contains("secrets")
      || p.contains("keys")
      || p.contains("credential")
    {
      flags.insert("config".to_string());
    }
    if p.contains("secret")
      || p.contains("password")
      || p.contains("api_key")
      || p.contains("apikey")
    {
      flags.insert("secrets".to_string());
    }
    if p.contains("payment")
      || p.contains("stripe")
      || p.contains("billing")
      || p.contains("invoice")
    {
      flags.insert("payment".to_string());
    }
  }
  let mut v: Vec<String> = flags.into_iter().collect();
  v.sort();
  v
}
