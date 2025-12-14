// Chat service that orchestrates the full flow
import {
  parseIntent,
  geocodeLocation,
  queryParkingSlots,
  recommendSlot,
  generateUserMessage,
  convertSlotToCard,
} from './api';
import type { UserIntent, ParkingSlot, ParkingSpotCard, ChatMessage, Location, Recommendation } from '../types';
import { config } from '../config';

export interface ChatFlowResult {
  message: string;
  recommendedSlot?: ParkingSpotCard;
  recommendedSlots?: ParkingSpotCard[]; // Multiple recommended slots (up to 3)
  allSlots?: ParkingSlot[];
  needsClarification?: boolean;
  isMoreRequest?: boolean;
}

// Helper function to transform technical errors into user-friendly messages
const getUserFriendlyError = (error: any, step: string): string => {
  const errorMessage = error?.message || '';
  const errorString = JSON.stringify(error).toLowerCase();
  
  // Network/Connection errors
  if (errorMessage.includes('timeout') || errorMessage.includes('exceeded')) {
    return "The request took too long. The service might be slow right now. Please try again in a moment.";
  }
  
  if (errorMessage.includes('network') || errorMessage.includes('connect') || errorMessage.includes('ECONNREFUSED')) {
    return "I couldn't connect to the service. Please check your internet connection.";
  }
  
  // Geocoding errors
  if (errorMessage.includes('geocod') || errorString.includes('zero_results') || errorString.includes('zero results')) {
    return `I couldn't find that location. Could you try rephrasing it? For example: "near FSEGA" or "downtown Cluj".`;
  }
  
  // HTTP status errors
  if (error?.response) {
    const status = error.response.status;
    const detail = error.response.data?.detail || '';
    
    if (status === 400) {
      if (detail.includes('geocod') || detail.includes('location')) {
        return "I couldn't understand that location. Please try a different way to describe it, like a street name or landmark.";
      }
      return "I couldn't process that request. Please try rephrasing your message.";
    }
    
    if (status === 404) {
      return "The service is temporarily unavailable. Please try again in a moment.";
    }
    
    if (status === 422) {
      return "I couldn't understand your request. Please try asking again with more details, like location and duration.";
    }
    
    if (status >= 500) {
      return "The service is experiencing issues right now. Please try again in a few moments.";
    }
    
    // Try to extract user-friendly message from detail
    if (detail && !detail.includes('error') && !detail.includes('failed')) {
      return detail;
    }
  }
  
  // Default friendly message
  return "I'm sorry, something went wrong. Please try asking again or rephrasing your request.";
};

// Simple radius logic: always use 5km
const DEFAULT_SEARCH_RADIUS = 5000; // Default radius: 5km (used for all searches)
const DEFAULT_MORE_RADIUS = 5000; // Radius for "more" requests: 5km (same as default)

export const processUserMessage = async (
  userMessage: string,
  network: string = 'testnet',
  currentRadius: number = 5000, // Default starting radius: 5km
  conversationHistory?: Array<{ text: string; is_user: boolean }> // Previous messages for context
): Promise<ChatFlowResult> => {
  try {
    // Step 1: Parse user intent (with conversation history for context)
    let intent: UserIntent;
    try {
      intent = await parseIntent(userMessage, conversationHistory);
    } catch (error: any) {
      console.error('Error parsing intent:', error);
      
      // Check if it's a network error
      if (error?.code === 'ERR_NETWORK' || error?.message?.includes('Network Error') || error?.message?.includes('NetworkError')) {
        return {
          message: `I can't connect to the AI service at ${config.aiAgentApiUrl}. Please make sure:\n\n1. The backend server is running (cd services/ai-agent && uvicorn app.main:app --host 0.0.0.0 --port 8000)\n2. Your phone and computer are on the same WiFi network\n3. The IP address in config is correct (${config.aiAgentApiUrl})`,
        };
      }
      
      return {
        message: getUserFriendlyError(error, 'parsing intent'),
      };
    }
    
    // Check if clarification is needed
    if (intent.needs_clarification && intent.clarification_message) {
      return {
        message: intent.clarification_message,
        needsClarification: true,
      };
    }
    
    // Simple radius logic: always use 5km, or user-specified radius for "more" requests
    let searchRadius = DEFAULT_SEARCH_RADIUS; // Default: 5km for all searches
    
    if (intent.is_more_request) {
      // For "more" requests, use user-specified radius if provided, otherwise 5km
      if (intent.requested_radius_km && intent.requested_radius_km > 0) {
        searchRadius = intent.requested_radius_km * 1000; // Convert km to meters
        console.log(`📈 Using user-requested radius: ${searchRadius}m (${intent.requested_radius_km}km) for more recommendations`);
      } else {
        searchRadius = DEFAULT_MORE_RADIUS; // 5km
        console.log(`📈 Using default radius: ${searchRadius}m (5km) for more recommendations`);
      }
    } else {
      // Regular request: always use 5km
      searchRadius = DEFAULT_SEARCH_RADIUS;
    }
    
    // Step 2: Geocode location (skip if more request and we have location from previous context)
    let location: Location;
    try {
      if (intent.is_more_request && intent.location_query && intent.location_query.trim() !== '') {
        // Try to geocode, but if it fails, we might need previous context
        location = await geocodeLocation(intent.location_query);
      } else if (!intent.location_query || intent.location_query.trim() === '') {
        return {
          message: "I need to know where you'd like to park. Could you please provide the location?",
          needsClarification: true,
        };
      } else {
        location = await geocodeLocation(intent.location_query);
      }
    } catch (error: any) {
      console.error('Error geocoding location:', error);
      if (intent.is_more_request) {
        return {
          message: "I need the location to find more parking spots. Could you please tell me where you'd like to park?",
          needsClarification: true,
        };
      }
      return {
        message: getUserFriendlyError(error, 'geocoding location'),
      };
    }
    
    // Step 3: Calculate requested time interval from start_hour and duration
    let requestedStartTime: number | undefined;
    let requestedEndTime: number | undefined;
    
    if (intent.start_hour && intent.duration_minutes) {
      try {
        // Parse start_hour (HH:mm format, e.g., "14:30")
        const [hours, minutes] = intent.start_hour.split(':').map(Number);
        const now = new Date();
        const requestedStart = new Date(now);
        requestedStart.setHours(hours, minutes, 0, 0);
        
        // If start time is earlier today, assume it's for tomorrow
        if (requestedStart < now) {
          requestedStart.setDate(requestedStart.getDate() + 1);
        }
        
        requestedStartTime = requestedStart.getTime();
        requestedEndTime = requestedStartTime + (intent.duration_minutes * 60 * 1000);
        
        console.log('📅 Calculated time interval:', {
          start_hour: intent.start_hour,
          duration_minutes: intent.duration_minutes,
          requestedStartTime: new Date(requestedStartTime).toISOString(),
          requestedEndTime: new Date(requestedEndTime).toISOString(),
        });
      } catch (error) {
        console.error('Error parsing start_hour:', error);
        // Continue without time filter if parsing fails
      }
    }
    
    // Step 4: Query parking slots from Sui blockchain with current radius and time interval
    let slots: ParkingSlot[];
    try {
      slots = await queryParkingSlots(
        network,
        location.lat,
        location.lng,
        searchRadius,
        true,
        requestedStartTime,
        requestedEndTime
      );
    } catch (error: any) {
      console.error('Error querying parking slots:', error);
      return {
        message: "I couldn't search for parking spots right now. Please check your connection and try again.",
      };
    }
    
    // Filter slots by distance threshold
    const filteredSlots = slots.filter(slot => slot.distance_m <= searchRadius);
    
    if (filteredSlots.length === 0) {
      if (intent.is_more_request && searchRadius >= DEFAULT_MORE_RADIUS) {
        return {
          message: "These are all the available parking spots within 5km. I couldn't find any more options.",
          isMoreRequest: true,
        };
      }
      return {
        message: "I couldn't find any available parking spots near that location. Try searching in a different area!",
      };
    }
    
    // Step 4: Recommend slots
    let recommendation: Recommendation;
    try {
      recommendation = await recommendSlot(intent, location, filteredSlots);
    } catch (error: any) {
      console.error('Error recommending slot:', error);
      // If we have slots but recommendation fails, still show them
      return {
        message: "I found some parking options, but couldn't rank them. Let me show you what's available.",
        allSlots: filteredSlots,
      };
    }
    
    // Find recommended slots (could be all slots for "more", 1-3 for closest/cheapest, or up to 3 for normal)
    const recommendedSlotIds = recommendation.recommended_slot_ids || [recommendation.best_slot_id];
    const recommendedSlots = recommendedSlotIds
      .map(slotId => filteredSlots.find(s => s.slot_id === slotId))
      .filter((slot): slot is ParkingSlot => slot !== undefined);
    
    if (recommendedSlots.length === 0) {
      return {
        message: recommendation.explanation_for_user || "I found some parking options, but couldn't determine the best ones.",
        allSlots: filteredSlots,
      };
    }
    
    // Step 5: Generate user message
    // If we have multiple recommendations, use the explanation_for_user which should mention them
    // Otherwise, generate a custom message for single slot
    let message: string;
    if (recommendedSlots.length > 1) {
      // Use the explanation which should mention multiple recommendations
      message = recommendation.explanation_for_user || `I found ${recommendedSlots.length} great parking spots for you!`;
    } else {
      // Generate custom message for single slot
      const bestSlot = recommendedSlots[0];
      try {
        const durationHours = intent.duration_minutes / 60;
        const priceTotal = bestSlot.price_per_hour * durationHours;
        const displayAddress = bestSlot.address || bestSlot.location_name || bestSlot.locationName || 'Address not available';
        
        message = await generateUserMessage(
          {
            slot_id: bestSlot.slot_id,
            distance_m: bestSlot.distance_m,
            price_total: Math.round(priceTotal * 100) / 100,
            address: displayAddress,
          },
          intent
        );
      } catch (error: any) {
        console.error('Error generating user message:', error);
        message = recommendation.explanation_for_user || "I found a great parking spot for you!";
      }
    }
    
    // Convert all recommended slots to card format
    const recommendedCards = recommendedSlots.map(slot => 
      convertSlotToCard(slot, intent.duration_minutes / 60, intent.start_hour || undefined)
    );
    
    // Check if more slots are available beyond current radius
    const hasMoreAvailable = recommendation.has_more_available || 
      (searchRadius < DEFAULT_MORE_RADIUS && 
       slots.some(s => s.distance_m > searchRadius));
    
    // Enhance message if more are available
    if (hasMoreAvailable && !intent.is_more_request) {
      message += " If you'd like to see more options, just ask for more recommendations!";
    } else if (intent.is_more_request && !hasMoreAvailable && searchRadius >= DEFAULT_MORE_RADIUS) {
      const radiusKm = searchRadius / 1000;
      message = `These are all the available parking spots within ${radiusKm}km of your location.`;
    }
    
    console.log(`✅ Returning ${recommendedCards.length} recommended slots`);
    
    return {
      message: message || recommendation.explanation_for_user || "I found great parking spots for you!",
      recommendedSlot: recommendedCards[0], // Keep for backward compatibility
      recommendedSlots: recommendedCards, // New: multiple recommendations
      allSlots: filteredSlots,
      isMoreRequest: intent.is_more_request || false,
    };
  } catch (error: any) {
    console.error('Unexpected error processing user message:', error);
    
    // Last resort: provide a friendly error message
    return {
      message: getUserFriendlyError(error, 'processing request'),
    };
  }
};

// Helper to create chat messages
export const createChatMessage = (
  text: string,
  isUser: boolean = false,
  system: boolean = false
): ChatMessage => {
  return {
    _id: Date.now() + Math.random(),
    text,
    createdAt: new Date(),
    user: {
      _id: isUser ? 1 : 2,
      name: isUser ? 'You' : 'Parking Agent',
      avatar: isUser ? undefined : 'P',
    },
    system,
  };
};
