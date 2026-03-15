import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

import type { EnhancedNewsItem } from '@/types/news';

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_PATH = path.join(process.cwd(), '.news-cache.json');

interface Cache {
  date: string; // 'YYYY-MM-DD'
  news: EnhancedNewsItem[];
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function readCache(): Cache | null {
  try {
    const raw = fs.readFileSync(CACHE_PATH, 'utf-8');
    const cache = JSON.parse(raw) as Cache;
    if (cache.date === todayStr()) return cache;
    return null;
  } catch {
    return null;
  }
}

function writeCache(news: EnhancedNewsItem[]) {
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify({ date: todayStr(), news }), 'utf-8');
  } catch { /* silent */ }
}

// ─── NewsAPI ──────────────────────────────────────────────────────────────────

const NEWS_API_KEY = process.env.NEWS_API_KEY ?? '';

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

  const queries = [
    { q: 'stock market OR earnings OR Fed OR inflation OR economy', category: 'markets' as const },
    { q: 'geopolitics OR trade war OR central bank OR interest rates OR recession', category: 'macro' as const },
  ];

  const results = await Promise.all(
    queries.map(async ({ q, category }) => {
      try {
        const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=publishedAt&pageSize=15&apiKey=${NEWS_API_KEY}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (!res.ok) return [];
        const data = await res.json() as { articles: NewsApiArticle[] };
        return (data.articles ?? [])
          .filter(a => a.title && a.url && !a.title.startsWith('[Removed]'))
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

import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

async function fetchYahooFallback(): Promise<EnhancedNewsItem[]> {
  try {
    const data = await yahooFinance.search('stock market economy finance earnings', {
      quotesCount: 0,
      newsCount: 10,
    });
    return (data.news ?? []).map((n) => ({
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

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET() {
  // Serve from cache if same day
  const cached = readCache();
  if (cached) {
    return NextResponse.json({ news: cached.news, fromCache: true });
  }

  // Fetch fresh
  const [newsApiItems, yahooItems] = await Promise.all([
    fetchNewsApi(),
    fetchYahooFallback(),
  ]);

  // NewsAPI is primary; Yahoo fills gaps if NewsAPI key is missing
  const all = newsApiItems.length > 0 ? [...newsApiItems, ...yahooItems] : yahooItems;

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

  writeCache(news);

  return NextResponse.json({ news });
}
