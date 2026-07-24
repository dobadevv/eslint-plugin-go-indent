#!/usr/bin/env bash
# Tag and publish a new release.
#
# Usage: pnpm release [patch|minor|major]  (defaults to patch)
#
# What it does:
#   1. verifies the working tree is clean and on `main`
#   2. runs tests and the build
#   3. bumps the version in package.json, commits it, and tags it (vX.Y.Z)
#   4. pushes the commit and tag
#   5. publishes the package to npm
set -euo pipefail

bump="${1:-patch}"

case "$bump" in
	patch | minor | major) ;;
	*)
		echo "Usage: pnpm release [patch|minor|major]" >&2
		exit 1
		;;
esac

if [[ -n "$(git status --porcelain)" ]]; then
	echo "Working tree is not clean. Commit or stash your changes first." >&2
	exit 1
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" != "main" ]]; then
	echo "You're on '$branch', not 'main'. Switch to main before releasing." >&2
	exit 1
fi

git pull --ff-only

pnpm test
pnpm build

pnpm version "$bump" --message "chore(release): %s"

git push --follow-tags

pnpm publish --access public

echo "Released and published $(node -p "require('./package.json').version")."
