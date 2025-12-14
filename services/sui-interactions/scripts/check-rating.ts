import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { QueryClient } from '../QueryClient.js';
import { createQueryClient } from '../index.js';

// Addresses to check
const addresses = [
  '0xa4f8022fe051d0d5efaf3b383b870900a5d2445d19fe48a0d4864e91f5349e38',
  '0x22c3c92b5d22e7aae6000065796744697af51195d2a865fb7c006d5e24f38f19',
];

async function checkRating() {
  // Initialize QueryClient using the helper function
  const network = 'testnet';
  const queryClient = createQueryClient(network);

  console.log('🔍 Checking ratings for addresses...\n');

  for (const address of addresses) {
    console.log(`\n📍 Address: ${address}`);
    console.log('─'.repeat(80));

    try {
      // Get user profile ID
      const profileId = await queryClient.getUserProfileId(address);
      
      if (!profileId) {
        console.log('❌ No UserProfile found for this address');
        console.log('   User is not registered in the reputation system');
        continue;
      }

      console.log(`✅ UserProfile ID: ${profileId}`);

      // Get owner profile (which is actually UserProfile)
      const ownerProfile = await queryClient.getOwnerProfile(profileId);

      if (!ownerProfile) {
        console.log('❌ Could not fetch UserProfile object');
        continue;
      }

      console.log('\n📊 Profile Details:');
      console.log(`   Score: ${ownerProfile.score} / 10000`);
      console.log(`   Rating Count: ${ownerProfile.ratingCount}`);
      console.log(`   Rating Sum: ${ownerProfile.ratingSum}`);

      if (ownerProfile.ratingCount > 0) {
        const avgRatingBasisPoints = ownerProfile.ratingSum / ownerProfile.ratingCount;
        const stars = avgRatingBasisPoints / 2000; // Convert to stars (1-5)
        const avgRating = Math.round(stars * 2) / 2; // Round to nearest 0.5

        console.log(`\n⭐ Rating Calculation:`);
        console.log(`   Average Rating (basis points): ${avgRatingBasisPoints.toFixed(2)}`);
        console.log(`   Average Rating (stars): ${avgRating.toFixed(1)} / 5.0`);
        console.log(`   Display: ${'⭐'.repeat(Math.floor(avgRating))}${avgRating % 1 >= 0.5 ? '✨' : ''}${'☆'.repeat(5 - Math.floor(avgRating) - (avgRating % 1 >= 0.5 ? 1 : 0))}`);
      } else {
        console.log(`\n⭐ Rating: No ratings yet (0 ratings)`);
      }

      console.log(`\n📈 Owner Stats:`);
      console.log(`   Successful Rentals: ${ownerProfile.successfulRentals}`);
      console.log(`   Disputes Received: ${ownerProfile.disputesReceived}`);
      console.log(`   Disputes Won: ${ownerProfile.disputesWon}`);
      console.log(`   Disputes Lost: ${ownerProfile.disputesLost}`);
      console.log(`   Total Earned: ${ownerProfile.totalEarned / 1_000_000_000} SUI`);

      console.log(`\n🚗 Driver Stats:`);
      const driverProfile = await queryClient.getDriverProfile(profileId);
      if (driverProfile) {
        console.log(`   Successful Parkings: ${driverProfile.successfulParkings}`);
        console.log(`   Disputes Filed: ${driverProfile.disputesFiled}`);
        console.log(`   Disputes Won: ${driverProfile.disputesWon}`);
        console.log(`   Disputes Lost: ${driverProfile.disputesLost}`);
        console.log(`   Total Spent: ${driverProfile.totalSpent / 1_000_000_000} SUI`);
      }

    } catch (error: any) {
      console.error(`❌ Error checking address ${address}:`, error.message);
      if (error.stack) {
        console.error(error.stack);
      }
    }
  }

  console.log('\n✅ Done!\n');
}

checkRating().catch(console.error);

