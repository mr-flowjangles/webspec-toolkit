# Angular Automated Testing — CLI runtime image (Node 20)
# Multi-stage build:
#   1. build stage installs deps, compiles the workspace with tsc -b
#   2. runtime stage is slim: only Node + the built workspace + symlinked deps
#
# At M0 the CLI is a stub (`webspec --help` prints the roadmap). Real
# `gen` / `audit` commands wire up in M3 / M4.

# ---- build stage --------------------------------------------------------
FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /app

# Copy manifests first so dependency graph plans cache-friendly.
COPY pnpm-workspace.yaml package.json tsconfig.base.json tsconfig.json ./
COPY packages/core/package.json packages/core/
COPY packages/config/package.json packages/config/
COPY packages/cli/package.json packages/cli/
COPY packages/vscode-extension/package.json packages/vscode-extension/
COPY packages/chrome-extension/package.json packages/chrome-extension/

RUN pnpm install --frozen-lockfile=false

# Now copy source and build all packages via project references.
COPY packages ./packages
RUN pnpm build

# ---- runtime stage ------------------------------------------------------
FROM node:20-alpine
LABEL org.opencontainers.image.title="Angular Automated Testing"
LABEL org.opencontainers.image.description="An LLM-powered toolkit that generates Angular unit tests and runs Section 508 / WCAG audits — shared core with VS Code and Chrome extensions on top."
WORKDIR /app

COPY --from=build /app/packages ./packages
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json /app/pnpm-workspace.yaml ./

ENTRYPOINT ["node", "/app/packages/cli/dist/index.js"]
CMD ["--help"]
