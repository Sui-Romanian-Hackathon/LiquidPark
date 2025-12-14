import {
  createOnChainCallsClientFromEnv,
  createQueryClient,
} from "../index.js";
import type { SuiTransactionBlockResponse } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { CLOCK_ID } from "../types.js";
import dotenv from "dotenv";

dotenv.config();

// ============================================================================
// HELPERS
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCreatedObjectId(
  response: SuiTransactionBlockResponse,
  objectType: string
): string | null {
  const created = response.objectChanges?.find(
    (change) =>
      change.type === "created" &&
      change.objectType?.includes(objectType) &&
      // Exact match for type name (avoid Escrow matching EscrowReceipt)
      (change.objectType?.endsWith(`::${objectType}`) ||
        change.objectType?.includes(`::${objectType}<`))
  );
  return created && "objectId" in created ? created.objectId : null;
}

async function logSection(title: string) {
  console.log("\n" + "=".repeat(60));
  console.log(`  ${title}`);
  console.log("=".repeat(60));
}

// ============================================================================
// MAIN TEST FLOW
// ============================================================================

async function main() {
  // Create clients
  const onChainClient = createOnChainCallsClientFromEnv("testnet");
  const queryClient = createQueryClient("testnet");
  const signerAddress = onChainClient.getSignerAddress();

  console.log("🚗 Parking Market - Complete Flow Test");
  console.log("Signer address:", signerAddress);

  // --------------------------------------------------------------------------
  // STEP 1: Check/Register Profiles
  // --------------------------------------------------------------------------
  await logSection("STEP 1: Profiles");

  let driverProfile = await queryClient.findDriverProfileByAddress(
    signerAddress
  );
  if (!driverProfile) {
    console.log("📝 Registering as driver...");
    const tx = await onChainClient.registerDriver();
    console.log("✅ Driver registration TX:", tx.digest);
    await sleep(2000);
    driverProfile = await queryClient.findDriverProfileByAddress(signerAddress);
  }
  console.log("Driver profile:", driverProfile?.id);
  console.log("  - Score:", driverProfile?.score);
  console.log("  - Successful parkings:", driverProfile?.successfulParkings);

  let ownerProfile = await queryClient.findOwnerProfileByAddress(signerAddress);
  if (!ownerProfile) {
    console.log("📝 Registering as owner...");
    const tx = await onChainClient.registerOwner();
    console.log("✅ Owner registration TX:", tx.digest);
    await sleep(2000);
    ownerProfile = await queryClient.findOwnerProfileByAddress(signerAddress);
  }
  console.log("Owner profile:", ownerProfile?.id);
  console.log("  - Score:", ownerProfile?.score);
  console.log("  - Successful rentals:", ownerProfile?.successfulRentals);

  // --------------------------------------------------------------------------
  // STEP 2: Create Parking Slot
  // --------------------------------------------------------------------------
  await logSection("STEP 2: Create Parking Slot");

  console.log("🅿️ Creating parking slot...");
  const slotTx = await onChainClient.createSlot({
    locationId: Date.now(), // unique ID
    locationName: "Test Parking Slot - Bucharest",
    address: "Strada Test, Bucharest, Romania", // Test address
    latitude: 44_432_500, // 44.4325° N (scaled)
    longitude: 26_103_889, // 26.1039° E (scaled)
    basePricePerHour: BigInt(100_000_000), // 0.1 SUI per hour
  });
  console.log("✅ Create slot TX:", slotTx.digest);

  const slotId = getCreatedObjectId(slotTx, "ParkingSlot");
  const ownerCapId = getCreatedObjectId(slotTx, "SlotOwnerCap");
  console.log("  - Slot ID:", slotId);
  console.log("  - Owner Cap ID:", ownerCapId);

  if (!slotId || !ownerCapId) {
    throw new Error("Failed to create parking slot");
  }

  await sleep(2000);

  // Query the slot
  const slot = await queryClient.getParkingSlot(slotId);
  console.log("Slot details:");
  console.log("  - Location:", slot?.locationName);
  console.log("  - Base price:", slot?.basePricePerHour, "MIST/hour");
  console.log("  - Status:", slot?.status === 0 ? "FREE" : "OCCUPIED");

  // --------------------------------------------------------------------------
  // STEP 3: Get Price Quote
  // --------------------------------------------------------------------------
  await logSection("STEP 3: Price Quote");

  console.log("💰 Getting price quote for 2 hours...");
  const quoteTx = await onChainClient.getPriceQuote(slotId, 2);
  console.log("✅ Price quote TX:", quoteTx.digest);

  // Extract price from events
  const priceEvent = quoteTx.events?.find((e) =>
    e.type.includes("PriceQuoted")
  );
  if (priceEvent && "parsedJson" in priceEvent) {
    const eventData = priceEvent.parsedJson as Record<string, unknown>;
    console.log("  - Final price:", eventData.final_price, "MIST");
    console.log("  - Zone multiplier:", eventData.zone_multiplier);
  }

  // --------------------------------------------------------------------------
  // STEP 4: Create Reservation
  // --------------------------------------------------------------------------
  await logSection("STEP 4: Create Reservation");

  const startTime = BigInt(Date.now() + 60000); // Start in 1 minute
  const durationHours = 2;

  console.log("📅 Creating reservation...");
  console.log("  - Duration:", durationHours, "hours");
  console.log("  - Start time:", new Date(Number(startTime)).toISOString());

  const reservationTx = await onChainClient.createReservation(
    slotId,
    durationHours,
    startTime
  );
  console.log("✅ Reservation TX:", reservationTx.digest);

  const reservationId = getCreatedObjectId(reservationTx, "Reservation");
  console.log("  - Reservation ID:", reservationId);

  if (!reservationId) {
    throw new Error("Failed to create reservation");
  }

  await sleep(2000);

  // Query reservation
  const reservation = await queryClient.getReservation(reservationId);
  console.log("Reservation details:");
  console.log("  - Driver:", reservation?.driver);
  console.log("  - Price locked:", reservation?.priceLocked, "MIST");
  console.log("  - State:", reservation?.state === 0 ? "REQUESTED" : "OTHER");

  // --------------------------------------------------------------------------
  // STEP 5: Lock Funds (Escrow)
  // --------------------------------------------------------------------------
  await logSection("STEP 5: Lock Funds (Escrow)");

  const paymentAmount = reservation?.priceLocked ?? 200_000_000;
  const depositAmount = Math.floor(paymentAmount * 0.1); // 10% deposit
  const collateralAmount = Math.floor(paymentAmount * 0.2); // 20% collateral
  const totalNeeded = paymentAmount + depositAmount + collateralAmount;

  console.log("💳 Locking funds in escrow...");
  console.log("  - Payment:", paymentAmount, "MIST");
  console.log("  - Driver deposit (10%):", depositAmount, "MIST");
  console.log("  - Owner collateral (20%):", collateralAmount, "MIST");
  console.log("  - Total needed:", totalNeeded, "MIST");

  // Build transaction that splits coins and locks escrow
  const deployment = onChainClient.getDeployment();
  const tx = new Transaction();

  // Split the gas coin into 3 coins for payment, deposit, collateral
  const [paymentCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(paymentAmount)]);
  const [depositCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(depositAmount)]);
  const [collateralCoin] = tx.splitCoins(tx.gas, [
    tx.pure.u64(collateralAmount),
  ]);

  tx.moveCall({
    target: `${deployment.packageId}::escrow::lock_funds_entry`,
    arguments: [
      tx.object(deployment.escrowConfigId),
      tx.object(reservationId),
      tx.object(slotId),
      tx.object(deployment.reputationRegistryId),
      paymentCoin,
      depositCoin,
      collateralCoin,
      tx.object(CLOCK_ID),
    ],
  });

  const escrowTx = await onChainClient
    .getSuiClient()
    .signAndExecuteTransaction({
      signer: onChainClient.getSigner(),
      transaction: tx,
      options: {
        showEffects: true,
        showObjectChanges: true,
        showEvents: true,
      },
    });
  console.log("✅ Lock funds TX:", escrowTx.digest);

  const escrowId = getCreatedObjectId(escrowTx, "Escrow");
  const receiptId = getCreatedObjectId(escrowTx, "EscrowReceipt");
  console.log("  - Escrow ID:", escrowId);
  console.log("  - Receipt ID:", receiptId);

  if (!escrowId) {
    throw new Error("Failed to create escrow");
  }

  await sleep(2000);

  // --------------------------------------------------------------------------
  // STEP 6: Mark as Used
  // --------------------------------------------------------------------------
  await logSection("STEP 6: Mark as Used");

  console.log("✋ Driver marking slot as used...");
  const markUsedTx = await onChainClient.markUsed(escrowId);
  console.log("✅ Mark used TX:", markUsedTx.digest);

  await sleep(2000);

  // --------------------------------------------------------------------------
  // STEP 7: Settle Escrow
  // --------------------------------------------------------------------------
  await logSection("STEP 7: Settle Escrow");

  console.log("💰 Settling escrow...");
  const settleTx = await onChainClient.settle({
    escrowId,
    reservationId,
    slotId,
    driverProfileId: driverProfile!.id,
    ownerProfileId: ownerProfile!.id,
  });
  console.log("✅ Settle TX:", settleTx.digest);

  // Extract settlement details from events
  const settleEvent = settleTx.events?.find((e) =>
    e.type.includes("EscrowSettled")
  );
  if (settleEvent && "parsedJson" in settleEvent) {
    const eventData = settleEvent.parsedJson as Record<string, unknown>;
    console.log("  - Owner payout:", eventData.owner_payout, "MIST");
    console.log("  - Driver refund:", eventData.driver_refund, "MIST");
    console.log("  - Protocol fee:", eventData.protocol_fee, "MIST");
  }

  await sleep(2000);

  // --------------------------------------------------------------------------
  // STEP 8: Rate Each Other
  // --------------------------------------------------------------------------
  await logSection("STEP 8: Ratings");

  console.log("⭐ Rating owner (5 stars = 10000)...");
  const rateOwnerTx = await onChainClient.rateOwner(ownerProfile!.id, 10000);
  console.log("✅ Rate owner TX:", rateOwnerTx.digest);

  console.log("⭐ Rating driver (5 stars = 10000)...");
  const rateDriverTx = await onChainClient.rateDriver(driverProfile!.id, 10000);
  console.log("✅ Rate driver TX:", rateDriverTx.digest);

  await sleep(2000);

  // --------------------------------------------------------------------------
  // STEP 9: Final Summary
  // --------------------------------------------------------------------------
  await logSection("FINAL SUMMARY");

  // Re-query profiles to see updated stats
  const finalDriverProfile = await queryClient.findDriverProfileByAddress(
    signerAddress
  );
  const finalOwnerProfile = await queryClient.findOwnerProfileByAddress(
    signerAddress
  );

  console.log("🎉 Complete Parking Flow Executed Successfully!");
  console.log("\n📊 Final Stats:");
  console.log("\nDriver Profile:");
  console.log("  - Score:", finalDriverProfile?.score);
  console.log(
    "  - Successful parkings:",
    finalDriverProfile?.successfulParkings
  );
  console.log("  - Rating count:", finalDriverProfile?.ratingCount);

  console.log("\nOwner Profile:");
  console.log("  - Score:", finalOwnerProfile?.score);
  console.log("  - Successful rentals:", finalOwnerProfile?.successfulRentals);
  console.log("  - Rating count:", finalOwnerProfile?.ratingCount);
  console.log("  - Total earned:", finalOwnerProfile?.totalEarned, "MIST");

  console.log("\n✅ All objects created:");
  console.log("  - Driver Profile:", driverProfile?.id);
  console.log("  - Owner Profile:", ownerProfile?.id);
  console.log("  - Parking Slot:", slotId);
  console.log("  - Slot Owner Cap:", ownerCapId);
  console.log("  - Reservation:", reservationId);
  console.log("  - Escrow:", escrowId);
  console.log("  - Escrow Receipt:", receiptId);
}

main().catch(console.error);
