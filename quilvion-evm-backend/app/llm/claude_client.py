"""
LLM client — Groq API (llama-3.3-70b-versatile)
Drop-in replacement for Claude — same interface, free tier available.
"""

from groq import Groq
import os
from typing import Optional

_client: Optional[Groq] = None


def get_client() -> Groq:
    global _client
    if _client is None:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise ValueError("GROQ_API_KEY environment variable not set")
        _client = Groq(api_key=api_key)
    return _client


MODEL = "llama-3.3-70b-versatile"
MAX_TOKENS = 1024


def call_claude(system_prompt: str, user_message: str) -> str:
    """Single Groq API call — returns text response.
    Function name kept as call_claude so no other file needs changes.
    """
    client = get_client()
    response = client.chat.completions.create(
        model=MODEL,
        max_tokens=MAX_TOKENS,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user",   "content": user_message},
        ],
    )
    return response.choices[0].message.content


# ── System prompts (same as before) ──────────────────────────────────────────

SYSTEM_FRAUD_EXPLAINER = """You are a fraud analyst for Quilvion, a Web3 commerce platform.
Explain fraud risk scores in clear, human-readable language.
STRICT RULES:
- Maximum 2 sentences only
- No markdown, no bullet points, plain text only
- Be specific about which signals drove the score
- End with ONE recommended action: Approve, Review, or Block"""

SYSTEM_BUYER_ASSISTANT = """You are Quilvion's AI shopping assistant for a Web3 marketplace on Sui blockchain.

You will receive a list of available products with their prices and details.
Use this data to help buyers find and choose products.

STRICT RULES:
- Maximum 3 sentences per reply
- When recommending products, mention the exact product name and price
- If buyer wants to buy something, say: "Click on [Product Name] in the marketplace to purchase it"
- No markdown, no bullet points, plain text only
- Be friendly and brief"""

SYSTEM_PRODUCT_WRITER = """You are a product copywriter for a Web3 digital marketplace.
Convert bullet points into a polished product description.
STRICT RULES:
- Maximum 40 words
- Active voice only
- Plain text, no markdown
- Only the description — no title, no labels"""

SYSTEM_DISPUTE_SUMMARIZER = """You are an operations assistant for Quilvion's admin team.
Summarize dispute context for admin review.
STRICT RULES:
- Maximum 3 sentences
- Include: buyer, product, amount, issue, recommendation
- End with exactly one of: Refund / Release / Investigate
- Plain text only, no markdown"""

SYSTEM_MERCHANT_PROFILER = """You are a risk analyst for Quilvion admins.
Summarize merchant data into a brief profile.
STRICT RULES:
- Maximum 3 sentences
- Cover: orders, success rate, disputes, overall risk
- End with: Overall Risk: Low / Medium / High
- Plain text only, no markdown"""

SYSTEM_XP_NOTIFIER = """You are writing tier upgrade notifications for Quilvion buyers.
STRICT RULES:
- Maximum 2 sentences
- Use their actual numbers to make it personal
- Warm and encouraging tone
- Plain text only, no markdown"""