// Crypto polyfill for React Native
// This ensures crypto.getRandomValues is available before any Sui SDK code runs

// Import react-native-get-random-values first - this should polyfill automatically
import 'react-native-get-random-values';

// Ensure global.crypto.getRandomValues exists as a fallback
// react-native-get-random-values should handle this, but we ensure it's set up
if (typeof global !== 'undefined') {
  if (!global.crypto) {
    global.crypto = {} as Crypto;
  }
  
  // Double-check that getRandomValues is available
  if (!global.crypto.getRandomValues) {
    // This should not happen if react-native-get-random-values is working,
    // but we provide a fallback using Math.random (less secure, but functional)
    global.crypto.getRandomValues = <T extends ArrayBufferView | null>(arr: T): T => {
      if (arr === null) {
        throw new TypeError('Argument 1 of crypto.getRandomValues cannot be null.');
      }
      const view = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
      for (let i = 0; i < view.length; i++) {
        view[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    };
  }
}

export {};

