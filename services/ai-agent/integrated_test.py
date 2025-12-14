#!/usr/bin/env python3
"""
Integrated test script that combines sui-interactions with ai-agent.

This script:
1. Queries parking slots from Sui blockchain using sui-interactions
2. Uses ai-agent API to parse user intent, geocode location, and recommend slots
3. Provides a complete end-to-end flow
"""
import asyncio
import httpx
import json
import os
import sys
from typing import List, Dict, Any, Optional

# Base URL for ai-agent API
BASE_URL = os.getenv("AI_AGENT_API_URL", "http://localhost:8000")

# Base URL for sui-interactions API
SUI_API_URL = os.getenv("SUI_API_URL", "http://localhost:3001")


async def query_parking_slots_from_sui(
    network: str = "testnet",
    target_lat: Optional[float] = None,
    target_lng: Optional[float] = None,
    radius_meters: int = 5000
) -> List[Dict[str, Any]]:
    """
    Query parking slots from Sui blockchain using HTTP API.
    
    Args:
        network: Sui network (testnet, mainnet, devnet)
        target_lat: Target latitude for filtering (optional)
        target_lng: Target longitude for filtering (optional)
        radius_meters: Radius in meters for filtering (default 5000)
        
    Returns:
        List of parking slot dictionaries
    """
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            # Use POST endpoint for cleaner parameter passing
            params = {
                "network": network,
                "radius": radius_meters,
                "available_only": True
            }
            
            if target_lat is not None and target_lng is not None:
                params["lat"] = target_lat
                params["lng"] = target_lng
            
            response = await client.post(
                f"{SUI_API_URL}/api/slots/query",
                json=params
            )
            response.raise_for_status()
            
            data = response.json()
            
            if not data.get("success", False):
                print(f"Warning: API returned error: {data.get('error', 'Unknown error')}", file=sys.stderr)
                return []
            
            return data.get("slots", [])
            
    except httpx.TimeoutException:
        print("Warning: API request timeout - Sui network might be slow", file=sys.stderr)
        return []
    except httpx.ConnectError:
        print(f"Warning: Could not connect to Sui API at {SUI_API_URL}", file=sys.stderr)
        print("  Make sure the API server is running: cd sui-interactions && npm run start:api", file=sys.stderr)
        return []
    except httpx.HTTPStatusError as e:
        print(f"Warning: HTTP error {e.response.status_code}: {e.response.text}", file=sys.stderr)
        return []
    except Exception as e:
        print(f"Warning: Unexpected error querying slots: {e}", file=sys.stderr)
        return []


def convert_sui_slot_to_api_format(slot: Dict[str, Any], target_lat: float, target_lng: float) -> Dict[str, Any]:
    """
    Convert Sui parking slot format to ai-agent API format.
    
    Args:
        slot: Parking slot from Sui (ParkingSlot type)
        target_lat: Target latitude for distance calculation
        target_lng: Target longitude for distance calculation
        
    Returns:
        Formatted slot dictionary for ai-agent API
    """
    # Convert scaled coordinates (stored as integers * 1_000_000)
    slot_lat = slot["latitude"] / 1_000_000
    slot_lng = slot["longitude"] / 1_000_000
    
    # Calculate distance (simplified - in production use proper Haversine)
    distance_m = int(calculate_distance(target_lat, target_lng, slot_lat, slot_lng))
    
    # Convert price from MIST to RON (assuming 1 SUI = ~10 RON, adjust as needed)
    # basePricePerHour is in MIST (1 SUI = 1_000_000_000 MIST)
    price_per_hour_sui = slot["basePricePerHour"] / 1_000_000_000
    price_per_hour_ron = price_per_hour_sui * 10  # Adjust conversion rate as needed
    
    # Apply dynamic coefficient (in basis points, 10000 = 1x)
    dynamic_multiplier = slot.get("dynamicCoeff", 10000) / 10000
    price_per_hour_ron *= dynamic_multiplier
    
    return {
        "slot_id": slot["id"],
        "lat": slot_lat,
        "lng": slot_lng,
        "price_per_hour": round(price_per_hour_ron, 2),
        "distance_m": distance_m,
        "is_available": slot["status"] == 0,  # 0 = FREE
        "address": slot.get("locationName", ""),
        "covered": None,  # Not available in Sui data
        "safety_rating": None  # Not available in Sui data
    }


def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate distance between two coordinates using Haversine formula.
    Returns distance in meters.
    """
    import math
    
    R = 6371000  # Earth radius in meters
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    
    a = (
        math.sin(d_lat / 2) * math.sin(d_lat / 2) +
        math.cos(math.radians(lat1)) *
        math.cos(math.radians(lat2)) *
        math.sin(d_lon / 2) * math.sin(d_lon / 2)
    )
    
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


async def integrated_flow(user_message: str, network: str = "testnet"):
    """
    Complete integrated flow:
    1. Parse user intent
    2. Geocode location
    3. Query parking slots from Sui
    4. Recommend best slot
    5. Generate user message
    
    Args:
        user_message: User's natural language message
        network: Sui network to query
    """
    async with httpx.AsyncClient(timeout=30.0) as client:
        print("=" * 60)
        print("SuiPark Integrated Flow")
        print("=" * 60)
        print(f"User message: {user_message}\n")
        
        # Step 1: Parse user intent
        print("Step 1: Parsing user intent...")
        try:
            response = await client.post(
                f"{BASE_URL}/api/parse-intent",
                json={"message": user_message}
            )
            response.raise_for_status()
            intent = response.json()
            print(f"  ✓ Location: {intent['location_query']}")
            print(f"  ✓ Duration: {intent['duration_minutes']} minutes")
            print(f"  ✓ Max price: {intent.get('max_price', 'No limit')} RON")
            print()
        except Exception as e:
            print(f"  ✗ Error parsing intent: {e}")
            return
        
        # Step 2: Geocode location
        print("Step 2: Geocoding location...")
        try:
            response = await client.post(
                f"{BASE_URL}/api/geocode",
                json={"location_query": intent["location_query"]}
            )
            response.raise_for_status()
            location = response.json()
            target_lat = location["lat"]
            target_lng = location["lng"]
            print(f"  ✓ Coordinates: {target_lat}, {target_lng}")
            print(f"  ✓ Address: {location['formatted_address']}")
            print()
        except Exception as e:
            print(f"  ✗ Error geocoding: {e}")
            return
        
        # Step 3: Query parking slots from Sui
        print("Step 3: Querying parking slots from Sui blockchain...")
        sui_slots = await query_parking_slots_from_sui(
            network=network,
            target_lat=target_lat,
            target_lng=target_lng,
            radius_meters=5000  # 5km radius
        )
        
        if not sui_slots:
            print("  ✗ No parking slots found on Sui blockchain")
            print("  (This might be expected if no slots exist yet)")
            return
        
        print(f"  ✓ Found {len(sui_slots)} parking slot(s)")
        
        # Convert Sui slots to API format
        api_slots = [
            convert_sui_slot_to_api_format(slot, target_lat, target_lng)
            for slot in sui_slots
        ]
        
        # Filter available slots
        available_slots = [slot for slot in api_slots if slot["is_available"]]
        print(f"  ✓ {len(available_slots)} slot(s) available")
        print()
        
        if not available_slots:
            print("  ✗ No available parking slots found")
            return
        
        # Step 4: Recommend best slot
        print("Step 4: Recommending best slot...")
        try:
            # Prepare user intent for recommendation
            user_intent = {
                "location_query": intent["location_query"],
                "duration_minutes": intent["duration_minutes"],
                "max_price": intent.get("max_price"),
                "preferences": intent.get("preferences")
            }
            
            response = await client.post(
                f"{BASE_URL}/api/recommend-slot",
                json={
                    "user_intent": user_intent,
                    "location": {
                        "lat": target_lat,
                        "lng": target_lng
                    },
                    "slots": available_slots
                }
            )
            response.raise_for_status()
            recommendation = response.json()
            
            print(f"  ✓ Best slot: {recommendation['best_slot_id']}")
            print(f"  ✓ Explanation: {recommendation['explanation_for_user']}")
            print()
            
            # Find the best slot details
            best_slot = next(
                (s for s in available_slots if s["slot_id"] == recommendation["best_slot_id"]),
                None
            )
            
            if best_slot:
                # Calculate total price
                duration_hours = intent["duration_minutes"] / 60
                price_total = best_slot["price_per_hour"] * duration_hours
                
                # Step 5: Generate user message
                print("Step 5: Generating user message...")
                try:
                    response = await client.post(
                        f"{BASE_URL}/api/generate-user-message",
                        json={
                            "best_slot": {
                                "slot_id": best_slot["slot_id"],
                                "distance_m": best_slot["distance_m"],
                                "price_total": round(price_total, 2),
                                "address": best_slot["address"]
                            },
                            "user_intent": user_intent
                        }
                    )
                    response.raise_for_status()
                    message_response = response.json()
                    
                    print(f"  ✓ Message: {message_response['message']}")
                    print()
                    
                except Exception as e:
                    print(f"  ✗ Error generating message: {e}")
            
        except Exception as e:
            print(f"  ✗ Error recommending slot: {e}")
            import traceback
            traceback.print_exc()
            return
        
        print("=" * 60)
        print("✓ Flow completed successfully!")
        print("=" * 60)


async def main():
    """Main entry point."""
    if len(sys.argv) < 2:
        print("Usage: python integrated_test.py <user_message> [network]")
        print("\nExample:")
        print('  python integrated_test.py "I need parking near FSEGA for 2 hours, max 20 lei" testnet')
        sys.exit(1)
    
    user_message = sys.argv[1]
    network = sys.argv[2] if len(sys.argv) > 2 else "testnet"
    
    await integrated_flow(user_message, network)


if __name__ == "__main__":
    asyncio.run(main())
