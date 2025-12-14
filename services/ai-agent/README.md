# SuiPark Agent AI Backend

AI-powered backend service for SuiPark Agent, a chatbot that helps users find, reserve, and pay for parking spots using natural language.

## Features

- **Intent Parsing**: Extracts structured information (location, duration, price, preferences) from natural language messages
- **Geocoding**: Converts location queries to coordinates using Google Maps API
- **Slot Recommendation**: Ranks parking slots based on distance, price, availability, and user preferences
- **Message Generation**: Creates friendly, conversational messages for the chat UI

## Tech Stack

- Python 3.x
- FastAPI
- Google Gemini API
- Google Maps Geocoding API
- Pydantic for data validation

## Setup

1. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Set up environment variables**:
   ```bash
   cp env.template .env
   # Edit .env and add your API keys:
   # - GEMINI_API_KEY: Get from https://ai.google.dev/
   # - GOOGLE_MAPS_API_KEY: Get from https://console.cloud.google.com/
   ```

3. **Run the server**:
   ```bash
   uvicorn app.main:app --reload
   ```

   Or use Python directly:
   ```bash
   python -m app.main
   ```

The API will be available at `http://localhost:8000`

## API Endpoints

### `POST /api/parse-intent`

Parse user message into structured intent.

**Request**:
```json
{
  "message": "I need parking near FSEGA for 2 hours, max 20 lei"
}
```

**Response**:
```json
{
  "location_query": "FSEGA, Cluj-Napoca",
  "duration_minutes": 120,
  "max_price": 20.0,
  "preferences": {
    "covered": false,
    "safety_priority": "medium"
  }
}
```

### `POST /api/geocode`

Geocode a location query to get coordinates.

**Request**:
```json
{
  "location_query": "FSEGA, Cluj-Napoca"
}
```

**Response**:
```json
{
  "lat": 46.766,
  "lng": 23.599,
  "formatted_address": "FSEGA, Strada Teodor Mihali 58-60, Cluj-Napoca, Romania"
}
```

### `POST /api/recommend-slot`

Rank parking slots and recommend the best one.

**Request**:
```json
{
  "user_intent": {
    "location_query": "FSEGA, Cluj-Napoca",
    "duration_minutes": 120,
    "max_price": 20.0,
    "preferences": { "covered": false }
  },
  "location": {
    "lat": 46.766,
    "lng": 23.599
  },
  "slots": [
    {
      "slot_id": "slot-1",
      "lat": 46.767,
      "lng": 23.598,
      "price_per_hour": 8.0,
      "distance_m": 150,
      "is_available": true
    }
  ]
}
```

**Response**:
```json
{
  "best_slot_id": "slot-1",
  "ranking": [
    { "slot_id": "slot-1", "score": 0.92 },
    { "slot_id": "slot-2", "score": 0.78 }
  ],
  "explanation_for_user": "I chose slot-1 because it is only 150m away and fits your 2-hour stay within your budget."
}
```

### `POST /api/generate-user-message`

Generate a friendly message for the user.

**Request**:
```json
{
  "best_slot": {
    "slot_id": "slot-1",
    "distance_m": 150,
    "price_total": 16.0,
    "address": "Strada X nr. Y"
  },
  "user_intent": {
    "duration_minutes": 120
  }
}
```

**Response**:
```json
{
  "message": "I found a spot 150m from your destination, costing about 16 RON for 2 hours at Strada X nr. Y. Should I prepare the reservation transaction on Sui?"
}
```

## Project Structure

```
services/
├── app/
│   ├── __init__.py
│   ├── main.py              # FastAPI application
│   ├── config.py            # Configuration management
│   ├── models.py            # Pydantic models
│   └── services/
│       ├── __init__.py
│       ├── gemini_client.py # Gemini API client
│       ├── maps_client.py   # Google Maps client
│       └── ai_logic.py     # AI logic helpers
├── requirements.txt
├── .env.example
└── README.md
```

## Development

- All endpoints use async/await for better performance
- JSON responses are enforced from Gemini using structured prompts
- Error handling and logging are implemented throughout
- Type hints and Pydantic models ensure type safety

## API Documentation

Once the server is running, visit:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

