# Phantom Wallet Setup Guide

## ⚠️ Important: Phantom Portal Access Required

**Phantom Portal is currently in closed beta.** You need to request access before you can get an App ID.

## Step 1: Request Portal Access

**Before you can register your app, you need access to Phantom Portal:**

1. Email `partnerships@phantom.app` from your company email address
2. Include the following information:
   - Your name and company
   - The name of your app
   - The URL of your app (if available)
   - Brief description of what you're building
3. Wait for approval (this may take some time)

**Note:** For testing/personal projects, you may still be able to get access - explain your use case in the email.

## Step 2: Register Your App

Once you have Portal access:

1. Go to [Phantom Portal](https://phantom.com/portal/)
2. Sign up or log in
3. Click "Create New App" or select an existing app

## Step 2: Get Your App ID

1. In Phantom Portal, go to your app
2. Click on **"URL Config"** in the left-hand menu
3. Scroll down to the **"App ID"** section at the bottom
4. Copy your App ID (it will look like a long string)

## Step 3: Configure Redirect URLs

In the same **"URL Config"** page, add these URLs:

### Allowed Redirect URLs:
```
phantomwallettest://phantom-auth-callback
```

### Allowed Origins:
```
phantomwallettest://
```

**Important:** Make sure to save these configurations in Phantom Portal!

## Step 4: Update Your Code

1. Open `App.tsx` in this project
2. Find the line: `const PHANTOM_APP_ID = "YOUR_APP_ID_HERE";`
3. Replace `"YOUR_APP_ID_HERE"` with your actual App ID from Step 2

Example:
```typescript
const PHANTOM_APP_ID = "abc123def456ghi789"; // Your actual App ID
```

## Step 5: Restart the App

After updating the App ID:
1. Stop the Expo server (Ctrl+C)
2. Clear cache: `npx expo start --clear`
3. Reload the app

## Troubleshooting

### "No Access" / Portal in Closed Beta?
- **You need to email `partnerships@phantom.app`** to request access
- Include your company email, app name, and app URL
- For personal/testing projects, explain your use case
- This is a requirement before you can proceed

### Still getting "invalid App ID" error?
- Make sure you have Portal access first (see above)
- Double-check that you copied the App ID correctly (no extra spaces)
- Verify the App ID is saved in Phantom Portal
- Make sure you've added the redirect URLs in Phantom Portal
- Try clearing the app cache: `npx expo start --clear`

### Alternative: Testing Without Portal Access
Unfortunately, the Phantom React Native SDK requires a valid App ID from the Portal. There's no way to test without Portal access. You'll need to:
1. Request access via email
2. Wait for approval
3. Then proceed with setup

### Redirect not working?
- Ensure the redirect URL matches exactly: `phantomwallettest://phantom-auth-callback`
- Verify the scheme in `app.json` matches: `"scheme": "phantomwallettest"`
- For physical devices, you may need a development build instead of Expo Go

## Need Help?

- [Phantom Portal](https://phantom.com/portal/)
- [Phantom React Native SDK Docs](https://docs.phantom.com/sdks/react-native-sdk)
- [Phantom Support](https://phantom.com/support)

