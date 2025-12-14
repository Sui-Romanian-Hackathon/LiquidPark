import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { getUserReservations, getParkingSlotById, getEscrow, getReservation, getDriverProfileByAddress, getOwnerProfileByAddress } from '../services/api';
import { config, SUI_DEPLOYMENT, CONTRACT_ADDRESSES } from '../config';
import { executeZkLoginTransaction } from '../services/zkLoginService';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { SuiTheme } from '../config/theme';

export interface Reservation {
  id: string;
  slotName: string;
  address: string;
  date: string; // Date when reservation starts
  time: string; // Start hour (when reservation starts) in HH:mm format
  duration: string;
  price: string;
  status: 'active' | 'completed' | 'cancelled';
  txDigest?: string;
  escrowId?: string | null;
  escrowState?: number; // 0=locked, 1=used, 2=settled, 3=dispute, 4=slashed
}

interface ReservationsScreenProps {
  userAddress: string | null;
  onViewReservation?: (reservation: Reservation) => void;
  onToggleSidebar?: () => void;
}

// Mock reservations data (using HH:mm format for time)
export const MOCK_RESERVATIONS: Reservation[] = [
  {
    id: '1',
    slotName: 'Downtown Parking Lot',
    address: '123 Main St, Downtown',
    date: 'Jan 15, 2024',
    time: '10:00',
    duration: '2 hours',
    price: '30 SUI',
    status: 'active',
    txDigest: '0xabc123...',
  },
  {
    id: '2',
    slotName: 'FSEGA Area Parking',
    address: 'Strada Teodor Mihali 58',
    date: 'Jan 14, 2024',
    time: '14:00',
    duration: '3 hours',
    price: '45 SUI',
    status: 'completed',
    txDigest: '0xdef456...',
  },
  {
    id: '3',
    slotName: 'City Center Spot',
    address: '456 Market Ave',
    date: 'Jan 13, 2024',
    time: '09:00',
    duration: '1 hour',
    price: '15 SUI',
    status: 'completed',
    txDigest: '0xghi789...',
  },
  {
    id: '4',
    slotName: 'Airport Parking Zone',
    address: '789 Airport Blvd',
    date: 'Jan 12, 2024',
    time: '11:00',
    duration: '4 hours',
    price: '60 SUI',
    status: 'cancelled',
    txDigest: '0xjkl012...',
  },
  {
    id: '5',
    slotName: 'Near Me Parking',
    address: '321 Local St',
    date: 'Jan 11, 2024',
    time: '15:00',
    duration: '2 hours',
    price: '30 SUI',
    status: 'completed',
    txDigest: '0xmno345...',
  },
];


export const ReservationsScreen: React.FC<ReservationsScreenProps> = ({
  userAddress,
  onViewReservation,
  onToggleSidebar,
}) => {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingReservationId, setProcessingReservationId] = useState<string | null>(null);

  useEffect(() => {
    if (userAddress) {
      loadReservations();
    } else {
      setLoading(false);
    }
  }, [userAddress]);

  const loadReservations = async (retryCount: number = 0) => {
    if (!userAddress) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch reservations from blockchain
      const blockchainReservations = await getUserReservations(
        userAddress,
        config.defaultNetwork
      );
      console.log(`[ReservationsScreen] Loaded ${blockchainReservations.length} reservations from blockchain`);

      // Transform blockchain reservations to UI format
      const transformedReservations = await Promise.all(
        blockchainReservations.map(async (res: any) => {
          // Fetch slot details
          let slotName = 'Parking Slot';
          let address = 'Address not available';

          try {
            const slot = await getParkingSlotById(res.slotId, config.defaultNetwork);
            if (slot) {
              // Use locationName for slot name (bold text)
              slotName = slot.locationName || slot.location_name || 'Parking Slot';
              // Use address for address (normal text)
              address = slot.address || 'Address not available';
            }
          } catch (err) {
            console.warn(`Failed to fetch slot ${res.slotId}:`, err);
          }

          // Fetch escrow state if escrow exists
          let escrowState: number | undefined = undefined;
          let escrowId: string | null = res.escrowId || null;
          
          // If escrowId is not in reservation, try to fetch reservation again to get updated escrowId
          // This handles the case where escrow was just created and reservation hasn't been refreshed yet
          // Only do this for active reservations (state 0 or 1) that might need check-in
          if (!escrowId && (res.state === 0 || res.state === 1)) {
            try {
              // Wait a bit for blockchain to sync
              await new Promise(resolve => setTimeout(resolve, 500));
              const updatedReservation = await getReservation(res.id, config.defaultNetwork);
              if (updatedReservation && updatedReservation.escrowId) {
                escrowId = updatedReservation.escrowId;
                console.log(`[ReservationsScreen] Found escrowId from updated reservation: ${escrowId}`);
              } else {
                console.log(`[ReservationsScreen] Reservation ${res.id} still has no escrowId after refresh`);
              }
            } catch (err) {
              console.warn(`[ReservationsScreen] Failed to fetch updated reservation ${res.id}:`, err);
            }
          }
          
          if (escrowId) {
            try {
              const escrow = await getEscrow(escrowId, config.defaultNetwork);
              if (escrow) {
                escrowState = escrow.state;
                console.log(`[ReservationsScreen] Reservation ${res.id}: escrowId=${escrowId}, escrowState=${escrowState}`);
              } else {
                console.warn(`[ReservationsScreen] Escrow ${escrowId} not found`);
              }
            } catch (err) {
              console.warn(`[ReservationsScreen] Failed to fetch escrow ${escrowId}:`, err);
            }
          } else {
            console.log(`[ReservationsScreen] Reservation ${res.id} has no escrowId`);
          }

          // Convert startTime to date and start hour (when reservation starts, not when it was created)
          // startTime is a timestamp in milliseconds
          const startTimeMs = typeof res.startTime === 'string' ? parseInt(res.startTime, 10) : res.startTime;
          const startDate = new Date(startTimeMs);
          
          let date: string;
          let time: string;
          
          // Validate date
          if (isNaN(startDate.getTime())) {
            console.error(`Invalid startTime for reservation ${res.id}:`, res.startTime);
            // Fallback to current date/time if invalid
            const now = new Date();
            date = now.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            });
            const hours = now.getHours().toString().padStart(2, '0');
            const minutes = now.getMinutes().toString().padStart(2, '0');
            time = `${hours}:${minutes}`;
          } else {
            date = startDate.toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            });
            // Start hour in HH:mm format (24-hour format, e.g., "20:00" for 8PM)
            const hours = startDate.getHours().toString().padStart(2, '0');
            const minutes = startDate.getMinutes().toString().padStart(2, '0');
            time = `${hours}:${minutes}`;
            
            console.log(`[ReservationsScreen] Reservation ${res.id}: startTime=${startTimeMs} (${new Date(startTimeMs).toISOString()}), date=${date}, time=${time}`);
          }

          // Format duration
          const durationHours = res.durationHours || 1;
          const duration =
            durationHours === 1
              ? '1 hour'
              : `${durationHours} hours`;

          // Convert price from MIST to SUI
          const priceInSui = (res.priceLocked || 0) / 1_000_000_000;
          const price = `${priceInSui.toFixed(2)} SUI`;

          // Map state to status
          // 0=requested, 1=active, 2=completed, 3=disputed, 4=cancelled
          let status: 'active' | 'completed' | 'cancelled' = 'active';
          if (res.state === 2) {
            status = 'completed';
          } else if (res.state === 4) {
            status = 'cancelled';
          } else if (res.state === 1) {
            status = 'active';
          } else if (res.state === 0) {
            status = 'active'; // requested is also considered active
          }

          return {
            id: res.id,
            slotName,
            address,
            date,
            time,
            duration,
            price,
            status,
            txDigest: res.id, // Use reservation ID as transaction reference
            escrowId: escrowId || res.escrowId || null,
            escrowState,
          };
        })
      );

      setReservations(transformedReservations);
    } catch (err) {
      console.error('Error loading reservations:', err);
      setError('Failed to load reservations. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: Reservation['status']) => {
    switch (status) {
      case 'active':
        return '#4CAF50';
      case 'completed':
        return '#2196F3';
      case 'cancelled':
        return '#F44336';
      default:
        return '#999';
    }
  };

  const getStatusLabel = (status: Reservation['status']) => {
    switch (status) {
      case 'active':
        return 'Active';
      case 'completed':
        return 'Completed';
      case 'cancelled':
        return 'Cancelled';
      default:
        return status;
    }
  };

  const handleCheckIn = async (reservation: Reservation) => {
    if (!userAddress) {
      Alert.alert('Error', 'User address is required. Please login first.');
      return;
    }

    // If escrowId is not set, try to get it from reservation
    let escrowId = reservation.escrowId;
    if (!escrowId) {
      try {
        // Try to fetch reservation details to get escrowId
        const reservationDetails = await getReservation(reservation.id, config.defaultNetwork);
        if (reservationDetails && reservationDetails.escrowId) {
          escrowId = reservationDetails.escrowId;
        } else {
          Alert.alert('Error', 'No escrow found for this reservation. Funds may not be locked yet. Please wait a moment and try again.');
          return;
        }
      } catch (err) {
        console.error('Error fetching reservation details:', err);
        Alert.alert('Error', 'No escrow found for this reservation. Funds may not be locked yet.');
        return;
      }
    }

    try {
      setProcessingReservationId(reservation.id);
      
      const network = config.defaultNetwork || 'testnet';
      const deployment = SUI_DEPLOYMENT[network];
      
      // Create transaction block
      const txb = new TransactionBlock();
      txb.setSender(userAddress);
      
      // Call escrow::mark_used
      txb.moveCall({
        target: `${deployment.packageId}::escrow::mark_used`,
        arguments: [
          txb.object(escrowId!), // Escrow object (we know it exists from check above)
          txb.object(CONTRACT_ADDRESSES.CLOCK_OBJECT), // Clock object
        ],
      });
      
      // Execute transaction with zkLogin signature
      const result = await executeZkLoginTransaction(txb, userAddress);
      
      Alert.alert('Success', 'Check-in successful!', [
        {
          text: 'OK',
          onPress: () => {
            // Reload reservations to update state
            loadReservations();
          },
        },
      ]);
    } catch (error: any) {
      console.error('Check-in error:', error);
      Alert.alert('Error', error.message || 'Failed to check in');
    } finally {
      setProcessingReservationId(null);
    }
  };

  const handleCheckOut = async (reservation: Reservation) => {
    if (!userAddress) {
      Alert.alert('Error', 'User address is required. Please login first.');
      return;
    }

    if (!reservation.escrowId) {
      Alert.alert('Error', 'No escrow found for this reservation.');
      return;
    }

    try {
      setProcessingReservationId(reservation.id);
      
      const network = config.defaultNetwork || 'testnet';
      const deployment = SUI_DEPLOYMENT[network];
      
      // Get full reservation details to get slot ID
      const reservationDetails = await getReservation(reservation.id, network);
      if (!reservationDetails) {
        throw new Error('Reservation not found');
      }

      // Get escrow to find driver and owner addresses
      const escrow = await getEscrow(reservation.escrowId, network);
      if (!escrow) {
        throw new Error('Escrow not found');
      }

      // Get driver and owner UserProfile IDs
      // Note: Both driver and owner use the same UserProfile type
      const driverProfile = await getDriverProfileByAddress(escrow.driver, network);
      const ownerProfile = await getOwnerProfileByAddress(escrow.owner, network);

      if (!driverProfile) {
        throw new Error(`User profile not found for driver address ${escrow.driver.substring(0, 10)}... Please register first by logging in.`);
      }
      
      if (!ownerProfile) {
        throw new Error(`User profile not found for owner address ${escrow.owner.substring(0, 10)}... Please register first by logging in.`);
      }

      console.log(`[ReservationsScreen] Using driver profile ID: ${driverProfile.id}, owner profile ID: ${ownerProfile.id}`);
      console.log(`[ReservationsScreen] Driver and owner are same: ${driverProfile.id === ownerProfile.id}`);

      // Create transaction block
      const txb = new TransactionBlock();
      txb.setSender(userAddress);
      
      // Get object references first
      const escrowObj = txb.object(reservation.escrowId);
      const configObj = txb.object(deployment.escrowConfigId);
      const reservationObj = txb.object(reservation.id);
      const slotObj = txb.object(reservationDetails.slotId);
      const registryObj = txb.object(deployment.zoneRegistryId);
      const clockObj = txb.object(CONTRACT_ADDRESSES.CLOCK_OBJECT);
      
      // For UserProfile objects - if they're the same, we need to reuse the reference
      let driverProfileObj, ownerProfileObj;
      if (driverProfile.id === ownerProfile.id) {
        // Same profile - reuse the same reference
        console.log('[ReservationsScreen] Driver and owner have same profile, reusing reference');
        driverProfileObj = txb.object(driverProfile.id);
        ownerProfileObj = driverProfileObj; // Reuse the same reference
      } else {
        // Different profiles
        driverProfileObj = txb.object(driverProfile.id);
        ownerProfileObj = txb.object(ownerProfile.id);
      }
      
      console.log('[ReservationsScreen] Settle arguments prepared:', {
        escrowId: reservation.escrowId,
        escrowConfigId: deployment.escrowConfigId,
        reservationId: reservation.id,
        slotId: reservationDetails.slotId,
        zoneRegistryId: deployment.zoneRegistryId,
        driverProfileId: driverProfile.id,
        ownerProfileId: ownerProfile.id,
        clockId: CONTRACT_ADDRESSES.CLOCK_OBJECT,
        sameProfile: driverProfile.id === ownerProfile.id,
      });
      
      // Call escrow::settle
      txb.moveCall({
        target: `${deployment.packageId}::escrow::settle`,
        arguments: [
          escrowObj,
          configObj,
          reservationObj,
          slotObj,
          registryObj,
          driverProfileObj, // UserProfile for driver
          ownerProfileObj, // UserProfile for owner (may be same reference as driver)
          clockObj,
        ],
      });
      
      // Execute transaction with zkLogin signature
      console.log('[ReservationsScreen] Executing checkout transaction...');
      const result = await executeZkLoginTransaction(txb, userAddress);
      console.log('[ReservationsScreen] Checkout transaction successful:', result.digest);
      
      Alert.alert('Success', 'Check-out successful!', [
        {
          text: 'OK',
          onPress: () => {
            // Reload reservations to update state
            loadReservations();
          },
        },
      ]);
    } catch (error: any) {
      console.error('Check-out error:', error);
      Alert.alert('Error', error.message || 'Failed to check out');
    } finally {
      setProcessingReservationId(null);
    }
  };

  const shouldShowCheckInButton = (reservation: Reservation): boolean => {
    // Show check-in if reservation is active
    // If escrowState is defined, only show if it's locked (state 0)
    // If escrowState is undefined, show if escrowId exists (might be loading or just created)
    const isActive = reservation.status === 'active';
    const hasEscrowId = !!reservation.escrowId;
    
    if (!isActive) {
      return false;
    }
    
    // If escrowState is defined, check if it's locked (0)
    if (reservation.escrowState !== undefined) {
      return reservation.escrowState === 0;
    }
    
    // If escrowState is undefined but escrowId exists, show button (assume locked)
    // This handles the case where escrow was just created but state hasn't loaded yet
    if (hasEscrowId) {
      return true;
    }
    
    // No escrowId means funds weren't locked yet, but we can still show button
    // User will get an error message if they try to check in
    return true;
  };

  const shouldShowCheckOutButton = (reservation: Reservation): boolean => {
    // Show check-out if reservation is active and escrow is used (state 1)
    const result = reservation.status === 'active' && reservation.escrowState === 1;
    
    console.log(`[ReservationsScreen] shouldShowCheckOutButton for ${reservation.id}:`, {
      status: reservation.status,
      escrowState: reservation.escrowState,
      result
    });
    
    return result;
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {onToggleSidebar && (
            <TouchableOpacity onPress={onToggleSidebar} style={styles.menuButton}>
              <Text style={styles.menuIcon}>☰</Text>
            </TouchableOpacity>
          )}
          <View>
            <Text style={styles.title}>My Reservations</Text>
            <Text style={styles.subtitle}>{reservations.length} total</Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color="#4CAF50" />
          <Text style={styles.loadingText}>Loading reservations...</Text>
        </View>
      ) : error ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>⚠️</Text>
          <Text style={styles.emptyText}>Error loading reservations</Text>
          <Text style={styles.emptySubtext}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => loadReservations(0)}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : reservations.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>📅</Text>
          <Text style={styles.emptyText}>No reservations yet</Text>
          <Text style={styles.emptySubtext}>
            Start chatting with SuiPark AI to find and reserve parking spots
          </Text>
        </View>
      ) : (
        <ScrollView 
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {reservations.map((reservation) => (
            <TouchableOpacity
              key={reservation.id}
              style={styles.reservationCard}
              onPress={() => onViewReservation?.(reservation)}
              activeOpacity={0.7}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <Text style={styles.slotName}>{reservation.slotName}</Text>
                  <Text style={styles.address}>{reservation.address}</Text>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(reservation.status) },
                  ]}
                >
                  <Text style={styles.statusText}>
                    {getStatusLabel(reservation.status)}
                  </Text>
                </View>
              </View>

              <View style={styles.cardDetails}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Date & Time:</Text>
                  <Text style={styles.detailValue}>
                    {reservation.date} at {reservation.time}
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Duration:</Text>
                  <Text style={styles.detailValue}>{reservation.duration}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Price:</Text>
                  <Text style={styles.detailValue}>{reservation.price}</Text>
                </View>
                {reservation.txDigest && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Transaction:</Text>
                    <Text style={styles.txDigest} numberOfLines={1} ellipsizeMode="middle">
                      {reservation.txDigest}
                    </Text>
                  </View>
                )}
              </View>

              {/* Check-in / Check-out buttons */}
              {reservation.status === 'active' && (
                <View style={styles.actionButtons}>
                  {shouldShowCheckInButton(reservation) && (
                    <TouchableOpacity
                      style={[
                        styles.actionButton,
                        styles.checkInButton,
                        processingReservationId === reservation.id && styles.actionButtonDisabled,
                      ]}
                      onPress={() => handleCheckIn(reservation)}
                      disabled={processingReservationId === reservation.id}
                    >
                      {processingReservationId === reservation.id ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.actionButtonText}>Check In</Text>
                      )}
                    </TouchableOpacity>
                  )}
                  {shouldShowCheckOutButton(reservation) && (
                    <TouchableOpacity
                      style={[
                        styles.actionButton,
                        styles.checkOutButton,
                        processingReservationId === reservation.id && styles.actionButtonDisabled,
                      ]}
                      onPress={() => handleCheckOut(reservation)}
                      disabled={processingReservationId === reservation.id}
                    >
                      {processingReservationId === reservation.id ? (
                        <ActivityIndicator color="#fff" size="small" />
                      ) : (
                        <Text style={styles.actionButtonText}>Check Out</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SuiTheme.background.secondary,
  },
  header: {
    padding: 20,
    backgroundColor: SuiTheme.background.cardLight,
    borderBottomWidth: 1,
    borderBottomColor: SuiTheme.primary.lighter,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  menuButton: {
    padding: 4,
  },
  menuIcon: {
    fontSize: 24,
    color: '#333',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    gap: 16,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  reservationCard: {
    backgroundColor: SuiTheme.background.cardLight,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: SuiTheme.primary.main,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: SuiTheme.primary.lighter,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  cardHeaderLeft: {
    flex: 1,
    marginRight: 12,
  },
  slotName: {
    fontSize: 18,
    fontWeight: '700', // Bold for slot name
    color: '#333',
    marginBottom: 4,
  },
  address: {
    fontSize: 14,
    color: '#666',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  cardDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
  },
  detailValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  txDigest: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace',
    maxWidth: 150,
  },
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  retryButton: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  actionButtons: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 12,
  },
  actionButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  checkInButton: {
    backgroundColor: '#4CAF50',
  },
  checkOutButton: {
    backgroundColor: '#2196F3',
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
