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

if command -v codex >/dev/null 2>&1; then
  codex exec --full-auto --prompt-file "$TASK_FILE"
elif command -v claude >/dev/null 2>&1; then
  claude --prompt-file "$TASK_FILE"
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

if command -v gh >/dev/null 2>&1; then
  gh pr create --title "$PR_TITLE" --body "$(cat "$TASK_FILE")"
else
  echo "Install GitHub CLI: brew install gh"
  exit 1
fi