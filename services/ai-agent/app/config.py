"""Configuration management for SuiPark Agent backend."""
import os
from pathlib import Path
from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import ConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""
    
    model_config = ConfigDict(
        # Look for .env file in the services/ directory (two levels up from app/)
        env_file=str(Path(__file__).parent.parent / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"  # Ignore extra fields in .env file (like admin_address)
    )
    
    gemini_api_key: str
    google_maps_api_key: str
    
    # API configuration
    api_title: str = "SuiPark Agent API"
    api_version: str = "1.0.0"
    api_description: str = "AI-powered parking spot finder and reservation assistant"
    
    # Gemini configuration
    gemini_model: str = "gemini-2.5-flash"  # Stable, fast, supports 1M tokens
    gemini_temperature: float = 0.3
    

# Global settings instance
try:
    settings = Settings()
except Exception as e:
    env_file_path = Path(__file__).parent.parent / ".env"
    if not env_file_path.exists():
        raise ValueError(
            f"Missing .env file at {env_file_path}\n"
            f"Please create it from env.template:\n"
            f"  cp {env_file_path.parent / 'env.template'} {env_file_path}\n"
            f"Then add your GEMINI_API_KEY and GOOGLE_MAPS_API_KEY"
        ) from e
    raise


