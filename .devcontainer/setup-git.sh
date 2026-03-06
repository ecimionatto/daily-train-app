#!/bin/bash
# ============================================================
# Git config for IronCoach devcontainer
# Uses personal GitHub account (ecimionatto) — never enterprise
# ============================================================

set -e

echo "🔧 Configuring git for personal account (ecimionatto)..."

# Set local git identity (scoped to this repo only)
git config user.name "ecimionatto"
git config user.email "ecimionatto@users.noreply.github.com"

# Ensure this repo's remote uses the personal account
# If remote origin exists and points to enterprise, fix it
CURRENT_REMOTE=$(git remote get-url origin 2>/dev/null || echo "")
if echo "$CURRENT_REMOTE" | grep -q "edson-cimionatto_tmna"; then
  echo "⚠️  Remote points to enterprise account. Fixing..."
  NEW_REMOTE=$(echo "$CURRENT_REMOTE" | sed 's/edson-cimionatto_tmna/ecimionatto/g')
  git remote set-url origin "$NEW_REMOTE"
  echo "✅ Remote updated to: $NEW_REMOTE"
fi

# Authenticate gh CLI with personal account if not already
if gh auth status 2>&1 | grep -q "edson-cimionatto_tmna"; then
  echo ""
  echo "⚠️  GitHub CLI is logged in as the enterprise account."
  echo "   Run this to switch to your personal account:"
  echo ""
  echo "   gh auth login -h github.com"
  echo ""
  echo "   Then select your personal account (ecimionatto)."
  echo ""
fi

# Block enterprise user from being used in this repo
# This credential helper override ensures git operations
# within this container never use the enterprise token
git config credential.helper ""
git config "credential.https://github.com.username" "ecimionatto"

echo "✅ Git configured for ecimionatto"
echo "   Name:  $(git config user.name)"
echo "   Email: $(git config user.email)"
