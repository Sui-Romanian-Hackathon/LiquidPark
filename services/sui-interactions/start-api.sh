#!/bin/bash
# Start the Sui Interactions API server

echo "Starting Sui Interactions API server..."
echo "Make sure dependencies are installed: npm install"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start the API server
npm run start:api
