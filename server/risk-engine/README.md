# risk-engine

Placeholder for the PushLog Diff / Risk Scoring Engine (Part 2.1).

- **Role:** Turn commit message + file list + churn into impact_score, risk_flags, change_type_tags, hotspot_files, explanations.
- **Invocation:** Called from Node as a subprocess; JSON in via stdin, JSON out via stdout.
- **V1:** Rules and heuristics only; no AI, no DB, no network.
