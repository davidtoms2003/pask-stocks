import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CACHE_PATH = path.join(process.cwd(), '.briefing-cache.json');

// ─── Time slots ───────────────────────────────────────────────────────────────
// News refresh at these hours: 00:00, 09:00, 14:00, 19:00
const REFRESH_SLOTS = [0, 9, 14, 19];

function getCurrentSlot(): number {
  const hour = new Date().getHours();
  return [...REFRESH_SLOTS].reverse().find(slot => hour >= slot) ?? 0;
}

function slotLabel(slot: number): string {
  return `${String(slot).padStart(2, '0')}:00`;
}

// ─── Cache ────────────────────────────────────────────────────────────────────

interface BriefingCache {
  date: string;         // 'YYYY-MM-DD'
  slot: number;         // 0 | 9 | 14 | 19
  generatedAt: string;  // ISO timestamp
  briefing: string;
  sourcesCount: number;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatDate(dateStr: string): string {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

function readCache(): BriefingCache | null {
  try {
    const raw = fs.readFileSync(CACHE_PATH, 'utf-8');
    return JSON.parse(raw) as BriefingCache;
  } catch {
    return null;
  }
}

function writeCache(data: BriefingCache) {
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(data), 'utf-8');
  } catch { /* silent */ }
}

function isCacheValid(cache: BriefingCache): boolean {
  return cache.date === todayStr() && cache.slot === getCurrentSlot();
}

// ─── News fetching ────────────────────────────────────────────────────────────

const NEWS_API_KEY = process.env.NEWS_API_KEY ?? '';

interface NewsItem {
  title: string;
  description: string;
  fullContent?: string;
  url: string;
  source: string;
  category: string;
  publishedAt: string;
}

async function fetchAllFinancialNews(): Promise<NewsItem[]> {
  const all: NewsItem[] = [];

  // 1. NewsAPI — financial queries (últimas 48 horas para frescura garantizada)
  const from = new Date(Date.now() - 48 * 3_600_000).toISOString().slice(0, 10);
  if (NEWS_API_KEY) {
    const queries = [
      { q: '"stock market" OR "Wall Street" OR earnings OR "S&P 500" OR "Federal Reserve" OR inflation', category: 'markets' },
      { q: '"trade war" OR "central bank" OR "interest rates" OR recession OR tariffs OR GDP', category: 'macro' },
      { q: 'NYSE OR NASDAQ OR "Dow Jones" OR "stock exchange" OR "hedge fund"', category: 'markets' },
    ];
    await Promise.all(queries.map(async ({ q, category }) => {
      try {
        const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=publishedAt&from=${from}&pageSize=20&apiKey=${NEWS_API_KEY}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) return;
        const data = await res.json() as { articles: { title: string; description: string | null; content: string | null; url: string; source: { name: string }; publishedAt: string }[] };
        for (const a of data.articles ?? []) {
          if (!a.title || a.title.startsWith('[Removed]')) continue;
          all.push({
            title: a.title.replace(/\s*-\s*[^-]+$/, '').trim(),
            description: (a.description ?? '').slice(0, 300),
            fullContent: a.content?.replace(/\s*\[[\+\d]+ chars\]$/, '').trim().slice(0, 500),
            url: a.url,
            source: a.source.name,
            category,
            publishedAt: a.publishedAt,
          });
        }
      } catch { /* skip */ }
    }));
  }

  // 2. Google News RSS — financial topics
  const rssQueries = [
    { q: 'stock market earnings economy', category: 'markets' },
    { q: 'Federal Reserve interest rates inflation', category: 'macro' },
    { q: 'S&P 500 NASDAQ Dow Jones', category: 'markets' },
    { q: 'geopolitics trade war sanctions GDP', category: 'macro' },
  ];
  await Promise.all(rssQueries.map(async ({ q, category }) => {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000) });
      if (!res.ok) return;
      const xml = await res.text();
      const itemRe = /<item>([\s\S]*?)<\/item>/g;
      let m: RegExpExecArray | null;
      while ((m = itemRe.exec(xml)) !== null) {
        const raw = m[1];
        const title = (raw.match(/<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i)?.[1] ?? '').replace(/\s*-\s*[^-]+$/, '').trim();
        const pubDate = raw.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1]?.trim() ?? '';
        const source = raw.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1]?.trim() ?? 'Google News';
        const linkMatch = raw.match(/<link>(https?:\/\/[^<]+)<\/link>/i);
        const articleUrl = linkMatch?.[1]?.trim();
        if (!title || !articleUrl) continue;
        all.push({ title, description: '', url: articleUrl, source, category, publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString() });
      }
    } catch { /* skip */ }
  }));

  // 3. Yahoo Finance
  try {
    const { default: YahooFinance } = await import('yahoo-finance2');
    const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
    const data = await yf.search('stock market economy finance earnings', { quotesCount: 0, newsCount: 15 });
    for (const n of data.news ?? []) {
      all.push({
        title: n.title,
        description: (n as { summary?: string }).summary ?? '',
        url: n.link,
        source: n.publisher ?? 'Yahoo Finance',
        category: 'markets',
        publishedAt: new Date(((n.providerPublishTime ?? 0)) * 1000).toISOString(),
      });
    }
  } catch { /* skip */ }

  // Deduplicate by title
  const seen = new Set<string>();
  const unique = all.filter(item => {
    const key = item.title.toLowerCase().slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  unique.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  return unique.slice(0, 40);
}

// ─── POST: generate briefing from news already loaded in the frontend ─────────

export async function POST(request: NextRequest) {
  const { news } = await request.json() as { news: NewsItem[] };

  if (!news?.length) {
    return NextResponse.json({ error: 'No se recibieron noticias.' }, { status: 400 });
  }

  const urls = news.map(n => n.url).filter(Boolean);

  try {
    const res = await fetch('http://localhost:8000/api/daily_briefing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ news_items: news, urls }),
      signal: AbortSignal.timeout(180000),
    });

    if (!res.ok) throw new Error(`Backend error: ${res.status}`);
    const data = await res.json() as { briefing: string; added_urls: string[]; failed_urls: string[]; telegram_urls: string[] };

    return NextResponse.json({
      briefing: data.briefing,
      addedUrls: data.added_urls ?? [],
      failedUrls: data.failed_urls ?? [],
      telegramUrls: data.telegram_urls ?? [],
    });
  } catch (e) {
    return NextResponse.json({ error: `No se pudo generar el resumen: ${e}` }, { status: 503 });
  }
}

// ─── GET: legacy cached briefing ──────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const today = todayStr();
  const slot  = getCurrentSlot();
  const formattedDate = formatDate(today);
  const label = slotLabel(slot);

  // Return from cache if valid for today's current slot
  const cache = readCache();
  if (cache && isCacheValid(cache)) {
    return NextResponse.json({
      briefing: cache.briefing,
      sourcesCount: cache.sourcesCount,
      fromCache: true,
      formattedDate,
      slot,
      slotLabel: label,
    });
  }

  // Fetch fresh news
  const news = await fetchAllFinancialNews();
  const urls = news.map(n => n.url).filter(Boolean);

  // Call Python backend for briefing + notebook refresh
  try {
    const res = await fetch('http://localhost:8000/api/daily_briefing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ news_items: news, urls }),
      signal: AbortSignal.timeout(90000),
    });

    if (!res.ok) throw new Error(`Backend error: ${res.status}`);
    const data = await res.json() as { briefing: string };

    const cacheData: BriefingCache = {
      date: today,
      slot,
      generatedAt: new Date().toISOString(),
      briefing: data.briefing,
      sourcesCount: news.length,
    };
    writeCache(cacheData);

    return NextResponse.json({
      briefing: data.briefing,
      sourcesCount: news.length,
      fromCache: false,
      formattedDate,
      slot,
      slotLabel: label,
    });
  } catch (e) {
    return NextResponse.json({ error: `No se pudo generar el briefing: ${e}` }, { status: 503 });
  }
}
