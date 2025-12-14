// MUST be the first import - polyfill for cryptographic operations
import "react-native-get-random-values";

import React from "react";
import { StatusBar } from "expo-status-bar";
import { PhantomProvider, AddressType, darkTheme } from "@phantom/react-native-sdk";
import WalletScreen from "./src/components/WalletScreen";

/**
 * SETUP INSTRUCTIONS:
 * 
 * ⚠️ IMPORTANT: Phantom Portal is in closed beta!
 * You must request access first by emailing: partnerships@phantom.app
 * Include: your company email, app name, and app URL
 * 
 * Once you have Portal access:
 * 1. Register your app at https://phantom.com/portal/
 * 2. Go to your app's "URL Config" section
 * 3. Copy your App ID (found at the bottom of URL Config page)
 * 4. Add these URLs to your allowed origins/redirects:
 *    - Redirect URL: phantomwallettest://phantom-auth-callback
 *    - Origin: phantomwallettest://
 * 5. Replace "YOUR_APP_ID_HERE" below with your actual App ID
 * 
 * See SETUP_PHANTOM.md for detailed instructions
 */

const PHANTOM_APP_ID = "YOUR_APP_ID_HERE"; // ⚠️ Replace with your App ID from Phantom Portal

export default function App() {
  return (
    <PhantomProvider
      config={{
        providers: ["google", "apple"], // Enabled auth providers for React Native
        appId: PHANTOM_APP_ID,
        scheme: "phantomwallettest",
        addressTypes: [AddressType.solana, AddressType.ethereum],
        authOptions: {
          redirectUrl: "phantomwallettest://phantom-auth-callback",
        },
      }}
      theme={darkTheme} // Optional: Customize modal appearance
      appIcon="https://your-app.com/icon.png" // Optional: Your app icon
      appName="Phantom Wallet Test" // Optional: Your app name
    >
      <StatusBar style="light" />
      <WalletScreen />
    </PhantomProvider>
  );
}

