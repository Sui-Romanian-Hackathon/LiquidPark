# Phantom Wallet Test - Expo Mobile App

A React Native Expo app for testing Phantom wallet integration using the Phantom Connect React Native SDK.

## Features

- ✅ Connect to Phantom wallets via Google or Apple authentication
- ✅ Multi-chain support (Solana and Ethereum)
- ✅ Sign messages on Solana and Ethereum
- ✅ Built-in connection modal with bottom sheet UI
- ✅ Secure storage using platform-level Keychain/Keystore

## Prerequisites

Before you begin, you need to:

1. **Register your app** in the [Phantom Portal](https://phantom.com/portal/)
   - Sign up or log in
   - Create a new app
   - Go to **URL Config** section
   - Copy your **App ID** (found at the bottom of the URL Config page)

2. **Configure allowed origins and redirect URLs** in Phantom Portal:
   - Add your app's custom scheme: `phantomwallettest://`
   - Add redirect URL: `phantomwallettest://phantom-auth-callback`

## Installation

1. **Install dependencies:**

```bash
cd phantom-wallet-test
npm install
```

2. **Install Expo CLI globally (if not already installed):**

```bash
npm install -g expo-cli
```

3. **Update App ID:**

   Open `App.tsx` and replace `"your-app-id"` with your actual App ID from Phantom Portal:

```tsx
appId: "your-actual-app-id-here",
```

## Running the App

### Development

```bash
# Start Expo development server
npm start

# Or use tunnel mode (useful for testing on physical devices)
npm run start:tunnel
```

### Run on Device/Simulator

```bash
# iOS Simulator
npm run ios

# Android Emulator
npm run android
```

### Using Expo Go

1. Install Expo Go app on your device:
   - [iOS App Store](https://apps.apple.com/app/expo-go/id982107779)
   - [Google Play Store](https://play.google.com/store/apps/details?id=host.exp.exponent)

2. Scan the QR code from the Expo development server

**Note:** For deep linking to work properly, you may need to build a development build instead of using Expo Go. See [Expo Development Builds](https://docs.expo.dev/development/build/).

## Project Structure

```
phantom-wallet-test/
├── App.tsx                 # Main app entry with PhantomProvider
├── app.json                # Expo configuration
├── package.json            # Dependencies
├── tsconfig.json           # TypeScript configuration
├── babel.config.js         # Babel configuration
├── src/
│   └── components/
│       └── WalletScreen.tsx  # Main wallet connection UI
└── README.md               # This file
```

## Configuration

### Custom Scheme

The app uses the custom scheme `phantomwallettest` for deep linking. This is configured in:

- `app.json` - `expo.scheme`
- `App.tsx` - `PhantomProvider` config `scheme` and `authOptions.redirectUrl`

### Supported Chains

Currently configured for:
- Solana (`AddressType.solana`)
- Ethereum (`AddressType.ethereum`)

You can modify this in `App.tsx`:

```tsx
addressTypes: [AddressType.solana, AddressType.ethereum],
```

### Authentication Providers

The app supports:
- Google OAuth (`"google"`)
- Apple ID (`"apple"`)

Configured in `App.tsx`:

```tsx
providers: ["google", "apple"],
```

## Usage

1. **Connect Wallet:**
   - Tap "Connect Wallet" button
   - Choose authentication provider (Google or Apple)
   - Complete authentication in system browser
   - App will automatically handle the redirect and connect

2. **Sign Messages:**
   - Once connected, you can sign messages on Solana or Ethereum
   - Tap the respective "Sign Message" button
   - Approve the signature request

3. **Manage Wallet:**
   - Tap "Manage Wallet" to open the connection modal
   - View wallet addresses and disconnect if needed

## Troubleshooting

### Deep Links Not Working

If deep links aren't working in Expo Go:

1. Build a development build: `npx expo run:ios` or `npx expo run:android`
2. Or use tunnel mode: `npm run start:tunnel`

### Authentication Redirect Issues

- Ensure your redirect URL is properly configured in Phantom Portal
- Verify the scheme matches in both `app.json` and `App.tsx`
- Check that the redirect URL format is: `{scheme}://phantom-auth-callback`

### "App ID" Errors

- Make sure you've replaced `"your-app-id"` with your actual App ID
- Verify your App ID is correct in Phantom Portal
- Ensure your app's domains/URLs are allowlisted in Phantom Portal

## Resources

- [Phantom React Native SDK Documentation](https://docs.phantom.com/sdks/react-native-sdk)
- [Phantom Portal](https://phantom.com/portal/)
- [Expo Documentation](https://docs.expo.dev/)
- [Example Apps](https://github.com/phantom/wallet-sdk/tree/main/examples)

## License

MIT

