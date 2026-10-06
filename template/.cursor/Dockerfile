FROM node:22-bookworm-slim

# Base image for Cursor cloud agents. Do not copy the repository.
# Cursor checks out the repo and runs `npm ci` from .cursor/environment.json.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates python3 \
  && rm -rf /var/lib/apt/lists/*
