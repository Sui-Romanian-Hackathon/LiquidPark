import { useState, useEffect } from "react";
import { getAddressFromJWT } from "./services/enokiApi";
import { ENOKI_CONFIG } from "./config/enoki";
import "./App.css";

function App() {
  const [address, setAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = () => {
    // Check if config is set up
    if (
      ENOKI_CONFIG.apiKey === "YOUR_ENOKI_API_KEY" ||
      ENOKI_CONFIG.providers.google.clientId === "YOUR_GOOGLE_CLIENT_ID"
    ) {
      setError(
        "Please configure your Enoki API key and Google Client ID in src/config/enoki.ts"
      );
      return;
    }

    // Generate nonce for OAuth
    const nonce = Date.now().toString();
    const redirectUri = encodeURIComponent(ENOKI_CONFIG.redirectUrl);
    const clientId = ENOKI_CONFIG.providers.google.clientId;

    // Build Google OAuth URL
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=id_token&scope=openid%20email%20profile&nonce=${nonce}`;

    // Redirect to Google OAuth
    window.location.href = authUrl;
  };

  // Handle OAuth redirect callback
  useEffect(() => {
    const handleCallback = async () => {
      const hash = window.location.hash.substring(1);
      const params = new URLSearchParams(hash);
      const jwt = params.get("id_token");

      if (jwt) {
        setLoading(true);
        setError(null);

        try {
          // Get Sui address from Enoki
          const suiAddress = await getAddressFromJWT(jwt);
          setAddress(suiAddress);
          // Clean URL
          window.history.replaceState({}, document.title, "/");
        } catch (err: any) {
          setError(err.message);
        } finally {
          setLoading(false);
        }
      }
    };

    handleCallback();
  }, []);

  return (
    <div className="app">
      <div className="container">
        <h1>Enoki zkLogin</h1>
        <p className="subtitle">Connect to Sui with Google</p>

        {!address ? (
          <div className="connect-section">
            <button
              onClick={handleConnect}
              disabled={loading}
              className="connect-button"
            >
              {loading ? "Connecting..." : "Connect with Google"}
            </button>
            {error && <p className="error">{error}</p>}
          </div>
        ) : (
          <div className="connected-section">
            <div className="success-message">✓ Connected!</div>
            <div className="address-box">
              <label>Sui Address:</label>
              <code>{address}</code>
            </div>
            <button
              onClick={() => {
                setAddress(null);
                setError(null);
              }}
              className="disconnect-button"
            >
              Disconnect
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
