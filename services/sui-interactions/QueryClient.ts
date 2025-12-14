import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";

import {
  type NetworkType,
  type DeploymentInfo,
  type DriverProfile,
  type OwnerProfile,
  type ParkingSlot,
  type Reservation,
  type Escrow,
} from "./types.js";
import { getDeploymentInfo, getDefaultNetwork } from "./config.js";

export class QueryClient {
  private suiClient: SuiClient;
  private deployment: DeploymentInfo;
  private senderAddress: string;

  constructor(
    network: NetworkType,
    deployment: DeploymentInfo,
    senderAddress?: string
  ) {
    this.suiClient = new SuiClient({ url: getFullnodeUrl(network) });
    this.deployment = deployment;
    // Default sender for devInspect (can be any address)
    this.senderAddress =
      senderAddress ??
      "0x0000000000000000000000000000000000000000000000000000000000000000";
  }

  // ==========================================================================
  // REPUTATION QUERIES
  // ==========================================================================

  /**
   * Fetch a DriverProfile object by ID.
   */
  async getDriverProfile(profileId: string): Promise<DriverProfile | null> {
    const obj = await this.suiClient.getObject({
      id: profileId,
      options: { showContent: true },
    });

    if (obj.data?.content?.dataType !== "moveObject") {
      return null;
    }

    const fields = obj.data.content.fields as Record<string, unknown>;

    // UserProfile uses "user" field, not "driver"
    // Parse name field (vector<u8> in Move)
    let name: string | undefined;
    const nameField = fields["name"];
    if (nameField) {
      if (typeof nameField === "string") {
        name = nameField;
      } else if (Array.isArray(nameField)) {
        try {
          name = String.fromCharCode(...nameField.filter((n: any) => typeof n === 'number'));
        } catch (e) {
          console.warn('Error parsing driver name array:', e);
        }
      } else if (typeof nameField === "object" && nameField !== null) {
        const nameObj = nameField as any;
        if (nameObj.fields?.vec && Array.isArray(nameObj.fields.vec)) {
          try {
            name = String.fromCharCode(...nameObj.fields.vec.filter((n: any) => typeof n === 'number'));
          } catch (e) {
            console.warn('Error parsing driver name from fields.vec:', e);
          }
        } else if (nameObj.vec && Array.isArray(nameObj.vec)) {
          try {
            name = String.fromCharCode(...nameObj.vec.filter((n: any) => typeof n === 'number'));
          } catch (e) {
            console.warn('Error parsing driver name from vec:', e);
          }
        } else if (nameObj.fields && typeof nameObj.fields === 'string') {
          name = nameObj.fields;
        }
      }
    }
    if (name && name.trim() === '') {
      name = undefined;
    }

    return {
      id: profileId,
      driver: fields["user"] as string, // Fixed: use "user" instead of "driver"
      ...(name && { name }),
      score: Number(fields["score"]),
      successfulParkings: Number(fields["successful_parkings"]),
      disputesFiled: Number(fields["disputes_filed"]),
      disputesWon: Number(fields["disputes_won_as_driver"] ?? fields["disputes_won"] ?? 0), // Fixed: use disputes_won_as_driver
      disputesLost: Number(fields["disputes_lost_as_driver"] ?? fields["disputes_lost"] ?? 0), // Fixed: use disputes_lost_as_driver
      noShows: Number(fields["no_shows"]),
      lateArrivals: Number(fields["late_arrivals"]),
      totalSpent: Number(fields["total_spent"]),
      lastActivity: Number(fields["last_activity"]),
      createdAt: Number(fields["created_at"]),
      ratingCount: Number(fields["rating_count"]),
      ratingSum: Number(fields["rating_sum"]),
    };
  }

  /**
   * Fetch an OwnerProfile object by ID.
   */
  async getOwnerProfile(profileId: string): Promise<OwnerProfile | null> {
    const obj = await this.suiClient.getObject({
      id: profileId,
      options: { showContent: true },
    });

    if (obj.data?.content?.dataType !== "moveObject") {
      return null;
    }

    const fields = obj.data.content.fields as Record<string, unknown>;

    // UserProfile uses "user" field, not "owner"
    // Parse name field (vector<u8> in Move, can be string, array of numbers, or object with fields)
    let name: string | undefined;
    const nameField = fields["name"];
    
    // Debug logging
    if (nameField) {
      console.log('[QueryClient] Owner nameField type:', typeof nameField);
      console.log('[QueryClient] Owner nameField value:', JSON.stringify(nameField).substring(0, 200));
    }
    
    if (nameField) {
      if (typeof nameField === "string") {
        name = nameField;
      } else if (Array.isArray(nameField)) {
        // Convert array of numbers to string
        try {
          name = String.fromCharCode(...nameField.filter((n: any) => typeof n === 'number'));
        } catch (e) {
          console.warn('[QueryClient] Error parsing owner name array:', e);
        }
      } else if (typeof nameField === "object" && nameField !== null) {
        // Handle Sui object format: { fields: { vec: [...] } } or { vec: [...] }
        const nameObj = nameField as any;
        if (nameObj.fields?.vec && Array.isArray(nameObj.fields.vec)) {
          try {
            name = String.fromCharCode(...nameObj.fields.vec.filter((n: any) => typeof n === 'number'));
          } catch (e) {
            console.warn('[QueryClient] Error parsing owner name from fields.vec:', e);
          }
        } else if (nameObj.vec && Array.isArray(nameObj.vec)) {
          try {
            name = String.fromCharCode(...nameObj.vec.filter((n: any) => typeof n === 'number'));
          } catch (e) {
            console.warn('[QueryClient] Error parsing owner name from vec:', e);
          }
        } else if (nameObj.fields && typeof nameObj.fields === 'string') {
          name = nameObj.fields;
        }
      }
    }
    
    // Clean up name if it's empty or only whitespace
    if (name && name.trim() === '') {
      name = undefined;
    }
    
    console.log('[QueryClient] Parsed owner name:', name);

    return {
      id: profileId,
      owner: fields["user"] as string, // Fixed: use "user" instead of "owner"
      ...(name && { name }),
      score: Number(fields["score"]),
      successfulRentals: Number(fields["successful_rentals"]),
      disputesReceived: Number(fields["disputes_received"]),
      disputesWon: Number(fields["disputes_won_as_owner"] ?? fields["disputes_won"] ?? 0), // Fixed: use disputes_won_as_owner
      disputesLost: Number(fields["disputes_lost_as_owner"] ?? fields["disputes_lost"] ?? 0), // Fixed: use disputes_lost_as_owner
      availabilityViolations: Number(fields["availability_violations"]),
      totalEarned: Number(fields["total_earned"]),
      lastActivity: Number(fields["last_activity"]),
      createdAt: Number(fields["created_at"]),
      ratingCount: Number(fields["rating_count"]),
      ratingSum: Number(fields["rating_sum"]),
    };
  }

  /**
   * Get user profile ID using devInspect.
   * Note: There's only one UserProfile per user (not separate driver/owner profiles).
   */
  async getUserProfileId(userAddress: string): Promise<string | null> {
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${this.deployment.packageId}::reputation::get_user_profile_id`,
        arguments: [
          tx.object(this.deployment.reputationRegistryId),
          tx.pure.address(userAddress),
        ],
      });

      const response = await this.suiClient.devInspectTransactionBlock({
        sender: this.senderAddress,
        transactionBlock: tx,
      });

      if (response.error || !response.results?.[0]?.returnValues?.[0]) {
        return null;
      }

      const [returnValue] = response.results[0].returnValues;
      const idBytes = new Uint8Array(returnValue[0]);
      return "0x" + Buffer.from(idBytes).toString("hex");
    } catch {
      return null;
    }
  }

  /**
   * Get driver profile ID using devInspect.
   * Note: Uses get_user_profile_id since there's only one UserProfile per user.
   */
  async getDriverProfileId(driverAddress: string): Promise<string | null> {
    return this.getUserProfileId(driverAddress);
  }

  /**
   * Get owner profile ID using devInspect.
   * Note: Uses get_user_profile_id since there's only one UserProfile per user.
   */
  async getOwnerProfileId(ownerAddress: string): Promise<string | null> {
    return this.getUserProfileId(ownerAddress);
  }

  /**
   * Find a user's DriverProfile by their address.
   */
  async findDriverProfileByAddress(
    driverAddress: string
  ): Promise<DriverProfile | null> {
    const profileId = await this.getDriverProfileId(driverAddress);
    if (!profileId) return null;
    return this.getDriverProfile(profileId);
  }

  /**
   * Find a user's OwnerProfile by their address.
   */
  async findOwnerProfileByAddress(
    ownerAddress: string
  ): Promise<OwnerProfile | null> {
    const profileId = await this.getOwnerProfileId(ownerAddress);
    if (!profileId) return null;
    return this.getOwnerProfile(profileId);
  }

  /**
   * Check if a driver is registered using devInspect.
   */
  async isDriverRegistered(driverAddress: string): Promise<boolean> {
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${this.deployment.packageId}::reputation::is_driver_registered`,
        arguments: [
          tx.object(this.deployment.reputationRegistryId),
          tx.pure.address(driverAddress),
        ],
      });

      const response = await this.suiClient.devInspectTransactionBlock({
        sender: this.senderAddress,
        transactionBlock: tx,
      });

      if (response.error || !response.results?.[0]?.returnValues?.[0]) {
        return false;
      }

      const [returnValue] = response.results[0].returnValues;
      return returnValue[0][0] === 1;
    } catch {
      return false;
    }
  }

  /**
   * Check if an owner is registered using devInspect.
   */
  async isOwnerRegistered(ownerAddress: string): Promise<boolean> {
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${this.deployment.packageId}::reputation::is_owner_registered`,
        arguments: [
          tx.object(this.deployment.reputationRegistryId),
          tx.pure.address(ownerAddress),
        ],
      });

      const response = await this.suiClient.devInspectTransactionBlock({
        sender: this.senderAddress,
        transactionBlock: tx,
      });

      if (response.error || !response.results?.[0]?.returnValues?.[0]) {
        return false;
      }

      const [returnValue] = response.results[0].returnValues;
      return returnValue[0][0] === 1;
    } catch {
      return false;
    }
  }

  // ==========================================================================
  // MARKET QUERIES
  // ==========================================================================

  /**
   * Fetch a ParkingSlot object by ID.
   */
  async getParkingSlot(slotId: string): Promise<ParkingSlot | null> {
    const obj = await this.suiClient.getObject({
      id: slotId,
      options: { showContent: true },
    });

    if (obj.data?.content?.dataType !== "moveObject") {
      return null;
    }

    const fields = obj.data.content.fields as Record<string, unknown>;
    const currentRes = fields["current_reservation"] as {
      fields?: { vec?: string[] };
    } | null;

    return {
      id: slotId,
      owner: fields["owner"] as string,
      locationId: Number(fields["location_id"]),
      locationName: fields["location_name"] as string,
      address: fields["address"] as string,
      latitude: Number(fields["latitude"]),
      longitude: Number(fields["longitude"]),
      basePricePerHour: Number(fields["base_price_per_hour"]),
      dynamicCoeff: Number(fields["dynamic_coeff"]),
      status: Number(fields["status"]),
      currentReservation: currentRes?.fields?.vec?.[0] ?? null,
      totalRevenue: Number(fields["total_revenue"]),
      completedReservations: Number(fields["completed_reservations"]),
      createdAt: Number(fields["created_at"]),
    };
  }

  /**
   * Fetch a Reservation object by ID.
   */
  async getReservation(reservationId: string): Promise<Reservation | null> {
    const obj = await this.suiClient.getObject({
      id: reservationId,
      options: { showContent: true },
    });

    if (obj.data?.content?.dataType !== "moveObject") {
      return null;
    }

    const fields = obj.data.content.fields as Record<string, unknown>;
    const escrowIdRaw = fields["escrow_id"];
    
    // Option<ID> can be represented in different ways in Sui
    // Try multiple parsing strategies
    let escrowId: string | null = null;
    
    if (escrowIdRaw) {
      // Strategy 1: Direct string (most common when Option<ID> is Some)
      if (typeof escrowIdRaw === 'string') {
        escrowId = escrowIdRaw;
      }
      // Strategy 2: { fields: { vec: [id] } }
      else if (typeof escrowIdRaw === 'object' && escrowIdRaw !== null) {
        const escrowObj = escrowIdRaw as any;
        if (escrowObj.fields?.vec?.[0]) {
          escrowId = escrowObj.fields.vec[0];
        }
        // Strategy 3: { vec: [id] } (direct vec)
        else if (escrowObj.vec?.[0]) {
          escrowId = escrowObj.vec[0];
        }
        // Strategy 4: { Some: { id } } or { Some: id }
        else if (escrowObj.Some) {
          escrowId = typeof escrowObj.Some === 'string' 
            ? escrowObj.Some 
            : escrowObj.Some.id || escrowObj.Some.fields?.id;
        }
      }
    }
    
    // Log for debugging
    if (escrowIdRaw && !escrowId) {
      console.warn(`[QueryClient] Could not parse escrow_id for reservation ${reservationId}. Raw value:`, JSON.stringify(escrowIdRaw));
    }

    return {
      id: reservationId,
      slotId: fields["slot_id"] as string,
      driver: fields["driver"] as string,
      owner: fields["owner"] as string,
      startTime: Number(fields["start_time"]),
      endTime: Number(fields["end_time"]),
      durationHours: Number(fields["duration_hours"]),
      priceLocked: Number(fields["price_locked"]),
      state: Number(fields["state"]),
      escrowId: escrowId,
      zoneId: Number(fields["zone_id"]),
    };
  }

  /**
   * Query all reservations for a specific user (driver or owner).
   * Uses ownedObjects to find Reservation objects owned by the address.
   */
  async getUserReservations(userAddress: string): Promise<Reservation[]> {
    try {
      const deployment = this.getDeployment();
      const reservations: Reservation[] = [];

      // Query owned objects of type Reservation
      const objects = await this.suiClient.getOwnedObjects({
        owner: userAddress,
        filter: {
          StructType: `${deployment.packageId}::market::Reservation`,
        },
        options: {
          showContent: true,
          showType: true,
        },
      });

      // Also query by events to find reservations where user is driver or owner
      // This catches reservations that might not be owned objects
      const events = await this.suiClient.queryEvents({
        query: {
          MoveModule: {
            package: deployment.packageId,
            module: "market",
          },
        },
        limit: 1000,
        order: "descending",
      });

      const reservationIds = new Set<string>();

      // Add from owned objects
      for (const obj of objects.data) {
        if (obj.data?.objectId) {
          reservationIds.add(obj.data.objectId);
        }
      }

      // Add from events (ReservationCreated events)
      for (const event of events.data) {
        if (event.type.includes("ReservationCreated") && event.parsedJson) {
          const eventData = event.parsedJson as {
            reservation_id?: string;
            driver?: string;
            owner?: string;
          };
          if (
            eventData.reservation_id &&
            (eventData.driver === userAddress || eventData.owner === userAddress)
          ) {
            reservationIds.add(eventData.reservation_id);
          }
        }
      }

      // Fetch all reservation details
      for (const reservationId of reservationIds) {
        try {
          const reservation = await this.getReservation(reservationId);
          if (reservation) {
            reservations.push(reservation);
          }
        } catch (error) {
          // Reservation might be deleted or invalid - skip
          console.warn(`Failed to fetch reservation ${reservationId}:`, error);
        }
      }

      // Sort by startTime descending (most recent first)
      return reservations.sort((a, b) => b.startTime - a.startTime);
    } catch (error) {
      console.error("Error querying user reservations:", error);
      return [];
    }
  }

  /**
   * Query all active reservations for a specific parking slot.
   * Uses ReservationCreated events filtered by slot_id.
   */
  async getSlotReservations(slotId: string): Promise<Reservation[]> {
    try {
      const deployment = this.getDeployment();
      const reservations: Reservation[] = [];

      // Query ReservationCreated events for this slot
      // Note: Sui events don't support direct field filtering, so we'll filter in code
      const events = await this.suiClient.queryEvents({
        query: {
          MoveModule: {
            package: deployment.packageId,
            module: "market",
          },
        },
        limit: 1000,
        order: "descending",
      });

      const reservationIds = new Set<string>();

      // Extract reservation IDs from ReservationCreated events for this slot
      for (const event of events.data) {
        if (
          event.type.includes("ReservationCreated") &&
          event.parsedJson
        ) {
          const eventData = event.parsedJson as {
            reservation_id?: string;
            slot_id?: string;
          };
          if (
            eventData.slot_id === slotId &&
            eventData.reservation_id
          ) {
            reservationIds.add(eventData.reservation_id);
          }
        }
      }

      // Fetch all reservation objects
      for (const reservationId of reservationIds) {
        try {
          const reservation = await this.getReservation(reservationId);
          if (reservation) {
            reservations.push(reservation);
          }
        } catch (error) {
          // Reservation might be deleted or invalid - skip
          console.warn(
            `Failed to fetch reservation ${reservationId}:`,
            error
          );
        }
      }

      return reservations;
    } catch (error) {
      console.error("Error querying slot reservations:", error);
      return [];
    }
  }

  /**
   * Check if two time intervals overlap.
   * Returns true if intervals overlap, false otherwise.
   */
  intervalsOverlap(
    start1: number,
    end1: number,
    start2: number,
    end2: number
  ): boolean {
    return start1 < end2 && start2 < end1;
  }

  /**
   * Check if a slot is available for a given time interval.
   * Returns true if slot is available, false if there are conflicting reservations.
   */
  async isSlotAvailableForInterval(
    slotId: string,
    requestedStart: number,
    requestedEnd: number
  ): Promise<boolean> {
    try {
      const reservations = await this.getSlotReservations(slotId);
      console.log(`[QueryClient] Slot ${slotId}: Found ${reservations.length} total reservations`);

      // Filter active reservations (REQUESTED or ACTIVE state)
      const activeReservations = reservations.filter(
        (r) => r.state === 0 || r.state === 1 // REQUESTED or ACTIVE
      );
      console.log(`[QueryClient] Slot ${slotId}: ${activeReservations.length} active reservations`);

      // Check for overlaps
      for (const reservation of activeReservations) {
        if (
          this.intervalsOverlap(
            reservation.startTime,
            reservation.endTime,
            requestedStart,
            requestedEnd
          )
        ) {
          console.log(`[QueryClient] Slot ${slotId}: Conflict found with reservation ${reservation.startTime} - ${reservation.endTime}`);
          return false; // Conflict found
        }
      }

      console.log(`[QueryClient] Slot ${slotId}: Available for interval ${new Date(requestedStart).toISOString()} - ${new Date(requestedEnd).toISOString()}`);
      return true; // No conflicts
    } catch (error) {
      console.error(
        `[QueryClient] Error checking slot availability for ${slotId}:`,
        error
      );
      // On error, log but don't assume unavailable - return true to be safe
      // This prevents slots from being incorrectly filtered out due to query errors
      console.warn(`[QueryClient] Assuming slot ${slotId} is available due to error (may need manual verification)`);
      return true; // Changed from false to true - don't filter out on error
    }
  }

  /**
   * Calculate dynamic status for a slot based on active reservations and current time.
   * Returns: 'free' | 'reserved' | 'occupied'
   */
  async calculateSlotStatus(
    slotId: string,
    currentTimestamp?: number
  ): Promise<"free" | "reserved" | "occupied"> {
    try {
      const currentTime =
        currentTimestamp || Date.now();
      const reservations = await this.getSlotReservations(slotId);
      console.log(`[QueryClient] Slot ${slotId}: Found ${reservations.length} total reservations for status check`);

      // Filter active reservations (REQUESTED or ACTIVE state)
      const activeReservations = reservations.filter(
        (r) => r.state === 0 || r.state === 1 // REQUESTED or ACTIVE
      );
      console.log(`[QueryClient] Slot ${slotId}: ${activeReservations.length} active reservations`);

      // Check if any reservation is active right now
      for (const reservation of activeReservations) {
        if (
          currentTime >= reservation.startTime &&
          currentTime < reservation.endTime
        ) {
          // Reservation is active right now
          // Check if it's in ACTIVE state (after check-in) or REQUESTED (before check-in)
          if (reservation.state === 1) {
            // ACTIVE state - check if slot is marked as occupied
            // For now, we'll return 'reserved' - actual occupied status
            // should be tracked separately or via check-in/check-out
            return "reserved";
          } else {
            return "reserved";
          }
        }
      }

      return "free";
    } catch (error) {
      console.error("Error calculating slot status:", error);
      return "free"; // Default to free on error
    }
  }

  /**
   * Quote price for a parking slot using devInspect.
   */
  async quotePrice(
    slotId: string,
    durationHours: number
  ): Promise<bigint | null> {
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${this.deployment.packageId}::market::quote_price`,
        arguments: [
          tx.object(slotId),
          tx.object(this.deployment.zoneRegistryId),
          tx.pure.u64(durationHours),
        ],
      });

      const response = await this.suiClient.devInspectTransactionBlock({
        sender: this.senderAddress,
        transactionBlock: tx,
      });

      if (response.error || !response.results?.[0]?.returnValues?.[0]) {
        return null;
      }

      const [returnValue] = response.results[0].returnValues;
      const priceBytes = new Uint8Array(returnValue[0]);
      // u64 is 8 bytes little-endian
      const dataView = new DataView(priceBytes.buffer);
      return dataView.getBigUint64(0, true);
    } catch {
      return null;
    }
  }

  /**
   * Calculate demand factor for a zone using devInspect.
   */
  async calculateDemandFactor(zoneId: number): Promise<number | null> {
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${this.deployment.packageId}::market::calculate_demand_factor`,
        arguments: [
          tx.object(this.deployment.zoneRegistryId),
          tx.pure.u64(zoneId),
        ],
      });

      const response = await this.suiClient.devInspectTransactionBlock({
        sender: this.senderAddress,
        transactionBlock: tx,
      });

      if (response.error || !response.results?.[0]?.returnValues?.[0]) {
        return null;
      }

      const [returnValue] = response.results[0].returnValues;
      const factorBytes = new Uint8Array(returnValue[0]);
      const dataView = new DataView(factorBytes.buffer);
      return Number(dataView.getBigUint64(0, true));
    } catch {
      return null;
    }
  }

  /**
   * Find all parking slots owned by an address.
   */
  async findSlotsByOwner(ownerAddress: string): Promise<ParkingSlot[]> {
    const objects = await this.suiClient.getOwnedObjects({
      owner: ownerAddress,
      filter: {
        StructType: `${this.deployment.packageId}::market::SlotOwnerCap`,
      },
      options: { showContent: true },
    });

    const slots: ParkingSlot[] = [];
    for (const obj of objects.data) {
      if (obj.data?.content?.dataType === "moveObject") {
        const fields = obj.data.content.fields as Record<string, unknown>;
        const slotId = fields["slot_id"] as string;
        const slot = await this.getParkingSlot(slotId);
        if (slot) slots.push(slot);
      }
    }

    return slots;
  }

  // ==========================================================================
  // ESCROW QUERIES
  // ==========================================================================

  /**
   * Fetch an Escrow object by ID.
   */
  async getEscrow(escrowId: string): Promise<Escrow | null> {
    const obj = await this.suiClient.getObject({
      id: escrowId,
      options: { showContent: true },
    });

    if (obj.data?.content?.dataType !== "moveObject") {
      return null;
    }

    const fields = obj.data.content.fields as Record<string, unknown>;
    const driverDeposit = fields["driver_deposit"] as {
      fields?: { value?: string };
    };
    const payment = fields["payment"] as { fields?: { value?: string } };
    const ownerCollateral = fields["owner_collateral"] as {
      fields?: { value?: string };
    };

    return {
      id: escrowId,
      reservationId: fields["reservation_id"] as string,
      driver: fields["driver"] as string,
      owner: fields["slot_owner"] as string, // Fixed: use slot_owner instead of owner
      driverDeposit: Number(driverDeposit?.fields?.value ?? 0),
      payment: Number(payment?.fields?.value ?? 0),
      ownerCollateral: Number(ownerCollateral?.fields?.value ?? 0),
      state: Number(fields["state"]),
      deadlineEpoch: Number(fields["deadline_epoch"]),
      disputeFlag: fields["dispute_flag"] as boolean,
      arbiter: fields["arbiter"] as string,
      weightDriverRep: Number(fields["weight_driver_rep"]),
      weightOwnerRep: Number(fields["weight_owner_rep"]),
      disputeInitiator: Number(fields["dispute_initiator"]),
      disputeReason: Number(fields["dispute_reason"]),
    };
  }

  /**
   * Calculate required driver deposit for a payment amount.
   */
  async getRequiredDeposit(price: bigint): Promise<bigint | null> {
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${this.deployment.packageId}::escrow::get_required_deposit`,
        arguments: [tx.pure.u64(price)],
      });

      const response = await this.suiClient.devInspectTransactionBlock({
        sender: this.senderAddress,
        transactionBlock: tx,
      });

      if (response.error || !response.results?.[0]?.returnValues?.[0]) {
        return null;
      }

      const [returnValue] = response.results[0].returnValues;
      const bytes = new Uint8Array(returnValue[0]);
      const dataView = new DataView(bytes.buffer);
      return dataView.getBigUint64(0, true);
    } catch {
      return null;
    }
  }

  /**
   * Calculate required owner collateral for a payment amount.
   */
  async getRequiredCollateral(price: bigint): Promise<bigint | null> {
    try {
      const tx = new Transaction();
      tx.moveCall({
        target: `${this.deployment.packageId}::escrow::get_required_collateral`,
        arguments: [tx.pure.u64(price)],
      });

      const response = await this.suiClient.devInspectTransactionBlock({
        sender: this.senderAddress,
        transactionBlock: tx,
      });

      if (response.error || !response.results?.[0]?.returnValues?.[0]) {
        return null;
      }

      const [returnValue] = response.results[0].returnValues;
      const bytes = new Uint8Array(returnValue[0]);
      const dataView = new DataView(bytes.buffer);
      return dataView.getBigUint64(0, true);
    } catch {
      return null;
    }
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  getSuiClient(): SuiClient {
    return this.suiClient;
  }

  getDeployment(): DeploymentInfo {
    return this.deployment;
  }
}

/**
 * Create a QueryClient (no signer needed).
 * Uses deployment info from config.json
 */
export function createQueryClient(network?: NetworkType): QueryClient {
  const targetNetwork = network ?? getDefaultNetwork();
  const deployment = getDeploymentInfo(targetNetwork);

  return new QueryClient(targetNetwork, deployment);
}
