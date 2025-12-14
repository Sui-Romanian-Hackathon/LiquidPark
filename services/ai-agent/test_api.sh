#!/bin/bash
# Test script for SuiPark Agent API

BASE_URL="http://localhost:8000"

echo "=== Testing SuiPark Agent API ==="
echo ""

# Test 1: Health check
echo "1. Testing health endpoint..."
curl -X GET "$BASE_URL/health" | python3 -m json.tool
echo -e "\n"

# Test 2: Parse intent
echo "2. Testing /api/parse-intent..."
curl -X POST "$BASE_URL/api/parse-intent" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "I need parking near FSEGA for 2 hours, max 20 lei"
  }' | python3 -m json.tool
echo -e "\n"

# Test 3: Geocode (requires GOOGLE_MAPS_API_KEY)
echo "3. Testing /api/geocode..."
curl -X POST "$BASE_URL/api/geocode" \
  -H "Content-Type: application/json" \
  -d '{
    "location_query": "FSEGA, Cluj-Napoca"
  }' | python3 -m json.tool
echo -e "\n"

# Test 4: Recommend slot
echo "4. Testing /api/recommend-slot..."
curl -X POST "$BASE_URL/api/recommend-slot" \
  -H "Content-Type: application/json" \
  -d '{
    "user_intent": {
      "location_query": "FSEGA, Cluj-Napoca",
      "duration_minutes": 120,
      "max_price": 20.0,
      "preferences": {"covered": false}
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
        "is_available": true,
        "address": "Strada Teodor Mihali 58"
      },
      {
        "slot_id": "slot-2",
        "lat": 46.768,
        "lng": 23.600,
        "price_per_hour": 6.0,
        "distance_m": 350,
        "is_available": true,
        "address": "Strada Memorandumului 28"
      }
    ]
  }' | python3 -m json.tool
echo -e "\n"

# Test 5: Generate user message
echo "5. Testing /api/generate-user-message..."
curl -X POST "$BASE_URL/api/generate-user-message" \
  -H "Content-Type: application/json" \
  -d '{
    "best_slot": {
      "slot_id": "slot-1",
      "distance_m": 150,
      "price_total": 16.0,
      "address": "Strada Teodor Mihali 58"
    },
    "user_intent": {
      "location_query": "FSEGA",
      "duration_minutes": 120
    }
  }' | python3 -m json.tool
echo -e "\n"

echo "=== Testing complete ==="

