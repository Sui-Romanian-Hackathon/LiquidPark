import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import type { ParkingSpotCard } from '../types';
import { SuiTheme } from '../config/theme';

interface SuccessScreenProps {
  spot: ParkingSpotCard;
  txDigest: string;
  reservationId?: string;
  onBack: () => void;
}

export const SuccessScreen: React.FC<SuccessScreenProps> = ({
  spot,
  txDigest,
  reservationId,
  onBack,
}) => {
  const formatDigest = (digest: string) => {
    if (digest.length <= 16) return digest;
    return `${digest.slice(0, 8)}...${digest.slice(-8)}`;
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Success Icon */}
        <View style={styles.iconContainer}>
          <View style={styles.successIcon}>
            <Text style={styles.checkmark}>✓</Text>
          </View>
        </View>

        {/* Success Message */}
        <Text style={styles.title}>Reservation Confirmed!</Text>
        <Text style={styles.subtitle}>
          Your parking reservation has been successfully confirmed on Sui.
        </Text>

        {/* Reservation Details */}
        <View style={styles.detailsCard}>
          <Text style={styles.detailsTitle}>Reservation Details</Text>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Location:</Text>
            <Text style={styles.detailValue}>{spot.name}</Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Address:</Text>
            <Text style={styles.detailValue} numberOfLines={2}>
              {spot.address}
            </Text>
          </View>
          
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Price:</Text>
            <Text style={styles.detailValue}>{spot.price_display}</Text>
          </View>

          {reservationId && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Reservation ID:</Text>
              <Text style={styles.detailValue} numberOfLines={1}>
                {formatDigest(reservationId)}
              </Text>
            </View>
          )}
        </View>

        {/* Transaction Info */}
        <View style={styles.txCard}>
          <Text style={styles.txTitle}>Transaction</Text>
          <View style={styles.txRow}>
            <Text style={styles.txLabel}>Digest:</Text>
            <Text style={styles.txValue} selectable>
              {formatDigest(txDigest)}
            </Text>
          </View>
          <Text style={styles.txNote}>
            Your transaction has been confirmed on the Sui blockchain.
          </Text>
        </View>

        {/* Action Button */}
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>Back to Chat</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SuiTheme.background.secondary,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 24,
    alignItems: 'center',
  },
  iconContainer: {
    marginTop: 32,
    marginBottom: 24,
  },
  successIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    fontSize: 48,
    color: '#fff',
    fontWeight: 'bold',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 32,
    paddingHorizontal: 16,
  },
  detailsCard: {
    width: '100%',
    backgroundColor: SuiTheme.background.cardLight,
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    shadowColor: SuiTheme.primary.main,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: SuiTheme.primary.lighter,
  },
  detailsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
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
  txCard: {
    width: '100%',
    backgroundColor: SuiTheme.background.cardLight,
    borderRadius: 12,
    padding: 20,
    marginBottom: 24,
    shadowColor: SuiTheme.primary.main,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: SuiTheme.primary.lighter,
  },
  txTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  txLabel: {
    fontSize: 14,
    color: '#666',
  },
  txValue: {
    fontSize: 12,
    color: '#00BCD4',
    fontFamily: 'monospace',
    fontWeight: '500',
  },
  txNote: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
    fontStyle: 'italic',
  },
  backButton: {
    width: '100%',
    backgroundColor: '#00BCD4',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 32,
  },
  backButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
});


