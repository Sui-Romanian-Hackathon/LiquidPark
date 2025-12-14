import { createQueryClient } from "../QueryClient.js";
import type {
  NetworkType,
  ParkingSlot,
  DriverProfile,
  OwnerProfile,
  Reservation,
  Escrow,
} from "../types.js";
import { getDefaultNetwork } from "../config.js";

export class QueryService {
  private queryClient: ReturnType<typeof createQueryClient>;
  private network: NetworkType;

  constructor(network?: NetworkType) {
    this.network = network ?? getDefaultNetwork();
    this.queryClient = createQueryClient(this.network);
  }

  // ===========================================================================
  // PARKING SLOTS
  // ===========================================================================

  /**
   * Get a specific parking slot by ID.
   */
  async getSlot(slotId: string): Promise<ParkingSlot | null> {
    return this.queryClient.getParkingSlot(slotId);
  }

  /**
   * Get multiple parking slots by IDs.
   */
  async getSlots(slotIds: string[]): Promise<ParkingSlot[]> {
    const slots: ParkingSlot[] = [];
    for (const id of slotIds) {
      const slot = await this.queryClient.getParkingSlot(id);
      if (slot) slots.push(slot);
    }
    return slots;
  }

  /**
   * Query all parking slots from events.
   * Note: For production, consider using an indexer.
   */
  async queryAllSlots(): Promise<ParkingSlot[]> {
    const deployment = this.queryClient.getDeployment();
    const suiClient = this.queryClient.getSuiClient();
    const slots: ParkingSlot[] = [];

    try {
      const events = await suiClient.queryEvents({
        query: {
          MoveModule: {
            package: deployment.packageId,
            module: "market",
          },
        },
        limit: 1000,
        order: "descending",
      });

      const slotIds = new Set<string>();

      for (const event of events.data) {
        if (event.type.includes("SlotCreated") && event.parsedJson) {
          const eventData = event.parsedJson as { slot_id?: string };
          if (eventData.slot_id) {
            slotIds.add(eventData.slot_id);
          }
        }
      }

      for (const slotId of slotIds) {
        try {
          const slot = await this.queryClient.getParkingSlot(slotId);
          if (slot) slots.push(slot);
        } catch {
          // Slot might be deleted - skip
        }
      }
    } catch (error) {
      console.error("Error querying slots from events:", error);
    }

    return slots;
  }

  /**
   * Query available slots with dynamic availability calculation.
   * Checks current availability based on active reservations.
   */
  async queryAvailableSlots(
    requestedStartTime?: number,
    requestedEndTime?: number
  ): Promise<ParkingSlot[]> {
    const slots = await this.queryAllSlots();
    
    if (requestedStartTime && requestedEndTime) {
      // Check availability for specific time interval
      const availableSlots: ParkingSlot[] = [];
      for (const slot of slots) {
        const isAvailable = await this.queryClient.isSlotAvailableForInterval(
          slot.id,
          requestedStartTime,
          requestedEndTime
        );
        if (isAvailable) {
          availableSlots.push(slot);
        }
      }
      return availableSlots;
    } else {
      // Check current availability
      const availableSlots: ParkingSlot[] = [];
      for (const slot of slots) {
        const dynamicStatus = await this.queryClient.calculateSlotStatus(slot.id);
        if (dynamicStatus === "free") {
          availableSlots.push(slot);
        }
      }
      return availableSlots;
    }
  }

  /**
   * Get all parking slots owned by a specific address.
   */
  async getUserSlots(ownerAddress: string): Promise<ParkingSlot[]> {
    return this.queryClient.findSlotsByOwner(ownerAddress);
  }

  /**
   * Query slots near a location with dynamic availability calculation.
   * If requestedStartTime and requestedEndTime are provided, checks availability for that interval.
   * Otherwise, checks current availability based on active reservations.
   */
  async querySlotsNearLocation(
    lat: number,
    lng: number,
    radiusMeters: number = 5000,
    availableOnly: boolean = true,
    requestedStartTime?: number,
    requestedEndTime?: number
  ): Promise<ParkingSlot[]> {
    let slots = await this.queryAllSlots();
    console.log(`[QueryService] Total slots found: ${slots.length}`);

    // Log all slots before filtering to see their distances
    console.log(`[QueryService] All slots before location filter:`);
    slots.forEach(slot => {
      const slotLat = slot.latitude / 1_000_000;
      const slotLng = slot.longitude / 1_000_000;
      const distance = this.calculateDistance(lat, lng, slotLat, slotLng);
      const slotName = slot.locationName || slot.id.substring(0, 8);
      console.log(`[QueryService]   - ${slotName}: lat=${slotLat}, lng=${slotLng}, distance=${Math.round(distance)}m`);
    });

    // Filter by location first
    slots = this.filterByLocation(slots, lat, lng, radiusMeters);
    console.log(`[QueryService] Slots after location filter (radius ${radiusMeters}m): ${slots.length}`);

    // If availableOnly is true, check dynamic availability
    if (availableOnly) {
      const availableSlots: ParkingSlot[] = [];
      
      for (const slot of slots) {
        let isAvailable = false;
        
        if (requestedStartTime && requestedEndTime) {
          // Check availability for specific time interval
          isAvailable = await this.queryClient.isSlotAvailableForInterval(
            slot.id,
            requestedStartTime,
            requestedEndTime
          );
          if (!isAvailable) {
            console.log(`[QueryService] Slot ${slot.id} not available for interval ${new Date(requestedStartTime).toISOString()} - ${new Date(requestedEndTime).toISOString()}`);
          }
        } else {
          // Check current availability based on active reservations
          const dynamicStatus = await this.queryClient.calculateSlotStatus(slot.id);
          isAvailable = dynamicStatus === "free";
          if (!isAvailable) {
            console.log(`[QueryService] Slot ${slot.id} status: ${dynamicStatus} (not free)`);
          }
        }
        
        if (isAvailable) {
          availableSlots.push(slot);
        }
      }
      
      console.log(`[QueryService] Available slots after filtering: ${availableSlots.length}`);
      return availableSlots;
    }

    return slots;
  }

  /**
   * Get price quote for a slot.
   */
  async getPriceQuote(
    slotId: string,
    durationHours: number
  ): Promise<bigint | null> {
    return this.queryClient.quotePrice(slotId, durationHours);
  }

  /**
   * Get required deposit for a price.
   */
  async getRequiredDeposit(price: bigint): Promise<bigint | null> {
    return this.queryClient.getRequiredDeposit(price);
  }

  /**
   * Get required collateral for a price.
   */
  async getRequiredCollateral(price: bigint): Promise<bigint | null> {
    return this.queryClient.getRequiredCollateral(price);
  }

  // ===========================================================================
  // DRIVER PROFILES
  // ===========================================================================

  /**
   * Get a driver profile by ID.
   */
  async getDriverProfile(profileId: string): Promise<DriverProfile | null> {
    return this.queryClient.getDriverProfile(profileId);
  }

  /**
   * Get a driver profile by wallet address.
   */
  async getDriverProfileByAddress(
    address: string
  ): Promise<DriverProfile | null> {
    return this.queryClient.findDriverProfileByAddress(address);
  }

  /**
   * Check if an address is registered as a driver.
   */
  async isDriverRegistered(address: string): Promise<boolean> {
    return this.queryClient.isDriverRegistered(address);
  }

  // ===========================================================================
  // OWNER PROFILES
  // ===========================================================================

  /**
   * Get an owner profile by ID.
   */
  async getOwnerProfile(profileId: string): Promise<OwnerProfile | null> {
    return this.queryClient.getOwnerProfile(profileId);
  }

  /**
   * Get an owner profile by wallet address.
   */
  async getOwnerProfileByAddress(
    address: string
  ): Promise<OwnerProfile | null> {
    return this.queryClient.findOwnerProfileByAddress(address);
  }

  /**
   * Check if an address is registered as an owner.
   */
  async isOwnerRegistered(address: string): Promise<boolean> {
    return this.queryClient.isOwnerRegistered(address);
  }

  // ===========================================================================
  // RESERVATIONS & ESCROWS
  // ===========================================================================

  /**
   * Get a reservation by ID.
   */
  async getReservation(reservationId: string): Promise<Reservation | null> {
    return this.queryClient.getReservation(reservationId);
  }

  /**
   * Get all reservations for a specific user (driver or owner).
   */
  async getUserReservations(userAddress: string): Promise<Reservation[]> {
    return this.queryClient.getUserReservations(userAddress);
  }

  /**
   * Get an escrow by ID.
   */
  async getEscrow(escrowId: string): Promise<Escrow | null> {
    return this.queryClient.getEscrow(escrowId);
  }

  /**
   * Get escrow for a reservation by reservation ID.
   */
  async getEscrowByReservationId(reservationId: string): Promise<Escrow | null> {
    const reservation = await this.queryClient.getReservation(reservationId);
    if (!reservation || !reservation.escrowId) {
      return null;
    }
    return this.queryClient.getEscrow(reservation.escrowId);
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  /**
   * Filter slots by location using Haversine formula.
   */
  private filterByLocation(
    slots: ParkingSlot[],
    targetLat: number,
    targetLng: number,
    radiusMeters: number
  ): ParkingSlot[] {
    console.log(`[QueryService] Filtering ${slots.length} slots by location:`);
    console.log(`[QueryService] Target: lat=${targetLat}, lng=${targetLng}, radius=${radiusMeters}m`);
    
    const filtered = slots.filter((slot) => {
      const slotLat = slot.latitude / 1_000_000;
      const slotLng = slot.longitude / 1_000_000;
      const distance = this.calculateDistance(
        targetLat,
        targetLng,
        slotLat,
        slotLng
      );
      
      const slotName = slot.locationName || slot.id.substring(0, 8);
      const isWithinRadius = distance <= radiusMeters;
      
      console.log(`[QueryService] Slot ${slotName} (${slot.id.substring(0, 16)}...): lat=${slotLat}, lng=${slotLng}, distance=${Math.round(distance)}m, within_radius=${isWithinRadius}`);
      
      return isWithinRadius;
    });
    
    console.log(`[QueryService] Filtered result: ${filtered.length} slots within ${radiusMeters}m radius`);
    return filtered;
  }

  /**
   * Calculate distance between two coordinates (Haversine formula).
   */
  private calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371000; // Earth radius in meters
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  /**
   * Get network info.
   */
  getNetwork(): NetworkType {
    return this.network;
  }

  /**
   * Get deployment info.
   */
  getDeployment() {
    return this.queryClient.getDeployment();
  }
}

// Singleton instance for convenience
let defaultInstance: QueryService | null = null;

export function getQueryService(network?: NetworkType): QueryService {
  if (
    !defaultInstance ||
    (network && network !== defaultInstance.getNetwork())
  ) {
    defaultInstance = new QueryService(network);
  }
  return defaultInstance;
}
