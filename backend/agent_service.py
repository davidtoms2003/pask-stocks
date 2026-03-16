import os
import json
import httpx
from ddgs import DDGS
from notebooklm_service import notebooklm_service

OPENROUTER_API_KEY = os.getenv("OPEN_ROUTER_API_KEY", "")
AGENT_MODEL = "openai/gpt-4o-mini"

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "search_web",
            "description": (
                "Busca información en internet. Devuelve una lista de resultados con título, URL y resumen. "
                "Úsalo para encontrar noticias, informes, análisis o cualquier dato sobre empresas, "
                "mercados, economía o geopolítica."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "La consulta de búsqueda (en inglés da mejores resultados financieros)"
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "Número de resultados (por defecto 5, máximo 10)",
                        "default": 5
                    }
                },
                "required": ["query"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "add_source_to_notebook",
            "description": (
                "Añade una URL como fuente al cuaderno PASK stocks de NotebookLM. "
                "Úsalo cuando el usuario pida guardar un enlace, o cuando hayas encontrado "
                "un artículo muy relevante que merezca quedar registrado."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "La URL completa del artículo o página a añadir"
                    }
                },
                "required": ["url"]
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "create_note",
            "description": (
                "Crea una nota en el cuaderno PASK stocks de NotebookLM. "
                "Úsalo para guardar resúmenes, conclusiones de análisis o cualquier anotación "
                "que el usuario quiera conservar."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "content": {
                        "type": "string",
                        "description": "El contenido completo de la nota"
                    }
                },
                "required": ["content"]
            }
        }
    }
]

SYSTEM_PROMPT = """Eres un analista financiero senior integrado en PASK Stocks, con expertise en equity research, investment banking y análisis cuantitativo. Respondes SIEMPRE EN ESPAÑOL.

Tienes acceso a herramientas para:
- Buscar información actualizada en internet (search_web) — SIEMPRE busca datos actuales antes de analizar
- Añadir fuentes a NotebookLM (add_source_to_notebook)
- Crear notas de análisis en NotebookLM (create_note)

⚠️ DATOS CRÍTICOS: Tus datos de entrenamiento pueden estar desactualizados. SIEMPRE usa search_web para obtener cotizaciones, resultados, guidance y noticias recientes antes de cualquier análisis.

═══════════════════════════════════════════════════
COMPORTAMIENTO GENERAL
═══════════════════════════════════════════════════
- Encadena herramientas: busca datos → analiza → guarda nota si el análisis es sustancial
- Busca en inglés para mejores resultados financieros: "[TICKER] earnings results", "[COMPANY] DCF analysis", etc.
- Cita siempre las fuentes de los datos que utilizas
- Sé directo: empieza con el veredicto/resumen ejecutivo, luego el detalle
- Si los datos son insuficientes, indícalo y trabaja con lo disponible

═══════════════════════════════════════════════════
SKILL: ONE-PAGER — Strip Profile (/one-pager)
═══════════════════════════════════════════════════
Fuente: investment-banking/commands/one-pager.md (Anthropic financial-services-plugins)

Crea un perfil de empresa en formato 4 cuadrantes de calidad investment banking (Goldman Sachs / JPMorgan):

**Cuadrante 1 — DESCRIPCIÓN DE LA EMPRESA**
- Sede, fundación, empleados, CEO/CFO
- Descripción del negocio en 2-3 frases
- Segmentos de negocio principales
- Market cap, sector, índice bursátil

**Cuadrante 2 — POSICIONAMIENTO COMPETITIVO**
- Propuesta de valor y ventaja competitiva
- Productos/servicios clave
- Posición en el mercado (líder / retador / nicho)
- Catalizadores de crecimiento (3 bullets)

**Cuadrante 3 — MÉTRICAS FINANCIERAS CLAVE**
Tabla con: Ingresos (LTM), EBITDA, Margen EBITDA, Crecimiento YoY, EV/EBITDA, PER (NTM), Market Cap, Deuda Neta/EBITDA

**Cuadrante 4 — COMPORTAMIENTO BURSÁTIL**
- Precio actual vs. máximo/mínimo 52 semanas
- Variación YTD y vs. S&P 500
- Principales accionistas (si disponible)
- Señal técnica: MA50 vs MA200 (Golden/Death Cross)

**Veredicto**: COMPRAR / MANTENER / VENDER con price target estimado y justificación de 2-3 líneas

Proceso: 1) search_web("[TICKER] company profile financials 2024") → 2) Construir one-pager → 3) create_note con el resultado

═══════════════════════════════════════════════════
SKILL: DCF MODEL (/dcf)
═══════════════════════════════════════════════════
Fuente: financial-analysis/skills/dcf-model/SKILL.md + equity-research/skills/initiating-coverage/references/valuation-methodologies.md (Anthropic financial-services-plugins)

Construye un modelo DCF institucional siguiendo esta metodología exacta:

**Paso 1 — FCF Histórico (3-5 años)**
Fórmula: UFCF = EBIT × (1 - Tax Rate) + D&A − CapEx − ΔNWC
- Busca: "[TICKER] free cash flow history annual report"
- Calcula tendencia histórica de márgenes y crecimiento

**Paso 2 — Proyecciones de Ingresos (5 años)**
- Enfoque top-down (TAM × market share) o bottom-up (unidades × precio)
- 3 escenarios: Bajista / Base / Alcista
- Basado en: guidance management, crecimiento del sector, cuota de mercado

**Paso 3 — WACC**
```
WACC = (E/V × Ke) + (D/V × Kd × (1 − t))
Ke = Rf + β × ERP
Rf = yield del bono del Tesoro a 10 años
ERP = 5-6% (prima de riesgo histórica)
Kd = tasa de endeudamiento actual de la empresa
```
Rangos orientativos: 8-10% large-cap estable, 10-12% growth, 12-15% mid/small-cap

**Paso 4 — Valor Terminal**
- Método Gordon: TV = FCF_n × (1+g) / (WACC − g), con g = 2-3% (no superar PIB)
- Método múltiplo salida: TV = EBITDA_n × múltiplo_sector (validación cruzada)
- El TV no debería superar el 75-80% del EV total (si lo hace, revisa supuestos)

**Paso 5 — Valoración**
```
EV = Σ [FCFt / (1+WACC)^t] + [TV / (1+WACC)^n]
Equity Value = EV − Deuda Neta − Intereses minoritarios − Preferentes
Precio objetivo = Equity Value / Acciones diluidas
```

**Paso 6 — Análisis de Sensibilidad**
Tabla 3×3 (WACC vs. tasa de crecimiento terminal):
```
         g=2.0%   g=2.5%   g=3.0%
WACC=8%    $XX      $XX      $XX
WACC=9%    $XX      $XX      $XX
WACC=10%   $XX      $XX      $XX
```

Errores comunes a evitar: usar Net Income en lugar de UFCF, g > WACC, TV > 80% EV, no ajustar CapEx de crecimiento

⚠️ Disclaimer obligatorio: "Este DCF es una estimación orientativa basada en datos públicos. No constituye asesoramiento financiero."

═══════════════════════════════════════════════════
SKILL: EARNINGS ANALYSIS (/earnings)
═══════════════════════════════════════════════════
Fuente: equity-research/skills/earnings-analysis/SKILL.md (Anthropic financial-services-plugins)

Análisis de resultados trimestrales de calidad equity research institucional. EMPIEZA SIEMPRE con el beat/miss.

**⚠️ CRÍTICO — DATOS ACTUALES:**
1. Busca HOY: "[TICKER] latest earnings results [current quarter]"
2. Verifica que la fecha del earnings sea reciente (< 3 meses)
3. Busca también: "[TICKER] earnings call transcript"

**Estructura del informe:**

**1. Titular** (beat/miss inmediato)
"[EMPRESA] supera/decepciona estimaciones en Q[X] [año]: EPS de $X.XX vs. $X.XX estimado (+/-X%)"

**2. Resultados vs. Estimaciones**
| Métrica | Real | Estimación | Diferencia | Beat/Miss |
|---------|------|------------|------------|-----------|
| EPS | | | | |
| Ingresos | | | | |
| EBITDA | | | | |
| Margen bruto | | | | |

Cuantifica siempre: "Los ingresos batieron en $X millones (+X%)"

**3. Análisis de Márgenes**
- Margen bruto: actual vs. trimestre anterior vs. mismo trimestre año anterior
- Margen EBITDA y tendencia
- Márgenes por segmento si aplica

**4. Guidance y Forward Estimates**
- Guidance próximo trimestre vs. consenso previo
- Guidance anual actualizado
- Cambios en estimaciones propias: mostrar Antes / Después / Motivo

**5. Puntos Clave del Earnings Call** (3-5 bullets con lo más importante)

**6. Reacción del Mercado**
- Movimiento del precio tras los resultados
- Cambio en rating/price target de analistas si disponible

**7. Impacto en Tesis de Inversión**
- ¿Confirma o debilita la tesis? ¿Qué vigilar el próximo trimestre?

═══════════════════════════════════════════════════
SKILL: COMPS ANALYSIS (/comps)
═══════════════════════════════════════════════════
Fuente: financial-analysis/skills/comps-analysis/SKILL.md + valuation-methodologies.md (Anthropic financial-services-plugins)

Construye un análisis de comparables de calidad institucional.

**Criterios de selección de comparables:**
- Mismo sector/industria (criterio principal)
- Modelo de negocio similar y fuentes de ingresos parecidas
- Tamaño comparable (market cap dentro de 0.5x-2x del objetivo)
- Perfil de crecimiento y márgenes similares
- Universo inicial: 8-12 empresas → reducir a 5-8 finales

**Datos a recopilar para cada comparable:**
Market Cap, EV, Precio/acción, Deuda Neta, Ingresos (LTM), EBITDA (LTM), Ingresos NTM (consenso)

**Múltiplos a calcular:**
- EV/Ingresos (LTM y NTM) — útil para growth/early-stage
- EV/EBITDA (LTM y NTM) — el más usado, especialmente en capital-intensivo
- PER (LTM y NTM forward) — el más universal para empresas rentables
- P/FCF — calidad del cash flow

**Tabla comparativa maestra:**
| Empresa | Market Cap | EV | EV/EBITDA | EV/Ventas | PER NTM | Rev Growth | Mg EBITDA |
|---------|-----------|-----|-----------|-----------|---------|------------|-----------|
| [Target]| | | **X.Xx** | **X.Xx** | **XXx** | XX% | XX% |
| Comp A | | | | | | | |
| Mediana | | | | | | | |

**Análisis estadístico:**
- Usa la **mediana** (no la media — menos sensible a outliers)
- Elimina outliers (>2 desviaciones estándar)
- Ajusta por prima/descuento según: crecimiento superior → prima, márgenes inferiores → descuento

**Valoración implícita:**
```
EV implícito = Métrica objetivo × Múltiplo mediana sector
Equity Value = EV − Deuda Neta
Precio objetivo = Equity Value / Acciones
```

**Prima/Descuento justificado:**
Analiza si la diferencia vs. mediana está justificada por: ventaja competitiva, mayor crecimiento, mejor equipo directivo, riesgo geopolítico, etc.

═══════════════════════════════════════════════════
SKILL: COMPETITIVE ANALYSIS (/competitive)
═══════════════════════════════════════════════════
Fuente: financial-analysis/skills/competitive-analysis/SKILL.md (Anthropic financial-services-plugins)

**Paso 1 — Métricas clave del sector** (3-5 métricas que definen la industria)
| Sector | Métricas clave |
|--------|---------------|
| SaaS/Tech | ARR, NRR, CAC payback, LTV/CAC, Rule of 40 |
| Consumo/Retail | Same-store sales, rotación inventario, ventas/m² |
| Industria | Utilización capacidad, coste unitario, margen contribución |
| Financiero | ROE, NIM, ratio eficiencia, morosidad |

**Paso 2 — Mapa competitivo** (clasificar competidores por):
- Competidores directos / Adyacentes / Entrantes
- Por segmento: Enterprise / SMB / Consumer
- Por postura: Incumbent / Disruptor

**Paso 3 — Deep-dive por competidor**
Para cada competidor, tabla de métricas + evaluación cualitativa:
Fortalezas (2-3) / Debilidades (2-3) / Estrategia actual

**Paso 4 — Tabla comparativa con rating**
| Dimensión | Empresa | Comp A | Comp B |
|-----------|---------|--------|--------|
| Escala | ●●● $160B | ●●○ $45B | ●○○ $8B |
| Crecimiento | ●●○ +26% | ●●● +35% | ●●○ +22% |
| Márgenes | ●●○ 7.5% | ●○○ 3.2% | ●●● 15% |

**Paso 5 — Análisis de Moat** (ventaja competitiva duradera):
- Efectos de red (fortaleza del flywheel usuario/proveedor)
- Costes de cambio (integración técnica, lock-in contractual)
- Economías de escala (ventajas de coste a volumen)
- Activos intangibles (marca, datos propietarios, patentes, licencias)
Rating: Fuerte / Moderado / Débil por categoría

**Paso 6 — Síntesis**
Escenarios: Alcista (prob. X%) / Base (prob. X%) / Bajista (prob. X%) con drivers clave de cada uno

═══════════════════════════════════════════════════
SKILL: STOCK SCREENING (/screen)
═══════════════════════════════════════════════════
Fuente: equity-research/skills/idea-generation/SKILL.md (Anthropic financial-services-plugins)

Genera ideas de inversión mediante screens cuantitativos y análisis temático.

**Pantallas disponibles:**

Value Screen: PER < mediana sector, EV/EBITDA < media histórica, FCF yield >5%, P/Book < 1.5x, insider buying reciente

Growth Screen: Crecimiento ingresos >15% YoY, crecimiento BPA >20%, aceleración de márgenes, ROIC >15%, NRR >110% (SaaS)

Quality Screen: Crecimiento estable 5+ años, márgenes estables/crecientes, ROE >15%, deuda baja, alta conversión FCF, insider ownership >5%

Short Screen: Ingresos decelerando, compresión márgenes, aumento cuentas cobrar/inventario vs ventas, insider selling, valoración premium sin justificación, red flags contables

**Formato de presentación por idea:**
**[EMPRESA] — [LONG/SHORT] — [Tesis en una línea]**
| Métrica | Valor | vs. Pares |
Tesis (3-5 bullets): por qué está mal valorado, qué ignora el mercado, catalizador
Riesgos clave: qué haría que la tesis estuviera equivocada

═══════════════════════════════════════════════════
FORMATO DE RESPUESTAS
═══════════════════════════════════════════════════
- Empieza siempre con el **resumen ejecutivo** (2-3 líneas con el veredicto)
- Usa tablas markdown para métricas y comparaciones
- Negrita para cifras clave y veredictos
- Cita las fuentes: "[Dato] según [búsqueda/SEC filing/earnings release]"
- Disclaimer en valoraciones: "Análisis orientativo, no constituye asesoramiento financiero"
- Si los datos son limitados, trabaja con lo disponible e indícalo"""


# ─── Comandos rápidos ─────────────────────────────────────────────────────────

COMMAND_TEMPLATES = {
    "/one-pager": (
        "Genera un one-pager profesional de calidad investment banking para {ticker} ({name}). "
        "Sigue la estructura de 4 cuadrantes del skill ONE-PAGER: descripción empresa, "
        "posicionamiento competitivo, métricas financieras clave y comportamiento bursátil. "
        "Incluye veredicto COMPRAR/MANTENER/VENDER con price target estimado. "
        "Busca datos actualizados con search_web y guarda el resultado como nota en NotebookLM."
    ),
    "/dcf": (
        "Realiza un modelo DCF institucional completo para {ticker} ({name}) siguiendo la metodología "
        "del skill DCF MODEL: calcula UFCF histórico (EBIT×(1-t)+D&A-CapEx-ΔNWC), proyecta 5 años "
        "en 3 escenarios, estima WACC con CAPM, calcula valor terminal por Gordon y múltiplo salida, "
        "y muestra tabla de sensibilidad WACC vs. tasa de crecimiento terminal. "
        "Busca primero los datos financieros más recientes con search_web."
    ),
    "/earnings": (
        "Analiza los últimos resultados trimestrales de {ticker} ({name}) con rigor de equity research. "
        "PRIMERO busca con search_web '{ticker} latest earnings results' para obtener datos actuales. "
        "Estructura: titular beat/miss, tabla resultados vs. estimaciones, análisis márgenes, "
        "guidance actualizado, 3-5 puntos clave del earnings call, reacción del mercado e impacto en tesis."
    ),
    "/comps": (
        "Construye un análisis de comparables institucional para {ticker} ({name}). "
        "Identifica 5-8 empresas del mismo sector con modelo de negocio similar. "
        "Calcula EV/EBITDA, EV/Ventas y PER (LTM y NTM forward) para cada comparable. "
        "Presenta tabla comparativa con mediana del sector, valoración implícita para {ticker} "
        "y análisis de prima/descuento justificado. Busca datos actualizados con search_web."
    ),
    "/competitive": (
        "Realiza un análisis competitivo completo para {ticker} ({name}) siguiendo el skill COMPETITIVE ANALYSIS. "
        "Identifica métricas clave del sector, mapea el universo competitivo, haz deep-dive de los "
        "3-4 competidores principales, construye tabla comparativa con ratings (●●● / ●●○ / ●○○), "
        "evalúa el moat (efectos red, switching costs, escala, intangibles) y sintetiza con escenarios "
        "alcista/base/bajista. Busca datos actuales con search_web."
    ),
    "/screen": (
        "Genera ideas de inversión en el sector de {ticker} ({name}) usando el skill STOCK SCREENING. "
        "Aplica al menos 2 pantallas cuantitativas (value, growth, quality). "
        "Para cada idea: presenta métricas vs. pares, tesis de 3-5 bullets, catalizador y riesgos clave. "
        "Devuelve shortlist de 3-5 ideas ordenadas por convicción. Busca con search_web."
    ),
}


def expand_command(question: str, stock_ticker: str = "", stock_name: str = "") -> str:
    """
    Si la pregunta empieza por un comando conocido (/dcf, /earnings, etc.),
    lo expande al prompt completo correspondiente.
    Devuelve la pregunta original si no hay comando.
    """
    q = question.strip()
    for cmd, template in COMMAND_TEMPLATES.items():
        if q.lower().startswith(cmd):
            # Permitir que el usuario añada texto extra tras el comando
            extra = q[len(cmd):].strip()
            ticker = stock_ticker or extra or "la empresa"
            name = stock_name or extra or ticker
            prompt = template.format(ticker=ticker, name=name)
            if extra and extra.upper() != ticker.upper():
                prompt += f"\nNota adicional del usuario: {extra}"
            return prompt
    return question


async def run_agent(question: str, history: list[dict], stock_context: str = "", notebook_id: str | None = None) -> dict:
    """
    Ejecuta el bucle agéntico con tool calling.
    Devuelve { answer: str, actions: list }
    """
    actions = []

    # Extraer ticker y nombre del contexto para expandir comandos
    # La primera línea tiene formato: === DATOS COMPLETOS DE AAPL (Apple Inc.) ===
    ticker = ""
    name = ""
    if stock_context:
        import re
        first_line = stock_context.splitlines()[0]
        m = re.search(r"DE\s+([A-Z0-9.\-]+)\s+\((.+?)\)", first_line)
        if m:
            ticker = m.group(1)
            name = m.group(2)
        else:
            # Fallback: buscar en líneas con "- Ticker:" o "- Empresa:"
            for line in stock_context.splitlines():
                clean = line.lstrip("- ").strip()
                if clean.startswith("Ticker:"):
                    ticker = clean.split(":", 1)[-1].strip()
                elif clean.startswith("Empresa:"):
                    name = clean.split(":", 1)[-1].strip()

    expanded_question = expand_command(question, ticker, name)

    system = SYSTEM_PROMPT
    if stock_context:
        system += f"\n\nCONTEXTO DE LA ACCIÓN SELECCIONADA:\n{stock_context}"

    # Construir historial de mensajes
    loop_messages = [{"role": "system", "content": system}]
    for m in history:
        loop_messages.append({"role": m["role"], "content": m["content"]})
    loop_messages.append({"role": "user", "content": expanded_question})

    async with httpx.AsyncClient(timeout=90.0) as client:
        for _ in range(6):  # Máx 6 iteraciones
            resp = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {OPENROUTER_API_KEY}",
                    "Content-Type": "application/json",
                    "HTTP-Referer": "https://pask-stocks.vercel.app",
                    "X-Title": "PASK Stocks",
                },
                json={
                    "model": AGENT_MODEL,
                    "messages": loop_messages,
                    "tools": TOOLS,
                    "tool_choice": "auto",
                    "temperature": 0.4,
                    "max_tokens": 2000,
                }
            )

            data = resp.json()
            msg = data["choices"][0]["message"]
            loop_messages.append(msg)

            # Sin tool calls → respuesta final
            if not msg.get("tool_calls"):
                return {"answer": msg.get("content", "Sin respuesta."), "actions": actions}

            # Ejecutar tool calls
            for tc in msg["tool_calls"]:
                fn_name = tc["function"]["name"]
                try:
                    args = json.loads(tc["function"]["arguments"])
                except json.JSONDecodeError:
                    # Truncated JSON — skip this tool call and let the model retry
                    loop_messages.append({
                        "role": "tool",
                        "tool_call_id": tc["id"],
                        "content": "Error: argumentos incompletos, por favor reinténtalo con menos texto."
                    })
                    continue
                result = await _execute_tool(fn_name, args, actions, notebook_id)
                loop_messages.append({
                    "role": "tool",
                    "tool_call_id": tc["id"],
                    "content": result
                })

    return {"answer": "No se pudo completar la operación.", "actions": actions}


async def _execute_tool(name: str, args: dict, actions: list, notebook_id: str | None = None) -> str:
    if name == "search_web":
        return await _tool_search(args.get("query", ""), args.get("max_results", 5), actions)
    if name == "add_source_to_notebook":
        return await _tool_add_source(args.get("url", ""), actions, notebook_id)
    if name == "create_note":
        return await _tool_create_note(args.get("content", ""), actions, notebook_id)
    return "Herramienta desconocida."


async def _tool_search(query: str, max_results: int, actions: list) -> str:
    try:
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=min(max_results, 10)))

        actions.append({"type": "search", "query": query, "count": len(results)})

        if not results:
            return f"No se encontraron resultados para: {query}"

        lines = []
        for r in results:
            url = r.get("href", "")
            paywall = " [paywall - no añadir]" if _is_blocked(url) else ""
            lines.append(f"Título: {r.get('title', '')}")
            lines.append(f"URL: {url}{paywall}")
            lines.append(f"Resumen: {r.get('body', '')}")
            lines.append("")
        return f"Resultados para '{query}':\n\n" + "\n".join(lines)
    except Exception as e:
        return f"Error en la búsqueda: {e}"


BLOCKED_DOMAINS = {
    # Paywall - financiero
    "wsj.com", "ft.com", "bloomberg.com", "barrons.com", "economist.com",
    "seekingalpha.com", "morningstar.com", "marketwatch.com",
    # Paywall - prensa general
    "nytimes.com", "washingtonpost.com", "thetimes.co.uk", "telegraph.co.uk",
    "newyorker.com", "theatlantic.com", "wired.com",
    # Redirects cortos no resolubles
    "t.co", "bit.ly", "tinyurl.com", "ow.ly",
    # Requieren login
    "linkedin.com", "facebook.com", "instagram.com", "twitter.com", "x.com",
}

def _is_blocked(url: str) -> str | None:
    """Devuelve el dominio bloqueado si la URL no es apta, o None si es válida."""
    try:
        from urllib.parse import urlparse
        domain = urlparse(url).netloc.lower().removeprefix("www.")
        for blocked in BLOCKED_DOMAINS:
            if domain == blocked or domain.endswith("." + blocked):
                return domain
    except Exception:
        pass
    return None

async def _resolve_google_news_url(url: str) -> str:
    """Sigue la redirección de Google News para obtener la URL real del artículo."""
    if "news.google.com" not in url:
        return url
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=8.0,
                                     headers={"User-Agent": "Mozilla/5.0"}) as client:
            resp = await client.head(url)
            return str(resp.url)
    except Exception:
        return url

async def _tool_add_source(url: str, actions: list, notebook_id: str | None = None) -> str:
    # Resolver redirecciones de Google News primero
    url = await _resolve_google_news_url(url)
    blocked = _is_blocked(url)
    if blocked:
        return f"No se puede añadir '{url}': el dominio '{blocked}' tiene paywall o no es accesible por NotebookLM. Busca la misma información en una fuente abierta."
    try:
        result = await notebooklm_service.add_news_sources([url], notebook_id)
        if result["added"]:
            actions.append({"type": "source_added", "url": url})
            return f"Fuente añadida: {url}"
        error = result["failed"][0]["error"] if result["failed"] else "Error desconocido"
        return f"No se pudo añadir la fuente: {error}"
    except Exception as e:
        return f"Error al añadir fuente: {e}"


async def _tool_create_note(content: str, actions: list, notebook_id: str | None = None) -> str:
    try:
        await notebooklm_service.create_note(content, notebook_id)
        actions.append({"type": "note_created", "preview": content[:80]})
        return "Nota creada correctamente."
    except Exception as e:
        return f"Error al crear la nota: {e}"
