'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { StockResult, Signal } from '@/types/stock';

const SIGNAL_CONFIG: Record<
  Signal,
  { label: string; badgeBg: string; badgeText: string; border: string; glow: string }
> = {
  BUY: {
    label: 'COMPRAR',
    badgeBg: 'bg-emerald-500',
    badgeText: 'text-white',
    border: 'border-emerald-500',
    glow: 'shadow-emerald-500/20',
  },
  SELL: {
    label: 'VENDER',
    badgeBg: 'bg-red-500',
    badgeText: 'text-white',
    border: 'border-red-500',
    glow: 'shadow-red-500/20',
  },
  HOLD: {
    label: 'MANTENER',
    badgeBg: 'bg-amber-500',
    badgeText: 'text-white',
    border: 'border-amber-500',
    glow: 'shadow-amber-500/20',
  },
};

const DEMO_TICKERS = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'NFLX'];

interface Suggestion {
  ticker: string;
  name: string;
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StockResult | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiSignal, setAiSignal] = useState<Signal | null>(null);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchLoading, setSearchLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAiRecommendation = async (stockData: StockResult) => {
    setAiLoading(true);
    setAiSignal(null);
    setAiExplanation(null);
    try {
      const res = await fetch('/api/ai-recommend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stockData),
      });
      const data = await res.json();
      if (data.signal && data.explanation) {
        setAiSignal(data.signal as Signal);
        setAiExplanation(data.explanation);
      } else {
        setAiExplanation(data.error ?? 'Sin respuesta.');
      }
    } catch {
      setAiExplanation('No se pudo conectar con el servicio de IA.');
    } finally {
      setAiLoading(false);
    }
  };

  const analyze = async (symbol: string, name?: string) => {
    const t = symbol.trim().toUpperCase();
    if (!t) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setAiSignal(null);
    setAiExplanation(null);
    setCompanyName(name ?? null);
    setSuggestions([]);
    setShowDropdown(false);

    try {
      const res = await fetch(`/api/analyze?ticker=${t}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? 'Error desconocido.');
      } else {
        const stockData = data as StockResult;
        setResult(stockData);
        fetchAiRecommendation(stockData);
      }
    } catch {
      setError('Error de conexión. Asegúrate de que el servidor está en marcha.');
    } finally {
      setLoading(false);
    }
  };

  const searchSuggestions = useCallback(async (q: string) => {
    if (q.length < 1) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    setSearchLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setSuggestions(data.results ?? []);
      setShowDropdown((data.results ?? []).length > 0);
      setActiveIndex(-1);
    } catch {
      setSuggestions([]);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toUpperCase();
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => searchSuggestions(val), 300);
  };

  const handleSelect = (s: Suggestion) => {
    setQuery(s.ticker);
    setSuggestions([]);
    setShowDropdown(false);
    analyze(s.ticker, s.name);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeIndex >= 0 && suggestions[activeIndex]) {
      handleSelect(suggestions[activeIndex]);
    } else {
      analyze(query);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
      setActiveIndex(-1);
    }
  };

  const handleDemo = (t: string) => {
    setQuery(t);
    analyze(t);
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const activeSignal = aiSignal ?? result?.signal ?? null;
  const cfg = activeSignal ? SIGNAL_CONFIG[activeSignal] : null;

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-black text-sm select-none">
            P
          </div>
          <span className="font-bold text-base tracking-tight">PASK Stocks</span>
          <span className="ml-auto text-gray-500 text-xs">Análisis técnico · v1</span>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-12 space-y-8">
        {/* Hero */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Analizador de acciones</h1>
          <p className="text-gray-400 text-sm">
            Indicadores técnicos · MA50 · MA200 · RSI · Señal Buy / Sell / Hold
          </p>
        </div>

        {/* Search form */}
        <div className="relative">
          <form onSubmit={handleSubmit} className="flex gap-2">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
                placeholder="Ticker o nombre de empresa…"
                maxLength={60}
                className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 font-mono text-base tracking-widest placeholder:text-gray-600 placeholder:tracking-normal focus:outline-none focus:border-blue-500 transition-colors"
                autoFocus
                autoComplete="off"
              />
              {searchLoading && (
                <span className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              )}
            </div>
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed px-6 py-3 rounded-xl font-semibold text-sm transition-colors whitespace-nowrap"
            >
              {loading ? 'Analizando…' : 'Analizar'}
            </button>
          </form>

          {/* Dropdown */}
          {showDropdown && suggestions.length > 0 && (
            <div
              ref={dropdownRef}
              className="absolute z-20 left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded-xl overflow-hidden shadow-2xl"
            >
              {suggestions.map((s, i) => (
                <button
                  key={s.ticker}
                  type="button"
                  onMouseDown={() => handleSelect(s)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    i === activeIndex ? 'bg-blue-600/30' : 'hover:bg-gray-800'
                  } ${i > 0 ? 'border-t border-gray-800' : ''}`}
                >
                  <span className="font-mono font-bold text-sm text-white w-20 shrink-0">
                    {s.ticker}
                  </span>
                  <span className="text-gray-400 text-sm truncate">{s.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Demo shortcuts */}
        {!result && !loading && (
          <div className="flex flex-wrap items-center gap-2 justify-center text-sm">
            <span className="text-gray-600">Prueba con:</span>
            {DEMO_TICKERS.map((t) => (
              <button
                key={t}
                onClick={() => handleDemo(t)}
                className="font-mono px-3 py-1 rounded-lg border border-gray-800 text-gray-400 hover:border-blue-600 hover:text-blue-400 transition-colors"
              >
                {t}
              </button>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-950/60 border border-red-800 rounded-xl px-4 py-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-3 animate-pulse">
            <div className="h-28 bg-gray-900 rounded-2xl" />
            <div className="grid grid-cols-3 gap-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-20 bg-gray-900 rounded-xl" />
              ))}
            </div>
            <div className="h-32 bg-gray-900 rounded-2xl" />
          </div>
        )}

        {/* Results */}
        {result && cfg && (
          <div className="space-y-3">
            {/* Price card */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex items-start justify-between">
              <div>
                <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-0.5">
                  {result.ticker}
                </p>
                {companyName && (
                  <p className="text-gray-400 text-sm mb-1">{companyName}</p>
                )}
                <p className="text-4xl font-bold tabular-nums">${result.price.toFixed(2)}</p>
                <p
                  className={`mt-1 text-sm font-medium tabular-nums ${
                    result.change >= 0 ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {result.change >= 0 ? '+' : ''}
                  {result.change.toFixed(2)}&nbsp;(
                  {result.changePercent >= 0 ? '+' : ''}
                  {result.changePercent.toFixed(2)}%)
                </p>
              </div>
              <div className="text-right">
                <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">
                  Volumen
                </p>
                <p className="text-xl font-semibold tabular-nums">
                  {result.volume >= 1_000_000
                    ? `${(result.volume / 1_000_000).toFixed(1)}M`
                    : `${(result.volume / 1_000).toFixed(0)}K`}
                </p>
              </div>
            </div>

            {/* Indicators */}
            <div className="grid grid-cols-3 gap-3">
              <IndicatorCard
                label="MA 50"
                value={`$${result.ma50.toFixed(2)}`}
                hint={result.price > result.ma50 ? '↑ precio sobre MA50' : '↓ precio bajo MA50'}
                positive={result.price > result.ma50}
              />
              <IndicatorCard
                label="MA 200"
                value={`$${result.ma200.toFixed(2)}`}
                hint={result.price > result.ma200 ? '↑ precio sobre MA200' : '↓ precio bajo MA200'}
                positive={result.price > result.ma200}
              />
              <IndicatorCard
                label="RSI (14)"
                value={result.rsi.toFixed(1)}
                hint={
                  result.rsi > 70
                    ? 'Sobrecompra'
                    : result.rsi < 30
                    ? 'Sobreventa'
                    : 'Zona neutral'
                }
                positive={result.rsi >= 40 && result.rsi <= 60}
              />
            </div>

            {/* Recommendation (signal from AI, falls back to technical while loading) */}
            <div
              className={`bg-gray-900 border-2 ${cfg.border} rounded-2xl p-6 shadow-xl ${cfg.glow} transition-colors duration-500`}
            >
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                {aiLoading ? (
                  <span className="flex items-center gap-2 bg-gray-700 text-gray-300 font-black text-lg px-5 py-1.5 rounded-xl tracking-widest animate-pulse">
                    <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin inline-block" />
                    Analizando…
                  </span>
                ) : (
                  <span
                    className={`${cfg.badgeBg} ${cfg.badgeText} font-black text-lg px-5 py-1.5 rounded-xl tracking-widest`}
                  >
                    {cfg.label}
                  </span>
                )}
                <span className="text-gray-500 text-xs">Señal IA · arcee-ai/trinity-large-preview</span>
              </div>
              {aiLoading ? (
                <div className="space-y-2 animate-pulse">
                  <div className="h-3 bg-gray-800 rounded w-full" />
                  <div className="h-3 bg-gray-800 rounded w-5/6" />
                  <div className="h-3 bg-gray-800 rounded w-4/6" />
                </div>
              ) : (
                <p className="text-gray-300 text-sm leading-relaxed">
                  {aiExplanation ?? result.explanation}
                </p>
              )}
            </div>

            {/* New search */}
            <button
              onClick={() => {
                setResult(null);
                setError(null);
                setQuery('');
                setCompanyName(null);
                setAiSignal(null);
                setAiExplanation(null);
                setTimeout(() => inputRef.current?.focus(), 50);
              }}
              className="w-full py-3 rounded-xl border border-gray-800 text-gray-500 hover:text-white hover:border-gray-600 transition-colors text-sm"
            >
              Analizar otro ticker
            </button>
          </div>
        )}
      </div>

      <footer className="text-center text-gray-700 text-xs py-8">
        Datos simulados (mock) · Solo educativo · No es asesoramiento financiero
      </footer>
    </main>
  );
}

function IndicatorCard({
  label,
  value,
  hint,
  positive,
}: {
  label: string;
  value: string;
  hint: string;
  positive: boolean;
}) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className={`text-xs mt-1 ${positive ? 'text-emerald-500' : 'text-red-400'}`}>{hint}</p>
    </div>
  );
}
