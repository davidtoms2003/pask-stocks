export type Signal = 'BUY' | 'SELL' | 'HOLD';

export interface PriceDay {
  date: string;
  close: number;
  volume: number;
}

export interface StockResult {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  ma50: number;
  ma200: number;
  rsi: number;
  signal: Signal;
  explanation: string;
}
