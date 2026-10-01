#!/usr/bin/env bash
# Starts the API and the Angular dev server together. Ctrl+C stops both.
set -e
cd "$(dirname "$0")"
export PATH="$HOME/.dotnet:$PATH"
if [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; nvm use >/dev/null; fi

(cd backend/DevLab.Api && dotnet run) &
API=$!
(cd frontend && npm start) &
NG=$!
trap "kill $API $NG 2>/dev/null" EXIT INT TERM
wait
