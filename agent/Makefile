# Exact tag when on a tag with no extra commits/dirty; otherwise git describe. Override: VERSION=v0.1.0 make
VERSION ?= $(shell git describe --tags --exact-match 2>/dev/null || git describe --tags --always --dirty 2>/dev/null || echo dev)
LDFLAGS := -s -w -X main.version=$(VERSION)
BINARY  := pushlog-agent
GOFLAGS := -trimpath

.PHONY: all clean linux-amd64 linux-arm64

all: linux-amd64 linux-arm64

linux-amd64:
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build $(GOFLAGS) -ldflags '$(LDFLAGS)' -o dist/$(BINARY)-linux-amd64 ./cmd

linux-arm64:
	CGO_ENABLED=0 GOOS=linux GOARCH=arm64 go build $(GOFLAGS) -ldflags '$(LDFLAGS)' -o dist/$(BINARY)-linux-arm64 ./cmd

clean:
	rm -rf dist/
