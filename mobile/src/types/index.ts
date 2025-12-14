// Types for the SuiPark app

export type UserType = 'driver' | 'parking_owner';

export interface AuthState {
  address: string;
  userType: UserType;
  isAuthenticated: boolean;
}

export interface ParkingSlot {
  slot_id: string;
  lat: number;
  lng: number;
  price_per_hour: number;
  distance_m: number;
  is_available: boolean;
  address: string; // Real address (from reverse geocoding or form)
  location_name?: string; // Slot name/display name (from blockchain location_name)
  covered?: boolean | null;
  safety_rating?: number | null;
  // Additional fields from Sui
  id?: string;
  owner?: string; // Owner address
  status?: number;
  basePricePerHour?: number;
  dynamicCoeff?: number;
  locationName?: string; // Legacy field, same as location_name
  reputation_score?: number;
  bookings?: number;
  disputes?: number;
  available_spots?: number;
  total_spots?: number;
}

export interface UserIntent {
  location_query: string;
  duration_minutes: number;
  start_hour?: string; // Start time in HH:mm format (24-hour format, e.g., "14:30")
  max_price?: number;
  preferences?: {
    covered?: boolean;
    safety_priority?: string;
    accessibility?: string;
    other?: string;
  };
  needs_clarification?: boolean;
  clarification_message?: string;
  is_more_request?: boolean;
  requested_radius_km?: number;
  is_closest_request?: boolean;
  is_cheapest_request?: boolean;
}

export interface Location {
  lat: number;
  lng: number;
  formatted_address?: string;
}

export interface Recommendation {
  best_slot_id: string;
  recommended_slot_ids?: string[];
  explanation_for_user: string;
  ranking?: Array<{
    slot_id: string;
    score: number;
  }>;
  ranked_slots?: Array<{
    slot_id: string;
    score: number;
    reason: string;
  }>;
  has_more_available?: boolean;
}

export interface ChatMessage {
  _id: string | number;
  text: string;
  createdAt: Date | number;
  user: {
    _id: string | number;
    name?: string;
    avatar?: string;
  };
  image?: string;
  video?: string;
  audio?: string;
  system?: boolean;
  sent?: boolean;
  received?: boolean;
  pending?: boolean;
}

export interface ParkingSpotCard {
  slot_id: string;
  name: string;
  image?: string;
  distance_m: number;
  price_per_hour: number;
  price_display: string; // e.g., "15 SUI/2h"
  available_spots: number;
  total_spots: number;
  reputation_score: number;
  max_reputation: number;
  reputation_label: string; // e.g., "Excellent"
  bookings: number;
  disputes: number;
  address: string;
  is_trusted?: boolean;
  start_hour?: string; // Start time in HH:mm format (24-hour format, e.g., "20:00")
  owner?: string; // Owner address for fetching owner profile and rating
}

// ============================================================================
// WebView Message Contract
// ============================================================================

export type SigningMessageType = 'SIGN_RESULT';

export interface SigningSuccessMessage {
  type: SigningMessageType;
  status: 'success';
  txDigest: string;
  reservationId?: string;
}

export interface SigningErrorMessage {
  type: SigningMessageType;
  status: 'error';
  error: string;
}

export type SigningMessage = SigningSuccessMessage | SigningErrorMessage;
