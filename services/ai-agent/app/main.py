"""FastAPI main application for SuiPark Agent backend."""
import json
import logging
import re
from datetime import datetime
from typing import Optional, Tuple
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.models import (
    ParseIntentRequest,
    ParseIntentResponse,
    GeocodeRequest,
    GeocodeResponse,
    RecommendSlotRequest,
    RecommendSlotResponse,
    GenerateUserMessageRequest,
    GenerateUserMessageResponse,
    Preferences
)
from app.services.ai_logic import parse_user_intent, recommend_best_slot, generate_user_message
from app.services.maps_client import maps_client

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


def validate_start_hour(start_hour: Optional[str]) -> Tuple[bool, Optional[str]]:
    """
    Validate start_hour format and ensure it's not in the past.
    
    Returns:
        (is_valid, error_message) - is_valid is True if valid, False otherwise
    """
    if start_hour is None or start_hour.strip() == "":
        return (True, None)  # start_hour is optional
    
    # Check format HH:mm
    if not re.match(r'^\d{2}:\d{2}$', start_hour):
        return (False, f"Invalid time format. Please use HH:mm format (e.g., '14:30').")
    
    try:
        # Parse the time
        hour, minute = map(int, start_hour.split(':'))
        
        # Validate hour and minute ranges
        if hour < 0 or hour > 23:
            return (False, f"Invalid hour. Hour must be between 00 and 23.")
        if minute < 0 or minute > 59:
            return (False, f"Invalid minute. Minute must be between 00 and 59.")
        
        # Check if time is in the past
        current_time = datetime.now()
        current_hour = current_time.hour
        current_minute = current_time.minute
        
        # Compare times
        if hour < current_hour or (hour == current_hour and minute < current_minute):
            current_time_str = current_time.strftime("%H:%M")
            return (False, f"The start time you provided ({start_hour}) is in the past. Please provide a valid start time for today (current time is {current_time_str}).")
        
        return (True, None)
    except ValueError:
        return (False, f"Invalid time format. Please use HH:mm format (e.g., '14:30').")


# Create FastAPI app
app = FastAPI(
    title=settings.api_title,
    version=settings.api_version,
    description=settings.api_description
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify actual origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "SuiPark Agent API",
        "version": settings.api_version,
        "status": "running"
    }


@app.get("/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.post("/api/parse-intent", response_model=ParseIntentResponse)
async def parse_intent(request: ParseIntentRequest):
    """
    Parse user message into structured intent.
    
    Extracts location query, duration, max price, and preferences from natural language.
    """
    try:
        logger.info("=" * 80)
        logger.info("📨 API REQUEST: /api/parse-intent")
        logger.info("=" * 80)
        logger.info(f"Full user message: {request.message}")
        logger.info(f"Message length: {len(request.message)} characters")
        logger.info("=" * 80)
        
        # Convert conversation history to format expected by parse_user_intent
        conversation_history = None
        if request.conversation_history:
            conversation_history = [
                {"text": msg.text, "is_user": msg.is_user}
                for msg in request.conversation_history
            ]
        
        result = await parse_user_intent(request.message, conversation_history)
        
        # Check if clarification is needed
        needs_clarification = result.get("needs_clarification", False)
        clarification_message = result.get("clarification_message")
        is_more_request = result.get("is_more_request", False)
        
        # Get duration, location, and start_hour to check if clarification is really needed
        duration_minutes = result.get("duration_minutes")
        location_query = result.get("location_query")
        start_hour = result.get("start_hour")
        
        # Check if we actually need clarification (missing duration, location, or start_hour)
        missing_duration = duration_minutes is None or duration_minutes < 1
        missing_location = not location_query or location_query.strip() == ""
        missing_start_hour = not start_hour or start_hour.strip() == ""
        
        # Validate start_hour format and time if provided
        start_hour_valid = True
        if start_hour and start_hour.strip():
            start_hour_valid, start_hour_error = validate_start_hour(start_hour)
            if not start_hour_valid:
                # If start_hour is invalid, override clarification message
                clarification_message = start_hour_error
                needs_clarification = True
        else:
            # start_hour is missing (mandatory field)
            start_hour_valid = False
            missing_start_hour = True
        
        # If clarification is needed (either flagged or actually missing data), return clarification
        if needs_clarification or missing_duration or missing_location or missing_start_hour:
            # Use provided clarification message or generate a default one
            if clarification_message:
                msg = clarification_message
            elif missing_location and missing_duration and missing_start_hour:
                msg = "I'd be happy to help you find parking! Could you please tell me where you'd like to park, for how long, and what time you'd like to start? (e.g., 'at 14:30')"
            elif missing_location and missing_duration:
                msg = "I'd be happy to help you find parking! Could you please tell me where you'd like to park and for how long?"
            elif missing_location and missing_start_hour:
                msg = "I'd be happy to help you find parking! Could you please tell me where you'd like to park and what time you'd like to start? (e.g., 'at 14:30')"
            elif missing_duration and missing_start_hour:
                msg = "I'd be happy to help you find parking! Could you please tell me for how long you need to park and what time you'd like to start? (e.g., 'at 14:30')"
            elif missing_location:
                msg = "I'd be happy to help you find parking! Could you please tell me where you'd like to park?"
            elif missing_duration:
                msg = "I'd be happy to help you find parking! Could you please tell me for how long you need to park?"
            elif missing_start_hour:
                msg = "Perfect! What time would you like to start parking? (e.g., 'at 14:30' or 'at 2pm')"
            else:
                msg = "I need a bit more information to help you find parking. Could you please provide the location, duration, and start time?"
            
            response = ParseIntentResponse.create_clarification_response(msg)
            logger.info(f"Clarification needed: {msg}")
            return response
        
        # If start_hour was invalid, set it to None (shouldn't happen here since we return clarification above)
        if not start_hour_valid:
            start_hour = None
        
        # Ensure location_query is always a string (not None)
        if not location_query or location_query is None:
            location_query = ""  # Default to empty string if not found
        
        # Duration should be valid at this point, but set default just in case
        if duration_minutes is None or duration_minutes < 1:
            duration_minutes = 60  # Default to 1 hour if not specified
        
        # Convert preferences dict to Preferences model if present
        preferences = None
        if result.get("preferences"):
            prefs_dict = result["preferences"]
            preferences = Preferences(
                covered=prefs_dict.get("covered"),
                safety_priority=prefs_dict.get("safety_priority"),
                accessibility=prefs_dict.get("accessibility"),
                other=prefs_dict.get("other")
            )
        
        response = ParseIntentResponse(
            location_query=str(location_query),  # Ensure it's a string
            duration_minutes=int(duration_minutes),
            start_hour=start_hour if start_hour_valid else None,
            max_price=result.get("max_price"),
            preferences=preferences,
            needs_clarification=needs_clarification,
            clarification_message=clarification_message,
            is_more_request=is_more_request,
            requested_radius_km=result.get("requested_radius_km"),
            is_closest_request=result.get("is_closest_request", False),
            is_cheapest_request=result.get("is_cheapest_request", False)
        )
        
        logger.info(f"Parsed intent: location={response.location_query}, duration={response.duration_minutes}min, start_hour={response.start_hour}")
        return response
        
    except ValueError as e:
        logger.error(f"Error parsing intent: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error parsing intent: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.post("/api/geocode", response_model=GeocodeResponse)
async def geocode_location(request: GeocodeRequest):
    """
    Geocode a location query to get coordinates and formatted address.
    
    Uses Google Maps Geocoding API to convert location strings to coordinates.
    """
    try:
        logger.info("=" * 80)
        logger.info("📨 API REQUEST: /api/geocode")
        logger.info("=" * 80)
        logger.info(f"Location query: {request.location_query}")
        logger.info("=" * 80)
        
        result = await maps_client.geocode(request.location_query)
        
        logger.info(f"✅ Geocoding result: {json.dumps(result, indent=2)}")
        
        response = GeocodeResponse(
            lat=result["lat"],
            lng=result["lng"],
            formatted_address=result["formatted_address"]
        )
        
        logger.info(f"Geocoded to: {response.lat}, {response.lng}")
        return response
        
    except ValueError as e:
        logger.error(f"Error geocoding location: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error geocoding location: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.post("/api/recommend-slot", response_model=RecommendSlotResponse)
async def recommend_slot(request: RecommendSlotRequest):
    """
    Rank parking slots and recommend the best one based on user intent.
    
    Evaluates slots based on distance, price, availability, and user preferences.
    """
    try:
        logger.info("=" * 80)
        logger.info("📨 API REQUEST: /api/recommend-slot")
        logger.info("=" * 80)
        logger.info(f"User Intent: {json.dumps(request.user_intent.dict(), indent=2)}")
        logger.info(f"Location: lat={request.location.lat}, lng={request.location.lng}")
        logger.info(f"Available slots count: {len(request.slots)}")
        logger.info(f"Slots: {json.dumps([slot.dict() for slot in request.slots], indent=2)}")
        logger.info("=" * 80)
        
        location_dict = {
            "lat": request.location.lat,
            "lng": request.location.lng
        }
        
        result = await recommend_best_slot(
            user_intent=request.user_intent,
            location=location_dict,
            slots=request.slots
        )
        
        logger.info(f"✅ Recommendation result: best_slot_id={result.best_slot_id}, recommended_slot_ids={result.recommended_slot_ids}, explanation={result.explanation_for_user}")
        
        logger.info(f"Recommended slots: {result.recommended_slot_ids}")
        return result
        
    except ValueError as e:
        logger.error(f"Error recommending slot: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error recommending slot: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.post("/api/generate-user-message", response_model=GenerateUserMessageResponse)
async def generate_user_message_endpoint(request: GenerateUserMessageRequest):
    """
    Generate a friendly message for the user about the recommended parking slot.
    
    Creates a conversational message explaining the recommendation.
    """
    try:
        logger.info("=" * 80)
        logger.info("📨 API REQUEST: /api/generate-user-message")
        logger.info("=" * 80)
        logger.info(f"Best Slot: {json.dumps(request.best_slot.dict(), indent=2)}")
        logger.info(f"User Intent: {json.dumps(request.user_intent.dict(), indent=2)}")
        logger.info("=" * 80)
        
        best_slot_dict = {
            "slot_id": request.best_slot.slot_id,
            "distance_m": request.best_slot.distance_m,
            "price_total": request.best_slot.price_total,
            "address": request.best_slot.address
        }
        
        message = await generate_user_message(
            best_slot=best_slot_dict,
            user_intent=request.user_intent
        )
        
        response = GenerateUserMessageResponse(message=message)
        
        logger.info(f"✅ Generated message: {message}")
        return response
        
    except ValueError as e:
        logger.error(f"Error generating user message: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error generating user message: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    # Exclude .venv from watch to avoid unnecessary reloads
    uvicorn.run(
        app, 
        host="0.0.0.0", 
        port=8000,
        reload=True,
        reload_excludes=[".venv/*", "**/.venv/**"]
    )


