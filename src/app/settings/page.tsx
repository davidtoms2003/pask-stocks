'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function SettingsPage() {
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [newsApiKey, setNewsApiKey] = useState('');
  const [notebookCookies, setNotebookCookies] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error' | ''; message: string }>({ type: '', message: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Cargar API Keys de localStorage al iniciar
    const savedOrKey = localStorage.getItem('openrouter_key');
    if (savedOrKey) setOpenRouterKey(savedOrKey);

    const savedNewsKey = localStorage.getItem('news_api_key');
    if (savedNewsKey) setNewsApiKey(savedNewsKey);
  }, []);

  const handleSaveOpenRouter = () => {
    try {
      if (!openRouterKey.trim()) {
        localStorage.removeItem('openrouter_key');
        setStatus({ type: 'success', message: 'API Key eliminada. Se usará la configuración por defecto.' });
      } else {
        localStorage.setItem('openrouter_key', openRouterKey.trim());
        setStatus({ type: 'success', message: 'OpenRouter API Key guardada en el navegador.' });
      }
      // Force update of components listening to storage
      window.dispatchEvent(new Event('storage'));
      setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    } catch (e) {
      setStatus({ type: 'error', message: 'Error al guardar la API Key.' });
    }
  };

  const handleSaveNewsApi = () => {
    try {
      if (!newsApiKey.trim()) {
        localStorage.removeItem('news_api_key');
        setStatus({ type: 'success', message: 'NewsAPI Key eliminada.' });
      } else {
        localStorage.setItem('news_api_key', newsApiKey.trim());
        setStatus({ type: 'success', message: 'NewsAPI Key guardada en el navegador.' });
      }
      window.dispatchEvent(new Event('storage'));
      setTimeout(() => setStatus({ type: '', message: '' }), 3000);
    } catch (e) {
      setStatus({ type: 'error', message: 'Error al guardar la API Key.' });
    }
  };

  const handleSaveNotebookLM = async () => {
    if (!notebookCookies) {
      setStatus({ type: 'error', message: 'Por favor, introduce las cookies.' });
      return;
    }

    setLoading(true);
    setStatus({ type: '', message: '' });
    
    try {
      let cookiesData: any;
      try {
        cookiesData = JSON.parse(notebookCookies);
      } catch (e) {
        // Si falla el parseo, quizas el usuario puso solo un string, pero el backend espera un formato especifico
        // Vamos a asumir que el usuario pega el JSON array de EditThisCookie o un objeto de cookies
        throw new Error('El formato debe ser JSON válido (ej: array de EditThisCookie o objeto key:value).');
      }

      // Convertir array de EditThisCookie a objeto key:value simple si es necesario
      // El backend espera: { cookies: { "SID": "...", "HSID": "..." } }
      // Pero mi endpoint en backend/app.py espera: class NotebookLMConfigRequest(BaseModel): cookies: dict[str, str]
      
      let payload: any = {};
      
      if (Array.isArray(cookiesData)) {
        // Es formato EditThisCookie: [{name: "SID", value: "...", ...}, ...]
        // Enviamos el array completo para que el backend pueda aprovechar metadatos como domain, secure, etc.
        payload = { cookies: cookiesData, format: 'editthiscookie' };
      } else if (typeof cookiesData === 'object') {
        // Asumimos que ya es key:value o similar
        payload = { cookies: cookiesData, format: 'simple' };
      }

      // Llamada al backend
      const response = await fetch('http://localhost:8000/api/config/notebooklm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error del backend: ${errorText}`);
      }

      const result = await response.json();
      setStatus({ type: 'success', message: `Conexión a NotebookLM configurada: ${result.message}` });
      setNotebookCookies(''); // Limpiar por seguridad
    } catch (e: any) {
      setStatus({ type: 'error', message: e.message || 'Error desconocido' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 p-8 font-sans">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-white">Configuración</h1>
          <Link href="/" className="text-emerald-400 hover:text-emerald-300 transition-colors">
            ← Volver al Dashboard
          </Link>
        </div>

        {/* Status Message */}
        {status.message && (
          <div className={`p-4 rounded-lg border ${
            status.type === 'success' ? 'bg-emerald-900/20 border-emerald-500/50 text-emerald-200' : 'bg-red-900/20 border-red-500/50 text-red-200'
          }`}>
            {status.message}
          </div>
        )}

        {/* OpenRouter Configuration */}
        <section className="bg-neutral-900/50 p-6 rounded-xl border border-neutral-800 space-y-4">
          <h2 className="text-xl font-semibold text-emerald-400 flex items-center gap-2">
            🔑 OpenRouter API
          </h2>
          <p className="text-sm text-neutral-400">
            Introduce tu API Key de OpenRouter para usar modelos personalizados en el chat de documentos.
            Se guardará localmente en tu navegador. Dejar en blanco para usar la del sistema (si existe).
          </p>
          <div className="space-y-2">
            <label className="block text-xs font-medium text-neutral-500 uppercase">API Key</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={openRouterKey}
                onChange={(e) => setOpenRouterKey(e.target.value)}
                placeholder="sk-or-..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors font-mono"
              />
              <button
                onClick={handleSaveOpenRouter}
                className="px-4 bg-neutral-800 hover:bg-emerald-600 hover:text-white text-neutral-300 rounded-lg transition-all text-sm font-medium whitespace-nowrap"
              >
                Guardar
              </button>
            </div>
          </div>
          {/* Listado de keys guardadas (renderizado condicional para evitar hidratación incorrecta) */}
          <SavedKeyList 
            storageKey="openrouter_key" 
            label="OpenRouter Key" 
            colorClass="emerald" 
            onDelete={() => setOpenRouterKey('')}
          />
        </section>

        {/* NewsAPI Configuration */}
        <section className="bg-neutral-900/50 p-6 rounded-xl border border-neutral-800 space-y-4">
          <h2 className="text-xl font-semibold text-orange-400 flex items-center gap-2">
            📰 NewsAPI
          </h2>
          <p className="text-sm text-neutral-400">
            Opcional. Introduce tu API Key de <a href="https://newsapi.org" target="_blank" className="text-orange-400 hover:underline">newsapi.org</a> para obtener noticias financieras más precisas. Sin ella, se usarán fuentes públicas (Google News RSS, Yahoo).
          </p>
          <div className="space-y-2">
            <label className="block text-xs font-medium text-neutral-500 uppercase">API Key</label>
            <div className="flex gap-2">
              <input
                type="password"
                value={newsApiKey}
                onChange={(e) => setNewsApiKey(e.target.value)}
                placeholder="..."
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-orange-500 transition-colors font-mono"
              />
              <button
                onClick={handleSaveNewsApi}
                className="px-4 bg-neutral-800 hover:bg-orange-600 hover:text-white text-neutral-300 rounded-lg transition-all text-sm font-medium whitespace-nowrap"
              >
                Guardar
              </button>
            </div>
          </div>
          <SavedKeyList 
            storageKey="news_api_key" 
            label="NewsAPI Key" 
            colorClass="orange" 
            onDelete={() => setNewsApiKey('')}
          />
        </section>

        {/* NotebookLM Configuration */}
        <section className="bg-neutral-900/50 p-6 rounded-xl border border-neutral-800 space-y-4">
          <h2 className="text-xl font-semibold text-blue-400 flex items-center gap-2">
            📓 NotebookLM Conexión
          </h2>
          <p className="text-sm text-neutral-400">
            Para conectar con tus cuadernos privados, necesitamos las cookies de sesión de Google.
            Usa la extensión <a href="https://chromewebstore.google.com/detail/editthiscookie/fngmhnnpilhplaeedifhccceomclgfbg" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">EditThisCookie</a> en notebooklm.google.com, copia las cookies al portapapeles (botón "exportar") y pégalas aquí.
          </p>
          <div className="space-y-2">
            <label className="block text-xs font-medium text-neutral-500 uppercase">Cookies JSON</label>
            <textarea
              value={notebookCookies}
              onChange={(e) => setNotebookCookies(e.target.value)}
              placeholder='Pegar aquí el JSON copiado de EditThisCookie...'
              className="w-full h-32 bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 transition-colors font-mono text-xs"
            />
          </div>
          <button
            onClick={handleSaveNotebookLM}
            disabled={loading}
            className="px-4 py-2 bg-neutral-800 hover:bg-blue-600 hover:text-white text-neutral-300 rounded-lg transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Conectando...' : 'Conectar NotebookLM'}
          </button>
          
          <SavedNotebookStatus onDelete={() => {
              setStatus({ type: 'success', message: 'Configuración de NotebookLM eliminada del backend.' });
          }} />
        </section>

        <div className="text-center text-xs text-neutral-600 pt-8">
          Configuración avanzada para PASK Stocks
        </div>
      </div>
    </div>
  );
}

// Helper component to avoid hydration mismatch with localStorage
function SavedKeyList({ storageKey, label, colorClass, onDelete }: { storageKey: string, label: string, colorClass: string, onDelete: () => void }) {
  const [exists, setExists] = useState(false);
  
  useEffect(() => {
    setExists(!!localStorage.getItem(storageKey));
  }, [storageKey]); // Re-check when key changes conceptually (though storage event listener would be better for real-time)

  // Listen to storage events to update UI if key changes elsewhere
  useEffect(() => {
    const check = () => setExists(!!localStorage.getItem(storageKey));
    window.addEventListener('storage', check);
    // Also poll/check on interval or after save action
    const interval = setInterval(check, 1000);
    return () => {
      window.removeEventListener('storage', check);
      clearInterval(interval);
    };
  }, [storageKey]);

  if (!exists) return null;

  const colorMap: Record<string, string> = {
    emerald: 'text-emerald-400 bg-emerald-900/10',
    orange: 'text-orange-400 bg-orange-900/10',
    blue: 'text-blue-400 bg-blue-900/10',
  };
  
  const btnHoverMap: Record<string, string> = {
    emerald: 'text-emerald-200/50 hover:text-red-400',
    orange: 'text-orange-200/50 hover:text-red-400',
    blue: 'text-blue-200/50 hover:text-red-400',
  };

  return (
    <div className={`flex items-center gap-2 mt-2 text-xs ${colorMap[colorClass] || 'text-gray-400'} py-1 px-2 rounded w-fit`}>
      <span>✓ {label} guardada</span>
      <button 
        onClick={() => {
          localStorage.removeItem(storageKey);
          onDelete();
        }}
        className={`${btnHoverMap[colorClass]} ml-2`}
      >
        (Eliminar)
      </button>
    </div>
  );
}

function SavedNotebookStatus({ onDelete }: { onDelete: () => void }) {
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    // Check status on mount
    fetch('http://localhost:8000/api/config/notebooklm/status')
      .then(r => r.json())
      .then(d => setConfigured(d.configured))
      .catch(() => setConfigured(false));
    
    // Listen for storage/window events to re-check
    const check = () => {
         fetch('http://localhost:8000/api/config/notebooklm/status')
            .then(r => r.json())
            .then(d => setConfigured(d.configured))
            .catch(() => {});
    };
    
    // Check again after a short delay (e.g. after adding credentials)
    // Removed polling to avoid log noise
    // const interval = setInterval(check, 2000);
    // return () => clearInterval(interval);
  }, []);

  if (!configured) return null;

  return (
    <div className="flex items-center gap-2 mt-2 text-xs text-blue-400 bg-blue-900/10 py-1 px-2 rounded w-fit">
      <span>✓ NotebookLM Conectado</span>
      <button 
        onClick={async () => {
          try {
            await fetch('http://localhost:8000/api/config/notebooklm', { method: 'DELETE' });
            setConfigured(false);
            onDelete();
          } catch(e) {
            console.error(e);
          }
        }}
        className="text-blue-200/50 hover:text-red-400 ml-2"
      >
        (Desconectar)
      </button>
    </div>
  );
}
