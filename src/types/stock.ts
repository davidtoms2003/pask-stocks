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

export interface FinnhubData {
  recommendation: {
    buy: number;
    hold: number;
    period: string;
    sell: number;
    strongBuy: number;
    strongSell: number;
    symbol: string;
  } | null;
  sentiment: {
    buzz: {
      articlesInLastWeek: number;
      buzz: number;
      weeklyAverage: number;
    };
    companyNewsScore: number;
    sectorAverageBullishPercent: number;
    sectorAverageNewsScore: number;
    sentiment: {
      bearishPercent: number;
      bullishPercent: number;
    };
    symbol: string;
  } | null;
}
