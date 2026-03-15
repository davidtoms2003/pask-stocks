import { Signal } from '@/types/stock';

export interface Recommendation {
  signal: Signal;
  explanation: string;
}

/**
 * Generates a Buy / Sell / Hold signal based on simple technical rules:
 *
 * BUY  → price > MA200 AND MA50 > MA200 (golden cross) AND 40 ≤ RSI ≤ 60
 * SELL → price < MA200 AND RSI > 60
 * HOLD → any other case
 */
export function getRecommendation(
  price: number,
  ma50: number,
  ma200: number,
  rsi: number,
): Recommendation {
  if (price > ma200 && ma50 > ma200 && rsi >= 40 && rsi <= 60) {
    return {
      signal: 'BUY',
      explanation:
        `El precio ($${price.toFixed(2)}) cotiza por encima de la MA200 ($${ma200.toFixed(2)}), ` +
        `la MA50 ($${ma50.toFixed(2)}) está por encima de la MA200 (golden cross), ` +
        `y el RSI (${rsi.toFixed(1)}) se encuentra en zona neutral (40–60), ` +
        `indicando impulso alcista sin sobrecompra.`,
    };
  }

  if (price < ma200 && rsi > 60) {
    return {
      signal: 'SELL',
      explanation:
        `El precio ($${price.toFixed(2)}) cotiza por debajo de la MA200 ($${ma200.toFixed(2)}), ` +
        `señal de tendencia bajista, y el RSI (${rsi.toFixed(1)}) supera 60, ` +
        `indicando sobrecompra relativa en un contexto negativo.`,
    };
  }

  return {
    signal: 'HOLD',
    explanation:
      `Las condiciones actuales no generan señal clara de compra ni de venta. ` +
      `Precio: $${price.toFixed(2)} | MA50: $${ma50.toFixed(2)} | ` +
      `MA200: $${ma200.toFixed(2)} | RSI: ${rsi.toFixed(1)}. ` +
      `Se recomienda esperar confirmación de tendencia.`,
  };
}
