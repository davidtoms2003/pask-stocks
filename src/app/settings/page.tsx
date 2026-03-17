'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function SettingsPage() {
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [notebookCookies, setNotebookCookies] = useState('');
  const [status, setStatus] = useState<{ type: 'success' | 'error' | ''; message: string }>({ type: '', message: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Cargar API Key de localStorage al iniciar
    const savedKey = localStorage.getItem('openrouter_key');
    if (savedKey) setOpenRouterKey(savedKey);
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
      
      let simpleCookies: Record<str, str> = {};
      
      if (Array.isArray(cookiesData)) {
        // Es formato EditThisCookie: [{name: "SID", value: "...", ...}, ...]
        cookiesData.forEach((c: any) => {
           if (c.name && c.value) {
             simpleCookies[c.name] = c.value;
           }
        });
      } else if (typeof cookiesData === 'object') {
        // Asumimos que ya es key:value o similar
        simpleCookies = cookiesData;
      }

      // Llamada al backend
      // IMPORTANTE: El backend corre en localhost:8000. 
      // Si estamos en desarrollo local, esto funciona. En producción requeriría configuración de proxy.
      const response = await fetch('http://localhost:8000/api/config/notebooklm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cookies: simpleCookies }),
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
            <input
              type="password"
              value={openRouterKey}
              onChange={(e) => setOpenRouterKey(e.target.value)}
              placeholder="sk-or-..."
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors font-mono"
            />
          </div>
          <button
            onClick={handleSaveOpenRouter}
            className="px-4 py-2 bg-neutral-800 hover:bg-emerald-600 hover:text-white text-neutral-300 rounded-lg transition-all text-sm font-medium"
          >
            Guardar API Key
          </button>
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
        </section>

        <div className="text-center text-xs text-neutral-600 pt-8">
          Configuración avanzada para PASK Stocks
        </div>
      </div>
    </div>
  );
}
