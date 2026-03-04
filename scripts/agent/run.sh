#!/bin/bash
set -euo pipefail

TASK_FILE="$1"
ISSUE_NUMBER_FILE="$2"
ISSUE_NUMBER="$(cat "$ISSUE_NUMBER_FILE" 2>/dev/null || echo 0)"

git config user.email "actions-runner@local"
git config user.name "Actions Runner"

TS="$(date +%Y%m%d-%H%M%S)"
if [[ "$ISSUE_NUMBER" != "0" ]]; then
  BRANCH="agent/issue-${ISSUE_NUMBER}-${TS}"
  PR_TITLE="Agent: issue #${ISSUE_NUMBER}"
else
  BRANCH="agent/manual-${TS}"
  PR_TITLE="Agent: manual run ${TS}"
fi

git checkout -b "$BRANCH"

echo "=== TASK ==="
cat "$TASK_FILE"

TASK="$(cat "$TASK_FILE")"

if command -v codex >/dev/null 2>&1; then
  codex exec --full-auto "$TASK"
elif command -v claude >/dev/null 2>&1; then
  claude "$TASK"
else
  echo "No agent CLI found."
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  git add -A
  git commit -m "$PR_TITLE"
  git push -u origin "$BRANCH"
else
  echo "No changes to commit."
  exit 0
fi

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "GITHUB_TOKEN not set; skipping PR creation."
  exit 0
fi

REPO="${GITHUB_REPOSITORY}"
API="https://api.github.com/repos/${REPO}/pulls"

BODY="$(cat "$TASK_FILE")"

curl -sS -X POST \
  -H "Authorization: Bearer ${GITHUB_TOKEN}" \
  -H "Accept: application/vnd.github+json" \
  "${API}" \
  -d "$(printf '{"title":"%s","head":"%s","base":"main","body":"%s"}' \
      "$(printf '%s' "$PR_TITLE" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read())[1:-1])')" \
      "$(printf '%s' "$BRANCH"   | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read())[1:-1])')" \
      "$(printf '%s' "$BODY"     | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read())[1:-1])')" \
    )"