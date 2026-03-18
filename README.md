# PASK Stocks

Aplicación de escritorio para análisis técnico de acciones y noticias financieras con IA, integrada con NotebookLM.

## Configuración Inicial

### 1. Instalar dependencias

```bash
npm install
cd backend
pip install -r requirements.txt
cd ..
```

### 2. Configurar NotebookLM (Recomendado)

Para usar las funcionalidades de IA con NotebookLM:

```bash
python3 backend/setup_notebooklm.py
```

Este comando abrirá tu navegador para iniciar sesión en Google. Las credenciales se guardarán de forma persistente.

📖 **Más información**: Ver [NOTEBOOKLM_SETUP.md](./NOTEBOOKLM_SETUP.md)

### 3. Variables de entorno (Opcional)

Crea un archivo `.env.local` en la raíz del proyecto con:

```env
NEWS_API_KEY=tu_clave_de_newsapi_org
```

## Ejecutar la Aplicación

### Modo Electron (Recomendado)

```bash
npm run electron
```

Esto inicia automáticamente:
- ✅ Servidor Next.js (frontend)
- ✅ Backend Python (FastAPI)
- ✅ Aplicación de escritorio

### Modo Desarrollo Web

Para desarrollo y debugging:

```bash
# Terminal 1: Frontend con hot-reload
npm run dev

# Terminal 2: Backend con hot-reload
npm run dev:backend
```

Abre [http://localhost:3000](http://localhost:3000)

**Nota:** En modo desarrollo con hot-reload (`dev:backend`), la sesión de NotebookLM se reiniciará con cada cambio de código. Usa `npm run electron` para desarrollo normal sin reloads.

### Electron con DevTools

Para debugging de Electron:

```bash
npm run electron:dev
```

## Estructura del Proyecto

```
pask-stocks/
├── src/                    # Frontend Next.js
│   ├── app/               # Páginas y rutas
│   ├── lib/               # Utilidades y servicios
│   └── types/             # TypeScript types
├── backend/               # Backend Python FastAPI
│   ├── app.py            # API principal
│   ├── agent_service.py  # Servicio de agente IA
│   ├── briefing_service.py
│   ├── notebooklm_service.py
│   └── setup_notebooklm.py  # Script de configuración
├── electron-main.js       # Proceso principal de Electron
└── NOTEBOOKLM_SETUP.md   # Guía de configuración
```

## Funcionalidades

- 📊 **Análisis técnico** de acciones (MA50, MA200, RSI)
- 📰 **Noticias financieras** en tiempo real
- 🤖 **Chat con IA** usando NotebookLM
- 📝 **Resumen diario** automático con IA
- 🎙️ **Podcast generado** con NotebookLM
- 💾 **Caché persistente** de resultados

## Tecnologías

- **Frontend**: Next.js 14, React, TypeScript, Tailwind CSS
- **Backend**: Python 3.14, FastAPI, NotebookLM
- **Desktop**: Electron
- **IA**: NotebookLM, OpenRouter (opcional)

## Solución de Problemas

### "Authentication expired or invalid"

Las cookies de NotebookLM expiraron. Ejecuta:

```bash
python3 backend/setup_notebooklm.py
```

**Si el problema persiste:**
- Asegúrate de estar usando `npm run electron` (sin hot-reload)
- Si usas `npm run dev:backend` con hot-reload, la sesión se reiniciará con cada cambio de código
- Verifica que existe el archivo `~/.notebooklm/storage_state.json`

### Puertos ocupados

Si los puertos 3000 u 8000 están en uso, Electron los liberará automáticamente.

### El backend no inicia

Asegúrate de tener el entorno virtual activado:

```bash
cd backend
source venv/bin/activate  # macOS/Linux
# o
venv\Scripts\activate  # Windows
pip install -r requirements.txt
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [NotebookLM Python Library](https://github.com/Nutlope/notebooklm-py)
- [Electron Documentation](https://www.electronjs.org/docs)

