// OAuth Client IDs Configuration
// This file allows you to temporarily hardcode Client IDs for testing
// For production, use environment variables in .env file instead

// TEMPORARY: Uncomment and add your Client IDs here for testing
// This is useful if .env file isn't being loaded properly

export const OAUTH_CLIENT_IDS = {
  // Using the same Google Client ID as react-native-zklogin-poc
  google: '70599191792-e7cuqm6pldc8ffp3hg9ie84n4d8u0stm.apps.googleusercontent.com',
  
  // Facebook App ID (leave empty if not using Facebook)
  facebook: '',
};
