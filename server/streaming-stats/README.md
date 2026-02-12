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

| Env            | Required | Default | Description       |
|----------------|----------|---------|-------------------|
| `DATABASE_URL` | Yes      | —       | PostgreSQL URL    |
| `PORT`         | No       | 5004    | Listen port       |

## Run

```bash
cargo build --release -p streaming-stats
DATABASE_URL=postgresql://... ./target/release/streaming-stats
```

Listens on `127.0.0.1` only (internal use).
