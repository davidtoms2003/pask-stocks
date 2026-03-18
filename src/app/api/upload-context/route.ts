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
  if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`;
  return n.toFixed(0);
}

function buildContext(info: StockInfo): string {
  // Build a comprehensive markdown summary
  return `=== DATOS COMPLETOS DE ${info.ticker} (${info.name}) ===

INFORMACIÓN GENERAL
- Empresa: ${info.name}
- Ticker: ${info.ticker}
- Bolsa: ${info.exchange} | Divisa: ${info.currency}
- Sector: ${info.sector || 'N/D'} | Industria: ${info.industry || 'N/D'}
- Empleados: ${info.employees ? info.employees.toLocaleString('es-ES') : 'N/D'}
- Descripción: ${info.description || 'No disponible.'}

PRECIO Y MERCADO
- Precio actual: ${info.currency} ${fmt(info.price)}
- Cambio diario: ${info.change >= 0 ? '+' : ''}${fmt(info.change)} (${info.changePercent >= 0 ? '+' : ''}${fmt(info.changePercent)}%)
- Volumen: ${fmtLarge(info.volume)} acciones
- Rango 52 semanas: ${fmt(info.week52Low)} - ${fmt(info.week52High)}
- Capitalización bursátil: ${fmtLarge(info.marketCap)}
- Beta: ${fmt(info.beta, 2)}

ANÁLISIS TÉCNICO
- Media Móvil 50 días (MA50): ${fmt(info.ma50)}
- Media Móvil 200 días (MA200): ${fmt(info.ma200)}
- RSI (14): ${fmt(info.rsi, 1)}
- Señal técnica: ${info.signal}

VALORACIÓN
- PER (trailing): ${fmt(info.pe, 1)}x
- PER futuro (forward): ${fmt(info.forwardPE, 1)}x
- Dividendo: ${info.dividendYield ? `${(info.dividendYield * 100).toFixed(2)}%` : 'No paga dividendo'}

RESULTADOS
- Ingresos: ${fmtLarge(info.revenue)} (Crecimiento YoY: ${info.revenueGrowth ? `${(info.revenueGrowth * 100).toFixed(1)}%` : 'N/D'})
- Margen bruto: ${info.grossMargins ? `${(info.grossMargins * 100).toFixed(1)}%` : 'N/D'}
- EBITDA: ${fmtLarge(info.ebitda)}
- Beneficio neto: ${fmtLarge(info.netIncome)}
`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { stockInfo, notebook_id = null } = body;

    if (!stockInfo) {
      return NextResponse.json({ error: 'No stockInfo provided' }, { status: 400 });
    }

    const context = buildContext(stockInfo);

    // Forward to Python backend
    // The python backend expects: { "notebook_id": "...", "stock_context": "...", "question": "dummy" }
    // based on ChatAgentRequest model
    const res = await fetch('http://127.0.0.1:8000/api/upload_context', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        notebook_id, 
        stock_context: context,
        question: "context_upload_dummy",
        history: [],
        add_stock_context: true
      }),
    });

    if (!res.ok) {
      console.error('Failed to upload context to backend:', res.status, await res.text());
      // Don't fail the frontend request hard, just log it, as it's a background sync
      return NextResponse.json({ success: false, error: 'Backend error' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Error in /api/upload-context:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
