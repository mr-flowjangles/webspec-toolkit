#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# new-version.sh — Start a new version
#
# Folder convention (one file per minor):
#   Versions/v{major}/v{major}.{minor}/release-notes.md
#
# Each minor file is a stacked changelog with newest-at-top:
#   # v{major}.{minor}
#
#   ## v{major}.{minor}.{patch} — Title (YYYY-MM-DD)
#   ### Problem / ### Solution / …
#
# What this script does:
#   1. Creates a git branch: V{major}dot{minor}dot{patch}/{Description}
#   2. Patch bump → prepends a new H2 stub at the top of the existing minor
#      file (just under the H1).
#   3. Minor or major bump → creates a new
#      Versions/v{major}/v{major}.{minor}/release-notes.md with the H1 + the
#      first H2 stub. Major bump also creates the parent v{major}/ folder.
#
# Usage:
#   ./scripts/new-version.sh                          # patch bump (interactive)
#   ./scripts/new-version.sh "My Feature"             # patch bump
#   ./scripts/new-version.sh --minor "My Feature"     # minor bump (resets patch)
#   ./scripts/new-version.sh --major "My Feature"     # major bump (resets minor+patch)
#   ./scripts/new-version.sh --dry-run "My Feature"   # print plan, change nothing
# ─────────────────────────────────────────────────────────────
set -euo pipefail

VERSIONS_DIR="Versions"
BUMP="patch"
DRY_RUN=0

# ── Parse flags ──
while [[ "${1:-}" == --* ]]; do
  case "$1" in
    --minor)   BUMP="minor"; shift ;;
    --major)   BUMP="major"; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    *) echo "Unknown flag: $1"; exit 1 ;;
  esac
done

# ── Refuse to run on a dirty working tree (skipped under --dry-run) ──
if [ "$DRY_RUN" -eq 0 ]; then
  if ! git diff-index --quiet HEAD -- 2>/dev/null; then
    echo "Working tree has uncommitted changes to tracked files."
    echo "Commit or stash first, or re-run with --dry-run to preview."
    exit 1
  fi
fi

# ── Find latest version by scanning H2 headings across minor files ──
# Each line of the form `## v{major}.{minor}.{patch} — …` in any
# Versions/v*/v*/release-notes.md is a shipped version. Pick the max.
# Skip lines inside fenced code blocks — release notes often embed example
# version strings in ``` … ``` to document the convention itself, and those
# aren't real shipped versions.
latest=$(
  awk '
    FNR == 1 { in_fence = 0 }
    /^```/ { in_fence = !in_fence; next }
    !in_fence && /^## v[0-9]+\.[0-9]+\.[0-9]+/ { print }
  ' "$VERSIONS_DIR"/v*/v*/release-notes.md 2>/dev/null \
    | sed -E 's/^## v([0-9]+\.[0-9]+\.[0-9]+).*/\1/' \
    | sort -t. -k1,1n -k2,2n -k3,3n \
    | tail -1
)

if [ -z "$latest" ]; then
  echo "No existing versions found under $VERSIONS_DIR/v*/v*/release-notes.md"
  exit 1
fi

# ── Bump version ──
IFS='.' read -r major minor patch <<< "$latest"

case "$BUMP" in
  patch) next_major=$major;          next_minor=$minor;          next_patch=$((patch + 1)) ;;
  minor) next_major=$major;          next_minor=$((minor + 1));  next_patch=0 ;;
  major) next_major=$((major + 1));  next_minor=0;               next_patch=0 ;;
esac

next_version="${next_major}.${next_minor}.${next_patch}"

echo "Latest version: v${latest}"
echo "Next version:   v${next_version} (${BUMP} bump)"
echo ""

# ── Get description ──
if [ -n "${1:-}" ]; then
  description="$1"
else
  read -rp "Description (e.g. 'Add Widget Support'): " description
fi

if [ -z "$description" ]; then
  echo "Description is required."
  exit 1
fi

# ── Compute targets ──
branch_suffix=$(echo "$description" | sed 's/ /_/g')
branch_name="V${next_major}dot${next_minor}dot${next_patch}/${branch_suffix}"
minor_dir="${VERSIONS_DIR}/v${next_major}/v${next_major}.${next_minor}"
notes_file="${minor_dir}/release-notes.md"
today=$(date +%Y-%m-%d)

# ── Decide action: create the minor file, or prepend to it ──
if [ "$BUMP" = "patch" ] && [ -f "$notes_file" ]; then
  action="prepend"
else
  action="create"
fi

# ── Dry-run: print plan and exit ──
if [ "$DRY_RUN" -eq 1 ]; then
  echo "[dry-run] Would create branch: $branch_name"
  if [ "$action" = "create" ]; then
    echo "[dry-run] Would create file:   $notes_file"
  else
    echo "[dry-run] Would prepend a new H2 stub to: $notes_file"
  fi
  exit 0
fi

# ── Create branch ──
echo "Creating branch: $branch_name"
git checkout -b "$branch_name"

# ── Stub content for the new patch (used by both actions) ──
stub=$(cat <<EOF
## v${next_version} — ${description} (${today})

<!-- TODO: Fill in after implementation -->

### Problem

### Solution

### New

### Changed

### Fixed

### Files Changed

| File | Change |
|------|--------|
EOF
)

if [ "$action" = "create" ]; then
  mkdir -p "$minor_dir"
  {
    echo "# v${next_major}.${next_minor}"
    echo
    echo "$stub"
  } > "$notes_file"
  echo "Created $notes_file"
else
  # Prepend the new H2 stub just below the existing H1.
  # The file always starts `# v{major}.{minor}\n\n## v… (first entry)\n…`.
  # We splice the file at the first H2 line: everything before stays, then the
  # new stub, then everything from the first H2 onward. Done with shell + grep
  # instead of `awk -v stub="$stub"` because BSD awk on macOS rejects
  # multi-line `-v` values with `awk: newline in string`.
  first_h2_line=$(grep -n -E '^## v[0-9]+\.[0-9]+\.[0-9]+' "$notes_file" | head -1 | cut -d: -f1)
  if [ -z "$first_h2_line" ]; then
    echo "No existing H2 heading found in $notes_file; cannot prepend." >&2
    exit 1
  fi
  tmp=$(mktemp)
  head -n "$((first_h2_line - 1))" "$notes_file" > "$tmp"
  printf '%s\n\n' "$stub" >> "$tmp"
  tail -n "+${first_h2_line}" "$notes_file" >> "$tmp"
  mv "$tmp" "$notes_file"
  echo "Prepended new H2 stub to $notes_file"
fi

echo ""
echo "Ready to go:"
echo "  Branch:  $branch_name"
echo "  Notes:   $notes_file"
