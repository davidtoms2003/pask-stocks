'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
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

interface AgentAction {
  type: 'search' | 'source_added' | 'note_created';
  query?: string;
  count?: number;
  url?: string;
  preview?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  actions?: AgentAction[];
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
          <span className="font-bold text-base tracking-tight">PASK STOCKS</span>
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
            <Link
              href="/docs"
              className="px-4 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white transition-colors"
            >
              Docs
            </Link>
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
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const apiKey = localStorage.getItem('openrouter_key');
      if (apiKey) headers['X-OpenRouter-Key'] = apiKey;

      const res = await fetch('/api/ai-recommend', {
        method: 'POST',
        headers,
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
      <div className="flex justify-end">
        <Link href="/settings" className="text-xs text-gray-500 hover:text-emerald-500 transition-colors">
          ⚙️ Configuración
        </Link>
      </div>
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

  // Notebooks
  const [notebooks, setNotebooks] = useState<{ id: string; title: string; source_count?: number }[]>([]);
  const [notebooksLoading, setNotebooksLoading] = useState(true);
  const [selectedNotebook, setSelectedNotebook] = useState<{ id: string; title: string } | null>(null);

  useEffect(() => {
    fetch('http://localhost:8000/api/notebooks')
      .then(r => r.json())
      .then(d => {
        const nbs = d.notebooks ?? [];
        setNotebooks(nbs);
        // Auto-select "PASK stocks" if present, otherwise first
        const pask = nbs.find((n: { id: string; title: string }) => n.title === 'PASK stocks') ?? nbs[0] ?? null;
        setSelectedNotebook(pask);
      })
      .catch(() => {})
      .finally(() => setNotebooksLoading(false));
  }, []);

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
        setMessages(prev => [...prev, { role: 'assistant', content: typingFull, actions: pendingActions }]);
        setPendingActions([]);
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

  const [pendingActions, setPendingActions] = useState<AgentAction[]>([]);

  const sendMessage = async (overrideText?: string) => {
    const q = (overrideText ?? input).trim();
    if (!q || chatLoading || isTyping) return;

    const newMessages = [...messages, { role: 'user' as const, content: q }];
    setMessages(newMessages);
    if (!overrideText) setInput('');
    setChatLoading(true);
    setPendingActions([]);

    // Send only user/assistant messages (no actions metadata) as history
    const history = messages.map(m => ({ role: m.role, content: m.content }));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockInfo, question: q, history, notebook_id: selectedNotebook?.id ?? null }),
      });
      const data = await res.json();
      const answer = data.answer ?? data.error ?? 'Sin respuesta.';
      const actions: AgentAction[] = data.actions ?? [];
      setChatLoading(false);
      setPendingActions(actions);
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

      {/* Notebook selector */}
      <div className="flex items-center gap-3">
        <span className="text-gray-500 text-xs font-medium uppercase tracking-wider shrink-0">Cuaderno</span>
        {notebooksLoading ? (
          <div className="h-8 w-48 bg-gray-800 rounded-lg animate-pulse" />
        ) : notebooks.length === 0 ? (
          <span className="text-gray-600 text-xs">Backend no disponible</span>
        ) : (
          <select
            value={selectedNotebook?.id ?? ''}
            disabled={messages.length > 0}
            onChange={e => {
              const nb = notebooks.find(n => n.id === e.target.value) ?? null;
              setSelectedNotebook(nb);
            }}
            className="bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-500 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            title={messages.length > 0 ? 'Limpia la conversación para cambiar de cuaderno' : ''}
          >
            {notebooks.map(nb => (
              <option key={nb.id} value={nb.id}>
                📒 {nb.title}{nb.source_count != null ? ` (${nb.source_count})` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

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
                  {m.role === 'assistant' && m.actions && m.actions.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-gray-700 flex flex-col gap-1">
                      {m.actions.map((a, i) => (
                        <span key={i} className="text-xs text-gray-500 flex items-center gap-1.5">
                          {a.type === 'search' && <><span>🔍</span><span>Búsqueda: &quot;{a.query}&quot; · {a.count} resultados</span></>}
                          {a.type === 'source_added' && <><span>📎</span><span className="truncate">Fuente añadida: {a.url}</span></>}
                          {a.type === 'note_created' && <><span>📝</span><span>Nota creada: {a.preview}…</span></>}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {chatLoading && (
            <div className="flex justify-start">
              <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3">
                <p className="text-blue-400 text-xs mb-2 font-semibold uppercase tracking-wider">NOTEBOOKLM</p>
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
            onClick={() => sendMessage()}
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

        {/* Quick actions */}
        <div className="border-t border-gray-800/60 pt-3 space-y-3">
          {/* Comandos financieros */}
          <div className="space-y-1.5">
            <p className="text-gray-500 text-[11px] uppercase tracking-wider font-medium">Análisis financiero</p>
            <div className="flex flex-wrap gap-2">
              {[
                { icon: '📄', label: '/one-pager',   desc: 'Ficha resumen profesional',    cmd: '/one-pager' },
                { icon: '💰', label: '/dcf',         desc: 'Modelo DCF institucional',     cmd: '/dcf' },
                { icon: '📈', label: '/earnings',    desc: 'Análisis resultados trimestrales', cmd: '/earnings' },
                { icon: '⚖️', label: '/comps',       desc: 'Comparables de sector',        cmd: '/comps' },
                { icon: '🏆', label: '/competitive', desc: 'Análisis competitivo + moat',  cmd: '/competitive' },
                { icon: '🔎', label: '/screen',      desc: 'Screening de ideas',           cmd: '/screen' },
              ].map(({ icon, label, desc, cmd }) => (
                <button
                  key={cmd}
                  disabled={!selectedStock}
                  onClick={() => sendMessage(cmd)}
                  title={desc}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-950/50 hover:bg-blue-900/50 border border-blue-800/50 hover:border-blue-600/60 text-blue-300 hover:text-blue-100 text-xs font-mono transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <span>{icon}</span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Acciones generales */}
          <div className="space-y-1.5">
            <p className="text-gray-600 text-[11px] uppercase tracking-wider font-medium">Otras acciones</p>
            <div className="flex flex-wrap gap-2">
              {[
                { icon: '🔍', label: 'Buscar noticias sobre una empresa',   prompt: selectedStock ? `Busca noticias recientes sobre ${selectedStock.ticker}` : 'Busca noticias recientes sobre Apple' },
                { icon: '📎', label: 'Añadir un enlace como fuente',        prompt: 'Añade este enlace como fuente: ' },
                { icon: '🌐', label: 'Buscar y guardar fuentes relevantes', prompt: selectedStock ? `Busca artículos relevantes sobre ${selectedStock.ticker} y añade los mejores como fuentes` : 'Busca artículos sobre el mercado y añade los mejores como fuentes' },
                { icon: '📝', label: 'Crear una nota',                      prompt: 'Crea una nota con el siguiente contenido: ' },
                { icon: '📰', label: 'Resumir el mercado hoy',              prompt: 'Busca información sobre el estado del mercado hoy y hazme un resumen' },
              ].map(({ icon, label, prompt }) => (
                <button
                  key={label}
                  disabled={!selectedStock && prompt.startsWith('Selecciona')}
                  onClick={() => { setInput(prompt); setTimeout(() => chatInputRef.current?.focus(), 50); }}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-gray-800/60 hover:bg-gray-700/60 border border-gray-700/50 hover:border-gray-600 text-gray-400 hover:text-gray-200 text-xs transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <span>{icon}</span>
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
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

// ─── Inline renderer ──────────────────────────────────────────────────────────

function renderInline(text: string, appendCursor?: boolean): React.ReactNode {
  // Order matters: longer/more specific patterns first
  const parts = text.split(/(~~[^~]+~~|__[^_]+__|_[^_\n]+_|\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|https?:\/\/[^\s)>]+)/g);
  const nodes: React.ReactNode[] = parts.map((part, i) => {
    if (/^~~[^~]+~~$/.test(part))
      return <s key={i} className="text-gray-500">{part.slice(2, -2)}</s>;
    if (/^__[^_]+__$/.test(part))
      return <u key={i} className="underline underline-offset-2 decoration-gray-400">{part.slice(2, -2)}</u>;
    if (/^_[^_]+_$/.test(part))
      return <em key={i} className="text-gray-300 italic">{part.slice(1, -1)}</em>;
    if (/^\*\*[^*]+\*\*$/.test(part))
      return <strong key={i} className="text-white font-semibold">{part.slice(2, -2)}</strong>;
    if (/^\*[^*]+\*$/.test(part))
      return <em key={i} className="text-gray-300 italic">{part.slice(1, -1)}</em>;
    if (/^`[^`]+`$/.test(part))
      return <code key={i} className="bg-gray-700/80 text-blue-300 px-1.5 py-0.5 rounded text-[11px] font-mono">{part.slice(1, -1)}</code>;
    const mdLink = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (mdLink)
      return <a key={i} href={mdLink[2]} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2">{mdLink[1]}</a>;
    if (/^https?:\/\//.test(part)) {
      const label = part.replace(/^https?:\/\/(www\.)?/, '').slice(0, 45) + (part.length > 55 ? '…' : '');
      return <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 underline underline-offset-2 break-all text-[11px]">{label}</a>;
    }
    return part;
  });
  if (appendCursor) nodes.push(<Cursor key="cursor" />);
  return nodes;
}

// ─── Block parser ─────────────────────────────────────────────────────────────

type MsgSegment =
  | { type: 'h1' | 'h2' | 'h3'; text: string }
  | { type: 'hr' }
  | { type: 'bullet'; items: string[] }
  | { type: 'numbered'; items: string[] }
  | { type: 'table'; header: string[]; rows: string[][] }
  | { type: 'blockquote'; lines: string[] }
  | { type: 'paragraph'; lines: string[] };

function parseSegments(content: string): MsgSegment[] {
  const lines = content.split('\n');
  const out: MsgSegment[] = [];
  let i = 0;

  const parseRow = (row: string) => row.split('|').slice(1, -1).map(c => c.trim());

  while (i < lines.length) {
    const raw = lines[i];
    const t = raw.trim();

    if (!t) { i++; continue; }

    // Headings
    const hm = t.match(/^(#{1,3})\s+(.+)/);
    if (hm) {
      const level = hm[1].length as 1 | 2 | 3;
      out.push({ type: `h${level}` as 'h1' | 'h2' | 'h3', text: hm[2] });
      i++; continue;
    }

    // Horizontal rule / separator lines (---, ===, ───, ═══)
    if (/^[-=*_]{3,}$/.test(t) || /^[═─]{3,}/.test(t)) {
      // Only add hr if previous segment wasn't already an hr
      if (out.length === 0 || out[out.length - 1].type !== 'hr')
        out.push({ type: 'hr' });
      i++; continue;
    }

    // Table: current line has | and next line is a separator row
    if (t.startsWith('|') && i + 1 < lines.length && /^\|[\s|:-]+\|/.test(lines[i + 1].trim())) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      const header = parseRow(tableLines[0]);
      const rows = tableLines.slice(2).map(parseRow);
      out.push({ type: 'table', header, rows });
      continue;
    }

    // Blockquote
    if (t.startsWith('>')) {
      const bqLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        bqLines.push(lines[i].trim().replace(/^>\s*/, ''));
        i++;
      }
      out.push({ type: 'blockquote', lines: bqLines });
      continue;
    }

    // Bullet list
    if (/^[-*•]\s/.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
        i++;
      }
      out.push({ type: 'bullet', items });
      continue;
    }

    // Numbered list
    if (/^\d+[.)]\s/.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, ''));
        i++;
      }
      out.push({ type: 'numbered', items });
      continue;
    }

    // Paragraph — collect until a blank line or a special block starts
    const paraLines: string[] = [];
    while (i < lines.length) {
      const l = lines[i].trim();
      if (!l) { i++; break; }
      if (/^#{1,3}\s/.test(l)) break;
      if (/^[-=*_]{3,}$/.test(l) || /^[═─]{3,}/.test(l)) break;
      if (l.startsWith('|') && /^\|[\s|:-]+\|/.test(lines[i + 1]?.trim() ?? '')) break;
      if (l.startsWith('>')) break;
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length) out.push({ type: 'paragraph', lines: paraLines });
  }

  return out;
}

// ─── Segment renderer ─────────────────────────────────────────────────────────

function renderSegment(seg: MsgSegment, key: number, isLast: boolean, cursor?: boolean): React.ReactNode {
  switch (seg.type) {
    case 'h1':
      return <p key={key} className="text-white font-bold text-[15px] leading-snug mt-1">{renderInline(seg.text, cursor && isLast)}</p>;
    case 'h2':
      return <p key={key} className="text-white font-semibold text-sm leading-snug">{renderInline(seg.text, cursor && isLast)}</p>;
    case 'h3':
      return <p key={key} className="text-gray-300 font-semibold text-[13px] leading-snug">{renderInline(seg.text, cursor && isLast)}</p>;

    case 'hr':
      return <hr key={key} className="border-gray-700/60 my-0.5" />;

    case 'table': {
      return (
        <div key={key} className="overflow-x-auto rounded-lg border border-gray-700/80 text-xs my-1">
          <table className="w-full border-collapse min-w-max">
            <thead>
              <tr className="bg-gray-800/80">
                {seg.header.map((h, ci) => (
                  <th key={ci} className="px-3 py-2 text-left text-gray-200 font-semibold border-b border-gray-700 whitespace-nowrap">{renderInline(h)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {seg.rows.map((row, ri) => (
                <tr key={ri} className={ri % 2 === 0 ? 'bg-gray-900/60' : 'bg-gray-800/30'}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="px-3 py-2 text-gray-300 border-b border-gray-800/40 align-top">{renderInline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }

    case 'blockquote':
      return (
        <div key={key} className="border-l-2 border-blue-500/60 pl-3 py-0.5 space-y-0.5">
          {seg.lines.map((l, li) => <p key={li} className="text-gray-400 text-xs italic">{renderInline(l)}</p>)}
        </div>
      );

    case 'bullet':
      return (
        <ul key={key} className="space-y-1 pl-1">
          {seg.items.map((item, li) => (
            <li key={li} className="flex gap-2 min-w-0">
              <span className="text-blue-400 mt-0.5 shrink-0 select-none">•</span>
              <span className="min-w-0 break-words">{renderInline(item, cursor && isLast && li === seg.items.length - 1)}</span>
            </li>
          ))}
        </ul>
      );

    case 'numbered':
      return (
        <ol key={key} className="space-y-1 pl-1">
          {seg.items.map((item, li) => (
            <li key={li} className="flex gap-2 min-w-0">
              <span className="text-blue-400 shrink-0 tabular-nums font-mono text-[11px] mt-0.5">{li + 1}.</span>
              <span className="min-w-0 break-words">{renderInline(item, cursor && isLast && li === seg.items.length - 1)}</span>
            </li>
          ))}
        </ol>
      );

    case 'paragraph': {
      const paraNodes = seg.lines.map((line, li) => {
        const t = line.trim();
        if (!t) return null;
        const isLastLine = isLast && li === seg.lines.length - 1;
        // Inline bullet within paragraph
        if (/^[-*•]\s/.test(t)) {
          return (
            <div key={li} className="flex gap-2 min-w-0">
              <span className="text-blue-400 mt-0.5 shrink-0 select-none">•</span>
              <span className="min-w-0 break-words">{renderInline(t.replace(/^[-*•]\s+/, ''), cursor && isLastLine)}</span>
            </div>
          );
        }
        return <p key={li} className="break-words leading-relaxed">{renderInline(t, cursor && isLastLine)}</p>;
      }).filter(Boolean);
      return <div key={key} className="space-y-1">{paraNodes}</div>;
    }
  }
}

// ─── FormattedMessage ─────────────────────────────────────────────────────────

function FormattedMessage({ content, cursor }: { content: string; cursor?: boolean }) {
  const segments = parseSegments(content);
  return (
    <div className="space-y-2">
      {segments.map((seg, i) => renderSegment(seg, i, i === segments.length - 1, cursor))}
    </div>
  );
}

// ─── Audio Player ─────────────────────────────────────────────────────────────

function AudioPlayer({ src }: { src: string }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const seekRef  = useRef<HTMLInputElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);

  const fmt = (s: number) =>
    !s || !isFinite(s) ? '0:00' : `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  useEffect(() => {
    if (seekRef.current) {
      seekRef.current.style.background = 'linear-gradient(to right, #a855f7 0%, #374151 0%)';
    }
  }, []);

  const syncBar = (t: number, dur: number) => {
    if (!seekRef.current) return;
    seekRef.current.value = String(t);
    const pct = dur > 0 ? (t / dur) * 100 : 0;
    seekRef.current.style.background =
      `linear-gradient(to right, #a855f7 ${pct}%, #374151 ${pct}%)`;
  };

  const toggle = async () => {
    const a = audioRef.current;
    if (!a) return;
    if (!a.paused && !a.ended) {
      a.pause();
      return;
    }
    // If at the end, restart from the beginning
    if (a.ended || (isFinite(a.duration) && a.currentTime >= a.duration - 0.1)) {
      a.currentTime = 0;
      setCurrent(0);
      syncBar(0, a.duration);
    }
    await a.play().catch(console.error);
  };

  const skip = (secs: number) => {
    const a = audioRef.current;
    if (!a) return;
    const dur = isFinite(a.duration) ? a.duration : 0;
    const newTime = Math.min(Math.max(a.currentTime + secs, 0), dur > 0 ? dur - 0.1 : 0);
    a.currentTime = newTime;
    setCurrent(a.currentTime);
    syncBar(a.currentTime, a.duration);
  };

  const onSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const a = audioRef.current;
    if (!a) return;
    const val = Number(e.target.value);
    a.currentTime = val;
    setCurrent(val);
    syncBar(val, a.duration);
  };

  return (
    <div className="space-y-2">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={e => {
          const t = e.currentTarget.currentTime;
          const d = e.currentTarget.duration;
          setCurrent(t);
          syncBar(t, d);
        }}
        onLoadedMetadata={e => {
          const d = e.currentTarget.duration;
          setDuration(d);
          if (seekRef.current) seekRef.current.max = String(d);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      <input
        ref={seekRef}
        type="range"
        min={0}
        max={duration || 100}
        step={0.1}
        defaultValue={0}
        onChange={onSeek}
        className="audio-seek"
      />

      <div className="flex items-center justify-between text-[11px] text-gray-500 tabular-nums">
        <span>{fmt(current)}</span>
        <span>{fmt(duration)}</span>
      </div>

      <div className="flex items-center justify-center gap-8 pt-1">
        <button onClick={() => skip(-15)} className="flex flex-col items-center gap-0.5 text-gray-500 hover:text-white transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.85"/>
          </svg>
          <span className="text-[10px]">15s</span>
        </button>

        <button
          onClick={toggle}
          className="w-12 h-12 rounded-full bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center transition-colors shadow-lg shadow-purple-900/40"
        >
          {playing
            ? <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
            : <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: 2 }}><polygon points="5 3 19 12 5 21 5 3"/></svg>
          }
        </button>

        <button onClick={() => skip(15)} className="flex flex-col items-center gap-0.5 text-gray-500 hover:text-white transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.49-3.85"/>
          </svg>
          <span className="text-[10px]">15s</span>
        </button>
      </div>
    </div>
  );
}

// ─── News tab ─────────────────────────────────────────────────────────────────

// EnhancedNewsItem is imported from @/types/news

function NewsTab() {
  const [news, setNews] = useState<EnhancedNewsItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyses, setAnalyses] = useState<Record<string, NewsAnalysis | 'loading' | 'error'>>({});
  const [briefing, setBriefing] = useState<string | null>(null);
  const [briefingNews, setBriefingNews] = useState<EnhancedNewsItem[]>([]);
  const [briefingAddedUrls, setBriefingAddedUrls] = useState<Set<string>>(new Set());
  const [briefingFailedUrls, setBriefingFailedUrls] = useState<Set<string>>(new Set());
  const [briefingTelegramUrls, setBriefingTelegramUrls] = useState<string[]>([]);
  const [briefingLoading, setBriefingLoading] = useState(false);
  const [briefingError, setBriefingError] = useState<string | null>(null);
  const [podcastJobId, setPodcastJobId] = useState<string | null>(null);
  const [podcastStatus, setPodcastStatus] = useState<'idle' | 'generating' | 'ready' | 'failed'>('idle');
  const [podcastError, setPodcastError] = useState<string | null>(null);
  const podcastPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const headers: Record<string, string> = {};
    const newsApiKey = localStorage.getItem('news_api_key');
    if (newsApiKey) headers['X-News-Api-Key'] = newsApiKey;

    fetch('/api/news-enhanced', { headers })
      .then(r => r.json())
      .then(d => setNews(d.news ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const analyze = async (item: EnhancedNewsItem) => {
    if (analyses[item.id]) return;
    setAnalyses(prev => ({ ...prev, [item.id]: 'loading' }));
    try {
      const descriptionToUse = item.fullContent || item.description;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const apiKey = localStorage.getItem('openrouter_key');
      if (apiKey) headers['X-OpenRouter-Key'] = apiKey;

      const res = await fetch('/api/news/analyze', {
        method: 'POST',
        headers,
        body: JSON.stringify({ title: item.title, description: descriptionToUse }),
      });
      const data = await res.json();
      setAnalyses(prev => ({ ...prev, [item.id]: res.ok ? data : 'error' }));
    } catch {
      setAnalyses(prev => ({ ...prev, [item.id]: 'error' }));
    }
  };

  const generatePodcast = async () => {
    setPodcastStatus('generating');
    setPodcastError(null);
    try {
      const res = await fetch('/api/podcast', { method: 'POST' });
      const d = await res.json();
      if (!res.ok || d.error) throw new Error(d.error ?? 'Error desconocido');
      setPodcastJobId(d.job_id);
      // Start polling
      podcastPollRef.current = setInterval(async () => {
        try {
          const sr = await fetch(`/api/podcast?job_id=${d.job_id}`);
          const sd = await sr.json();
          if (sd.status === 'ready') {
            setPodcastStatus('ready');
            if (podcastPollRef.current) clearInterval(podcastPollRef.current);
          } else if (sd.status === 'failed') {
            setPodcastStatus('failed');
            setPodcastError(sd.error ?? 'Error generando el podcast');
            if (podcastPollRef.current) clearInterval(podcastPollRef.current);
          }
        } catch { /* keep polling */ }
      }, 6000);
    } catch (e) {
      setPodcastStatus('failed');
      setPodcastError(e instanceof Error ? e.message : 'Error iniciando el podcast');
    }
  };

  const effectColors = { positivo: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', negativo: 'text-red-400 bg-red-500/10 border-red-500/30', mixto: 'text-amber-400 bg-amber-500/10 border-amber-500/30' };
  const effectLabels = { positivo: '↑ Positivo', negativo: '↓ Negativo', mixto: '~ Mixto' };

  const generateBriefing = async () => {
    setBriefingLoading(true);
    setBriefingError(null);
    setBriefing(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const newsApiKey = localStorage.getItem('news_api_key');
      if (newsApiKey) headers['X-News-Api-Key'] = newsApiKey;

      const res = await fetch('/api/daily-briefing', {
        method: 'POST',
        headers,
        body: JSON.stringify({ news }),
      });
      const d = await res.json();
      if (!res.ok || d.error) throw new Error(d.error ?? 'Error desconocido');
      setBriefing(d.briefing);
      setBriefingNews(news);
      setBriefingAddedUrls(new Set(d.addedUrls ?? []));
      setBriefingFailedUrls(new Set(d.failedUrls ?? []));
      setBriefingTelegramUrls(d.telegramUrls ?? []);
    } catch (e) {
      setBriefingError(e instanceof Error ? e.message : 'Error generando el resumen');
    } finally {
      setBriefingLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-12 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Noticias</h1>
          <p className="text-gray-400 text-sm mt-1">Mercados · Macro · Geopolítica</p>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            setNews([]);
            setAnalyses({});
            const headers: Record<string, string> = {};
            const newsApiKey = localStorage.getItem('news_api_key');
            if (newsApiKey) headers['X-News-Api-Key'] = newsApiKey;

            fetch('/api/news-enhanced', { headers })
              .then(r => r.json())
              .then(d => setNews(d.news ?? []))
              .catch(() => {})
              .finally(() => setLoading(false));
          }}
          disabled={loading}
          className="text-gray-500 hover:text-white text-sm border border-gray-800 hover:border-gray-600 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
        >
          {loading ? 'Cargando…' : 'Actualizar'}
        </button>
      </div>

      {/* Generate briefing button */}
      <button
        onClick={generateBriefing}
        disabled={briefingLoading || loading || news.length === 0}
        className="w-full py-3 rounded-xl border border-blue-700/50 bg-blue-600/10 text-blue-400 font-semibold text-sm hover:bg-blue-600/20 hover:border-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {briefingLoading ? (
          <>
            <span className="inline-block w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin mr-2 align-middle" />
            Generando resumen…
          </>
        ) : 'GENERAR RESUMEN DEL DÍA'}
      </button>

      {/* Briefing error */}
      {briefingError && (
        <div className="text-sm px-4 py-2.5 rounded-xl border bg-red-500/10 border-red-500/30 text-red-400">
          {briefingError}
        </div>
      )}

      {/* Daily briefing result */}
      {briefing && (
        <div className="bg-gray-900 border border-blue-900/40 rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 bg-blue-600/10 border-b border-blue-900/40">
            <span className="text-blue-400 text-sm">📊</span>
            <span className="text-blue-400 text-xs font-semibold uppercase tracking-wider">
              Resumen del día
            </span>
          </div>
          <div className="p-5">
            <FormattedMessage content={briefing} />
          </div>
          {briefingNews.length > 0 && (
            <div className="border-t border-blue-900/40 px-5 py-4">
              <p className="text-gray-600 text-[11px] font-semibold uppercase tracking-wider mb-3">
                {briefingAddedUrls.size} fuentes cargadas · {briefingFailedUrls.size} no disponibles · {briefingNews.length - briefingAddedUrls.size - briefingFailedUrls.size} omitidas
                {briefingTelegramUrls.length > 0 && ` · ${briefingTelegramUrls.length} de Telegram`}
              </p>
              <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                {briefingNews.map((item, i) => {
                  const ok = briefingAddedUrls.has(item.url);
                  const fail = briefingFailedUrls.has(item.url);
                  return (
                    <a
                      key={i}
                      href={item.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 group"
                    >
                      <span className={`text-[11px] mt-0.5 shrink-0 ${ok ? 'text-emerald-500' : fail ? 'text-red-500' : 'text-gray-700'}`}>
                        {ok ? '✓' : fail ? '✗' : '–'}
                      </span>
                      <div className="min-w-0">
                        <span className={`text-xs line-clamp-1 leading-snug transition-colors ${fail ? 'text-gray-600 line-through' : 'text-gray-400 group-hover:text-blue-400'}`}>
                          {item.title}
                        </span>
                        <span className="text-gray-700 text-[11px]"> · {item.source}</span>
                        {fail && <span className="text-red-700 text-[11px]"> · no accesible</span>}
                      </div>
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {/* Telegram sources */}
          {briefingTelegramUrls.length > 0 && (
            <div className="border-t border-blue-900/40 px-5 py-4">
                <p className="text-gray-600 text-[11px] font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <span className="text-blue-500">✈</span> Telegram · @descifrandolaguerra
                </p>
                <div className="space-y-1">
                  {briefingTelegramUrls.map((url, i) => {
                    const ok = briefingAddedUrls.has(url);
                    const fail = briefingFailedUrls.has(url);
                    return (
                      <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="flex items-start gap-2 group">
                        <span className={`text-[11px] mt-0.5 shrink-0 ${ok ? 'text-emerald-500' : fail ? 'text-red-500' : 'text-gray-600'}`}>
                          {ok ? '✓' : fail ? '✗' : '–'}
                        </span>
                        <span className={`text-xs line-clamp-1 transition-colors ${fail ? 'text-gray-600 line-through' : 'text-gray-400 group-hover:text-blue-400'}`}>
                          {url.replace(/^https?:\/\/(www\.)?/, '').slice(0, 80)}
                        </span>
                      </a>
                    );
                  })}
                </div>
              </div>
            )}
        </div>
      )}

      {/* Podcast section — only shown after briefing is generated */}
      {briefing && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <span className="text-purple-400 text-sm">🎙</span>
              <span className="text-purple-400 text-xs font-semibold uppercase tracking-wider">Podcast del día</span>
            </div>
            {podcastStatus === 'idle' && (
              <button
                onClick={generatePodcast}
                className="text-xs text-gray-400 hover:text-purple-400 border border-gray-700 hover:border-purple-700 px-3 py-1.5 rounded-lg transition-colors"
              >
                Generar podcast
              </button>
            )}
          </div>
          <div className="px-5 py-4">
            {podcastStatus === 'idle' && (
              <p className="text-gray-600 text-sm">
                Genera un podcast de ~10 min con dos presentadores de IA analizando las noticias del día.
              </p>
            )}
            {podcastStatus === 'generating' && (
              <div className="flex items-center gap-3 text-purple-400 text-sm">
                <span className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin shrink-0" />
                <span>Generando podcast… esto puede tardar entre 2 y 5 minutos</span>
              </div>
            )}
            {podcastStatus === 'failed' && (
              <div className="flex items-center justify-between gap-3">
                <p className="text-red-400 text-sm">{podcastError ?? 'Error generando el podcast'}</p>
                <button
                  onClick={() => { setPodcastStatus('idle'); setPodcastError(null); setPodcastJobId(null); }}
                  className="text-xs text-gray-500 hover:text-white border border-gray-700 hover:border-gray-500 px-3 py-1.5 rounded-lg transition-colors shrink-0"
                >
                  Reintentar
                </button>
              </div>
            )}
            {podcastStatus === 'ready' && podcastJobId && (
              <div className="space-y-3">
                <p className="text-gray-500 text-xs">Podcast generado con NotebookLM</p>
                <AudioPlayer src={`http://localhost:8000/api/podcast_audio/${podcastJobId}`} />
              </div>
            )}
          </div>
        </div>
      )}

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
