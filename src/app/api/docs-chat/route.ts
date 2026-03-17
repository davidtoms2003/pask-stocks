import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  // Check headers for client-provided key first
  const clientKey = request.headers.get('X-OpenRouter-Key');
  const apiKey = clientKey || process.env.OPEN_ROUTER_API_KEY;
  
  if (!apiKey) {
    return NextResponse.json({ error: 'OPEN_ROUTER_API_KEY no configurada. Configurala en /settings o en .env' }, { status: 500 });
  }

  const { question, termContext } = await request.json() as {
    question: string;
    termContext?: string;
  };

  if (!question?.trim()) {
    return NextResponse.json({ error: 'Pregunta vacía.' }, { status: 400 });
  }

  const systemPrompt = [
    'Eres un asistente financiero experto integrado en la documentación de PASK Stocks.',
    'Responde SIEMPRE EN ESPAÑOL de forma MUY CONCISA: máximo 3-4 frases.',
    'Explica los conceptos financieros de forma clara, directa y accesible.',
    'No uses listas largas ni bullet points — responde en prosa corta y directa.',
  ].join('\n');

  const userContent = [
    termContext ? `El usuario está consultando el concepto "${termContext}".` : '',
    `Pregunta: ${question}`,
  ].filter(Boolean).join('\n');

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
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userContent }
        ],
        max_tokens: 300,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return NextResponse.json({ error: `OpenRouter error: ${err}` }, { status: response.status });
    }

    const data = await response.json();
    const answer = data.choices?.[0]?.message?.content?.trim() ?? 'No se pudo generar respuesta.';

    return NextResponse.json({ answer });
  } catch {
    return NextResponse.json({ error: 'Error al contactar con OpenRouter.' }, { status: 500 });
  }
}
