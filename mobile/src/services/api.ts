// API service for backend communication
import axios from 'axios';
import type { UserIntent, Location, Recommendation, ParkingSlot, ParkingSpotCard } from '../types';
import { config } from '../config';
import { convertSuiSlotsToApiFormat } from './slotConverter';

// Base URLs - adjust these to match your backend
const AI_AGENT_API_URL = config.aiAgentApiUrl;
const SUI_API_URL = config.suiApiUrl;

const aiAgentClient = axios.create({
  baseURL: AI_AGENT_API_URL,
  timeout: 120000, // 120 seconds timeout (2 minutes) - Gemini can take longer for complex requests
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add response interceptor for better error handling
aiAgentClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Log detailed error info for debugging (only in development, not shown to users)
    if (__DEV__) {
      const fullUrl = error.config ? `${error.config.baseURL}${error.config.url}` : 'unknown';
      
      if (error.response) {
        // Server responded with error status
        console.warn(`[DEBUG] AI Agent API Error ${error.response.status}:`, {
          fullUrl,
          method: error.config?.method,
          data: error.response.data,
          status: error.response.status,
        });
      } else if (error.request) {
        // Request made but no response (network error, backend down)
        console.warn('[DEBUG] AI Agent API Network Error:', {
          fullUrl,
          baseURL: error.config?.baseURL,
          attemptedUrl: error.config?.url,
          message: error.message,
        });
      } else {
        // Something else happened
        console.warn('[DEBUG] AI Agent API Error:', {
          message: error.message,
          fullUrl,
        });
      }
    }
    
    // Enhance error with user-friendly context
    if (error.response?.data?.detail) {
      error.userMessage = error.response.data.detail;
    }
    
    return Promise.reject(error);
  }
);

const suiClient = axios.create({
  baseURL: SUI_API_URL,
  timeout: 60000, // 60 seconds timeout
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add response interceptor for better error handling
suiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Log detailed error info for debugging (only in development, not shown to users)
    if (__DEV__) {
      const fullUrl = error.config ? `${error.config.baseURL}${error.config.url}` : 'unknown';
      
      if (error.response) {
        console.warn(`[DEBUG] Sui API Error ${error.response.status}:`, {
          fullUrl,
          method: error.config?.method,
          data: error.response.data,
        });
      } else if (error.request) {
        console.warn('[DEBUG] Sui API Network Error:', {
          fullUrl,
          baseURL: error.config?.baseURL,
          attemptedUrl: error.config?.url,
          message: error.message,
        });
      }
    }
    
    // Enhance error with user-friendly context
    if (error.response?.data?.error) {
      error.userMessage = error.response.data.error;
    }
    
    return Promise.reject(error);
  }
);

// AI Agent API endpoints
export const parseIntent = async (
  message: string,
  conversationHistory?: Array<{ text: string; is_user: boolean }>
): Promise<UserIntent> => {
  try {
    const requestBody: any = { message };
    if (conversationHistory && conversationHistory.length > 0) {
      requestBody.conversation_history = conversationHistory.map(msg => ({
        text: msg.text,
        is_user: msg.is_user,
      }));
    }
    
    const response = await aiAgentClient.post('/api/parse-intent', requestBody);
    return response.data;
  } catch (error: any) {
    // Log detailed error for debugging
    if (__DEV__) {
      console.error('[parseIntent] Full error details:', {
        message: error.message,
        code: error.code,
        config: error.config ? {
          url: error.config.url,
          baseURL: error.config.baseURL,
          method: error.config.method,
        } : null,
        request: error.request ? 'Request made but no response' : null,
        response: error.response ? {
          status: error.response.status,
          data: error.response.data,
        } : null,
      });
    }
    throw error;
  }
};

export const geocodeLocation = async (locationQuery: string): Promise<Location> => {
  const response = await aiAgentClient.post('/api/geocode', {
    location_query: locationQuery,
  });
  return response.data;
};

export const recommendSlot = async (
  userIntent: UserIntent,
  location: Location,
  slots: ParkingSlot[]
): Promise<Recommendation> => {
  // Format user_intent to match backend expectations exactly
  const formattedUserIntent = {
    location_query: userIntent.location_query,
    duration_minutes: userIntent.duration_minutes,
    start_hour: userIntent.start_hour ?? null,
    max_price: userIntent.max_price ?? null,
    preferences: userIntent.preferences || null, // Backend expects dict or null
    is_more_request: userIntent.is_more_request ?? false,
    requested_radius_km: userIntent.requested_radius_km ?? null,
    is_closest_request: userIntent.is_closest_request ?? false,
    is_cheapest_request: userIntent.is_cheapest_request ?? false,
  };
  
  // Ensure slots are in correct format (only required fields)
  const formattedSlots = slots.map(slot => ({
    slot_id: slot.slot_id,
    lat: slot.lat,
    lng: slot.lng,
    price_per_hour: slot.price_per_hour,
    distance_m: slot.distance_m,
    is_available: slot.is_available,
    address: slot.address || null, // Real address (preferred)
    location_name: slot.location_name || slot.locationName || null, // Slot name/display name
    covered: slot.covered ?? null,
    safety_rating: slot.safety_rating ?? null,
  }));
  
  const response = await aiAgentClient.post('/api/recommend-slot', {
    user_intent: formattedUserIntent,
    location: {
      lat: location.lat,
      lng: location.lng,
    },
    slots: formattedSlots,
  });
  return response.data;
};

export const generateUserMessage = async (
  bestSlot: { slot_id: string; distance_m: number; price_total: number; address: string },
  userIntent: UserIntent
): Promise<string> => {
  // Format user_intent to match backend expectations exactly
  const formattedUserIntent = {
    location_query: userIntent.location_query,
    duration_minutes: userIntent.duration_minutes,
    max_price: userIntent.max_price ?? null,
    preferences: userIntent.preferences || null,
  };
  
  const response = await aiAgentClient.post('/api/generate-user-message', {
    best_slot: {
      slot_id: bestSlot.slot_id,
      distance_m: bestSlot.distance_m,
      price_total: bestSlot.price_total,
      address: bestSlot.address,
    },
    user_intent: formattedUserIntent,
  });
  return response.data.message;
};

// Sui API endpoints
export const queryParkingSlots = async (
  network: string = 'testnet',
  lat?: number,
  lng?: number,
  radius: number = 5000,
  availableOnly: boolean = true,
  requestedStartTime?: number,
  requestedEndTime?: number
): Promise<ParkingSlot[]> => {
  const requestBody: any = {
    network,
    lat,
    lng,
    radius,
    available_only: availableOnly,
  };
  
  // Add time interval if provided
  if (requestedStartTime !== undefined) {
    requestBody.requested_start_time = requestedStartTime;
  }
  if (requestedEndTime !== undefined) {
    requestBody.requested_end_time = requestedEndTime;
  }
  
  const response = await suiClient.post('/api/slots/query', requestBody);
  
  if (response.data.success && response.data.slots) {
    // Convert Sui slot format to backend API format
    if (lat !== undefined && lng !== undefined) {
      return convertSuiSlotsToApiFormat(response.data.slots, lat, lng);
    }
    // If no target location, return as-is (shouldn't happen in normal flow)
    return response.data.slots.map((slot: any) => ({
      slot_id: slot.id || slot.slot_id,
      lat: (slot.latitude || slot.lat) / (slot.latitude > 1000 ? 1_000_000 : 1),
      lng: (slot.longitude || slot.lng) / (slot.longitude > 1000 ? 1_000_000 : 1),
      price_per_hour: slot.price_per_hour || (slot.basePricePerHour / 1_000_000_000),
      distance_m: slot.distance_m || 0,
      is_available: slot.is_available !== undefined ? slot.is_available : (slot.status === 0),
      address: slot.address || '', // Real address from blockchain
      location_name: slot.locationName || slot.location_name || '', // Slot name/display name
      owner: slot.owner, // Include owner address
    }));
  }
  return [];
};

export const getParkingSlotById = async (slotId: string, network: string = 'testnet'): Promise<ParkingSlot | null> => {
  const response = await suiClient.get(`/api/slots/${slotId}`, {
    params: { network },
  });
  
  if (response.data.success) {
    return response.data.slot;
  }
  return null;
};

export const getUserParkingSlots = async (ownerAddress: string, network: string = 'testnet'): Promise<any[]> => {
  const response = await suiClient.get(`/api/slots/by-owner/${ownerAddress}`, {
    params: { network },
  });
  
  if (response.data.success && response.data.slots) {
    return response.data.slots;
  }
  return [];
};

export const getPriceQuote = async (
  slotId: string,
  durationHours: number = 1,
  network: string = 'testnet'
): Promise<{ price: string; deposit: string | null; collateral: string | null } | null> => {
  const response = await suiClient.get(`/api/slots/${slotId}/quote`, {
    params: { duration: durationHours, network },
  });
  
  if (response.data.success) {
    return {
      price: response.data.price,
      deposit: response.data.deposit,
      collateral: response.data.collateral,
    };
  }
  return null;
};

export const createParkingSlot = async (
  slotData: {
    locationId: string;
    locationName: string;
    latitude: number;
    longitude: number;
    basePricePerHour: string | number; // In MIST or SUI
  },
  network: string = 'testnet'
): Promise<{ digest: string; slotId: string; ownerCapId: string }> => {
  const response = await suiClient.post('/api/slots', {
    ...slotData,
    network,
  });
  
  if (response.data.success) {
    return {
      digest: response.data.digest,
      slotId: response.data.slotId,
      ownerCapId: response.data.ownerCapId,
    };
  }
  throw new Error(response.data.error || 'Failed to create parking slot');
};

// ===========================================================================
// DRIVER PROFILES
// ===========================================================================

export const getDriverProfile = async (profileId: string, network: string = 'testnet'): Promise<any | null> => {
  const response = await suiClient.get(`/api/drivers/${profileId}`, {
    params: { network },
  });
  
  if (response.data.success) {
    return response.data.profile;
  }
  return null;
};

export const getDriverProfileByAddress = async (
  address: string,
  network: string = 'testnet'
): Promise<any | null> => {
  try {
    const response = await suiClient.get(`/api/drivers/by-address/${address}`, {
      params: { network },
    });
    
    if (response.data.success) {
      return response.data.profile;
    }
    return null;
  } catch (error: any) {
    // If 404, return null (profile doesn't exist)
    if (error.response?.status === 404) {
      return null;
    }
    // Re-throw other errors
    throw error;
  }
};

export const registerDriver = async (network: string = 'testnet'): Promise<{ digest: string; driverProfileId: string }> => {
  const response = await suiClient.post('/api/drivers/register', { network });
  
  if (response.data.success) {
    return {
      digest: response.data.digest,
      driverProfileId: response.data.driverProfileId,
    };
  }
  throw new Error(response.data.error || 'Failed to register driver');
};

// ===========================================================================
// OWNER PROFILES
// ===========================================================================

export const getOwnerProfile = async (profileId: string, network: string = 'testnet'): Promise<any | null> => {
  const response = await suiClient.get(`/api/owners/${profileId}`, {
    params: { network },
  });
  
  if (response.data.success) {
    return response.data.profile;
  }
  return null;
};

export const getOwnerProfileByAddress = async (
  address: string,
  network: string = 'testnet'
): Promise<any | null> => {
  try {
    const response = await suiClient.get(`/api/owners/by-address/${address}`, {
      params: { network },
    });
    
    if (response.data.success) {
      return response.data.profile;
    }
    return null;
  } catch (error: any) {
    // If 404, return null (profile doesn't exist)
    if (error.response?.status === 404) {
      return null;
    }
    // Re-throw other errors
    throw error;
  }
};

export const registerOwner = async (network: string = 'testnet'): Promise<{ digest: string; ownerProfileId: string }> => {
  const response = await suiClient.post('/api/owners/register', { network });
  
  if (response.data.success) {
    return {
      digest: response.data.digest,
      ownerProfileId: response.data.ownerProfileId,
    };
  }
  throw new Error(response.data.error || 'Failed to register owner');
};

// ===========================================================================
// RESERVATIONS
// ===========================================================================

export const getReservation = async (reservationId: string, network: string = 'testnet'): Promise<any | null> => {
  const response = await suiClient.get(`/api/reservations/${reservationId}`, {
    params: { network },
  });
  
  if (response.data.success) {
    return response.data.reservation;
  }
  return null;
};

export const getUserReservations = async (userAddress: string, network: string = 'testnet'): Promise<any[]> => {
  const response = await suiClient.get(`/api/reservations/by-user/${userAddress}`, {
    params: { network },
  });
  
  if (response.data.success && response.data.reservations) {
    return response.data.reservations;
  }
  return [];
};

export const createReservation = async (
  reservationData: {
    slotId: string;
    durationHours: number;
    startTime?: string | number; // Unix timestamp in milliseconds
  },
  network: string = 'testnet'
): Promise<{ digest: string; reservationId: string }> => {
  const response = await suiClient.post('/api/reservations', {
    ...reservationData,
    network,
  });
  
  if (response.data.success) {
    return {
      digest: response.data.digest,
      reservationId: response.data.reservationId,
    };
  }
  throw new Error(response.data.error || 'Failed to create reservation');
};

// Note: checkIn and checkOut are now implemented directly in ReservationsScreen
// using zkLogin signing, so these API endpoints are not used anymore
// Keeping them for backwards compatibility but they won't work for driver actions
export const checkIn = async (
  reservationId: string,
  network: string = 'testnet'
): Promise<{ digest: string }> => {
  const response = await suiClient.post(`/api/reservations/${reservationId}/check-in`, { network });
  
  if (response.data.success) {
    return { digest: response.data.digest };
  }
  throw new Error(response.data.error || 'Failed to check in');
};

export const checkOut = async (
  reservationId: string,
  network: string = 'testnet'
): Promise<{ digest: string }> => {
  const response = await suiClient.post(`/api/reservations/${reservationId}/check-out`, { network });
  
  if (response.data.success) {
    return { digest: response.data.digest };
  }
  throw new Error(response.data.error || 'Failed to check out');
};

// ===========================================================================
// ESCROW
// ===========================================================================

export const getEscrow = async (escrowId: string, network: string = 'testnet'): Promise<any | null> => {
  const response = await suiClient.get(`/api/escrows/${escrowId}`, {
    params: { network },
  });
  
  if (response.data.success) {
    return response.data.escrow;
  }
  return null;
};

export const getEscrowByReservationId = async (
  reservationId: string,
  network: string = 'testnet'
): Promise<any | null> => {
  // First get reservation to get escrow ID
  const reservation = await getReservation(reservationId, network);
  if (!reservation || !reservation.escrowId) {
    return null;
  }
  return getEscrow(reservation.escrowId, network);
};

export const lockFunds = async (
  escrowData: {
    reservationId: string;
    slotId: string;
    paymentCoinId: string;
    depositCoinId: string;
    ownerCollateralCoinId: string;
  },
  network: string = 'testnet'
): Promise<{ digest: string; escrowId: string }> => {
  const response = await suiClient.post('/api/escrows/lock', {
    ...escrowData,
    network,
  });
  
  if (response.data.success) {
    return {
      digest: response.data.digest,
      escrowId: response.data.escrowId,
    };
  }
  throw new Error(response.data.error || 'Failed to lock funds');
};

export const markEscrowUsed = async (
  escrowId: string,
  network: string = 'testnet'
): Promise<{ digest: string }> => {
  const response = await suiClient.post(`/api/escrows/${escrowId}/mark-used`, { network });
  
  if (response.data.success) {
    return { digest: response.data.digest };
  }
  throw new Error(response.data.error || 'Failed to mark escrow as used');
};

export const settleEscrow = async (
  escrowId: string,
  settlementData: {
    reservationId: string;
    slotId: string;
    driverProfileId: string;
    ownerProfileId: string;
  },
  network: string = 'testnet'
): Promise<{ digest: string }> => {
  const response = await suiClient.post(`/api/escrows/${escrowId}/settle`, {
    ...settlementData,
    network,
  });
  
  if (response.data.success) {
    return { digest: response.data.digest };
  }
  throw new Error(response.data.error || 'Failed to settle escrow');
};

export const openDispute = async (
  escrowId: string,
  disputeData: {
    reservationId: string;
    reason: number; // Dispute reason code
  },
  network: string = 'testnet'
): Promise<{ digest: string }> => {
  const response = await suiClient.post(`/api/escrows/${escrowId}/dispute`, {
    ...disputeData,
    network,
  });
  
  if (response.data.success) {
    return { digest: response.data.digest };
  }
  throw new Error(response.data.error || 'Failed to open dispute');
};

// ===========================================================================
// UTILITY
// ===========================================================================

export const getApiInfo = async (network: string = 'testnet'): Promise<{
  network: string;
  packageId: string;
  walletAddress: string;
}> => {
  const response = await suiClient.get('/api/info', { params: { network } });
  
  if (response.data.success) {
    return {
      network: response.data.network,
      packageId: response.data.packageId,
      walletAddress: response.data.walletAddress,
    };
  }
  throw new Error(response.data.error || 'Failed to get API info');
};

export const checkHealth = async (): Promise<{ status: string }> => {
  const response = await suiClient.get('/health');
  return response.data;
};

// Mock data for development/testing
// Note: price_per_hour is in RON (matching backend format)
export const getMockParkingSlots = (): ParkingSlot[] => {
  return [
    {
      slot_id: 'mock-1',
      lat: 46.766,
      lng: 23.599,
      price_per_hour: 75.0, // 7.5 SUI * 10 = 75 RON
      distance_m: 200,
      is_available: true,
      address: 'Downtown Parking A, Strada Teodor Mihali 58-60',
      reputation_score: 850,
      bookings: 147,
      disputes: 0,
      available_spots: 3,
      total_spots: 10,
    },
    {
      slot_id: 'mock-2',
      lat: 46.768,
      lng: 23.601,
      price_per_hour: 100.0, // 10 SUI * 10 = 100 RON
      distance_m: 350,
      is_available: true,
      address: 'City Center Parking, Bulevardul Eroilor',
      reputation_score: 920,
      bookings: 203,
      disputes: 1,
      available_spots: 5,
      total_spots: 15,
    },
    {
      slot_id: 'mock-3',
      lat: 46.764,
      lng: 23.597,
      price_per_hour: 50.0, // 5 SUI * 10 = 50 RON
      distance_m: 500,
      is_available: true,
      address: 'FSEGA Area Parking, Strada Teodor Mihali',
      reputation_score: 780,
      bookings: 89,
      disputes: 0,
      available_spots: 2,
      total_spots: 8,
    },
  ];
};

// Mock function to convert slot to card format
export const convertSlotToCard = (slot: ParkingSlot, durationHours: number = 2, startHour?: string): ParkingSpotCard => {
  // Convert price from RON back to SUI for display (1 SUI = 10 RON)
  const pricePerHourSui = slot.price_per_hour / 10;
  const priceTotal = pricePerHourSui * durationHours;
  const priceDisplay = `${priceTotal.toFixed(1)} SUI/${durationHours}h`;
  
  let reputationLabel = 'Good';
  if (slot.reputation_score && slot.reputation_score >= 900) {
    reputationLabel = 'Excellent';
  } else if (slot.reputation_score && slot.reputation_score >= 800) {
    reputationLabel = 'Very Good';
  } else if (slot.reputation_score && slot.reputation_score >= 700) {
    reputationLabel = 'Good';
  } else {
    reputationLabel = 'Fair';
  }
  
  // Use location_name (slot name) if available, otherwise extract from address
  let name = 'Parking Spot';
  if (slot.location_name || slot.locationName) {
    name = slot.location_name || slot.locationName || 'Parking Spot';
  } else if (slot.address) {
    const parts = slot.address.split(',');
    name = parts[0]?.trim() || 'Parking Spot';
  }
  
  // Address is now stored on blockchain, use it directly
  const displayAddress = slot.address && slot.address.trim() !== '' 
    ? slot.address 
    : 'Address not available';
  
  return {
    slot_id: slot.slot_id,
    name: name,
    image: undefined, // Will be added later
    distance_m: slot.distance_m,
    price_per_hour: slot.price_per_hour, // Keep in RON for calculations
    price_display: priceDisplay,
    available_spots: slot.available_spots || 0,
    total_spots: slot.total_spots || 10,
    reputation_score: slot.reputation_score || 800,
    max_reputation: 1000,
    reputation_label: reputationLabel,
    bookings: slot.bookings || 0,
    disputes: slot.disputes || 0,
    address: displayAddress,
    is_trusted: (slot.reputation_score || 0) >= 800 && (slot.disputes || 0) === 0,
    start_hour: startHour, // Include start_hour from intent
    owner: (slot as any).owner || undefined, // Include owner address if available
  };
};

// Mock endpoint for getting user balance (not implemented yet)
export const getUserBalance = async (): Promise<number> => {
  // Mock implementation
  return 125.45;
};

// Mock endpoint for reserving a slot (not implemented yet)
export const reserveSlot = async (slotId: string, durationHours: number): Promise<{ success: boolean; transactionId?: string }> => {
  // Mock implementation - will be replaced with real Sui transaction
  return {
    success: true,
    transactionId: `mock-tx-${Date.now()}`,
  };
};
