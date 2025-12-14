import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { ParkingSpotCardComponent } from '../components/ParkingSpotCard';
import type { ParkingSpotCard } from '../types';
import { getOwnerProfileByAddress } from '../services/api';
import { config } from '../config';
import { SuiTheme } from '../config/theme';

interface SummaryScreenProps {
  spot: ParkingSpotCard;
  onReserve: () => void;
  onBack: () => void;
}

export const SummaryScreen: React.FC<SummaryScreenProps> = ({
  spot,
  onReserve,
  onBack,
}) => {
  const [ownerProfile, setOwnerProfile] = useState<any | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  // Fetch owner profile when component mounts
  useEffect(() => {
    const fetchOwnerProfile = async () => {
      if (!spot.owner) {
        return;
      }

      setIsLoadingProfile(true);
      try {
        const profile = await getOwnerProfileByAddress(spot.owner, config.defaultNetwork);
        setOwnerProfile(profile);
      } catch (error) {
        console.error('Error fetching owner profile:', error);
      } finally {
        setIsLoadingProfile(false);
      }
    };

    fetchOwnerProfile();
  }, [spot.owner]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backButton}>
            <Text style={styles.backButtonText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Parking Details</Text>
          <View style={styles.placeholder} />
        </View>

        {/* Spot Card */}
        <ParkingSpotCardComponent
          spot={spot}
          onReserve={onReserve}
          onDetails={() => {}} // Already on details screen
          hideDetailsButton={true} // Hide details button when already on details screen
          hideImage={true} // Hide image placeholder for now
          hideReserveButton={true} // Hide reserve button to avoid duplicate (footer has one)
        />

        {/* Additional Details */}
        <View style={styles.detailsSection}>
          <Text style={styles.sectionTitle}>Location Details</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Address:</Text>
            <Text style={styles.detailValue}>
              {spot.address && spot.address !== 'Address not available' 
                ? spot.address 
                : spot.name || 'Address not available'}
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Distance:</Text>
            <Text style={styles.detailValue}>{spot.distance_m}m away</Text>
          </View>

          <Text style={styles.sectionTitle}>Pricing</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Price per hour:</Text>
            <Text style={styles.detailValue}>
              {/* Convert from RON to SUI (1 SUI = 10 RON) */}
              {(spot.price_per_hour / 10).toFixed(1)} SUI
            </Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Total for 2 hours:</Text>
            <Text style={styles.detailValue}>{spot.price_display}</Text>
          </View>

          <Text style={styles.sectionTitle}>Availability</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Available spots:</Text>
            <Text style={styles.detailValue}>
              {spot.available_spots} out of {spot.total_spots}
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Owner Information</Text>
          {isLoadingProfile ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#666" />
              <Text style={styles.loadingText}>Loading owner info...</Text>
            </View>
          ) : ownerProfile ? (
            <>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Owner Name:</Text>
                <Text style={styles.detailValue}>
                  {ownerProfile.name && ownerProfile.name.trim() !== '' ? ownerProfile.name : 'Not set'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Owner Address:</Text>
                <Text style={styles.detailValue} numberOfLines={1} ellipsizeMode="middle">
                  {ownerProfile.owner || 'N/A'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Score:</Text>
                <Text style={styles.detailValue}>
                  {ownerProfile.score || 0}/10000
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Successful Rentals:</Text>
                <Text style={styles.detailValue}>
                  {ownerProfile.successfulRentals || 0}/{((ownerProfile.successfulRentals || 0) + (ownerProfile.disputesReceived || 0)) || 0}
                  {((ownerProfile.successfulRentals || 0) + (ownerProfile.disputesReceived || 0)) > 0 && 
                    ` (${Math.round(((ownerProfile.successfulRentals || 0) / ((ownerProfile.successfulRentals || 0) + (ownerProfile.disputesReceived || 0))) * 100)}% success rate)`}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Total Earned:</Text>
                <Text style={styles.detailValue}>
                  {ownerProfile.totalEarned ? (ownerProfile.totalEarned / 1_000_000_000).toFixed(4) : '0'} SUI
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Disputes Received:</Text>
                <Text style={styles.detailValue}>
                  {ownerProfile.disputesReceived || 0}
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Owner information:</Text>
              <Text style={styles.detailValue}>Not available</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Reserve Button */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.reserveButton} onPress={onReserve}>
          <Text style={styles.reserveButtonText}>Reserve Now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: SuiTheme.background.cardLight,
    borderBottomWidth: 1,
    borderBottomColor: SuiTheme.primary.lighter,
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    fontSize: 16,
    color: '#00BCD4',
    fontWeight: '500',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  placeholder: {
    width: 60,
  },
  detailsSection: {
    backgroundColor: SuiTheme.background.cardLight,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
    padding: 16,
    marginBottom: 100,
    borderWidth: 1,
    borderColor: SuiTheme.primary.lighter,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  detailLabel: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: SuiTheme.background.cardLight,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: SuiTheme.primary.lighter,
  },
  reserveButton: {
    backgroundColor: SuiTheme.primary.main,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: SuiTheme.primary.main,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  reserveButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
