import { NextRequest, NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
import { calculateMA, calculateRSI } from '@/lib/indicators';
import { getRecommendation } from '@/lib/recommendation';
import { PriceDay } from '@/types/stock';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export interface StockInfo {
  ticker: string;
  name: string;
  exchange: string;
  currency: string;
  sector: string;
  industry: string;
  employees: number | null;
  description: string;
  // Price & technicals
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  ma50: number;
  ma200: number;
  rsi: number;
  signal: string;
  // Fundamentals
  marketCap: number | null;
  pe: number | null;
  forwardPE: number | null;
  week52High: number | null;
  week52Low: number | null;
  dividendYield: number | null;
  beta: number | null;
  revenue: number | null;
  grossMargins: number | null;
  revenueGrowth: number | null;
}

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker')?.toUpperCase().trim();

  if (!ticker || !/^[A-Z]{1,10}$/.test(ticker)) {
    return NextResponse.json({ error: 'Ticker inválido.' }, { status: 400 });
  }

  try {
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 1); // exclude today's incomplete candle when market is open
    const startDate = new Date(endDate);
    startDate.setFullYear(startDate.getFullYear() - 2);

    const [historical, summary] = await Promise.all([
      yahooFinance.historical(ticker, { period1: startDate, period2: endDate, interval: '1d' }),
      yahooFinance.quoteSummary(ticker, {
        modules: ['assetProfile', 'summaryDetail', 'financialData', 'price'],
      }),
    ]);

    if (!historical || historical.length < 201) {
      return NextResponse.json({ error: 'No hay suficientes datos históricos.' }, { status: 422 });
    }

    // Deduplicate by date
    const seen = new Map<string, (typeof historical)[0]>();
    for (const row of historical.sort((a, b) => a.date.getTime() - b.date.getTime())) {
      seen.set(row.date.toISOString().split('T')[0], row);
    }
    const prices: PriceDay[] = Array.from(seen.values()).map((row) => ({
      date: row.date.toISOString().split('T')[0],
      close: row.adjClose ?? row.close,
      volume: row.volume ?? 0,
    }));

    const closes = prices.map((p) => p.close);
    const latest = prices[prices.length - 1];
    const previous = prices[prices.length - 2];

    const price = latest.close;
    const change = price - previous.close;
    const changePercent = (change / previous.close) * 100;
    const ma50 = calculateMA(closes, 50);
    const ma200 = calculateMA(closes, 200);
    const rsi = calculateRSI(closes, 14);
    const { signal } = getRecommendation(price, ma50, ma200, rsi);

    const ap = summary.assetProfile;
    const sd = summary.summaryDetail;
    const fd = summary.financialData;
    const pr = summary.price;

    const info: StockInfo = {
      ticker,
      name: pr?.shortName ?? pr?.longName ?? ticker,
      exchange: pr?.exchangeName ?? '',
      currency: pr?.currency ?? 'USD',
      sector: ap?.sector ?? '',
      industry: ap?.industry ?? '',
      employees: ap?.fullTimeEmployees ?? null,
      description: ap?.longBusinessSummary ?? '',
      price,
      change,
      changePercent,
      volume: latest.volume,
      ma50,
      ma200,
      rsi,
      signal,
      marketCap: sd?.marketCap ?? null,
      pe: sd?.trailingPE ?? null,
      forwardPE: sd?.forwardPE ?? null,
      week52High: sd?.fiftyTwoWeekHigh ?? null,
      week52Low: sd?.fiftyTwoWeekLow ?? null,
      dividendYield: sd?.dividendYield ?? null,
      beta: sd?.beta ?? null,
      revenue: fd?.totalRevenue ?? null,
      grossMargins: fd?.grossMargins ?? null,
      revenueGrowth: fd?.revenueGrowth ?? null,
    };

    return NextResponse.json(info);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
