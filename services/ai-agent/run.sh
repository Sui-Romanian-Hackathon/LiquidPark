#!/bin/bash
# Simple script to run the SuiPark Agent API server

# Check if .env exists
if [ ! -f .env ]; then
    echo "Warning: .env file not found. Please create it from env.template"
    echo "Example: cp env.template .env"
fi

# Run the server
# Exclude .venv from watch to avoid unnecessary reloads
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --reload-exclude ".venv/*"


