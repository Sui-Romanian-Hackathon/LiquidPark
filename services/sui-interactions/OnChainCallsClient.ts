import {
  SuiClient,
  getFullnodeUrl,
  type SuiTransactionBlockResponse,
} from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { Transaction } from "@mysten/sui/transactions";

import { CLOCK_ID, type NetworkType, type DeploymentInfo } from "./types.js";
import { getDeploymentInfo, getDefaultNetwork } from "./config.js";

export class OnChainCallsClient {
  private suiClient: SuiClient;
  private signer: Ed25519Keypair;
  private deployment: DeploymentInfo;

  constructor(
    network: NetworkType,
    signer: Ed25519Keypair,
    deployment: DeploymentInfo
  ) {
    this.suiClient = new SuiClient({ url: getFullnodeUrl(network) });
    this.signer = signer;
    this.deployment = deployment;
  }

  // ==========================================================================
  // REPUTATION MODULE
  // ==========================================================================

  /**
   * Register as a driver and create a DriverProfile.
   */
  async registerDriver(): Promise<SuiTransactionBlockResponse> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.deployment.packageId}::reputation::register_driver`,
      arguments: [
        tx.object(this.deployment.reputationRegistryId),
        tx.object(CLOCK_ID),
      ],
    });

    return this.executeTransaction(tx);
  }

  /**
   * Register as an owner and create an OwnerProfile.
   */
  async registerOwner(): Promise<SuiTransactionBlockResponse> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.deployment.packageId}::reputation::register_owner`,
      arguments: [
        tx.object(this.deployment.reputationRegistryId),
        tx.object(CLOCK_ID),
      ],
    });

    return this.executeTransaction(tx);
  }

  /**
   * Update driver profile after successful parking.
   */
  async updateDriverSuccess(
    driverProfileId: string,
    amountSpent: bigint
  ): Promise<SuiTransactionBlockResponse> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.deployment.packageId}::reputation::update_driver_success`,
      arguments: [
        tx.object(driverProfileId),
        tx.pure.u64(amountSpent),
        tx.object(CLOCK_ID),
      ],
    });

    return this.executeTransaction(tx);
  }

  /**
   * Update owner profile after successful rental.
   */
  async updateOwnerSuccess(
    ownerProfileId: string,
    amountEarned: bigint
  ): Promise<SuiTransactionBlockResponse> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.deployment.packageId}::reputation::update_owner_success`,
      arguments: [
        tx.object(ownerProfileId),
        tx.pure.u64(amountEarned),
        tx.object(CLOCK_ID),
      ],
    });

    return this.executeTransaction(tx);
  }

  /**
   * Update driver profile after dispute.
   */
  async updateDriverDispute(
    driverProfileId: string,
    won: boolean
  ): Promise<SuiTransactionBlockResponse> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.deployment.packageId}::reputation::update_driver_dispute`,
      arguments: [
        tx.object(driverProfileId),
        tx.pure.bool(won),
        tx.object(CLOCK_ID),
      ],
    });

    return this.executeTransaction(tx);
  }

  /**
   * Update owner profile after dispute.
   */
  async updateOwnerDispute(
    ownerProfileId: string,
    won: boolean
  ): Promise<SuiTransactionBlockResponse> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.deployment.packageId}::reputation::update_owner_dispute`,
      arguments: [
        tx.object(ownerProfileId),
        tx.pure.bool(won),
        tx.object(CLOCK_ID),
      ],
    });

    return this.executeTransaction(tx);
  }

  /**
   * Rate a driver (called by owner after parking).
   * Rating: 2000-10000 (1-5 stars scaled to basis points)
   */
  async rateDriver(
    driverProfileId: string,
    rating: number
  ): Promise<SuiTransactionBlockResponse> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.deployment.packageId}::reputation::rate_driver`,
      arguments: [
        tx.object(driverProfileId),
        tx.pure.u64(rating),
        tx.object(CLOCK_ID),
      ],
    });

    return this.executeTransaction(tx);
  }

  /**
   * Rate an owner (called by driver after parking).
   * Rating: 2000-10000 (1-5 stars scaled to basis points)
   */
  async rateOwner(
    ownerProfileId: string,
    rating: number
  ): Promise<SuiTransactionBlockResponse> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.deployment.packageId}::reputation::rate_owner`,
      arguments: [
        tx.object(ownerProfileId),
        tx.pure.u64(rating),
        tx.object(CLOCK_ID),
      ],
    });

    return this.executeTransaction(tx);
  }

  /**
   * Mint a reputation badge for a driver.
   * Badge types: 0=Newcomer, 1=Regular, 2=Trusted, 3=VIP, 4=Dispute-Free
   */
  async mintBadge(
    driverProfileId: string,
    badgeType: number
  ): Promise<SuiTransactionBlockResponse> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.deployment.packageId}::reputation::mint_badge`,
      arguments: [
        tx.object(driverProfileId),
        tx.pure.u8(badgeType),
        tx.object(CLOCK_ID),
      ],
    });

    return this.executeTransaction(tx);
  }

  // ==========================================================================
  // MARKET MODULE
  // ==========================================================================

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
  }): Promise<SuiTransactionBlockResponse> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.deployment.packageId}::market::create_slot`,
      arguments: [
        tx.object(this.deployment.zoneRegistryId),
        tx.pure.u64(params.locationId),
        tx.pure.string(params.locationName),
        tx.pure.string(params.address),
        tx.pure.u64(params.latitude),
        tx.pure.u64(params.longitude),
        tx.pure.u64(params.basePricePerHour),
        tx.object(CLOCK_ID),
      ],
    });

    return this.executeTransaction(tx);
  }

  /**
   * Update slot pricing parameters (owner only).
   */
  async updateSlotPricing(
    slotId: string,
    ownerCapId: string,
    newBasePrice: bigint,
    newDynamicCoeff: number
  ): Promise<SuiTransactionBlockResponse> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.deployment.packageId}::market::update_slot_pricing`,
      arguments: [
        tx.object(slotId),
        tx.object(ownerCapId),
        tx.pure.u64(newBasePrice),
        tx.pure.u64(newDynamicCoeff),
      ],
    });

    return this.executeTransaction(tx);
  }

  /**
   * Get a price quote for a slot (emits PriceQuoted event).
   */
  async getPriceQuote(
    slotId: string,
    durationHours: number
  ): Promise<SuiTransactionBlockResponse> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.deployment.packageId}::market::get_price_quote`,
      arguments: [
        tx.object(slotId),
        tx.object(this.deployment.zoneRegistryId),
        tx.pure.u64(durationHours),
      ],
    });

    return this.executeTransaction(tx);
  }

  /**
   * Create a reservation for a parking slot.
   */
  async createReservation(
    slotId: string,
    durationHours: number,
    startTime: bigint
  ): Promise<SuiTransactionBlockResponse> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.deployment.packageId}::market::create_reservation`,
      arguments: [
        tx.object(slotId),
        tx.object(this.deployment.zoneRegistryId),
        tx.pure.u64(durationHours),
        tx.pure.u64(startTime),
        tx.object(CLOCK_ID),
      ],
    });

    return this.executeTransaction(tx);
  }

  // ==========================================================================
  // ESCROW MODULE
  // ==========================================================================

  /**
   * Lock funds for a reservation.
   * This creates an escrow with payment, driver deposit, and owner collateral.
   */
  async lockFunds(params: {
    reservationId: string;
    slotId: string;
    paymentCoinId: string;
    depositCoinId: string;
    ownerCollateralCoinId: string;
  }): Promise<SuiTransactionBlockResponse> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.deployment.packageId}::escrow::lock_funds_entry`,
      arguments: [
        tx.object(this.deployment.escrowConfigId),
        tx.object(params.reservationId),
        tx.object(params.slotId),
        tx.object(this.deployment.reputationRegistryId),
        tx.object(params.paymentCoinId),
        tx.object(params.depositCoinId),
        tx.object(params.ownerCollateralCoinId),
        tx.object(CLOCK_ID),
      ],
    });

    return this.executeTransaction(tx);
  }

  /**
   * Mark parking slot as used (driver confirms they parked).
   */
  async markUsed(escrowId: string): Promise<SuiTransactionBlockResponse> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.deployment.packageId}::escrow::mark_used`,
      arguments: [tx.object(escrowId), tx.object(CLOCK_ID)],
    });

    return this.executeTransaction(tx);
  }

  /**
   * Settle the escrow after successful parking (no disputes).
   */
  async settle(params: {
    escrowId: string;
    reservationId: string;
    slotId: string;
    driverProfileId: string;
    ownerProfileId: string;
  }): Promise<SuiTransactionBlockResponse> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.deployment.packageId}::escrow::settle`,
      arguments: [
        tx.object(params.escrowId),
        tx.object(this.deployment.escrowConfigId),
        tx.object(params.reservationId),
        tx.object(params.slotId),
        tx.object(this.deployment.zoneRegistryId),
        tx.object(params.driverProfileId),
        tx.object(params.ownerProfileId),
        tx.object(CLOCK_ID),
      ],
    });

    return this.executeTransaction(tx);
  }

  /**
   * Open a dispute (can be called by driver or owner).
   * Reason codes are protocol-specific.
   */
  async openDispute(
    escrowId: string,
    reservationId: string,
    reason: number
  ): Promise<SuiTransactionBlockResponse> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.deployment.packageId}::escrow::open_dispute`,
      arguments: [
        tx.object(escrowId),
        tx.object(reservationId),
        tx.pure.u8(reason),
        tx.object(CLOCK_ID),
      ],
    });

    return this.executeTransaction(tx);
  }

  /**
   * Arbiter decides the dispute outcome.
   * Decision: 0=favor driver, 1=favor owner, 2=split
   */
  async arbiterDecide(params: {
    escrowId: string;
    reservationId: string;
    slotId: string;
    decision: number;
  }): Promise<SuiTransactionBlockResponse> {
    const tx = new Transaction();

    tx.moveCall({
      target: `${this.deployment.packageId}::escrow::arbiter_decide`,
      arguments: [
        tx.object(params.escrowId),
        tx.object(this.deployment.escrowConfigId),
        tx.object(params.reservationId),
        tx.object(params.slotId),
        tx.object(this.deployment.zoneRegistryId),
        tx.object(this.deployment.reputationRegistryId),
        tx.pure.u8(params.decision),
        tx.object(CLOCK_ID),
      ],
    });

    return this.executeTransaction(tx);
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  private async executeTransaction(
    tx: Transaction
  ): Promise<SuiTransactionBlockResponse> {
    return this.suiClient.signAndExecuteTransaction({
      signer: this.signer,
      transaction: tx,
      options: {
        showEffects: true,
        showObjectChanges: true,
        showEvents: true,
      },
    });
  }

  getSuiClient(): SuiClient {
    return this.suiClient;
  }

  getSigner(): Ed25519Keypair {
    return this.signer;
  }

  getSignerAddress(): string {
    return this.signer.getPublicKey().toSuiAddress();
  }

  getDeployment(): DeploymentInfo {
    return this.deployment;
  }
}

/**
 * Create an OnChainCallsClient from environment variables and config.
 * Uses PRIVATE_KEY from env, deployment info from config.json
 */
export function createOnChainCallsClientFromEnv(
  network?: NetworkType
): OnChainCallsClient {
  const targetNetwork = network ?? getDefaultNetwork();

  const secretKey = process.env.PRIVATE_KEY;
  if (!secretKey) {
    throw new Error("PRIVATE_KEY environment variable is required");
  }

  const deployment = getDeploymentInfo(targetNetwork);
  const signer = Ed25519Keypair.fromSecretKey(secretKey);

  return new OnChainCallsClient(targetNetwork, signer, deployment);
}
