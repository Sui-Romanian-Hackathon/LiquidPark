# SuiPark Integration Script

This script integrates the `sui-interactions` module with the `ai-agent` API to provide a complete end-to-end flow for finding parking slots.

## Overview

The `integrated_test.py` script:
1. Parses user intent from natural language using the AI agent
2. Geocodes the location using Google Maps API
3. Queries parking slots from Sui blockchain via HTTP API (`sui-interactions` API server)
4. Recommends the best slot based on distance, price, and preferences
5. Generates a friendly message for the user

## Architecture

The integration uses an HTTP API interface:
- **TypeScript API Server** (`sui-interactions/api-server.ts`): Runs on port 3001, provides REST endpoints for querying Sui blockchain
- **Python Integration Script** (`ai-agent/integrated_test.py`): Makes HTTP requests to both APIs

## Prerequisites

1. **Node.js** (v18+) - Required for the Sui API server
2. **Python 3.8+** - Required for the integration script
3. **Dependencies installed:**
   - For `ai-agent`: `pip install -r requirements.txt`
   - For `sui-interactions`: `npm install` (in the sui-interactions directory)

## Setup

1. **Start the Sui Interactions API server:**
   ```bash
   cd services/sui-interactions
   npm install  # Install dependencies (express, cors, etc.)
   npm run start:api
   # Or use the startup script:
   ./start-api.sh
   ```
   The API server will run on `http://localhost:3001`

2. **Start the ai-agent API server:**
   ```bash
   cd services/ai-agent
   python -m app.main
   # Or use the run.sh script
   ```
   The API server will run on `http://localhost:8000`

3. Make sure `config.json` in `sui-interactions` has the correct network configuration.

## Usage

Run the integrated test script:

```bash
cd services/ai-agent
python integrated_test.py "I need parking near FSEGA for 2 hours, max 20 lei" testnet
```

### Arguments

- **User message** (required): Natural language query for parking
- **Network** (optional): Sui network to query (`testnet`, `mainnet`, `devnet`). Defaults to `testnet`.

### Example

```bash
python integrated_test.py "I need parking near FSEGA for 2 hours, max 20 lei" testnet
```

## How It Works

1. **Parse Intent**: The script sends the user message to `http://localhost:8000/api/parse-intent` to extract:
   - Location query
   - Duration in minutes
   - Maximum price
   - Preferences (covered, safety, etc.)

2. **Geocode**: The location query is sent to `http://localhost:8000/api/geocode` to get coordinates and formatted address.

3. **Query Sui**: The script makes an HTTP POST request to `http://localhost:3001/api/slots/query` which:
   - Queries Sui blockchain for `SlotCreated` events
   - Fetches parking slot details
   - Filters by location (within 5km radius)
   - Returns only available slots (status = FREE)

4. **Convert Format**: Sui slot data is converted to the API format:
   - Coordinates are unscaled (from integers * 1,000,000)
   - Prices are converted from MIST to RON (adjust conversion rate as needed)
   - Distance is calculated using Haversine formula

5. **Recommend**: The slots are sent to `http://localhost:8000/api/recommend-slot` which uses AI to rank them.

6. **Generate Message**: The best slot is sent to `http://localhost:8000/api/generate-user-message` to create a friendly response.

## API Endpoints

### Sui Interactions API (Port 3001)

- `GET /health` - Health check
- `GET /api/slots` - Query slots with query parameters
  - `?network=testnet&lat=46.766&lng=23.599&radius=5000&available_only=true`
- `POST /api/slots/query` - Query slots with JSON body
  ```json
  {
    "network": "testnet",
    "lat": 46.766,
    "lng": 23.599,
    "radius": 5000,
    "available_only": true
  }
  ```
- `GET /api/slots/:slotId` - Get specific slot by ID

## Troubleshooting

### No slots found

If you see "No parking slots found", this might be expected if:
- No slots have been created on the Sui network yet
- The network configuration is incorrect
- The query radius is too small

### API connection errors

**Sui API server (port 3001):**
- Make sure the Sui API server is running: `cd sui-interactions && npm run start:api`
- Check if port 3001 is available: `lsof -i :3001`
- Verify the server is responding: `curl http://localhost:3001/health`

**AI Agent API server (port 8000):**
- Make sure the ai-agent server is running: `python -m app.main`
- Check if port 8000 is available: `lsof -i :8000`
- Verify the server is responding: `curl http://localhost:8000/health`
- Check that environment variables are set (Google Maps API key, Gemini API key)

### Dependencies

If you get module not found errors:
- For TypeScript: `cd sui-interactions && npm install`
- For Python: `cd ai-agent && pip install -r requirements.txt`

## File Structure

- `integrated_test.py` - Main Python integration script (uses HTTP API)
- `sui-interactions/api-server.ts` - TypeScript HTTP API server for Sui queries
- `sui-interactions/query-slots.ts` - Core query logic (used by API server)
- `sui-interactions/start-api.sh` - Startup script for API server
- `test_api.py` - Original test script with hardcoded data (for reference)

## Differences from test_api.py

The `integrated_test.py` script replaces the hardcoded slot data (lines 72-90 in `test_api.py`) with real data queried from the Sui blockchain via HTTP API. The architecture is now:
- **Before**: Python subprocess → Node.js script → Sui blockchain
- **After**: Python HTTP client → TypeScript API server → Sui blockchain

This provides better separation of concerns, easier scaling, and cleaner error handling.
