#!/bin/bash
# Start the AI Agent backend server accessible from network devices

cd "$(dirname "$0")"

echo "🚀 Starting AI Agent Backend Server..."
echo "📍 Server will be accessible at:"
echo "   - http://localhost:8000 (local)"
echo "   - http://$(ifconfig | grep -A 1 "inet " | grep -v "127.0.0.1" | grep "inet " | head -1 | awk '{print $2}'):8000 (network)"
echo ""
echo "Press CTRL+C to stop the server"
echo ""

# Activate virtual environment if it exists
if [ -d "../.venv" ]; then
    source ../.venv/bin/activate
elif [ -d ".venv" ]; then
    source .venv/bin/activate
fi

# Start server with 0.0.0.0 to allow network access
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --reload-exclude ".venv/*"
