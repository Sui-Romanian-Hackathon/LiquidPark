// Wallet Connect Component
// Opens Slush in system browser to avoid Google OAuth blocking
// Slush will redirect back via deep link after connection
import React, { useEffect } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, Modal, ActivityIndicator, Platform, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

interface WalletConnectWebViewProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: (address: string) => void;
  onError: (error: string) => void;
}

// Generate UUID v4
const generateUUID = (): string => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

// Base64 encode JSON (for React Native compatibility)
const jsonToBase64 = (obj: any): string => {
  const jsonString = JSON.stringify(obj);
  
  // Convert string to UTF-8 bytes, then to base64
  // React Native compatible method
  const utf8Bytes: number[] = [];
  for (let i = 0; i < jsonString.length; i++) {
    let charCode = jsonString.charCodeAt(i);
    if (charCode < 0x80) {
      utf8Bytes.push(charCode);
    } else if (charCode < 0x800) {
      utf8Bytes.push(0xc0 | (charCode >> 6));
      utf8Bytes.push(0x80 | (charCode & 0x3f));
    } else if ((charCode & 0xfc00) === 0xd800 && i + 1 < jsonString.length && (jsonString.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      charCode = 0x10000 + ((charCode & 0x03ff) << 10) + (jsonString.charCodeAt(++i) & 0x03ff);
      utf8Bytes.push(0xf0 | (charCode >> 18));
      utf8Bytes.push(0x80 | ((charCode >> 12) & 0x3f));
      utf8Bytes.push(0x80 | ((charCode >> 6) & 0x3f));
      utf8Bytes.push(0x80 | (charCode & 0x3f));
    } else {
      utf8Bytes.push(0xe0 | (charCode >> 12));
      utf8Bytes.push(0x80 | ((charCode >> 6) & 0x3f));
      utf8Bytes.push(0x80 | (charCode & 0x3f));
    }
  }
  
  // Convert bytes to base64
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  while (i < utf8Bytes.length) {
    const a = utf8Bytes[i++];
    const b = i < utf8Bytes.length ? utf8Bytes[i++] : 0;
    const c = i < utf8Bytes.length ? utf8Bytes[i++] : 0;
    const bitmap = (a << 16) | (b << 8) | c;
    result += chars.charAt((bitmap >> 18) & 63) + chars.charAt((bitmap >> 12) & 63) +
              (i - 2 < utf8Bytes.length ? chars.charAt((bitmap >> 6) & 63) : '=') +
              (i - 1 < utf8Bytes.length ? chars.charAt(bitmap & 63) : '=');
  }
  return result;
};

// Generate Slush dapp request URL
// Format: https://my.slush.app/dapp-request#<base64_hash>
// appUrl tells Slush where to redirect after connection (deep link)
const getSlushWalletUrl = (): string => {
  const requestId = generateUUID();
  const appUrl = 'suipark://wallet-callback'; // Deep link for redirect callback
  const appName = 'Parking Agent';
  
  // Get device metadata
  const timestamp = Date.now();
  const { width, height } = Dimensions.get('window');
  const screenResolution = `${width}x${height}`;
  const platform = Platform.OS === 'ios' ? 'iPhone' : Platform.OS === 'android' ? 'Android' : 'unknown';
  const language = 'en-GB';
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Bucharest';
  
  // Build user agent string
  const versionStr = Platform.Version ? String(Platform.Version).replace('.', '_') : '18_7';
  const userAgent = `Mozilla/5.0 (iPhone; CPU iPhone OS ${versionStr} like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 Mobile/15E148 Safari/604.1`;
  
  // Build the hash payload
  const hashPayload = {
    version: '1',
    requestId: requestId,
    appUrl: appUrl, // This tells Slush to redirect here after connection
    appName: appName,
    payload: {
      type: 'connect',
    },
    metadata: {
      version: '1',
      originUrl: appUrl,
      userAgent: userAgent,
      screenResolution: screenResolution,
      language: language,
      platform: platform,
      timezone: timezone,
      timestamp: timestamp,
    },
  };
  
  // Base64 encode the hash payload
  const hash = jsonToBase64(hashPayload);
  
  // Build the dapp request URL with hash in fragment
  const dappRequestUrl = `https://my.slush.app/dapp-request#${hash}`;
  
  return dappRequestUrl;
};

export const WalletConnectWebView: React.FC<WalletConnectWebViewProps> = ({
  visible,
  onClose,
  onSuccess,
  onError,
}) => {
  const [isOpening, setIsOpening] = React.useState(false);

  // Open Slush in system browser when modal becomes visible
  // System browser avoids Google OAuth blocking
  useEffect(() => {
    if (visible) {
      openSlushInBrowser();
    }
  }, [visible]);
  
  const openSlushInBrowser = async () => {
    try {
      setIsOpening(true);
      const slushUrl = getSlushWalletUrl();
      console.log('[Wallet Connect] Opening Slush in system browser:', slushUrl);
      
      // Open in system browser (not WebView) to avoid Google OAuth blocking
      const result = await WebBrowser.openBrowserAsync(slushUrl, {
        showInRecents: true,
        enableBarCollapsing: false,
        createTask: false,
      });
      
      console.log('[Wallet Connect] Browser result:', result.type);
      setIsOpening(false);
      
      // Deep links are handled via Linking.addEventListener, not through result.url
      // If browser was opened successfully, deep link listener will handle the callback
      // If user cancelled, we can close the modal (though result.type will be OPENED or LOCKED, not cancel)
      // Note: Deep link callbacks come through Linking API, not WebBrowser result
    } catch (error) {
      console.error('[Wallet Connect] Error opening browser:', error);
      setIsOpening(false);
      onError('Failed to open Slush wallet. Please try again.');
      onClose();
    }
  };

  // Listen for deep links (callbacks from Slush)
  useEffect(() => {
    const subscription = Linking.addEventListener('url', handleDeepLink);
    
    // Check if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleDeepLink = ({ url }: { url: string }) => {
    console.log('[Wallet Connect] Deep link received:', url);
    
    // Check if this is a callback from Slush with wallet info
    // Slush will redirect to suipark://wallet-callback with wallet info
    if (url.includes('wallet-callback') || url.includes('slush') || url.includes('wallet') || url.includes('callback')) {
      console.log('[Wallet Connect] Processing Slush callback...');
      
      try {
        const urlObj = new URL(url);
        console.log('[Wallet Connect] URL search params:', urlObj.search);
        console.log('[Wallet Connect] URL hash:', urlObj.hash);
        
        // Try multiple parameter names Slush might use
        const address = urlObj.searchParams.get('address') || 
                       urlObj.searchParams.get('wallet') ||
                       urlObj.searchParams.get('account') ||
                       urlObj.searchParams.get('publicKey') ||
                       urlObj.searchParams.get('walletAddress') ||
                       urlObj.searchParams.get('suiAddress');
        
        // Also check hash (Slush might put it in hash)
        let hashAddress = null;
        if (!address && urlObj.hash) {
          const hashParams = new URLSearchParams(urlObj.hash.substring(1));
          hashAddress = hashParams.get('address') || 
                       hashParams.get('wallet') ||
                       hashParams.get('account') ||
                       hashParams.get('publicKey') ||
                       hashParams.get('walletAddress') ||
                       hashParams.get('suiAddress');
        }
        
        const finalAddress = address || hashAddress;
        
        if (finalAddress) {
          console.log('[Wallet Connect] ✅ Found wallet address:', finalAddress);
          onSuccess(finalAddress);
          onClose();
          return;
        }
        
        // Check for Sui address pattern anywhere in URL
        const addressMatch = url.match(/0x[a-fA-F0-9]{64}/);
        if (addressMatch && addressMatch[0]) {
          console.log('[Wallet Connect] ✅ Found address via regex:', addressMatch[0]);
          onSuccess(addressMatch[0]);
          onClose();
          return;
        }
        
        // If we got a callback but no address, log for debugging
        console.warn('[Wallet Connect] ⚠️ Callback received but no address found');
        console.warn('[Wallet Connect] Full URL:', url);
        console.warn('[Wallet Connect] All search params:', Object.fromEntries(urlObj.searchParams));
        
      } catch (e) {
        console.error('[Wallet Connect] Error parsing callback URL:', e);
        // If URL parsing fails, try to extract address from string
        const addressMatch = url.match(/0x[a-fA-F0-9]{64}/);
        if (addressMatch && addressMatch[0]) {
          console.log('[Wallet Connect] ✅ Found address via regex (fallback):', addressMatch[0]);
          onSuccess(addressMatch[0]);
          onClose();
        } else {
          console.error('[Wallet Connect] ❌ Could not extract wallet address from:', url);
        }
      }
    }
  };


  if (!visible) {
    return null;
  }

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.content}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Connect Slush Wallet</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Instructions */}
          <View style={styles.instructionsContainer}>
            {isOpening ? (
              <>
                <ActivityIndicator size="large" color="#667eea" style={styles.spinner} />
                <Text style={styles.instructionText}>Opening Slush Wallet...</Text>
              </>
            ) : (
              <>
                <Text style={styles.instructionTitle}>Connecting Your Wallet</Text>
                <Text style={styles.instructionText}>
                  We're opening Slush Wallet in your browser. Please:
                </Text>
                <View style={styles.stepsContainer}>
                  <Text style={styles.stepText}>1. Sign in with Google (in the browser)</Text>
                  <Text style={styles.stepText}>2. Approve the connection request</Text>
                  <Text style={styles.stepText}>3. Select your account</Text>
                  <Text style={styles.stepText}>4. Return to this app automatically</Text>
                </View>
                <TouchableOpacity 
                  style={styles.openButton}
                  onPress={openSlushInBrowser}
                >
                  <Text style={styles.openButtonText}>Open Slush Wallet</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#00000080',
  },
  content: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    marginTop: 50,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 24,
    color: '#666',
    fontWeight: '300',
  },
  webviewContainer: {
    flex: 1,
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  instructionsContainer: {
    padding: 20,
    alignItems: 'center',
  },
  instructionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  instructionText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  stepsContainer: {
    width: '100%',
    marginBottom: 24,
  },
  stepText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
    paddingLeft: 8,
  },
  spinner: {
    marginBottom: 16,
  },
  openButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  openButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});
