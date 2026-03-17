import { NextRequest, NextResponse } from 'next/server';

const BACKEND = 'http://localhost:8000';

// POST /api/podcast — start generation
export async function POST() {
  try {
    const res = await fetch(`${BACKEND}/api/generate_podcast`, { method: 'POST' });
    if (!res.ok) throw new Error(`Backend error: ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: `No se pudo iniciar el podcast: ${e}` }, { status: 503 });
  }
}

// GET /api/podcast?job_id=xxx — poll status
// GET /api/podcast?job_id=xxx&audio=1 — stream audio
export async function GET(request: NextRequest) {
  const job_id = request.nextUrl.searchParams.get('job_id');
  if (!job_id) return NextResponse.json({ error: 'job_id requerido' }, { status: 400 });

  const isAudio = request.nextUrl.searchParams.get('audio') === '1';

  if (isAudio) {
    try {
      const rangeHeader = request.headers.get('range');
      const res = await fetch(`${BACKEND}/api/podcast_audio/${job_id}`, {
        headers: rangeHeader ? { Range: rangeHeader } : {},
      });
      if (!res.ok && res.status !== 206) throw new Error(`Backend error: ${res.status}`);
      const buffer = await res.arrayBuffer();
      const headers: Record<string, string> = {
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.byteLength.toString(),
        'Accept-Ranges': 'bytes',
        'Content-Disposition': 'inline; filename="podcast-del-dia.mp3"',
      };
      const contentRange = res.headers.get('content-range');
      if (contentRange) headers['Content-Range'] = contentRange;
      return new NextResponse(buffer, { status: res.status, headers });
    } catch (e) {
      return NextResponse.json({ error: `Audio no disponible: ${e}` }, { status: 503 });
    }
  }

  try {
    const res = await fetch(`${BACKEND}/api/podcast_status/${job_id}`);
    if (!res.ok) throw new Error(`Backend error: ${res.status}`);
    const data = await res.json();
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: `No se pudo consultar el estado: ${e}` }, { status: 503 });
  }
}
