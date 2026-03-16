import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CACHE_PATH = path.join(process.cwd(), '.briefing-cache.json');
const REFRESH_HOUR = 10; // Refresh at 10am

interface BriefingCache {
  date: string;          // 'YYYY-MM-DD'
  generatedAt: string;   // ISO timestamp
  briefing: string;
  sourcesCount: number;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
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
  const today = todayStr();
  if (cache.date !== today) return false;

  // After REFRESH_HOUR: only valid if generated after that hour today
  const now = new Date();
  if (now.getHours() >= REFRESH_HOUR) {
    const generated = new Date(cache.generatedAt);
    const refreshThreshold = new Date(now);
    refreshThreshold.setHours(REFRESH_HOUR, 0, 0, 0);
    if (generated < refreshThreshold) return false;
  }

  return true;
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

  // 1. NewsAPI — financial queries
  if (NEWS_API_KEY) {
    const queries = [
      { q: 'stock market OR earnings OR Fed OR inflation OR economy OR Wall Street', category: 'markets' },
      { q: 'geopolitics OR trade war OR central bank OR interest rates OR recession OR GDP', category: 'macro' },
      { q: 'NYSE OR NASDAQ OR S&P500 OR Dow Jones OR stock exchange', category: 'markets' },
    ];
    await Promise.all(queries.map(async ({ q, category }) => {
      try {
        const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=publishedAt&pageSize=20&apiKey=${NEWS_API_KEY}`;
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

        // Extract real article URL from description HTML (Google News RSS embeds the original
        // article link inside <description> as an <a href="...">). This avoids the Google News
        // redirect URLs that trigger bot-detection when followed programmatically.
        const descRaw = raw.match(/<description[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/i)?.[1] ?? '';
        const descHtml = descRaw.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
        const realUrl = descHtml.match(/href="(https?:\/\/(?!news\.google\.com)[^"]+)"/i)?.[1];

        // Skip items where we couldn't find a direct article URL
        if (!title || !realUrl) continue;

        all.push({ title, description: '', url: realUrl, source, category, publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString() });
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

  // Sort newest first, cap at 40
  unique.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
  return unique.slice(0, 40);
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET() {
  const cache = readCache();
  if (cache && isCacheValid(cache)) {
    return NextResponse.json({ briefing: cache.briefing, sourcesCount: cache.sourcesCount, fromCache: true });
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
      date: todayStr(),
      generatedAt: new Date().toISOString(),
      briefing: data.briefing,
      sourcesCount: news.length,
    };
    writeCache(cacheData);

    return NextResponse.json({ briefing: data.briefing, sourcesCount: news.length, fromCache: false });
  } catch (e) {
    return NextResponse.json({ error: `No se pudo generar el briefing: ${e}` }, { status: 503 });
  }
}
