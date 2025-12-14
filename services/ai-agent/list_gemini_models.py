#!/usr/bin/env python3
"""List available Gemini models."""
import os
import google.generativeai as genai
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

api_key = os.getenv("GEMINI_API_KEY")
if not api_key:
    print("Error: GEMINI_API_KEY not found in environment variables")
    print("Make sure you have a .env file with GEMINI_API_KEY set")
    exit(1)

genai.configure(api_key=api_key)

print("=== Available Gemini Models ===\n")

try:
    models = genai.list_models()
    
    print("Models that support generateContent:\n")
    for model in models:
        if 'generateContent' in model.supported_generation_methods:
            print(f"  - {model.name}")
            if hasattr(model, 'display_name'):
                print(f"    Display Name: {model.display_name}")
            if hasattr(model, 'description'):
                print(f"    Description: {model.description}")
            print()
    
    print("\n=== Recommended Models ===")
    print("Common model names to try:")
    print("  - gemini-pro")
    print("  - gemini-1.5-pro")
    print("  - gemini-1.5-flash-latest")
    print("  - gemini-pro-vision (for vision tasks)")
    
except Exception as e:
    print(f"Error listing models: {e}")
    print("\nTrying alternative approach...")
    
    # Try common model names
    common_models = [
        "gemini-pro",
        "gemini-1.5-pro",
        "gemini-1.5-flash",
        "gemini-1.5-flash-latest",
        "gemini-pro-vision"
    ]
    
    print("\nCommon model names you can try:")
    for model_name in common_models:
        try:
            model = genai.GenerativeModel(model_name)
            print(f"  ✓ {model_name} - Available")
        except Exception as err:
            print(f"  ✗ {model_name} - Not available: {str(err)[:50]}")

