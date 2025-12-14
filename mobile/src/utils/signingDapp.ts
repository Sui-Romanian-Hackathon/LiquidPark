/**
 * Web Dapp HTML/JS for Sui Transaction Signing
 * 
 * This generates the HTML content for a web dapp that:
 * 1. Uses Wallet Standard API to connect to Sui wallets
 * 2. Builds and signs parking reservation transactions using Sui SDK
 * 3. Sends results back to React Native via postMessage
 */

export interface SigningDappParams {
  slotId: string;
  slotName: string;
  priceDisplay: string;
  durationHours?: number;
  packageId: string;
  zoneRegistryId: string;
  network: 'mainnet' | 'testnet' | 'devnet';
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Generate the HTML content for the signing web dapp
 */
export function generateSigningDappHTML(params: SigningDappParams): string {
  const {
    slotId,
    slotName,
    priceDisplay,
    durationHours = 2,
    packageId,
    zoneRegistryId,
    network,
  } = params;

  const rpcUrl = network === 'testnet' 
    ? 'https://fullnode.testnet.sui.io:443'
    : network === 'devnet'
    ? 'https://fullnode.devnet.sui.io:443'
    : 'https://fullnode.mainnet.sui.io:443';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign Parking Reservation</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .container {
      background: white;
      border-radius: 16px;
      padding: 32px;
      max-width: 500px;
      width: 100%;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    h1 {
      color: #333;
      margin-bottom: 8px;
      font-size: 24px;
    }
    .subtitle {
      color: #666;
      margin-bottom: 24px;
      font-size: 14px;
    }
    .info-card {
      background: #f5f5f5;
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 24px;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid #e0e0e0;
    }
    .info-row:last-child {
      border-bottom: none;
    }
    .info-label {
      color: #666;
      font-size: 14px;
    }
    .info-value {
      color: #333;
      font-weight: 600;
      font-size: 14px;
      text-align: right;
    }
    .status {
      padding: 16px;
      border-radius: 8px;
      margin-bottom: 16px;
      text-align: center;
      font-size: 14px;
      display: none;
    }
    .status.info {
      background: #e3f2fd;
      color: #1976d2;
    }
    .status.error {
      background: #ffebee;
      color: #c62828;
    }
    .status.success {
      background: #e8f5e9;
      color: #2e7d32;
    }
    .status.loading {
      background: #fff3e0;
      color: #e65100;
    }
    .button {
      width: 100%;
      padding: 16px;
      background: #00BCD4;
      color: white;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.2s;
      margin-bottom: 12px;
    }
    .button:hover:not(:disabled) {
      background: #0097A7;
    }
    .button:disabled {
      background: #ccc;
      cursor: not-allowed;
    }
    .loading {
      display: inline-block;
      width: 16px;
      height: 16px;
      border: 2px solid #fff;
      border-top-color: transparent;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
      margin-right: 8px;
      vertical-align: middle;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>Confirm Parking Reservation</h1>
    <p class="subtitle">Review and sign the transaction with your Sui wallet</p>
    
    <div class="info-card">
      <div class="info-row">
        <span class="info-label">Location:</span>
        <span class="info-value">${escapeHtml(slotName)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Price:</span>
        <span class="info-value">${escapeHtml(priceDisplay)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Duration:</span>
        <span class="info-value">${durationHours} hours</span>
      </div>
    </div>

    <div id="status" class="status info"></div>
    
    <button id="connectButton" class="button">Connect Wallet</button>
    <button id="signButton" class="button" style="display: none;">Sign Transaction</button>
  </div>

  <!-- Load Sui SDK from CDN (using importmap for ES modules) -->
  <script type="importmap">
    {
      "imports": {
        "@mysten/sui": "https://cdn.jsdelivr.net/npm/@mysten/sui@1.45.2/dist/index.js"
      }
    }
  </script>
  <script type="module">
    import { TransactionBlock } from '@mysten/sui/transactions';
    
    const CONFIG = {
      slotId: ${JSON.stringify(slotId)},
      slotName: ${JSON.stringify(slotName)},
      priceDisplay: ${JSON.stringify(priceDisplay)},
      durationHours: ${durationHours},
      packageId: ${JSON.stringify(packageId)},
      zoneRegistryId: ${JSON.stringify(zoneRegistryId)},
      network: ${JSON.stringify(network)},
      rpcUrl: ${JSON.stringify(rpcUrl)},
      clockId: '0x6',
    };

    let currentWallet = null;
    let currentAccount = null;

    const statusEl = document.getElementById('status');
    const connectButton = document.getElementById('connectButton');
    const signButton = document.getElementById('signButton');

    function showStatus(message, type = 'info') {
      statusEl.textContent = message;
      statusEl.className = 'status ' + type;
      statusEl.style.display = 'block';
    }

    function sendMessage(type, data) {
      const message = JSON.stringify({
        type: type,
        ...data
      });
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(message);
      } else {
        console.log('Message (not in WebView):', message);
      }
    }

    async function connectWallet() {
      try {
        showStatus('Detecting wallets...', 'loading');
        connectButton.disabled = true;

        // Detect wallets using Wallet Standard API
        const wallets = window.wallets || [];
        if (wallets.length === 0) {
          throw new Error('No Sui wallets detected. Please install a Sui wallet extension (Suiet, Sui Wallet, etc.)');
        }

        const wallet = wallets[0];
        if (!wallet.features || !wallet.features['standard:connect']) {
          throw new Error('Wallet does not support standard:connect');
        }

        showStatus('Connecting to wallet...', 'loading');
        const connectFeature = wallet.features['standard:connect'];
        const result = await connectFeature.connect();
        
        if (result && result.accounts && result.accounts.length > 0) {
          currentWallet = wallet;
          currentAccount = result.accounts[0];
          showStatus('Wallet connected!', 'success');
          connectButton.style.display = 'none';
          signButton.style.display = 'block';
        } else {
          throw new Error('No accounts returned from wallet');
        }
      } catch (error) {
        console.error('Wallet connection error:', error);
        showStatus('Connection failed: ' + error.message, 'error');
        connectButton.disabled = false;
        sendMessage('SIGN_RESULT', {
          status: 'error',
          error: error.message || 'Wallet connection failed'
        });
      }
    }

    async function signTransaction() {
      try {
        showStatus('Building transaction...', 'loading');
        signButton.disabled = true;

        if (!currentWallet || !currentAccount) {
          throw new Error('Wallet not connected');
        }

        // Build transaction using Sui SDK
        const txb = new TransactionBlock();
        
        // Call create_reservation
        txb.moveCall({
          target: CONFIG.packageId + '::market::create_reservation',
          arguments: [
            txb.object(CONFIG.slotId),
            txb.object(CONFIG.zoneRegistryId),
            txb.pure.u64(CONFIG.durationHours),
            txb.pure.u64(BigInt(Date.now())),
            txb.object(CONFIG.clockId),
          ],
        });

        showStatus('Please approve the transaction in your wallet...', 'loading');

        // Use wallet's signAndExecuteTransactionBlock feature
        if (!currentWallet.features || !currentWallet.features['sui:signAndExecuteTransactionBlock']) {
          throw new Error('Wallet does not support transaction signing');
        }

        const signFeature = currentWallet.features['sui:signAndExecuteTransactionBlock'];
        const result = await signFeature.signAndExecuteTransactionBlock({
          transactionBlock: txb,
          account: currentAccount,
          chain: 'sui:' + CONFIG.network,
        });

        if (!result || !result.digest) {
          throw new Error('Transaction execution failed');
        }

        showStatus('Transaction confirmed!', 'success');

        // Extract reservation ID from transaction result if available
        let reservationId = null;
        if (result.objectChanges) {
          const reservation = result.objectChanges.find(
            (change) => change.type === 'created' && change.objectType && change.objectType.includes('Reservation')
          );
          if (reservation && reservation.objectId) {
            reservationId = reservation.objectId;
          }
        }

        // Send success message to React Native
        sendMessage('SIGN_RESULT', {
          status: 'success',
          txDigest: result.digest,
          reservationId: reservationId,
        });

        // Auto-close after 2 seconds
        setTimeout(() => {
          if (window.ReactNativeWebView) {
            sendMessage('CLOSE');
          }
        }, 2000);

      } catch (error) {
        console.error('Transaction signing error:', error);
        showStatus('Signing failed: ' + error.message, 'error');
        signButton.disabled = false;
        
        sendMessage('SIGN_RESULT', {
          status: 'error',
          error: error.message || 'Transaction signing failed'
        });
      }
    }

    // Event listeners
    connectButton.addEventListener('click', connectWallet);
    signButton.addEventListener('click', signTransaction);

    // Auto-detect wallets on load
    window.addEventListener('load', () => {
      setTimeout(() => {
        const wallets = window.wallets || [];
        if (wallets.length > 0) {
          showStatus('Wallet detected. Click "Connect Wallet" to proceed.', 'info');
        } else {
          showStatus('Please install a Sui wallet extension (Suiet, Sui Wallet, etc.)', 'info');
        }
      }, 500);
    });
  </script>
</body>
</html>`;
}


