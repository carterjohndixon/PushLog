FROM node:20-bookworm-slim AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM rust:1-bookworm AS rust-build

WORKDIR /app
COPY . .
RUN cargo build --release -p incident-engine

FROM node:20-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/package*.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=rust-build /app/target/release/incident-engine /app/bin/incident-engine

EXPOSE 3001
CMD ["node", "dist/index.js"]