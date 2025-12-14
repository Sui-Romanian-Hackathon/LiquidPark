// Polyfill crypto.getRandomValues for React Native - MUST be imported first
import './src/config/env';

import React, { useState, useEffect } from 'react';
import * as Linking from 'expo-linking';
import { View, StyleSheet, Alert } from 'react-native';
import { WelcomeScreen } from './src/screens/WelcomeScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { SummaryScreen } from './src/screens/SummaryScreen';
import { SigningScreen } from './src/screens/SigningScreen';
import { SuccessScreen } from './src/screens/SuccessScreen';
import { ErrorScreen } from './src/screens/ErrorScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { ReservationsScreen } from './src/screens/ReservationsScreen';
import { MyParkingSlotsScreen } from './src/screens/MyParkingSlotsScreen';
import { CreateParkingSlotScreen } from './src/screens/CreateParkingSlotScreen';
import { ComplaintsScreen } from './src/screens/ComplaintsScreen';
import { CreateComplaintScreen } from './src/screens/CreateComplaintScreen';
import { SidebarNavigation, type NavigationItem } from './src/components/SidebarNavigation';
import { getAuthState, logout } from './src/services/zkLoginService';
import type { ParkingSpotCard, UserType } from './src/types';
import type { ProfileData } from './src/screens/ProfileScreen';
import type { ChatMessage as SimpleChatMessage } from './src/components/SimpleChat';

type Screen = 'Welcome' | 'Chat' | 'Summary' | 'Signing' | 'Success' | 'Error' | 'Profile' | 'Reservations' | 'MyParkingSlots' | 'CreateParkingSlot' | 'Complaints' | 'CreateComplaint';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('Welcome');
  const [selectedSpot, setSelectedSpot] = useState<ParkingSpotCard | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userAddress, setUserAddress] = useState<string | null>(null);
  const [userType, setUserType] = useState<UserType | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [signingResult, setSigningResult] = useState<{
    txDigest?: string;
    reservationId?: string;
    error?: string;
  } | null>(null);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [showSidebar, setShowSidebar] = useState(false); // Sidebar closed by default
  const [userName, setUserName] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [slotsRefreshTrigger, setSlotsRefreshTrigger] = useState(0);
  const [chatMessages, setChatMessages] = useState<SimpleChatMessage[]>([]);
  const [chatInitialized, setChatInitialized] = useState(false);
  const [complaintsRefreshTrigger, setComplaintsRefreshTrigger] = useState(0);

  // Check authentication state on app load
  useEffect(() => {
    checkAuthState();
  }, []);

  // Initialize chat with welcome message only once
  useEffect(() => {
    if (!chatInitialized && chatMessages.length === 0) {
      const welcomeMessage: SimpleChatMessage = {
        id: '1',
        text: "Hi! I'm your parking assistant. Where do you need parking today?",
        isUser: false,
        timestamp: new Date(),
      };
      setChatMessages([welcomeMessage]);
      setChatInitialized(true);
    }
  }, [chatInitialized, chatMessages.length]);

  // Handle deep links (OAuth callbacks)
  useEffect(() => {
    // Handle initial URL if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        console.log('Initial URL received:', url);
        // react-native-app-auth handles OAuth redirects automatically
        // but we log it for debugging
        if (url.includes('oauth2redirect') || url.includes('google')) {
          console.log('OAuth redirect detected in initial URL');
        }
      }
    });

    // Listen for deep links while app is running
    const subscription = Linking.addEventListener('url', (event) => {
      if (event.url) {
        console.log('Deep link received:', event.url);
        // react-native-app-auth handles OAuth redirects automatically
        // but we log it for debugging
        if (event.url.includes('oauth2redirect') || event.url.includes('google')) {
          console.log('OAuth redirect detected in deep link');
        }
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const checkAuthState = async () => {
    try {
      // Check zkLogin auth
      const authState = await getAuthState();
      if (authState && authState.isAuthenticated) {
        setUserAddress(authState.address);
        setUserType(authState.userType);
        setUserName(authState.name || null);
        setUserEmail(authState.email || null);
        setIsAuthenticated(true);
        setCurrentScreen('Chat');
        setShowSidebar(true);
        setIsCheckingAuth(false);
        return;
      }
    } catch (error) {
      console.error('Error checking auth state:', error);
    } finally {
      setIsCheckingAuth(false);
    }
  };

  const handleAuthenticated = async (address: string, type: UserType, name?: string, email?: string) => {
    setUserAddress(address);
    setUserType(type);
    setIsAuthenticated(true);
    setCurrentScreen('Chat');
    setShowSidebar(true);
    
    // Set user name and email from parameters or get from auth state
    if (name || email) {
      setUserName(name || null);
      setUserEmail(email || null);
    } else {
      // Fallback: get from auth state if not provided
      const authState = await getAuthState();
      if (authState) {
        setUserName(authState.name || null);
        setUserEmail(authState.email || null);
      }
    }
  };

  const handleLogout = async () => {
    await logout();
    setIsAuthenticated(false);
    setUserAddress(null);
    setUserType(null);
    setUserName(null);
    setUserEmail(null);
    setProfileData(null);
    setCurrentScreen('Welcome');
    setShowSidebar(false);
  };

  const handleSaveProfile = (data: ProfileData) => {
    setProfileData(data);
  };

  const handleAddParkingSlot = () => {
    if (!isAuthenticated || !userAddress) {
      Alert.alert('Authentication Required', 'Please login first to create a parking slot.');
      return;
    }
    setCurrentScreen('CreateParkingSlot');
    setShowSidebar(false);
  };

  const handleCreateSlotComplete = (
    result: { success: true; slotId: string; digest: string } | { success: false; error: string }
  ) => {
    if (result.success === true) {
      // Refresh slots list when a new slot is created
      setSlotsRefreshTrigger((prev) => prev + 1);
      Alert.alert(
        'Success!',
        `Parking slot created successfully!\n\nSlot ID: ${result.slotId}\nTransaction: ${result.digest}`,
        [
          {
            text: 'OK',
            onPress: () => {
              setCurrentScreen('MyParkingSlots');
              setShowSidebar(true);
            },
          },
        ]
      );
    } else {
      // TypeScript now knows result.success === false, so result.error exists
      Alert.alert('Error', result.error || 'Failed to create parking slot', [
        {
          text: 'OK',
          onPress: () => {
            setCurrentScreen('MyParkingSlots');
            setShowSidebar(true);
          },
        },
      ]);
    }
  };

  const handleCreateSlotCancel = () => {
    setCurrentScreen('MyParkingSlots');
    setShowSidebar(true);
  };

  const handleAddComplaint = () => {
    if (!isAuthenticated || !userAddress) {
      Alert.alert('Authentication Required', 'Please login first to create a complaint.');
      return;
    }
    setCurrentScreen('CreateComplaint');
    setShowSidebar(false);
  };

  const handleCreateComplaintComplete = (
    result: { success: true } | { success: false; error: string }
  ) => {
    if (result.success === true) {
      // Refresh complaints list when a new complaint is created
      setComplaintsRefreshTrigger((prev) => prev + 1);
      Alert.alert(
        'Success!',
        'Your complaint has been submitted successfully.',
        [
          {
            text: 'OK',
            onPress: () => {
              setCurrentScreen('Complaints');
              setShowSidebar(true);
            },
          },
        ]
      );
    } else {
      Alert.alert('Error', result.error || 'Failed to submit complaint', [
        {
          text: 'OK',
          onPress: () => {
            setCurrentScreen('Complaints');
            setShowSidebar(true);
          },
        },
      ]);
    }
  };

  const handleCreateComplaintCancel = () => {
    setCurrentScreen('Complaints');
    setShowSidebar(true);
  };

  const isProfileComplete = (): boolean => {
    // TODO: Temporarily disabled - re-enable profile verification later
    return true;
    
    // Original check (commented out temporarily):
    // if (!profileData) return false;
    // return !!(
    //   profileData.name &&
    //   profileData.email &&
    //   profileData.phone &&
    //   profileData.address
    // );
  };

  const handleNavigation = (item: NavigationItem) => {
    if (item === 'Deconnect') {
      handleLogout();
      return;
    }
    
    if (item === 'Chat') {
      setCurrentScreen('Chat');
    } else if (item === 'My Reservations') {
      setCurrentScreen('Reservations');
    } else if (item === 'My Parking Slots') {
      setCurrentScreen('MyParkingSlots');
    } else if (item === 'Profile') {
      setCurrentScreen('Profile');
    } else if (item === 'Complaints') {
      setCurrentScreen('Complaints');
    }
    // Keep sidebar open for main screens
  };

  const handleReserveSlotWithCheck = (spot: ParkingSpotCard) => {
    if (!isProfileComplete()) {
      setCurrentScreen('Profile');
      setShowSidebar(true);
      return;
    }
    handleReserveSlot(spot);
  };

  const handleReserveSlot = (spot: ParkingSpotCard) => {
    setSelectedSpot(spot);
    setCurrentScreen('Signing');
  };

  const handleViewDetails = (spot: ParkingSpotCard) => {
    setSelectedSpot(spot);
    setCurrentScreen('Summary');
  };

  const handleSigningComplete = (
    result: { success: true; txDigest: string; reservationId?: string } | { success: false; error: string }
  ) => {
    if (result.success) {
      setSigningResult({
        txDigest: result.txDigest,
        reservationId: result.reservationId,
      });
      setCurrentScreen('Success');
    } else if (result.success === false) {
      setSigningResult({
        error: result.error,
      });
      setCurrentScreen('Error');
    }
  };

  const handleSigningCancel = () => {
    setCurrentScreen('Chat');
    setSelectedSpot(null);
    setSigningResult(null);
    setShowSidebar(false); // Keep sidebar closed when returning to chat
  };

  const handleSuccessBack = () => {
    setCurrentScreen('Chat');
    setSelectedSpot(null);
    setSigningResult(null);
    setShowSidebar(false); // Keep sidebar closed when returning to chat
  };

  const handleErrorRetry = () => {
    // Go back to signing screen to retry
    setCurrentScreen('Signing');
    setSigningResult(null);
    setShowSidebar(false);
  };

  const handleErrorBack = () => {
    setCurrentScreen('Chat');
    setSelectedSpot(null);
    setSigningResult(null);
    setShowSidebar(false); // Keep sidebar closed when returning to chat
  };

  const handleBackFromSummary = () => {
    setCurrentScreen('Chat');
    setSelectedSpot(null);
    setShowSidebar(false); // Keep sidebar closed when returning to chat
  };

  // Show loading state while checking authentication
  if (isCheckingAuth) {
    return null; // Or a loading screen
  }

  // Get current navigation item for sidebar
  const getCurrentNavItem = (): NavigationItem => {
    if (currentScreen === 'Reservations') return 'My Reservations';
    if (currentScreen === 'MyParkingSlots') return 'My Parking Slots';
    if (currentScreen === 'Profile') return 'Profile';
    if (currentScreen === 'Complaints') return 'Complaints';
    return 'Chat';
  };

  // Simple screen-based navigation
  return (
    <>
      {(() => {
        switch (currentScreen) {
          case 'Welcome':
            return <WelcomeScreen onAuthenticated={handleAuthenticated} />;
          case 'Chat':
          case 'Reservations':
          case 'MyParkingSlots':
          case 'Profile':
          case 'Complaints':
            return (
              <View style={styles.mainContainer}>
                {showSidebar && (
                  <SidebarNavigation
                    currentScreen={getCurrentNavItem()}
                    onNavigate={handleNavigation}
                    onClose={() => setShowSidebar(false)}
                    reservationCount={0}
                  />
                )}
                <View style={styles.contentContainer}>
                  {currentScreen === 'Chat' && (
                    <ChatScreen
                      onReserveSlot={handleReserveSlotWithCheck}
                      onViewDetails={handleViewDetails}
                      userAddress={userAddress}
                      userType={userType}
                      onLogout={handleLogout}
                      onToggleSidebar={() => setShowSidebar(!showSidebar)}
                      isProfileComplete={isProfileComplete()}
                      messages={chatMessages}
                      onMessagesChange={setChatMessages}
                    />
                  )}
                  {currentScreen === 'Reservations' && (
                    <ReservationsScreen
                      userAddress={userAddress}
                      onToggleSidebar={() => setShowSidebar(!showSidebar)}
                    />
                  )}
                  {currentScreen === 'MyParkingSlots' && (
                    <MyParkingSlotsScreen
                      userAddress={userAddress}
                      onAddParkingSlot={handleAddParkingSlot}
                      onToggleSidebar={() => setShowSidebar(!showSidebar)}
                      refreshTrigger={slotsRefreshTrigger}
                    />
                  )}
                  {currentScreen === 'Profile' && (
                    <ProfileScreen
                      userAddress={userAddress}
                      onSaveProfile={handleSaveProfile}
                      onAddParkingSlot={handleAddParkingSlot}
                      profileData={profileData}
                      isProfileComplete={isProfileComplete()}
                      onToggleSidebar={() => setShowSidebar(!showSidebar)}
                      userName={userName}
                      userEmail={userEmail}
                    />
                  )}
                  {currentScreen === 'Complaints' && (
                    <ComplaintsScreen
                      userAddress={userAddress}
                      onAddComplaint={handleAddComplaint}
                      onToggleSidebar={() => setShowSidebar(!showSidebar)}
                      refreshTrigger={complaintsRefreshTrigger}
                    />
                  )}
                </View>
              </View>
            );
          case 'Summary':
            return selectedSpot ? (
              <SummaryScreen
                spot={selectedSpot}
                onReserve={() => {
                  if (!isProfileComplete()) {
                    setCurrentScreen('Profile');
                    setShowSidebar(true);
                    return;
                  }
                  setShowSidebar(false);
                  handleReserveSlot(selectedSpot);
                }}
                onBack={handleBackFromSummary}
              />
            ) : null;
          case 'Signing':
            return selectedSpot ? (
              <SigningScreen
                spot={selectedSpot}
                onComplete={handleSigningComplete}
                onCancel={handleSigningCancel}
                userAddress={userAddress}
              />
            ) : null;
          case 'Success':
            return selectedSpot && signingResult?.txDigest ? (
              <SuccessScreen
                spot={selectedSpot}
                txDigest={signingResult.txDigest}
                reservationId={signingResult.reservationId}
                onBack={handleSuccessBack}
              />
            ) : null;
          case 'Error':
            return selectedSpot && signingResult?.error ? (
              <ErrorScreen
                spot={selectedSpot}
                errorMessage={signingResult.error}
                onRetry={handleErrorRetry}
                onBack={handleErrorBack}
              />
            ) : null;
          case 'CreateParkingSlot':
            return (
              <CreateParkingSlotScreen
                userAddress={userAddress}
                onComplete={handleCreateSlotComplete}
                onCancel={handleCreateSlotCancel}
                onToggleSidebar={() => setShowSidebar(!showSidebar)}
              />
            );
          case 'CreateComplaint':
            return (
              <CreateComplaintScreen
                userAddress={userAddress}
                onComplete={handleCreateComplaintComplete}
                onCancel={handleCreateComplaintCancel}
                onToggleSidebar={() => setShowSidebar(!showSidebar)}
              />
            );
          default:
            return null;
        }
      })()}
    </>
  );
}

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    flexDirection: 'row',
  },
  contentContainer: {
    flex: 1,
  },
});
