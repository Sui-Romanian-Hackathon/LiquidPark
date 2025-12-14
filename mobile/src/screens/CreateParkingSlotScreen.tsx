import React, { useState } from 'react';
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
} from 'react-native';
import { executeZkLoginTransaction } from '../services/zkLoginService';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { CONTRACT_ADDRESSES, config } from '../config';
import { SuiTheme } from '../config/theme';

interface CreateParkingSlotScreenProps {
  userAddress: string | null;
  onComplete: (result: { success: true; slotId: string; digest: string } | { success: false; error: string }) => void;
  onCancel: () => void;
  onToggleSidebar?: () => void;
}

// Contract deployment info
const SUI_DEPLOYMENT = {
  testnet: {
    packageId: CONTRACT_ADDRESSES.REPUTATION_MODULE,
    zoneRegistryId: '0xd7861c29b4c71507797910d8203275938d5778dc9282427aec85fce0d8df2ce7',
  },
};

export const CreateParkingSlotScreen: React.FC<CreateParkingSlotScreenProps> = ({
  userAddress,
  onComplete,
  onCancel,
  onToggleSidebar,
}) => {
  const [formData, setFormData] = useState({
    locationName: '',
    address: '',
    latitude: '',
    longitude: '',
    basePricePerHour: '',
  });
  const [isCreating, setIsCreating] = useState(false);

  const handleFieldChange = (field: keyof typeof formData, value: string) => {
    // For latitude and longitude, replace comma with dot for decimal separator
    if (field === 'latitude' || field === 'longitude') {
      value = value.replace(',', '.');
      // Only allow numbers and one dot
      const parts = value.split('.');
      if (parts.length > 2) {
        // If more than one dot, keep only the first part and first dot
        value = parts[0] + '.' + parts.slice(1).join('');
      }
    }
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const validateForm = (): boolean => {
    if (!formData.locationName.trim()) {
      Alert.alert('Validation Error', 'Please enter a location name.');
      return false;
    }
    if (!formData.address.trim()) {
      Alert.alert('Validation Error', 'Please enter an address.');
      return false;
    }
    const lat = parseFloat(formData.latitude);
    const lng = parseFloat(formData.longitude);
    if (isNaN(lat) || lat < -90 || lat > 90) {
      Alert.alert('Validation Error', 'Please enter a valid latitude (-90 to 90).');
      return false;
    }
    if (isNaN(lng) || lng < -180 || lng > 180) {
      Alert.alert('Validation Error', 'Please enter a valid longitude (-180 to 180).');
      return false;
    }
    const price = parseFloat(formData.basePricePerHour);
    if (isNaN(price) || price <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid price per hour (greater than 0).');
      return false;
    }
    return true;
  };

  const handleCreateSlot = async () => {
    if (!userAddress) {
      Alert.alert('Error', 'User address is required. Please login first.');
      return;
    }

    if (!validateForm()) {
      return;
    }

    try {
      setIsCreating(true);

      const network = config.defaultNetwork || 'testnet';
      const deployment = SUI_DEPLOYMENT[network];

      // Parse form data
      const latitude = parseFloat(formData.latitude);
      const longitude = parseFloat(formData.longitude);
      const basePricePerHourSui = parseFloat(formData.basePricePerHour);

      // Convert coordinates to microdegrees (multiply by 1,000,000)
      const latitudeMicrodegrees = Math.round(latitude * 1_000_000);
      const longitudeMicrodegrees = Math.round(longitude * 1_000_000);

      // Convert price from SUI to MIST (1 SUI = 1,000,000,000 MIST)
      const basePricePerHourMist = BigInt(Math.round(basePricePerHourSui * 1_000_000_000));

      // Generate unique location ID (using timestamp)
      const locationId = BigInt(Date.now());

      // Create transaction block
      const txb = new TransactionBlock();
      txb.setSender(userAddress);

      // Call create_slot function
      txb.moveCall({
        target: `${deployment.packageId}::market::create_slot`,
        arguments: [
          txb.object(deployment.zoneRegistryId),
          txb.pure.u64(locationId),
          txb.pure.string(formData.locationName),
          txb.pure.string(formData.address), // Add address parameter
          txb.pure.u64(latitudeMicrodegrees),
          txb.pure.u64(longitudeMicrodegrees),
          txb.pure.u64(basePricePerHourMist),
          txb.object(CONTRACT_ADDRESSES.CLOCK_OBJECT), // Clock object
        ],
      });

      // Execute transaction with zkLogin signature
      const result = await executeZkLoginTransaction(txb, userAddress);

      // Extract slot ID and owner cap ID from objectChanges
      let slotId: string | null = null;
      let ownerCapId: string | null = null;
      
      // First, try to extract from SlotCreated event
      if (result.events) {
        const slotCreatedEvent = result.events.find(
          (event: any) => event.type && event.type.includes('SlotCreated')
        );
        if (slotCreatedEvent && slotCreatedEvent.parsedJson) {
          const eventData = slotCreatedEvent.parsedJson as { slot_id?: string };
          if (eventData.slot_id) {
            slotId = eventData.slot_id;
          }
        }
      }

      // Extract from objectChanges
      if (result.objectChanges) {
        // Find ParkingSlot
        const slotChange = result.objectChanges.find(
          (change: any) =>
            change.type === 'created' &&
            change.objectType &&
            change.objectType.includes('ParkingSlot')
        );
        if (slotChange && 'objectId' in slotChange) {
          slotId = slotChange.objectId;
        }

        // Find SlotOwnerCap
        const ownerCapChange = result.objectChanges.find(
          (change: any) =>
            change.type === 'created' &&
            change.objectType &&
            change.objectType.includes('SlotOwnerCap')
        );
        if (ownerCapChange && 'objectId' in ownerCapChange) {
          ownerCapId = ownerCapChange.objectId;
        }
      }

      if (!slotId) {
        throw new Error('Could not extract slot ID from transaction');
      }

      if (!ownerCapId) {
        throw new Error('Could not extract owner cap ID from transaction');
      }

      // Step 2: Deposit 0.2 SUI as collateral
      const collateralAmountMist = BigInt(200_000_000); // 0.2 SUI = 200,000,000 MIST
      
      const depositTxb = new TransactionBlock();
      depositTxb.setSender(userAddress);
      
      // Split coin for collateral
      const [collateralCoin] = depositTxb.splitCoins(depositTxb.gas, [depositTxb.pure.u64(collateralAmountMist)]);
      
      // Call deposit_collateral
      depositTxb.moveCall({
        target: `${deployment.packageId}::market::deposit_collateral`,
        arguments: [
          depositTxb.object(slotId), // ParkingSlot (mutable reference)
          depositTxb.object(ownerCapId), // SlotOwnerCap (for authorization)
          collateralCoin, // Collateral coin
        ],
      });

      // Execute deposit transaction
      const depositResult = await executeZkLoginTransaction(depositTxb, userAddress);

      onComplete({
        success: true,
        slotId: slotId,
        digest: depositResult.digest, // Return the last transaction digest
      });
    } catch (error: any) {
      console.error('Error creating parking slot:', error);
      onComplete({
        success: false,
        error: error.message || 'Failed to create parking slot',
      });
    } finally {
      setIsCreating(false);
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
            Create Parking Slot
          </Text>
        </View>
        <TouchableOpacity onPress={onCancel} style={styles.cancelButton}>
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Slot Information</Text>
          <Text style={styles.sectionDescription}>
            Fill in the details to create a new parking slot on the Sui blockchain
          </Text>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Location Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Downtown Parking Lot"
                value={formData.locationName}
                onChangeText={(value) => handleFieldChange('locationName', value)}
                editable={!isCreating}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Address *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="e.g., Strada Teodor Mihali 58, Cluj-Napoca"
                value={formData.address}
                onChangeText={(value) => handleFieldChange('address', value)}
                multiline
                numberOfLines={2}
                editable={!isCreating}
              />
            </View>

            <View style={styles.coordinatesRow}>
              <View style={[styles.inputGroup, styles.coordinateInput]}>
                <Text style={styles.label}>Latitude *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., 46.766"
                  value={formData.latitude}
                  onChangeText={(value) => handleFieldChange('latitude', value)}
                  keyboardType="decimal-pad"
                  editable={!isCreating}
                />
              </View>

              <View style={[styles.inputGroup, styles.coordinateInput]}>
                <Text style={styles.label}>Longitude *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g., 23.599"
                  value={formData.longitude}
                  onChangeText={(value) => handleFieldChange('longitude', value)}
                  keyboardType="decimal-pad"
                  editable={!isCreating}
                />
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Base Price Per Hour (SUI) *</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., 7.5"
                value={formData.basePricePerHour}
                onChangeText={(value) => handleFieldChange('basePricePerHour', value)}
                keyboardType="decimal-pad"
                editable={!isCreating}
              />
              <Text style={styles.helperText}>
                This is the base price. Dynamic pricing may apply based on demand.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.createButton, isCreating && styles.createButtonDisabled]}
              onPress={handleCreateSlot}
              disabled={isCreating}
            >
              {isCreating ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color="#fff" size="small" />
                  <Text style={styles.createButtonText}>Creating...</Text>
                </View>
              ) : (
                <Text style={styles.createButtonText}>Create Parking Slot</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
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
    minWidth: 0, // Allow flex item to shrink below its content size
  },
  menuButton: {
    padding: 4,
    flexShrink: 0, // Don't shrink menu button
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
    flexShrink: 1, // Allow title to shrink if needed
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    flexShrink: 0, // Don't shrink cancel button
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
  input: {
    borderWidth: 1.5,
    borderColor: SuiTheme.primary.lighter,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    backgroundColor: SuiTheme.background.primary,
  },
  textArea: {
    minHeight: 60,
    textAlignVertical: 'top',
  },
  coordinatesRow: {
    flexDirection: 'row',
    gap: 12,
  },
  coordinateInput: {
    flex: 1,
  },
  helperText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  createButton: {
    backgroundColor: SuiTheme.primary.main,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    shadowColor: SuiTheme.primary.main,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
    marginTop: 8,
  },
  createButtonDisabled: {
    opacity: 0.6,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
