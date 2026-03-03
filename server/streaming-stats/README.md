# Streaming Stats Engine

A lightweight Rust service that maintains real-time aggregate stats in PostgreSQL. Push events arrive via HTTP; the service updates precomputed counters so dashboards can read fast without heavy aggregation at request time.

## Endpoints

| Method | Path     | Description                    |
|--------|----------|--------------------------------|
| GET    | `/health` | Liveness check                 |
| POST   | `/ingest` | Ingest a single event          |

### Ingest payload

```json
{
  "user_id": "uuid",
  "repository_id": "uuid",
  "impact_score": 42,
  "timestamp": "2025-02-11T12:34:56.789Z"
}
```

## Config

| Env                     | Required | Default | Description                                      |
|-------------------------|----------|---------|--------------------------------------------------|
| `DATABASE_URL`          | Yes      | —       | PostgreSQL URL                                   |
| `PORT`                  | No       | 5004    | Listen port                                      |
| `DATABASE_SSL_CA_PATH`  | Prod*    | —       | Path to CA cert file (required for Supabase SSL) |

\* When connecting to Supabase, SSL is required. The Rust/sqlx stack does not support “accept invalid cert”; you must provide the Supabase DB certificate so verification succeeds. Set `DATABASE_SSL_CA_PATH` to the path of the cert file on the server (e.g. `/var/www/pushlog/config/supabase-db.crt`).

## Run

```bash
cargo build --release -p streaming-stats
DATABASE_URL=postgresql://... ./target/release/streaming-stats
```

Listens on `127.0.0.1` only (internal use).
