# Google Maps Geocoding API Setup Guide

If you're getting `REQUEST_DENIED` errors, follow these steps to enable the Geocoding API:

## Step 1: Enable Geocoding API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one)
3. Navigate to **APIs & Services** > **Library**
4. Search for "Geocoding API"
5. Click on **Geocoding API** and click **Enable**

## Step 2: Create/Verify API Key

1. Go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **API Key**
3. Copy your API key
4. (Optional but recommended) Click **Restrict Key** to:
   - Restrict to **Geocoding API** only
   - Add HTTP referrer restrictions if needed

## Step 3: Enable Billing

The Geocoding API requires billing to be enabled:

1. Go to **Billing** in Google Cloud Console
2. Link a billing account to your project
3. Note: Google provides $200 free credit per month for Maps Platform

## Step 4: Update Your .env File

Add your API key to your `.env` file:

```bash
GOOGLE_MAPS_API_KEY=your_api_key_here
```

## Step 5: Test the API

After setting up, test with:

```bash
curl -X POST http://localhost:8000/api/geocode \
  -H "Content-Type: application/json" \
  -d '{"location_query": "FSEGA, Cluj-Napoca"}'
```

## Common Error Codes

- **REQUEST_DENIED**: API not enabled or API key invalid
- **OVER_QUERY_LIMIT**: Quota exceeded
- **INVALID_REQUEST**: Missing or invalid address parameter
- **ZERO_RESULTS**: No results found for the address
- **UNKNOWN_ERROR**: Server error, try again

## Pricing

- First $200/month is free (Google Maps Platform credit)
- After that: $5.00 per 1,000 requests
- See [Pricing](https://developers.google.com/maps/billing-and-pricing/pricing) for details

## Documentation

- [Geocoding API Docs](https://developers.google.com/maps/documentation/geocoding)
- [Get Started Guide](https://developers.google.com/maps/documentation/geocoding/get-started)

