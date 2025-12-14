import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { getUserParkingSlots } from '../services/api';
import { config } from '../config';
import { SuiTheme } from '../config/theme';

export interface ParkingSlot {
  id: string;
  locationName: string;
  address: string;
  latitude: number;
  longitude: number;
  basePricePerHour: string;
  status: 'available' | 'occupied' | 'maintenance';
  totalSpots: number;
  availableSpots: number;
  createdAt: string;
}

interface MyParkingSlotsScreenProps {
  userAddress: string | null;
  onAddParkingSlot: () => void;
  onViewSlot?: (slot: ParkingSlot) => void;
  onToggleSidebar?: () => void;
  refreshTrigger?: number; // When this changes, reload slots
}

export const MyParkingSlotsScreen: React.FC<MyParkingSlotsScreenProps> = ({
  userAddress,
  onAddParkingSlot,
  onViewSlot,
  onToggleSidebar,
  refreshTrigger,
}) => {
  const [parkingSlots, setParkingSlots] = useState<ParkingSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userAddress) {
      loadParkingSlots();
    } else {
      setLoading(false);
    }
  }, [userAddress, refreshTrigger]);

  const loadParkingSlots = async () => {
    if (!userAddress) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch parking slots from blockchain
      const blockchainSlots = await getUserParkingSlots(
        userAddress,
        config.defaultNetwork
      );

      // Transform blockchain slots to UI format
      const transformedSlots = blockchainSlots.map((slot: any) => {
        // Convert coordinates from microdegrees to degrees
        const latitude = (slot.latitude || 0) / 1_000_000;
        const longitude = (slot.longitude || 0) / 1_000_000;

        // Convert price from MIST to SUI
        const basePricePerHourSui = (slot.basePricePerHour || slot.base_price_per_hour || 0) / 1_000_000_000;

        // Map status: 0=free/available, 1=reserved, 2=occupied
        let status: 'available' | 'occupied' | 'maintenance' = 'available';
        if (slot.status === 1) {
          status = 'occupied'; // reserved means occupied
        } else if (slot.status === 2) {
          status = 'occupied';
        }

        // Format created date (createdAt is in milliseconds timestamp)
        const createdAtTimestamp = slot.createdAt || slot.created_at;
        const createdAt = createdAtTimestamp
          ? new Date(Number(createdAtTimestamp)).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })
          : 'Unknown';

        return {
          id: slot.id || slot.slot_id,
          locationName: slot.locationName || slot.location_name || 'Parking Slot',
          address: slot.address || 'Address not available', // Address is now stored on blockchain
          latitude,
          longitude,
          basePricePerHour: basePricePerHourSui.toFixed(2),
          status,
          totalSpots: 1, // Each slot is individual
          availableSpots: status === 'available' ? 1 : 0,
          createdAt,
        };
      });

      setParkingSlots(transformedSlots);
    } catch (err) {
      console.error('Error loading parking slots:', err);
      setError('Failed to load parking slots. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  const getStatusColor = (status: ParkingSlot['status']) => {
    switch (status) {
      case 'available':
        return '#4CAF50';
      case 'occupied':
        return '#FF9800';
      case 'maintenance':
        return '#F44336';
      default:
        return '#999';
    }
  };

  const getStatusLabel = (status: ParkingSlot['status']) => {
    switch (status) {
      case 'available':
        return 'Available';
      case 'occupied':
        return 'Occupied';
      case 'maintenance':
        return 'Maintenance';
      default:
        return status;
    }
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
            <Text style={styles.title}>My Parking Slots</Text>
            <Text style={styles.subtitle}>{parkingSlots.length} slot(s)</Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Add Parking Slot Button */}
        <TouchableOpacity
          style={styles.addButton}
          onPress={onAddParkingSlot}
          activeOpacity={0.8}
        >
          <Text style={styles.addButtonIcon}>+</Text>
          <Text style={styles.addButtonText}>Add Parking Slot</Text>
        </TouchableOpacity>

        {/* Parking Slots List */}
        {loading ? (
          <View style={styles.loadingState}>
            <ActivityIndicator size="large" color="#00BCD4" />
            <Text style={styles.loadingText}>Loading parking slots...</Text>
          </View>
        ) : error ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>⚠️</Text>
            <Text style={styles.emptyText}>Error loading parking slots</Text>
            <Text style={styles.emptySubtext}>{error}</Text>
            <TouchableOpacity
              style={styles.retryButton}
              onPress={loadParkingSlots}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : parkingSlots.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🅿️</Text>
            <Text style={styles.emptyText}>No parking slots yet</Text>
            <Text style={styles.emptySubtext}>
              Add your first parking slot to start earning
            </Text>
          </View>
        ) : (
          parkingSlots.map((slot) => (
            <TouchableOpacity
              key={slot.id}
              style={styles.slotCard}
              onPress={() => onViewSlot?.(slot)}
              activeOpacity={0.7}
            >
              <View style={styles.slotHeader}>
                <View style={styles.slotHeaderLeft}>
                  <Text style={styles.slotIcon}>🅿️</Text>
                  <View style={styles.slotTitleContainer}>
                    <Text style={styles.slotName}>{slot.locationName}</Text>
                    <Text style={styles.slotAddress}>{slot.address}</Text>
                  </View>
                </View>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(slot.status) },
                  ]}
                >
                  <Text style={styles.statusText}>
                    {getStatusLabel(slot.status)}
                  </Text>
                </View>
              </View>

              <View style={styles.slotDetails}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Price:</Text>
                  <Text style={styles.detailValue}>
                    {slot.basePricePerHour} SUI/hour
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Availability:</Text>
                  <Text style={styles.detailValue}>
                    {slot.availableSpots}/{slot.totalSpots} spots
                  </Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Created:</Text>
                  <Text style={styles.detailValue}>{slot.createdAt}</Text>
                </View>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
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
  content: {
    padding: 20,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: SuiTheme.primary.main,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 12,
    marginBottom: 20,
    shadowColor: SuiTheme.primary.main,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  addButtonIcon: {
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold',
    marginRight: 8,
  },
  addButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
  slotCard: {
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
  slotHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  slotHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
    marginRight: 12,
  },
  slotIcon: {
    fontSize: 24,
    marginRight: 12,
    marginTop: 2,
  },
  slotTitleContainer: {
    flex: 1,
  },
  slotName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  slotAddress: {
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
  slotDetails: {
    gap: 8,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
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
    backgroundColor: '#00BCD4',
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
