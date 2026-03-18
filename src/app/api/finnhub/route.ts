import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker');
  // Try to get API key from request header first, fallback to env variable
  const apiKey = req.headers.get('x-finnhub-api-key') || process.env.FINNHUB_API_KEY;

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
  }

  // Si no hay key, devolvemos null sin error para no romper la UI
  if (!apiKey) {
    console.warn('FINNHUB_API_KEY not found (neither in request header nor environment variables)');
    return NextResponse.json({ recommendation: null, sentiment: null });
  }

  try {
    const [recRes, sentRes] = await Promise.all([
      fetch(`https://finnhub.io/api/v1/stock/recommendation?symbol=${ticker}&token=${apiKey}`),
      fetch(`https://finnhub.io/api/v1/news-sentiment?symbol=${ticker}&token=${apiKey}`),
    ]);

    const recData = await recRes.json();
    const sentData = await sentRes.json();

    // Recommendation es un array, cogemos el primero (más reciente)
    const recommendation = Array.isArray(recData) && recData.length > 0 ? recData[0] : null;

    return NextResponse.json({
      recommendation,
      sentiment: sentData
    });
  } catch (error) {
    console.error('Finnhub API error:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
