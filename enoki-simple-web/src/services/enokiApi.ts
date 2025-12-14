import { ENOKI_CONFIG } from "../config/enoki";

const ENOKI_API_BASE = "https://api.enoki.mystenlabs.com";

/**
 * Get Sui address from JWT token using Enoki API
 */
export async function getAddressFromJWT(jwt: string): Promise<string> {
  const response = await fetch(`${ENOKI_API_BASE}/v1/zklogin`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${ENOKI_CONFIG.apiKey}`,
      "zklogin-jwt": jwt,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorData;
    try {
      errorData = JSON.parse(errorText);
    } catch {
      errorData = { message: errorText };
    }
    throw new Error(
      errorData.message ||
        errorData.error ||
        `Enoki API error: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  
  // Log the full response for debugging
  console.log("Enoki API response:", data);
  
  // Enoki API returns: { data: { address: "...", salt: "...", publicKey: "..." } }
  const address = data?.data?.address;
  
  if (!address) {
    console.error("No address found in response. Full response:", JSON.stringify(data, null, 2));
    throw new Error(`No address in Enoki API response. Response: ${JSON.stringify(data)}`);
  }

  return address;
}
