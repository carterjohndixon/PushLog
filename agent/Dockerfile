FROM golang:1.25-alpine AS build

WORKDIR /src

COPY agent/go.mod agent/go.sum ./
RUN go mod download

COPY agent/ ./
# Embed commit in the binary; set when building: GIT_COMMIT=$(git rev-parse --short HEAD)
ARG GIT_COMMIT=unknown
RUN SEMVER="$$(tr -d ' \n\r' < VERSION 2>/dev/null | head -c64)"; \
    if [ -z "$$SEMVER" ]; then SEMVER=0.2.0; fi; \
    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -trimpath \
      -ldflags="-s -w -X main.version=$$SEMVER+${GIT_COMMIT}" \
      -o /out/pushlog-agent ./cmd

FROM alpine:3.21 AS runtime

# docker-cli: required for `type: docker` sources (`docker logs -f`). Socket mounted at runtime from compose.
RUN apk add --no-cache docker-cli \
  && addgroup -S pushlog && adduser -S -G pushlog pushlog \
  && mkdir -p /etc/pushlog-agent /var/lib/pushlog-agent/spool \
  && chown -R pushlog:pushlog /etc/pushlog-agent /var/lib/pushlog-agent

COPY --from=build /out/pushlog-agent /usr/local/bin/pushlog-agent

USER pushlog
WORKDIR /home/pushlog

ENTRYPOINT ["pushlog-agent"]
CMD ["run", "--config", "/etc/pushlog-agent/config.yaml"]
