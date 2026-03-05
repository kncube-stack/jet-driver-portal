# Always-On GitHub Runner (Phone-Friendly Setup)

This keeps your current automation model (self-hosted runner), but moves it to a cloud VM so jobs still run when your Mac is off.

## What You Will Achieve

1. Your `Agent` workflow keeps working from phone-created issues.
2. Your `CI` workflow keeps running after PRs/merges.
3. Jobs run 24/7 on an always-on machine.

## Before You Start

1. You need a Linux VM (Ubuntu 22.04 or 24.04 recommended).
2. You need SSH access to that VM.
3. Keep your Mac runner connected until this new runner is confirmed working.

## Step 1: Create a Small Cloud VM

Pick any provider (DigitalOcean, Hetzner, AWS, Azure, GCP, etc.).

Recommended minimum:
- 2 vCPU
- 4 GB RAM
- 40 GB disk
- Ubuntu LTS

## Step 2: SSH Into the VM

```bash
ssh <your-user>@<your-vm-ip>
```

## Step 3: Install Base Tools

```bash
sudo apt update
sudo apt install -y curl git unzip jq python3 python3-venv build-essential
```

## Step 4: Install Node.js (LTS)

```bash
curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## Step 5: Install GitHub CLI

```bash
type -p curl >/dev/null || sudo apt install curl -y
curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | \
  sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg
sudo chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | \
  sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
sudo apt update
sudo apt install gh -y
gh --version
```

## Step 6: Install Agent CLI Used By Your Workflow

Your runner script needs either `codex` or `claude` available on PATH.

Check:

```bash
command -v codex || command -v claude
```

If this returns nothing, install `codex` (preferred) on the VM using the same method you used on your Mac, then re-check:

```bash
codex --version
```

## Step 7: Register the Runner in GitHub

1. Open repo: `kncube-stack/jet-driver-portal`
2. Go to `Settings` -> `Actions` -> `Runners` -> `New self-hosted runner`
3. Choose Linux/x64.
4. Copy the commands GitHub shows and run them on the VM.
5. During `./config.sh`, add label: `agent`

Important: use exactly `agent` label so both workflows can target this runner.

## Step 8: Install Runner As A Service

From the runner folder:

```bash
sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status
```

Expected status: running.

## Step 9: Verify It Works (Simple Test)

1. In GitHub, create a small issue using your `Agent Task` template.
2. Include `RUN_AGENT: YES`.
3. Add label `agent`.
4. Confirm `Agent` workflow starts and comments on issue.
5. Merge PR and confirm `CI` workflow also runs on the new runner.

## Step 10: Optional - Disable Local Mac Runner

Only after cloud runner is confirmed:

1. Stop local runner service on Mac.
2. Or remove local runner from GitHub `Settings` -> `Actions` -> `Runners`.

## Quick Troubleshooting

1. Jobs stay queued:
   - runner is offline, or missing `agent` label.
2. Agent run fails with "no supported CLI found":
   - `codex`/`claude` not installed on VM PATH.
3. PR creation fails:
   - check runner internet access and GitHub API access.
