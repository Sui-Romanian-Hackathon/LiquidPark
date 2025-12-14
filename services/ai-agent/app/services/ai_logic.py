"""AI logic helpers for intent parsing and slot ranking."""
import json
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime

from app.services.gemini_client import gemini_client
from app.services.maps_client import maps_client
from app.models import UserIntent, ParkingSlot, RecommendSlotResponse, SlotRanking

logger = logging.getLogger(__name__)


# System prompt for SuiPark Agent
SUIPARK_SYSTEM_PROMPT = """You are SuiPark Agent, an AI assistant that helps users find and reserve parking spots via Sui blockchain.

Your job is to:
- Parse user messages into structured JSON intents
- Rank candidate parking slots based on distance, price, duration, and preferences
- Generate short, friendly explanations

Always return valid JSON with the exact schema requested, with no extra commentary, markdown, or text outside the JSON."""


async def parse_user_intent(message: str, conversation_history: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    """
    Parse user message into structured intent using Gemini.
    
    Args:
        message: User's natural language message
        
    Returns:
        Dictionary with parsed intent: location_query, duration_minutes, max_price, preferences,
        needs_clarification, clarification_message, is_more_request
    """
    logger.info(f"📥 Received user message: {message}")
    logger.info(f"📚 Conversation history: {len(conversation_history or [])} previous messages")
    
    # Build conversation context from history
    # Constants for conversation management:
    # - CONVERSATION_HISTORY_WINDOW: Maximum messages to include in context (to avoid token limits)
    # - MAX_CONTEXT_LENGTH: Maximum characters in context string (safety limit)
    CONVERSATION_HISTORY_WINDOW = 10  # Maximum messages to include in context
    MAX_CONTEXT_LENGTH = 2000  # Maximum characters in context (approximate, prevents token overflow)
    
    conversation_context = ""
    if conversation_history:
        # Take last N messages for context (to avoid token limits)
        recent_history = conversation_history[-CONVERSATION_HISTORY_WINDOW:]
        
        # Build context string, but limit total length
        context_parts = []
        total_length = 0
        
        for msg in reversed(recent_history):  # Process from oldest to newest
            role = "User" if msg.get("is_user", True) else "AI"
            text = msg.get("text", "")
            msg_str = f"{role}: {text}\n"
            
            # Stop if we exceed max context length
            if total_length + len(msg_str) > MAX_CONTEXT_LENGTH:
                break
            
            context_parts.append(msg_str)
            total_length += len(msg_str)
        
        if context_parts:
            conversation_context = "\n\nPrevious conversation:\n" + "".join(reversed(context_parts)) + "\n"
    
    # Get current time for validation
    current_time = datetime.now()
    current_hour_minute = current_time.strftime("%H:%M")
    current_hour = current_time.hour
    current_minute = current_time.minute
    
    user_prompt = f"""Analyze this user message and extract parking intent. Return JSON with keys: location_query, duration_minutes, start_hour, max_price, preferences, needs_clarification, clarification_message, is_more_request, requested_radius_km, is_closest_request, is_cheapest_request.

{conversation_context}Current user message: "{message}"

CURRENT TIME: {current_hour_minute} (24-hour format, HH:mm)

CRITICAL INSTRUCTIONS:
1. MEMORY & CONTEXT: Use information from the conversation history above. If the user mentioned location, duration, or start time in previous messages, extract and use that information. The user may provide information across multiple messages - you MUST remember and combine information from all messages.

2. EXTRACT START_HOUR (MANDATORY FIELD): Extract the start time from the user's message. The start_hour is MANDATORY, just like location_query and duration_minutes. You MUST extract it or ask for clarification. The start_hour must be:
   - Format: "HH:mm" (24-hour format, e.g., "14:30", "09:15", "23:45")
   - Must be in the CURRENT DAY (today)
   - Must NOT be in the PAST (must be >= current time: {current_hour_minute})
   - Examples of valid extractions:
     * "at 14:30" -> start_hour: "14:30"
     * "starting at 9:15" -> start_hour: "09:15"
     * "from 18:00" -> start_hour: "18:00"
     * "la ora 15:30" -> start_hour: "15:30"
     * "at 2pm" -> start_hour: "14:00"
     * "at 9:30am" -> start_hour: "09:30"
     * "now" or "immediately" -> start_hour: current time rounded up to next 5 minutes (e.g., if current time is 18:52, use "18:55")
   - If user mentions a time in the PAST (before {current_hour_minute}), set start_hour to null and include a validation error in clarification_message
   - If no start time is mentioned AND it's not in conversation history, set start_hour to null and ask for clarification
   - IMPORTANT: Always use 24-hour format with leading zeros (e.g., "09:00" not "9:00")
   - CRITICAL: start_hour is REQUIRED - do not proceed with recommendations without it

3. If the message is asking for MORE recommendations (e.g., "show me more", "recommend more", "give me more options", "more please"), set is_more_request to true and extract any location/duration/start_hour from previous context if available.

4. EXTRACT RADIUS: If the user specifies a radius in their "more" request (e.g., "more in max 3 km", "more within 3 kilometers", "more in 3km radius"), extract the radius value in kilometers and set requested_radius_km to that number. If no radius is specified but is_more_request is true, set requested_radius_km to null (default will be 5km). Examples:
   - "more in max 3 km" -> requested_radius_km: 3
   - "more within 5 kilometers" -> requested_radius_km: 5
   - "more please" -> requested_radius_km: null (use default)

5. DETECT CLOSEST REQUEST: If the user asks for the closest/nearest parking spot (e.g., "give me the closest one", "nearest parking", "closest spot", "cel mai aproape"), set is_closest_request to true.

6. DETECT CHEAPEST REQUEST: If the user asks for the cheapest/lowest price parking spot (e.g., "give me the cheapest one", "lowest price", "cheapest spot", "cel mai ieftin"), set is_cheapest_request to true.

7. If the message is MISSING CRITICAL INFORMATION (location_query OR duration_minutes OR start_hour) AND this information is NOT in the conversation history, you MUST:
   - Set needs_clarification to true
   - Set clarification_message to a friendly, conversational English message asking ONLY for the missing information (don't ask for what was already provided)
   - DO NOT invent or guess missing values - use null/empty for missing fields
   - Examples:
     * If location was provided but duration is missing: "Great! How long do you need to park?"
     * If location and duration are provided but start_hour is missing: "Perfect! What time would you like to start parking? (e.g., 'at 14:30' or 'at 2pm')"
     * If only start_hour is missing: "What time would you like to start parking? (e.g., 'at 14:30' or 'at 2pm')"
   - CRITICAL: All three fields (location_query, duration_minutes, start_hour) are MANDATORY - you cannot recommend slots without all of them

8. VALIDATE START_HOUR: If start_hour is provided but is in the past (before {current_hour_minute}), you MUST:
   - Set start_hour to null
   - Set needs_clarification to true
   - Set clarification_message to a message like: "The start time you provided is in the past. Please provide a valid start time for today (current time is {current_hour_minute})."
   - This validation takes priority over other clarifications

9. If ALL THREE MANDATORY FIELDS (location_query AND duration_minutes AND start_hour) are present (from current message OR conversation history), and start_hour is valid (not in the past), set needs_clarification to false. Otherwise, set needs_clarification to true.

10. The preferences object should include optional fields like:
   - covered (boolean): whether covered parking is preferred
   - safety_priority (string): "low", "medium", or "high"
   - accessibility (boolean): whether accessibility features are needed
   - other (string): any other preferences as free text

11. For location_query: extract the location from current message OR conversation history, or empty string if not found anywhere
12. For duration_minutes: extract duration in minutes from current message OR conversation history, or null if not found anywhere (DO NOT invent a default)
13. For max_price: extract maximum price in RON, or null if not mentioned

Remember: 
- USE CONVERSATION HISTORY to fill in missing information
- NEVER invent values for location_query, duration_minutes, or start_hour
- If information is missing AND not in history, ask for clarification
- Only ask for what's actually missing, not what was already provided
- requested_radius_km should be a number (float) in kilometers, or null if not specified
- start_hour is MANDATORY - you MUST have it before recommending slots
- start_hour must be in "HH:mm" format (24-hour, with leading zeros)
- start_hour must be >= current time ({current_hour_minute})
- DO NOT proceed with recommendations if start_hour is missing or invalid"""

    schema = {
        "location_query": "string - the location as written by the user, empty string if not found",
        "duration_minutes": "integer or null - duration in minutes, null if not found (DO NOT invent)",
        "start_hour": "string or null - start time in HH:mm format (24-hour format, e.g., '14:30', '09:15'). Must be >= current time. null if not provided or invalid",
        "max_price": "float or null - maximum price in RON",
        "preferences": {
            "covered": "boolean or null",
            "safety_priority": "string or null (low/medium/high)",
            "accessibility": "boolean or null",
            "other": "string or null"
        },
        "needs_clarification": "boolean - true if location_query OR duration_minutes OR start_hour is missing, or if start_hour is invalid (in the past)",
        "clarification_message": "string or null - friendly message asking for missing info or indicating validation error, null if not needed",
        "is_more_request": "boolean - true if user is asking for more recommendations",
        "requested_radius_km": "float or null - requested search radius in kilometers (extract from message like 'more in max 3 km', null if not specified)",
        "is_closest_request": "boolean - true if user is asking for the closest parking spot",
        "is_cheapest_request": "boolean - true if user is asking for the cheapest parking spot"
    }
    
    logger.info(f"🤖 Sending to Gemini - System Prompt: {SUIPARK_SYSTEM_PROMPT[:200]}...")
    logger.info(f"🤖 Sending to Gemini - User Prompt: {user_prompt}")
    logger.info(f"🤖 Sending to Gemini - Schema: {json.dumps(schema, indent=2)}")
    
    result = await gemini_client.generate_json(
        system_prompt=SUIPARK_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        response_schema=schema
    )
    
    logger.info(f"✅ Gemini response: {json.dumps(result, indent=2)}")
    
    return result


async def recommend_best_slot(
    user_intent: UserIntent,
    location: Dict[str, float],
    slots: List[ParkingSlot]
) -> RecommendSlotResponse:
    """
    Rank parking slots and select the best one using Gemini.
    
    Args:
        user_intent: User's intent with preferences
        location: Target location coordinates
        slots: List of available parking slots
        
    Returns:
        RecommendSlotResponse with best slot, ranking, and explanation
    """
    # Prepare slot data for Gemini
    # Calculate price_total for each slot based on duration
    duration_hours = user_intent.duration_minutes / 60.0
    slots_data = []
    for slot in slots:
        # Calculate total price for the duration
        price_total = slot.price_per_hour * duration_hours
        
        slot_dict = {
            "slot_id": slot.slot_id,
            "lat": slot.lat,
            "lng": slot.lng,
            "price_per_hour": slot.price_per_hour,
            "price_total": round(price_total, 2),  # Total price for the duration
            "distance_m": slot.distance_m,
            "is_available": slot.is_available,
            "address": slot.address or slot.location_name or "Address not available",
            "location_name": slot.location_name,  # Slot name/display name
            "covered": slot.covered,
            "safety_rating": slot.safety_rating
        }
        slots_data.append(slot_dict)
    
    # Check if this is a "more", "closest", or "cheapest" request
    is_more_request = getattr(user_intent, 'is_more_request', False)
    is_closest_request = getattr(user_intent, 'is_closest_request', False)
    is_cheapest_request = getattr(user_intent, 'is_cheapest_request', False)
    
    user_prompt = f"""Given this user intent and the list of parking slots, compute the best_slot_id, recommended_slot_ids, ranking, explanation_for_user, and has_more_available, and return them as JSON.

User Intent:
- Location query: {user_intent.location_query}
- Duration: {user_intent.duration_minutes} minutes
- Max price: {user_intent.max_price if user_intent.max_price else 'No limit'}
- Preferences: {json.dumps(user_intent.preferences or {})}
- Is more request: {is_more_request}
- Is closest request: {is_closest_request}
- Is cheapest request: {is_cheapest_request}

Target Location:
- Latitude: {location['lat']}
- Longitude: {location['lng']}

Available Slots:
{json.dumps(slots_data, indent=2)}

Evaluate each slot based on:
1. Distance from target location (closer is better)
2. Total price (price_total) considering duration and max_price constraint
3. Availability
4. User preferences (covered, safety, etc.)

Note: price_total is already calculated for the requested duration ({user_intent.duration_minutes} minutes).

CRITICAL INSTRUCTIONS FOR recommended_slot_ids:
- If is_more_request is TRUE: Return ALL slot IDs in recommended_slot_ids (sorted by score descending), not just 3. The user wants to see all available options.
- If is_closest_request is TRUE: Return ONLY the closest slot ID (the one with minimum distance_m), OR return up to 3 slots with the closest one first. The explanation should emphasize it's the closest option.
- If is_cheapest_request is TRUE: Return ONLY the cheapest slot ID (the one with minimum price_total), OR return up to 3 slots with the cheapest one first. The explanation should emphasize it's the cheapest option.
- Otherwise (normal request): Return TOP 3 slot IDs (or all slots if less than 3 available), sorted by score descending.

CRITICAL INSTRUCTIONS:
- best_slot_id: the ID of the single best slot (closest if is_closest_request, cheapest if is_cheapest_request, otherwise best overall)
- recommended_slot_ids: array of slot IDs based on the rules above
- ranking: array of ALL slots with slot_id and score (0-1), sorted by score descending (or by distance if closest, or by price if cheapest)
- explanation_for_user: a short, friendly explanation (1-2 sentences). For closest/cheapest requests, mention that it's the closest/cheapest option. For more requests, mention all available options.
- has_more_available: true if there might be more slots available beyond the current search radius (set to false if you're confident all nearby slots are shown)

Return JSON with these exact keys."""

    schema = {
        "best_slot_id": "string - ID of the best slot",
        "recommended_slot_ids": [
            "string - array of slot IDs: ALL slots if is_more_request, 1-3 slots if closest/cheapest, up to 3 for normal"
        ],
        "ranking": [
            {
                "slot_id": "string",
                "score": "float between 0 and 1"
            }
        ],
        "explanation_for_user": "string - short explanation mentioning top recommendations",
        "has_more_available": "boolean - whether more slots might be available beyond current radius"
    }
    
    logger.info(f"🤖 Recommending slot - User Intent: {json.dumps(user_intent.dict(), indent=2)}")
    logger.info(f"🤖 Recommending slot - Location: {json.dumps(location, indent=2)}")
    logger.info(f"🤖 Recommending slot - Available Slots ({len(slots)}): {json.dumps(slots_data, indent=2)}")
    logger.info(f"🤖 Sending to Gemini - User Prompt: {user_prompt[:500]}...")
    
    result = await gemini_client.generate_json(
        system_prompt=SUIPARK_SYSTEM_PROMPT,
        user_prompt=user_prompt,
        response_schema=schema
    )
    
    logger.info(f"✅ Gemini recommendation response: {json.dumps(result, indent=2)}")
    
    # Convert to Pydantic model
    ranking = [SlotRanking(**item) for item in result["ranking"]]
    
    # Create a mapping of slot_id to slot data for easy lookup
    slot_dict = {slot.slot_id: slot for slot in slots}
    
    # Ensure recommended_slot_ids is a list and has at least best_slot_id
    recommended_slot_ids = result.get("recommended_slot_ids", [])
    if not recommended_slot_ids or result["best_slot_id"] not in recommended_slot_ids:
        # If not provided or best_slot_id missing, ensure best_slot_id is first
        recommended_slot_ids = [result["best_slot_id"]] + [sid for sid in recommended_slot_ids if sid != result["best_slot_id"]]
    
    # Handle different request types - but respect what AI returned
    if is_more_request:
        # For "more" requests, AI should return ALL slots
        # If AI returned fewer slots than available, add the missing ones
        all_slot_ids = [slot.slot_id for slot in slots]
        if len(recommended_slot_ids) < len(all_slot_ids):
            ranking_dict = {r.slot_id: r.score for r in ranking}
            missing_slot_ids = [sid for sid in all_slot_ids if sid not in recommended_slot_ids]
            # Sort missing slots by score (from ranking) or by distance as fallback
            missing_slot_ids.sort(key=lambda sid: (
                ranking_dict.get(sid, 0),
                -slot_dict[sid].distance_m if sid in slot_dict else 999999
            ), reverse=True)
            # Append missing slots to the end
            recommended_slot_ids = recommended_slot_ids + missing_slot_ids
        # Ensure best_slot_id is first if not already
        if recommended_slot_ids and recommended_slot_ids[0] != result["best_slot_id"]:
            recommended_slot_ids = [result["best_slot_id"]] + [sid for sid in recommended_slot_ids if sid != result["best_slot_id"]]
        # Don't limit - return all slots that AI recommended
    elif is_closest_request or is_cheapest_request:
        # For closest/cheapest requests, use what AI returned (should be 1-3 slots)
        # Ensure best_slot_id is first
        if recommended_slot_ids and recommended_slot_ids[0] != result["best_slot_id"]:
            recommended_slot_ids = [result["best_slot_id"]] + [sid for sid in recommended_slot_ids if sid != result["best_slot_id"]]
        # Don't limit - respect AI's decision (should be 1-3)
    else:
        # Normal request: use what AI returned (should be up to 3)
        # Don't limit - respect AI's decision
        # But ensure we don't exceed reasonable limits (e.g., 10 slots max for normal requests)
        if len(recommended_slot_ids) > 10:
            recommended_slot_ids = recommended_slot_ids[:10]  # Safety limit
    
    return RecommendSlotResponse(
        best_slot_id=result["best_slot_id"],
        recommended_slot_ids=recommended_slot_ids,
        ranking=ranking,
        explanation_for_user=result["explanation_for_user"],
        has_more_available=result.get("has_more_available", False)
    )


async def generate_user_message(
    best_slot: Dict[str, Any],
    user_intent: UserIntent
) -> str:
    """
    Generate a friendly message for the user about the recommended slot.
    
    Args:
        best_slot: Best slot information
        user_intent: User's intent
        
    Returns:
        Generated message string
    """
    user_prompt = f"""Generate a friendly, concise message for the chat UI about this parking slot recommendation.

Best Slot:
- Slot ID: {best_slot['slot_id']}
- Distance: {best_slot['distance_m']} meters
- Total Price: {best_slot['price_total']} RON
- Address: {best_slot['address']}

User Intent:
- Duration: {user_intent.duration_minutes} minutes

Write a short, friendly message (1-2 sentences) that:
- Mentions the distance and price
- Mentions the duration
- Asks if the user wants to proceed with reservation on Sui
- Keep it conversational and helpful

Return ONLY the message text, no JSON, no markdown, just the plain message."""

    logger.info(f"🤖 Generating user message - Best Slot: {json.dumps(best_slot, indent=2)}")
    logger.info(f"🤖 Generating user message - User Intent: {json.dumps(user_intent.dict(), indent=2)}")
    logger.info(f"🤖 Sending to Gemini - User Prompt: {user_prompt}")
    
    message = await gemini_client.generate_text(
        system_prompt=SUIPARK_SYSTEM_PROMPT,
        user_prompt=user_prompt
    )
    
    logger.info(f"✅ Gemini generated message: {message}")
    
    return message.strip()


