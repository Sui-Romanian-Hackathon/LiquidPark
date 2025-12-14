import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Animated,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import type { ParkingSpotCard } from '../types';
import { getOwnerProfileByAddress } from '../services/api';
import { config } from '../config';
import { SuiTheme, getGradientColors } from '../config/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { SuiLogo } from './SuiLogo';

export interface ChatMessage {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
  parkingSpot?: ParkingSpotCard;
}

interface SimpleChatProps {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  onReserveSpot?: (spot: ParkingSpotCard) => void;
  onViewSpotDetails?: (spot: ParkingSpotCard) => void;
}

// Loading dots component
const LoadingDots: React.FC = () => {
  const dot1 = useRef(new Animated.Value(0.4)).current;
  const dot2 = useRef(new Animated.Value(0.4)).current;
  const dot3 = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animateDot = (dot: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.4,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      );
    };

    const anim1 = animateDot(dot1, 0);
    const anim2 = animateDot(dot2, 160);
    const anim3 = animateDot(dot3, 320);

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.loadingContainer}>
      <Animated.Text style={[styles.loadingDot, { opacity: dot1 }]}>●</Animated.Text>
      <Animated.Text style={[styles.loadingDot, { opacity: dot2 }]}>●</Animated.Text>
      <Animated.Text style={[styles.loadingDot, { opacity: dot3 }]}>●</Animated.Text>
    </View>
  );
};

// Parking spots slider component (defined outside SimpleChat to avoid hook issues)
const ParkingSpotsSlider: React.FC<{
  spots: ChatMessage[];
  onReserve?: (spot: ParkingSpotCard) => void;
  onViewDetails?: (spot: ParkingSpotCard) => void;
}> = ({ spots, onReserve, onViewDetails }) => {
  const screenWidth = Dimensions.get('window').width;
  const cardWidth = screenWidth - 32; // Screen width minus padding
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  return (
    <View style={styles.parkingSpotsSliderContainer}>
      <FlatList
        ref={flatListRef}
        data={spots}
        keyExtractor={(spotItem) => spotItem.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardWidth + 16}
        decelerationRate="fast"
        contentContainerStyle={styles.parkingSpotsSliderContent}
        onMomentumScrollEnd={(event) => {
          const index = Math.round(event.nativeEvent.contentOffset.x / (cardWidth + 16));
          setCurrentIndex(index);
        }}
        renderItem={({ item: spotItem }) => {
          if (!spotItem.parkingSpot) return null;
          return (
            <View style={[styles.parkingSpotContainer, { width: cardWidth }]}>
              <View
                style={[
                  styles.parkingSpotMessageBubble,
                  styles.parkingSpotBubble,
                  { width: cardWidth },
                ]}
              >
                <ParkingSpotMessage
                  spot={spotItem.parkingSpot}
                  onReserve={onReserve}
                  onViewDetails={onViewDetails}
                />
              </View>
            </View>
          );
        }}
      />
      {/* Pagination dots */}
      {spots.length > 1 && (
        <View style={styles.paginationContainer}>
          {spots.map((_, index) => (
            <View
              key={index}
              style={[
                styles.paginationDot,
                index === currentIndex && styles.paginationDotActive,
              ]}
            />
          ))}
        </View>
      )}
    </View>
  );
};

// Parking spot message component
const ParkingSpotMessage: React.FC<{
  spot: ParkingSpotCard;
  onReserve?: (spot: ParkingSpotCard) => void;
  onViewDetails?: (spot: ParkingSpotCard) => void;
}> = ({ spot, onReserve, onViewDetails }) => {
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
        console.log('[SimpleChat] No owner address available for spot:', spot.slot_id);
        return; // No owner address available
      }

      console.log('[SimpleChat] Fetching owner profile for:', spot.owner);
      setIsLoadingScore(true);
      try {
        const ownerProfile = await getOwnerProfileByAddress(spot.owner, config.defaultNetwork);
        console.log('[SimpleChat] Owner profile:', ownerProfile);
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
        console.error('[SimpleChat] Error fetching owner profile:', error);
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
    <View style={styles.parkingSpotMessage}>
      {/* Header with name and trusted badge */}
      <View style={styles.spotHeader}>
        <View style={styles.spotTitleRow}>
          <View style={styles.spotIconContainer}>
            <Text style={styles.spotIcon}>🅿️</Text>
          </View>
          <Text style={styles.spotName} numberOfLines={1} ellipsizeMode="tail">
            {spot.name}
          </Text>
          {spot.is_trusted && (
            <View style={styles.trustedBadge}>
              <Text style={styles.trustedBadgeText}>✓</Text>
            </View>
          )}
        </View>
      </View>

      {/* Key Info Cards */}
      <View style={styles.spotInfo}>
        <View style={styles.spotInfoItem}>
          <Text style={styles.spotInfoIcon}>📍</Text>
          <Text style={styles.spotInfoValue} numberOfLines={1}>
            {spot.distance_m}m
          </Text>
          <Text style={styles.spotInfoLabel} numberOfLines={1}>
            away
          </Text>
        </View>
        <View style={styles.spotInfoItem}>
          <Text style={styles.spotInfoIcon}>💰</Text>
          <Text style={styles.spotInfoValue} numberOfLines={1}>
            {spot.price_display}
          </Text>
        </View>
        <View style={styles.spotInfoItem}>
          <Text style={styles.spotInfoIcon}>🚗</Text>
          <Text style={styles.spotInfoValue} numberOfLines={1}>
            {spot.available_spots}/{spot.total_spots}
          </Text>
          <Text style={styles.spotInfoLabel} numberOfLines={1}>
            spots
          </Text>
        </View>
      </View>

      {/* Address */}
      {spot.address && spot.address !== 'Address not available' && (
        <View style={styles.spotAddressContainer}>
          <Text style={styles.spotAddressLabel}>📍 Location</Text>
          <Text style={styles.spotAddress} numberOfLines={2}>
            {spot.address}
          </Text>
        </View>
      )}

      {/* Owner Score Section */}
      <View style={styles.spotReputation}>
        <Text style={styles.reputationLabel}>Score</Text>
        {isLoadingScore ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="small" color="#666" />
            <Text style={styles.loadingText}>Loading score...</Text>
          </View>
        ) : ownerScore ? (
          <>
            <View style={styles.reputationBarContainer}>
              <View style={styles.reputationBar}>
                <View
                  style={[
                    styles.reputationBarFill,
                    { width: `${scorePercentage}%` },
                  ]}
                />
              </View>
              <Text style={styles.reputationScore}>
                {ownerScore.score}/10000 · {getScoreLabel(ownerScore.score)}
              </Text>
            </View>
            <Text style={styles.spotStats}>
              {ownerScore.successfulRentals}/{ownerScore.totalRentals} {ownerScore.totalRentals === 1 ? 'successful rental' : 'successful rentals'}
              {ownerScore.totalRentals > 0 && ` (${Math.round((ownerScore.successfulRentals / ownerScore.totalRentals) * 100)}% success rate)`}
            </Text>
          </>
        ) : (
          <Text style={styles.noRatingText}>Score not available</Text>
        )}
      </View>

      {/* Action Buttons */}
      {(onReserve || onViewDetails) && (
        <View style={styles.spotActions}>
          {onReserve && (
            <TouchableOpacity
              style={styles.reserveButton}
              onPress={() => onReserve(spot)}
              activeOpacity={0.8}
            >
              <LinearGradient
                colors={getGradientColors('primary')}
                style={styles.reserveButtonGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <Text style={styles.reserveButtonText}>Reserve Now</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
          {onViewDetails && (
            <TouchableOpacity
              style={styles.detailsButton}
              onPress={() => onViewDetails(spot)}
              activeOpacity={0.7}
            >
              <Text style={styles.detailsButtonText}>View Details</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
};

export const SimpleChat: React.FC<SimpleChatProps> = ({
  messages,
  onSend,
  isLoading = false,
  placeholder = 'Type a message...',
  onReserveSpot,
  onViewSpotDetails,
}) => {
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList>(null);

  const handleSend = () => {
    if (inputText.trim() && !isLoading) {
      onSend(inputText.trim());
      setInputText('');
    }
  };

  // Group consecutive parking spot messages together
  const groupParkingSpots = (messages: ChatMessage[]): (ChatMessage | ChatMessage[])[] => {
    const grouped: (ChatMessage | ChatMessage[])[] = [];
    let currentGroup: ChatMessage[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      
      if (msg.parkingSpot) {
        currentGroup.push(msg);
      } else {
        if (currentGroup.length > 0) {
          grouped.push(currentGroup);
          currentGroup = [];
        }
        grouped.push(msg);
      }
    }
    
    if (currentGroup.length > 0) {
      grouped.push(currentGroup);
    }
    
    return grouped;
  };

  const renderMessage = ({ item }: { item: ChatMessage | ChatMessage[] }) => {
    // Handle grouped parking spots (array of parking spot messages)
    if (Array.isArray(item) && item.length > 0 && item[0].parkingSpot) {
      return (
        <ParkingSpotsSlider
          spots={item}
          onReserve={onReserveSpot}
          onViewDetails={onViewSpotDetails}
        />
      );
    }

    // Handle single message (not an array)
    const singleItem: ChatMessage = Array.isArray(item) ? item[0] : item;

    // Show loading indicator for bot messages when loading
    if (singleItem.id === 'loading') {
      return (
        <View style={[styles.messageContainer, styles.botMessageContainer]}>
          <View style={styles.botAvatar}>
            <SuiLogo width={48} height={72} />
          </View>
          <View style={[styles.messageBubble, styles.botBubble, styles.loadingBubble]}>
            <LoadingDots />
          </View>
        </View>
      );
    }

    // Debug log for parking spot messages
    if (singleItem.parkingSpot) {
      console.log('🎯 Rendering parking spot message:', singleItem.parkingSpot);
    }

    // For single parking spot message, use full-width container without avatar
    if (singleItem.parkingSpot) {
      const screenWidth = Dimensions.get('window').width;
      return (
        <View style={[styles.parkingSpotContainer, { width: screenWidth }]}>
          <View
            style={[
              styles.parkingSpotMessageBubble,
              styles.parkingSpotBubble,
              { width: screenWidth },
            ]}
          >
            <ParkingSpotMessage
              spot={singleItem.parkingSpot}
              onReserve={onReserveSpot}
              onViewDetails={onViewSpotDetails}
            />
          </View>
        </View>
      );
    }

    return (
      <View
        style={[
          styles.messageContainer,
          singleItem.isUser ? styles.userMessageContainer : styles.botMessageContainer,
        ]}
      >
        {!singleItem.isUser && (
          <View style={styles.botAvatar}>
            <SuiLogo width={48} height={72} />
          </View>
        )}
        <View
          style={[
            styles.messageBubble,
            singleItem.isUser ? styles.userBubble : styles.botBubble,
          ]}
        >
          <Text
            style={[
              styles.messageText,
              singleItem.isUser ? styles.userMessageText : styles.botMessageText,
            ]}
          >
            {singleItem.text}
          </Text>
        </View>
      </View>
    );
  };

  // Add loading message when loading (only if not already present)
  const hasLoadingMessage = messages.some(m => m.id === 'loading');
  const displayMessages = isLoading && !hasLoadingMessage
    ? [{ id: 'loading', text: '', isUser: false, timestamp: new Date() }, ...messages]
    : !isLoading && hasLoadingMessage
    ? messages.filter(m => m.id !== 'loading') // Remove loading message when done
    : messages;

  // Group consecutive parking spots together
  const groupedMessages = groupParkingSpots(displayMessages);

  // Auto-scroll to bottom when new messages arrive or loading state changes
  useEffect(() => {
    if (groupedMessages.length > 0 && flatListRef.current) {
      setTimeout(() => {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 100);
    }
  }, [groupedMessages.length, isLoading]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <FlatList
        ref={flatListRef}
        data={groupedMessages}
        renderItem={renderMessage}
        keyExtractor={(item, index) => {
          if (Array.isArray(item)) {
            return `parking-group-${item.map(m => m.id).join('-')}`;
          }
          return item.id || `msg-${index}`;
        }}
        contentContainerStyle={styles.messagesList}
        inverted
        style={styles.messagesContainer}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      />
      <View style={styles.inputContainer}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            value={inputText}
            onChangeText={setInputText}
            placeholder={placeholder}
            placeholderTextColor={SuiTheme.text.light}
            multiline
            maxLength={500}
            editable={!isLoading}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <TouchableOpacity
            style={[styles.sendButton, (!inputText.trim() || isLoading) && styles.sendButtonDisabled]}
            onPress={handleSend}
            disabled={!inputText.trim() || isLoading}
            activeOpacity={0.8}
          >
            {(!inputText.trim() || isLoading) ? (
              <Text style={styles.sendButtonText}>→</Text>
            ) : (
              <LinearGradient
                colors={getGradientColors('primary')}
                style={styles.sendButtonGradient}
              >
                <Text style={styles.sendButtonText}>→</Text>
              </LinearGradient>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SuiTheme.background.secondary,
  },
  messagesContainer: {
    flex: 1,
    flexGrow: 1,
  },
  messagesList: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 20,
    flexGrow: 1,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  userMessageContainer: {
    justifyContent: 'flex-end',
  },
  botMessageContainer: {
    justifyContent: 'flex-start',
  },
  parkingSpotsSliderContainer: {
    width: '100%',
    marginBottom: 16,
    marginLeft: -16,
    marginRight: -16,
    paddingLeft: 0,
    paddingRight: 0,
    alignSelf: 'stretch',
  },
  parkingSpotsSliderContent: {
    paddingHorizontal: 16,
  },
  parkingSpotContainer: {
    marginRight: 16,
    alignSelf: 'flex-start',
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: SuiTheme.border.medium,
  },
  paginationDotActive: {
    backgroundColor: SuiTheme.primary.main,
    width: 24,
  },
  botAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    marginBottom: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  botAvatarText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  messageBubble: {
    maxWidth: '80%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    minHeight: 40,
  },
  parkingSpotMessageBubble: {
    width: '100%',
    maxWidth: '100%',
    alignSelf: 'stretch',
  },
  userBubble: {
    backgroundColor: SuiTheme.primary.main,
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
    shadowColor: SuiTheme.primary.main,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  botBubble: {
    backgroundColor: '#FFFFFF', // White background for bot messages
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    shadowColor: SuiTheme.primary.main,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
    borderWidth: 1,
    borderColor: SuiTheme.primary.lighter,
  },
  loadingBubble: {
    paddingVertical: 16,
    paddingHorizontal: 22,
    minWidth: 65,
  },
  parkingSpotBubble: {
    width: '100%',
    maxWidth: '100%',
    padding: 0,
    backgroundColor: '#FFFFFF', // White background for parking spot bubbles
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: SuiTheme.primary.main,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: SuiTheme.primary.lighter,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0.2,
  },
  userMessageText: {
    color: '#fff',
  },
  botMessageText: {
    color: SuiTheme.text.primary,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 2,
  },
  loadingDot: {
    fontSize: 11,
    color: SuiTheme.primary.main,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  parkingSpotMessage: {
    padding: 20,
    width: '100%',
  },
  spotHeader: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: SuiTheme.primary.lighter,
  },
  spotTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  spotIconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: SuiTheme.primary.light,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: SuiTheme.primary.main,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  spotIcon: {
    fontSize: 20,
  },
  spotName: {
    fontSize: 19,
    fontWeight: '700',
    color: SuiTheme.text.primary,
    flex: 1,
    letterSpacing: -0.2,
  },
  trustedBadge: {
    backgroundColor: SuiTheme.success,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: SuiTheme.success,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
    elevation: 3,
  },
  trustedBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  spotInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 10,
  },
  spotInfoItem: {
    flex: 1,
    backgroundColor: SuiTheme.background.cardLight,
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: SuiTheme.primary.lighter,
    minHeight: 80,
    justifyContent: 'center',
    shadowColor: SuiTheme.primary.main,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  spotInfoIcon: {
    fontSize: 20,
    marginBottom: 6,
  },
  spotInfoLabel: {
    fontSize: 11,
    color: SuiTheme.text.secondary,
    marginTop: 4,
    fontWeight: '500',
    textAlign: 'center',
  },
  spotInfoValue: {
    fontSize: 16,
    fontWeight: '700',
    color: SuiTheme.text.primary,
    marginTop: 2,
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  spotReputation: {
    marginBottom: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: SuiTheme.primary.lighter,
  },
  reputationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  reputationLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  reputationLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: SuiTheme.text.primary,
  },
  reputationScore: {
    fontSize: 13,
    color: SuiTheme.text.secondary,
    fontWeight: '500',
  },
  reputationBarContainer: {
    marginBottom: 8,
  },
  reputationBar: {
    height: 6,
    backgroundColor: SuiTheme.primary.lighter,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4,
  },
  reputationBarFill: {
    height: '100%',
    backgroundColor: SuiTheme.primary.main,
    borderRadius: 3,
  },
  reputationText: {
    fontSize: 14,
    color: SuiTheme.text.primary,
    fontWeight: '500',
  },
  spotStats: {
    fontSize: 12,
    color: SuiTheme.text.secondary,
    fontWeight: '500',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
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
    color: SuiTheme.text.primary,
  },
  loadingText: {
    fontSize: 14,
    color: SuiTheme.text.secondary,
  },
  noRatingText: {
    fontSize: 14,
    color: SuiTheme.text.light,
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  spotAddressContainer: {
    marginBottom: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: SuiTheme.primary.lighter,
  },
  spotAddressLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: SuiTheme.text.secondary,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  spotAddress: {
    fontSize: 14,
    color: SuiTheme.text.primary,
    lineHeight: 20,
    fontWeight: '500',
  },
  spotActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 4,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: SuiTheme.primary.lighter,
  },
  reserveButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: SuiTheme.primary.dark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 5,
    overflow: 'hidden',
  },
  reserveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  detailsButton: {
    flex: 1,
    backgroundColor: SuiTheme.background.card,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: SuiTheme.primary.main,
  },
  detailsButtonText: {
    color: SuiTheme.primary.main,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  reserveButtonGradient: {
    flex: 1,
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: SuiTheme.primary.lighter,
    backgroundColor: SuiTheme.background.cardLight,
    shadowColor: SuiTheme.primary.main,
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 5,
    paddingBottom: Platform.OS === 'ios' ? 8 : 12,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: SuiTheme.primary.lighter,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxHeight: 100,
    fontSize: 16,
    backgroundColor: SuiTheme.background.primary,
    color: SuiTheme.text.primary,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: SuiTheme.primary.main,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: SuiTheme.primary.main,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  sendButtonDisabled: {
    backgroundColor: SuiTheme.border.medium,
    shadowOpacity: 0,
    elevation: 0,
  },
  sendButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },
  sendButtonGradient: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
