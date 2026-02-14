//! Binary entrypoint: read JSON lines from stdin, write JSON lines to stdout.
//!
//! Each input line is an InboundEvent. Output lines are either:
//! - An IncidentSummary (when an incident is triggered)
//! - An ErrorOutput (when input validation fails)
//!
//! Events that are valid but don't trigger an incident produce no output line.

use incident_engine::{Engine, InboundEvent};
use incident_engine::types::ErrorOutput;
use std::io::{self, BufRead, Write};

fn main() {
  let stdin = io::stdin();
  let stdout = io::stdout();
  let mut out = io::BufWriter::new(stdout.lock());
  let mut engine = Engine::with_defaults();

  for line in stdin.lock().lines() {
    let line = match line {
      Ok(l) => l,
      Err(e) => {
        let _ = writeln!(io::stderr(), "incident-engine: read error: {}", e);
        std::process::exit(1);
      }
    };

    // Skip blank lines.
    let trimmed = line.trim();
    if trimmed.is_empty() {
      continue;
    }

    // Parse inbound event.
    let raw: InboundEvent = match serde_json::from_str(trimmed) {
      Ok(v) => v,
      Err(e) => {
        let err = ErrorOutput::new(format!("json parse: {}", e));
        let _ = serde_json::to_writer(&mut out, &err);
        let _ = writeln!(out);
        continue;
      }
    };

    // Process through engine.
    match engine.process(&raw) {
      Ok(Some(summary)) => {
        let _ = serde_json::to_writer(&mut out, &summary);
        let _ = writeln!(out);
      }
      Ok(None) => {
        // No incident triggered — no output.
      }
      Err(e) => {
        let err = match &e {
          incident_engine::EngineError::Validation { field, reason } => {
            ErrorOutput::new(reason.clone()).with_field(field.clone())
          }
          _ => ErrorOutput::new(e.to_string()),
        };
        let _ = serde_json::to_writer(&mut out, &err);
        let _ = writeln!(out);
      }
    }
  }

  let _ = out.flush();
}
