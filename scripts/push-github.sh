#!/bin/bash

set -e

if [ -z "$GITHUB_TOKEN" ]; then
  echo "❌ GITHUB_TOKEN no está configurado."
  exit 1
fi

GITHUB_USER="RichDev01s"
GITHUB_REPO="discord-roblox-bot"
REMOTE_URL="https://${GITHUB_USER}:${GITHUB_TOKEN}@github.com/${GITHUB_USER}/${GITHUB_REPO}.git"

echo "🚀 Subiendo cambios a GitHub..."
git push "$REMOTE_URL" main 2>&1 | grep -v "https://"

echo ""
echo "✅ ¡Listo! Código subido a github.com/${GITHUB_USER}/${GITHUB_REPO}"
echo "🚂 Railway detectará el cambio y desplegará automáticamente."
