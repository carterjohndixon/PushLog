# Config / certs

Put the Supabase database certificate here for local reference and for uploading to EC2:

- **File:** `supabase-db.crt` (download from Supabase Dashboard → Project Settings → Database)
- **Git:** `supabase-db.crt` is in .gitignore so it is not committed.
- **EC2:** Upload this file to the server and set `DATABASE_SSL_CA_PATH` in `.env.production` to its path on the server (e.g. `/var/www/pushlog/config/supabase-db.crt`).
