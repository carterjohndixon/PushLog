# syntax=docker/dockerfile:1
# Single build stage to reduce peak disk usage (avoids parallel Node + Rust builds)
FROM node:20-bookworm-slim AS build

RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends curl build-essential && rm -rf /var/lib/apt/lists/*

# Install Rust (minimal)
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal
ENV PATH="/root/.cargo/bin:$PATH"

WORKDIR /app
COPY package*.json ./
RUN npm install --include=dev
COPY . .

# Sentry source map upload (optional: pass at build time so frontend errors show original file:line)
ARG SENTRY_AUTH_TOKEN
ARG SENTRY_ORG
ARG SENTRY_PROJECT
ENV SENTRY_AUTH_TOKEN=${SENTRY_AUTH_TOKEN}
ENV SENTRY_ORG=${SENTRY_ORG}
ENV SENTRY_PROJECT=${SENTRY_PROJECT}

RUN npm run build
RUN npm prune --omit=dev

RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    --mount=type=cache,target=/app/target,sharing=locked \
    cargo build --release -p incident-engine \
 && cargo build --release -p risk-engine \
 && mkdir -p /rust-out \
 && cp target/release/incident-engine /rust-out/ \
 && cp target/release/risk-engine /rust-out/ \
 && rm -rf /root/.rustup/toolchains/*/share

# Minimal runtime
FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ARG CACHEBUST
RUN echo "${CACHEBUST:-unknown}" > /app/.staging_deployed_sha && date -u +"%Y-%m-%dT%H:%M:%SZ" > /app/.staging_deployed_at
ENV SOURCE_COMMIT=${CACHEBUST:-unknown}

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /rust-out/incident-engine /app/bin/incident-engine
COPY --from=build /rust-out/risk-engine /app/bin/risk-engine
COPY --from=build /app/drizzle.config.ts ./
COPY --from=build /app/shared ./shared
COPY --from=build /app/server ./server

RUN chown -R node:node /app

EXPOSE 3001
USER node
CMD ["node", "dist/index.js"]
