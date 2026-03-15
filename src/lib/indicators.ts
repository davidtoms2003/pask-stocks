/**
 * Calculates Simple Moving Average for the last `period` prices.
 */
export function calculateMA(prices: number[], period: number): number {
  if (prices.length < period) return 0;
  const slice = prices.slice(prices.length - period);
  return slice.reduce((sum, p) => sum + p, 0) / period;
}

/**
 * Calculates RSI (Relative Strength Index) using the last `period` price changes.
 * Standard period is 14.
 */
export function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;

  const changes = prices.slice(1).map((p, i) => p - prices[i]);
  const recentChanges = changes.slice(changes.length - period);

  let gains = 0;
  let losses = 0;

  for (const change of recentChanges) {
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;

  if (avgLoss === 0) return 100;

  const rs = avgGain / avgLoss;
  return Math.round((100 - 100 / (1 + rs)) * 100) / 100;
}
