#!/usr/bin/env node
/**
 * Script to create a parking slot near FSEGA (Cluj-Napoca) for testing.
 *
 * Usage:
 *   PRIVATE_KEY=your_key npx tsx create-fsega-slot.ts [network]
 *
 * Or set PRIVATE_KEY in .env file
 */
import {
  createOnChainCallsClientFromEnv,
  createQueryClient,
} from "../index.js";
import type { SuiTransactionBlockResponse } from "@mysten/sui/client";
import type { NetworkType } from "../types.js";
import { getDefaultNetwork } from "../config.js";
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
      (change.objectType?.endsWith(`::${objectType}`) ||
        change.objectType?.includes(`::${objectType}<`))
  );
  return created && "objectId" in created ? created.objectId : null;
}

// ============================================================================
// FSEGA COORDINATES
// ============================================================================

// FSEGA (Faculty of Economics and Business Administration) coordinates
// Cluj-Napoca, Romania
const FSEGA_LAT = 46.766;
const FSEGA_LNG = 23.599;

// Scaled coordinates (multiply by 1,000,000 for Sui storage)
const FSEGA_LAT_SCALED = Math.floor(FSEGA_LAT * 1_000_000);
const FSEGA_LNG_SCALED = Math.floor(FSEGA_LNG * 1_000_000);

// Nearby locations for creating multiple test slots
// These match the test data in test_api.py
const NEARBY_SLOTS = [
  {
    name: "Strada Teodor Mihali 58",
    address: "Strada Teodor Mihali 58, Cluj-Napoca",
    lat: 46.767,
    lng: 23.598,
    pricePerHour: BigInt(80_000_000), // 0.08 SUI/hour ≈ 8 RON/hour
  },
  {
    name: "Strada Memorandumului 28",
    address: "Strada Memorandumului 28, Cluj-Napoca",
    lat: 46.768,
    lng: 23.6,
    pricePerHour: BigInt(60_000_000), // 0.06 SUI/hour ≈ 6 RON/hour
  },
  {
    name: "FSEGA Main Entrance",
    address: "Strada Teodor Mihali 58-60, Cluj-Napoca 400591, Romania",
    lat: FSEGA_LAT,
    lng: FSEGA_LNG,
    pricePerHour: BigInt(100_000_000), // 0.1 SUI/hour ≈ 10 RON/hour
  },
];

// ============================================================================
// MAIN FUNCTION
// ============================================================================

async function createFsegaSlot(
  network: NetworkType = "testnet",
  slotIndex: number = 0
) {
  try {
    console.log("=".repeat(60));
    console.log("  Create Parking Slot near FSEGA");
    console.log("=".repeat(60));
    console.log(`Network: ${network}`);
    console.log();

    // Create clients
    const onChainClient = createOnChainCallsClientFromEnv(network);
    const queryClient = createQueryClient(network);
    const signerAddress = onChainClient.getSignerAddress();

    console.log(`Signer address: ${signerAddress}`);
    console.log();

    // Check if owner is registered
    const ownerProfile = await queryClient.findOwnerProfileByAddress(
      signerAddress
    );

    if (!ownerProfile) {
      console.log("📝 Registering as owner...");
      const registerTx = await onChainClient.registerOwner();
      console.log(`✅ Owner registration TX: ${registerTx.digest}`);
      await sleep(2000);
      console.log();
    } else {
      console.log(`✓ Owner already registered (Profile: ${ownerProfile.id})`);
      console.log();
    }

    // Select slot to create
    const normalizedIndex = slotIndex % NEARBY_SLOTS.length;
    const slotConfig = NEARBY_SLOTS[normalizedIndex];

    if (!slotConfig) {
      throw new Error(
        `Invalid slot index: ${slotIndex} (normalized: ${normalizedIndex})`
      );
    }

    const latScaled = Math.floor(slotConfig.lat * 1_000_000);
    const lngScaled = Math.floor(slotConfig.lng * 1_000_000);

    console.log("🅿️  Creating parking slot...");
    console.log(`   Location: ${slotConfig.name}`);
    console.log(`   Coordinates: ${slotConfig.lat}, ${slotConfig.lng}`);
    console.log(
      `   Price: ${slotConfig.pricePerHour} MIST/hour (${
        Number(slotConfig.pricePerHour) / 1_000_000_000
      } SUI/hour)`
    );
    console.log();

    const slotTx = await onChainClient.createSlot({
      locationId: Date.now(), // Unique ID based on timestamp
      locationName: slotConfig.name,
      address: slotConfig.address || slotConfig.name, // Use address if available, otherwise use name as fallback
      latitude: latScaled,
      longitude: lngScaled,
      basePricePerHour: slotConfig.pricePerHour,
    });

    console.log(`✅ Create slot TX: ${slotTx.digest}`);
    console.log(
      `   Explorer: https://suiexplorer.com/txblock/${slotTx.digest}?network=${network}`
    );

    const slotId = getCreatedObjectId(slotTx, "ParkingSlot");
    const ownerCapId = getCreatedObjectId(slotTx, "SlotOwnerCap");

    if (!slotId || !ownerCapId) {
      throw new Error("Failed to create parking slot - missing IDs");
    }

    console.log(`   Slot ID: ${slotId}`);
    console.log(`   Owner Cap ID: ${ownerCapId}`);
    console.log();

    await sleep(2000);

    // Query the slot to verify
    const slot = await queryClient.getParkingSlot(slotId);
    if (slot) {
      console.log("✓ Slot created successfully!");
      console.log();
      console.log("Slot details:");
      console.log(`   ID: ${slot.id}`);
      console.log(`   Location: ${slot.locationName}`);
      console.log(
        `   Coordinates: ${slot.latitude / 1_000_000}, ${
          slot.longitude / 1_000_000
        }`
      );
      console.log(`   Base price: ${slot.basePricePerHour} MIST/hour`);
      console.log(
        `   Status: ${
          slot.status === 0
            ? "FREE"
            : slot.status === 1
            ? "RESERVED"
            : "OCCUPIED"
        }`
      );
      console.log();
      console.log("=".repeat(60));
      console.log("✅ Success! Slot is ready for testing.");
      console.log("=".repeat(60));
      console.log();
      console.log("You can now test the integration:");
      console.log(
        `  python integrated_test.py "I need parking near FSEGA for 2 hours" ${network}`
      );
    } else {
      console.log(
        "⚠️  Warning: Could not query created slot (might need more time)"
      );
    }
  } catch (error) {
    console.error("❌ Error:", error);
    if (error instanceof Error) {
      console.error("   Message:", error.message);
    }
    process.exit(1);
  }
}

// ============================================================================
// CLI HANDLING
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const network = (args[0] as NetworkType) || getDefaultNetwork();
  const slotIndex = args[1] ? parseInt(args[1]) : 0;

  // Validate network
  if (!["testnet", "mainnet", "devnet"].includes(network)) {
    console.error(`Invalid network: ${network}`);
    console.error("Valid networks: testnet, mainnet, devnet");
    process.exit(1);
  }

  // Check for PRIVATE_KEY
  if (!process.env.PRIVATE_KEY) {
    console.error("❌ Error: PRIVATE_KEY environment variable is required");
    console.error();
    console.error("Usage:");
    console.error(
      "  PRIVATE_KEY=your_key npx tsx create-fsega-slot.ts [network] [slot_index]"
    );
    console.error();
    console.error("Or set PRIVATE_KEY in .env file");
    process.exit(1);
  }

  await createFsegaSlot(network, slotIndex);
}

main().catch(console.error);
