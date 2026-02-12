//! HTTP handlers for the stats engine.

use axum::{extract::State, http::StatusCode, Json};
use std::sync::Arc;

use crate::date;
use crate::state::AppState;
use crate::types::IngestPayload;

pub async fn health() -> &'static str {
  "ok"
}

pub async fn ingest(
  State(state): State<Arc<AppState>>,
  Json(payload): Json<IngestPayload>,
) -> StatusCode {
  let stat_date = match date::parse_stat_date(&payload.timestamp) {
    Some(d) => d,
    None => {
      eprintln!("ingest: invalid timestamp {}", payload.timestamp);
      return StatusCode::BAD_REQUEST;
    }
  };

  let impact_score = payload.impact_score.clamp(0, 100);
  let repo_key = payload.repository_id.to_string();

  let result = sqlx::query(
    r#"
    INSERT INTO user_daily_stats (user_id, stat_date, pushes_count, total_risk, per_repo_counts)
    VALUES ($1, $2::date, 1, $3, jsonb_build_object($4, 1))
    ON CONFLICT (user_id, stat_date) DO UPDATE SET
      pushes_count = user_daily_stats.pushes_count + 1,
      total_risk = user_daily_stats.total_risk + $3,
      per_repo_counts = jsonb_set(
        COALESCE(user_daily_stats.per_repo_counts, '{}'::jsonb),
        ARRAY[$4],
        to_jsonb(COALESCE((user_daily_stats.per_repo_counts->>$4)::int, 0) + 1)
      )
    "#,
  )
  .bind(payload.user_id)
  .bind(stat_date)
  .bind(impact_score)
  .bind(&repo_key)
  .execute(&state.pool)
  .await;

  match result {
    Ok(_) => StatusCode::OK,
    Err(e) => {
      eprintln!("ingest: db error: {}", e);
      StatusCode::INTERNAL_SERVER_ERROR
    }
  }
}
