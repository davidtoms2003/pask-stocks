import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance({ suppressNotices: ['ripHistorical', 'yahooSurvey'] });
import { calculateMA, calculateRSI } from '@/lib/indicators';
import { getRecommendation } from '@/lib/recommendation';
import { getMockPrices } from '@/lib/mockData';
import { PriceDay } from '@/types/stock';

async function fetchYahoo(ticker: string): Promise<PriceDay[]> {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 1); // exclude today's incomplete candle when market is open
  const startDate = new Date(endDate);
  startDate.setFullYear(startDate.getFullYear() - 2); // 2 years → well over 200 trading days

  const result = await yahooFinance.historical(ticker, {
    period1: startDate,
    period2: endDate,
    interval: '1d',
  });

  if (!result || result.length === 0) {
    throw new Error(`No se encontró el ticker "${ticker}" en Yahoo Finance.`);
  }

  const sorted = result.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Deduplicate: keep the last entry per calendar date
  const seen = new Map<string, (typeof sorted)[0]>();
  for (const row of sorted) {
    const dateKey = row.date.toISOString().split('T')[0];
    seen.set(dateKey, row);
  }

  return Array.from(seen.values())
    .map((row) => ({
      date: row.date.toISOString().split('T')[0],
      close: row.adjClose ?? row.close,
      volume: row.volume ?? 0,
    }))
    .filter((row): row is PriceDay => row.close !== null && row.close !== undefined);
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker')?.toUpperCase().trim();

  if (!ticker) {
    return NextResponse.json({ error: 'El parámetro "ticker" es obligatorio.' }, { status: 400 });
  }

  if (!/^[A-Z]{1,10}$/.test(ticker)) {
    return NextResponse.json({ error: 'Ticker inválido.' }, { status: 400 });
  }

  try {
    const useMock = process.env.ALPHA_VANTAGE_API_KEY === 'mock';
    
    // Fetch historical data and real-time quote in parallel
    const [prices, summary] = await Promise.all([
      useMock ? getMockPrices(ticker) : fetchYahoo(ticker),
      !useMock ? yahooFinance.quoteSummary(ticker, { modules: ['price'] }) : Promise.resolve(null),
    ]);

    if (prices.length < 201) {
      return NextResponse.json(
        { error: 'No hay suficientes datos históricos (mínimo 201 días).' },
        { status: 422 },
      );
    }

    const closes = prices.map((p) => p.close);
    const latest = prices[prices.length - 1];
    const previous = prices[prices.length - 2];

    const pr = summary?.price;

    // Use real-time price if available, otherwise fallback to latest historical close
    // Handle null values from API explicitly
    const price = (pr?.regularMarketPrice != null) ? pr.regularMarketPrice : latest.close;
    
    // For change, prefer real-time, else calc from latest historical vs previous
    const change = (pr?.regularMarketChange != null) 
      ? pr.regularMarketChange 
      : (price - previous.close);
      
    const changePercent = (pr?.regularMarketChangePercent != null)
      ? pr.regularMarketChangePercent * 100
      : (change / previous.close) * 100;
      
    const volume = (pr?.regularMarketVolume != null) ? pr.regularMarketVolume : latest.volume;

    const ma50 = calculateMA(closes, 50);
    const ma200 = calculateMA(closes, 200);
    const rsi = calculateRSI(closes, 14);

    const { signal, explanation } = getRecommendation(price, ma50, ma200, rsi);

    return NextResponse.json({
      ticker,
      price,
      change,
      changePercent,
      volume,
      ma50,
      ma200,
      rsi,
      signal,
      explanation,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
