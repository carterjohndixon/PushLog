# Version = semver from agent/VERSION + short git SHA (always know what commit the binary is from).
# Override full string: VERSION=0.2.0+custom make
AGENT_MK := $(abspath $(lastword $(MAKEFILE_LIST)))
AGENT_DIR := $(patsubst %/,%,$(dir $(AGENT_MK)))
REPO_ROOT := $(abspath $(AGENT_DIR)/..)
AGENT_SEMVER := $(shell cat "$(AGENT_DIR)/VERSION" 2>/dev/null | tr -d ' \n\r' | head -c64)
ifeq ($(strip $(AGENT_SEMVER)),)
AGENT_SEMVER := 0.2.0
endif
GIT_COMMIT := $(shell git -C "$(REPO_ROOT)" rev-parse --short HEAD 2>/dev/null || echo unknown)
VERSION ?= $(AGENT_SEMVER)+$(GIT_COMMIT)
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
