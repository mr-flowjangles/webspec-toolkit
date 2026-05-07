# angular-automated-testing — dev convenience targets.
#
# Run `make` with no args (or `make help`) to list everything.
# Targets that produce no files are .PHONY so make doesn't try to track them.

.DEFAULT_GOAL := help
.PHONY: help setup test lint format ci image smoke clean version version-minor version-major

# ---------------------------------------------------------------------------
# Help
# ---------------------------------------------------------------------------
help: ## Show this help (default target)
	@echo "angular-automated-testing — make targets:"
	@echo ""
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z][a-zA-Z0-9_-]*:.*?## / { printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2 }' $(MAKEFILE_LIST)
	@echo ""
	@echo "Versioning (also see CLAUDE.md → Versioning):"
	@echo "  \033[36mversion-M<n>\033[0m   Start the next minor version for milestone M<n> (e.g. make version-M1)."
	@echo "                 Title auto-resolved from docs/07-build-plan.md."
	@echo "  \033[36mversion-minor\033[0m  Start a minor version with a custom title (DESC=\"...\" required)"
	@echo "  \033[36mversion-major\033[0m  Start a major version with a custom title (DESC=\"...\" required)"
	@echo "  \033[36mversion\033[0m        Start a patch version. Pass DESC=\"...\" or the script will prompt."
	@echo ""

# ---------------------------------------------------------------------------
# Local dev environment
# ---------------------------------------------------------------------------
# TODO: replace these stubs with your language's commands.
# Examples:
#   Python: $(PIP) install -e ".[dev]"   |   $(PYTEST) tests/   |   $(RUFF) check src/ tests/
#   Node:   npm install                  |   npm test           |   npm run lint
setup: ## Install dependencies (TODO: wire to your toolchain)
	@echo "TODO: define setup for your stack (e.g. 'npm install' or 'pip install -e \".[dev]\"')"
	@exit 1

# ---------------------------------------------------------------------------
# Quality
# ---------------------------------------------------------------------------
test: ## Run tests (TODO: wire to your toolchain)
	@echo "TODO: define test command (e.g. 'npm test' or 'pytest')"
	@exit 1

lint: ## Run linter (TODO: wire to your toolchain)
	@echo "TODO: define lint command (e.g. 'npm run lint' or 'ruff check src/ tests/')"
	@exit 1

format: ## Apply formatter (TODO: wire to your toolchain)
	@echo "TODO: define format command (e.g. 'npm run format' or 'ruff format src/ tests/')"
	@exit 1

ci: lint test ## Lint + test, suitable for CI gating

# ---------------------------------------------------------------------------
# Docker image
# ---------------------------------------------------------------------------
image: ## Build the runtime Docker image
	docker build -t bellese/angular-automated-testing:dev .

smoke: ## Smoke-test the built image (override CMD as appropriate for your tool)
	docker run --rm bellese/angular-automated-testing:dev --help

# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------
clean: ## Remove caches and build artifacts (extend per language)
	rm -rf .pytest_cache .ruff_cache .mypy_cache build dist node_modules/.cache .next
	find . -type d -name __pycache__ -prune -exec rm -rf {} + 2>/dev/null || true
	@echo "Cleaned."

# ---------------------------------------------------------------------------
# Versioning (see CLAUDE.md → Versioning + scripts/new-version.sh)
#
# Branch + Versions/v<M>/v<M>.<m>.<p>/release-notes.md ceremony.
# Refuses to run if the working tree is dirty.
# ---------------------------------------------------------------------------

# DRYRUN=1 forwards --dry-run to the script — preview without side effects.
DRYRUN_FLAG := $(if $(DRYRUN),--dry-run,)

# Milestone shortcut: minor bump, title auto-resolved from docs/07-build-plan.md.
# Usage:    make version-M1
# Preview:  make version-M1 DRYRUN=1
version-M%:
	@m="M$*"; \
	desc=$$(awk -v m="$$m" '$$0 ~ "^## "m" — " { sub("^## "m" — ", ""); print; exit }' docs/07-build-plan.md); \
	if [ -z "$$desc" ]; then \
	  echo "Milestone $$m not found as a heading in docs/07-build-plan.md"; \
	  exit 1; \
	fi; \
	echo "Resolved $$m → $$desc"; \
	./scripts/new-version.sh $(DRYRUN_FLAG) --minor "$$desc"

# Generic minor bump with custom title.
version-minor:
	@if [ -z "$(DESC)" ]; then \
	  echo "Usage: make version-minor DESC=\"Short Description\" [DRYRUN=1]"; exit 1; \
	fi
	./scripts/new-version.sh $(DRYRUN_FLAG) --minor "$(DESC)"

# Generic major bump with custom title. Reserved for v1.0.0 etc.
version-major:
	@if [ -z "$(DESC)" ]; then \
	  echo "Usage: make version-major DESC=\"Short Description\" [DRYRUN=1]"; exit 1; \
	fi
	./scripts/new-version.sh $(DRYRUN_FLAG) --major "$(DESC)"

# Patch bump. Pass DESC=... or let the script prompt interactively.
version:
	@if [ -n "$(DESC)" ]; then \
	  ./scripts/new-version.sh $(DRYRUN_FLAG) "$(DESC)"; \
	else \
	  ./scripts/new-version.sh $(DRYRUN_FLAG); \
	fi
