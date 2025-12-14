import { createOnChainCallsClientFromEnv } from "../OnChainCallsClient.js";
import { createQueryClient } from "../QueryClient.js";
import type { NetworkType } from "../types.js";
import type { SuiTransactionBlockResponse } from "@mysten/sui/client";
import { getDefaultNetwork } from "../config.js";

interface CreatedObjectInfo {
  objectId: string;
  objectType: string;
}

export class TransactionService {
  private onChainClient: ReturnType<typeof createOnChainCallsClientFromEnv>;
  private queryClient: ReturnType<typeof createQueryClient>;
  private network: NetworkType;

  constructor(network?: NetworkType) {
    this.network = network ?? getDefaultNetwork();
    this.onChainClient = createOnChainCallsClientFromEnv(this.network);
    this.queryClient = createQueryClient(this.network);
  }

  // ===========================================================================
  // REGISTRATION
  // ===========================================================================

  /**
   * Register as a driver.
   */
  async registerDriver(): Promise<{
    digest: string;
    driverProfileId: string | null;
  }> {
    const result = await this.onChainClient.registerDriver();
    const driverProfileId = this.extractCreatedObjectId(
      result,
      "::reputation::DriverProfile"
    );
    return { digest: result.digest, driverProfileId };
  }

  /**
   * Register as an owner.
   */
  async registerOwner(): Promise<{
    digest: string;
    ownerProfileId: string | null;
  }> {
    const result = await this.onChainClient.registerOwner();
    const ownerProfileId = this.extractCreatedObjectId(
      result,
      "::reputation::OwnerProfile"
    );
    return { digest: result.digest, ownerProfileId };
  }

  // ===========================================================================
  // PARKING SLOTS
  // ===========================================================================

  /**
   * Create a new parking slot.
   */
  async createSlot(params: {
    locationId: number;
    locationName: string;
    address: string;
    latitude: number;
    longitude: number;
    basePricePerHour: bigint;
  }): Promise<{
    digest: string;
    slotId: string | null;
    ownerCapId: string | null;
  }> {
    const result = await this.onChainClient.createSlot(params);
    const slotId = this.extractCreatedObjectId(result, "::market::ParkingSlot");
    const ownerCapId = this.extractCreatedObjectId(
      result,
      "::market::SlotOwnerCap"
    );
    return { digest: result.digest, slotId, ownerCapId };
  }

  /**
   * Update slot pricing.
   */
  async updateSlotPricing(
    slotId: string,
    ownerCapId: string,
    newBasePrice: bigint,
    newDynamicCoeff: number
  ): Promise<{ digest: string }> {
    const result = await this.onChainClient.updateSlotPricing(
      slotId,
      ownerCapId,
      newBasePrice,
      newDynamicCoeff
    );
    return { digest: result.digest };
  }

  // ===========================================================================
  // RESERVATIONS
  // ===========================================================================

  /**
   * Create a reservation for a parking slot.
   * Checks availability before creating reservation to prevent time conflicts.
   */
  async createReservation(
    slotId: string,
    durationHours: number,
    startTime?: bigint
  ): Promise<{
    digest: string;
    reservationId: string | null;
  }> {
    const start = startTime ?? BigInt(Date.now());
    const end = start + BigInt(durationHours * 3600 * 1000); // Convert hours to ms
    
    // Check availability before creating reservation
    const isAvailable = await this.queryClient.isSlotAvailableForInterval(
      slotId,
      Number(start),
      Number(end)
    );
    
    if (!isAvailable) {
      throw new Error(
        `Slot is not available for the requested time interval (${new Date(Number(start)).toISOString()} - ${new Date(Number(end)).toISOString()})`
      );
    }
    
    const result = await this.onChainClient.createReservation(
      slotId,
      durationHours,
      start
    );
    const reservationId = this.extractCreatedObjectId(
      result,
      "::market::Reservation"
    );
    return { digest: result.digest, reservationId };
  }

  // ===========================================================================
  // ESCROW
  // ===========================================================================

  /**
   * Lock funds in escrow for a reservation.
   */
  async lockFunds(params: {
    reservationId: string;
    slotId: string;
    paymentCoinId: string;
    depositCoinId: string;
    ownerCollateralCoinId: string;
  }): Promise<{
    digest: string;
    escrowId: string | null;
  }> {
    const result = await this.onChainClient.lockFunds(params);
    const escrowId = this.extractCreatedObjectId(result, "::escrow::Escrow");
    return { digest: result.digest, escrowId };
  }

  /**
   * Mark parking as used (driver arrived).
   */
  async markUsed(escrowId: string): Promise<{ digest: string }> {
    const result = await this.onChainClient.markUsed(escrowId);
    return { digest: result.digest };
  }

  /**
   * Settle the escrow (complete parking successfully).
   */
  async settle(params: {
    escrowId: string;
    reservationId: string;
    slotId: string;
    driverProfileId: string;
    ownerProfileId: string;
  }): Promise<{ digest: string }> {
    const result = await this.onChainClient.settle(params);
    return { digest: result.digest };
  }

  /**
   * Open a dispute.
   */
  async openDispute(
    escrowId: string,
    reservationId: string,
    reason: number
  ): Promise<{ digest: string }> {
    const result = await this.onChainClient.openDispute(
      escrowId,
      reservationId,
      reason
    );
    return { digest: result.digest };
  }

  /**
   * Arbiter decides dispute outcome.
   */
  async arbiterDecide(params: {
    escrowId: string;
    reservationId: string;
    slotId: string;
    decision: number;
  }): Promise<{ digest: string }> {
    const result = await this.onChainClient.arbiterDecide(params);
    return { digest: result.digest };
  }

  // ===========================================================================
  // REPUTATION
  // ===========================================================================

  /**
   * Rate a driver (called by owner).
   */
  async rateDriver(
    driverProfileId: string,
    rating: number
  ): Promise<{ digest: string }> {
    const result = await this.onChainClient.rateDriver(driverProfileId, rating);
    return { digest: result.digest };
  }

  /**
   * Rate an owner (called by driver).
   */
  async rateOwner(
    ownerProfileId: string,
    rating: number
  ): Promise<{ digest: string }> {
    const result = await this.onChainClient.rateOwner(ownerProfileId, rating);
    return { digest: result.digest };
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  /**
   * Extract created object ID from transaction response.
   */
  private extractCreatedObjectId(
    result: SuiTransactionBlockResponse,
    typeSubstring: string
  ): string | null {
    const createdObjects =
      result.objectChanges?.filter((change) => change.type === "created") || [];

    const match = createdObjects.find(
      (change) =>
        change.type === "created" && change.objectType?.includes(typeSubstring)
    );

    return match?.type === "created" ? match.objectId : null;
  }

  /**
   * Extract all created objects from transaction response.
   */
  private extractAllCreatedObjects(
    result: SuiTransactionBlockResponse
  ): CreatedObjectInfo[] {
    return (result.objectChanges || [])
      .filter((change) => change.type === "created")
      .map((change) => ({
        objectId: change.type === "created" ? change.objectId : "",
        objectType: change.type === "created" ? change.objectType || "" : "",
      }))
      .filter((obj) => obj.objectId !== "");
  }

  /**
   * Get the signer's address.
   */
  getSignerAddress(): string {
    return this.onChainClient.getSigner().getPublicKey().toSuiAddress();
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
    return this.onChainClient.getDeployment();
  }
}

// Singleton instance for convenience
let defaultInstance: TransactionService | null = null;

export function getTransactionService(
  network?: NetworkType
): TransactionService {
  if (
    !defaultInstance ||
    (network && network !== defaultInstance.getNetwork())
  ) {
    defaultInstance = new TransactionService(network);
  }
  return defaultInstance;
}
