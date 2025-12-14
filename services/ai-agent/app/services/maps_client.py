"""Google Maps API client for geocoding."""
import logging
from typing import Optional
import httpx

from app.config import settings

logger = logging.getLogger(__name__)


class MapsClient:
    """Client for interacting with Google Maps Geocoding API."""
    
    def __init__(self):
        """Initialize Maps client with API key."""
        self.api_key = settings.google_maps_api_key
        self.base_url = "https://maps.googleapis.com/maps/api/geocode/json"
    
    async def geocode(self, location_query: str) -> dict:
        """
        Geocode a location query to get coordinates and formatted address.
        
        Args:
            location_query: Location query string (e.g., "FSEGA, Cluj-Napoca")
            
        Returns:
            Dictionary with keys: lat, lng, formatted_address
            
        Raises:
            ValueError: If geocoding fails or no results found
        """
        params = {
            "address": location_query,
            "key": self.api_key
        }
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(self.base_url, params=params)
                response.raise_for_status()
                data = response.json()
                
                status = data.get("status")
                if status != "OK":
                    error_msg = data.get("error_message", "Unknown geocoding error")
                    logger.error(f"Geocoding failed: {status} - {error_msg}")
                    
                    # Provide helpful error messages for common issues
                    if status == "REQUEST_DENIED":
                        raise ValueError(
                            f"Geocoding API access denied. Please ensure:\n"
                            f"1. Geocoding API is enabled in Google Cloud Console\n"
                            f"2. Your API key has the correct permissions\n"
                            f"3. Billing is enabled on your Google Cloud project\n"
                            f"Error details: {error_msg}"
                        )
                    elif status == "OVER_QUERY_LIMIT":
                        raise ValueError(f"Geocoding API quota exceeded. {error_msg}")
                    elif status == "INVALID_REQUEST":
                        raise ValueError(f"Invalid geocoding request. {error_msg}")
                    else:
                        raise ValueError(f"Geocoding failed: {status} - {error_msg}")
                
                results = data.get("results", [])
                if not results:
                    raise ValueError(f"No geocoding results found for: {location_query}")
                
                # Use the first result
                result = results[0]
                location = result["geometry"]["location"]
                
                return {
                    "lat": location["lat"],
                    "lng": location["lng"],
                    "formatted_address": result["formatted_address"]
                }
                
        except httpx.HTTPError as e:
            logger.error(f"HTTP error during geocoding: {e}")
            raise ValueError(f"Failed to geocode location: {e}")
        except Exception as e:
            logger.error(f"Unexpected error during geocoding: {e}")
            raise ValueError(f"Geocoding error: {e}")
    
    async def reverse_geocode(self, lat: float, lng: float) -> Optional[str]:
        """
        Reverse geocode coordinates to get formatted address.
        
        Args:
            lat: Latitude
            lng: Longitude
            
        Returns:
            Formatted address string, or None if reverse geocoding fails
        """
        params = {
            "latlng": f"{lat},{lng}",
            "key": self.api_key
        }
        
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(self.base_url, params=params)
                response.raise_for_status()
                data = response.json()
                
                status = data.get("status")
                if status != "OK":
                    logger.warning(f"Reverse geocoding failed: {status}")
                    return None
                
                results = data.get("results", [])
                if not results:
                    logger.warning(f"No reverse geocoding results for: {lat}, {lng}")
                    return None
                
                # Use the first result's formatted address
                return results[0].get("formatted_address")
                
        except Exception as e:
            logger.warning(f"Reverse geocoding error for {lat}, {lng}: {e}")
            return None


# Global client instance
maps_client = MapsClient()

