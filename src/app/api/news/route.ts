import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  description: string;
  thumbnail?: string;
  category: 'markets' | 'macro';
}

// ─── RSS helpers ──────────────────────────────────────────────────────────────

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(
    `<${tag}[^>]*>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))\\s*<\\/${tag}>`,
    'i',
  );
  const m = xml.match(re);
  if (!m) return '';
  return (m[1] ?? m[2] ?? '').trim();
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i');
  return xml.match(re)?.[1]?.trim() ?? '';
}

function parseRSS(xml: string, category: 'markets' | 'macro'): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;

  while ((m = itemRe.exec(xml)) !== null) {
    const raw = m[1];
    const title = extractTag(raw, 'title').replace(/\s*-\s*[^-]+$/, '').trim(); // strip " - Source"
    const url = extractTag(raw, 'link') || extractAttr(raw, 'link', 'href');
    const pubDate = extractTag(raw, 'pubDate');
    const description = extractTag(raw, 'description')
      .replace(/<[^>]+>/g, '') // strip HTML tags
      .slice(0, 200)
      .trim();
    const source = extractTag(raw, 'source') || extractAttr(raw, 'source', '');

    if (!title || !url) continue;

    items.push({
      id: Buffer.from(title).toString('base64').slice(0, 16),
      title,
      url,
      source: source || 'Google News',
      publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
      description,
      category,
    });
  }

  return items;
}

async function fetchGoogleNews(query: string, category: 'markets' | 'macro'): Promise<NewsItem[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRSS(xml, category).slice(0, 7);
  } catch {
    return [];
  }
}

async function fetchYahooNews(): Promise<NewsItem[]> {
  try {
    const data = await yahooFinance.search('stock market economy', {
      quotesCount: 0,
      newsCount: 8,
    });
    return (data.news ?? []).map((n) => ({
      id: Buffer.from(n.title).toString('base64').slice(0, 16),
      title: n.title,
      url: n.link,
      source: n.publisher ?? 'Yahoo Finance',
      publishedAt: new Date((n.providerPublishTime ?? 0) * 1000).toISOString(),
      description: '',
      thumbnail: (n as { thumbnail?: { resolutions?: { url: string }[] } }).thumbnail
        ?.resolutions?.[0]?.url,
      category: 'markets' as const,
    }));
  } catch {
    return [];
  }
}

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET() {
  const [yahooNews, marketNews, macroNews] = await Promise.all([
    fetchYahooNews(),
    fetchGoogleNews('stock market finance earnings economy', 'markets'),
    fetchGoogleNews('geopolitics conflict trade war policy central bank interest rates', 'macro'),
  ]);

  // Merge and deduplicate by title similarity
  const all: NewsItem[] = [...yahooNews, ...marketNews, ...macroNews];
  const seen = new Set<string>();
  const unique = all.filter((item) => {
    const key = item.title.toLowerCase().slice(0, 40);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by date descending
  unique.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  return NextResponse.json({ news: unique.slice(0, 20) });
}
