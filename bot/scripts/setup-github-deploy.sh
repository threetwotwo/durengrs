#!/usr/bin/env bash
# One-time setup so GitHub deploys the bot and the webapp on every push to main (.github/workflows/).
# Run it on your Mac, inside the bot folder that has env.yaml, service-account.json and private_key.pem:
#
#   bash scripts/setup-github-deploy.sh
#
# It needs gcloud (already signed in) and the GitHub CLI (brew install gh). It:
#   1. creates a deploy account "github-deploy" in whatsapp-survey-509713, allowed to deploy the bot (Cloud Run) and
#      the webapp (Firebase Hosting and rules in duren-db), and makes a key for it;
#   2. stores that key and your three secret files as encrypted GitHub secrets of threetwotwo/durengrs.
# Nothing is written to the repository. Run it again any time to replace the secrets (e.g. after a new env.yaml).
set -euo pipefail

REPO=threetwotwo/durengrs
BOT=whatsapp-survey-509713
WEB=duren-db
SA="github-deploy@${BOT}.iam.gserviceaccount.com"

for f in env.yaml service-account.json private_key.pem; do
  [ -f "$f" ] || { echo "❌ $f is not in this folder. Run this inside the bot folder you deploy from."; exit 1; }
done
command -v gcloud >/dev/null || { echo "❌ gcloud is not installed."; exit 1; }
command -v gh >/dev/null || { echo "❌ GitHub CLI missing. Install it with: brew install gh"; exit 1; }
gh auth status >/dev/null 2>&1 || gh auth login --hostname github.com --git-protocol https --web

echo "→ Deploy account"
gcloud iam service-accounts describe "$SA" --project "$BOT" >/dev/null 2>&1 ||
  gcloud iam service-accounts create github-deploy --project "$BOT" --display-name "GitHub deploy" >/dev/null
bind() { gcloud projects add-iam-policy-binding "$1" --member "serviceAccount:$SA" --role "roles/$2" --condition=None --quiet >/dev/null; }
for r in run.admin cloudbuild.builds.editor artifactregistry.admin storage.admin iam.serviceAccountUser serviceusage.serviceUsageConsumer viewer; do bind "$BOT" "$r"; done
for r in firebase.admin serviceusage.serviceUsageConsumer; do bind "$WEB" "$r"; done

echo "→ Key"
KEY="$(mktemp)"
trap 'rm -f "$KEY"' EXIT
gcloud iam service-accounts keys create "$KEY" --iam-account "$SA" --project "$BOT" >/dev/null

echo "→ GitHub secrets"
gh secret set GCP_DEPLOY_KEY -R "$REPO" < "$KEY"
gh secret set BOT_ENV_YAML -R "$REPO" < env.yaml
gh secret set BOT_SERVICE_ACCOUNT -R "$REPO" < service-account.json
gh secret set FLOW_PRIVATE_KEY -R "$REPO" < private_key.pem

echo "✅ Done. Every push to main now deploys. First run by hand: https://github.com/$REPO/actions"
