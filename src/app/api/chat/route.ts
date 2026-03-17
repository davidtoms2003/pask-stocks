import { NextRequest, NextResponse } from 'next/server';
import { StockInfo } from '@/app/api/stock-info/route';

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null) return 'N/D';
  return n.toFixed(decimals);
}

function fmtLarge(n: number | null | undefined): string {
  if (n == null) return 'N/D';
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return n.toFixed(0);
}

function buildContext(info: StockInfo): string {
  return `=== DATOS COMPLETOS DE ${info.ticker} (${info.name}) ===

INFORMACIÓN GENERAL
- Empresa: ${info.name}
- Ticker: ${info.ticker}
- Bolsa: ${info.exchange} | Divisa: ${info.currency}
- Sector: ${info.sector || 'N/D'}
- Industria: ${info.industry || 'N/D'}
- Empleados: ${info.employees ? info.employees.toLocaleString('es-ES') : 'N/D'}

DESCRIPCIÓN
${info.description || 'No disponible.'}

PRECIO Y VARIACIÓN
- Precio actual: ${info.currency} ${fmt(info.price)}
- Cambio diario: ${info.change >= 0 ? '+' : ''}${fmt(info.change)} (${info.changePercent >= 0 ? '+' : ''}${fmt(info.changePercent)}%)
- Volumen: ${fmtLarge(info.volume)} acciones
- Máximo 52 semanas: ${fmt(info.week52High)}
- Mínimo 52 semanas: ${fmt(info.week52Low)}

ANÁLISIS TÉCNICO
- Media Móvil 50 días (MA50): ${fmt(info.ma50)}
- Media Móvil 200 días (MA200): ${fmt(info.ma200)}
- RSI 14 periodos: ${fmt(info.rsi, 1)}
- Señal técnica: ${info.signal}
- Precio vs MA50: ${info.price > info.ma50 ? 'POR ENCIMA (alcista)' : 'POR DEBAJO (bajista)'}
- Precio vs MA200: ${info.price > info.ma200 ? 'POR ENCIMA (alcista)' : 'POR DEBAJO (bajista)'}
- MA50 vs MA200: ${info.ma50 > info.ma200 ? 'Golden Cross (alcista)' : 'Death Cross (bajista)'}

VALORACIÓN Y FUNDAMENTALES
- Capitalización bursátil: ${fmtLarge(info.marketCap)}
- PER (trailing): ${fmt(info.pe, 1)}x
- PER futuro (forward): ${fmt(info.forwardPE, 1)}x
- Beta: ${fmt(info.beta, 2)}
- Rentabilidad por dividendo: ${info.dividendYield ? `${(info.dividendYield * 100).toFixed(2)}%` : 'No paga dividendo'}

RESULTADOS FINANCIEROS
- Ingresos totales: ${fmtLarge(info.revenue)}
- Margen bruto: ${info.grossMargins ? `${(info.grossMargins * 100).toFixed(1)}%` : 'N/D'}
- Crecimiento de ingresos (YoY): ${info.revenueGrowth ? `${(info.revenueGrowth * 100).toFixed(1)}%` : 'N/D'}`;
}

interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export async function POST(request: NextRequest) {
  const { stockInfo, question, history = [], notebook_id = null } = await request.json() as {
    stockInfo: StockInfo | null;
    question: string;
    history: HistoryMessage[];
    notebook_id: string | null;
  };

  if (!question?.trim()) {
    return NextResponse.json({ error: 'La pregunta no puede estar vacía.' }, { status: 400 });
  }

  const stock_context = stockInfo ? buildContext(stockInfo) : '';

  try {
    const res = await fetch('http://localhost:8000/api/chat_agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, stock_context, history, notebook_id }),
      signal: AbortSignal.timeout(300000), // 5 min — skills como /dcf pueden tardar
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Error del backend: ${err}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({ answer: data.answer, actions: data.actions ?? [] });
  } catch {
    return NextResponse.json(
      { error: 'No se pudo conectar con el backend. ¿Está el servidor Python en marcha?' },
      { status: 503 },
    );
  }
}
