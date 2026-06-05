"""
costops-dev — Pre-Crime Agentic Loop Predictor.
"""
from __future__ import annotations

import difflib
import logging
import redis.asyncio as aioredis

from config import get_settings

logger = logging.getLogger(__name__)

class PreCrimeService:
    """
    Detects and intercepts infinite loop API drainage from Multi-Agent systems.
    """
    def __init__(self) -> None:
        settings = get_settings()
        self._redis: aioredis.Redis = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
        )

    async def detect_loop(self, user_id: str, prompt: str) -> bool:
        """
        Uses a sliding window in Redis to intercept infinite loops.
        If the current prompt is >=90% similar to the last 3 consecutive prompts,
        it triggers the circuit breaker.
        """
        if not prompt.strip():
            return False

        redis_key = f"costops:agent_history:{user_id}"
        
        try:
            # 1. Action: RPUSH the current raw prompt into the list
            await self._redis.rpush(redis_key, prompt)
            
            # 2. Trim: LTRIM the list to keep only the last 4 consecutive prompts
            await self._redis.ltrim(redis_key, -4, -1)
            
            # Keep history alive for 10 minutes (TTL)
            await self._redis.expire(redis_key, 600)
            
            # 3. Fetch: Retrieve all 4 prompts using LRANGE
            history = await self._redis.lrange(redis_key, 0, -1)
            
            # Allow the request to pass normally if we have fewer than 4 items
            if len(history) < 4:
                return False
                
            current_prompt = history[-1]
            past_prompts = history[:-1] # The previous 3 prompts
            
            # Gate 1 (Loop Detection): check similarity
            for past_prompt in past_prompts:
                ratio = difflib.SequenceMatcher(None, current_prompt, past_prompt).ratio()
                if ratio < 0.90:
                    return False
                    
            logger.warning(f"🚨 Pre-Crime Agentic Loop Intercepted for user: {user_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to execute Pre-Crime detector: {e}")
            # Failsafe open
            return False

precrime_service = PreCrimeService()
