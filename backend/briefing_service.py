"""
Daily market briefing service.

Responsibilities:
- Get or create the "News Of The Day" NotebookLM notebook
- Clear previous day's sources and add today's
- Generate an AI market briefing using NotebookLM
"""

import os
import re
import asyncio
import logging
import urllib.request
from datetime import datetime, timezone
from notebooklm import NotebookLMClient

logger = logging.getLogger(__name__)

NEWS_NOTEBOOK_TITLE = "News Of The Day"
TELEGRAM_CHANNEL = "descifrandolaguerra"


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


def _normalize_url(url: str) -> str:
    """Strip URL fragment (#section) so NotebookLM can fetch the full page."""
    try:
        from urllib.parse import urlparse, urlunparse
        p = urlparse(url)
        return urlunparse(p._replace(fragment=""))
    except Exception:
        return url


def _dedup_urls(urls: list[str]) -> list[str]:
    """Normalize and deduplicate URLs, preserving first-seen order."""
    seen: set[str] = set()
    result: list[str] = []
    for url in urls:
        norm = _normalize_url(url)
        if norm not in seen:
            seen.add(norm)
            result.append(norm)
    return result

async def add_sources_to_notebook(notebook_id: str, urls: list[str]) -> dict:
    """Add URLs to notebook in parallel (max 5 concurrent, 20s per URL)."""
    added_urls: list[str] = []
    failed_urls: list[str] = []
    skipped_urls: list[str] = []

    # Pre-filter
    to_add: list[str] = []
    for url in urls:
        if "news.google.com" in url or _is_blocked(url):
            skipped_urls.append(url)
        else:
            to_add.append(url)

    semaphore = asyncio.Semaphore(5)

    async def _add_one(url: str) -> tuple[str, str]:
        async with semaphore:
            try:
                async with await NotebookLMClient.from_storage() as client:
                    await asyncio.wait_for(
                        client.sources.add_url(notebook_id, url),
                        timeout=20.0,
                    )
                return ("added", url)
            except Exception as e:
                logger.warning("Could not add source %s: %s", url, e)
                return ("failed", url)

    results = await asyncio.gather(*[_add_one(u) for u in to_add])
    for status, url in results:
        if status == "added":
            added_urls.append(url)
        else:
            failed_urls.append(url)

    logger.info("Sources: %d added, %d failed, %d skipped",
                len(added_urls), len(failed_urls), len(skipped_urls))
    return {
        "added": len(added_urls),
        "failed": len(failed_urls),
        "skipped": len(skipped_urls),
        "added_urls": added_urls,
        "failed_urls": failed_urls,
        "skipped_urls": skipped_urls,
    }


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


def _extract_urls_from_news_items(news_items: list[dict]) -> list[str]:
    """Extract and normalize URLs from news items."""
    urls = []
    for item in news_items:
        url = item.get("url", "").strip()
        if url and url.startswith(("http://", "https://")):
            urls.append(_normalize_url(url))
    return urls


async def fetch_telegram_channel_urls(channel: str) -> list[str]:
    """Scrape a public Telegram channel and return external URLs from the 2 most recent days."""

    def _fetch() -> str:
        req = urllib.request.Request(
            f"https://t.me/s/{channel}",
            headers={"User-Agent": "Mozilla/5.0 (compatible; NewsBot/1.0)"},
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.read().decode("utf-8")

    try:
        html = await asyncio.to_thread(_fetch)
    except Exception as e:
        logger.warning("Could not fetch Telegram channel %s: %s", channel, e)
        return []

    # Split into individual message blocks
    blocks = re.split(r'(?=<div class="tgme_widget_message_wrap)', html)

    # Collect (date, urls) per message
    entries: list[tuple[object, list[str]]] = []
    for block in blocks:
        dt_match = re.search(r'datetime="([^"]+)"', block)
        if not dt_match:
            continue
        try:
            dt = datetime.fromisoformat(dt_match.group(1).replace("Z", "+00:00"))
            msg_date = dt.astimezone(timezone.utc).date()
        except Exception:
            continue

        # Extract links from the message text div
        text_match = re.search(
            r'class="tgme_widget_message_text[^"]*"[^>]*>(.*?)</div>',
            block, re.DOTALL
        )
        if not text_match:
            continue

        urls = re.findall(r'href="(https?://[^"#][^"]*)"', text_match.group(1))
        # Drop internal Telegram/t.me links, normalize fragments
        urls = [
            _normalize_url(u)
            for u in urls
            if "t.me" not in u and "telegram" not in u.lower()
        ]
        if urls:
            entries.append((msg_date, urls))

    if not entries:
        logger.info("Telegram channel %s: no messages with URLs found", channel)
        return []

    # Take the 2 most recent distinct dates
    all_dates = sorted({d for d, _ in entries}, reverse=True)
    recent_dates = set(all_dates[:2])

    result: list[str] = []
    for d, urls in entries:
        if d in recent_dates:
            result.extend(urls)

    unique = _dedup_urls(result)
    logger.info("Telegram channel %s: %d URLs from %s", channel, len(unique), sorted(recent_dates, reverse=True))
    return unique


async def generate_briefing(news_items: list[dict]) -> dict:
    """Generate a market briefing from the given news items using NotebookLM.
    Returns a dict with 'briefing', 'added_urls', and 'failed_urls'.
    """
    added_urls: list[str] = []
    failed_urls: list[str] = []
    telegram_urls: list[str] = []
    try:
        notebook_id = await get_or_create_news_notebook()
        await clear_notebook_sources(notebook_id)

        # Fetch Telegram channel URLs in parallel with notebook setup
        telegram_urls = await fetch_telegram_channel_urls(TELEGRAM_CHANNEL)

        news_urls = _extract_urls_from_news_items(news_items)
        all_urls = _dedup_urls(news_urls + telegram_urls)
        if all_urls:
            result = await add_sources_to_notebook(notebook_id, all_urls)
            added_urls = result["added_urls"]
            failed_urls = result["failed_urls"]

        prompt = """Eres un analista financiero experto. Analiza las fuentes de noticias cargadas en este notebook y genera un informe detallado en español sobre cómo afectan a los mercados financieros.

El informe debe incluir:
1. **Resumen ejecutivo** (3-4 frases con los puntos más importantes del día)
2. **Principales eventos del mercado** (los 3-5 movimientos o noticias más relevantes)
3. **Sectores y empresas afectadas** (qué sectores suben/bajan y por qué)
4. **Contexto macro** (inflación, tipos de interés, geopolítica si aplica)
5. **Conclusión y perspectiva** (qué vigilar en las próximas horas/días)

Genera el informe de forma estructurada, clara y profesional. Responde SIEMPRE EN ESPAÑOL."""

        async with await NotebookLMClient.from_storage() as client:
            result = await client.chat.ask(notebook_id, prompt)
            return {
                "briefing": result.answer.strip(),
                "added_urls": added_urls,
                "failed_urls": failed_urls,
                "telegram_urls": telegram_urls,
            }

    except Exception as e:
        logger.error(f"Error generating briefing with NotebookLM: {e}")
        return {
            "briefing": _build_news_context(news_items),
            "added_urls": added_urls,
            "failed_urls": failed_urls,
            "telegram_urls": telegram_urls,
        }


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
