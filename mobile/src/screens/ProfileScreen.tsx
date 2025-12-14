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
} from 'react-native';
import { SuiTheme } from '../config/theme';

export interface ProfileData {
  name: string;
  email: string;
  phone: string;
  address: string;
}

interface ProfileScreenProps {
  userAddress?: string | null;
  onSaveProfile: (data: ProfileData) => void;
  onAddParkingSlot: () => void;
  profileData?: ProfileData | null;
  isProfileComplete: boolean;
  onToggleSidebar?: () => void;
  userName?: string | null;
  userEmail?: string | null;
}

export const ProfileScreen: React.FC<ProfileScreenProps> = ({
  userAddress,
  onSaveProfile,
  onAddParkingSlot,
  profileData,
  isProfileComplete,
  onToggleSidebar,
  userName,
  userEmail,
}) => {
  const [formData, setFormData] = useState<ProfileData>(() => {
    // Initialize with profileData if available, otherwise use userName/userEmail from OAuth
    if (profileData) {
      return profileData;
    }
    // Use userName and userEmail if available, otherwise empty strings
    return {
      name: userName || '',
      email: userEmail || '',
      phone: '',
      address: '',
    };
  });

  // Update form data when userName or userEmail changes (e.g., after login)
  // This ensures fields are populated even if userName/userEmail arrive after component mount
  useEffect(() => {
    if (userName && (!formData.name || formData.name === '')) {
      setFormData((prev) => ({ ...prev, name: userName }));
    }
    if (userEmail && (!formData.email || formData.email === '')) {
      setFormData((prev) => ({ ...prev, email: userEmail }));
    }
  }, [userName, userEmail]);

  const handleSave = () => {
    // Validate required fields
    if (!formData.name || !formData.email || !formData.phone || !formData.address) {
      Alert.alert('Incomplete Profile', 'Please fill in all required fields.');
      return;
    }

    onSaveProfile(formData);
    Alert.alert('Success', 'Profile data saved successfully!');
  };

  const handleFieldChange = (field: keyof ProfileData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            {onToggleSidebar && (
              <TouchableOpacity onPress={onToggleSidebar} style={styles.menuButton}>
                <Text style={styles.menuIcon}>☰</Text>
              </TouchableOpacity>
            )}
            <Text style={styles.title}>Profile</Text>
          </View>
          {isProfileComplete && (
            <View style={styles.completeBadge}>
              <Text style={styles.completeBadgeText}>✓ Complete</Text>
            </View>
          )}
        </View>

        {/* Personal Data Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Data</Text>
          <Text style={styles.sectionDescription}>
            Complete your profile to publish parking spots and make reservations
          </Text>

          <View style={styles.form}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your full name"
                value={formData.name}
                onChangeText={(value) => handleFieldChange('name', value)}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your email"
                value={formData.email}
                onChangeText={(value) => handleFieldChange('email', value)}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Phone Number *</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter your phone number"
                value={formData.phone}
                onChangeText={(value) => handleFieldChange('phone', value)}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Address *</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Enter your address"
                value={formData.address}
                onChangeText={(value) => handleFieldChange('address', value)}
                multiline
                numberOfLines={3}
              />
            </View>

            {userAddress && (
              <View style={styles.addressDisplay}>
                <Text style={styles.addressLabel}>Wallet Address:</Text>
                <Text style={styles.addressValue} numberOfLines={1} ellipsizeMode="middle">
                  {userAddress}
                </Text>
              </View>
            )}

            <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
              <Text style={styles.saveButtonText}>Save Profile</Text>
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
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
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
  },
  completeBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  completeBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  section: {
    backgroundColor: SuiTheme.background.cardLight,
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: SuiTheme.primary.main,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: SuiTheme.primary.lighter,
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
    minHeight: 80,
    textAlignVertical: 'top',
  },
  addressDisplay: {
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  addressLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  addressValue: {
    fontSize: 14,
    color: '#333',
    fontFamily: 'monospace',
  },
  saveButton: {
    backgroundColor: '#00BCD4',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
