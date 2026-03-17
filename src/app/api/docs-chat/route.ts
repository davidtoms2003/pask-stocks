import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { question, termContext } = await request.json() as {
    question: string;
    termContext?: string;
  };

  if (!question?.trim()) {
    return NextResponse.json({ error: 'Pregunta vacía.' }, { status: 400 });
  }

  const prompt = [
    'Eres un asistente financiero experto integrado en la documentación de PASK Stocks.',
    'Responde SIEMPRE EN ESPAÑOL de forma MUY CONCISA: máximo 3-4 frases.',
    'Explica los conceptos financieros de forma clara, directa y accesible.',
    'No uses listas largas ni bullet points — responde en prosa corta y directa.',
    '',
    termContext ? `El usuario está consultando el concepto "${termContext}".` : '',
    `Pregunta: ${question}`,
  ].filter(Boolean).join('\n');

  try {
    const res = await fetch('http://localhost:8000/api/ask_pask_stocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: prompt }),
      signal: AbortSignal.timeout(60000),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: `Error del backend: ${err}` }, { status: res.status });
    }

    const data = await res.json() as { success: boolean; answer: string };
    return NextResponse.json({ answer: data.answer });
  } catch {
    return NextResponse.json({ error: 'No se pudo conectar con NotebookLM.' }, { status: 503 });
  }
}
