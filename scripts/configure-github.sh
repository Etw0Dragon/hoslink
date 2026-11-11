#!/bin/sh
# Run from a normal local checkout after committing the prepared changes.
# Never changes visibility, creates a paid resource, force-pushes or resets a branch.
set -eu
repo=Etw0Dragon/hoslink
approvals=${HOSLINK_REQUIRED_APPROVALS:-0}
case "$approvals" in 0|1) ;; *) echo "HOSLINK_REQUIRED_APPROVALS doit valoir 0 ou 1." >&2; exit 1 ;; esac
root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$root"
domain=$(tr -d '\r\n' < CNAME)
case "$domain" in ''|*[!a-zA-Z0-9.-]*|.*|*..*) echo 'Domaine CNAME invalide.' >&2; exit 1 ;; esac
command -v gh >/dev/null || { echo 'Installer GitHub CLI et lancer gh auth login.' >&2; exit 1; }
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || {
  echo 'Métadonnées Git inaccessibles. Relancer dans le vrai checkout local, hors de la session restreinte.' >&2
  exit 1
}
[ -z "$(git status --porcelain)" ] || { echo 'Committer ou ranger les modifications avant la configuration.' >&2; exit 1; }
git show-ref --verify --quiet refs/heads/main || { echo 'La branche locale main doit exister.' >&2; exit 1; }
gh auth status >/dev/null
visibility=$(gh repo view "$repo" --json visibility --jq .visibility)
[ "$visibility" = PUBLIC ] || {
  echo 'Le dépôt est privé. Aucun changement effectué : décider de la visibilité ou du plan GitHub avant Pages.' >&2
  exit 1
}
remote=$(git remote get-url origin)
case "$remote" in
  git@github.com:Etw0Dragon/hoslink.git|https://github.com/Etw0Dragon/hoslink.git|https://github.com/Etw0Dragon/hoslink) ;;
  *) echo 'origin ne correspond pas au dépôt attendu ; corriger manuellement avant de continuer.' >&2; exit 1 ;;
esac
# Fetch first so an existing backend branch is never overwritten or recreated.
git fetch origin
if ! git show-ref --verify --quiet refs/heads/backend; then
  if git show-ref --verify --quiet refs/remotes/origin/backend; then
    git branch --track backend origin/backend
  else
    git branch backend main
  fi
fi
git push --set-upstream origin main backend
gh repo edit "$repo" --default-branch main --delete-branch-on-merge --enable-squash-merge --enable-rebase-merge --enable-merge-commit=false --homepage "https://$domain/"
gh api --method PUT "repos/$repo/actions/permissions/workflow" -f default_workflow_permissions=read -F can_approve_pull_request_reviews=false >/dev/null

scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT HUP INT TERM
# Read failures are not treated as "missing Pages" unless GitHub returns 404.
if gh api "repos/$repo/pages" >"$scratch/pages.json" 2>"$scratch/pages.err"; then
  gh api --method PUT "repos/$repo/pages" -f build_type=workflow -f cname="$domain" >/dev/null
elif grep -q 'HTTP 404' "$scratch/pages.err"; then
  gh api --method POST "repos/$repo/pages" -f build_type=workflow -f cname="$domain" >/dev/null
else
  cat "$scratch/pages.err" >&2
  exit 1
fi
# Enforce TLS once GitHub has issued the custom-domain certificate.
gh api --method PUT "repos/$repo/pages" -F https_enforced=true >/dev/null
# Restrict production of the static preview to main, without a manual review gate.
cat >"$scratch/environment.json" <<'JSON'
{"deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
JSON
gh api --method PUT "repos/$repo/environments/github-pages" --input "$scratch/environment.json" >/dev/null
if [ "$(gh api "repos/$repo/environments/github-pages/deployment-branch-policies" --jq '[.branch_policies[] | select(.name == "main" and .type == "branch")] | length')" = 0 ]; then
  gh api --method POST "repos/$repo/environments/github-pages/deployment-branch-policies" -f name=main -f type=branch >/dev/null
fi
# Existing broader environment policies are shown for manual review, never deleted.
gh api "repos/$repo/environments/github-pages/deployment-branch-policies" --jq '.branch_policies[] | [.name, .type] | @tsv'
cat >"$scratch/protection.json" <<JSON
{
  "required_status_checks":{"strict":true,"contexts":[],"checks":[{"context":"Go and PostgreSQL","app_id":15368}]},
  "enforce_admins":true,
  "required_pull_request_reviews":{"dismiss_stale_reviews":true,"required_approving_review_count":$approvals},
  "restrictions":null,
  "required_linear_history":true,
  "allow_force_pushes":false,
  "allow_deletions":false,
  "required_conversation_resolution":true
}
JSON
for branch in main backend; do
  gh api --method PUT "repos/$repo/branches/$branch/protection" --input "$scratch/protection.json" >/dev/null
done
# No personal access token is stored; Pages uses GitHub's short-lived token.
gh workflow run pages.yml --repo "$repo" --ref main
printf '%s\n' 'Configuration appliquée. Vérifier CI, Pages et les politiques de déploiement dans GitHub.'
printf 'URL après succès : https://%s/\n' "$domain"
