import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const clientKey = request.headers.get('X-OpenRouter-Key');
  const apiKey = clientKey || process.env.OPEN_ROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OPEN_ROUTER_API_KEY no configurada.' }, { status: 500 });
  }

  const { title, description } = await request.json();

  const prompt = `Eres un analista financiero experto. Responde SIEMPRE EN ESPAÑOL, independientemente del idioma de la noticia.

Analiza la siguiente noticia y responde ÚNICAMENTE con un JSON válido con este formato exacto, sin texto adicional:
{
  "summary": "Resumen de la noticia en 2 frases",
  "marketImpact": "Explicación de cómo puede afectar a los mercados financieros en general (2-3 frases)",
  "affected": [
    { "name": "Nombre sector o empresa", "effect": "positivo" | "negativo" | "mixto", "reason": "breve razón" }
  ]
}

El array "affected" debe tener entre 2 y 4 elementos (sectores y/o empresas concretas).
IMPORTANTE: Todos los textos del JSON deben estar escritos en español.

Noticia:
Título: ${title}
${description ? `Descripción: ${description}` : ''}`;

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
        max_tokens: 500,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      return NextResponse.json({ error: 'Error de OpenRouter.' }, { status: response.status });
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content?.trim() ?? '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Respuesta IA inválida.' }, { status: 500 });
    }

    const parsed = JSON.parse(jsonMatch[0]);
    return NextResponse.json(parsed);
  } catch {
    return NextResponse.json({ error: 'Error al contactar con OpenRouter.' }, { status: 500 });
  }
}
