import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const apiKey = process.env.OPEN_ROUTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'OPEN_ROUTER_API_KEY no configurada.' }, { status: 500 });
  }

  const { question, termContext } = await request.json() as {
    question: string;
    termContext?: string;
  };

  if (!question?.trim()) {
    return NextResponse.json({ error: 'Pregunta vacía.' }, { status: 400 });
  }

  const systemPrompt = `Eres un asistente financiero experto integrado en la documentación de PASK Stocks.
Respondes SIEMPRE EN ESPAÑOL de forma MUY CONCISA: máximo 3-4 frases por respuesta.
Explica los conceptos financieros de forma clara, directa y accesible, evitando jerga innecesaria.
Si el usuario pregunta algo fuera del ámbito financiero o bursátil, redirige amablemente hacia temas financieros.
No uses listas largas ni bullet points — responde en prosa corta y directa.`;

  const userMessage = termContext
    ? `Contexto: el usuario está consultando el concepto "${termContext}".\n\nPregunta: ${question}`
    : question;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://pask-stocks.vercel.app',
        'X-Title': 'PASK Stocks Docs',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.4,
        max_tokens: 220,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Error OpenRouter: ${err}` }, { status: res.status });
    }

    const data = await res.json();
    const answer = data.choices?.[0]?.message?.content ?? 'Sin respuesta.';
    return NextResponse.json({ answer });
  } catch {
    return NextResponse.json({ error: 'Error de conexión con OpenRouter.' }, { status: 503 });
  }
}
