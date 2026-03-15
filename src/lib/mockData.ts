import { PriceDay } from '@/types/stock';

// Deterministic LCG pseudo-random number generator
function createRNG(seed: number) {
  let s = Math.abs(seed) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function hashTicker(ticker: string): number {
  let hash = 5381;
  for (let i = 0; i < ticker.length; i++) {
    hash = ((hash << 5) + hash + ticker.charCodeAt(i)) & 0x7fffffff;
  }
  return Math.abs(hash);
}

/**
 * Two-phase preset config:
 *  phase1: establishes the MA50/MA200 trend relationship
 *  phase2: controls the last ~16 days to target a specific RSI zone
 *
 * Target signals:
 *  BUY  → phase1 steady uptrend  + phase2 flat (RSI ~50)
 *  SELL → phase1 steady downtrend + phase2 strong bounce (RSI > 60, but price still < MA200)
 *  HOLD → any other combination (e.g. uptrend + high RSI)
 */
const PRESETS: Record<
  string,
  { basePrice: number; p1Trend: number; p1Noise: number; p2Trend: number; p2Noise: number }
> = {
  // BUY: uptrend → price > MA200, MA50 > MA200; then flat → RSI ~50
  AAPL:  { basePrice: 175,  p1Trend:  0.0010, p1Noise: 0.012, p2Trend:  0.000, p2Noise: 0.007 },
  NVDA:  { basePrice: 875,  p1Trend:  0.0014, p1Noise: 0.015, p2Trend:  0.000, p2Noise: 0.008 },

  // SELL: downtrend → price < MA200; then bounce → RSI > 60
  TSLA:  { basePrice: 380,  p1Trend: -0.0030, p1Noise: 0.014, p2Trend:  0.004, p2Noise: 0.009 },
  NFLX:  { basePrice: 900,  p1Trend: -0.0026, p1Noise: 0.012, p2Trend:  0.004, p2Noise: 0.009 },

  // HOLD: uptrend but RSI elevated (above 60 because strong phase2)
  MSFT:  { basePrice: 420,  p1Trend:  0.0008, p1Noise: 0.010, p2Trend:  0.003, p2Noise: 0.009 },
  GOOGL: { basePrice: 170,  p1Trend:  0.0006, p1Noise: 0.011, p2Trend:  0.003, p2Noise: 0.008 },
  META:  { basePrice: 500,  p1Trend:  0.0007, p1Noise: 0.013, p2Trend:  0.003, p2Noise: 0.009 },
  AMZN:  { basePrice: 190,  p1Trend:  0.0005, p1Noise: 0.010, p2Trend:  0.002, p2Noise: 0.008 },
};

const PHASE2_DAYS = 16; // days to control RSI

/**
 * Generates synthetic price history for `ticker`.
 * Produces at least 220 trading days — enough for MA200, MA50, and RSI(14).
 */
export function getMockPrices(ticker: string, tradingDays: number = 220): PriceDay[] {
  const upper = ticker.toUpperCase();
  const preset = PRESETS[upper];

  const seed = hashTicker(upper);
  const rng = createRNG(seed);

  const basePrice = preset?.basePrice ?? (30 + (hashTicker(upper + 'p') % 470));
  const p1Trend   = preset?.p1Trend   ?? ((hashTicker(upper + 't') % 200 - 100) / 50000);
  const p1Noise   = preset?.p1Noise   ?? 0.014;
  const p2Trend   = preset?.p2Trend   ?? p1Trend;
  const p2Noise   = preset?.p2Noise   ?? p1Noise;

  // Total calendar days needed (×1.45 to account for weekends/holidays)
  const calendarDays = Math.ceil(tradingDays * 1.45);

  const prices: PriceDay[] = [];
  let price = basePrice * 0.78; // start lower so the trend builds up organically
  const today = new Date();

  // We need to know how many trading days we'll actually generate to
  // determine when phase2 begins.
  const phase2Start = tradingDays - PHASE2_DAYS;
  let tradingDayIndex = 0;

  for (let i = calendarDays - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);

    if (date.getDay() === 0 || date.getDay() === 6) continue; // skip weekends

    const inPhase2 = tradingDayIndex >= phase2Start;
    const trend = inPhase2 ? p2Trend : p1Trend;
    const noise = inPhase2 ? p2Noise : p1Noise;

    const dailyChange = trend + (rng() - 0.5) * noise * 2;
    price = Math.max(price * (1 + dailyChange), 1);

    prices.push({
      date: date.toISOString().split('T')[0],
      close: Math.round(price * 100) / 100,
      volume: Math.floor(500_000 + rng() * 60_000_000),
    });

    tradingDayIndex++;
  }

  return prices;
}
