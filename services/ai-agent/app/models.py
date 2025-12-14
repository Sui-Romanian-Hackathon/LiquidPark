"""Pydantic models for request and response schemas."""
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


# ========== Parse Intent Models ==========

class ConversationMessage(BaseModel):
    """Single message in conversation history."""
    text: str = Field(..., description="Message text")
    is_user: bool = Field(..., description="Whether message is from user (True) or AI (False)")


class ParseIntentRequest(BaseModel):
    """Request model for /api/parse-intent endpoint."""
    message: str = Field(..., description="User's natural language message")
    conversation_history: Optional[List[ConversationMessage]] = Field(
        default_factory=list,
        description="Previous messages in the conversation (for context)"
    )


class Preferences(BaseModel):
    """User preferences extracted from intent."""
    covered: Optional[bool] = Field(None, description="Whether covered parking is preferred")
    safety_priority: Optional[str] = Field(None, description="Safety priority level: low, medium, high")
    accessibility: Optional[bool] = Field(None, description="Whether accessibility features are needed")
    other: Optional[str] = Field(None, description="Other preferences as free text")


class ParseIntentResponse(BaseModel):
    """Response model for /api/parse-intent endpoint."""
    location_query: str = Field(..., description="Location query string to be geocoded")
    duration_minutes: int = Field(..., ge=1, description="Duration in minutes")
    start_hour: Optional[str] = Field(None, description="Start time in HH:mm format (24-hour format, e.g., '14:30'). Must be in current day and not in the past.")
    max_price: Optional[float] = Field(None, ge=0, description="Maximum price in RON")
    preferences: Optional[Preferences] = Field(None, description="User preferences")
    needs_clarification: Optional[bool] = Field(False, description="Whether the user message needs clarification")
    clarification_message: Optional[str] = Field(None, description="Message asking for missing information")
    is_more_request: Optional[bool] = Field(False, description="Whether user is asking for more recommendations")
    requested_radius_km: Optional[float] = Field(None, ge=0, description="Requested search radius in kilometers (extracted from user message, e.g., 'more in max 3 km')")
    is_closest_request: Optional[bool] = Field(False, description="Whether user is asking for the closest parking spot")
    is_cheapest_request: Optional[bool] = Field(False, description="Whether user is asking for the cheapest parking spot")
    
    @classmethod
    def create_clarification_response(cls, clarification_message: str) -> "ParseIntentResponse":
        """Create a response for clarification requests with valid placeholder values."""
        return cls(
            location_query="",
            duration_minutes=1,  # Use minimum valid value for clarification
            start_hour=None,
            max_price=None,
            preferences=None,
            needs_clarification=True,
            clarification_message=clarification_message,
            is_more_request=False,
            requested_radius_km=None,
            is_closest_request=False,
            is_cheapest_request=False
        )


# ========== Geocode Models ==========

class GeocodeRequest(BaseModel):
    """Request model for /api/geocode endpoint."""
    location_query: str = Field(..., description="Location query string to geocode")


class GeocodeResponse(BaseModel):
    """Response model for /api/geocode endpoint."""
    lat: float = Field(..., description="Latitude")
    lng: float = Field(..., description="Longitude")
    formatted_address: str = Field(..., description="Formatted address from Google Maps")


# ========== Recommend Slot Models ==========

class UserIntent(BaseModel):
    """User intent structure."""
    location_query: str
    duration_minutes: int
    start_hour: Optional[str] = None
    max_price: Optional[float] = None
    preferences: Optional[Dict[str, Any]] = None
    is_more_request: Optional[bool] = False
    requested_radius_km: Optional[float] = None
    is_closest_request: Optional[bool] = False
    is_cheapest_request: Optional[bool] = False


class ParkingSlot(BaseModel):
    """Parking slot structure."""
    slot_id: str
    lat: float
    lng: float
    price_per_hour: float
    distance_m: int
    is_available: bool
    address: Optional[str] = None  # Real address (from reverse geocoding or form)
    location_name: Optional[str] = None  # Slot name/display name (from blockchain location_name)
    covered: Optional[bool] = None
    safety_rating: Optional[float] = None


class Location(BaseModel):
    """Location coordinates."""
    lat: float
    lng: float


class RecommendSlotRequest(BaseModel):
    """Request model for /api/recommend-slot endpoint."""
    user_intent: UserIntent
    location: Location
    slots: List[ParkingSlot]


class SlotRanking(BaseModel):
    """Single slot ranking entry."""
    slot_id: str
    score: float = Field(..., ge=0, le=1, description="Score between 0 and 1")


class RecommendSlotResponse(BaseModel):
    """Response model for /api/recommend-slot endpoint."""
    best_slot_id: str
    recommended_slot_ids: List[str] = Field(default_factory=list, description="List of recommended slot IDs (all slots for 'more', 1-3 for closest/cheapest, up to 3 for normal)")
    ranking: List[SlotRanking]
    explanation_for_user: str
    has_more_available: Optional[bool] = Field(False, description="Whether more slots are available beyond current radius")


# ========== Generate User Message Models ==========

class BestSlot(BaseModel):
    """Best slot information."""
    slot_id: str
    distance_m: int
    price_total: float
    address: str


class GenerateUserMessageRequest(BaseModel):
    """Request model for /api/generate-user-message endpoint."""
    best_slot: BestSlot
    user_intent: UserIntent


class GenerateUserMessageResponse(BaseModel):
    """Response model for /api/generate-user-message endpoint."""
    message: str


