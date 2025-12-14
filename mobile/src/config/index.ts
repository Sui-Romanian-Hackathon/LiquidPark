// Configuration for API endpoints
// For physical devices, use your computer's local IP instead of localhost
// Find your IP with: ipconfig getifaddr en0 (macOS) or ipconfig (Windows)
// Default IP detected: 172.20.10.2 (update if different)
const LOCAL_IP = process.env.EXPO_PUBLIC_LOCAL_IP || '172.20.10.2';

export const config = {
  aiAgentApiUrl: process.env.EXPO_PUBLIC_AI_AGENT_API_URL || `http://${LOCAL_IP}:8000`,
  suiApiUrl: process.env.EXPO_PUBLIC_SUI_API_URL || `http://${LOCAL_IP}:3001`,
  defaultNetwork: 'testnet' as const,
};

// Log API URLs for debugging (only in development)
if (__DEV__) {
  console.log('📡 API Configuration:');
  console.log('  AI Agent API:', config.aiAgentApiUrl);
  console.log('  Sui API:', config.suiApiUrl);
  console.log('  Network:', config.defaultNetwork);
}

export const SUI_NETWORK = "https://rpc.testnet.sui.io:443";

// Contract addresses (update these after deployment)
export const CONTRACT_ADDRESSES = {
  REPUTATION_MODULE: process.env.EXPO_PUBLIC_REPUTATION_MODULE || '0xbd1645101fed2ce71bb9f03880d2ea9f94914667dac9f5842a60b862d692d43e',
  REPUTATION_REGISTRY: process.env.EXPO_PUBLIC_REPUTATION_REGISTRY || '0x2f93e4aa4674b1f1e0b8323f8bd1cb2d9003a5298c66f2b92cf1427b31e328ba',
  CLOCK_OBJECT: '0x6', // Sui Clock object (always 0x6)
};

// Deployment info for testnet
export const SUI_DEPLOYMENT = {
  testnet: {
    packageId: '0xbd1645101fed2ce71bb9f03880d2ea9f94914667dac9f5842a60b862d692d43e',
    zoneRegistryId: '0xd7861c29b4c71507797910d8203275938d5778dc9282427aec85fce0d8df2ce7',
    escrowConfigId: '0x724de5909220264b3192a016e656618393d4a7b342af76081de58036f601a6db',
    reputationRegistryId: '0x2f93e4aa4674b1f1e0b8323f8bd1cb2d9003a5298c66f2b92cf1427b31e328ba',
  },
  mainnet: {
    packageId: '',
    zoneRegistryId: '',
    escrowConfigId: '',
    reputationRegistryId: '',
  },
  devnet: {
    packageId: '',
    zoneRegistryId: '',
    escrowConfigId: '',
    reputationRegistryId: '',
  },
};
