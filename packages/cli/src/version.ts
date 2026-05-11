/**
 * CLI version constant. Stamped into `Analysis.meta.toolVersion` so downstream
 * consumers can correlate output back to the CLI build that produced it.
 *
 * Update with each release. Yes, this is duplicative with the version in the
 * `Versions/` folder and the release notes — when we have more than one place
 * to update, we'll automate the bump via `new-version.sh`. For now: manual.
 */
export const CLI_VERSION = '0.3.5';
