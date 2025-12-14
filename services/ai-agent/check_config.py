#!/usr/bin/env python3
"""Check what configuration is actually being loaded."""
import sys
import os

# Add the services directory to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.config import settings

print("=== Current Configuration ===")
print(f"Gemini Model: {settings.gemini_model}")
print(f"Gemini Temperature: {settings.gemini_temperature}")
print(f"API Key Set: {'Yes' if settings.gemini_api_key else 'No'}")
print(f"Maps API Key Set: {'Yes' if settings.google_maps_api_key else 'No'}")
print()

# Check environment variables
print("=== Environment Variables ===")
gemini_model_env = os.getenv("GEMINI_MODEL")
if gemini_model_env:
    print(f"GEMINI_MODEL env var: {gemini_model_env} (THIS OVERRIDES THE DEFAULT!)")
else:
    print("GEMINI_MODEL env var: Not set (using default from config.py)")

