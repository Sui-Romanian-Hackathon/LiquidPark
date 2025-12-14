import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { doZkLogin, registerUser, requestTestnetSui } from '../services/zkLoginService';
import type { UserType } from '../types';
import { SuiTheme, getGradientColors } from '../config/theme';
import { SuiLogo } from '../components/SuiLogo';

interface WelcomeScreenProps {
  onAuthenticated: (address: string, userType: UserType, name?: string, email?: string) => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onAuthenticated }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async () => {
    let authState: any = null;
    try {
      setIsLoading(true);

      // Step 1: Authenticate with Google OAuth (zkLogin)
      // Default to 'driver' since users can be both driver and owner
      authState = await doZkLogin('driver');

      // Step 2: Request testnet SUI from faucet before registration
      console.log('Requesting testnet SUI for user...');
      const faucetSuccess = await requestTestnetSui(authState.address);
      
      if (!faucetSuccess) {
        console.warn('Faucet request failed, but continuing with registration attempt...');
      }

      // Step 3: Ensure user is registered on-chain (creates profile if needed)
      // This handles both new users and existing users gracefully
      if (authState.name) {
        try {
          const registrationResult = await registerUser(authState.name, authState.address);

          if (registrationResult) {
            // New user registered successfully
            console.log('New user registered:', registrationResult.digest);
          }
          // If registrationResult is null, user was already registered (handled in registerUser)
        } catch (regError: any) {
          // Check if this is an "already registered" error - handle silently
          const regErrorMessage = regError.message || '';
          const regErrorString = JSON.stringify(regError);
          const isAlreadyRegisteredError = (
            regError?.isAlreadyRegistered === true ||
            regError?.name === 'AlreadyRegisteredError' ||
            (regErrorMessage.includes('MoveAbort') && regErrorString.includes('", 2)') && regErrorMessage.includes('register_user')) ||
            (regErrorMessage.includes('Dry run failed') && regErrorMessage.includes('register_user') && regErrorString.includes('", 2)')) ||
            (regErrorMessage.includes('error code: 2') && regErrorMessage.includes('register_user')) ||
            regErrorString.includes('EAlreadyRegistered')
          );
          
          if (isAlreadyRegisteredError) {
            // User already registered - silently continue, this is fine
            console.log('User already registered, continuing...');
            // Continue to Step 4
          } else if (regError.name === 'InsufficientBalance' || regError.message?.includes('gas coins')) {
            // Handle insufficient balance error with helpful message
            Alert.alert(
              'Insufficient SUI Balance',
              `Your account needs testnet SUI to register.\n\n` +
              `Please request SUI from one of these faucets:\n` +
              `• https://faucet.sui.io/\n` +
              `• https://stakely.io/faucet/sui-testnet-sui\n` +
              `• https://faucet.blockbolt.io/\n\n` +
              `After receiving SUI, please try logging in again.`,
              [{ text: 'OK', style: 'default' }]
            );
            return; // Don't proceed to app
          } else {
            // Re-throw other errors
            throw regError;
          }
        }
      }

      // Step 4: User is authenticated and registered, proceed to app
      if (authState) {
        onAuthenticated(authState.address, authState.userType, authState.name, authState.email);
      }
    } catch (error: any) {
      // Check if this is an "already registered" error - don't show alert for this
      const errorMessage = error.message || '';
      const errorString = JSON.stringify(error);
      const isAlreadyRegisteredError = (
        error?.isAlreadyRegistered === true ||
        error?.name === 'AlreadyRegisteredError' ||
        (errorMessage.includes('MoveAbort') && errorString.includes('", 2)') && errorMessage.includes('register_user')) ||
        (errorMessage.includes('Dry run failed') && errorMessage.includes('register_user') && errorString.includes('", 2)')) ||
        (errorMessage.includes('error code: 2') && errorMessage.includes('register_user')) ||
        errorString.includes('EAlreadyRegistered')
      );
      
      if (isAlreadyRegisteredError && authState) {
        // User already registered - silently continue to app
        console.log('User already registered, proceeding to app...');
        onAuthenticated(authState.address, authState.userType, authState.name, authState.email);
        return;
      }
      
      // Only show alert for real errors
      console.error('Login/Registration error:', error);
      Alert.alert(
        'Login Failed',
        error.message || 'An error occurred during login. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };



  return (
    <LinearGradient colors={getGradientColors('primary')} style={styles.container}>
      <StatusBar style="light" />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoContainer}>
              <View style={styles.logo}>
                <SuiLogo width={100} height={150} />
              </View>
            </View>
            <Text style={styles.title}>LiquidPark</Text>
            <Text style={styles.subtitle}>your smart parking assistent</Text>
          </View>

          {/* Login Card */}
          <View style={styles.card}>
            <Text style={styles.welcomeText}>Welcome</Text>
            <Text style={styles.descriptionText}>
              Powered by Sui blockchain and AI. Find, reserve, and pay for parking spots through natural conversation.
            </Text>

            {/* Google Login Button */}
            <TouchableOpacity
              style={[styles.oauthButton, isLoading && styles.buttonDisabled]}
              onPress={handleGoogleLogin}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={getGradientColors('secondary')}
                style={styles.oauthButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                {isLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Text style={styles.oauthIcon}>G</Text>
                    <Text style={styles.oauthText}>Continue with Google</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </ScrollView>

      </SafeAreaView>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  header: {
    alignItems: 'center',
    paddingTop: 40,
    paddingBottom: 20,
  },
  logoContainer: {
    marginBottom: 16,
  },
  logo: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  logoText: {
    fontSize: 40,
    fontWeight: 'bold',
    color: '#fff',
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
  },
  card: {
    backgroundColor: SuiTheme.background.card,
    marginHorizontal: 20,
    marginTop: 40,
    borderRadius: 24,
    padding: 28,
    shadowColor: SuiTheme.shadow.color,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 10,
  },
  welcomeText: {
    fontSize: 28,
    fontWeight: 'bold',
    color: SuiTheme.text.primary,
    textAlign: 'center',
    marginBottom: 8,
  },
  descriptionText: {
    fontSize: 14,
    color: SuiTheme.text.secondary,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  userTypeContainer: {
    marginBottom: 20,
  },
  sectionLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  userTypeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  userTypeButton: {
    flex: 1,
    backgroundColor: '#34495E',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  userTypeButtonSelected: {
    borderColor: '#00BCD4',
    backgroundColor: '#3d5669',
  },
  userTypeIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  userTypeText: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: '600',
  },
  userTypeTextSelected: {
    color: '#00BCD4',
  },
  delimiterContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 12,
    marginHorizontal: -4,
  },
  delimiterLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#555',
  },
  delimiterCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#34495E',
    borderWidth: 1,
    borderColor: '#555',
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 12,
  },
  delimiterText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
  },
  continueWithContainer: {
    marginTop: 24,
    marginBottom: 20,
  },
  walletButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00BCD4',
    paddingVertical: 16,
    borderRadius: 12,
    gap: 12,
    marginBottom: 12,
  },
  walletIcon: {
    fontSize: 20,
  },
  walletText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  oauthButton: {
    borderRadius: 14,
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: SuiTheme.primary.dark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  oauthButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 12,
  },
  googleButton: {
    overflow: 'hidden',
  },
  facebookButton: {
    backgroundColor: '#1877F2',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  oauthIcon: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    width: 24,
    textAlign: 'center',
  },
  oauthText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#2C3E50',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  modalDescription: {
    fontSize: 14,
    color: '#ccc',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 20,
  },
  addressInput: {
    backgroundColor: '#34495E',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#555',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#34495E',
  },
  modalButtonSubmit: {
    backgroundColor: '#00BCD4',
  },
  modalButtonTextCancel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  modalButtonTextSubmit: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
