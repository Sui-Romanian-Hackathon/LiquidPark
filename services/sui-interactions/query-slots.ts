#!/usr/bin/env node
/**
 * Query parking slots from Sui blockchain.
 * This script queries all available parking slots and outputs them as JSON.
 */
import { createQueryClient } from "./index.js";
import type { NetworkType, ParkingSlot } from "./types.js";
import { getDefaultNetwork } from "./config.js";

/**
 * Query all parking slots by searching for ParkingSlot objects.
 * Note: This queries objects by type. For production, you might want to use
 * an indexer or maintain a registry of slot IDs.
 */
async function queryAllParkingSlots(network?: NetworkType): Promise<ParkingSlot[]> {
  const queryClient = createQueryClient(network);
  const deployment = queryClient.getDeployment();
  const suiClient = queryClient.getSuiClient();

  const slots: ParkingSlot[] = [];
  
  try {
    // Query objects by type - ParkingSlot is a shared object
    // We'll use getObjectsOwnedByAddress with a filter, but since slots are shared,
    // we need to query them differently. For now, we'll use a workaround by querying
    // events or using a different approach.
    
    // Alternative: Query by getting all objects of type ParkingSlot
    // Since Sui doesn't have a direct "get all objects by type" API,
    // we'll need to use events or maintain a registry.
    
    // For this integration, we'll query slots that have been created via events
    // or use a known list. In production, you'd maintain an index.
    
    // Let's try to query using the Sui indexer approach:
    // We can query for SlotCreated events to find all slots
    
    const packageId = deployment.packageId;
    const slotType = `${packageId}::market::ParkingSlot`;
    
    // Query for SlotCreated events to find slot IDs
    // Note: This approach queries events. For production, consider maintaining
    // a registry or using an indexer.
    try {
      const events = await suiClient.queryEvents({
        query: {
          MoveModule: {
            package: packageId,
            module: "market",
          },
        },
        limit: 1000, // Adjust as needed
        order: "descending", // Get most recent first
      });
      
      const slotIds = new Set<string>();
      
      // Extract slot IDs from SlotCreated events
      for (const event of events.data) {
        if (event.type.includes("SlotCreated") && event.parsedJson) {
          const eventData = event.parsedJson as { slot_id?: string };
          if (eventData.slot_id) {
            slotIds.add(eventData.slot_id);
          }
        }
      }
      
      // Fetch each slot
      for (const slotId of slotIds) {
        try {
          const slot = await queryClient.getParkingSlot(slotId);
          if (slot) {
            slots.push(slot);
          }
        } catch (error) {
          // Slot might have been deleted or doesn't exist - skip silently
          // Uncomment for debugging: console.error(`Error fetching slot ${slotId}:`, error);
        }
      }
    } catch (error) {
      // If event querying fails, return empty array
      // This is expected if no slots exist yet or if there's a network issue
      console.error("Note: Could not query events. This might be expected if no slots exist yet.");
    }
    
  } catch (error) {
    console.error("Error querying parking slots:", error);
    throw error;
  }
  
  return slots;
}

/**
 * Filter slots by location (within a radius in meters).
 */
function filterSlotsByLocation(
  slots: ParkingSlot[],
  targetLat: number,
  targetLng: number,
  radiusMeters: number = 5000
): ParkingSlot[] {
  // Convert scaled coordinates to actual lat/lng
  const filtered: ParkingSlot[] = [];
  
  for (const slot of slots) {
    const slotLat = slot.latitude / 1_000_000;
    const slotLng = slot.longitude / 1_000_000;
    
    // Calculate distance using Haversine formula
    const distance = calculateDistance(targetLat, targetLng, slotLat, slotLng);
    
    if (distance <= radiusMeters) {
      filtered.push(slot);
    }
  }
  
  return filtered;
}

/**
 * Calculate distance between two coordinates using Haversine formula.
 * Returns distance in meters.
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Main function - can be called from command line or imported.
 */
async function main() {
  const args = process.argv.slice(2);
  const network = (args[0] as NetworkType) || getDefaultNetwork();
  const targetLat = args[1] ? parseFloat(args[1]) : null;
  const targetLng = args[2] ? parseFloat(args[2]) : null;
  const radiusMeters = args[3] ? parseInt(args[3]) : 5000;

  try {
    let slots = await queryAllParkingSlots(network);
    
    // Filter by location if provided
    if (targetLat !== null && targetLng !== null) {
      slots = filterSlotsByLocation(slots, targetLat, targetLng, radiusMeters);
    }
    
    // Filter only available slots (status === 0 means FREE)
    slots = slots.filter(slot => slot.status === 0);
    
    // Output as JSON
    console.log(JSON.stringify(slots, null, 2));
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

// Run if called directly
// Check if this file is being executed directly (not imported)
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     process.argv[1]?.endsWith("query-slots.ts") ||
                     process.argv[1]?.endsWith("query-slots.js");

if (isMainModule) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export { queryAllParkingSlots, filterSlotsByLocation };
