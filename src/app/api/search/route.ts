import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim();
  if (!q || q.length < 1) {
    return NextResponse.json({ results: [] });
  }

  try {
    const data = await yahooFinance.search(q, { newsCount: 0 });
    const results = (data.quotes ?? [])
      .filter(
        (item) =>
          item.isYahooFinance &&
          (item.typeDisp?.toLowerCase() === 'equity' || item.typeDisp?.toLowerCase() === 'etf') &&
          /^[A-Z]{1,10}$/.test(item.symbol),
      )
      .slice(0, 8)
      .map((item) => ({
        ticker: item.symbol,
        name: (item as { longname?: string; shortname?: string }).longname ??
              (item as { shortname?: string }).shortname ??
              item.symbol,
      }));

    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
