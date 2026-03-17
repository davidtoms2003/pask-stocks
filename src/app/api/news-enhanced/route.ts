import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

import type { EnhancedNewsItem } from '@/types/news';

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_PATH = path.join(process.cwd(), '.news-cache.json');

// Franjas horarias de refresco: 00:00, 09:00, 14:00, 19:00
const REFRESH_SLOTS = [0, 9, 14, 19];

function getCurrentSlot(): number {
  const hour = new Date().getHours();
  return [...REFRESH_SLOTS].reverse().find(slot => hour >= slot) ?? 0;
}

interface Cache {
  date: string;           // 'YYYY-MM-DD'
  slot: number;           // 0 | 9 | 14 | 19
  news: EnhancedNewsItem[];
  sourcesSynced?: boolean;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function readCache(): Cache | null {
  try {
    const raw = fs.readFileSync(CACHE_PATH, 'utf-8');
    const cache = JSON.parse(raw) as Cache;
    // Valid only if same day AND same time slot
    if (cache.date !== todayStr() || cache.slot !== getCurrentSlot()) return null;
    // Also invalid if the newest article is more than 48 hours old (stale content)
    if (cache.news.length > 0) {
      const newest = Math.max(...cache.news.map(n => new Date(n.publishedAt).getTime()));
      const hoursOld = (Date.now() - newest) / 3_600_000;
      if (hoursOld > 48) return null;
    }
    return cache;
  } catch {
    return null;
  }
}

function writeCache(news: EnhancedNewsItem[], sourcesSynced = false) {
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify({ date: todayStr(), slot: getCurrentSlot(), news, sourcesSynced }), 'utf-8');
  } catch { /* silent */ }
}


// ─── NewsAPI ──────────────────────────────────────────────────────────────────

const NEWS_API_KEY = process.env.NEWS_API_KEY ?? '';

// Fuentes de confianza financiera/económica
const TRUSTED_FINANCIAL_SOURCES = new Set([
  'Reuters', 'Bloomberg', 'CNBC', 'MarketWatch', 'The Wall Street Journal',
  'Financial Times', 'Forbes', 'Barron\'s', 'Investopedia', 'Seeking Alpha',
  'Yahoo Finance', 'Motley Fool', 'Business Insider', 'The Economist',
  'Associated Press', 'Axios', 'Fortune', 'The New York Times', 'NBC News',
  'CNN Business', 'CNN', 'BBC News', 'The Guardian', 'Washington Post',
  'Politico', 'TechCrunch', 'Wired', 'The Verge', 'Ars Technica',
  'Livemint', 'Economic Times', 'Slashdot.org',
]);

interface NewsApiArticle {
  title: string;
  description: string | null;
  content: string | null;
  url: string;
  urlToImage: string | null;
  publishedAt: string;
  source: { name: string };
}

async function fetchNewsApi(): Promise<EnhancedNewsItem[]> {
  if (!NEWS_API_KEY) return [];

  // Fetch from last 48 hours to ensure freshness
  const from = new Date(Date.now() - 48 * 3_600_000).toISOString().slice(0, 10);

  const queries = [
    { q: '"stock market" OR "Wall Street" OR earnings OR "S&P 500" OR "Federal Reserve" OR inflation', category: 'markets' as const },
    { q: '"trade war" OR "central bank" OR "interest rates" OR recession OR tariffs OR "GDP"', category: 'macro' as const },
  ];

  const results = await Promise.all(
    queries.map(async ({ q, category }) => {
      try {
        const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=publishedAt&from=${from}&pageSize=20&apiKey=${NEWS_API_KEY}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) return [];
        const data = await res.json() as { articles: NewsApiArticle[] };
        return (data.articles ?? [])
          .filter(a => a.title && a.url && !a.title.startsWith('[Removed]') && TRUSTED_FINANCIAL_SOURCES.has(a.source.name))
          .map((a): EnhancedNewsItem => ({
            id: Buffer.from(a.title).toString('base64').slice(0, 16),
            title: a.title.replace(/\s*-\s*[^-]+$/, '').trim(),
            url: a.url,
            source: a.source.name,
            publishedAt: a.publishedAt,
            description: (a.description ?? '').slice(0, 300),
            thumbnail: a.urlToImage ?? undefined,
            category,
            // NewsAPI content comes truncated with "[+N chars]" — clean it up
            fullContent: a.content
              ? a.content.replace(/\s*\[[\+\d]+ chars\]$/, '').trim().slice(0, 400) || undefined
              : undefined,
          }));
      } catch {
        return [];
      }
    })
  );

  return results.flat();
}

// ─── Yahoo Finance fallback ────────────────────────────────────────────────────

// Only publishers that reliably produce financial/markets content
const FINANCE_PUBLISHERS = new Set([
  'Reuters', 'Bloomberg', 'CNBC', 'MarketWatch', 'The Wall Street Journal',
  'Financial Times', 'Forbes', 'Barron\'s', 'Investopedia', 'Seeking Alpha',
  'Yahoo Finance', 'Motley Fool', 'Business Insider', 'The Economist',
  'Associated Press', 'Axios', 'The New York Times', 'NBC News', 'CNN',
  'Fortune', 'Fast Company', 'TechCrunch', 'Wired',
]);

import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function fetchYahooFallback(): Promise<EnhancedNewsItem[]> {
  try {
    const data = await yahooFinance.search('stock market economy finance earnings', {
      quotesCount: 0,
      newsCount: 20,
    });
    return (data.news ?? [])
      .filter(n => FINANCE_PUBLISHERS.has(n.publisher ?? ''))
      .map((n) => ({
        id: Buffer.from(n.title).toString('base64').slice(0, 16),
        title: n.title,
        url: n.link,
        source: n.publisher ?? 'Yahoo Finance',
        publishedAt: new Date((n.providerPublishTime ?? 0) * 1000).toISOString(),
        description: (n as { summary?: string }).summary ?? '',
        thumbnail: (n as { thumbnail?: { resolutions?: { url: string }[] } }).thumbnail?.resolutions?.[0]?.url,
        category: 'markets' as const,
        tickers: n.relatedTickers
          ? Array.isArray(n.relatedTickers) ? n.relatedTickers : [n.relatedTickers]
          : undefined,
      }));
  } catch {
    return [];
  }
}

// ─── Google News RSS ──────────────────────────────────────────────────────────

async function fetchGoogleNewsRss(): Promise<EnhancedNewsItem[]> {
  const rssQueries = [
    { q: 'stock market earnings "S&P 500" Wall Street', category: 'markets' as const },
    { q: 'Federal Reserve interest rates inflation recession', category: 'macro' as const },
    { q: 'trade war tariffs GDP economy', category: 'macro' as const },
  ];
  const items: EnhancedNewsItem[] = [];
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
        // Google News RSS now puts the link directly in <link>, not in description
        const linkMatch = raw.match(/<link>(https?:\/\/[^<]+)<\/link>/i);
        const articleUrl = linkMatch?.[1]?.trim();
        if (!title || !articleUrl) continue;
        items.push({
          id: Buffer.from(title).toString('base64').slice(0, 16),
          title,
          url: articleUrl,
          source,
          publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
          description: '',
          category,
        });
      }
    } catch { /* skip */ }
  }));
  return items;
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET() {
  // Serve from cache if same day
  const cached = readCache();
  if (cached) {
    return NextResponse.json({ news: cached.news, fromCache: true });
  }

  // Fetch fresh: NewsAPI (filtrado) + Google News RSS siempre, Yahoo solo si no hay nada más
  const [newsApiItems, rssItems] = await Promise.all([fetchNewsApi(), fetchGoogleNewsRss()]);
  const yahooItems = (newsApiItems.length + rssItems.length) === 0 ? await fetchYahooFallback() : [];

  const all = [...newsApiItems, ...rssItems, ...yahooItems];

  // Deduplicate by title
  const seen = new Set<string>();
  const unique = all.filter((item) => {
    const key = item.title.toLowerCase().slice(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort newest first
  unique.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  const news = unique.slice(0, 20);

  // Write cache as synced immediately — sync is handled by daily-briefing route
  writeCache(news, true);

  return NextResponse.json({ news });
}

