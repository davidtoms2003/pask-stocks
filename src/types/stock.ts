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
  priceTarget: {
    lastUpdated: string;
    symbol: string;
    targetHigh: number;
    targetLow: number;
    targetMean: number;
    targetMedian: number;
  } | null;
  basicFinancials: {
    '10DayAverageTradingVolume': number;
    '52WeekHigh': number;
    '52WeekLow': number;
    '52WeekPriceReturnDaily': number;
    beta: number;
    peBasicExclExtraTTM: number;
    peExclExtraTTM: number;
    epsBasicExclExtraItemsTTM: number;
    epsExclExtraItemsTTM: number;
    marketCapitalization: number;
    dividendYieldIndicatedAnnual: number;
    priceToBookMRQ: number;
    roeTTM: number;
    revenuePerShareTTM: number;
  } | null;
  profile: {
    country: string;
    currency: string;
    exchange: string;
    finnhubIndustry: string;
    ipo: string;
    logo: string;
    marketCapitalization: number;
    name: string;
    phone: string;
    shareOutstanding: number;
    ticker: string;
    weburl: string;
  } | null;
  peers: string[] | null;
}
