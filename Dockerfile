# Single build stage to reduce peak disk usage (avoids parallel Node + Rust builds)
FROM node:20-bookworm-slim AS build

RUN apt-get update -qq && apt-get install -y -qq curl build-essential && rm -rf /var/lib/apt/lists/*

# Install Rust (minimal)
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable --profile minimal
ENV PATH="/root/.cargo/bin:$PATH"

WORKDIR /app
COPY package*.json ./
RUN npm install --include=dev
COPY . .
RUN npm run build
RUN npm prune --omit=dev

RUN cargo build --release -p incident-engine
RUN rm -rf /root/.rustup/toolchains/*/share /app/target/release/build /app/target/release/deps/*.d

# Minimal runtime
FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/target/release/incident-engine /app/bin/incident-engine
COPY --from=build /app/drizzle.config.ts ./
COPY --from=build /app/shared ./shared
COPY --from=build /app/server ./server

EXPOSE 3001
CMD ["node", "dist/index.js"]
