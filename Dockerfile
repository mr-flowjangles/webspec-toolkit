# Angular Automated Testing — runtime image
#
# This is a stub. Pick a base image and runtime layout for your stack
# during M0 of docs/07-build-plan.md. Multi-stage builds keep the runtime image small.
#
# Reference patterns:
#
#   Python (CLI tool, like fhir-abstraction-tool):
#     FROM python:3.12-slim AS build
#     WORKDIR /app
#     COPY pyproject.toml .
#     COPY src/ ./src/
#     RUN pip install --no-cache-dir .
#
#     FROM python:3.12-slim
#     COPY --from=build /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
#     COPY --from=build /usr/local/bin/angular-automated-testing /usr/local/bin/angular-automated-testing
#     ENTRYPOINT ["angular-automated-testing"]
#     CMD ["--help"]
#
#   Node (Next.js standalone output):
#     FROM node:20-alpine AS build
#     WORKDIR /app
#     COPY package*.json ./
#     RUN npm ci
#     COPY . .
#     RUN npm run build
#
#     FROM node:20-alpine
#     WORKDIR /app
#     COPY --from=build /app/.next/standalone ./
#     COPY --from=build /app/.next/static ./.next/static
#     COPY --from=build /app/public ./public
#     EXPOSE 3000
#     CMD ["node", "server.js"]
#
# Replace this comment block with your real Dockerfile in M0.

FROM alpine:3.20
LABEL org.opencontainers.image.title="Angular Automated Testing"
LABEL org.opencontainers.image.description="An LLM-powered toolkit that generates Angular unit tests and runs Section 508 / WCAG audits — shared core with VS Code and Chrome extensions on top, reusable across Bellese projects."
RUN echo "Replace this stub Dockerfile with a real one in M0."
CMD ["echo", "angular-automated-testing: replace the Dockerfile stub before running."]
