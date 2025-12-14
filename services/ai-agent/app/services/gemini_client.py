"""Google Gemini API client with JSON enforcement."""
import json
import logging
from typing import Dict, Any, Optional
import google.generativeai as genai

from app.config import settings

logger = logging.getLogger(__name__)


class GeminiClient:
    """Client for interacting with Google Gemini API."""
    
    def __init__(self):
        """Initialize Gemini client with API key."""
        genai.configure(api_key=settings.gemini_api_key)
        self.model = genai.GenerativeModel(settings.gemini_model)
        self.temperature = settings.gemini_temperature
    
    def _extract_json_from_response(self, response_text: str) -> Dict[str, Any]:
        """
        Extract JSON from Gemini response, handling markdown code blocks.
        
        Args:
            response_text: Raw response text from Gemini
            
        Returns:
            Parsed JSON dictionary
            
        Raises:
            ValueError: If JSON cannot be extracted or parsed
        """
        # Remove markdown code blocks if present
        text = response_text.strip()
        
        # Try to find JSON in markdown code blocks
        if "```json" in text:
            start = text.find("```json") + 7
            end = text.find("```", start)
            if end != -1:
                text = text[start:end].strip()
        elif "```" in text:
            start = text.find("```") + 3
            end = text.find("```", start)
            if end != -1:
                text = text[start:end].strip()
        
        # Try to find JSON object boundaries
        if text.startswith("{") and text.endswith("}"):
            pass  # Already looks like JSON
        elif "{" in text and "}" in text:
            start = text.find("{")
            end = text.rfind("}") + 1
            text = text[start:end]
        
        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse JSON from response: {text[:200]}")
            raise ValueError(f"Invalid JSON response from Gemini: {e}")
    
    async def generate_json(
        self,
        system_prompt: str,
        user_prompt: str,
        response_schema: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Generate JSON response from Gemini with enforced JSON output.
        
        Args:
            system_prompt: System prompt defining the agent's role
            user_prompt: User prompt with the specific task
            response_schema: Optional JSON schema description for validation
            
        Returns:
            Parsed JSON dictionary from Gemini response
        """
        # Build the full prompt with JSON enforcement
        json_instruction = (
            "\n\nIMPORTANT: Return ONLY valid JSON. Do not include any additional text, "
            "markdown formatting, or commentary outside the JSON object. "
            "The response must be parseable as JSON."
        )
        
        if response_schema:
            json_instruction += f"\n\nExpected JSON structure: {json.dumps(response_schema, indent=2)}"
        
        full_prompt = f"{system_prompt}\n\n{user_prompt}{json_instruction}"
        
        # Log the full prompt being sent to Gemini
        logger.info("=" * 80)
        logger.info("🚀 SENDING TO GEMINI API (generate_json)")
        logger.info("=" * 80)
        logger.info(f"System Prompt:\n{system_prompt}")
        logger.info(f"\nUser Prompt:\n{user_prompt}")
        if response_schema:
            logger.info(f"\nResponse Schema:\n{json.dumps(response_schema, indent=2)}")
        logger.info(f"\nFull Prompt Length: {len(full_prompt)} characters")
        logger.info("=" * 80)
        
        try:
            # Build generation config
            gen_config = {
                "temperature": self.temperature,
            }
            
            # Use JSON mode if schema is provided
            if response_schema:
                gen_config["response_mime_type"] = "application/json"
            
            logger.info(f"Generation Config: {gen_config}")
            
            # Generate response
            response = self.model.generate_content(
                full_prompt,
                generation_config=gen_config
            )
            
            response_text = response.text.strip()
            
            logger.info("=" * 80)
            logger.info("📥 RECEIVED FROM GEMINI API")
            logger.info("=" * 80)
            logger.info(f"Raw Response Length: {len(response_text)} characters")
            logger.info(f"Raw Response (first 500 chars): {response_text[:500]}")
            logger.info("=" * 80)
            
            # If JSON mode was used, response should already be valid JSON
            if response_schema:
                try:
                    return json.loads(response_text)
                except json.JSONDecodeError:
                    # Fallback to extraction if JSON mode didn't work perfectly
                    pass
            
            # Parse JSON (with extraction logic for non-JSON mode or fallback)
            result = self._extract_json_from_response(response_text)
            
            logger.info("=" * 80)
            logger.info("✅ PARSED JSON RESULT")
            logger.info("=" * 80)
            logger.info(f"Parsed Result: {json.dumps(result, indent=2)}")
            logger.info("=" * 80)
            
            return result
            
        except Exception as e:
            logger.error("=" * 80)
            logger.error("❌ GEMINI API ERROR")
            logger.error("=" * 80)
            logger.error(f"Error: {e}")
            logger.error(f"Full Prompt: {full_prompt[:1000]}...")
            logger.error("=" * 80)
            raise ValueError(f"Failed to generate JSON response from Gemini: {e}")
    
    async def generate_text(
        self,
        system_prompt: str,
        user_prompt: str
    ) -> str:
        """
        Generate plain text response from Gemini.
        
        Args:
            system_prompt: System prompt defining the agent's role
            user_prompt: User prompt with the specific task
            
        Returns:
            Generated text response
        """
        full_prompt = f"{system_prompt}\n\n{user_prompt}"
        
        # Log the full prompt being sent to Gemini
        logger.info("=" * 80)
        logger.info("🚀 SENDING TO GEMINI API (generate_text)")
        logger.info("=" * 80)
        logger.info(f"System Prompt:\n{system_prompt}")
        logger.info(f"\nUser Prompt:\n{user_prompt}")
        logger.info(f"\nFull Prompt Length: {len(full_prompt)} characters")
        logger.info("=" * 80)
        
        try:
            gen_config = {
                "temperature": self.temperature,
            }
            logger.info(f"Generation Config: {gen_config}")
            
            response = self.model.generate_content(
                full_prompt,
                generation_config=gen_config
            )
            
            response_text = response.text.strip()
            
            logger.info("=" * 80)
            logger.info("📥 RECEIVED FROM GEMINI API")
            logger.info("=" * 80)
            logger.info(f"Response Length: {len(response_text)} characters")
            logger.info(f"Response: {response_text}")
            logger.info("=" * 80)
            
            return response_text
            
        except Exception as e:
            logger.error("=" * 80)
            logger.error("❌ GEMINI API ERROR")
            logger.error("=" * 80)
            logger.error(f"Error: {e}")
            logger.error(f"Full Prompt: {full_prompt[:1000]}...")
            logger.error("=" * 80)
            raise ValueError(f"Failed to generate text response from Gemini: {e}")


# Global client instance
gemini_client = GeminiClient()

