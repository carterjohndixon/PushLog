# syntax=docker/dockerfile:1
# Single build stage to reduce peak disk usage (avoids parallel Node + Rust builds)
FROM node:20-bookworm-slim AS build

# Default matches `node:*-bookworm-slim` PATH. We intentionally do **not** write
# `ENV PATH="/root/.cargo/bin:$PATH"` because Docker may expand `$PATH` from the
# **host** running `docker build` (sometimes empty), not from this image — then
# `cc`/`gcc` disappear and `cargo`/rustc fail with exit 127.
ARG NODE_IMAGE_PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# ca-certificates: curl needs /etc/ssl/certs for https://rustup.rs (else curl exit 77).
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends ca-certificates curl build-essential && rm -rf /var/lib/apt/lists/*

# Install Rust outside $HOME/.cargo. BuildKit cache mounts on ~/.cargo/registry|git can hide
# ~/.cargo/bin on some builders, which yields: /root/.cargo/bin/cargo: not found.
ENV RUSTUP_HOME=/opt/rustup
ENV CARGO_HOME=/opt/cargo
# Verify install so this layer cannot be "successfully" cached from an older layout (~/.cargo only).
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal \
 && test -x "${CARGO_HOME}/bin/cargo" \
 && "${CARGO_HOME}/bin/cargo" --version
ENV PATH="${CARGO_HOME}/bin:${NODE_IMAGE_PATH}"

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

ARG VITE_IS_PAYING_ENABLED
ENV VITE_IS_PAYING_ENABLED=${VITE_IS_PAYING_ENABLED}

RUN npm run build
RUN npm prune --omit=dev

# Cache registry/git + target only (matches CARGO_HOME). Mounts must not cover ${CARGO_HOME}/bin.
# Use one env PATH + sh -c so every cargo/cc sees the same PATH (env X a && b only sets PATH for a).
RUN --mount=type=cache,target=/opt/cargo/registry,sharing=locked \
    --mount=type=cache,target=/opt/cargo/git,sharing=locked \
    --mount=type=cache,target=/app/target,sharing=locked \
    env PATH="${CARGO_HOME}/bin:${NODE_IMAGE_PATH}" \
    sh -eu -c "cargo --version \
 && command -v cc \
 && command -v gcc \
 && cargo build --release -p incident-engine \
 && cargo build --release -p risk-engine \
 && mkdir -p /rust-out \
 && cp target/release/incident-engine /rust-out/ \
 && cp target/release/risk-engine /rust-out/ \
 && rm -rf /opt/rustup/toolchains/*/share"

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
