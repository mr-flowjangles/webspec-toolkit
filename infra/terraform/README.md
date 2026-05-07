# Terraform — AWS deployment

This folder is the home for Terraform modules that deploy Angular Automated Testing to AWS. Currently empty — modules are defined when deployment becomes real (typically a late milestone in `docs/07-build-plan.md`).

When you're ready:

1. Pin a Terraform version (`required_version` in a top-level `versions.tf`).
2. Pin AWS provider version.
3. Use a remote backend (S3 + DynamoDB lock) — never local state for shared infra.
4. One module per logical layer (network, app, data, observability).
5. Reference the Docker image built by `make image` (typically pushed to ECR).

See your project's deployment doc (likely `docs/06-deployment.md`) for the runtime topology this folder needs to produce.
