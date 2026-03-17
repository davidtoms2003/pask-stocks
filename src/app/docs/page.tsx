'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Section {
  id: string;
  label: string;
  icon: string;
}

interface GlossaryEntry {
  term: string;
  category: 'técnico' | 'fundamental' | 'ia' | 'general';
  definition: string;
}

// ─── Navigation sections ──────────────────────────────────────────────────────

const SECTIONS: Section[] = [
  { id: 'intro',      label: 'Introducción',      icon: '🏠' },
  { id: 'analisis',   label: 'Análisis',           icon: '📊' },
  { id: 'chat',       label: 'Chat IA',            icon: '🤖' },
  { id: 'noticias',   label: 'Noticias',           icon: '📰' },
  { id: 'conceptos',  label: 'Conceptos',          icon: '📚' },
];

// ─── Glossary ─────────────────────────────────────────────────────────────────

const GLOSSARY: GlossaryEntry[] = [
  // Técnico
  {
    term: 'MA50 — Media Móvil de 50 días',
    category: 'técnico',
    definition: 'Promedio del precio de cierre de los últimos 50 días de cotización. Refleja la tendencia a corto-medio plazo. Si el precio está por encima de la MA50, se considera una señal alcista; por debajo, bajista.',
  },
  {
    term: 'MA200 — Media Móvil de 200 días',
    category: 'técnico',
    definition: 'Promedio del precio de cierre de los últimos 200 días. Es el indicador de tendencia a largo plazo más seguido por analistas e inversores institucionales. Una acción que cotiza sobre su MA200 se considera en tendencia alcista estructural.',
  },
  {
    term: 'RSI — Índice de Fuerza Relativa',
    category: 'técnico',
    definition: 'Oscilador que mide la velocidad y magnitud de los movimientos de precio en una escala de 0 a 100. RSI > 70 indica sobrecompra (posible corrección próxima), RSI < 30 indica sobreventa (posible rebote). La zona neutral es 40-60. Se calcula sobre 14 períodos por defecto.',
  },
  {
    term: 'Golden Cross',
    category: 'técnico',
    definition: 'Patrón alcista que ocurre cuando la MA50 cruza por encima de la MA200. Es una de las señales técnicas más conocidas y usadas por analistas. Sugiere que la tendencia a corto plazo supera a la de largo plazo, lo que muchos interpretan como inicio de un mercado alcista.',
  },
  {
    term: 'Death Cross',
    category: 'técnico',
    definition: 'Lo contrario al Golden Cross. Ocurre cuando la MA50 cruza por debajo de la MA200. Se interpreta como señal bajista, indicando que la tendencia a corto plazo se está deteriorando respecto a la tendencia de largo plazo.',
  },
  {
    term: 'Volumen',
    category: 'técnico',
    definition: 'Número de acciones negociadas durante una sesión. Un movimiento de precio acompañado de alto volumen tiene más fiabilidad que uno con volumen bajo. El volumen confirma tendencias: subidas con alto volumen son más sólidas.',
  },
  // Fundamental
  {
    term: 'Market Cap — Capitalización Bursátil',
    category: 'fundamental',
    definition: 'Valor total de mercado de una empresa. Se calcula multiplicando el precio de la acción por el número de acciones en circulación. Clasifica las empresas en Large-cap (>10B$), Mid-cap (2-10B$) y Small-cap (<2B$).',
  },
  {
    term: 'EV — Enterprise Value',
    category: 'fundamental',
    definition: 'Valor total de una empresa incluyendo su deuda. Fórmula: EV = Capitalización bursátil + Deuda total − Caja. Es el precio real que pagaría un comprador por adquirir toda la empresa, ya que también asumiría su deuda.',
  },
  {
    term: 'PER — Price to Earnings Ratio',
    category: 'fundamental',
    definition: 'Múltiplo que divide el precio de la acción entre el beneficio por acción (BPA). Indica cuántos años de beneficios actuales pagas por la acción. Un PER de 20x significa que pagas 20 veces el beneficio anual. Se compara con el sector para evaluar si la acción está cara o barata.',
  },
  {
    term: 'PER Forward (NTM)',
    category: 'fundamental',
    definition: 'PER calculado usando las estimaciones de beneficio de los próximos 12 meses (Next Twelve Months) en lugar de los beneficios históricos. Es más útil para empresas en crecimiento porque incorpora expectativas futuras.',
  },
  {
    term: 'EV/EBITDA',
    category: 'fundamental',
    definition: 'Múltiplo de valoración que divide el Enterprise Value entre el EBITDA. Es el múltiplo más usado en banca de inversión para comparar empresas de un mismo sector, independientemente de su estructura de capital o política fiscal.',
  },
  {
    term: 'EBITDA',
    category: 'fundamental',
    definition: 'Earnings Before Interest, Taxes, Depreciation and Amortization. Beneficio antes de intereses, impuestos, depreciaciones y amortizaciones. Es una aproximación al flujo de caja operativo de la empresa y permite comparar la rentabilidad operativa entre empresas con distinta estructura de deuda o fiscal.',
  },
  {
    term: 'Margen Bruto',
    category: 'fundamental',
    definition: '(Ingresos − Coste de ventas) / Ingresos. Mide cuánto queda de cada euro de ventas después de pagar el coste directo de producir el bien o servicio. Márgenes brutos altos (>60%) indican negocios con poder de fijación de precios o modelos de negocio escalables (software, farma).',
  },
  {
    term: 'Beta',
    category: 'fundamental',
    definition: 'Mide la sensibilidad del precio de una acción respecto al mercado general. Beta = 1 significa que se mueve igual que el mercado. Beta > 1 es más volátil (amplifica movimientos). Beta < 1 es más defensivo. Beta negativa significa movimiento inverso al mercado.',
  },
  {
    term: 'FCF — Free Cash Flow',
    category: 'fundamental',
    definition: 'Flujo de caja libre. El dinero real que genera la empresa después de pagar sus gastos operativos e inversiones en activos fijos (CapEx). FCF = Cash Flow Operativo − CapEx. Es el dinero disponible para pagar deuda, dividendos, recomprar acciones o crecer.',
  },
  {
    term: 'UFCF — Unlevered Free Cash Flow',
    category: 'fundamental',
    definition: 'Flujo de caja libre sin apalancar (antes de pagos de deuda). Fórmula: EBIT × (1 − Tax Rate) + D&A − CapEx − ΔNWC. Es la métrica que se usa en modelos DCF porque refleja el valor del negocio independientemente de cómo esté financiado.',
  },
  {
    term: 'WACC',
    category: 'fundamental',
    definition: 'Weighted Average Cost of Capital — Coste Medio Ponderado de Capital. Es la tasa de descuento usada en modelos DCF. Combina el coste del capital propio (Ke) y el coste de la deuda (Kd) ponderados por su peso en la estructura de capital. Cuanto mayor el WACC, menor la valoración DCF.',
  },
  {
    term: 'DCF — Discounted Cash Flow',
    category: 'fundamental',
    definition: 'Método de valoración que calcula el valor intrínseco de una empresa descontando sus flujos de caja futuros a valor presente usando el WACC. Es el método más riguroso teóricamente, pero muy sensible a los supuestos de crecimiento y tasa de descuento.',
  },
  {
    term: 'Valor Terminal',
    category: 'fundamental',
    definition: 'En un modelo DCF, el valor que captura todos los flujos de caja más allá del período de proyección explícito (normalmente 5-10 años). Suele representar el 60-80% del EV total. Se calcula por perpetuidad de Gordon (TV = FCF × (1+g) / (WACC − g)) o por múltiplo de salida.',
  },
  {
    term: 'Comparables (Comps)',
    category: 'fundamental',
    definition: 'Análisis de empresas similares cotizadas en bolsa para obtener múltiplos de valoración de mercado (EV/EBITDA, PER, etc.) y aplicarlos a la empresa analizada. Es el método de valoración relativa más usado en la práctica por bancos de inversión.',
  },
  {
    term: 'EPS — Earnings Per Share',
    category: 'fundamental',
    definition: 'Beneficio por acción. BPA = Beneficio neto / Acciones diluidas en circulación. Es la métrica de rentabilidad más seguida por el mercado en los informes de resultados trimestrales (earnings).',
  },
  {
    term: 'Guidance',
    category: 'fundamental',
    definition: 'Previsiones que la dirección de la empresa ofrece públicamente sobre sus resultados futuros (ingresos, márgenes, BPA). El mercado reacciona especialmente a las revisiones de guidance: una rebaja puede hundir la acción incluso si los resultados actuales son buenos.',
  },
  {
    term: 'LTM / NTM',
    category: 'fundamental',
    definition: 'Last Twelve Months (últimos 12 meses) y Next Twelve Months (próximos 12 meses). Los múltiplos LTM usan datos históricos; los NTM usan estimaciones de consenso. Los NTM son más relevantes para empresas en crecimiento.',
  },
  {
    term: 'Moat — Ventaja Competitiva',
    category: 'fundamental',
    definition: 'Término de Warren Buffett para describir la ventaja competitiva duradera de una empresa. Los cuatro tipos principales son: efectos de red (el producto vale más con más usuarios), costes de cambio (difícil abandonar el producto), economías de escala (más barato producir a mayor volumen) y activos intangibles (marca, patentes, licencias).',
  },
  {
    term: 'Rentabilidad por Dividendo',
    category: 'fundamental',
    definition: 'Dividendo anual por acción / Precio de la acción. Indica el porcentaje de retorno que el accionista recibe en forma de dividendos. Empresas maduras con flujos estables (utilities, consumo defensivo) suelen tener yields más altos.',
  },
  // IA
  {
    term: 'NotebookLM',
    category: 'ia',
    definition: 'Herramienta de Google basada en IA que permite crear cuadernos de investigación. Puedes añadir fuentes (artículos, URLs) y hacer preguntas sobre su contenido. En PASK Stocks, el agente puede guardar fuentes y notas directamente en tus cuadernos de NotebookLM.',
  },
  {
    term: 'Agente IA / Agentic AI',
    category: 'ia',
    definition: 'Sistema de IA capaz de usar herramientas de forma autónoma para completar tareas complejas. En PASK Stocks, el agente puede encadenar búsquedas web, añadir fuentes a NotebookLM y crear notas de análisis en una sola solicitud, sin intervención manual.',
  },
  {
    term: 'OpenRouter',
    category: 'ia',
    definition: 'Plataforma que permite acceder a múltiples modelos de IA (GPT-4o, Claude, Mistral, etc.) a través de una única API. PASK Stocks usa OpenRouter para conectar con el modelo de lenguaje que genera los análisis y recomendaciones.',
  },
  {
    term: 'System Prompt',
    category: 'ia',
    definition: 'Conjunto de instrucciones que definen el comportamiento, rol y metodología del agente IA antes de que empiece una conversación. En PASK Stocks, el system prompt incluye las metodologías financieras de los plugins de Anthropic (DCF, comps, earnings, etc.).',
  },
  // General
  {
    term: 'Ticker',
    category: 'general',
    definition: 'Código alfanumérico único que identifica a una empresa en bolsa. Por ejemplo: AAPL (Apple), NVDA (NVIDIA), TSLA (Tesla), MSFT (Microsoft). En los mercados americanos suele tener entre 1 y 5 letras.',
  },
  {
    term: 'Señal COMPRAR / MANTENER / VENDER',
    category: 'general',
    definition: 'Recomendación generada por el análisis técnico e IA. COMPRAR: indicadores alcistas (precio sobre MAs, RSI saludable, momentum positivo). MANTENER: señales mixtas o neutras. VENDER: indicadores bajistas (precio bajo MAs, RSI en sobrecompra o tendencia negativa). No es asesoramiento financiero.',
  },
  {
    term: 'Yahoo Finance API',
    category: 'general',
    definition: 'Fuente de datos financieros en tiempo real que PASK Stocks utiliza para obtener cotizaciones, datos históricos, fundamentales y búsqueda de tickers. Proporciona datos de miles de activos cotizados en bolsas de todo el mundo.',
  },
  {
    term: 'Autocomplete / Autocompletado',
    category: 'general',
    definition: 'Funcionalidad que sugiere tickers y nombres de empresas mientras escribes en el buscador. Busca tanto por símbolo (AAPL) como por nombre (Apple). Se conecta a Yahoo Finance para ofrecer sugerencias en tiempo real.',
  },
];

const CATEGORY_LABELS: Record<GlossaryEntry['category'], string> = {
  técnico: 'Análisis técnico',
  fundamental: 'Análisis fundamental',
  ia: 'Inteligencia artificial',
  general: 'General',
};

const CATEGORY_COLORS: Record<GlossaryEntry['category'], string> = {
  técnico:     'bg-blue-900/40 text-blue-300 border-blue-700/50',
  fundamental: 'bg-emerald-900/40 text-emerald-300 border-emerald-700/50',
  ia:          'bg-purple-900/40 text-purple-300 border-purple-700/50',
  general:     'bg-gray-800/60 text-gray-300 border-gray-700/50',
};

// ─── Components ───────────────────────────────────────────────────────────────

function SectionTitle({ id, icon, title, subtitle }: { id: string; icon: string; title: string; subtitle?: string }) {
  return (
    <div id={id} className="scroll-mt-20 flex items-start gap-3 mb-6">
      <span className="text-2xl mt-0.5">{icon}</span>
      <div>
        <h2 className="text-xl font-bold text-white">{title}</h2>
        {subtitle && <p className="text-gray-400 text-sm mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function FeatureCard({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-lg">{icon}</span>
        <h3 className="font-semibold text-white text-sm">{title}</h3>
      </div>
      <div className="text-gray-400 text-sm leading-relaxed space-y-1">{children}</div>
    </div>
  );
}

function CommandCard({ cmd, icon, title, description, steps }: {
  cmd: string; icon: string; title: string; description: string; steps: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-gray-900/60 border border-blue-900/40 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-800/40 transition-colors"
      >
        <span className="text-lg">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <code className="text-blue-300 font-mono text-xs bg-blue-950/60 px-2 py-0.5 rounded">{cmd}</code>
            <span className="text-white text-sm font-medium">{title}</span>
          </div>
          <p className="text-gray-500 text-xs mt-0.5 truncate">{description}</p>
        </div>
        <span className={`text-gray-500 text-xs transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-gray-800/60 pt-3">
          <p className="text-gray-400 text-sm mb-3">{description}</p>
          <div className="space-y-1.5">
            {steps.map((step, i) => (
              <div key={i} className="flex gap-2 text-sm">
                <span className="text-blue-400 font-mono shrink-0 tabular-nums text-xs mt-0.5">{i + 1}.</span>
                <span className="text-gray-300">{step}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GlossaryCard({ entry, onAsk }: { entry: GlossaryEntry; onAsk: (term: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-gray-900/40 border border-gray-800 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-800/30 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white text-sm font-medium">{entry.term}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${CATEGORY_COLORS[entry.category]}`}>
              {CATEGORY_LABELS[entry.category]}
            </span>
          </div>
        </div>
        <span className={`text-gray-500 text-xs shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}>▼</span>
      </button>
      {open && (
        <div className="px-4 pb-4 border-t border-gray-800/40 pt-3 space-y-3">
          <p className="text-gray-300 text-sm leading-relaxed">{entry.definition}</p>
          <button
            onClick={() => onAsk(entry.term)}
            className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 bg-blue-950/30 hover:bg-blue-950/50 border border-blue-900/40 rounded-lg px-2.5 py-1.5 transition-colors"
          >
            <span>💬</span>
            <span>Preguntar sobre este concepto</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Docs Chat Widget ─────────────────────────────────────────────────────────

interface DocsChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

function DocsChatWidget({ activeTerm, forceOpen }: { activeTerm: string | null; forceOpen?: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen, activeTerm]);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<DocsChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // When a new term is selected and chat is open, focus the input
  useEffect(() => {
    if (open && activeTerm) {
      inputRef.current?.focus();
    }
  }, [activeTerm, open]);

  // Scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async (overrideText?: string) => {
    const q = (overrideText ?? input).trim();
    if (!q || loading) return;

    const newMessages: DocsChatMessage[] = [...messages, { role: 'user', content: q }];
    setMessages(newMessages);
    if (!overrideText) setInput('');
    setLoading(true);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const apiKey = localStorage.getItem('openrouter_key');
      if (apiKey) headers['X-OpenRouter-Key'] = apiKey;

      const res = await fetch('/api/docs-chat', {
        method: 'POST',
        headers,
        body: JSON.stringify({ question: q, termContext: activeTerm ?? undefined }),
      });
      const data = await res.json();
      setMessages(prev => [...prev, { role: 'assistant', content: data.answer ?? data.error ?? 'Sin respuesta.' }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error de conexión.' }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2">
      {/* Chat panel */}
      {open && (
        <div className="w-80 bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800 bg-gray-900/80">
            <div className="flex items-center gap-2">
              <span className="text-sm">🤖</span>
              <span className="text-white text-sm font-semibold">Consultor financiero</span>
            </div>
            <div className="flex items-center gap-2">
              {messages.length > 0 && (
                <button
                  onClick={() => setMessages([])}
                  className="text-gray-600 hover:text-gray-400 text-[10px] transition-colors"
                  title="Limpiar"
                >
                  Limpiar
                </button>
              )}
              <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white transition-colors text-lg leading-none">×</button>
            </div>
          </div>

          {/* Active term chip */}
          {activeTerm && (
            <div className="px-3 pt-2.5 pb-0">
              <div className="flex items-center gap-1.5 bg-blue-950/60 border border-blue-800/50 rounded-lg px-2.5 py-1.5">
                <span className="text-blue-400 text-[10px]">Contexto:</span>
                <span className="text-blue-200 text-xs font-medium truncate">{activeTerm.split('—')[0].trim()}</span>
              </div>
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2.5 max-h-72 min-h-[120px]">
            {messages.length === 0 && !loading && (
              <div className="text-center py-6 space-y-2">
                <p className="text-gray-600 text-xs">
                  {activeTerm
                    ? `Pregunta lo que quieras sobre "${activeTerm.split('—')[0].trim()}"`
                    : 'Selecciona un concepto del glosario o escribe tu duda financiera'}
                </p>
                {activeTerm && (
                  <div className="flex flex-col gap-1.5 mt-3">
                    {[
                      `¿Cómo se usa ${activeTerm.split('—')[0].trim()} en la práctica?`,
                      `¿Por qué es importante?`,
                      `Dame un ejemplo real`,
                    ].map(s => (
                      <button
                        key={s}
                        onClick={() => send(s)}
                        className="text-xs text-blue-400 hover:text-blue-300 bg-blue-950/30 hover:bg-blue-950/50 border border-blue-900/40 rounded-lg px-2.5 py-1.5 transition-colors text-left"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[88%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-gray-800 text-gray-200 rounded-bl-sm'
                }`}>
                  {m.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-800 rounded-xl rounded-bl-sm px-3 py-2.5 flex gap-1">
                  <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:0ms]" />
                  <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 bg-gray-500 rounded-full animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 pb-3 pt-2 border-t border-gray-800/60 flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Escribe tu duda…"
              disabled={loading}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-xs placeholder:text-gray-600 focus:outline-none focus:border-blue-500 transition-colors disabled:opacity-50"
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 rounded-xl transition-colors"
            >
              <span className="text-xs">↑</span>
            </button>
          </div>
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center text-xl transition-all ${
          open ? 'bg-gray-700 hover:bg-gray-600' : 'bg-blue-600 hover:bg-blue-500'
        }`}
        title={open ? 'Cerrar consultor' : 'Consultar conceptos'}
      >
        {open ? '×' : '💬'}
      </button>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocsPage() {
  const [glossaryFilter, setGlossaryFilter] = useState<GlossaryEntry['category'] | 'all'>('all');
  const [glossarySearch, setGlossarySearch] = useState('');
  const [activeTerm, setActiveTerm] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const handleAskTerm = (term: string) => {
    setActiveTerm(term);
    setChatOpen(true);
  };

  const filteredGlossary = GLOSSARY.filter(e => {
    const matchesCat = glossaryFilter === 'all' || e.category === glossaryFilter;
    const matchesSearch = glossarySearch === '' ||
      e.term.toLowerCase().includes(glossarySearch.toLowerCase()) ||
      e.definition.toLowerCase().includes(glossarySearch.toLowerCase());
    return matchesCat && matchesSearch;
  });

  return (
    <main className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900/60 backdrop-blur sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-black text-sm select-none">P</div>
            <span className="font-bold text-base tracking-tight">PASK STOCKS</span>
          </Link>
          <span className="text-gray-700">/</span>
          <span className="text-gray-400 text-sm">Documentación</span>
          <nav className="ml-auto">
            <Link href="/" className="px-4 py-1.5 rounded-lg text-sm font-medium text-gray-400 hover:text-white transition-colors">
              ← Volver a la app
            </Link>
          </nav>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10 flex gap-10">

        {/* Sidebar */}
        <aside className="hidden lg:block w-48 shrink-0">
          <div className="sticky top-24 space-y-1">
            <p className="text-gray-600 text-[10px] uppercase tracking-widest font-semibold mb-3">Contenido</p>
            {SECTIONS.map(s => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-white hover:bg-gray-800/60 transition-colors"
              >
                <span className="text-base">{s.icon}</span>
                <span>{s.label}</span>
              </a>
            ))}
          </div>
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0 space-y-16">

          {/* ── Intro ── */}
          <section>
            <SectionTitle id="intro" icon="🏠" title="PASK Stocks" subtitle="Documentación de uso de la plataforma" />
            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5 space-y-3 text-sm text-gray-300 leading-relaxed">
              <p>
                <strong className="text-white">PASK Stocks</strong> es una plataforma de análisis bursátil que combina indicadores técnicos en tiempo real, un agente de IA con capacidades de investigación financiera institucional y un agregador de noticias de mercado.
              </p>
              <p>
                La plataforma está formada por <strong className="text-white">tres pestañas principales</strong>: <span className="text-blue-300">Análisis</span>, <span className="text-blue-300">Chat IA</span> y <span className="text-blue-300">Noticias</span>. Cada una cubre un flujo de trabajo distinto, desde el análisis rápido de un ticker hasta el análisis fundamental profundo asistido por IA.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                {[
                  { icon: '📊', tab: 'Análisis', desc: 'Indicadores técnicos, precio en tiempo real y señal IA' },
                  { icon: '🤖', tab: 'Chat IA',  desc: 'Agente financiero con metodologías institucionales y NotebookLM' },
                  { icon: '📰', tab: 'Noticias', desc: 'Briefing diario de mercados y noticias financieras' },
                ].map(({ icon, tab, desc }) => (
                  <div key={tab} className="bg-gray-800/40 rounded-lg p-3 text-center border border-gray-700/50">
                    <p className="text-2xl mb-1">{icon}</p>
                    <p className="text-white font-semibold text-sm">{tab}</p>
                    <p className="text-gray-500 text-xs mt-0.5">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Análisis ── */}
          <section>
            <SectionTitle id="analisis" icon="📊" title="Pestaña: Análisis" subtitle="Análisis técnico e IA de cualquier acción cotizada" />

            <div className="space-y-4">
              <FeatureCard icon="🔍" title="Buscador con autocompletado">
                <p>Escribe el <strong className="text-gray-200">ticker</strong> (p. ej. <code className="bg-gray-800 px-1 rounded text-xs">AAPL</code>) o el <strong className="text-gray-200">nombre</strong> de la empresa (p. ej. <code className="bg-gray-800 px-1 rounded text-xs">Apple</code>) en el campo de búsqueda.</p>
                <p>El autocompletado consulta Yahoo Finance en tiempo real y sugiere hasta 6 coincidencias. Puedes navegar con las teclas <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs">↑</kbd> <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs">↓</kbd> y confirmar con <kbd className="bg-gray-700 px-1.5 py-0.5 rounded text-xs">Enter</kbd>.</p>
                <p>Los botones de <strong className="text-gray-200">demo</strong> (AAPL, NVDA, TSLA, MSFT, NFLX) permiten probar la plataforma sin escribir nada.</p>
              </FeatureCard>

              <FeatureCard icon="💵" title="Tarjeta de precio">
                <p>Muestra el <strong className="text-gray-200">precio actual</strong>, la <strong className="text-gray-200">variación diaria</strong> en valor absoluto y porcentaje (verde = sube, rojo = baja), y el <strong className="text-gray-200">volumen</strong> negociado en la sesión actual.</p>
                <p>Datos obtenidos de Yahoo Finance con actualización en cada consulta.</p>
              </FeatureCard>

              <FeatureCard icon="📈" title="Indicadores técnicos">
                <div className="space-y-2">
                  <div>
                    <p className="text-gray-200 font-medium">MA50 y MA200</p>
                    <p>Medias móviles de 50 y 200 días calculadas sobre el histórico de precios de cierre. El fondo del indicador es <span className="text-emerald-400">verde</span> si el precio está por encima (señal alcista) y <span className="text-red-400">rojo</span> si está por debajo (señal bajista).</p>
                  </div>
                  <div>
                    <p className="text-gray-200 font-medium">RSI (14 períodos)</p>
                    <p>Índice de Fuerza Relativa. Se muestra en <span className="text-amber-400">amarillo</span> si supera 70 (sobrecompra) o cae bajo 30 (sobreventa), y en verde en zona neutral (40-60).</p>
                  </div>
                </div>
              </FeatureCard>

              <FeatureCard icon="🎯" title="Señal IA (COMPRAR / MANTENER / VENDER)">
                <p>Tras obtener los datos técnicos, se lanza automáticamente una llamada al modelo <strong className="text-gray-200">arcee-ai/trinity-large-preview</strong> vía OpenRouter con todos los indicadores y se genera una señal con explicación en texto.</p>
                <div className="flex gap-2 flex-wrap mt-1">
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-700/50 text-xs px-2 py-0.5 rounded-full font-medium">COMPRAR</span>
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-700/50 text-xs px-2 py-0.5 rounded-full font-medium">MANTENER</span>
                  <span className="bg-red-500/20 text-red-300 border border-red-700/50 text-xs px-2 py-0.5 rounded-full font-medium">VENDER</span>
                </div>
                <p className="text-gray-500 text-xs mt-1">⚠️ Esta señal es orientativa y no constituye asesoramiento financiero.</p>
              </FeatureCard>
            </div>
          </section>

          {/* ── Chat IA ── */}
          <section>
            <SectionTitle id="chat" icon="🤖" title="Pestaña: Chat IA" subtitle="Agente financiero con metodologías institucionales y memoria en NotebookLM" />

            <div className="space-y-4">
              <FeatureCard icon="📒" title="Selector de cuaderno (NotebookLM)">
                <p>Antes de empezar el chat, selecciona el <strong className="text-gray-200">cuaderno de NotebookLM</strong> donde el agente guardará fuentes y notas. El número entre paréntesis indica las fuentes ya añadidas al cuaderno.</p>
                <p>El selector se <strong className="text-gray-200">desactiva</strong> una vez iniciada la conversación para evitar pérdida de contexto. Usa "Limpiar conversación" para cambiarlo.</p>
              </FeatureCard>

              <FeatureCard icon="🔍" title="Selector de acción">
                <p>Busca y selecciona la empresa sobre la que quieres conversar. El agente recibe automáticamente el <strong className="text-gray-200">contexto técnico y fundamental completo</strong> de la acción seleccionada: precio, MA50/MA200, RSI, sector, PER, Market Cap, márgenes y más.</p>
                <p>Si cambias de acción con una conversación en curso, aparecerá un <strong className="text-gray-200">diálogo de confirmación</strong> para evitar perder el historial.</p>
              </FeatureCard>

              <FeatureCard icon="💬" title="Chat libre">
                <p>Puedes hacer cualquier pregunta sobre la acción seleccionada o sobre mercados en general. El agente buscará en internet si necesita datos actualizados y resumirá los resultados.</p>
                <p>El historial de mensajes se mantiene durante la sesión para que el agente tenga contexto de la conversación completa.</p>
              </FeatureCard>

              <div>
                <p className="text-gray-500 text-xs uppercase tracking-widest font-semibold mb-3">Comandos de análisis financiero</p>
                <p className="text-gray-400 text-sm mb-3">
                  Los siguientes comandos activan análisis financieros de calidad institucional, basados en las metodologías de los <strong className="text-gray-300">Anthropic Financial Services Plugins</strong>. Haz clic en cada uno para ver el flujo de trabajo detallado.
                </p>
                <div className="space-y-2">
                  <CommandCard
                    cmd="/one-pager" icon="📄" title="Strip Profile"
                    description="Genera una ficha resumen profesional de la empresa en formato 4 cuadrantes (estilo Goldman Sachs / JPMorgan)."
                    steps={[
                      'Busca datos actualizados de la empresa en internet',
                      'Construye el cuadrante 1: descripción, sede, empleados, liderazgo',
                      'Construye el cuadrante 2: posicionamiento competitivo y catalizadores',
                      'Construye el cuadrante 3: tabla de métricas financieras clave',
                      'Construye el cuadrante 4: comportamiento bursátil y accionistas',
                      'Emite veredicto COMPRAR/MANTENER/VENDER con price target estimado',
                      'Guarda el one-pager como nota en NotebookLM',
                    ]}
                  />
                  <CommandCard
                    cmd="/dcf" icon="💰" title="Modelo DCF"
                    description="Construye un modelo de valoración por Discounted Cash Flow con metodología de banca de inversión institucional."
                    steps={[
                      'Busca FCF histórico de los últimos 3-5 años (UFCF = EBIT×(1-t)+D&A-CapEx-ΔNWC)',
                      'Proyecta ingresos y márgenes en 3 escenarios: bajista, base y alcista',
                      'Estima el WACC con CAPM (Ke = Rf + β × ERP) y estructura de capital',
                      'Calcula el Valor Terminal por perpetuidad de Gordon y múltiplo de salida',
                      'Descuenta FCFs y TV al presente para obtener EV y precio por acción',
                      'Muestra tabla de sensibilidad WACC × tasa de crecimiento terminal',
                    ]}
                  />
                  <CommandCard
                    cmd="/earnings" icon="📈" title="Análisis de resultados"
                    description="Analiza los resultados trimestrales más recientes con rigor de equity research, empezando siempre por el beat/miss."
                    steps={[
                      'Busca el earnings report más reciente en internet para obtener datos actuales',
                      'Construye tabla de resultados vs. estimaciones (EPS, ingresos, EBITDA, margen bruto)',
                      'Analiza evolución de márgenes QoQ y YoY',
                      'Extrae y compara el guidance del próximo trimestre vs. estimaciones previas',
                      'Resume los 3-5 puntos clave del earnings call',
                      'Evalúa la reacción del mercado y el impacto en la tesis de inversión',
                    ]}
                  />
                  <CommandCard
                    cmd="/comps" icon="⚖️" title="Análisis de comparables"
                    description="Construye una tabla de comparables de sector con múltiplos de valoración para posicionar la empresa vs. sus pares."
                    steps={[
                      'Identifica 5-8 empresas del mismo sector con modelo de negocio similar',
                      'Recopila Market Cap, EV, Deuda Neta e Ingresos de cada comparable',
                      'Calcula EV/EBITDA, EV/Ventas y PER (LTM y NTM forward)',
                      'Calcula la mediana del sector para cada múltiplo',
                      'Determina valoración implícita de la empresa analizada',
                      'Analiza si el descuento o prima respecto al sector está justificado',
                    ]}
                  />
                  <CommandCard
                    cmd="/competitive" icon="🏆" title="Análisis competitivo"
                    description="Mapea el entorno competitivo completo con análisis de moat y escenarios estratégicos."
                    steps={[
                      'Identifica las 3-5 métricas clave que definen la competencia en el sector',
                      'Clasifica los competidores: directos, adyacentes y entrantes',
                      'Hace deep-dive de los 3-4 principales rivales (métricas + fortalezas/debilidades)',
                      'Construye tabla comparativa con ratings ●●● por dimensión',
                      'Evalúa el moat: efectos de red, switching costs, escala, intangibles',
                      'Sintetiza con escenarios alcista, base y bajista para la empresa',
                    ]}
                  />
                  <CommandCard
                    cmd="/screen" icon="🔎" title="Screening de ideas"
                    description="Genera ideas de inversión en el sector mediante pantallas cuantitativas (value, growth, quality, short)."
                    steps={[
                      'Aplica pantalla de valor: PER < mediana sector, FCF yield >5%, P/Book < 1.5x',
                      'Aplica pantalla de crecimiento: ingresos >15% YoY, expansión márgenes, ROIC >15%',
                      'Aplica pantalla de calidad: crecimiento estable 5 años, ROE >15%, insider ownership',
                      'Identifica 3-5 ideas con mayor convicción',
                      'Para cada idea: métricas vs. pares, tesis de inversión, catalizador y riesgos',
                    ]}
                  />
                </div>
              </div>

              <div>
                <p className="text-gray-500 text-xs uppercase tracking-widest font-semibold mb-3">Otras acciones rápidas</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { icon: '🔍', title: 'Buscar noticias', desc: 'Busca noticias recientes sobre la empresa seleccionada y resume los resultados.' },
                    { icon: '📎', title: 'Añadir fuente', desc: 'Pega una URL y el agente la añade directamente a tu cuaderno de NotebookLM.' },
                    { icon: '🌐', title: 'Buscar y guardar fuentes', desc: 'El agente busca artículos relevantes y añade automáticamente los más útiles al cuaderno.' },
                    { icon: '📝', title: 'Crear nota', desc: 'Dicta el contenido de una nota y el agente la guarda en NotebookLM para tu historial de análisis.' },
                    { icon: '📰', title: 'Resumir el mercado', desc: 'Busca el estado del mercado en el día y genera un resumen ejecutivo de los movimientos principales.' },
                  ].map(({ icon, title, desc }) => (
                    <div key={title} className="bg-gray-900/40 border border-gray-800 rounded-lg p-3 flex gap-2.5">
                      <span className="text-lg shrink-0">{icon}</span>
                      <div>
                        <p className="text-white text-sm font-medium">{title}</p>
                        <p className="text-gray-500 text-xs mt-0.5">{desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── Noticias ── */}
          <section>
            <SectionTitle id="noticias" icon="📰" title="Pestaña: Noticias" subtitle="Briefing diario de mercados y feed de noticias financieras" />

            <div className="space-y-4">
              <FeatureCard icon="📋" title="Briefing diario de mercado">
                <p>Al abrir la pestaña se genera automáticamente un <strong className="text-gray-200">briefing ejecutivo del día</strong> mediante IA. Agrega noticias de tres fuentes: NewsAPI, Google News RSS y Yahoo Finance.</p>
                <p>El briefing incluye: resumen ejecutivo, eventos de mercado destacados, sectores y empresas afectadas, contexto macroeconómico y perspectivas/riesgos para las próximas sesiones.</p>
                <p>El resultado se <strong className="text-gray-200">cachea durante 24 horas</strong> para evitar llamadas repetidas a la API y se sincroniza con el cuaderno "News Of The Day" de NotebookLM en segundo plano.</p>
              </FeatureCard>

              <FeatureCard icon="📰" title="Feed de noticias">
                <p>Lista de artículos financieros del día obtenidos de múltiples fuentes. Cada artículo muestra título, fuente, tiempo transcurrido y un fragmento del contenido.</p>
                <p>Las noticias se <strong className="text-gray-200">deduplicamos</strong> automáticamente para evitar repeticiones entre fuentes.</p>
              </FeatureCard>

              <FeatureCard icon="🧠" title="Análisis individual de noticias">
                <p>Cada noticia tiene un botón de análisis que envía el artículo al modelo de IA y devuelve:</p>
                <ul className="list-none space-y-1 mt-1">
                  {[
                    'Resumen del artículo en 2-3 frases',
                    'Sentimiento: Positivo / Neutro / Negativo',
                    'Sectores y empresas potencialmente afectadas',
                    'Relevancia para inversores',
                  ].map(item => (
                    <li key={item} className="flex gap-2">
                      <span className="text-blue-400 shrink-0">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </FeatureCard>
            </div>
          </section>

          {/* ── Conceptos ── */}
          <section>
            <SectionTitle id="conceptos" icon="📚" title="Conceptos" subtitle={`Glosario de ${GLOSSARY.length} términos financieros y técnicos`} />

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <input
                type="text"
                placeholder="Buscar término o definición…"
                value={glossarySearch}
                onChange={e => setGlossarySearch(e.target.value)}
                className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-sm placeholder:text-gray-600 focus:outline-none focus:border-blue-500 transition-colors"
              />
              <div className="flex gap-2 flex-wrap">
                {(['all', 'técnico', 'fundamental', 'ia', 'general'] as const).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setGlossaryFilter(cat)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      glossaryFilter === cat
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-white'
                    }`}
                  >
                    {cat === 'all' ? 'Todos' : CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>
            </div>

            {filteredGlossary.length === 0 ? (
              <div className="text-center py-10 text-gray-600 text-sm">
                No hay términos que coincidan con &quot;{glossarySearch}&quot;
              </div>
            ) : (
              <div className="space-y-2">
                {filteredGlossary.map(entry => (
                  <GlossaryCard key={entry.term} entry={entry} onAsk={handleAskTerm} />
                ))}
              </div>
            )}
          </section>

          {/* Footer */}
          <div className="border-t border-gray-800 pt-8 text-center text-gray-600 text-xs space-y-1 pb-8">
            <p>PASK Stocks · Plataforma educativa de análisis bursátil</p>
            <p>Los análisis e indicadores son orientativos y no constituyen asesoramiento financiero.</p>
          </div>
        </div>
      </div>

      <DocsChatWidget activeTerm={activeTerm} forceOpen={chatOpen} />
    </main>
  );
}
