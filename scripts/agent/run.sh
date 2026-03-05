#!/bin/bash
set -euo pipefail

TASK_FILE="$1"
ISSUE_NUMBER_FILE="$2"
ISSUE_NUMBER="$(cat "$ISSUE_NUMBER_FILE" 2>/dev/null || echo 0)"
REPO="${GITHUB_REPOSITORY:-}"

post_issue_comment() {
  local comment="$1"
  if [[ "$ISSUE_NUMBER" == "0" ]] || [[ -z "${GITHUB_TOKEN:-}" ]] || [[ -z "$REPO" ]]; then
    return 0
  fi
  local payload
  payload="$(COMMENT_BODY="$comment" python3 - <<'PY'
import json, os
print(json.dumps({"body": os.environ.get("COMMENT_BODY", "")}))
PY
)"
  curl -fsS -X POST \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "https://api.github.com/repos/${REPO}/issues/${ISSUE_NUMBER}/comments" \
    -d "$payload" >/dev/null || true
}

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
if [[ -z "$TASK" ]]; then
  echo "Task file is empty; aborting."
  post_issue_comment "Agent run aborted: task was empty."
  exit 1
fi

if command -v codex >/dev/null 2>&1; then
  codex exec --full-auto "$TASK"
elif command -v claude >/dev/null 2>&1; then
  claude "$TASK"
else
  echo "No agent CLI found."
  post_issue_comment "Agent run failed: no supported CLI found on runner (`codex`/`claude`)."
  exit 1
fi

git add -A
# Never include workflow temp files or machine noise in agent PRs.
git reset -q -- .agent .DS_Store || true

if ! git diff --cached --quiet; then
  git commit -m "$PR_TITLE"
  git push -u origin "$BRANCH"
else
  echo "No changes to commit."
  post_issue_comment "Agent run completed: no code changes were produced."
  exit 0
fi

if [ -z "${GITHUB_TOKEN:-}" ]; then
  echo "GITHUB_TOKEN not set; skipping PR creation."
  post_issue_comment "Agent pushed branch \`${BRANCH}\`, but could not create PR (missing GITHUB_TOKEN)."
  exit 0
fi

API="https://api.github.com/repos/${REPO}/pulls"
BODY="$(cat "$TASK_FILE")"
PAYLOAD="$(PR_TITLE="$PR_TITLE" BRANCH="$BRANCH" BODY="$BODY" python3 - <<'PY'
import json, os
print(json.dumps({
    "title": os.environ["PR_TITLE"],
    "head": os.environ["BRANCH"],
    "base": "main",
    "body": os.environ.get("BODY", ""),
}))
PY
)"

RESPONSE_FILE="$(mktemp)"
HTTP_CODE="$(
  curl -sS -o "${RESPONSE_FILE}" -w "%{http_code}" -X POST \
    -H "Authorization: Bearer ${GITHUB_TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    "${API}" \
    -d "${PAYLOAD}"
)"

if [[ "$HTTP_CODE" -lt 200 || "$HTTP_CODE" -ge 300 ]]; then
  echo "PR creation failed with HTTP ${HTTP_CODE}:"
  cat "${RESPONSE_FILE}"
  post_issue_comment "Agent pushed branch \`${BRANCH}\`, but PR creation failed (HTTP ${HTTP_CODE})."
  exit 1
fi

PR_URL="$(python3 - "${RESPONSE_FILE}" <<'PY'
import json, sys
path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    data = json.load(f)
print(data.get("html_url", ""))
PY
)"

if [[ -z "$PR_URL" ]]; then
  echo "PR creation response missing html_url:"
  cat "${RESPONSE_FILE}"
  post_issue_comment "Agent pushed branch \`${BRANCH}\`, but could not parse PR URL."
  exit 1
fi

echo "Created PR: ${PR_URL}"
post_issue_comment "Agent run complete. Opened PR: ${PR_URL}"
