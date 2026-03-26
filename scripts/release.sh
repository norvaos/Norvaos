#!/bin/bash
#
# NorvaOS Release Script
# Usage: ./scripts/release.sh [patch|minor|major]
#
# This script:
# 1. Ensures you're on the 'develop' branch with clean working tree
# 2. Bumps the version in package.json
# 3. Updates CHANGELOG.md with a new version header
# 4. Commits the version bump
# 5. Merges develop → main
# 6. Creates a git tag (e.g., v1.2.0)
# 7. Pushes everything to origin
#
# After this, your CI/CD pipeline will:
# - Build and test on main
# - Deploy to staging (automatic)
# - Deploy to production (manual approval or auto based on config)

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────
BUMP_TYPE="${1:-patch}"  # patch, minor, or major
MAIN_BRANCH="main"
DEVELOP_BRANCH="develop"

# ─── Colors ──────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚀 NorvaOS Release Script${NC}"
echo "─────────────────────────────────"

# ─── Validations ─────────────────────────────────────────────────
if [[ "$BUMP_TYPE" != "patch" && "$BUMP_TYPE" != "minor" && "$BUMP_TYPE" != "major" ]]; then
  echo -e "${RED}Error: Invalid bump type '$BUMP_TYPE'. Use: patch, minor, or major${NC}"
  exit 1
fi

# Check we're on develop
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$CURRENT_BRANCH" != "$DEVELOP_BRANCH" ]]; then
  echo -e "${RED}Error: Must be on '$DEVELOP_BRANCH' branch (currently on '$CURRENT_BRANCH')${NC}"
  exit 1
fi

# Check clean working tree
if [[ -n $(git status --porcelain) ]]; then
  echo -e "${RED}Error: Working tree is not clean. Commit or stash changes first.${NC}"
  exit 1
fi

# Pull latest
echo -e "${YELLOW}Pulling latest changes...${NC}"
git pull origin "$DEVELOP_BRANCH"

# ─── Version Bump ────────────────────────────────────────────────
OLD_VERSION=$(node -p "require('./package.json').version")
npm version "$BUMP_TYPE" --no-git-tag-version
NEW_VERSION=$(node -p "require('./package.json').version")

echo -e "${GREEN}Version: $OLD_VERSION → $NEW_VERSION${NC}"

# ─── Update CHANGELOG ────────────────────────────────────────────
TODAY=$(date +%Y-%m-%d)
# Add a new version header after the first ## line
if grep -q "## \[Unreleased\]" CHANGELOG.md 2>/dev/null; then
  sed -i '' "s/## \[Unreleased\]/## [Unreleased]\n\n## [$NEW_VERSION] - $TODAY/" CHANGELOG.md
else
  echo -e "${YELLOW}Note: No [Unreleased] section found in CHANGELOG.md. Please update manually.${NC}"
fi

# ─── Commit Version Bump ─────────────────────────────────────────
git add package.json CHANGELOG.md
git commit -m "chore: release v$NEW_VERSION

Bump version from $OLD_VERSION to $NEW_VERSION ($BUMP_TYPE release)"

echo -e "${GREEN}✅ Version bump committed${NC}"

# ─── Merge to Main ───────────────────────────────────────────────
echo -e "${YELLOW}Merging $DEVELOP_BRANCH → $MAIN_BRANCH...${NC}"
git checkout "$MAIN_BRANCH"
git pull origin "$MAIN_BRANCH"
git merge "$DEVELOP_BRANCH" --no-ff -m "release: v$NEW_VERSION"

# ─── Tag ─────────────────────────────────────────────────────────
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"
echo -e "${GREEN}✅ Tagged v$NEW_VERSION${NC}"

# ─── Push ────────────────────────────────────────────────────────
echo -e "${YELLOW}Pushing to origin...${NC}"
git push origin "$MAIN_BRANCH"
git push origin "v$NEW_VERSION"

# Switch back to develop and merge main back
git checkout "$DEVELOP_BRANCH"
git merge "$MAIN_BRANCH" --no-ff -m "chore: merge v$NEW_VERSION back to develop"
git push origin "$DEVELOP_BRANCH"

echo ""
echo -e "${GREEN}🎉 Release v$NEW_VERSION complete!${NC}"
echo "─────────────────────────────────"
echo -e "  Tag:     ${BLUE}v$NEW_VERSION${NC}"
echo -e "  Branch:  ${BLUE}$MAIN_BRANCH${NC}"
echo -e "  CI/CD will now build and deploy automatically."
echo ""
