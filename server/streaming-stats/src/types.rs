//! Request/response types for the stats engine.

use serde::Deserialize;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct IngestPayload {
  pub user_id: Uuid,
  pub repository_id: Uuid,
  pub impact_score: i32,
  pub timestamp: String,
}
