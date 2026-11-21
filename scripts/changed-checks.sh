#!/usr/bin/env bash
# The checks a change needs (developer, 2026-11-21): lint its files, type
# check, run only the tests related to its files, and name the slow checks it
# needs. A documents-only change runs nothing. The full suite and the build
# run in Verify on push, and everything runs once before the milestone's pull
# request into main.
#
# Usage: scripts/changed-checks.sh [BASE]   (BASE defaults to HEAD: the
# uncommitted changes; pass the commit a piece started from to cover its commits)
set -euo pipefail
base="${1:-HEAD}"

mapfile -t files < <(
  {
    git diff --name-only --diff-filter=d "$base"
    git ls-files --others --exclude-standard
  } | sort -u
)
if [ ${#files[@]} -eq 0 ]; then
  echo "No changes since $base."
  exit 0
fi
# A fresh checkout has no generated database client; the type check needs it.
[ -d src/generated/prisma ] || npx prisma generate >/dev/null
matching() { printf '%s\n' "${files[@]}" | grep -E "$1" || true; }

code=$(matching '.' | grep -vE '(^docs/|\.md$)' || true)
if [ -z "$code" ]; then
  echo "Documents only: nothing to run."
  exit 0
fi

whole=$(matching '^(package(-lock)?\.json|tsconfig[^/]*\.json|eslint\.config\.|eslint-suppressions\.json|next\.config\.|vitest\.config\.|service-map\.json|prisma/schema\.prisma)')
if [ -n "$whole" ]; then
  echo "== Project-wide files changed; running everything:"
  echo "$whole"
  npx prisma generate >/dev/null
  npm run lint
  npm run typecheck
  npm run test
  npm run build
else
  lintable=$(matching '\.(ts|tsx|js|mjs|cjs)$')
  if [ -n "$lintable" ]; then
    echo "== Lint (changed files)"
    # shellcheck disable=SC2086
    npx eslint $lintable
  fi
  echo "== Type check"
  npm run typecheck
  related=$(matching '^(src|scripts|qa|e2e)/.*\.(ts|tsx)$')
  if [ -n "$related" ]; then
    echo "== Tests related to the changed files"
    # shellcheck disable=SC2086
    npx vitest related --run --passWithNoTests $related
  fi
fi

echo "== Slow checks this change needs"
needs=0
if [ -n "$(matching '^(src/(features|use-cases|lib)/|prisma/|scripts/sample-travellers/)')" ]; then
  echo "- Sample travellers: npm run quality:samples (planning logic changed)"
  needs=1
fi
if [ -n "$(matching '^(src/(app|components|use-cases)/|src/proxy\.ts|scripts/design-checks/|e2e/)|\.css$')" ]; then
  echo "- Design checks in Chromium: DESIGN_BROWSERS=Chromium npm run quality:design (pages, components, routes or use cases changed)"
  echo "- Browser tests: the local @critical run (qa/cli/run-e2e.ts critical)"
  needs=1
fi
if [ -n "$(matching '^prisma/migrations/')" ]; then
  echo "- A migration changed: apply it to the development database (see AGENTS.md)"
  needs=1
fi
[ "$needs" -eq 0 ] && echo "- None."
exit 0
