# Quick Start Guide - SuiPark Integration

This guide shows how to run the complete integration between `ai-agent` and `sui-interactions`.

## Architecture

```
┌─────────────────┐         HTTP          ┌──────────────────┐
│  Python Script  │ ────────────────────> │  AI Agent API    │
│ integrated_test │                        │  (Port 8000)     │
│      .py        │                        └──────────────────┘
└─────────────────┘
         │
         │ HTTP
         │
         v
┌─────────────────┐         HTTP          ┌──────────────────┐
│  TypeScript API │ ────────────────────> │  Sui Blockchain  │
│  Server         │                        │  (testnet/mainnet)│
│  (Port 3001)    │                        └──────────────────┘
└─────────────────┘
```

## Step-by-Step Setup

### 0. Create Test Slots (Optional but Recommended)

Before testing, create some parking slots on Sui blockchain:

```bash
cd services/sui-interactions
PRIVATE_KEY=your_private_key npx tsx create-fsega-slot.ts testnet 0
```

This creates a parking slot near FSEGA. You can create multiple slots:
- Slot 0: Strada Teodor Mihali 58
- Slot 1: Strada Memorandumului 28  
- Slot 2: FSEGA Main Entrance

See `sui-interactions/CREATE_SLOT_README.md` for details.

### 1. Install Dependencies

**For sui-interactions (TypeScript):**
```bash
cd services/sui-interactions
npm install
```

**For ai-agent (Python):**
```bash
cd services/ai-agent
pip install -r requirements.txt
```

### 2. Configure Environment

**For ai-agent:**
- Set up `.env` file with Google Maps API key and Gemini API key
- See `env.template` for reference

**For sui-interactions:**
- Ensure `config.json` has correct network configuration
- Default network is `testnet`

### 3. Start the Services

**Terminal 1 - Start Sui Interactions API:**
```bash
cd services/sui-interactions
npm run start:api
# Should see: "🚀 Sui Interactions API server running on port 3001"
```

**Terminal 2 - Start AI Agent API:**
```bash
cd services/ai-agent
python -m app.main
# Or: ./run.sh
# Should see: "Uvicorn running on http://0.0.0.0:8000"
```

**Terminal 3 - Run Integration Script:**
```bash
cd services/ai-agent
python integrated_test.py "I need parking near FSEGA for 2 hours, max 20 lei" testnet
```

## Testing Individual Services

### Test Sui API Server
```bash
# Health check
curl http://localhost:3001/health

# Query slots
curl "http://localhost:3001/api/slots?network=testnet&lat=46.766&lng=23.599&radius=5000"

# Or with POST
curl -X POST http://localhost:3001/api/slots/query \
  -H "Content-Type: application/json" \
  -d '{"network":"testnet","lat":46.766,"lng":23.599,"radius":5000}'
```

### Test AI Agent API
```bash
# Health check
curl http://localhost:8000/health

# Parse intent
curl -X POST http://localhost:8000/api/parse-intent \
  -H "Content-Type: application/json" \
  -d '{"message":"I need parking near FSEGA for 2 hours"}'
```

## Environment Variables

You can customize the API URLs:

```bash
# In your shell or .env file
export AI_AGENT_API_URL="http://localhost:8000"
export SUI_API_URL="http://localhost:3001"
```

## Troubleshooting

1. **Port already in use:**
   - Change ports in the code or kill existing processes
   - `lsof -i :3001` or `lsof -i :8000`

2. **API server not responding:**
   - Check if services are running
   - Check console for error messages
   - Verify network configuration

3. **No slots found:**
   - This is expected if no slots exist on Sui yet
   - Create test slots using `sui-interactions/test.ts`

## Next Steps

- See `ai-agent/INTEGRATION_README.md` for detailed documentation
- Check `sui-interactions/README.md` for API details
- Modify the integration script to add more features
