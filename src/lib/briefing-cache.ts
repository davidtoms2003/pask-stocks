// Servicio de caché para briefing diario y podcast
// Persiste en localStorage y mantiene el estado entre navegaciones

export interface CachedBriefing {
  date: string;           // 'YYYY-MM-DD'
  jobId?: string;         // Para generación async
  status: 'generating' | 'ready' | 'failed';
  briefing?: string;
  newsIds: string[];      // IDs de las noticias usadas
  addedUrls: string[];
  failedUrls: string[];
  telegramUrls: string[];
  error?: string;
  generatedAt?: string;   // ISO timestamp
}

export interface CachedPodcast {
  date: string;           // 'YYYY-MM-DD'
  jobId: string;
  status: 'generating' | 'ready' | 'failed';
  error?: string;
  generatedAt?: string;   // ISO timestamp cuando terminó
}

const BRIEFING_KEY = 'pask_daily_briefing';
const PODCAST_KEY = 'pask_daily_podcast';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

// ─── Briefing Cache ───────────────────────────────────────────────────────────

export function getCachedBriefing(): CachedBriefing | null {
  try {
    const raw = localStorage.getItem(BRIEFING_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as CachedBriefing;
    // Solo devolver si es de hoy
    if (data.date !== todayStr()) {
      localStorage.removeItem(BRIEFING_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function saveBriefingCache(data: Omit<CachedBriefing, 'date'>): void {
  const cache: CachedBriefing = {
    ...data,
    date: todayStr(),
  };
  localStorage.setItem(BRIEFING_KEY, JSON.stringify(cache));
}

export function updateBriefingCache(updates: Partial<CachedBriefing>): void {
  const cached = getCachedBriefing();
  if (!cached) return;
  const updated = { ...cached, ...updates };
  if (updates.status === 'ready' || updates.status === 'failed') {
    updated.generatedAt = new Date().toISOString();
  }
  localStorage.setItem(BRIEFING_KEY, JSON.stringify(updated));
}

export function clearBriefingCache(): void {
  localStorage.removeItem(BRIEFING_KEY);
}

// ─── Briefing Polling Service ─────────────────────────────────────────────────

let briefingPollInterval: ReturnType<typeof setInterval> | null = null;
let briefingPollCallbacks: Array<(result: { status: 'ready' | 'failed'; briefing?: string; addedUrls?: string[]; failedUrls?: string[]; telegramUrls?: string[]; error?: string }) => void> = [];

export function startBriefingPolling(jobId: string, newsIds: string[]): void {
  const cached = getCachedBriefing();
  if (cached?.jobId === jobId && briefingPollInterval) return;

  saveBriefingCache({ jobId, status: 'generating', newsIds, addedUrls: [], failedUrls: [], telegramUrls: [] });

  if (briefingPollInterval) {
    clearInterval(briefingPollInterval);
  }

  briefingPollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/daily-briefing?job_id=${jobId}`);
      const data = await res.json();
      
      if (data.status === 'ready') {
        updateBriefingCache({
          status: 'ready',
          briefing: data.briefing,
          addedUrls: data.addedUrls ?? [],
          failedUrls: data.failedUrls ?? [],
          telegramUrls: data.telegramUrls ?? [],
        });
        stopBriefingPolling();
        notifyBriefingCallbacks({
          status: 'ready',
          briefing: data.briefing,
          addedUrls: data.addedUrls,
          failedUrls: data.failedUrls,
          telegramUrls: data.telegramUrls,
        });
      } else if (data.status === 'failed') {
        updateBriefingCache({ status: 'failed', error: data.error });
        stopBriefingPolling();
        notifyBriefingCallbacks({ status: 'failed', error: data.error });
      }
    } catch {
      // Seguir intentando
    }
  }, 3000);
}

export function stopBriefingPolling(): void {
  if (briefingPollInterval) {
    clearInterval(briefingPollInterval);
    briefingPollInterval = null;
  }
}

export function subscribeToBriefingUpdates(callback: typeof briefingPollCallbacks[0]): () => void {
  briefingPollCallbacks.push(callback);
  return () => {
    briefingPollCallbacks = briefingPollCallbacks.filter(cb => cb !== callback);
  };
}

function notifyBriefingCallbacks(result: Parameters<typeof briefingPollCallbacks[0]>[0]): void {
  briefingPollCallbacks.forEach(cb => cb(result));
}

export function restoreBriefingPollingIfNeeded(): void {
  const cached = getCachedBriefing();
  if (cached && cached.status === 'generating' && cached.jobId) {
    startBriefingPolling(cached.jobId, cached.newsIds);
  }
}

// ─── Podcast Cache ────────────────────────────────────────────────────────────

export function getCachedPodcast(): CachedPodcast | null {
  try {
    const raw = localStorage.getItem(PODCAST_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as CachedPodcast;
    // Solo devolver si es de hoy
    if (data.date !== todayStr()) {
      localStorage.removeItem(PODCAST_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function savePodcastCache(data: Omit<CachedPodcast, 'date'>): void {
  const cache: CachedPodcast = {
    ...data,
    date: todayStr(),
  };
  localStorage.setItem(PODCAST_KEY, JSON.stringify(cache));
}

export function updatePodcastStatus(status: CachedPodcast['status'], error?: string): void {
  const cached = getCachedPodcast();
  if (!cached) return;
  cached.status = status;
  if (error) cached.error = error;
  if (status === 'ready' || status === 'failed') {
    cached.generatedAt = new Date().toISOString();
  }
  localStorage.setItem(PODCAST_KEY, JSON.stringify(cached));
}

export function clearPodcastCache(): void {
  localStorage.removeItem(PODCAST_KEY);
}

// ─── Podcast Polling Service ──────────────────────────────────────────────────
// Este servicio corre en background y no se pierde al cambiar de página

let pollInterval: ReturnType<typeof setInterval> | null = null;
let pollCallbacks: Array<(status: 'ready' | 'failed', error?: string) => void> = [];

export function startPodcastPolling(jobId: string): void {
  // Si ya hay un polling activo para este job, no iniciar otro
  const cached = getCachedPodcast();
  if (cached?.jobId === jobId && pollInterval) return;

  // Guardar estado inicial
  savePodcastCache({ jobId, status: 'generating' });

  // Limpiar polling anterior si existe
  if (pollInterval) {
    clearInterval(pollInterval);
  }

  pollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/podcast?job_id=${jobId}`);
      const data = await res.json();
      
      if (data.status === 'ready') {
        updatePodcastStatus('ready');
        stopPodcastPolling();
        notifyPodcastCallbacks('ready');
      } else if (data.status === 'failed') {
        updatePodcastStatus('failed', data.error);
        stopPodcastPolling();
        notifyPodcastCallbacks('failed', data.error);
      }
    } catch {
      // Seguir intentando
    }
  }, 6000);
}

export function stopPodcastPolling(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

export function subscribeToPodcastUpdates(callback: (status: 'ready' | 'failed', error?: string) => void): () => void {
  pollCallbacks.push(callback);
  return () => {
    pollCallbacks = pollCallbacks.filter(cb => cb !== callback);
  };
}

function notifyPodcastCallbacks(status: 'ready' | 'failed', error?: string): void {
  pollCallbacks.forEach(cb => cb(status, error));
}

// Restaurar polling si había uno en progreso (por si se recarga la página)
export function restorePodcastPollingIfNeeded(): void {
  const cached = getCachedPodcast();
  if (cached && cached.status === 'generating') {
    startPodcastPolling(cached.jobId);
  }
}
