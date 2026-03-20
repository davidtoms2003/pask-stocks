import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker');
  const apiKey = req.headers.get('x-finnhub-api-key') || process.env.FINNHUB_API_KEY;

  if (!ticker) {
    return NextResponse.json({ error: 'Ticker is required' }, { status: 400 });
  }

  if (!apiKey) {
    console.warn('FINNHUB_API_KEY not found');
    return NextResponse.json({ recommendation: null, sentiment: null, priceTarget: null, basicFinancials: null, profile: null, peers: null });
  }

  try {
    const [recRes, sentRes, priceTargetRes, financialsRes, profileRes, peersRes] = await Promise.all([
      fetch(`https://finnhub.io/api/v1/stock/recommendation?symbol=${ticker}&token=${apiKey}`),
      fetch(`https://finnhub.io/api/v1/news-sentiment?symbol=${ticker}&token=${apiKey}`),
      fetch(`https://finnhub.io/api/v1/stock/price-target?symbol=${ticker}&token=${apiKey}`),
      fetch(`https://finnhub.io/api/v1/stock/metric?symbol=${ticker}&metric=all&token=${apiKey}`),
      fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${apiKey}`),
      fetch(`https://finnhub.io/api/v1/stock/peers?symbol=${ticker}&token=${apiKey}`),
    ]);

    const [recData, sentData, priceTargetData, financialsData, profileData, peersData] = await Promise.all([
      recRes.json(),
      sentRes.json(),
      priceTargetRes.json(),
      financialsRes.json(),
      profileRes.json(),
      peersRes.json(),
    ]);

    const recommendation = Array.isArray(recData) && recData.length > 0 ? recData[0] : null;
    const sentiment = sentData && !sentData.error ? sentData : null;
    const priceTarget = priceTargetData && !priceTargetData.error ? priceTargetData : null;
    const basicFinancials = financialsData?.metric && !financialsData.error ? financialsData.metric : null;
    const profile = profileData && !profileData.error && profileData.name ? profileData : null;
    const peers = Array.isArray(peersData) ? peersData : null;

    return NextResponse.json({
      recommendation,
      sentiment,
      priceTarget,
      basicFinancials,
      profile,
      peers
    });
  } catch (error) {
    console.error('Finnhub API error:', error);
    return NextResponse.json({ error: 'Failed to fetch data' }, { status: 500 });
  }
}
