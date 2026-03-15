'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { StockResult, Signal } from '@/types/stock';
import { StockInfo } from '@/app/api/stock-info/route';
import type { NewsItem } from '@/app/api/news/route';
import type { EnhancedNewsItem, NewsAnalysis } from '@/types/news';

// ─── Signal config ────────────────────────────────────────────────────────────

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

// ─── Types ────────────────────────────────────────────────────────────────────

interface Suggestion {
  ticker: string;
  name: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

// ─── Shared autocomplete hook ─────────────────────────────────────────────────

function useAutocomplete() {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [searchLoading, setSearchLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null) as React.RefObject<HTMLDivElement>;

  const searchSuggestions = useCallback(async (q: string) => {
    if (q.length < 1) { setSuggestions([]); setShowDropdown(false); return; }
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, onEnter: () => void) => {
    if (showDropdown) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex(i => Math.min(i + 1, suggestions.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex(i => Math.max(i - 1, -1)); return; }
      if (e.key === 'Escape') { setShowDropdown(false); setActiveIndex(-1); return; }
    }
    if (e.key === 'Enter') { e.preventDefault(); onEnter(); }
  };

  const clear = () => { setQuery(''); setSuggestions([]); setShowDropdown(false); setActiveIndex(-1); };

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return { query, setQuery, suggestions, setSuggestions, showDropdown, setShowDropdown, activeIndex, searchLoading, inputRef, dropdownRef, handleInputChange, handleKeyDown, clear };
}

// ─── Dropdown component ───────────────────────────────────────────────────────

function Dropdown({ suggestions, activeIndex, dropdownRef, onSelect }: {
  suggestions: Suggestion[];
  activeIndex: number;
  dropdownRef: React.RefObject<HTMLDivElement>;
  onSelect: (s: Suggestion) => void;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div ref={dropdownRef} className="absolute z-20 left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded-xl overflow-hidden shadow-2xl">
      {suggestions.map((s, i) => (
        <button
          key={s.ticker}
          type="button"
          onMouseDown={() => onSelect(s)}
          className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${i === activeIndex ? 'bg-blue-600/30' : 'hover:bg-gray-800'} ${i > 0 ? 'border-t border-gray-800' : ''}`}
        >
          <span className="font-mono font-bold text-sm text-white w-20 shrink-0">{s.ticker}</span>
          <span className="text-gray-400 text-sm truncate">{s.name}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Root page ────────────────────────────────────────────────────────────────

const TAB_LABELS = { analyze: 'Análisis', chat: 'Chat IA', news: 'Noticias' } as const;
type Tab = keyof typeof TAB_LABELS;

export default function Home() {
  const [tab, setTab] = useState<Tab>('analyze');

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-black text-sm select-none">P</div>
          <span className="font-bold text-base tracking-tight">PASK Stocks</span>
          <nav className="ml-auto flex gap-1">
            {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${tab === t ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {tab === 'analyze' ? <AnalyzeTab /> : tab === 'chat' ? <ChatTab /> : <NewsTab />}

      <footer className="text-center text-gray-700 text-xs py-8">
        Datos simulados (mock) · Solo educativo · No es asesoramiento financiero
      </footer>
    </main>
  );
}

// ─── Analyze tab ──────────────────────────────────────────────────────────────

function AnalyzeTab() {
  const ac = useAutocomplete();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<StockResult | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aiSignal, setAiSignal] = useState<Signal | null>(null);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  const fetchAi = async (stockData: StockResult) => {
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
    ac.setShowDropdown(false);
    ac.setSuggestions?.([]);
    try {
      const res = await fetch(`/api/analyze?ticker=${t}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Error desconocido.');
      } else {
        setResult(data as StockResult);
        fetchAi(data as StockResult);
      }
    } catch {
      setError('Error de conexión. Asegúrate de que el servidor está en marcha.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (s: Suggestion) => {
    ac.setQuery(s.ticker);
    ac.setSuggestions?.([]);
    ac.setShowDropdown(false);
    analyze(s.ticker, s.name);
  };

  const handleSubmit = () => {
    if (ac.activeIndex >= 0 && ac.suggestions[ac.activeIndex]) {
      handleSelect(ac.suggestions[ac.activeIndex]);
    } else {
      analyze(ac.query);
    }
  };

  const activeSignal = aiSignal ?? result?.signal ?? null;
  const cfg = activeSignal ? SIGNAL_CONFIG[activeSignal] : null;

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Analizador de acciones</h1>
        <p className="text-gray-400 text-sm">Indicadores técnicos · MA50 · MA200 · RSI · Señal Buy / Sell / Hold</p>
      </div>

      {/* Search */}
      <div className="relative">
        <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="flex gap-2">
          <div className="relative flex-1">
            <input
              ref={ac.inputRef}
              type="text"
              value={ac.query}
              onChange={ac.handleInputChange}
              onKeyDown={(e) => ac.handleKeyDown(e, handleSubmit)}
              onFocus={() => ac.suggestions.length > 0 && ac.setShowDropdown(true)}
              placeholder="Ticker o nombre de empresa…"
              maxLength={60}
              className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 font-mono text-base tracking-widest placeholder:text-gray-600 placeholder:tracking-normal focus:outline-none focus:border-blue-500 transition-colors"
              autoFocus
              autoComplete="off"
            />
            {ac.searchLoading && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            )}
          </div>
          <button
            type="submit"
            disabled={loading || !ac.query.trim()}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed px-6 py-3 rounded-xl font-semibold text-sm transition-colors whitespace-nowrap"
          >
            {loading ? 'Analizando…' : 'Analizar'}
          </button>
        </form>
        <Dropdown suggestions={ac.suggestions} activeIndex={ac.activeIndex} dropdownRef={ac.dropdownRef} onSelect={handleSelect} />
      </div>

      {/* Demo buttons */}
      {!result && !loading && (
        <div className="flex flex-wrap items-center gap-2 justify-center text-sm">
          <span className="text-gray-600">Prueba con:</span>
          {DEMO_TICKERS.map((t) => (
            <button key={t} onClick={() => { ac.setQuery(t); analyze(t); }} className="font-mono px-3 py-1 rounded-lg border border-gray-800 text-gray-400 hover:border-blue-600 hover:text-blue-400 transition-colors">{t}</button>
          ))}
        </div>
      )}

      {error && <div className="bg-red-950/60 border border-red-800 rounded-xl px-4 py-3 text-red-300 text-sm">{error}</div>}

      {loading && (
        <div className="space-y-3 animate-pulse">
          <div className="h-28 bg-gray-900 rounded-2xl" />
          <div className="grid grid-cols-3 gap-3">{[0,1,2].map(i => <div key={i} className="h-20 bg-gray-900 rounded-xl" />)}</div>
          <div className="h-32 bg-gray-900 rounded-2xl" />
        </div>
      )}

      {result && cfg && (
        <div className="space-y-3">
          {/* Price card */}
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 flex items-start justify-between">
            <div>
              <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-0.5">{result.ticker}</p>
              {companyName && <p className="text-gray-400 text-sm mb-1">{companyName}</p>}
              <p className="text-4xl font-bold tabular-nums">${result.price.toFixed(2)}</p>
              <p className={`mt-1 text-sm font-medium tabular-nums ${result.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {result.change >= 0 ? '+' : ''}{result.change.toFixed(2)}&nbsp;(
                {result.changePercent >= 0 ? '+' : ''}{result.changePercent.toFixed(2)}%)
              </p>
            </div>
            <div className="text-right">
              <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">Volumen</p>
              <p className="text-xl font-semibold tabular-nums">
                {result.volume >= 1_000_000 ? `${(result.volume / 1_000_000).toFixed(1)}M` : `${(result.volume / 1_000).toFixed(0)}K`}
              </p>
            </div>
          </div>

          {/* Indicators */}
          <div className="grid grid-cols-3 gap-3">
            <IndicatorCard label="MA 50" value={`$${result.ma50.toFixed(2)}`} hint={result.price > result.ma50 ? '↑ precio sobre MA50' : '↓ precio bajo MA50'} positive={result.price > result.ma50} />
            <IndicatorCard label="MA 200" value={`$${result.ma200.toFixed(2)}`} hint={result.price > result.ma200 ? '↑ precio sobre MA200' : '↓ precio bajo MA200'} positive={result.price > result.ma200} />
            <IndicatorCard label="RSI (14)" value={result.rsi.toFixed(1)} hint={result.rsi > 70 ? 'Sobrecompra' : result.rsi < 30 ? 'Sobreventa' : 'Zona neutral'} positive={result.rsi >= 40 && result.rsi <= 60} />
          </div>

          {/* Recommendation */}
          <div className={`bg-gray-900 border-2 ${cfg.border} rounded-2xl p-6 shadow-xl ${cfg.glow} transition-colors duration-500`}>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              {aiLoading ? (
                <span className="flex items-center gap-2 bg-gray-700 text-gray-300 font-black text-lg px-5 py-1.5 rounded-xl tracking-widest animate-pulse">
                  <span className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin inline-block" />
                  Analizando…
                </span>
              ) : (
                <span className={`${cfg.badgeBg} ${cfg.badgeText} font-black text-lg px-5 py-1.5 rounded-xl tracking-widest`}>{cfg.label}</span>
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
              <p className="text-gray-300 text-sm leading-relaxed">{aiExplanation ?? result.explanation}</p>
            )}
          </div>

          <button
            onClick={() => { setResult(null); setError(null); ac.clear(); setCompanyName(null); setAiSignal(null); setAiExplanation(null); setTimeout(() => ac.inputRef.current?.focus(), 50); }}
            className="w-full py-3 rounded-xl border border-gray-800 text-gray-500 hover:text-white hover:border-gray-600 transition-colors text-sm"
          >
            Analizar otro ticker
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Chat tab ─────────────────────────────────────────────────────────────────

function ChatTab() {
  const ac = useAutocomplete();
  const [selectedStock, setSelectedStock] = useState<Suggestion | null>(null);
  const [stockInfo, setStockInfo] = useState<StockInfo | null>(null);
  const [stockInfoLoading, setStockInfoLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [pendingStock, setPendingStock] = useState<Suggestion | null>(null);
  const [typingFull, setTypingFull] = useState('');
  const [typingDisplayed, setTypingDisplayed] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const typingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Scroll on new messages or while typing
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typingDisplayed]);

  // Typewriter effect
  useEffect(() => {
    if (!isTyping || !typingFull) return;
    setTypingDisplayed('');
    let i = 0;
    typingRef.current = setInterval(() => {
      i += 4; // chars per tick
      setTypingDisplayed(typingFull.slice(0, i));
      if (i >= typingFull.length) {
        clearInterval(typingRef.current!);
        setIsTyping(false);
        setMessages(prev => [...prev, { role: 'assistant', content: typingFull }]);
        setTypingFull('');
        setTypingDisplayed('');
      }
    }, 20);
    return () => { if (typingRef.current) clearInterval(typingRef.current); };
  }, [isTyping, typingFull]);

  const loadStockInfo = async (ticker: string) => {
    setStockInfoLoading(true);
    setStockInfo(null);
    try {
      const res = await fetch(`/api/stock-info?ticker=${ticker}`);
      const data = await res.json();
      if (res.ok) setStockInfo(data as StockInfo);
    } catch { /* silent */ } finally {
      setStockInfoLoading(false);
    }
  };

  const applyStockChange = (s: Suggestion) => {
    setSelectedStock(s);
    ac.setQuery(s.ticker);
    ac.setSuggestions([]);
    ac.setShowDropdown(false);
    setMessages([]);
    setPendingStock(null);
    loadStockInfo(s.ticker);
    setTimeout(() => chatInputRef.current?.focus(), 100);
  };

  const handleSelectStock = (s: Suggestion) => {
    ac.setSuggestions([]);
    ac.setShowDropdown(false);
    if (messages.length > 0) {
      ac.setQuery(s.ticker);
      setPendingStock(s);
    } else {
      applyStockChange(s);
    }
  };

  const sendMessage = async () => {
    const q = input.trim();
    if (!q || chatLoading || isTyping) return;

    setMessages(prev => [...prev, { role: 'user', content: q }]);
    setInput('');
    setChatLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockInfo, question: q }),
      });
      const data = await res.json();
      const answer = data.answer ?? data.error ?? 'Sin respuesta.';
      setChatLoading(false);
      setTypingFull(answer);
      setIsTyping(true);
    } catch {
      setChatLoading(false);
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error de conexión con el backend.' }]);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-12 flex flex-col gap-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Chat con NotebookLM</h1>
        <p className="text-gray-400 text-sm">Selecciona una acción y haz preguntas sobre ella</p>
      </div>

      {/* Confirmation dialog */}
      {pendingStock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <p className="text-white font-semibold mb-1">¿Cambiar de acción?</p>
            <p className="text-gray-400 text-sm mb-6">
              Si cambias a <span className="text-white font-mono">{pendingStock.ticker}</span> se perderá la conversación actual.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setPendingStock(null); ac.setQuery(selectedStock?.ticker ?? ''); }}
                className="flex-1 py-2.5 rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-colors text-sm"
              >
                Cancelar
              </button>
              <button
                onClick={() => applyStockChange(pendingStock)}
                className="flex-1 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors text-sm"
              >
                Sí, cambiar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stock selector */}
      <div className="relative">
        <label className="block text-gray-500 text-xs font-medium uppercase tracking-wider mb-2">
          Acción seleccionada
        </label>
        <div className="relative">
          <input
            ref={ac.inputRef}
            type="text"
            value={ac.query}
            onChange={ac.handleInputChange}
            onKeyDown={(e) => ac.handleKeyDown(e, () => {
              if (ac.activeIndex >= 0 && ac.suggestions[ac.activeIndex]) handleSelectStock(ac.suggestions[ac.activeIndex]);
            })}
            onFocus={() => ac.suggestions.length > 0 && !chatLoading && ac.setShowDropdown(true)}
            placeholder="Busca un ticker o empresa…"
            maxLength={60}
            autoComplete="off"
            disabled={chatLoading || isTyping}
            className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 font-mono text-base tracking-widest placeholder:text-gray-600 placeholder:tracking-normal focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          />
          {ac.searchLoading && !chatLoading && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          )}
        </div>
        {!chatLoading && (
          <Dropdown suggestions={ac.suggestions} activeIndex={ac.activeIndex} dropdownRef={ac.dropdownRef} onSelect={handleSelectStock} />
        )}
      </div>

      {/* Stock info card */}
      {stockInfoLoading && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 animate-pulse space-y-2">
          <div className="h-3 bg-gray-800 rounded w-1/3" />
          <div className="h-3 bg-gray-800 rounded w-2/3" />
          <div className="grid grid-cols-4 gap-2 mt-3">
            {[0,1,2,3].map(i => <div key={i} className="h-10 bg-gray-800 rounded-xl" />)}
          </div>
        </div>
      )}
      {stockInfo && !stockInfoLoading && <StockInfoCard info={stockInfo} />}

      {/* Chat area */}
      <div className="flex flex-col gap-3">
        {/* Messages */}
        <div className="min-h-64 max-h-[28rem] overflow-y-auto flex flex-col gap-3 bg-gray-900/40 border border-gray-800 rounded-2xl p-4">
          {messages.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-gray-600 text-sm text-center py-12">
              {selectedStock
                ? `Pregunta lo que quieras sobre ${selectedStock.ticker} — ${selectedStock.name}`
                : 'Selecciona una acción arriba para empezar el chat'}
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white rounded-br-sm'
                      : 'bg-gray-800 text-gray-200 rounded-bl-sm'
                  }`}
                >
                  {m.role === 'assistant' && (
                    <p className="text-blue-400 text-xs mb-2 font-semibold uppercase tracking-wider">NotebookLM</p>
                  )}
                  {m.role === 'assistant' ? <FormattedMessage content={m.content} /> : m.content}
                </div>
              </div>
            ))
          )}
          {chatLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3">
                <p className="text-blue-400 text-xs mb-2 font-semibold uppercase tracking-wider">NotebookLM</p>
                <div className="flex gap-1 items-center h-4">
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-2 h-2 bg-gray-500 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
          {isTyping && typingDisplayed && (
            <div className="flex justify-start">
              <div className="max-w-[85%] bg-gray-800 text-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed">
                <p className="text-blue-400 text-xs mb-2 font-semibold uppercase tracking-wider">NotebookLM</p>
                <FormattedMessage content={typingDisplayed} cursor />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input row */}
        <div className="flex gap-2">
          <input
            ref={chatInputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder={selectedStock ? `Pregunta sobre ${selectedStock.ticker}…` : 'Selecciona una acción primero…'}
            disabled={!selectedStock || chatLoading || isTyping}
            className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm placeholder:text-gray-600 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-40"
          />
          <button
            onClick={sendMessage}
            disabled={!selectedStock || !input.trim() || chatLoading || isTyping}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed px-5 py-3 rounded-xl font-semibold text-sm transition-colors whitespace-nowrap"
          >
            Enviar
          </button>
        </div>

        {messages.length > 0 && (
          <button
            onClick={() => setMessages([])}
            className="text-gray-600 hover:text-gray-400 text-xs text-center transition-colors"
          >
            Limpiar conversación
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Shared components ────────────────────────────────────────────────────────

function fmtLarge(n: number | null | undefined): string {
  if (n == null) return 'N/D';
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return n.toFixed(0);
}

function StockInfoCard({ info }: { info: StockInfo }) {
  const stats = [
    { label: 'Precio', value: `${info.currency} ${info.price.toFixed(2)}` },
    { label: 'Variación', value: `${info.changePercent >= 0 ? '+' : ''}${info.changePercent.toFixed(2)}%`, color: info.changePercent >= 0 ? 'text-emerald-400' : 'text-red-400' },
    { label: 'Market Cap', value: fmtLarge(info.marketCap) },
    { label: 'PER', value: info.pe ? `${info.pe.toFixed(1)}x` : 'N/D' },
    { label: 'Beta', value: info.beta ? info.beta.toFixed(2) : 'N/D' },
    { label: 'Dividendo', value: info.dividendYield ? `${(info.dividendYield * 100).toFixed(2)}%` : '—' },
    { label: '52w Máx', value: info.week52High ? `${info.week52High.toFixed(2)}` : 'N/D' },
    { label: '52w Mín', value: info.week52Low ? `${info.week52Low.toFixed(2)}` : 'N/D' },
    { label: 'MA50', value: `${info.ma50.toFixed(2)}`, color: info.price > info.ma50 ? 'text-emerald-400' : 'text-red-400' },
    { label: 'MA200', value: `${info.ma200.toFixed(2)}`, color: info.price > info.ma200 ? 'text-emerald-400' : 'text-red-400' },
    { label: 'RSI (14)', value: info.rsi.toFixed(1) },
    { label: 'Ingresos', value: fmtLarge(info.revenue) },
  ];

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-mono font-bold text-white text-lg">{info.ticker}</span>
            <span className="text-gray-500 text-xs">{info.exchange}</span>
          </div>
          <p className="text-gray-300 text-sm">{info.name}</p>
          {info.sector && <p className="text-gray-500 text-xs mt-0.5">{info.sector} · {info.industry}</p>}
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-4 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="bg-gray-800/60 rounded-xl p-2.5">
            <p className="text-gray-500 text-xs mb-0.5">{s.label}</p>
            <p className={`font-semibold text-sm tabular-nums ${s.color ?? 'text-white'}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Description */}
      {info.description && (
        <details className="group">
          <summary className="text-gray-500 text-xs cursor-pointer hover:text-gray-300 transition-colors select-none">
            Ver descripción de la empresa
          </summary>
          <p className="text-gray-400 text-xs leading-relaxed mt-2 border-t border-gray-800 pt-2">
            {info.description}
          </p>
        </details>
      )}
    </div>
  );
}

const Cursor = () => (
  <span className="inline-block w-0.5 h-[1em] bg-blue-400 ml-0.5 animate-pulse align-text-bottom" />
);

function renderInline(text: string, appendCursor?: boolean): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  const nodes = parts.map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part)
      ? <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>
      : part
  );
  if (appendCursor) nodes.push(<Cursor key="cursor" />);
  return nodes;
}

function FormattedMessage({ content, cursor }: { content: string; cursor?: boolean }) {
  const blocks = content.split(/\n{2,}/).filter(Boolean);

  return (
    <div className="space-y-3">
      {blocks.map((block, bi) => {
        const isLastBlock = bi === blocks.length - 1;
        const lines = block.split('\n').filter(Boolean);

        const isBulletList = lines.every(l => /^[-*•]\s/.test(l.trim()));
        if (isBulletList) {
          return (
            <ul key={bi} className="space-y-1 pl-1">
              {lines.map((line, li) => {
                const isLast = isLastBlock && li === lines.length - 1;
                return (
                  <li key={li} className="flex gap-2">
                    <span className="text-blue-400 mt-0.5 shrink-0">•</span>
                    <span>{renderInline(line.replace(/^[-*•]\s+/, ''), cursor && isLast)}</span>
                  </li>
                );
              })}
            </ul>
          );
        }

        const isNumberedList = lines.every(l => /^\d+[.)]\s/.test(l.trim()));
        if (isNumberedList) {
          return (
            <ol key={bi} className="space-y-1 pl-1">
              {lines.map((line, li) => {
                const isLast = isLastBlock && li === lines.length - 1;
                return (
                  <li key={li} className="flex gap-2">
                    <span className="text-blue-400 shrink-0 tabular-nums">{li + 1}.</span>
                    <span>{renderInline(line.replace(/^\d+[.)]\s+/, ''), cursor && isLast)}</span>
                  </li>
                );
              })}
            </ol>
          );
        }

        if (lines.length === 1 && /^#{1,3}\s/.test(lines[0])) {
          const text = lines[0].replace(/^#{1,3}\s+/, '');
          return (
            <p key={bi} className="font-semibold text-white">
              {renderInline(text, cursor && isLastBlock)}
            </p>
          );
        }

        return (
          <div key={bi} className="space-y-1">
            {lines.map((line, li) => {
              const isLast = isLastBlock && li === lines.length - 1;
              if (/^[-*•]\s/.test(line.trim())) {
                return (
                  <div key={li} className="flex gap-2">
                    <span className="text-blue-400 mt-0.5 shrink-0">•</span>
                    <span>{renderInline(line.replace(/^[-*•]\s+/, ''), cursor && isLast)}</span>
                  </div>
                );
              }
              return <p key={li}>{renderInline(line, cursor && isLast)}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── News tab ─────────────────────────────────────────────────────────────────

// Tipo que acepta tanto NewsItem original como EnhancedNewsItem
type EnhancedNewsItem = NewsItem & {
  fullContent?: string;
  tickers?: string[];
}

function NewsTab() {
  const [news, setNews] = useState<EnhancedNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyses, setAnalyses] = useState<Record<string, NewsAnalysis | 'loading' | 'error'>>({});

  useEffect(() => {
    fetch('/api/news-enhanced')
      .then(r => r.json())
      .then(d => setNews(d.news ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const analyze = async (item: EnhancedNewsItem) => {
    if (analyses[item.id]) return;
    setAnalyses(prev => ({ ...prev, [item.id]: 'loading' }));
    try {
      // Usamos la descripción completa si está disponible, sino usamos la descripción regular
      const descriptionToUse = item.fullContent || item.description;
      const res = await fetch('/api/news/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: item.title, description: descriptionToUse }),
      });
      const data = await res.json();
      setAnalyses(prev => ({ ...prev, [item.id]: res.ok ? data : 'error' }));
    } catch {
      setAnalyses(prev => ({ ...prev, [item.id]: 'error' }));
    }
  };

  const effectColors = { positivo: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', negativo: 'text-red-400 bg-red-500/10 border-red-500/30', mixto: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
  const effectLabels = { positivo: '↑ Positivo', negativo: '↓ Negativo', mixto: '~ Mixto' };

  const refresh = () => {
    setLoading(true);
    setNews([]);
    setAnalyses({});
    fetch('/api/news-enhanced').then(r => r.json()).then(d => setNews(d.news ?? [])).catch(() => {}).finally(() => setLoading(false));
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Noticias</h1>
          <p className="text-gray-400 text-sm mt-1">Mercados · Macro · Geopolítica</p>
        </div>
        <button
          onClick={refresh}
          disabled={loading}
          className="text-gray-500 hover:text-white text-sm border border-gray-800 hover:border-gray-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
        >
          {loading ? 'Cargando…' : 'Actualizar'}
        </button>
      </div>

      {loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0,1,2,3].map(i => (
            <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 animate-pulse space-y-3">
              <div className="flex gap-2"><div className="h-3 bg-gray-800 rounded w-20"/><div className="h-3 bg-gray-800 rounded w-16"/></div>
              <div className="h-4 bg-gray-800 rounded w-5/6"/>
              <div className="h-3 bg-gray-800 rounded w-full"/>
              <div className="h-3 bg-gray-800 rounded w-4/6"/>
            </div>
          ))}
        </div>
      )}

      {!loading && news.length === 0 && (
        <div className="text-center text-gray-600 py-16 text-sm">No se pudieron cargar las noticias.</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {news.map((item) => {
          const analysis = analyses[item.id];
          const isAnalyzing = analysis === 'loading';
          const isError = analysis === 'error';
          const result = typeof analysis === 'object' ? analysis : null;

          return (
            <div key={item.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-col gap-3">
              {/* Meta row */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${item.category === 'macro' ? 'bg-purple-500/15 text-purple-400' : 'bg-blue-500/15 text-blue-400'}`}>
                  {item.category === 'macro' ? 'Macro' : 'Mercados'}
                </span>
                <span className="text-gray-600 text-xs">{item.source}</span>
                {item.tickers?.length && (
                  <span className="text-gray-500 text-xs mx-2">
                    {/* Mostrar hasta 3 tickers mencionados */}
                    {item.tickers.slice(0, 3).map((t, i) => (
                      <span key={i} className="font-mono text-xs bg-gray-800/50 px-1.5 rounded">{t}</span>
                    ))}
                    {item.tickers.length > 3 && <span className="text-xs">+{item.tickers.length - 3}</span>}
                  </span>
                )}
                <span className="text-gray-700 text-xs ml-auto">
                  {new Date(item.publishedAt).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              {/* Title */}
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block font-semibold text-gray-200 hover:text-white leading-snug transition-colors duration-150"
              >
                {item.title}
              </a>

              {/* Snippet */}
              {(item.fullContent || item.description) && (
                <p className="text-gray-500 text-sm leading-relaxed line-clamp-3">
                  {(item.fullContent || item.description)!.slice(0, 220)}
                  {(item.fullContent || item.description)!.length > 220 ? '…' : ''}
                </p>
              )}

              {/* AI analysis */}
              {result && (
                <div className="mt-1 rounded-xl bg-gray-800/50 border border-gray-700/60 overflow-hidden">
                  {/* Header */}
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-700/60 bg-blue-600/10">
                    <span className="text-blue-400 text-xs">✦</span>
                    <span className="text-blue-400 text-xs font-semibold uppercase tracking-wider">Análisis IA</span>
                  </div>

                  <div className="p-4 space-y-4">
                    {/* Resumen */}
                    <div>
                      <p className="text-gray-500 text-[11px] font-semibold uppercase tracking-wider mb-1">Resumen</p>
                      <p className="text-gray-200 text-sm leading-relaxed">{result.summary}</p>
                    </div>

                    {/* Impacto */}
                    <div>
                      <p className="text-gray-500 text-[11px] font-semibold uppercase tracking-wider mb-1">Impacto en mercados</p>
                      <p className="text-gray-300 text-sm leading-relaxed">{result.marketImpact}</p>
                    </div>

                    {/* Afectados */}
                    {result.affected?.length > 0 && (
                      <div>
                        <p className="text-gray-500 text-[11px] font-semibold uppercase tracking-wider mb-2">Afectados</p>
                        <div className="grid grid-cols-1 gap-1.5">
                          {result.affected.map((a, i) => (
                            <div key={i} className={`flex items-start gap-3 rounded-lg px-3 py-2 border text-xs ${effectColors[a.effect] ?? effectColors.mixto}`}>
                              <span className="font-bold shrink-0 mt-0.5 w-16">{effectLabels[a.effect] ?? a.effect}</span>
                              <div className="min-w-0">
                                <span className="font-semibold">{a.name}</span>
                                <span className="opacity-70"> — {a.reason}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {isError && (
                <p className="text-red-400 text-xs border-t border-gray-800 pt-3">Error al analizar la noticia.</p>
              )}

              {/* Footer row */}
              <div className="flex items-center gap-3 flex-wrap mt-auto">
                {!result && !isError && (
                  <button
                    onClick={() => analyze(item)}
                    disabled={isAnalyzing}
                    className="flex items-center gap-2 text-xs text-gray-500 hover:text-blue-400 border border-gray-800 hover:border-blue-800 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isAnalyzing
                      ? <><span className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin"/>Analizando…</>
                      : '✦ Analizar impacto IA'}
                  </button>
                )}
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-600 hover:text-gray-400 transition-colors ml-auto"
                >
                  Leer artículo →
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IndicatorCard({ label, value, hint, positive }: { label: string; value: string; hint: string; positive: boolean }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <p className="text-gray-500 text-xs font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className="text-xl font-bold tabular-nums">{value}</p>
      <p className={`text-xs mt-1 ${positive ? 'text-emerald-500' : 'text-red-400'}`}>{hint}</p>
    </div>
  );
}
