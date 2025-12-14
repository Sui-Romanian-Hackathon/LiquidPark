#!/bin/bash
# Script to check if the AI Agent backend is accessible

echo "🔍 Checking AI Agent Backend Connection..."
echo ""

# Get local IP
LOCAL_IP=$(ifconfig | grep -A 1 "inet " | grep -v "127.0.0.1" | grep "inet " | head -1 | awk '{print $2}')
echo "📍 Your local IP: $LOCAL_IP"
echo ""

# Check if server is running on localhost
echo "Testing localhost:8000..."
if curl -s -f http://localhost:8000/health > /dev/null 2>&1; then
    echo "✅ Server is running on localhost:8000"
else
    echo "❌ Server is NOT running on localhost:8000"
fi
echo ""

# Check if server is accessible via local IP
if [ ! -z "$LOCAL_IP" ]; then
    echo "Testing $LOCAL_IP:8000..."
    if curl -s -f http://$LOCAL_IP:8000/health > /dev/null 2>&1; then
        echo "✅ Server is accessible via $LOCAL_IP:8000"
    else
        echo "❌ Server is NOT accessible via $LOCAL_IP:8000"
        echo "   Make sure the server is running with: uvicorn app.main:app --host 0.0.0.0 --port 8000"
    fi
fi
echo ""

# Check what's listening on port 8000
echo "Checking what's listening on port 8000..."
if command -v lsof > /dev/null 2>&1; then
    lsof -i :8000 | grep LISTEN || echo "   Nothing is listening on port 8000"
else
    echo "   (lsof not available, skipping port check)"
fi
echo ""

echo "💡 To fix:"
echo "   1. Make sure the backend is running:"
echo "      cd services/ai-agent"
echo "      uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"
echo ""
echo "   2. Update mobile/src/config/index.ts with your IP: $LOCAL_IP"
echo "   3. Make sure your phone and computer are on the same WiFi network"
