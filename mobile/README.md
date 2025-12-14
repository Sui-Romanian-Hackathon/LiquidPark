# Sui Parking Mobile App

A React Native/Expo mobile application for reserving parking spots on the Sui blockchain, using zkLogin for authentication and AI-powered chat interface for finding parking spots.

## 📋 Table of Contents

- [Overview](#overview)
- [Project Structure](#project-structure)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Installation](#installation)
- [Configuration](#configuration)
- [Running the App](#running-the-app)
- [Architecture](#architecture)
- [Screens](#screens)
- [Components](#components)
- [Services](#services)
- [Backend Services](#backend-services)
- [Blockchain Integration](#blockchain-integration)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

## 🎯 Overview

SuiPark is a decentralized parking reservation system built on the Sui blockchain. The mobile app provides:

- **AI-Powered Chat Interface**: Natural language interaction to find parking spots
- **zkLogin Authentication**: Passwordless authentication using Google OAuth
- **Blockchain Integration**: Direct interaction with Sui smart contracts
- **Reservation Management**: Create, view, and manage parking reservations
- **Parking Slot Management**: Owners can create and manage parking slots
- **Complaint System**: Users can submit complaints about reservations
- **Reputation System**: Track and display reputation scores for parking slots

## 📁 Project Structure

```
mobile/
├── App.tsx                      # Main app component with navigation
├── app.json                     # Expo configuration
├── package.json                 # Dependencies
├── assets/                      # Images and icons
├── ios/                         # iOS native code
├── android/                     # Android native code
└── src/
    ├── components/              # Reusable UI components
    │   ├── ParkingSpotCard.tsx  # Parking slot card component
    │   ├── QuickActionButtons.tsx
    │   ├── SidebarNavigation.tsx # Main navigation sidebar
    │   ├── SimpleChat.tsx       # Chat interface component
    │   └── WalletConnectWebView.tsx
    ├── screens/                 # Screen components
    │   ├── WelcomeScreen.tsx    # Login/welcome screen
    │   ├── ChatScreen.tsx       # AI chat interface
    │   ├── SummaryScreen.tsx    # Reservation summary
    │   ├── SigningScreen.tsx    # Transaction signing
    │   ├── SuccessScreen.tsx    # Success confirmation
    │   ├── ErrorScreen.tsx      # Error handling
    │   ├── ProfileScreen.tsx    # User profile management
    │   ├── ReservationsScreen.tsx # View reservations
    │   ├── MyParkingSlotsScreen.tsx # Manage parking slots
    │   ├── CreateParkingSlotScreen.tsx # Create new slot
    │   ├── ComplaintsScreen.tsx # View complaints list
    │   └── CreateComplaintScreen.tsx # Submit complaint
    ├── services/                # Business logic services
    │   ├── api.ts               # API client for backend
    │   ├── zkLoginService.ts    # zkLogin authentication
    │   ├── chatService.ts       # Chat/AI service
    │   ├── walletService.ts     # Wallet operations
    │   ├── slotConverter.ts     # Data transformation
    │   └── mockData.ts          # Mock data for testing
    ├── config/                  # Configuration files
    │   ├── index.ts             # Main config (API URLs, contracts)
    │   ├── oauth.ts             # OAuth client IDs
    │   └── env.ts               # Environment variables
    ├── types/                   # TypeScript type definitions
    │   └── index.ts             # Shared types
    └── utils/                   # Utility functions
        ├── cryptoPolyfill.ts    # Crypto polyfills for RN
        └── signingDapp.ts       # Transaction signing utilities
```

## ✨ Features

### Authentication & User Management
- **zkLogin Authentication**: Passwordless login using Google OAuth
- **User Profiles**: Store and manage user information (name, email, phone, address)
- **User Types**: Support for both drivers and parking slot owners
- **Session Management**: Persistent authentication state

### AI Chat Interface
- **Natural Language Processing**: Chat with AI to find parking spots
- **Intent Parsing**: Extracts location, duration, price preferences from messages
- **Slot Recommendations**: AI ranks and recommends best parking spots
- **Conversational UI**: Friendly chat interface with message history

### Parking Slot Management
- **Create Slots**: Owners can create new parking slots with:
  - Location name and address
  - GPS coordinates (latitude/longitude)
  - Base price per hour
- **View Slots**: List all owned parking slots
- **Slot Details**: View slot information, status, and statistics

### Reservation System
- **Find Slots**: Search for available parking spots near a location
- **Reserve Slots**: Create blockchain reservations with:
  - Start time and duration
  - Price calculation (base + dynamic pricing)
  - Escrow for payment security
- **View Reservations**: List all user reservations with status
- **Check-in/Check-out**: Mark arrival and departure times
- **Reservation Status**: Track active, completed, and cancelled reservations

### Complaint System
- **Submit Complaints**: Report issues related to reservations
  - Select reservation
  - Add photo evidence (camera or gallery)
  - Write detailed comment
- **View Complaints**: List all submitted complaints
- **Complaint Status**: Track pending, reviewed, and resolved complaints

### Blockchain Features
- **Direct Blockchain Interaction**: No intermediaries
- **zkLogin Signing**: Sign transactions without private keys
- **Escrow System**: Secure payment handling
- **Reputation System**: Track slot reputation scores
- **Transaction History**: View all blockchain transactions

## 🛠 Tech Stack

### Frontend
- **React Native**: 0.72.10
- **Expo**: ~49.0.12 (bare workflow)
- **TypeScript**: 5.1.3
- **React**: 18.2.0

### Blockchain & Crypto
- **@mysten/sui.js**: ^0.44.0 (Sui SDK)
- **@mysten/zklogin**: ^0.3.2 (zkLogin authentication)
- **@mysten/enoki**: ^0.0.8 (Enoki SDK)

### Authentication
- **react-native-app-auth**: ^7.1.0 (OAuth client)
- **expo-secure-store**: ~12.3.1 (Secure storage)
- **jwt-decode**: ^3.1.2 (JWT decoding)

### UI & Media
- **expo-image-picker**: ~14.3.2 (Image selection)
- **expo-linear-gradient**: ~12.3.0 (Gradients)
- **react-native-safe-area-context**: 4.7.4

### Networking
- **axios**: ^1.5.1 (HTTP client)
- **expo-linking**: ~5.0.2 (Deep linking)

### Crypto Polyfills (React Native compatibility)
- **@craftzdog/react-native-buffer**: ^6.0.5
- **react-native-crypto**: ^2.2.0
- **react-native-randombytes**: ^3.6.1
- **base-64**: ^1.0.0
- **bigint-buffer**: ^1.1.5
- **fast-text-encoding**: ^1.0.6
- **text-encoding**: ^0.7.0

## 📦 Installation

### Prerequisites
- Node.js 16+ and npm
- iOS: Xcode 14+ (for iOS development)
- Android: Android Studio (for Android development)
- Expo CLI (optional, for development)

### Steps

1. **Install dependencies**:
```bash
cd mobile
npm install
```

2. **Install iOS dependencies** (macOS only):
```bash
cd ios
pod install
cd ..
```

3. **Configure environment** (see [Configuration](#configuration) section)

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the `mobile/` directory or set environment variables:

```bash
# API Endpoints
EXPO_PUBLIC_AI_AGENT_API_URL=http://localhost:8000
EXPO_PUBLIC_SUI_API_URL=http://localhost:3001
EXPO_PUBLIC_LOCAL_IP=172.20.10.10  # Your local IP for device testing

# OAuth
EXPO_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com

# Blockchain
EXPO_PUBLIC_REPUTATION_MODULE=0x...
EXPO_PUBLIC_REPUTATION_REGISTRY=0x...
```

### OAuth Setup

1. **Google OAuth**:
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create OAuth 2.0 credentials
   - Add iOS bundle ID: `com.andreeatomescu.suiparking`
   - Add Android package: `com.suiparking.mobile`
   - Configure redirect URLs

2. **Update OAuth Client ID**:
   - Edit `src/config/oauth.ts` or set `EXPO_PUBLIC_GOOGLE_CLIENT_ID`
   - Current default: `70599191792-e7cuqm6pldc8ffp3hg9ie84n4d8u0stm`

### Blockchain Configuration

Edit `src/config/index.ts` to configure:

- **Network**: testnet (default), mainnet, or devnet
- **Contract Addresses**: Update after deploying contracts
- **API URLs**: Backend service endpoints

Current testnet contracts:
- Package ID: `0xbd1645101fed2ce71bb9f03880d2ea9f94914667dac9f5842a60b862d692d43e`
- Zone Registry: `0xd7861c29b4c71507797910d8203275938d5778dc9282427aec85fce0d8df2ce7`
- Escrow Config: `0x724de5909220264b3192a016e656618393d4a7b342af76081de58036f601a6db`
- Reputation Registry: `0x2f93e4aa4674b1f1e0b8323f8bd1cb2d9003a5298c66f2b92cf1427b31e328ba`

### iOS Permissions

The app requires camera and photo library permissions. These are configured in `ios/SuiParking/Info.plist`:

- `NSCameraUsageDescription`: "We need access to your camera to take photos for complaints."
- `NSPhotoLibraryUsageDescription`: "We need access to your photo library to attach images to complaints."
- `NSMicrophoneUsageDescription`: "We need access to your microphone for audio/video services."

## 🚀 Running the App

### iOS Simulator

**Method 1: Direct (Recommended)**
```bash
npm run ios
```
This will:
1. Start Metro bundler automatically
2. Build the iOS app
3. Open simulator and install the app

**Method 2: Separate terminals**
```bash
# Terminal 1: Start Metro bundler
npm start

# Terminal 2: Build and run iOS
npm run ios
```

### Android Emulator

```bash
npm run android
```

### Physical Device (iPhone)

1. **Connect iPhone via USB** and enable Developer Mode:
   - Settings → Privacy & Security → Developer Mode → Enable

2. **Open project in Xcode**:
   ```bash
   cd mobile
   open ios/SuiParking.xcworkspace
   ```
   ⚠️ **Important**: Use `.xcworkspace`, NOT `.xcodeproj`!

3. **Configure Signing**:
   - Select project "SuiParking" in navigator
   - Select target "SuiParking"
   - Go to **"Signing & Capabilities"** tab
   - Check **"Automatically manage signing"**
   - Select **Team** (Apple Developer account)

4. **Run on device**:
   ```bash
   npx expo run:ios --device
   ```
   Or press `Cmd+R` in Xcode after selecting your iPhone.

**Note**: First time building for device, iPhone will ask to "Trust This Computer" - accept on phone.

### Web (Development)

```bash
npm run web
```

## 🏗 Architecture

### Application Flow

```
Welcome Screen
    ↓ (Login with Google)
zkLogin Authentication
    ↓ (Generate zkLogin proof)
Chat Screen
    ↓ (AI finds parking spots)
Summary Screen
    ↓ (Review reservation)
Signing Screen
    ↓ (Sign transaction)
Success/Error Screen
    ↓
Reservations Screen / Chat Screen
```

### Navigation Structure

```
App.tsx (Main Router)
├── Welcome Screen (Unauthenticated)
└── Main App (Authenticated)
    ├── Sidebar Navigation
    │   ├── Chat 💬
    │   ├── My Reservations 📅
    │   ├── My Parking Slots 🅿️
    │   ├── Profile 👤
    │   ├── Complaints 📝
    │   └── Deconnect 🚪
    └── Content Area
        ├── Chat Screen
        ├── Reservations Screen
        ├── My Parking Slots Screen
        ├── Profile Screen
        ├── Complaints Screen
        └── Modal Screens
            ├── Create Parking Slot
            ├── Create Complaint
            ├── Summary Screen
            ├── Signing Screen
            ├── Success Screen
            └── Error Screen
```

### State Management

- **React State**: Component-level state with hooks
- **Context**: App-level state in `App.tsx`
- **Secure Storage**: Authentication tokens via `expo-secure-store`
- **Refresh Triggers**: For slots and complaints lists

## 📱 Screens

### WelcomeScreen
- **Purpose**: Initial screen with login option
- **Features**: Google OAuth login button
- **Navigation**: → Chat Screen (after authentication)

### ChatScreen
- **Purpose**: AI-powered chat interface for finding parking
- **Features**:
  - Message history
  - AI responses with parking recommendations
  - Parking spot cards with details
  - Quick action buttons
- **Navigation**: → Summary Screen (select spot) → Reservations Screen

### SummaryScreen
- **Purpose**: Review reservation details before confirming
- **Features**:
  - Display slot information
  - Show price calculation
  - Confirm or go back
- **Navigation**: → Signing Screen (confirm) → Chat Screen (back)

### SigningScreen
- **Purpose**: Sign blockchain transaction
- **Features**:
  - zkLogin transaction signing
  - Loading states
  - Transaction progress
- **Navigation**: → Success Screen (success) → Error Screen (error)

### SuccessScreen
- **Purpose**: Confirm successful reservation
- **Features**:
  - Transaction digest display
  - Reservation ID
  - Return to chat
- **Navigation**: → Chat Screen

### ErrorScreen
- **Purpose**: Display transaction errors
- **Features**:
  - Error message
  - Retry option
  - Return to chat
- **Navigation**: → Signing Screen (retry) → Chat Screen (back)

### ProfileScreen
- **Purpose**: Manage user profile
- **Features**:
  - Edit name, email, phone, address
  - View user type (driver/owner)
  - Add parking slot button
- **Navigation**: → Create Parking Slot Screen

### ReservationsScreen
- **Purpose**: View and manage reservations
- **Features**:
  - List all reservations
  - Filter by status (active/completed/cancelled)
  - Check-in/Check-out buttons
  - Reservation details
- **Actions**:
  - Check-in: Mark arrival
  - Check-out: Complete reservation and settle escrow

### MyParkingSlotsScreen
- **Purpose**: Manage owned parking slots
- **Features**:
  - List all owned slots
  - Slot status (available/occupied/maintenance)
  - Add new slot button
  - Slot statistics
- **Navigation**: → Create Parking Slot Screen

### CreateParkingSlotScreen
- **Purpose**: Create new parking slot
- **Features**:
  - Form inputs:
    - Location name
    - Address
    - Latitude/Longitude
    - Base price per hour
  - Validation
  - Blockchain transaction
  - Collateral deposit (0.2 SUI)
- **Navigation**: → My Parking Slots Screen (after creation)

### ComplaintsScreen
- **Purpose**: View submitted complaints
- **Features**:
  - List all complaints
  - Complaint status (pending/reviewed/resolved)
  - Complaint details
  - Add complaint button
- **Navigation**: → Create Complaint Screen

### CreateComplaintScreen
- **Purpose**: Submit new complaint
- **Features**:
  - Select reservation
  - Upload photo (camera or gallery)
  - Write comment
  - Submit complaint
- **Navigation**: → Complaints Screen (after submission)

## 🧩 Components

### SidebarNavigation
- **Purpose**: Main navigation menu
- **Features**:
  - Slide-out sidebar
  - Navigation items with icons
  - Badge for reservation count
  - Active state highlighting
  - Swipe to close gesture

### SimpleChat
- **Purpose**: Chat interface component
- **Features**:
  - Message bubbles
  - User/AI message distinction
  - Timestamps
  - Input field
  - Send button

### ParkingSpotCard
- **Purpose**: Display parking slot information
- **Features**:
  - Slot name and address
  - Distance and price
  - Reputation score
  - Availability status
  - Action buttons

### QuickActionButtons
- **Purpose**: Quick action buttons in chat
- **Features**:
  - Predefined actions
  - Common queries

## 🔌 Services

### zkLoginService
- **Purpose**: Handle zkLogin authentication
- **Functions**:
  - `login()`: Initiate Google OAuth flow
  - `getAuthState()`: Get current authentication state
  - `logout()`: Clear authentication
  - `executeZkLoginTransaction()`: Sign transactions with zkLogin

### api.ts
- **Purpose**: Backend API client
- **Endpoints**:
  - `getParkingSlots()`: Query parking slots
  - `getUserReservations()`: Get user reservations
  - `createReservation()`: Create new reservation
  - `getParkingSlotById()`: Get slot details
  - `getEscrow()`: Get escrow information
  - `getReservation()`: Get reservation details
  - `getUserParkingSlots()`: Get owned slots
  - `getDriverProfileByAddress()`: Get driver profile
  - `getOwnerProfileByAddress()`: Get owner profile

### chatService
- **Purpose**: AI chat service integration
- **Functions**:
  - `sendMessage()`: Send message to AI agent
  - `parseIntent()`: Parse user intent
  - `getRecommendations()`: Get slot recommendations

### slotConverter
- **Purpose**: Transform data between formats
- **Functions**:
  - Convert blockchain data to UI format
  - Format prices and distances
  - Transform coordinates

## 🔗 Backend Services

The app requires two backend services:

### 1. AI Agent Service (Python/FastAPI)
- **Location**: `services/ai-agent/`
- **Port**: 8000
- **Purpose**: AI-powered intent parsing and recommendations
- **Endpoints**:
  - `POST /api/parse-intent`: Parse user message
  - `POST /api/geocode`: Geocode location queries
  - `POST /api/recommend-slot`: Rank parking slots
  - `POST /api/generate-user-message`: Generate AI responses

**Setup**:
```bash
cd services/ai-agent
pip install -r requirements.txt
python -m app.main
```

### 2. Sui Interactions API (TypeScript/Express)
- **Location**: `services/sui-interactions/`
- **Port**: 3001
- **Purpose**: Blockchain interaction layer
- **Endpoints**:
  - `GET /api/slots`: Query parking slots
  - `POST /api/reservations`: Create reservation
  - `GET /api/reservations/by-user/:address`: Get user reservations
  - `GET /api/escrow/:id`: Get escrow details

**Setup**:
```bash
cd services/sui-interactions
npm install
npm run start:api
```

See `services/QUICKSTART.md` for detailed setup instructions.

## ⛓ Blockchain Integration

### Smart Contracts

The app interacts with Sui Move smart contracts located in `blockchain/sources/`:

- **market.move**: Parking slot marketplace
  - `create_slot()`: Create new parking slot
  - `deposit_collateral()`: Deposit collateral for slot
  - `create_reservation()`: Create reservation
  - `cancel_reservation()`: Cancel reservation

- **escrow.move**: Escrow system for payments
  - `mark_used()`: Mark escrow as used (check-in)
  - `settle()`: Settle escrow (check-out)
  - `dispute()`: Create dispute

- **reputation.move**: Reputation system
  - Track slot reputation scores
  - Calculate reputation based on bookings and disputes

- **blockchain.move**: Core blockchain types and events

### Transaction Flow

1. **Create Reservation**:
   ```
   User → Chat → Select Slot → Summary → Sign Transaction
   → Blockchain: create_reservation() → Escrow Created
   ```

2. **Check-in**:
   ```
   Reservations Screen → Check-in → Blockchain: mark_used()
   ```

3. **Check-out**:
   ```
   Reservations Screen → Check-out → Blockchain: settle()
   → Funds Released → Reputation Updated
   ```

4. **Create Slot**:
   ```
   My Parking Slots → Create Slot → Fill Form → Sign Transaction
   → Blockchain: create_slot() → Deposit Collateral
   ```

### Network Configuration

- **Testnet**: `https://rpc.testnet.sui.io:443` (default)
- **Mainnet**: Configure in `src/config/index.ts`
- **Devnet**: Configure in `src/config/index.ts`

## 🧪 Development

### Code Style
- TypeScript with strict type checking
- React hooks for state management
- Functional components
- Consistent naming conventions

### Debugging
- React Native Debugger
- Metro bundler console logs
- Xcode console (iOS)
- Android Studio logcat (Android)

### Testing
- Manual testing on simulators/emulators
- Physical device testing recommended
- Test with testnet before mainnet

### Common Tasks

**Add new screen**:
1. Create screen component in `src/screens/`
2. Add screen type to `App.tsx`
3. Add navigation handler
4. Update sidebar if needed

**Add new API endpoint**:
1. Add function to `src/services/api.ts`
2. Update types if needed
3. Use in relevant screen/service

**Update blockchain contract**:
1. Update Move contract in `blockchain/sources/`
2. Deploy to testnet/mainnet
3. Update contract addresses in `src/config/index.ts`

## 🐛 Troubleshooting

### Common Issues

**1. Metro bundler won't start**
```bash
# Clear cache and restart
npm start -- --reset-cache
```

**2. iOS build fails**
```bash
# Clean and reinstall pods
cd ios
rm -rf Pods Podfile.lock
pod install
cd ..
```

**3. Android build fails**
```bash
# Clean gradle cache
cd android
./gradlew clean
cd ..
```

**4. Authentication not working**
- Check OAuth client ID configuration
- Verify redirect URLs match Google Console
- Check network connectivity

**5. API calls failing**
- Verify backend services are running
- Check API URLs in config
- For physical device, use computer's IP instead of localhost
- Check firewall settings

**6. Camera permissions not working**
- Verify `Info.plist` has permission descriptions
- Check iOS settings for app permissions
- Rebuild app after changing permissions

**7. Transaction signing fails**
- Check zkLogin authentication state
- Verify contract addresses are correct
- Check network connectivity
- Review transaction in Sui Explorer

### Getting Help

- Check console logs for error messages
- Review Sui transaction digests in Explorer
- Verify backend service logs
- Check network requests in React Native Debugger

## 📝 Notes

- The app uses older Sui SDK versions (@mysten/sui.js v0.44.0) for React Native compatibility
- zkLogin is used instead of traditional wallet connections
- Compatible with Expo bare workflow (requires native build)
- Testnet is used by default for development
- Mainnet deployment requires updating contract addresses

## 🔐 Security Considerations

- Private keys are never stored or transmitted
- zkLogin provides passwordless authentication
- Secure storage for authentication tokens
- Escrow system ensures payment security
- All transactions are on-chain and verifiable

## 📄 License

Private project - See package.json for details

## 👥 Contributing

This is a private project. For questions or issues, contact the project maintainer.

---

**Last Updated**: 2024
**Version**: 1.0.0
**Platform**: iOS, Android, Web (development)
