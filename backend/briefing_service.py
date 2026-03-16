"""
Daily market briefing service.

Responsibilities:
- Get or create the "News Of The Day" NotebookLM notebook
- Clear previous day's sources and add today's
- Generate an AI market briefing using OpenRouter
"""

import os
import asyncio
import logging
import httpx
from notebooklm import NotebookLMClient

logger = logging.getLogger(__name__)

OPENROUTER_API_KEY = os.getenv("OPEN_ROUTER_API_KEY", "")
NEWS_NOTEBOOK_TITLE = "News Of The Day"
BRIEFING_MODEL = "openai/gpt-4o-mini"


# ─── NotebookLM helpers ───────────────────────────────────────────────────────

async def get_or_create_news_notebook() -> str:
    """Returns the ID of the 'News Of The Day' notebook, creating it if needed."""
    async with await NotebookLMClient.from_storage() as client:
        notebooks = await client.notebooks.list()
        existing = next((nb for nb in notebooks if nb.title == NEWS_NOTEBOOK_TITLE), None)
        if existing:
            return existing.id
        notebook = await client.notebooks.create(NEWS_NOTEBOOK_TITLE)
        logger.info("Created notebook: %s (%s)", NEWS_NOTEBOOK_TITLE, notebook.id)
        return notebook.id


async def clear_notebook_sources(notebook_id: str) -> int:
    """Deletes all existing sources from the notebook. Returns count deleted."""
    async with await NotebookLMClient.from_storage() as client:
        sources = await client.sources.list(notebook_id)
        if not sources:
            return 0
        deleted = 0
        for source in sources:
            try:
                await client.sources.delete(notebook_id, source.id)
                deleted += 1
            except Exception as e:
                logger.warning("Could not delete source %s: %s", source.id, e)
        logger.info("Deleted %d sources from notebook %s", deleted, notebook_id)
        return deleted


BLOCKED_DOMAINS = {
    "t.co", "bit.ly", "tinyurl.com", "ow.ly",
    "wsj.com", "ft.com", "bloomberg.com", "barrons.com", "economist.com",
    "nytimes.com", "washingtonpost.com", "thetimes.co.uk", "telegraph.co.uk",
    "linkedin.com", "facebook.com", "twitter.com", "x.com",
}

def _is_blocked(url: str) -> bool:
    try:
        from urllib.parse import urlparse
        domain = urlparse(url).netloc.lower().removeprefix("www.")
        return any(domain == b or domain.endswith("." + b) for b in BLOCKED_DOMAINS)
    except Exception:
        return False

async def add_sources_to_notebook(notebook_id: str, urls: list[str]) -> dict:
    """Add URLs to notebook, skipping Google News redirects and blocked domains."""
    added, failed, skipped = 0, 0, 0
    async with await NotebookLMClient.from_storage() as client:
        for url in urls:
            # Skip Google News redirect URLs — they require authentication to resolve
            if "news.google.com" in url:
                skipped += 1
                continue
            if _is_blocked(url):
                skipped += 1
                continue
            try:
                await client.sources.add_url(notebook_id, url)
                added += 1
            except Exception as e:
                logger.warning("Could not add source %s: %s", url, e)
                failed += 1

    logger.info("Sources: %d added, %d failed, %d skipped", added, failed, skipped)
    return {"added": added, "failed": failed, "skipped": skipped}


# ─── Briefing generation ──────────────────────────────────────────────────────

def _build_news_context(news_items: list[dict]) -> str:
    lines = []
    for i, item in enumerate(news_items, 1):
        title = item.get("title", "")
        desc = item.get("description") or item.get("fullContent") or ""
        source = item.get("source", "")
        category = item.get("category", "")
        lines.append(f"{i}. [{category.upper()}] {title} ({source})")
        if desc:
            lines.append(f"   {desc[:200]}")
    return "\n".join(lines)


async def generate_briefing(news_items: list[dict]) -> str:
    """Generate a market briefing from the given news items using OpenRouter."""
    context = _build_news_context(news_items)

    prompt = f"""Eres un analista financiero experto. Analiza las siguientes noticias del día y genera un informe detallado en español sobre cómo afectan a los mercados financieros.

El informe debe incluir:
1. **Resumen ejecutivo** (3-4 frases con los puntos más importantes del día)
2. **Principales eventos del mercado** (los 3-5 movimientos o noticias más relevantes)
3. **Sectores y empresas afectadas** (qué sectores suben/bajan y por qué)
4. **Contexto macro** (inflación, tipos de interés, geopolítica si aplica)
5. **Conclusión y perspectiva** (qué vigilar en las próximas horas/días)

Noticias del día:
{context}

Genera el informe de forma estructurada, clara y profesional. Responde SIEMPRE EN ESPAÑOL."""

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                "Content-Type": "application/json",
                "HTTP-Referer": "https://pask-stocks.vercel.app",
                "X-Title": "PASK Stocks",
            },
            json={
                "model": BRIEFING_MODEL,
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.3,
                "max_tokens": 1500,
            }
        )
        data = resp.json()
        return data["choices"][0]["message"]["content"].strip()


# ─── Main orchestration ───────────────────────────────────────────────────────

async def refresh_news_notebook(urls: list[str]) -> dict:
    """
    Called when a new day starts:
    1. Get or create the News Of The Day notebook
    2. Delete previous sources
    3. Add today's sources
    Returns stats.
    """
    try:
        notebook_id = await get_or_create_news_notebook()
        deleted = await clear_notebook_sources(notebook_id)
        result = await add_sources_to_notebook(notebook_id, urls)
        return {
            "notebook_id": notebook_id,
            "sources_deleted": deleted,
            "sources_added": result["added"],
            "sources_failed": result["failed"],
        }
    except Exception as e:
        logger.error("Error refreshing news notebook: %s", e)
        return {"error": str(e)}
