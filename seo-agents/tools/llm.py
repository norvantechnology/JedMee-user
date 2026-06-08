"""Optional LLM helper — Gemini or Anthropic for content drafting."""
from __future__ import annotations

import json
from typing import Any

import config


class LLMClient:
    def __init__(self) -> None:
        self.provider = config.active_llm_provider()
        self.available = self.provider is not None

    def complete_json(self, prompt: str, system: str = "") -> dict[str, Any] | None:
        text = self._complete(prompt, system=system, json_mode=True)
        if not text:
            return None
        try:
            if text.startswith("```"):
                text = text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
            return json.loads(text)
        except Exception:
            return None

    def complete_text(self, prompt: str, system: str = "") -> str | None:
        return self._complete(prompt, system=system, json_mode=False)

    def _complete(self, prompt: str, system: str = "", json_mode: bool = False) -> str | None:
        if not self.available:
            return None
        try:
            if self.provider == "gemini":
                return self._gemini_complete(prompt, system, json_mode)
            return self._anthropic_complete(prompt, system, json_mode)
        except Exception:
            return None

    def _gemini_complete(self, prompt: str, system: str, json_mode: bool) -> str | None:
        import google.generativeai as genai

        genai.configure(api_key=config.GEMINI_API_KEY)
        model = genai.GenerativeModel(config.GEMINI_MODEL)

        parts = []
        if system:
            parts.append(system)
        if json_mode:
            parts.append("Respond with valid JSON only. No markdown fences.")
        parts.append(prompt)
        full_prompt = "\n\n".join(parts)

        response = model.generate_content(full_prompt)
        return (response.text or "").strip() or None

    def _anthropic_complete(self, prompt: str, system: str, json_mode: bool) -> str | None:
        import anthropic

        default_system = (
            "Respond with valid JSON only. No markdown fences."
            if json_mode
            else "You are an SEO copywriter for JedMee pharmacy software."
        )
        client = anthropic.Anthropic(api_key=config.ANTHROPIC_API_KEY)
        message = client.messages.create(
            model=config.WORKER_MODEL,
            max_tokens=2048 if json_mode else 1024,
            system=system or default_system,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text.strip()
