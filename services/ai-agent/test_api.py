#!/usr/bin/env python3
"""Python test script for SuiPark Agent API."""
import asyncio
import httpx
import json


BASE_URL = "http://localhost:8000"


async def test_endpoints():
    """Test all API endpoints."""
    async with httpx.AsyncClient(timeout=30.0) as client:
        print("=== Testing SuiPark Agent API ===\n")
        
        # Test 1: Health check
        print("1. Testing /health endpoint...")
        try:
            response = await client.get(f"{BASE_URL}/health")
            print(f"   Status: {response.status_code}")
            print(f"   Response: {json.dumps(response.json(), indent=2)}")
        except Exception as e:
            print(f"   Error: {e}")
        print()
        
        # Test 2: Parse intent
        print("2. Testing /api/parse-intent...")
        try:
            response = await client.post(
                f"{BASE_URL}/api/parse-intent",
                json={
                    "message": "I need parking near FSEGA for 2 hours, max 20 lei"
                }
            )
            print(f"   Status: {response.status_code}")
            print(f"   Response: {json.dumps(response.json(), indent=2)}")
        except Exception as e:
            print(f"   Error: {e}")
        print()
        
        # Test 3: Geocode
        print("3. Testing /api/geocode...")
        try:
            response = await client.post(
                f"{BASE_URL}/api/geocode",
                json={
                    "location_query": "FSEGA, Cluj-Napoca"
                }
            )
            print(f"   Status: {response.status_code}")
            print(f"   Response: {json.dumps(response.json(), indent=2)}")
        except Exception as e:
            print(f"   Error: {e}")
        print()
        
        # Test 4: Recommend slot
        print("4. Testing /api/recommend-slot...")
        try:
            response = await client.post(
                f"{BASE_URL}/api/recommend-slot",
                json={
                    "user_intent": {
                        "location_query": "FSEGA, Cluj-Napoca",
                        "duration_minutes": 120,
                        "max_price": 20.0,
                        "preferences": {"covered": False}
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
                            "is_available": True,
                            "address": "Strada Teodor Mihali 58"
                        },
                        {
                            "slot_id": "slot-2",
                            "lat": 46.768,
                            "lng": 23.600,
                            "price_per_hour": 6.0,
                            "distance_m": 350,
                            "is_available": True,
                            "address": "Strada Memorandumului 28"
                        }
                    ]
                }
            )
            print(f"   Status: {response.status_code}")
            print(f"   Response: {json.dumps(response.json(), indent=2)}")
        except Exception as e:
            print(f"   Error: {e}")
        print()
        
        # Test 5: Generate user message
        print("5. Testing /api/generate-user-message...")
        try:
            response = await client.post(
                f"{BASE_URL}/api/generate-user-message",
                json={
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
                }
            )
            print(f"   Status: {response.status_code}")
            print(f"   Response: {json.dumps(response.json(), indent=2)}")
        except Exception as e:
            print(f"   Error: {e}")
        print()
        
        print("=== Testing complete ===")


if __name__ == "__main__":
    asyncio.run(test_endpoints())

