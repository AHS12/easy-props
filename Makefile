# Common tasks. Run `make` to list them.

FRONTEND := frontend

# Vitest and Vite need a newer Node than 20.18, so tests fetch and use their own.
VITEST := cd $(FRONTEND) && pnpm dlx node@22 node_modules/vitest/vitest.mjs

DIST := build/dist

ifeq ($(OS),Windows_NT)
    # From PowerShell or cmd there is no Unix shell or rm, mkdir and cp, so use Git's.
    SHELL := C:/Program Files/Git/bin/bash.exe
    export PATH := C:\Program Files\Git\usr\bin;$(PATH)
    APP := bin/easy-props.exe
else
    APP := bin/easy-props.app/Contents/MacOS/easy-props
endif

# The version lives in build/config.yml, as `version: "x.y.z"` under info. It's read
# after PATH is set above, because PowerShell has no sed.
VERSION := $(shell sed -n 's/^  version: "\([^"]*\)".*/\1/p' build/config.yml)

.DEFAULT_GOAL := help

.PHONY: help install hooks dev web previews build build-frontend build-check installer mac dmg release run test test-go test-frontend test-watch typecheck lint lint-go lint-frontend check clean

help: ## List the tasks
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-16s %s\n", $$1, $$2}'

install: hooks ## Install the frontend packages and the git hooks
	pnpm --dir $(FRONTEND) install

hooks: ## Run the checks in .githooks before each commit and push
	git config core.hooksPath .githooks

dev: ## Run the desktop app with hot reload
	wails3 dev -config ./build/config.yml

web: ## Run only the frontend, in a browser
	pnpm --dir $(FRONTEND) dev

previews: ## Draw every preset's picture again. Stop it when the page says Done
	pnpm --dir $(FRONTEND) dev --open /draw-previews.html

build: ## Build the desktop app into bin
	wails3 build

build-frontend: ## Type-check and bundle only the frontend
	pnpm --dir $(FRONTEND) build

# NSIS does not add itself to PATH when it installs, so the recipe adds it.
installer: ## Build the Windows installer into build/dist (Windows, needs NSIS)
	PATH="/c/Program Files (x86)/NSIS:$$PATH" wails3 task windows:package
	mkdir -p $(DIST)
	cp bin/easy-props-amd64-installer.exe $(DIST)/easy-props-$(VERSION)-windows-amd64-setup.exe
	@echo Created $(DIST)/easy-props-$(VERSION)-windows-amd64-setup.exe

mac: ## Build the universal Mac app into bin, signed for this Mac only (Mac only)
	wails3 task darwin:package:universal

dmg: mac ## Build the Mac disk image and update zip into build/dist (Mac only)
	./build/darwin/make_dmg.sh $(VERSION)
	ditto -c -k --norsrc --noextattr --noqtn --keepParent bin/easy-props.app $(DIST)/easy-props-$(VERSION)-mac-universal.zip

release: ## Build the installers this computer can make, and skip the rest
ifeq ($(OS),Windows_NT)
	$(MAKE) installer
	@echo Skipped the Mac DMG: it can only be built on a Mac.
else ifeq ($(shell uname -s),Darwin)
	$(MAKE) dmg
	@echo Skipped the Windows installer: it is only built on Windows.
else
	@echo Skipped the Windows installer and the Mac DMG: they need Windows and a Mac.
endif

run: build ## Build the desktop app and open it
	./$(APP)

test: test-go test-frontend ## Run every test

test-go: ## Run the Go tests
	go test ./backend/

test-frontend: ## Run the frontend tests
	$(VITEST) run

test-watch: ## Run the frontend tests on every change
	$(VITEST)

typecheck: ## Check the TypeScript types
	pnpm --dir $(FRONTEND) typecheck

lint: typecheck lint-frontend lint-go ## Run every lint

lint-frontend: ## Lint the frontend
	pnpm --dir $(FRONTEND) lint

# The Go code embeds the frontend, so it won't compile until that has been built once.
lint-go: $(FRONTEND)/dist/index.html ## Lint the Go code (needs golangci-lint)
	@command -v golangci-lint >/dev/null || { echo "Install golangci-lint: https://golangci-lint.run/"; exit 1; }
	golangci-lint run ./...

$(FRONTEND)/dist/index.html:
	pnpm --dir $(FRONTEND) build

build-check: build-frontend ## Check that the frontend and the Go code build
	go build -tags production ./...

check: lint test build-check ## Run every lint, test and build check

clean: ## Delete build output
	rm -rf bin $(DIST) $(FRONTEND)/dist
