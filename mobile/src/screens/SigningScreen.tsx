import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { generateSigningDappHTML } from '../utils/signingDapp';
import { config, CONTRACT_ADDRESSES, SUI_DEPLOYMENT } from '../config';
import { executeZkLoginTransaction, getZkLoginSignatureForTransaction, getSuiBalance } from '../services/zkLoginService';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { SuiClient } from '@mysten/sui.js/client';
import { SUI_NETWORK } from '../config';
import type { ParkingSpotCard, SigningMessage } from '../types';
import { getPriceQuote } from '../services/api';
import { SuiTheme } from '../config/theme';

interface SigningScreenProps {
  spot: ParkingSpotCard;
  onComplete: (result: { success: true; txDigest: string; reservationId?: string; escrowId?: string } | { success: false; error: string }) => void;
  onCancel: () => void;
  userAddress?: string | null;
}

export const SigningScreen: React.FC<SigningScreenProps> = ({
  spot,
  onComplete,
  onCancel,
  userAddress,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const network = config.defaultNetwork || 'testnet';
  const deployment = SUI_DEPLOYMENT[network];
  const suiClient = new SuiClient({ url: SUI_NETWORK });

  // Extract duration from price_display (format: "0.2 SUI/1h" or "15 SUI/2h")
  const extractDurationFromPriceDisplay = (priceDisplay: string): number => {
    // Match pattern like "/1h" or "/2h" at the end
    const match = priceDisplay.match(/\/(\d+(?:\.\d+)?)h/);
    if (match && match[1]) {
      return parseFloat(match[1]);
    }
    // Default to 1 hour if not found
    return 1;
  };

  const durationHours = extractDurationFromPriceDisplay(spot.price_display);

  // Handle zkLogin signing with reservation + escrow lock
  const handleZkLoginSign = async () => {
    if (!userAddress) {
      Alert.alert('Error', 'User address is required. Please login first.');
      return;
    }

    try {
      setIsSigning(true);
      
      // Check balance first
      const balanceInSui = await getSuiBalance(userAddress);
      const balanceInMist = BigInt(Math.floor(balanceInSui * 1_000_000_000));
      
      // Get price quote to calculate payment amount
      const quote = await getPriceQuote(spot.slot_id, durationHours, network);
      if (!quote) {
        throw new Error('Failed to get price quote');
      }

      // Parse price - quote.price is returned as string in MIST from backend
      // Convert string to BigInt directly (it's already in MIST)
      const paymentAmountMist = BigInt(quote.price);
      
      // Calculate deposit (10% of payment)
      const depositAmountMist = (paymentAmountMist * BigInt(10)) / BigInt(100);
      
      // Estimate gas fees (rough estimate: ~0.01 SUI per transaction, so ~0.02 for 2 transactions)
      const estimatedGasMist = BigInt(20_000_000); // 0.02 SUI
      
      // Total needed: payment + deposit + gas for 2 transactions
      const totalNeededMist = paymentAmountMist + depositAmountMist + estimatedGasMist;
      
      // Check if balance is sufficient
      if (balanceInMist < totalNeededMist) {
        // Convert BigInt to number properly for display
        // Use toString() first to avoid precision issues with large BigInts
        const totalNeededSui = parseFloat(totalNeededMist.toString()) / 1_000_000_000;
        const paymentSui = parseFloat(paymentAmountMist.toString()) / 1_000_000_000;
        const depositSui = parseFloat(depositAmountMist.toString()) / 1_000_000_000;
        const gasSui = parseFloat(estimatedGasMist.toString()) / 1_000_000_000;
        
        Alert.alert(
          'Insufficient Balance',
          `You need at least ${totalNeededSui.toFixed(4)} SUI to complete this reservation.\n\n` +
          `Breakdown:\n` +
          `• Payment: ${paymentSui.toFixed(4)} SUI\n` +
          `• Deposit (10%): ${depositSui.toFixed(4)} SUI\n` +
          `• Gas fees: ~${gasSui.toFixed(4)} SUI\n\n` +
          `Your current balance: ${balanceInSui.toFixed(4)} SUI\n\n` +
          `Please request testnet SUI from:\n` +
          `• https://faucet.sui.io/\n` +
          `• https://stakely.io/faucet/sui-testnet-sui\n` +
          `• https://faucet.blockbolt.io/\n\n` +
          `Your address: ${userAddress}`,
          [{ text: 'OK' }]
        );
        return;
      }
      
      // Calculate start time from start_hour if provided, otherwise use current time + buffer
      let startTime: bigint;
      if (spot.start_hour) {
        // Parse start_hour (HH:mm format, e.g., "20:00")
        try {
          const [hours, minutes] = spot.start_hour.split(':').map(Number);
          const now = new Date();
          const requestedStart = new Date(now);
          requestedStart.setHours(hours, minutes, 0, 0);
          
          // If start time is earlier today, assume it's for tomorrow
          if (requestedStart < now) {
            requestedStart.setDate(requestedStart.getDate() + 1);
          }
          
          // Ensure at least 5 seconds ahead of current time
          const minStartTime = Date.now() + 5000; // 5 seconds buffer
          const finalStartTime = Math.max(requestedStart.getTime(), minStartTime);
          
          startTime = BigInt(finalStartTime);
          console.log(`[SigningScreen] Using start_hour from spot: ${spot.start_hour} -> ${new Date(Number(startTime)).toISOString()}`);
        } catch (error) {
          console.warn('[SigningScreen] Error parsing start_hour, using current time + buffer:', error);
          startTime = BigInt(Date.now() + 5000); // Fallback to current time + 5 seconds
        }
      } else {
        // No start_hour provided, use current time + buffer
        startTime = BigInt(Date.now() + 5000); // 5 seconds in the future
        console.log('[SigningScreen] No start_hour provided, using current time + 5 seconds buffer');
      }
      
      // Step 1: Create reservation (first transaction - only create reservation, no coin splitting)
      const txb = new TransactionBlock();
      txb.setSender(userAddress);
      
      txb.moveCall({
        target: `${deployment.packageId}::market::create_reservation`,
        arguments: [
          txb.object(spot.slot_id), // ParkingSlot object
          txb.object(deployment.zoneRegistryId), // ZoneRegistry object
          txb.pure.u64(durationHours), // Duration in hours
          txb.pure.u64(startTime), // Start time in milliseconds
          txb.object(CONTRACT_ADDRESSES.CLOCK_OBJECT), // Clock object
        ],
      });
      
      // Execute first transaction (create reservation)
      const reservationResultTx = await executeZkLoginTransaction(txb, userAddress);

      // Extract reservation ID
      let reservationId: string | null = null;
      if (reservationResultTx.events) {
        const reservationCreatedEvent = reservationResultTx.events.find(
          (event: any) => event.type && event.type.includes('ReservationCreated')
        );
        if (reservationCreatedEvent && reservationCreatedEvent.parsedJson) {
          const eventData = reservationCreatedEvent.parsedJson as { reservation_id?: string; price_locked?: string };
          if (eventData.reservation_id) {
            reservationId = eventData.reservation_id;
          }
        }
      }

      // Fallback: try to extract from objectChanges
      if (!reservationId && reservationResultTx.objectChanges) {
        const reservationChange = reservationResultTx.objectChanges.find(
          (change: any) =>
            change.type === 'created' &&
            change.objectType &&
            change.objectType.includes('Reservation')
        );
        if (reservationChange && 'objectId' in reservationChange) {
          reservationId = reservationChange.objectId;
        }
      }

      if (!reservationId) {
        throw new Error('Failed to get reservation ID from transaction');
      }

      // Second transaction: Lock funds in escrow
      const lockTxb = new TransactionBlock();
      lockTxb.setSender(userAddress);
      
      // Split coins for payment and deposit
      const [lockPaymentCoin] = lockTxb.splitCoins(lockTxb.gas, [lockTxb.pure.u64(paymentAmountMist)]);
      const [lockDepositCoin] = lockTxb.splitCoins(lockTxb.gas, [lockTxb.pure.u64(depositAmountMist)]);
      
      // Call lock_funds_entry
      // Note: Collateral is automatically extracted from the slot's collateral pool by the contract
      lockTxb.moveCall({
        target: `${deployment.packageId}::escrow::lock_funds_entry`,
        arguments: [
          lockTxb.object(SUI_DEPLOYMENT[network].escrowConfigId), // EscrowConfig
          lockTxb.object(reservationId), // Reservation (mutable reference)
          lockTxb.object(spot.slot_id), // ParkingSlot (mutable reference)
          lockTxb.object(SUI_DEPLOYMENT[network].reputationRegistryId), // ReputationRegistry
          lockPaymentCoin, // Payment coin
          lockDepositCoin, // Deposit coin
          lockTxb.object(CONTRACT_ADDRESSES.CLOCK_OBJECT), // Clock
        ],
      });

      // Execute second transaction (lock funds)
      const lockResult = await executeZkLoginTransaction(lockTxb, userAddress);

      // Extract escrow ID from events (most reliable)
      let escrowId: string | null = null;
      if (lockResult.events) {
        const escrowCreatedEvent = lockResult.events.find(
          (event: any) => event.type && event.type.includes('EscrowCreated')
        );
        if (escrowCreatedEvent && escrowCreatedEvent.parsedJson) {
          const eventData = escrowCreatedEvent.parsedJson as { escrow_id?: string };
          if (eventData.escrow_id) {
            escrowId = eventData.escrow_id;
            console.log(`[SigningScreen] Extracted escrowId from EscrowCreated event: ${escrowId}`);
          }
        }
      }

      // Fallback: try to extract from objectChanges
      if (!escrowId && lockResult.objectChanges) {
        const escrowChange = lockResult.objectChanges.find(
          (change: any) =>
            change.type === 'created' &&
            change.objectType &&
            change.objectType.includes('Escrow')
        );
        if (escrowChange && 'objectId' in escrowChange) {
          escrowId = escrowChange.objectId;
          console.log(`[SigningScreen] Extracted escrowId from objectChanges: ${escrowId}`);
        }
      }

      if (!escrowId) {
        console.warn('[SigningScreen] Could not extract escrowId from transaction result');
      }

      onComplete({
        success: true,
        txDigest: lockResult.digest, // Return the last transaction digest
        reservationId: reservationId,
        escrowId: escrowId || undefined,
      });
    } catch (error: any) {
      console.error('zkLogin signing error:', error);
      onComplete({
        success: false,
        error: error.message || 'Failed to sign transaction',
      });
    } finally {
      setIsSigning(false);
    }
  };

  // Generate the web dapp HTML with transaction parameters
  const webViewHTML = generateSigningDappHTML({
    slotId: spot.slot_id,
    slotName: spot.name,
    priceDisplay: spot.price_display,
    durationHours: durationHours,
    packageId: deployment.packageId,
    zoneRegistryId: deployment.zoneRegistryId,
    network: network as 'mainnet' | 'testnet' | 'devnet',
  });

  const handleMessage = (event: any) => {
    try {
      const data: SigningMessage = JSON.parse(event.nativeEvent.data);
      
      // Only process SIGN_RESULT messages
      if (data.type !== 'SIGN_RESULT') {
        return;
      }

      if (data.status === 'success') {
        onComplete({
          success: true,
          txDigest: data.txDigest,
          reservationId: data.reservationId,
        });
      } else if (data.status === 'error') {
        onComplete({
          success: false,
          error: data.error,
        });
      }
    } catch (error) {
      console.error('Error parsing WebView message:', error);
      onComplete({
        success: false,
        error: 'Failed to parse signing response',
      });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onCancel} style={styles.cancelButton}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Confirm Reservation</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Content */}
      <View style={styles.content}>
        {/* Native zkLogin signing flow */}
        <View style={styles.nativeSigningContainer}>
          <View style={styles.reservationInfo}>
            <Text style={styles.reservationTitle}>Reservation Details</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Slot:</Text>
              <Text style={styles.infoValue}>{spot.name}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Price:</Text>
              <Text style={styles.infoValue}>{spot.price_display}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Duration:</Text>
              <Text style={styles.infoValue}>
                {durationHours === 1 ? '1 hour' : `${durationHours} hours`}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.signButton, isSigning && styles.signButtonDisabled]}
            onPress={handleZkLoginSign}
            disabled={isSigning}
          >
            {isSigning ? (
              <>
                <ActivityIndicator color="#fff" />
                <Text style={styles.signButtonText}>Signing Transaction...</Text>
              </>
            ) : (
              <Text style={styles.signButtonText}>Sign & Confirm Reservation</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SuiTheme.background.secondary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  cancelButton: {
    padding: 8,
  },
  cancelButtonText: {
    fontSize: 16,
    color: '#666',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  placeholder: {
    width: 60,
  },
  content: {
    flex: 1,
    position: 'relative',
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  nativeSigningContainer: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between',
  },
  reservationInfo: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
  },
  reservationTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 16,
    color: '#666',
    fontWeight: '600',
  },
  infoValue: {
    fontSize: 16,
    color: '#333',
  },
  signButton: {
    backgroundColor: '#00BCD4',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  signButtonDisabled: {
    opacity: 0.6,
  },
  signButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
});
