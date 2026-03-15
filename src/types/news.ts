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

export interface EnhancedNewsItem extends NewsItem {
  fullContent?: string;
  tickers?: string[];
}

export interface NewsAnalysis {
  summary: string;
  marketImpact: string;
  affected: { name: string; effect: 'positivo' | 'negativo' | 'mixto'; reason: string }[];
}