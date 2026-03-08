#!/bin/bash
# ============================================================
# Git config for DailyTrain devcontainer
# Supports multiple GitHub accounts via GITHUB_ACCOUNT env var
# Valid values: "personal" (default), "company"
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACCOUNTS_FILE="$SCRIPT_DIR/github-accounts.json"
ACCOUNT="${GITHUB_ACCOUNT:-personal}"

echo "Configuring git for account: $ACCOUNT"

# Validate accounts file exists
if [ ! -f "$ACCOUNTS_FILE" ]; then
  echo "ERROR: $ACCOUNTS_FILE not found"
  exit 1
fi

# Parse account config using node (available in the devcontainer image)
ACCOUNT_CONFIG=$(node -e "
  const accounts = require('$ACCOUNTS_FILE');
  const config = accounts['$ACCOUNT'];
  if (!config) {
    console.error('Unknown account: $ACCOUNT');
    console.error('Available accounts:', Object.keys(accounts).join(', '));
    process.exit(1);
  }
  console.log(JSON.stringify(config));
")

GH_NAME=$(echo "$ACCOUNT_CONFIG" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).name)")
GH_EMAIL=$(echo "$ACCOUNT_CONFIG" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).email)")
GH_USER=$(echo "$ACCOUNT_CONFIG" | node -e "const d=require('fs').readFileSync('/dev/stdin','utf8');console.log(JSON.parse(d).ghUser)")

# Set local git identity (scoped to this repo only)
git config user.name "$GH_NAME"
git config user.email "$GH_EMAIL"

# Set environment for the session
export GIT_AUTHOR_NAME="$GH_NAME"
export GIT_COMMITTER_NAME="$GH_NAME"
export GIT_AUTHOR_EMAIL="$GH_EMAIL"
export GIT_COMMITTER_EMAIL="$GH_EMAIL"

# Fix remote URL if it points to the wrong account
CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
if [ -n "$CURRENT_REMOTE" ]; then
  for OTHER_USER in $(node -e "
    const accounts = require('$ACCOUNTS_FILE');
    Object.values(accounts)
      .filter(a => a.ghUser !== '$GH_USER')
      .forEach(a => console.log(a.ghUser));
  "); do
    if echo "$CURRENT_REMOTE" | grep -q "$OTHER_USER"; then
      echo "Remote points to $OTHER_USER account. Fixing..."
      NEW_REMOTE=$(echo "$CURRENT_REMOTE" | sed "s/$OTHER_USER/$GH_USER/g")
      git remote set-url origin "$NEW_REMOTE"
      echo "Remote updated to: $NEW_REMOTE"
    fi
  done
fi

# Check gh CLI authentication status
if command -v gh &> /dev/null; then
  CURRENT_GH_USER=$(gh auth status 2>&1 | grep -oP 'account \K\S+' | head -1 || echo "")
  if [ -n "$CURRENT_GH_USER" ] && [ "$CURRENT_GH_USER" != "$GH_USER" ]; then
    echo ""
    echo "WARNING: GitHub CLI is logged in as '$CURRENT_GH_USER'."
    echo "  Run: gh auth switch --user $GH_USER"
    echo "  Or:  gh auth login -h github.com"
    echo ""
  fi
fi

# Set credential helper for this repo to use the correct account
git config credential.helper ""
git config "credential.https://github.com.username" "$GH_USER"

echo "Git configured for $ACCOUNT ($GH_USER)"
echo "  Name:  $(git config user.name)"
echo "  Email: $(git config user.email)"
