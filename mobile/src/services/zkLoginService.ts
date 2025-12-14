// Ensure crypto polyfill is loaded
import '../config/env';

import { 
  genAddressSeed, 
  getZkLoginSignature, 
  jwtToAddress,
  generateNonce,
  generateRandomness,
} from '@mysten/zklogin';
import { Ed25519Keypair } from '@mysten/sui.js/keypairs/ed25519';
import { SuiClient } from '@mysten/sui.js/client';
import { TransactionBlock } from '@mysten/sui.js/transactions';
import { fromB64 } from '@mysten/sui.js/utils';
import { toBigIntBE } from 'bigint-buffer';
import { Keypair, PublicKey } from '@mysten/sui.js/cryptography';
import axios from 'axios';
import jwt_decode from 'jwt-decode';
import * as SecureStore from 'expo-secure-store';
import { SUI_NETWORK, CONTRACT_ADDRESSES } from '../config';

import { authorize, prefetchConfiguration } from 'react-native-app-auth';
import { Buffer } from '@craftzdog/react-native-buffer';

// Network configuration
const suiClient = new SuiClient({ url: SUI_NETWORK });

// OAuth configuration - same as react-native-zklogin-poc, but with profile and email scopes
const OAUTH_CONFIG = {
  issuer: 'https://accounts.google.com',
  clientId: '70599191792-e7cuqm6pldc8ffp3hg9ie84n4d8u0stm.apps.googleusercontent.com',
  redirectUrl: 'com.googleusercontent.apps.70599191792-e7cuqm6pldc8ffp3hg9ie84n4d8u0stm:/oauth2redirect/google',
  scopes: ['openid', 'profile', 'email'],
      response_type: 'id_token',
};

// Storage keys
const STORAGE_KEYS = {
  EPHEMERAL_KEY: 'zklogin_ephemeral_key',
  MAX_EPOCH: 'zklogin_max_epoch',
  RANDOMNESS: 'zklogin_randomness',
  JWT: 'zklogin_jwt',
  USER_SALT: 'zklogin_user_salt',
  ADDRESS: 'zklogin_address',
  USER_TYPE: 'user_type',
  USER_NAME: 'zklogin_user_name',
  USER_EMAIL: 'zklogin_user_email',
} as const;

export interface AuthState {
  address: string;
  userType: 'driver' | 'parking_owner';
  isAuthenticated: boolean;
  name?: string; // User's name from Google OAuth
  email?: string; // User's email from Google OAuth
}

export interface UserKeyData {
  randomness: string;
  nonce: string;
  ephemeralPublicKeyRaw: string;
  ephemeralPublicKey: string;
  ephemeralPrivateKey: string;
  maxEpoch: number;
}

/**
 * Prepare login - generate ephemeral key pair and nonce (same as react-native-zklogin-poc)
 */
export async function prepareLogin(): Promise<UserKeyData> {
  const { epoch } = await suiClient.getLatestSuiSystemState();

  const maxEpoch = parseInt(epoch) + 30; // Valid for 30 epochs (~1 day)
  const ephemeralKeyPair: Keypair = new Ed25519Keypair();
  const ephemeralPrivateKeyB64 = ephemeralKeyPair.export().privateKey;

  const ephemeralPublicKey: PublicKey = ephemeralKeyPair.getPublicKey();
  const ephemeralPublicKeyB64 = ephemeralPublicKey.toBase64();
  const ephemeralPublicKeySuiB64 = ephemeralPublicKey.toSuiPublicKey();

  const jwt_randomness = generateRandomness();
  // @ts-ignore - old SDK version
  const nonce = generateNonce(ephemeralPublicKey, maxEpoch, jwt_randomness);

  const userKeyData: UserKeyData = {
    randomness: jwt_randomness.toString(),
    nonce: nonce,
    ephemeralPublicKeyRaw: ephemeralPublicKeySuiB64,
    ephemeralPublicKey: ephemeralPublicKeyB64,
    ephemeralPrivateKey: ephemeralPrivateKeyB64,
    maxEpoch: maxEpoch
  };

  console.log("userKeyData", userKeyData);
  
  // Store ephemeral key data
  await SecureStore.setItemAsync(STORAGE_KEYS.EPHEMERAL_KEY, ephemeralPrivateKeyB64);
  await SecureStore.setItemAsync(STORAGE_KEYS.MAX_EPOCH, maxEpoch.toString());
  await SecureStore.setItemAsync(STORAGE_KEYS.RANDOMNESS, jwt_randomness.toString());

  return userKeyData;
}

/**
 * Get salt from Mysten API (same as react-native-zklogin-poc)
 */
export async function getSaltFromMystenAPI(jwtEncoded: string): Promise<string> {
  try {
    const url = "https://salt.api.mystenlabs.com/get_salt";
    const payload = { token: jwtEncoded };
    const res = await axios.post(url, payload);
    
    if (!res.data || typeof res.data.salt !== 'string') {
      console.error('Invalid salt response:', res.data);
      throw new Error('Bad response format: Invalid salt response from API');
    }
    
    return res.data.salt;
  } catch (error: any) {
    if (error.response) {
      console.error('Salt API error response:', error.response.status, error.response.data);
      throw new Error(`Bad response format: Salt API returned ${error.response.status}`);
    }
    if (error.message?.includes('Bad response format')) {
      throw error;
    }
    throw new Error(`Bad response format: ${error.message || 'Failed to get salt'}`);
  }
}

/**
 * Get ZK proof from Mysten API (same as react-native-zklogin-poc)
 */
export async function getZNPFromMystenAPI(
  jwtToken: string,
  salt: string,
  userKeyData: UserKeyData
): Promise<any> {
  try {
    const url = "https://prover.mystenlabs.com/v1";
    const decodedJwt: any = jwt_decode(jwtToken);

    const ephemeralPublicKeyArray: Uint8Array = fromB64(userKeyData.ephemeralPublicKey);

    const zkpPayload = {
      jwt: jwtToken,
      extendedEphemeralPublicKey: toBigIntBE(
        // @ts-ignore - Buffer polyfill for React Native
        Buffer.from(ephemeralPublicKeyArray),
      ).toString(),
      jwtRandomness: userKeyData.randomness,
      maxEpoch: userKeyData.maxEpoch,
      salt: salt,
      keyClaimName: "sub"
    };

    const proofResponse = await axios.post(url, zkpPayload);
    
    if (!proofResponse?.data) {
      console.error('Invalid proof response:', proofResponse);
      throw new Error('Bad response format: Invalid proof response from API');
    }
    
    return proofResponse.data;
  } catch (error: any) {
    if (error.response) {
      console.error('Prover API error response:', error.response.status, error.response.data);
      throw new Error(`Bad response format: Prover API returned ${error.response.status}`);
    }
    if (error.message?.includes('Bad response format')) {
      throw error;
    }
    throw new Error(`Bad response format: ${error.message || 'Failed to get ZK proof'}`);
  }
}

/**
 * Execute OAuth login flow using react-native-app-auth (same as react-native-zklogin-poc)
 */
export async function doZkLogin(userType: 'driver' | 'parking_owner'): Promise<AuthState> {
  try {
    console.log('Starting zkLogin flow for user type:', userType);
    console.log('OAuth redirect URL:', OAUTH_CONFIG.redirectUrl);
    
    // Prepare login - generate ephemeral key pair and nonce
    const suiConst = await prepareLogin();
    console.log('Prepared login with nonce:', suiConst.nonce);

    // Configure OAuth with nonce
    const configuration = {
      warmAndPrefetchChrome: true,
      connectionTimeoutSeconds: 10, // Increased timeout
      ...OAUTH_CONFIG,
    };
    
    try {
      await prefetchConfiguration(configuration);
      console.log('OAuth configuration prefetched successfully');
    } catch (prefetchError) {
      console.warn('Prefetch failed, continuing anyway:', prefetchError);
    }

    const config = {
      ...OAUTH_CONFIG,
      useNonce: false,
      additionalParameters: {
        nonce: suiConst.nonce,
      },
      connectionTimeoutSeconds: 30, // Increased timeout for OAuth flow
      iosPrefersEphemeralSession: false, // Set to false to keep session alive
      prefersEphemeralWebBrowserSession: false, // Set to false to keep session alive
      skipCodeExchange: false,
    };
    
    console.log('Starting OAuth authorization...');
    console.log('OAuth config:', JSON.stringify(config, null, 2));

    // Authorize with Google OAuth
    let newAuthState;
    try {
      console.log('Calling authorize()...');
      newAuthState = await authorize(config);
      console.log('Authorize completed successfully');
    } catch (authError: any) {
      console.error('OAuth authorization error:', authError);
      console.error('Error type:', typeof authError);
      console.error('Error keys:', Object.keys(authError || {}));
      
      // Handle specific OAuth errors
      const errorMessage = authError?.message || authError?.toString() || 'Unknown error';
      
      if (errorMessage.includes('User cancelled') || errorMessage.includes('canceled') || errorMessage.includes('cancelled')) {
        throw new Error('Login cancelled by user');
      }
      if (errorMessage.includes('redirect') || errorMessage.includes('URL')) {
        throw new Error('OAuth redirect failed. Please check your URL scheme configuration in Info.plist.');
      }
      if (errorMessage.includes('network') || errorMessage.includes('timeout')) {
        throw new Error('Network error during authentication. Please check your internet connection.');
      }
      
      throw new Error(`OAuth failed: ${errorMessage}`);
    }

    if (!newAuthState || !newAuthState.idToken) {
      throw new Error('OAuth completed but no ID token received');
    }

    console.log('Google auth jwt :', newAuthState.idToken);
    console.log('From SUI const :', suiConst);

    const decodedJwt: any = jwt_decode(newAuthState.idToken);
    console.log('Google auth response.nonce :', decodedJwt.nonce);
    console.log('Google auth user info:', {
      name: decodedJwt.name,
      email: decodedJwt.email,
      given_name: decodedJwt.given_name,
      family_name: decodedJwt.family_name,
    });

    // Verify nonce matches
    if (decodedJwt.nonce !== suiConst.nonce) {
      throw new Error('Mismatching Google nonce! Your auth try was probably spoofed');
    }

    console.log("Google JWT response:", newAuthState.idToken);
    
    // Extract user name and email from JWT
    const userName = decodedJwt.name || decodedJwt.given_name || decodedJwt.email || 'User';
    const userEmail = decodedJwt.email || '';

    // zkLogin Flow - get salt
    const salt = await getSaltFromMystenAPI(newAuthState.idToken);
    console.log("Salt:", salt);

    // Get ZK proof
    const zkp = await getZNPFromMystenAPI(newAuthState.idToken, salt, suiConst);
    const address = jwtToAddress(newAuthState.idToken, BigInt(salt));
    console.log("ZKP:", zkp, 'my Address:', address);

    // Store JWT and address
    await SecureStore.setItemAsync(STORAGE_KEYS.JWT, newAuthState.idToken);
    await SecureStore.setItemAsync(STORAGE_KEYS.USER_SALT, salt.toString());
    await SecureStore.setItemAsync(STORAGE_KEYS.ADDRESS, address);
    await SecureStore.setItemAsync(STORAGE_KEYS.USER_TYPE, userType);
    await SecureStore.setItemAsync(STORAGE_KEYS.USER_NAME, userName);
    await SecureStore.setItemAsync(STORAGE_KEYS.USER_EMAIL, userEmail);

    return {
      address,
      userType,
      isAuthenticated: true,
      name: userName,
      email: userEmail,
    };
  } catch (error: any) {
    console.error('zkLogin error:', error);
    console.error('Error stack:', error?.stack);
    console.error('Error message:', error?.message);
    
    // Provide more helpful error messages
    if (error?.message?.includes('redirect') || error?.message?.includes('URL')) {
      throw new Error('OAuth redirect failed. Please ensure your app\'s URL scheme is properly configured in Xcode.');
    }
    if (error?.message?.includes('network') || error?.message?.includes('timeout')) {
      throw new Error('Network error during authentication. Please check your internet connection.');
    }
    if (error?.message?.includes('User cancelled') || error?.message?.includes('canceled')) {
      throw new Error('Login cancelled by user');
    }
    
    throw error;
  }
}

/**
 * Execute a transaction with zkLogin signature
 */
export async function executeZkLoginTransaction(
  txb: TransactionBlock,
  userAddress: string
): Promise<{ digest: string; events?: any[]; objectChanges?: any[] }> {
  // Temporarily override console.error to filter out "already registered" errors
  const originalConsoleError = console.error;
  const errorFilter = (message: any, ...args: any[]) => {
    const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
    const argsStr = args.map(arg => typeof arg === 'string' ? arg : JSON.stringify(arg)).join(' ');
    const fullMessage = messageStr + ' ' + argsStr;
    
    // Check if this is an "already registered" error
    const isAlreadyRegisteredError = (
      fullMessage.includes('register_user') && 
      (fullMessage.includes('", 2)') || fullMessage.includes(', 2)') || fullMessage.includes('error code: 2')) &&
      (fullMessage.includes('MoveAbort') || fullMessage.includes('Dry run failed'))
    );
    
    // Don't log "already registered" errors
    if (!isAlreadyRegisteredError) {
      originalConsoleError(message, ...args);
    }
  };
  
  // Override console.error temporarily
  console.error = errorFilter as any;
  
  try {
    const zkLoginSignature = await getZkLoginSignatureForTransaction(txb, userAddress);
    
    // Build transaction bytes (old SDK version)
    txb.setSender(userAddress);
    // @ts-ignore - old SDK version returns bytes directly
    const txBytes = await txb.build({ client: suiClient });
    
    // Execute transaction with zkLogin signature
    const result = await suiClient.executeTransactionBlock({
      transactionBlock: txBytes,
      signature: zkLoginSignature,
      options: {
        showEffects: true,
        showObjectChanges: true,
        showEvents: true,
      },
    });
    
    // Check if transaction was successful
    if (result.effects?.status?.status !== 'success') {
      const errorMsg = result.effects?.status?.error || 'Transaction failed';
      const errorString = JSON.stringify(result.effects?.status);
      
      // Check if this is an "already registered" error BEFORE logging
      // Check multiple patterns to catch all variations
      const isAlreadyRegisteredError = (
        (errorMsg.includes('MoveAbort') && (errorString.includes('", 2)') || errorString.includes(', 2)')) && errorMsg.includes('register_user')) ||
        (errorMsg.includes('Dry run failed') && errorMsg.includes('register_user') && (errorString.includes('", 2)') || errorString.includes(', 2)') || errorString.includes('error code: 2'))) ||
        (errorMsg.includes('error code: 2') && errorMsg.includes('register_user')) ||
        errorString.includes('EAlreadyRegistered') ||
        (errorString.includes('register_user') && (errorString.includes('", 2)') || errorString.includes(', 2)')))
      );
      
      if (isAlreadyRegisteredError) {
        // Create a special error that can be caught and handled silently
        const alreadyRegisteredError: any = new Error('User already registered');
        alreadyRegisteredError.isAlreadyRegistered = true;
        alreadyRegisteredError.name = 'AlreadyRegisteredError';
        throw alreadyRegisteredError;
      }
      
      // Only log real errors
      console.error('[executeZkLoginTransaction] Transaction failed:', errorMsg);
      throw new Error(`Transaction failed: ${errorMsg}`);
    }
    
    return { 
      digest: result.digest || result.effects?.transactionDigest || '',
      events: result.events,
      objectChanges: result.objectChanges,
    };
  } catch (error: any) {
    // If it's already our special error, just re-throw it
    if (error?.isAlreadyRegistered === true || error?.name === 'AlreadyRegisteredError') {
      throw error;
    }
    
    const errorMessage = error.message || '';
    const errorString = JSON.stringify(error);
    
    // Check if this is an "already registered" error (error code 2 for register_user)
    // This is an expected error and shouldn't be logged as ERROR
    // Check multiple patterns to catch all variations
    const isAlreadyRegisteredError = (
      (errorMessage.includes('MoveAbort') && (errorString.includes('", 2)') || errorString.includes(', 2)')) && errorMessage.includes('register_user')) ||
      (errorMessage.includes('Dry run failed') && errorMessage.includes('register_user') && (errorString.includes('", 2)') || errorString.includes(', 2)') || errorString.includes('error code: 2'))) ||
      (errorMessage.includes('error code: 2') && errorMessage.includes('register_user')) ||
      errorString.includes('EAlreadyRegistered') ||
      (errorMessage.includes('2') && errorMessage.includes('register_user') && (errorMessage.includes('reputation') || errorString.includes('reputation'))) ||
      (errorString.includes('register_user') && errorString.includes('", 2)')) ||
      (errorString.includes('register_user') && errorString.includes(', 2)'))
    );
    
    if (isAlreadyRegisteredError) {
      // Create a special error that can be caught and handled silently
      const alreadyRegisteredError: any = new Error('User already registered');
      alreadyRegisteredError.isAlreadyRegistered = true;
      alreadyRegisteredError.name = 'AlreadyRegisteredError';
      // Don't log as error, throw special error that will be caught in registerUser
      throw alreadyRegisteredError;
    }
    
    // Log other errors normally
    console.error('[executeZkLoginTransaction] Error:', error);
    console.error('[executeZkLoginTransaction] Error details:', JSON.stringify(error, null, 2));
    
    // Provide more helpful error messages
    if (error.message?.includes('Bad response format')) {
      throw new Error('Transaction execution failed. Please check your network connection and try again.');
    }
    
    throw error;
  } finally {
    // Restore original console.error
    console.error = originalConsoleError;
  }
}

/**
 * Get ZK proof and signature for transaction signing
 */
export async function getZkLoginSignatureForTransaction(
  txb: TransactionBlock,
  userAddress: string
): Promise<string> {
  const jwt = await SecureStore.getItemAsync(STORAGE_KEYS.JWT);
  const userSalt = await SecureStore.getItemAsync(STORAGE_KEYS.USER_SALT);
  const maxEpochStr = await SecureStore.getItemAsync(STORAGE_KEYS.MAX_EPOCH);
  const randomnessStr = await SecureStore.getItemAsync(STORAGE_KEYS.RANDOMNESS);
  const ephemeralKeySecret = await SecureStore.getItemAsync(STORAGE_KEYS.EPHEMERAL_KEY);

  if (!jwt || !userSalt || !maxEpochStr || !randomnessStr || !ephemeralKeySecret) {
    throw new Error('Missing authentication data. Please login again.');
  }

    const maxEpoch = Number(maxEpochStr);
    const jwtRandomness = BigInt(randomnessStr);
    
  // Restore ephemeral key pair (same as react-native-zklogin-poc)
  let ephemeralKeyPairArray = Uint8Array.from(Array.from(fromB64(ephemeralKeySecret)));
  const ephemeralKeyPair = Ed25519Keypair.fromSecretKey(ephemeralKeyPairArray);

  // Get extended ephemeral public key (old SDK version - manual calculation)
  const ephemeralPublicKey = ephemeralKeyPair.getPublicKey();
  const ephemeralPublicKeyBytes = ephemeralPublicKey.toRawBytes();
  // @ts-ignore - Buffer polyfill for React Native
  const extendedEphemeralPublicKey = toBigIntBE(
    // @ts-ignore
    Buffer.from(ephemeralPublicKeyBytes)
  );

  // Decode JWT to get sub and aud
    const jwtParts = jwt.split('.');
    if (jwtParts.length !== 3) {
      throw new Error('Invalid JWT format');
    }
    const payload = JSON.parse(
      atob(jwtParts[1].replace(/-/g, '+').replace(/_/g, '/'))
    );
    const decodedSub = payload.sub;
    const decodedAud = Array.isArray(payload.aud) ? payload.aud[0] : payload.aud;

    // Get ZK proof from prover service
  const proofResponse = await fetch('https://prover.mystenlabs.com/v1', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jwt,
        extendedEphemeralPublicKey: extendedEphemeralPublicKey.toString(),
        maxEpoch: maxEpoch.toString(),
        jwtRandomness: jwtRandomness.toString(),
        salt: userSalt,
        keyClaimName: 'sub',
      }),
    });

    if (!proofResponse.ok) {
      const errorText = await proofResponse.text();
      console.error('Prover error:', errorText);
      throw new Error(`Bad response format: Failed to get ZK proof - ${errorText}`);
    }

    let proofData;
    try {
      proofData = await proofResponse.json();
      if (!proofData) {
        throw new Error('Bad response format: Empty proof response');
      }
    } catch (parseError: any) {
      console.error('Failed to parse proof response:', parseError);
      throw new Error(`Bad response format: Invalid JSON response from prover`);
    }

    // Sign transaction with ephemeral key
    txb.setSender(userAddress);
    
  // Sign the transaction using the ephemeral key pair (old SDK version)
  const signatureWithBytes = await txb.sign({ 
      client: suiClient,
    signer: ephemeralKeyPair 
    });
  const userSignature = signatureWithBytes.signature;

  // Generate address seed
    const addressSeed = genAddressSeed(
      BigInt(userSalt),
      'sub',
      decodedSub,
      decodedAud,
    ).toString();

    // Get ZK login signature
    const zkLoginSignature = getZkLoginSignature({
      inputs: {
        ...proofData,
        addressSeed,
      },
      maxEpoch,
      userSignature: userSignature,
    });

  return zkLoginSignature;
}

/**
 * Check if user is authenticated
 */
export async function getAuthState(): Promise<AuthState | null> {
  try {
    const address = await SecureStore.getItemAsync(STORAGE_KEYS.ADDRESS);
    const userType = await SecureStore.getItemAsync(STORAGE_KEYS.USER_TYPE);
    const userName = await SecureStore.getItemAsync(STORAGE_KEYS.USER_NAME);
    const userEmail = await SecureStore.getItemAsync(STORAGE_KEYS.USER_EMAIL);

    if (!address || !userType) {
      return null;
    }

    return {
      address,
      userType: userType as 'driver' | 'parking_owner',
      isAuthenticated: true,
      name: userName || undefined,
      email: userEmail || undefined,
    };
  } catch (error) {
    console.error('Error getting auth state:', error);
    return null;
  }
}

/**
 * Logout user
 */
export async function logout(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(STORAGE_KEYS.EPHEMERAL_KEY);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.MAX_EPOCH);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.RANDOMNESS);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.JWT);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.ADDRESS);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_TYPE);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_NAME);
    await SecureStore.deleteItemAsync(STORAGE_KEYS.USER_EMAIL);
    // Keep USER_SALT for address consistency
  } catch (error) {
    console.error('Error logging out:', error);
  }
}

/**
 * Get the current SUI balance for a user address
 * @param userAddress - User's Sui address
 * @returns Balance in SUI (as a number)
 */
export async function getSuiBalance(userAddress: string): Promise<number> {
  try {
    const balance = await suiClient.getBalance({ owner: userAddress });
    const balanceInSui = parseInt(balance.totalBalance) / 1_000_000_000; // Convert from MIST to SUI
    return balanceInSui;
  } catch (error) {
    console.error('Error getting SUI balance:', error);
    return 0;
  }
}

/**
 * Request testnet SUI from the faucet
 * @param userAddress - User's Sui address
 * @returns true if successful or balance sufficient, false otherwise
 */
export async function requestTestnetSui(userAddress: string): Promise<boolean> {
  try {
    console.log('Requesting testnet SUI for address:', userAddress);
    
    // Check current balance first
    const balance = await suiClient.getBalance({ owner: userAddress });
    const balanceInSui = parseInt(balance.totalBalance) / 1_000_000_000; // Convert from MIST to SUI
    
    console.log(`Current balance: ${balanceInSui} SUI`);
    
    // If balance is already sufficient (>= 0.1 SUI), skip faucet request
    if (balanceInSui >= 0.1) {
      console.log('Balance sufficient, skipping faucet request');
      return true;
    }
    
    // Try community faucet endpoints (official API is disabled)
    const faucetEndpoints = [
      {
        name: 'Stakely Faucet',
        url: `https://stakely.io/api/faucet/sui-testnet`,
        method: 'POST',
        body: {
          address: userAddress,
        },
      },
      {
        name: 'Blockbolt Faucet',
        url: `https://faucet.blockbolt.io/api/faucet`,
        method: 'POST',
        body: {
          address: userAddress,
          network: 'testnet',
        },
      },
    ];
    
    for (const endpoint of faucetEndpoints) {
      try {
        console.log(`Trying ${endpoint.name}: ${endpoint.url}`);
        const config: any = {
          method: endpoint.method,
          headers: {
            'Content-Type': 'application/json',
          },
        };
        
        if (endpoint.body) {
          config.data = endpoint.body;
        }
        
        const response = await axios(endpoint.url, config);
        
        if (response.status === 200 || response.status === 201) {
          console.log(`Successfully requested testnet SUI from ${endpoint.name}`);
          
          // Wait a bit for the transaction to be processed
          await new Promise(resolve => setTimeout(resolve, 5000));
          
          // Verify balance increased
          const newBalance = await suiClient.getBalance({ owner: userAddress });
          const newBalanceInSui = parseInt(newBalance.totalBalance) / 1_000_000_000;
          console.log(`New balance: ${newBalanceInSui} SUI`);
          
          if (newBalanceInSui > balanceInSui) {
            return true;
          }
        }
      } catch (endpointError: any) {
        console.log(`${endpoint.name} failed:`, endpointError.message);
        continue; // Try next endpoint
      }
    }
    
    // If all endpoints failed, check if balance is still sufficient
    const finalBalance = await suiClient.getBalance({ owner: userAddress });
    const finalBalanceInSui = parseInt(finalBalance.totalBalance) / 1_000_000_000;
    
    if (finalBalanceInSui >= 0.1) {
      console.log('Balance is sufficient after faucet attempts');
      return true;
    }
    
    console.warn('All faucet endpoints failed. User needs to request SUI manually.');
    return false;
  } catch (error: any) {
    // Don't fail the registration flow if faucet fails
    console.warn('Failed to request testnet SUI from faucet:', error.message);
    return false;
  }
}

/**
 * Register user on-chain with their name (or ensure they're registered)
 * If user is already registered, this is a no-op and returns null
 * @param userName - User's display name from Google OAuth
 * @param userAddress - User's Sui address
 * @returns Transaction digest if registered, null if already registered
 */
export async function registerUser(
  userName: string,
  userAddress: string
): Promise<{ digest: string } | null> {
  try {
    // Check balance before attempting transaction
    const balance = await suiClient.getBalance({ owner: userAddress });
    const balanceInSui = parseInt(balance.totalBalance) / 1_000_000_000;
    
    if (balanceInSui < 0.01) {
      const error = new Error(
        'Insufficient SUI balance. Please request testnet SUI from:\n' +
        '1. https://faucet.sui.io/ (official faucet)\n' +
        '2. https://stakely.io/faucet/sui-testnet-sui (Stakely)\n' +
        '3. https://faucet.blockbolt.io/ (Blockbolt)\n\n' +
        `Your address: ${userAddress}`
      );
      error.name = 'InsufficientBalance';
      throw error;
    }
    
    const txb = new TransactionBlock();
    
    // Get Clock object (always 0x6)
    const clockObject = CONTRACT_ADDRESSES.CLOCK_OBJECT;
    
    // Call register_user function
    // Format: module_address::module_name::function_name
    // In old SDK version, txb.pure() accepts string directly for vector<u8>
    txb.moveCall({
      target: `${CONTRACT_ADDRESSES.REPUTATION_MODULE}::reputation::register_user`,
      arguments: [
        txb.object(CONTRACT_ADDRESSES.REPUTATION_REGISTRY), // registry
        txb.pure(userName), // name as vector<u8> - SDK converts string to vector<u8> automatically
        txb.object(clockObject), // clock
      ],
    });
    
    // Execute transaction
    const result = await executeZkLoginTransaction(txb, userAddress);
    
    console.log('User registered successfully:', result.digest);
    return result;
  } catch (error: any) {
    // Check if error is "already registered" (error code 2)
    const errorMessage = error.message || '';
    const errorString = JSON.stringify(error);
    
    // EAlreadyRegistered = 2 in Move contract
    // Error format: MoveAbort(..., 2) or "error code: 2" or "Dry run failed" with error code 2
    // Check multiple patterns to catch all variations
    const isAlreadyRegisteredError = (
      error?.isAlreadyRegistered === true ||
      error?.name === 'AlreadyRegisteredError' ||
      (errorMessage.includes('MoveAbort') && (errorString.includes('", 2)') || errorString.includes(', 2)')) && errorMessage.includes('register_user')) ||
      (errorMessage.includes('Dry run failed') && errorMessage.includes('register_user') && (errorString.includes('", 2)') || errorString.includes(', 2)') || errorString.includes('error code: 2'))) ||
      (errorMessage.includes('error code: 2') && errorMessage.includes('register_user')) ||
      errorString.includes('EAlreadyRegistered') ||
      (errorMessage.includes('2') && errorMessage.includes('register_user') && (errorMessage.includes('reputation') || errorString.includes('reputation'))) ||
      (errorString.includes('register_user') && (errorString.includes('", 2)') || errorString.includes(', 2)')))
    );
    
    if (isAlreadyRegisteredError) {
      // Silently handle - user already registered, this is fine
      // Don't log anything, just return null
      return null; // User already registered, this is fine
    }
    
    // Check for gas coin errors
    if (
      errorMessage.includes('No valid gas coins') ||
      errorMessage.includes('gas coins') ||
      errorMessage.includes('InsufficientBalance')
    ) {
      // Re-throw with helpful message
      throw error;
    }
    
    // For other errors, re-throw
    console.error('Error registering user:', error);
    throw error;
  }
}

/**
 * Check if user is registered on-chain by querying the reputation contract
 * @param userAddress - User's Sui address
 * @returns true if registered, false otherwise
 */
export async function isUserRegistered(userAddress: string): Promise<boolean> {
  try {
    const txb = new TransactionBlock();
    
    // Set sender (required for devInspect)
    txb.setSender(userAddress);
    
    // Call is_user_registered function from the contract
    // This is a view function that queries the table without modifying state
    txb.moveCall({
      target: `${CONTRACT_ADDRESSES.REPUTATION_MODULE}::reputation::is_user_registered`,
      arguments: [
        txb.object(CONTRACT_ADDRESSES.REPUTATION_REGISTRY), // registry
        // @ts-ignore - old SDK version might not have pure.address, but pure should work
        txb.pure(userAddress), // user address
      ],
    });
    
    const txBytes = await txb.build({ client: suiClient });
    
    const response = await suiClient.devInspectTransactionBlock({
      sender: userAddress,
      transactionBlock: txBytes,
    });

    console.log('Response:', response);
    
    if (response.error) {
      console.error('Error inspecting transaction:', response.error);
      return false;
    }
    
    if (!response.results || response.results.length === 0) {
      console.log('No results returned from devInspect');
      return false;
    }
    
    const firstResult = response.results[0];
    if (!firstResult.returnValues || (Array.isArray(firstResult.returnValues) && firstResult.returnValues.length === 0)) {
      console.log('No return values in result');
      return false;
    }

    console.log('First result:', firstResult);
    console.log('First result return values:', firstResult.returnValues);
    
    const [returnValue] = firstResult.returnValues;
    // Based on QueryClient.ts example: returnValue[0][0] === 1 for bool
    // returnValue is [Uint8Array, string] where first element [0] is the bytes array
    // and returnValue[0][0] is the first byte (bool: 0x00 = false, 0x01 = true)
    if (!returnValue || !Array.isArray(returnValue)) {
      console.log('Invalid return value format');
      console.log('Return value:', returnValue);
      return false;
    }
    
    console.log('Return value structure:', {
      returnValue,
      returnValue0: returnValue[0],
      returnValue00: returnValue[0]?.[0],
    });
    
    // Extract bool value: returnValue[0][0] === 1 means true
    const isRegistered = returnValue[0]?.[0] === 1;
    
    console.log(`User ${userAddress} registration status:`, isRegistered);
    return isRegistered;
  } catch (error: any) {
    console.error('Error checking registration status:', error);
    // Log the full error for debugging
    if (error.message) {
      console.error('Error message:', error.message);
    }
    // Return false on error to allow registration attempt
    return false;
  }
}
