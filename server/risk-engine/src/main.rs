//! Binary entrypoint: read one JSON object from stdin, write one to stdout.

use risk_engine::{run, Input};
use std::io::{self, Read, Write};

fn main() {
  if let Err(e) = run_binary() {
    let _ = writeln!(io::stderr(), "risk-engine error: {}", e);
    std::process::exit(1);
  }
}

fn run_binary() -> Result<(), Box<dyn std::error::Error>> {
  let mut raw = String::new();
  io::stdin().lock().read_to_string(&mut raw)?;
  let input: Input = serde_json::from_str(&raw)?;

  let out = run(&input);
  let json = serde_json::to_vec(&out)?;
  io::stdout().write_all(&json)?;
  Ok(())
}
