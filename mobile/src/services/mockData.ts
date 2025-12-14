// Mock data generators for fallback when backend APIs fail
import type { UserIntent, Location, Recommendation, ParkingSlot } from '../types';

// Mock parse intent
export const getMockIntent = (message: string): UserIntent => {
  // Simple parsing logic for mock
  const lowerMessage = message.toLowerCase();
  
  // Extract location
  let locationQuery = 'FSEGA area';
  if (lowerMessage.includes('near me') || lowerMessage.includes('nearby')) {
    locationQuery = 'Near me';
  } else if (lowerMessage.includes('fsega')) {
    locationQuery = 'FSEGA';
  } else if (lowerMessage.includes('city center') || lowerMessage.includes('city centre')) {
    locationQuery = 'City center';
  } else if (lowerMessage.includes('downtown')) {
    locationQuery = 'Downtown';
  }
  
  // Extract duration (default 2 hours)
  let durationMinutes = 120;
  const hourMatch = lowerMessage.match(/(\d+)\s*hour/i);
  const minuteMatch = lowerMessage.match(/(\d+)\s*minute/i);
  if (hourMatch) {
    durationMinutes = parseInt(hourMatch[1]) * 60;
  } else if (minuteMatch) {
    durationMinutes = parseInt(minuteMatch[1]);
  }
  
  // Extract max price
  let maxPrice: number | undefined;
  const priceMatch = lowerMessage.match(/(\d+)\s*(?:lei|ron|sui|€|\$)/i);
  if (priceMatch) {
    maxPrice = parseFloat(priceMatch[1]);
  }
  
  return {
    location_query: locationQuery,
    duration_minutes: durationMinutes,
    max_price: maxPrice,
    preferences: {},
  };
};

// Mock geocode
export const getMockLocation = (locationQuery: string): Location => {
  // Default to FSEGA coordinates if not recognized
  const locations: Record<string, Location> = {
    'near me': { lat: 46.766, lng: 23.599, formatted_address: 'Near your location' },
    'fsega': { lat: 46.7731747, lng: 23.6213941, formatted_address: 'Strada Teodor Mihali 58-60, Cluj-Napoca 400591, Romania' },
    'fsega area': { lat: 46.7731747, lng: 23.6213941, formatted_address: 'Strada Teodor Mihali 58-60, Cluj-Napoca 400591, Romania' },
    'city center': { lat: 46.770, lng: 23.590, formatted_address: 'City Center, Cluj-Napoca' },
    'downtown': { lat: 46.770, lng: 23.590, formatted_address: 'Downtown Cluj-Napoca' },
  };
  
  const lowerQuery = locationQuery.toLowerCase();
  for (const [key, location] of Object.entries(locations)) {
    if (lowerQuery.includes(key)) {
      return location;
    }
  }
  
  // Default location
  return locations['fsega'];
};

// Mock recommendation
export const getMockRecommendation = (
  slots: ParkingSlot[],
  userIntent: UserIntent
): Recommendation => {
  if (slots.length === 0) {
    return {
      best_slot_id: '',
      explanation_for_user: "I couldn't find any available parking spots. Please try a different location.",
      ranking: [],
    };
  }
  
  // Simple recommendation: closest available slot
  const sortedSlots = [...slots].sort((a, b) => a.distance_m - b.distance_m);
  const bestSlot = sortedSlots[0];
  
  // Create ranking for all slots (backend expects this format)
  const ranking = sortedSlots.map((slot, index) => ({
    slot_id: slot.slot_id,
    score: Math.max(0.1, 1 - (index * 0.15)), // Scores between 0.1 and 1.0
  }));
  
  return {
    best_slot_id: bestSlot.slot_id,
    explanation_for_user: `I found ${slots.length} great parking option${slots.length > 1 ? 's' : ''} near you! Here's what I recommend:`,
    ranking: ranking,
  };
};

// Mock user message generation
export const getMockUserMessage = (
  bestSlot: ParkingSlot,
  userIntent: UserIntent
): string => {
  const durationHours = userIntent.duration_minutes / 60;
  // Convert RON to SUI for display (1 SUI = 10 RON)
  const pricePerHourSui = bestSlot.price_per_hour / 10;
  const priceTotal = pricePerHourSui * durationHours;
  const address = bestSlot.address || 'the requested location';
  const locationName = userIntent.location_query || 'your location';
  
  return `I found a great parking spot ${bestSlot.distance_m}m away from ${locationName}! It costs ${priceTotal.toFixed(1)} SUI for ${durationHours}h. The location is ${address}. Would you like to reserve it?`;
};
