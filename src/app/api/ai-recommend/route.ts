import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const clientKey = request.headers.get('X-OpenRouter-Key');
  const apiKey = clientKey || process.env.OPEN_ROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OPEN_ROUTER_API_KEY no configurada.' }, { status: 500 });
  }

  const { ticker, price, change, changePercent, volume, ma50, ma200, rsi } =
    await request.json();

  const prompt = `Eres un analista financiero experto en análisis técnico. Analiza los siguientes datos de la acción ${ticker} y emite una recomendación.

Datos técnicos:
- Precio actual: $${price.toFixed(2)}
- Cambio diario: ${change >= 0 ? '+' : ''}${change.toFixed(2)} (${changePercent.toFixed(2)}%)
- Volumen: ${(volume / 1_000_000).toFixed(1)}M acciones
- Media Móvil 50 días (MA50): $${ma50.toFixed(2)}
- Media Móvil 200 días (MA200): $${ma200.toFixed(2)}
- RSI 14 periodos: ${rsi.toFixed(1)}

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional antes ni después, con este formato exacto:
{"signal":"BUY","explanation":"texto de 2-3 frases en español explicando la decisión"}

El campo signal debe ser exactamente BUY, SELL o HOLD.
BUY si el contexto técnico es alcista. SELL si es bajista. HOLD si no hay señal clara.`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://pask-stocks.vercel.app',
        'X-Title': 'PASK Stocks',
      },
      body: JSON.stringify({
        model: 'arcee-ai/trinity-large-preview:free',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 300,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json({ error: `OpenRouter error: ${text}` }, { status: response.status });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content?.trim() ?? '';

    // Extract JSON even if the model adds surrounding text
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'La IA no devolvió JSON válido.' }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const signal = ['BUY', 'SELL', 'HOLD'].includes(parsed.signal) ? parsed.signal : 'HOLD';
    const explanation = parsed.explanation ?? 'Sin explicación disponible.';

    return NextResponse.json({ signal, explanation });
  } catch {
    return NextResponse.json({ error: 'Error al contactar con OpenRouter.' }, { status: 500 });
  }
}
