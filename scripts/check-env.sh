#!/usr/bin/env sh
set -eu
if [ ! -f backend/.env ]; then echo 'Missing backend/.env. Copy .env.example to backend/.env and configure MongoDB and SESSION_SECRET.' >&2; exit 1; fi
printf '%s\n' 'Found backend/.env. Secret values are not displayed.'
