import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SimpleChat, ChatMessage as SimpleChatMessage } from '../components/SimpleChat';
import { processUserMessage } from '../services/chatService';
import { getSuiBalance } from '../services/zkLoginService';
import type { ParkingSpotCard, UserType } from '../types';
import { SuiTheme } from '../config/theme';
import { SuiLogo } from '../components/SuiLogo';

interface ChatScreenProps {
  onReserveSlot: (spot: ParkingSpotCard) => void;
  onViewDetails: (spot: ParkingSpotCard) => void;
  userAddress?: string | null;
  userType?: UserType | null;
  onLogout?: () => void;
  onToggleSidebar?: () => void;
  isProfileComplete?: boolean;
  messages?: SimpleChatMessage[];
  onMessagesChange?: (messages: SimpleChatMessage[]) => void;
}

export const ChatScreen: React.FC<ChatScreenProps> = ({
  onReserveSlot,
  onViewDetails,
  userAddress,
  userType,
  onLogout,
  onToggleSidebar,
  isProfileComplete = false,
  messages: externalMessages,
  onMessagesChange,
}) => {
  // Use external messages if provided, otherwise use internal state
  const [internalMessages, setInternalMessages] = useState<SimpleChatMessage[]>([]);
  const messages = externalMessages !== undefined ? externalMessages : internalMessages;
  const messagesRef = useRef<SimpleChatMessage[]>([]); // Keep ref in sync with messages for conversation history
  
  // Helper function to update messages (handles both external and internal state)
  const setMessages = useCallback((updater: SimpleChatMessage[] | ((prev: SimpleChatMessage[]) => SimpleChatMessage[])) => {
    if (onMessagesChange) {
      // External state - need to get current value and apply updater
      const currentMessages = externalMessages !== undefined ? externalMessages : internalMessages;
      const newMessages = typeof updater === 'function' ? updater(currentMessages) : updater;
      onMessagesChange(newMessages);
    } else {
      // Internal state - can use updater function directly
      setInternalMessages(updater);
    }
  }, [externalMessages, internalMessages, onMessagesChange]);
  const [isLoading, setIsLoading] = useState(false);
  const [recommendedSpot, setRecommendedSpot] = useState<ParkingSpotCard | null>(null);
  const [suiBalance, setSuiBalance] = useState<number | null>(null);
  const [hasInitialized, setHasInitialized] = useState(false);
  const [currentSearchRadius, setCurrentSearchRadius] = useState<number>(5000); // Track current search radius (5km default)
  const [lastLocationQuery, setLastLocationQuery] = useState<string>(''); // Track last location for "more" requests
  
  // Constants for conversation management
  // MAX_MESSAGES_IN_CHAT: Maximum messages stored in chat UI (oldest are automatically removed)
  // CONVERSATION_HISTORY_WINDOW: Number of recent messages sent to AI for context (to avoid token limits)
  const MAX_MESSAGES_IN_CHAT = 100; // Keep last 100 messages in UI
  const CONVERSATION_HISTORY_WINDOW = 10; // Send last 10 messages to AI for context

  // Sync messagesRef with messages whenever messages change
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    // Only initialize welcome message if messages array is empty (first mount or after New Chat)
    // This prevents resetting messages when navigating back from other screens
    if (messages.length === 0 && messagesRef.current.length === 0) {
      const welcomeMessage = {
        id: '1',
        text: "Hi! I'm your parking assistant. Where do you need parking today?",
        isUser: false,
        timestamp: new Date(),
      };
      setMessages([welcomeMessage]);
      messagesRef.current = [welcomeMessage]; // Sync ref
    }
  }, []); // Empty deps - only run on mount

  // Fetch SUI balance when userAddress is available
  useEffect(() => {
    const fetchBalance = async () => {
      if (userAddress) {
        try {
          const balance = await getSuiBalance(userAddress);
          setSuiBalance(balance);
        } catch (error) {
          console.error('Failed to fetch SUI balance:', error);
          setSuiBalance(null);
        }
      } else {
        setSuiBalance(null);
      }
    };

    fetchBalance();
    // Refresh balance every 30 seconds
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [userAddress]);

  const handleNewChat = useCallback(() => {
    // Reset all state to initial values - completely clear conversation history
    const welcomeMessage = {
      id: '1',
      text: "Hi! I'm your parking assistant. Where do you need parking today?",
      isUser: false,
      timestamp: new Date(),
    };
    setMessages([welcomeMessage]);
    messagesRef.current = [welcomeMessage]; // Clear ref - ensures no old messages are sent to AI
    setRecommendedSpot(null);
    setCurrentSearchRadius(5000); // Reset to default 5km
    setLastLocationQuery(''); // Clear stored location
    setIsLoading(false);
  }, []);

  const handleSendMessage = useCallback(async (text: string) => {
    // Add user message immediately
    const userMessage: SimpleChatMessage = {
      id: Date.now().toString(),
      text,
      isUser: true,
      timestamp: new Date(),
    };
    
    // Add message and cleanup old messages if we exceed MAX_MESSAGES_IN_CHAT
    setMessages((prev) => {
      const newMessages = [userMessage, ...prev];
      // Keep only the most recent MAX_MESSAGES_IN_CHAT messages
      const finalMessages = newMessages.length > MAX_MESSAGES_IN_CHAT 
        ? newMessages.slice(0, MAX_MESSAGES_IN_CHAT)
        : newMessages;
      messagesRef.current = finalMessages; // Sync ref with latest messages
      return finalMessages;
    });
    setRecommendedSpot(null);
    
    // Set loading state immediately to show loading indicator
    setIsLoading(true);

    try {
      // Prepare conversation history (last CONVERSATION_HISTORY_WINDOW messages, excluding the current one)
      // Format: [{ text: string, is_user: boolean }]
      // Note: messages are in reverse order (newest first), so we take the first N and reverse them
      // IMPORTANT: Use messagesRef.current to get the latest messages state, not closure value
      // Also exclude the welcome message (id: '1') from conversation history
      const currentMessages = messagesRef.current;
      const actualMessages = currentMessages.filter(msg => msg.id !== '1' && msg.id !== userMessage.id); // Exclude welcome and current user message
      const conversationHistory = actualMessages
        .slice(0, CONVERSATION_HISTORY_WINDOW) // Take last N messages (they're in reverse order, newest first)
        .reverse() // Reverse to chronological order (oldest first)
        .map(msg => ({
          text: msg.text,
          is_user: msg.isUser,
        }))
        .filter(msg => msg.text.trim() !== ''); // Filter out empty messages
      
      // Check if this is a "more" request - if so, use stored location and expand radius
      const isMoreRequest = /more|show me more|recommend more|give me more|more options|more please/i.test(text);
      
      // If it's a more request and we have a stored location, prepend it to the message
      let messageToProcess = text;
      if (isMoreRequest && lastLocationQuery) {
        // Prepend location to help AI understand context
        messageToProcess = `${lastLocationQuery}. ${text}`;
      }
      
      const result = await processUserMessage(messageToProcess, 'testnet', currentSearchRadius, conversationHistory);
      
      // Simple logic: always keep radius at 5km (no expansion needed)
      // The "more" request will return all slots within 5km via AI logic
      if (!result.needsClarification && !result.isMoreRequest) {
        // Reset to 5km for new searches
        setCurrentSearchRadius(5000);
      }
      // Note: For "more" requests, radius stays at 5km - AI will return all slots
      
      // Store location query from parsed intent (we'll need to parse it first)
      // For now, we'll extract it from successful results by parsing the intent again
      // In a production app, you might want to return location_query from processUserMessage
      if (!result.needsClarification && !result.isMoreRequest) {
        // Try to extract location from message for storage
        // This is a fallback - ideally we'd get it from the parsed intent
        const locationPatterns = [
          /(?:near|at|in|around|close to)\s+([^.!?\d]+?)(?:\s+for|\s+\d|$)/i,
          /park(?:ing)?\s+(?:near|at|in|around|close to)\s+([^.!?\d]+?)(?:\s+for|\s+\d|$)/i,
        ];
        
        for (const pattern of locationPatterns) {
          const match = text.match(pattern);
          if (match && match[1]) {
            const location = match[1].trim();
            if (location.length > 2 && location.length < 50) {
              setLastLocationQuery(location);
              break;
            }
          }
        }
      }
      
      // Add AI response message
      const aiMessage: SimpleChatMessage = {
        id: (Date.now() + 1).toString(),
        text: result.message,
        isUser: false,
        timestamp: new Date(),
      };
      setMessages((prev) => {
        const newMessages = [aiMessage, ...prev];
        // Keep only the most recent MAX_MESSAGES_IN_CHAT messages
        const finalMessages = newMessages.length > MAX_MESSAGES_IN_CHAT
          ? newMessages.slice(0, MAX_MESSAGES_IN_CHAT)
          : newMessages;
        messagesRef.current = finalMessages; // Sync ref
        return finalMessages;
      });

      // Add recommended spots (can be multiple now)
      if (result.recommendedSlots && result.recommendedSlots.length > 0) {
        console.log(`✅ Adding ${result.recommendedSlots.length} recommended slots to chat`);
        // Add each recommended slot as a separate message
        result.recommendedSlots.forEach((spot, index) => {
          const spotMessage: SimpleChatMessage = {
            id: `${Date.now() + 2 + index}`,
            text: '', // Empty text, parking spot will be rendered
            isUser: false,
            timestamp: new Date(),
            parkingSpot: spot,
          };
          setMessages((prev) => {
            const newMessages = [spotMessage, ...prev];
            const finalMessages = newMessages.length > MAX_MESSAGES_IN_CHAT
              ? newMessages.slice(0, MAX_MESSAGES_IN_CHAT)
              : newMessages;
            messagesRef.current = finalMessages; // Sync ref
            return finalMessages;
          });
        });
        setRecommendedSpot(result.recommendedSlots[0]); // Set first as primary
      } else if (result.recommendedSlot) {
        // Fallback to single slot for backward compatibility
        console.log('✅ Adding recommended slot to chat:', result.recommendedSlot);
        const spotMessage: SimpleChatMessage = {
          id: (Date.now() + 2).toString(),
          text: '',
          isUser: false,
          timestamp: new Date(),
          parkingSpot: result.recommendedSlot,
        };
        setMessages((prev) => {
          const newMessages = [spotMessage, ...prev];
          const finalMessages = newMessages.length > MAX_MESSAGES_IN_CHAT
            ? newMessages.slice(0, MAX_MESSAGES_IN_CHAT)
            : newMessages;
          messagesRef.current = finalMessages; // Sync ref
          return finalMessages;
        });
        setRecommendedSpot(result.recommendedSlot);
      } else {
        console.log('⚠️ No recommended slots in result:', result);
      }
    } catch (error: any) {
      console.error('Error processing message:', error);
      
      // The error is already handled in processUserMessage with user-friendly messages
      // But if it somehow reaches here, show a friendly message
      let errorText = "I'm sorry, something went wrong. Please try again.";
      
      if (error?.message) {
        const errorMsg = error.message.toLowerCase();
        if (errorMsg.includes('network') || errorMsg.includes('connect') || errorMsg.includes('econnrefused')) {
          errorText = "I couldn't connect to the service. Please check your internet connection.";
        } else if (errorMsg.includes('timeout') || errorMsg.includes('exceeded')) {
          errorText = "The request took too long. Please try again in a moment.";
        } else if (errorMsg.includes('geocod') || errorMsg.includes('zero_results')) {
          errorText = "I couldn't find that location. Could you try rephrasing it? For example: 'near FSEGA' or 'downtown Cluj'.";
        }
      }
      
      const errorMessage: SimpleChatMessage = {
        id: (Date.now() + 2).toString(),
        text: errorText,
        isUser: false,
        timestamp: new Date(),
      };
      setMessages((prev) => {
        const newMessages = [errorMessage, ...prev];
        const finalMessages = newMessages.length > MAX_MESSAGES_IN_CHAT
          ? newMessages.slice(0, MAX_MESSAGES_IN_CHAT)
          : newMessages;
        messagesRef.current = finalMessages; // Sync ref
        return finalMessages;
      });
    } finally {
      setIsLoading(false);
    }
  }, [currentSearchRadius, lastLocationQuery]); // messages removed - using messagesRef.current instead


  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {onToggleSidebar && (
            <TouchableOpacity onPress={onToggleSidebar} style={styles.menuButton}>
              <Text style={styles.menuIcon}>☰</Text>
            </TouchableOpacity>
          )}
          <View style={styles.avatar}>
            <SuiLogo width={48} height={72} />
          </View>
          <View>
            <Text style={styles.headerTitle}>Parking Agent</Text>
            <View style={styles.statusRow}>
              <View style={styles.statusDot} />
              <Text style={styles.headerSubtitle}>Online</Text>
            </View>
          </View>
        </View>
        <View style={styles.headerRight}>
          {userAddress && suiBalance !== null && (
            <LinearGradient
              colors={['#B8F2F5', '#7FE8ED', '#B8F2F5']} // Light turquoise gradient
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.balanceContainer}
            >
              <Text style={styles.balanceText}>{suiBalance.toFixed(2)} SUI</Text>
            </LinearGradient>
          )}
        </View>
      </View>

      {/* New Chat Button */}
      <View style={styles.newChatButtonContainer}>
        <TouchableOpacity
          onPress={handleNewChat}
          style={styles.newChatButton}
          activeOpacity={0.7}
        >
          <Text style={styles.newChatButtonText}>New Chat</Text>
        </TouchableOpacity>
      </View>

      {/* Chat Messages */}
      <SimpleChat
        messages={messages}
        onSend={handleSendMessage}
        isLoading={isLoading}
        placeholder="Where do you need parking?"
        onReserveSpot={(spot) => {
          if (!isProfileComplete) {
            // Show warning message in chat
            const warningMessage: SimpleChatMessage = {
              id: Date.now().toString(),
              text: '⚠️ Please complete your profile first to make reservations. Go to Profile in the menu.',
              isUser: false,
              timestamp: new Date(),
            };
            setMessages((prev) => {
              const newMessages = [warningMessage, ...prev];
              if (newMessages.length > MAX_MESSAGES_IN_CHAT) {
                return newMessages.slice(0, MAX_MESSAGES_IN_CHAT);
              }
              return newMessages;
            });
            return;
          }
          onReserveSlot(spot);
        }}
        onViewSpotDetails={onViewDetails}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: SuiTheme.background.secondary,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: SuiTheme.primary.lighter,
    backgroundColor: SuiTheme.background.cardLight,
    minHeight: 64,
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
    color: SuiTheme.text.primary,
  },
  newChatButtonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    alignItems: 'flex-end',
    backgroundColor: SuiTheme.background.secondary, // Match the main chat background
  },
  newChatButton: {
    backgroundColor: '#32DDE6', // Turquoise - explicit color to ensure it's not white
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    shadowColor: '#32DDE6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  newChatButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1A9399', // Darker turquoise for title
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: SuiTheme.success,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#26B8C0', // Medium turquoise for subtitle
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginLeft: 8,
    flexShrink: 0,
  },
  balanceContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    maxWidth: 140,
    borderWidth: 1.5,
    borderColor: '#7FE8ED', // Light turquoise border
  },
  balanceText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#26B8C0', // Medium turquoise text for better contrast on light gradient
    letterSpacing: 0.1,
  },
});
