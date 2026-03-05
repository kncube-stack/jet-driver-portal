# Rollout Script For User Account Repos

This script lets you apply your current agent automation setup to multiple repos in your **GitHub User account**.

Script path:
- [rollout-user-repos.sh](/Users/k_ncube/Documents/jet-driver-portal-main/scripts/agent/rollout-user-repos.sh)

What it copies:
1. `.github/workflows/agent.yml`
2. `.github/workflows/ci.yml`
3. `.github/ISSUE_TEMPLATE/agent-task.yml`
4. `scripts/agent/run.sh`

What it can set (per repo):
1. `AGENT_TRUSTED_USERS`
2. `AGENT_MAX_CHANGED_FILES`

## Safe First Run (Dry-Run)

From this repo root:

```bash
bash scripts/agent/rollout-user-repos.sh --all
```

This shows what would happen, without changing anything.

## Real Rollout To All Repos

```bash
bash scripts/agent/rollout-user-repos.sh \
  --all \
  --trusted-users "kncube-stack" \
  --max-changed-files 20 \
  --execute
```

## Real Rollout To Selected Repos Only

```bash
bash scripts/agent/rollout-user-repos.sh \
  --repos "fitness-tracker,uk-earnings,study-tracker" \
  --trusted-users "kncube-stack" \
  --max-changed-files 20 \
  --execute
```

## What You Will See

1. A branch created in each target repo.
2. A PR opened in each target repo.
3. A summary at the end listing PR links.

## Notes

1. You must be logged in with `gh auth login`.
2. This is repo-level rollout, not true org-wide inheritance.
3. For new repos, run the script again or create from a template repo that already contains these files.
