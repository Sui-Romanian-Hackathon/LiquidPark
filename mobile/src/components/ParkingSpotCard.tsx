import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import type { ParkingSpotCard } from '../types';
import { getOwnerProfileByAddress } from '../services/api';
import { config } from '../config';
import { SuiTheme } from '../config/theme';

const { width } = Dimensions.get('window');

interface ParkingSpotCardProps {
  spot: ParkingSpotCard;
  onReserve: () => void;
  onDetails: () => void;
  hideDetailsButton?: boolean; // Hide details button when already on details screen
  hideImage?: boolean; // Hide image placeholder for now
  hideReserveButton?: boolean; // Hide reserve button when already on details screen (to avoid duplicates)
}

export const ParkingSpotCardComponent: React.FC<ParkingSpotCardProps> = ({
  spot,
  onReserve,
  onDetails,
  hideDetailsButton = false,
  hideImage = true, // Hide images for now as requested
  hideReserveButton = false, // Hide reserve button when already on details screen
}) => {
  const [ownerScore, setOwnerScore] = useState<{ 
    score: number; 
    successfulRentals: number; 
    totalRentals: number;
  } | null>(null);
  const [isLoadingScore, setIsLoadingScore] = useState(false);

  // Fetch owner score when component mounts
  useEffect(() => {
    const fetchOwnerScore = async () => {
      if (!spot.owner) {
        console.log('[ParkingSpotCard] No owner address available for spot:', spot.slot_id);
        return; // No owner address available
      }

      console.log('[ParkingSpotCard] Fetching owner profile for:', spot.owner);
      setIsLoadingScore(true);
      try {
        const ownerProfile = await getOwnerProfileByAddress(spot.owner, config.defaultNetwork);
        console.log('[ParkingSpotCard] Owner profile:', ownerProfile);
        if (ownerProfile) {
          // Score is stored in basis points (0-10000, where 10000 = 100%)
          // Total rentals = successful rentals + disputes received
          // (disputes_received counts rentals that had disputes, successful_rentals counts those without disputes)
          const totalRentals = (ownerProfile.successfulRentals || 0) + (ownerProfile.disputesReceived || 0);
          
          setOwnerScore({
            score: ownerProfile.score || 5000, // Default to 5000 (50%) if not set
            successfulRentals: ownerProfile.successfulRentals || 0,
            totalRentals: totalRentals,
          });
        } else {
          setOwnerScore(null);
        }
      } catch (error) {
        console.error('[ParkingSpotCard] Error fetching owner profile:', error);
        setOwnerScore(null);
      } finally {
        setIsLoadingScore(false);
      }
    };

    fetchOwnerScore();
  }, [spot.owner]);

  // Calculate score percentage and label
  // Score calculation:
  // - BASE_SCORE = 5000 (50%) - starting score when profile is created
  // - SUCCESSFUL_PARKING_BONUS = +100 (+1%) per successful rental/parking
  // - DISPUTE_WIN_BONUS = +200 (+2%) per dispute won
  // - DISPUTE_LOSS_PENALTY = -500 (-5%) per dispute lost
  // - NO_SHOW_PENALTY = -300 (-3%) per no-show
  // - LATE_PENALTY = -150 (-1.5%) per late arrival
  const scorePercentage = ownerScore ? (ownerScore.score / 10000) * 100 : 0;
  const getScoreLabel = (score: number) => {
    // Adjusted labels to be more fair for new users:
    // - "New" for base score (5000) - users just starting
    // - "Fair" for slightly above base (5000-5999) - users with few successful rentals
    // - "Good" for moderate score (6000-6999)
    // - "Very Good" for good score (7000-7999)
    // - "Excellent" for high score (8000+)
    if (score >= 8000) return 'Excellent';
    if (score >= 7000) return 'Very Good';
    if (score >= 6000) return 'Good';
    if (score >= 5000) return 'Fair';
    if (score >= 4000) return 'Below Average';
    return 'Poor';
  };

  return (
    <View style={styles.card}>
      {/* Image Section - Hidden for now */}
      {!hideImage && (
      <View style={styles.imageContainer}>
        {spot.image ? (
          <Image source={{ uri: spot.image }} style={styles.image} />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.imagePlaceholderText}>Parking Lot</Text>
          </View>
        )}
        {spot.is_trusted && (
          <View style={styles.trustedBadge}>
            <Text style={styles.trustedBadgeText}>✓ TRUSTED</Text>
          </View>
        )}
      </View>
      )}

      {/* Title */}
      <Text style={styles.title}>{spot.name}</Text>

      {/* Key Info Cards */}
      <View style={styles.infoRow}>
        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>📍</Text>
          <Text style={styles.infoLabel}>Distance</Text>
          <Text style={styles.infoValue}>{spot.distance_m}m</Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>$</Text>
          <Text style={styles.infoLabel}>Price</Text>
          <Text style={styles.infoValue}>{spot.price_display}</Text>
        </View>
        <View style={styles.infoCard}>
          <Text style={styles.infoIcon}>🚗</Text>
          <Text style={styles.infoLabel}>Available</Text>
          <Text style={styles.infoValue}>
            {spot.available_spots}/{spot.total_spots}
          </Text>
        </View>
      </View>

      {/* Owner Score */}
      <View style={styles.reputationSection}>
        <Text style={styles.reputationLabel}>Score</Text>
        {isLoadingScore ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#666" />
            <Text style={styles.loadingText}>Loading score...</Text>
          </View>
        ) : ownerScore ? (
          <>
            <View style={styles.reputationBarContainer}>
              <View style={styles.reputationBarBackground}>
                <View
                  style={[
                    styles.reputationBarFill,
                    { width: `${scorePercentage}%` },
                  ]}
                />
              </View>
              <Text style={styles.reputationText}>
                {ownerScore.score}/10000 · {getScoreLabel(ownerScore.score)}
              </Text>
            </View>
            <Text style={styles.statsText}>
              {ownerScore.successfulRentals}/{ownerScore.totalRentals} {ownerScore.totalRentals === 1 ? 'successful rental' : 'successful rentals'}
              {ownerScore.totalRentals > 0 && ` (${Math.round((ownerScore.successfulRentals / ownerScore.totalRentals) * 100)}% success rate)`}
            </Text>
          </>
        ) : (
          <Text style={styles.noRatingText}>Score not available</Text>
        )}
      </View>

      {/* Action Buttons */}
      {!hideReserveButton && (
        <View style={hideDetailsButton ? styles.buttonRowSingle : styles.buttonRow}>
          <TouchableOpacity 
            style={hideDetailsButton ? [styles.reserveButton, styles.reserveButtonFull] : styles.reserveButton} 
            onPress={onReserve}
          >
          <Text style={styles.reserveButtonText}>Reserve Now</Text>
        </TouchableOpacity>
          {!hideDetailsButton && (
        <TouchableOpacity style={styles.detailsButton} onPress={onDetails}>
          <Text style={styles.detailsButtonText}>Details</Text>
        </TouchableOpacity>
          )}
      </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: SuiTheme.background.cardLight,
    borderRadius: 12,
    marginVertical: 8,
    marginHorizontal: 16,
    shadowColor: SuiTheme.primary.main,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: SuiTheme.primary.lighter,
  },
  imageContainer: {
    width: '100%',
    height: 200,
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  imagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imagePlaceholderText: {
    color: '#999',
    fontSize: 16,
  },
  trustedBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  trustedBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 16,
    marginHorizontal: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
    marginHorizontal: 16,
    gap: 8,
  },
  infoCard: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
  },
  infoIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  infoLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  reputationSection: {
    marginTop: 16,
    marginHorizontal: 16,
  },
  reputationLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  reputationBarContainer: {
    marginBottom: 8,
  },
  reputationBarBackground: {
    height: 8,
    backgroundColor: '#F8F9FA',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  reputationBarFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 4,
  },
  reputationText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  statsText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  starsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  star: {
    fontSize: 18,
  },
  ratingText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
  },
  noRatingText: {
    fontSize: 14,
    color: '#999',
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  buttonRow: {
    flexDirection: 'row',
    marginTop: 16,
    marginBottom: 16,
    marginHorizontal: 16,
    gap: 12,
  },
  buttonRowSingle: {
    flexDirection: 'row',
    marginTop: 16,
    marginBottom: 16,
    marginHorizontal: 16,
  },
  reserveButton: {
    flex: 1,
    backgroundColor: '#00BCD4',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  reserveButtonFull: {
    width: '100%',
  },
  reserveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  detailsButton: {
    flex: 1,
    backgroundColor: SuiTheme.background.cardLight,
    borderWidth: 1.5,
    borderColor: SuiTheme.primary.main,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  detailsButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
});
