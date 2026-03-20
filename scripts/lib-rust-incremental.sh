#!/usr/bin/env bash
# Shared helpers: skip `cargo build --release -p …` when the release binary is already
# newer than root Cargo.toml/Cargo.lock and all *.rs / Cargo.toml under the crate dir.
# shellcheck shell=bash

# Returns 0 if a release build is required, 1 if the existing binary is up to date.
pushlog_rust_needs_release_build() {
  local bin_path=$1
  local crate_dir=$2
  if [ ! -f "$bin_path" ]; then
    return 0
  fi
  if [ ! -d "$crate_dir" ]; then
    return 0
  fi
  if [ "Cargo.toml" -nt "$bin_path" ] || [ "Cargo.lock" -nt "$bin_path" ]; then
    return 0
  fi
  if find "$crate_dir" -type f \( -name "*.rs" -o -name "Cargo.toml" \) -newer "$bin_path" -print -quit 2>/dev/null | grep -q .; then
    return 0
  fi
  return 1
}

# Usage: pushlog_maybe_cargo_release <package> <binary_name> <crate_dir> <log_cmd> [cargo_extra_args...]
# log_cmd is a single shell word, e.g. log or log_info — invoked as: $log_cmd "message"
pushlog_maybe_cargo_release() {
  local pkg=$1
  local exe=$2
  local dir=$3
  local logcmd=$4
  shift 4
  local bin="target/release/${exe}"
  if pushlog_rust_needs_release_build "$bin" "$dir"; then
    $logcmd "Building ${pkg} (Rust)..."
    cargo build --release -p "$pkg" "$@"
  else
    $logcmd "Skipping ${pkg} — release binary is up to date (no Rust source changes)."
  fi
}

# Same as above but never fails the script if cargo is missing; logs a warning instead.
pushlog_maybe_cargo_release_optional() {
  local pkg=$1
  local exe=$2
  local dir=$3
  local logcmd=$4
  shift 4
  local bin="target/release/${exe}"
  if pushlog_rust_needs_release_build "$bin" "$dir"; then
    $logcmd "Building ${pkg} (Rust)..."
    cargo build --release -p "$pkg" "$@" 2>/dev/null || $logcmd "Warning: ${pkg} build skipped (cargo/rust not available)"
  else
    $logcmd "Skipping ${pkg} — release binary is up to date (no Rust source changes)."
  fi
}
