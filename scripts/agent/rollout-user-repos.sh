#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Roll out this repo's agent automation setup to other repositories in a GitHub User account.

Usage:
  scripts/agent/rollout-user-repos.sh [options]

Required target selection (choose one):
  --all                     Apply to all repos for --owner
  --repos "r1,r2,owner/r3" Apply only selected repos (comma-separated)

Options:
  --owner <login>           GitHub owner (default: current gh user)
  --base-branch <name>      Base branch to target (default: each repo default branch)
  --branch-prefix <prefix>  Branch prefix for rollout branches
                            (default: codex/rollout-agent-automation)
  --trusted-users <list>    Value for AGENT_TRUSTED_USERS variable
                            (default: owner login)
  --max-changed-files <n>   Value for AGENT_MAX_CHANGED_FILES variable (default: 20)
  --no-vars                 Do not set repository Actions variables
  --execute                 Perform clone/copy/commit/push/PR + variable set
                            (default: dry-run only; prints planned actions)
  --help                    Show this help

Examples:
  # Dry-run for all repos in your user account
  scripts/agent/rollout-user-repos.sh --all

  # Apply to two repos and actually open PRs
  scripts/agent/rollout-user-repos.sh \
    --repos "fitness-tracker,uk-earnings" \
    --execute

  # Apply to all repos with custom trusted users
  scripts/agent/rollout-user-repos.sh \
    --all \
    --trusted-users "kncube-stack,another-trusted-user" \
    --max-changed-files 25 \
    --execute
USAGE
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

owner_from_gh() {
  gh api user --jq .login
}

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd)"

SOURCE_FILES=(
  ".github/workflows/agent.yml"
  ".github/workflows/ci.yml"
  ".github/ISSUE_TEMPLATE/agent-task.yml"
  "scripts/agent/run.sh"
)

OWNER=""
REPOS_CSV=""
APPLY_ALL=0
EXECUTE=0
SET_VARS=1
BASE_BRANCH_OVERRIDE=""
BRANCH_PREFIX="codex/rollout-agent-automation"
TRUSTED_USERS=""
MAX_CHANGED_FILES="20"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --owner)
      OWNER="${2:-}"
      shift 2
      ;;
    --repos)
      REPOS_CSV="${2:-}"
      shift 2
      ;;
    --all)
      APPLY_ALL=1
      shift
      ;;
    --execute)
      EXECUTE=1
      shift
      ;;
    --no-vars)
      SET_VARS=0
      shift
      ;;
    --base-branch)
      BASE_BRANCH_OVERRIDE="${2:-}"
      shift 2
      ;;
    --branch-prefix)
      BRANCH_PREFIX="${2:-}"
      shift 2
      ;;
    --trusted-users)
      TRUSTED_USERS="${2:-}"
      shift 2
      ;;
    --max-changed-files)
      MAX_CHANGED_FILES="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

require_cmd gh
require_cmd git

if ! gh auth status >/dev/null 2>&1; then
  echo "GitHub CLI is not authenticated. Run: gh auth login" >&2
  exit 1
fi

if [[ -z "$OWNER" ]]; then
  OWNER="$(owner_from_gh)"
fi
if [[ -z "$TRUSTED_USERS" ]]; then
  TRUSTED_USERS="$OWNER"
fi
if ! [[ "$MAX_CHANGED_FILES" =~ ^[0-9]+$ ]]; then
  echo "--max-changed-files must be a number." >&2
  exit 1
fi

if [[ "$APPLY_ALL" -eq 1 && -n "$REPOS_CSV" ]]; then
  echo "Use either --all or --repos, not both." >&2
  exit 1
fi
if [[ "$APPLY_ALL" -eq 0 && -z "$REPOS_CSV" ]]; then
  echo "You must choose --all or --repos." >&2
  exit 1
fi

for file in "${SOURCE_FILES[@]}"; do
  if [[ ! -f "$SOURCE_ROOT/$file" ]]; then
    echo "Missing source file in this repo: $file" >&2
    exit 1
  fi
done

FULL_REPOS=()
if [[ "$APPLY_ALL" -eq 1 ]]; then
  mapfile -t names < <(gh repo list "$OWNER" --limit 200 --json name --jq '.[].name')
  for name in "${names[@]}"; do
    [[ -n "$name" ]] && FULL_REPOS+=("${OWNER}/${name}")
  done
else
  IFS=',' read -r -a selected <<< "$REPOS_CSV"
  for raw in "${selected[@]}"; do
    entry="$(trim "$raw")"
    [[ -z "$entry" ]] && continue
    if [[ "$entry" == */* ]]; then
      FULL_REPOS+=("$entry")
    else
      FULL_REPOS+=("${OWNER}/${entry}")
    fi
  done
fi

if [[ "${#FULL_REPOS[@]}" -eq 0 ]]; then
  echo "No repositories resolved." >&2
  exit 1
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/agent-rollout-${TIMESTAMP}-XXXX")"

CREATED_PRS=()
PLANNED_PRS=()
NO_CHANGES=()
FAILED_REPOS=()

rollout_repo() {
  local slug="$1"
  local repo_name="${slug##*/}"
  local clone_dir="${WORKDIR}/${slug//\//__}"

  echo ""
  echo "---- ${slug} ----"

  local default_branch
  default_branch="$(gh repo view "$slug" --json defaultBranchRef --jq '.defaultBranchRef.name')"
  local base_branch="${BASE_BRANCH_OVERRIDE:-$default_branch}"
  local branch_name="${BRANCH_PREFIX}-${repo_name}-${TIMESTAMP}"

  if [[ "$EXECUTE" -eq 0 ]]; then
    echo "[dry-run] Would clone ${slug}"
    echo "[dry-run] Would copy files:"
    for file in "${SOURCE_FILES[@]}"; do
      echo "  - ${file}"
    done
    if [[ "$SET_VARS" -eq 1 ]]; then
      echo "[dry-run] Would set variables:"
      echo "  - AGENT_TRUSTED_USERS=${TRUSTED_USERS}"
      echo "  - AGENT_MAX_CHANGED_FILES=${MAX_CHANGED_FILES}"
    fi
    echo "[dry-run] Would push branch ${branch_name} and open PR -> ${base_branch}"
    PLANNED_PRS+=("${slug}: ${branch_name}")
    return 0
  fi

  gh repo clone "$slug" "$clone_dir" -- --quiet
  cd "$clone_dir"

  git checkout "$base_branch" >/dev/null 2>&1 || git checkout -b "$base_branch" "origin/$base_branch"
  git pull --ff-only origin "$base_branch"
  git checkout -b "$branch_name"

  for file in "${SOURCE_FILES[@]}"; do
    mkdir -p "$(dirname "$file")"
    cp "$SOURCE_ROOT/$file" "$file"
  done
  chmod +x scripts/agent/run.sh

  git add "${SOURCE_FILES[@]}"

  if [[ "$SET_VARS" -eq 1 ]]; then
    gh variable set AGENT_TRUSTED_USERS -R "$slug" --body "$TRUSTED_USERS"
    gh variable set AGENT_MAX_CHANGED_FILES -R "$slug" --body "$MAX_CHANGED_FILES"
  fi

  if git diff --cached --quiet; then
    echo "No file changes needed."
    NO_CHANGES+=("$slug")
    return 0
  fi

  git commit -m "Standardize agent automation setup"
  git push -u origin "$branch_name"

  local pr_url
  pr_url="$(gh pr create -R "$slug" \
    --base "$base_branch" \
    --head "$branch_name" \
    --title "Standardize agent automation setup" \
    --body "This PR applies the standard agent automation workflow, CI runner labels, and issue template.")"

  CREATED_PRS+=("${slug}: ${pr_url}")
  echo "Opened PR: ${pr_url}"
}

for slug in "${FULL_REPOS[@]}"; do
  if ! rollout_repo "$slug"; then
    echo "Failed: ${slug}"
    FAILED_REPOS+=("$slug")
  fi
done

echo ""
echo "===== Rollout Summary ====="
echo "Mode: $([[ "$EXECUTE" -eq 1 ]] && echo "execute" || echo "dry-run")"
echo "Owner: ${OWNER}"
echo "Repos processed: ${#FULL_REPOS[@]}"

if [[ "${#CREATED_PRS[@]}" -gt 0 ]]; then
  echo ""
  echo "PRs created:"
  for item in "${CREATED_PRS[@]}"; do
    echo "  - ${item}"
  done
fi

if [[ "${#PLANNED_PRS[@]}" -gt 0 ]]; then
  echo ""
  echo "Planned PR branches:"
  for item in "${PLANNED_PRS[@]}"; do
    echo "  - ${item}"
  done
fi

if [[ "${#NO_CHANGES[@]}" -gt 0 ]]; then
  echo ""
  echo "No file changes needed:"
  for repo in "${NO_CHANGES[@]}"; do
    echo "  - ${repo}"
  done
fi

if [[ "${#FAILED_REPOS[@]}" -gt 0 ]]; then
  echo ""
  echo "Failed repositories:"
  for repo in "${FAILED_REPOS[@]}"; do
    echo "  - ${repo}"
  done
  exit 1
fi

echo ""
echo "Done."
