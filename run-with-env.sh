#!/bin/bash
# Loads environment variables from .env file and runs the specified command

ENV_FILE=".env"

if [ -f "$ENV_FILE" ]; then
    set -a
    source "$ENV_FILE"
    set +a
else
    echo "Warning: $ENV_FILE not found, running without environment overrides"
fi

# Set flag to indicate environment is properly loaded
export BINDIST_ENV_LOADED=1

exec "$@"
