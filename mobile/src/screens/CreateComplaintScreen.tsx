import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { getUserReservations, getParkingSlotById } from '../services/api';
import { config } from '../config';
import type { Reservation } from './ReservationsScreen';
import { SuiTheme } from '../config/theme';

interface CreateComplaintScreenProps {
  userAddress: string | null;
  onComplete: (result: { success: true } | { success: false; error: string }) => void;
  onCancel: () => void;
  onToggleSidebar?: () => void;
}

export const CreateComplaintScreen: React.FC<CreateComplaintScreenProps> = ({
  userAddress,
  onComplete,
  onCancel,
  onToggleSidebar,
}) => {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [selectedReservationId, setSelectedReservationId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (userAddress) {
      loadReservations();
    } else {
      setLoading(false);
    }
  }, [userAddress]);

  const loadReservations = async () => {
    if (!userAddress) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const blockchainReservations = await getUserReservations(
        userAddress,
        config.defaultNetwork
      );

      const transformedReservations = await Promise.all(
        blockchainReservations.map(async (res: any) => {
          let slotName = 'Parking Slot';
          let address = 'Address not available';

          try {
            const slot = await getParkingSlotById(res.slotId, config.defaultNetwork);
            if (slot) {
              slotName = slot.locationName || slot.location_name || 'Parking Slot';
              address = slot.address || 'Address not available';
            }
          } catch (err) {
            console.warn(`Failed to fetch slot ${res.slotId}:`, err);
          }

          const startTimeMs = typeof res.startTime === 'string' ? parseInt(res.startTime, 10) : res.startTime;
          const startDate = new Date(startTimeMs);
          
          let date: string;
          let time: string;
          
          if (isNaN(startDate.getTime())) {
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
            const hours = startDate.getHours().toString().padStart(2, '0');
            const minutes = startDate.getMinutes().toString().padStart(2, '0');
            time = `${hours}:${minutes}`;
          }

          const durationHours = res.durationHours || 1;
          const duration = durationHours === 1 ? '1 hour' : `${durationHours} hours`;

          const priceInSui = (res.priceLocked || 0) / 1_000_000_000;
          const price = `${priceInSui.toFixed(2)} SUI`;

          let status: 'active' | 'completed' | 'cancelled' = 'active';
          if (res.state === 2) {
            status = 'completed';
          } else if (res.state === 4) {
            status = 'cancelled';
          } else if (res.state === 1) {
            status = 'active';
          } else if (res.state === 0) {
            status = 'active';
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
            txDigest: res.id,
            escrowId: res.escrowId || null,
            escrowState: undefined,
          };
        })
      );

      setReservations(transformedReservations);
    } catch (err) {
      console.error('Error loading reservations:', err);
      Alert.alert('Error', 'Failed to load reservations. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const requestImagePermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'We need access to your photos to attach images to complaints.'
      );
      return false;
    }
    return true;
  };

  const pickImage = async () => {
    const hasPermission = await requestImagePermission();
    if (!hasPermission) return;

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error picking image:', error);
      Alert.alert('Error', 'Failed to pick image. Please try again.');
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission Required',
        'We need access to your camera to take photos for complaints.'
      );
      return;
    }

    try {
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImageUri(result.assets[0].uri);
      }
    } catch (error) {
      console.error('Error taking photo:', error);
      Alert.alert('Error', 'Failed to take photo. Please try again.');
    }
  };

  const showImageOptions = () => {
    Alert.alert(
      'Select Image',
      'Choose an option',
      [
        { text: 'Camera', onPress: takePhoto },
        { text: 'Photo Library', onPress: pickImage },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const removeImage = () => {
    setImageUri(null);
  };

  const handleSubmit = async () => {
    if (!selectedReservationId) {
      Alert.alert('Validation Error', 'Please select a reservation.');
      return;
    }

    if (!comment.trim()) {
      Alert.alert('Validation Error', 'Please enter a comment describing what happened.');
      return;
    }

    try {
      setSubmitting(true);
      
      // TODO: Implement actual complaint submission to backend/blockchain
      // For now, just show a success message
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simulate API call
      
      Alert.alert(
        'Success',
        'Your complaint has been submitted successfully. We will review it shortly.',
        [
          {
            text: 'OK',
            onPress: () => {
              onComplete({ success: true });
            },
          },
        ]
      );
    } catch (error: any) {
      console.error('Error submitting complaint:', error);
      onComplete({ success: false, error: error.message || 'Failed to submit complaint. Please try again.' });
    } finally {
      setSubmitting(false);
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
          <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
            Create Complaint
          </Text>
        </View>
        <TouchableOpacity onPress={onCancel} style={styles.cancelButton}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color="#00BCD4" />
          <Text style={styles.loadingText}>Loading reservations...</Text>
        </View>
      ) : (
        <ScrollView 
          style={styles.scrollView} 
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Submit a Complaint</Text>
            <Text style={styles.sectionDescription}>
              Report an issue related to one of your reservations. Please provide details about what happened.
            </Text>

            <View style={styles.form}>
              {/* Reservation Selection */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Select Reservation *</Text>
                {reservations.length === 0 ? (
                  <View style={styles.emptyReservations}>
                    <Text style={styles.emptyReservationsText}>
                      No reservations found. You need to have at least one reservation to submit a complaint.
                    </Text>
                  </View>
                ) : (
                  <ScrollView style={styles.reservationsList}>
                    {reservations.map((reservation) => (
                      <TouchableOpacity
                        key={reservation.id}
                        style={[
                          styles.reservationOption,
                          selectedReservationId === reservation.id && styles.reservationOptionSelected,
                        ]}
                        onPress={() => setSelectedReservationId(reservation.id)}
                      >
                        <View style={styles.reservationOptionContent}>
                          <Text style={styles.reservationOptionSlot}>{reservation.slotName}</Text>
                          <Text style={styles.reservationOptionDetails}>
                            {reservation.date} at {reservation.time} • {reservation.duration}
                          </Text>
                          <Text style={styles.reservationOptionAddress}>{reservation.address}</Text>
                        </View>
                        {selectedReservationId === reservation.id && (
                          <Text style={styles.checkmark}>✓</Text>
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>

              {/* Image Upload */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Photo (Optional)</Text>
                {imageUri ? (
                  <View style={styles.imageContainer}>
                    <Image source={{ uri: imageUri }} style={styles.imagePreview} />
                    <TouchableOpacity
                      style={styles.removeImageButton}
                      onPress={removeImage}
                    >
                      <Text style={styles.removeImageButtonText}>Remove Photo</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.imagePickerButton}
                    onPress={showImageOptions}
                  >
                    <Text style={styles.imagePickerButtonText}>📷 Add Photo</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Comment */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Comment *</Text>
                <TextInput
                  style={[styles.input, styles.textArea]}
                  placeholder="Describe what happened..."
                  value={comment}
                  onChangeText={setComment}
                  multiline
                  numberOfLines={6}
                  textAlignVertical="top"
                  editable={!submitting}
                />
                <Text style={styles.helperText}>
                  Please provide a detailed description of the issue you encountered.
                </Text>
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                style={[
                  styles.submitButton,
                  (submitting || !selectedReservationId || !comment.trim() || reservations.length === 0) &&
                    styles.submitButtonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={submitting || !selectedReservationId || !comment.trim() || reservations.length === 0}
                activeOpacity={0.7}
              >
                {submitting ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator color="#fff" size="small" />
                    <Text style={styles.submitButtonText}>Submitting...</Text>
                  </View>
                ) : (
                  <Text style={styles.submitButtonText}>Submit Complaint</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: SuiTheme.background.cardLight,
    borderBottomWidth: 1,
    borderBottomColor: SuiTheme.primary.lighter,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  menuButton: {
    padding: 4,
    flexShrink: 0,
  },
  menuIcon: {
    fontSize: 24,
    color: '#333',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    flexShrink: 1,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    flexShrink: 0,
    marginLeft: 8,
  },
  cancelButtonText: {
    color: '#333',
    fontSize: 15,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  section: {
    backgroundColor: SuiTheme.background.cardLight,
    borderRadius: 12,
    padding: 20,
    shadowColor: SuiTheme.primary.main,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: SuiTheme.primary.lighter,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
  },
  form: {
    gap: 16,
  },
  inputGroup: {
    marginBottom: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  reservationsList: {
    maxHeight: 200,
    borderWidth: 1.5,
    borderColor: SuiTheme.primary.lighter,
    borderRadius: 8,
    backgroundColor: SuiTheme.background.primary,
  },
  reservationOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  reservationOptionSelected: {
    backgroundColor: '#F8F9FA',
  },
  reservationOptionContent: {
    flex: 1,
  },
  reservationOptionSlot: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  reservationOptionDetails: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  reservationOptionAddress: {
    fontSize: 12,
    color: '#999',
  },
  checkmark: {
    fontSize: 20,
    color: '#00BCD4',
    fontWeight: 'bold',
    marginLeft: 12,
  },
  emptyReservations: {
    padding: 16,
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  emptyReservationsText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  imagePickerButton: {
    borderWidth: 2,
    borderColor: '#00BCD4',
    borderStyle: 'dashed',
    borderRadius: 8,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8F9FA',
  },
  imagePickerButtonText: {
    fontSize: 16,
    color: '#00BCD4',
    fontWeight: '600',
  },
  imageContainer: {
    marginTop: 8,
  },
  imagePreview: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 8,
  },
  removeImageButton: {
    padding: 8,
    backgroundColor: '#F44336',
    borderRadius: 8,
    alignItems: 'center',
  },
  removeImageButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1.5,
    borderColor: SuiTheme.primary.lighter,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: SuiTheme.background.primary,
  },
  textArea: {
    minHeight: 120,
    textAlignVertical: 'top',
  },
  helperText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  submitButton: {
    backgroundColor: '#00BCD4',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
});
