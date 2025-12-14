// Convert Sui parking slot format to backend API format
import type { ParkingSlot } from '../types';

// Sui slot format (from Sui API)
interface SuiParkingSlot {
  id: string;
  owner?: string; // Owner address
  latitude: number; // Scaled by 1_000_000
  longitude: number; // Scaled by 1_000_000
  basePricePerHour: number; // In MIST (1 SUI = 1_000_000_000 MIST)
  dynamicCoeff: number; // In basis points (10000 = 1x)
  status: number; // 0=free, 1=reserved, 2=occupied
  locationName: string;
  completedReservations?: number;
  totalRevenue?: number;
}

// Calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Convert Sui parking slot format to backend API format.
 * This matches the conversion logic in integrated_test.py
 */
export function convertSuiSlotToApiFormat(
  suiSlot: SuiParkingSlot,
  targetLat: number,
  targetLng: number
): ParkingSlot {
  // Convert scaled coordinates (stored as integers * 1_000_000)
  const slotLat = suiSlot.latitude / 1_000_000;
  const slotLng = suiSlot.longitude / 1_000_000;
  
  // Calculate distance
  const distanceM = Math.round(calculateDistance(targetLat, targetLng, slotLat, slotLng));
  
  // Convert price from MIST to SUI, then to RON (matching integrated_test.py)
  // basePricePerHour is in MIST (1 SUI = 1_000_000_000 MIST)
  const pricePerHourSui = suiSlot.basePricePerHour / 1_000_000_000;
  let pricePerHourRon = pricePerHourSui * 10; // 1 SUI = 10 RON conversion
  
  // Apply dynamic coefficient (in basis points, 10000 = 1x)
  const dynamicMultiplier = (suiSlot.dynamicCoeff || 10000) / 10000;
  pricePerHourRon *= dynamicMultiplier;
  
  return {
    slot_id: suiSlot.id,
    lat: slotLat,
    lng: slotLng,
    price_per_hour: Math.round(pricePerHourRon * 100) / 100, // Price in RON (backend expects this)
    distance_m: distanceM,
    is_available: suiSlot.status === 0, // 0 = FREE
    address: suiSlot.address || '', // Real address from blockchain
    location_name: suiSlot.locationName || '', // Slot name/display name from blockchain
    covered: null, // Not available in Sui data
    safety_rating: null, // Not available in Sui data
    // Additional metadata for frontend use
    id: suiSlot.id,
    owner: suiSlot.owner || undefined, // Include owner address if available
    status: suiSlot.status,
    basePricePerHour: suiSlot.basePricePerHour,
    dynamicCoeff: suiSlot.dynamicCoeff,
    locationName: suiSlot.locationName,
    bookings: suiSlot.completedReservations || 0,
    disputes: 0, // Not available in Sui slot data
    reputation_score: undefined, // Would need to query reputation registry
    available_spots: suiSlot.status === 0 ? 1 : 0,
    total_spots: 1, // Each slot is individual
  };
}

/**
 * Convert array of Sui slots to API format
 */
export function convertSuiSlotsToApiFormat(
  suiSlots: SuiParkingSlot[],
  targetLat: number,
  targetLng: number
): ParkingSlot[] {
  return suiSlots.map(slot => convertSuiSlotToApiFormat(slot, targetLat, targetLng));
}
