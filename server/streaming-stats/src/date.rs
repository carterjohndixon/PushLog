//! Date parsing utilities.

use chrono::{DateTime, Utc};

/// Parse ISO8601 timestamp to YYYY-MM-DD (UTC).
pub fn parse_stat_date(s: &str) -> Option<String> {
  let dt = DateTime::parse_from_rfc3339(s).ok()?.with_timezone(&Utc);
  Some(dt.format("%Y-%m-%d").to_string())
}
