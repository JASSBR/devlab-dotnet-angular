#!/usr/bin/env bash
# Same as ./dev.sh (API + Angular), but orchestrated by the Aspire AppHost:
# one Ctrl+C, and a dashboard with the logs, traces and metrics of both.
# The dashboard URL (with its login token) is printed in the output below.
set -e
cd "$(dirname "$0")"
export PATH="$HOME/.dotnet:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; nvm use >/dev/null; fi

[ -d frontend/node_modules ] || (cd frontend && npm ci)
exec dotnet run --project backend/DevLab.AppHost
