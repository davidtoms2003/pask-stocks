import re
import asyncio
from ddgs import DDGS
from notebooklm import NotebookLMClient
from notebooklm_service import notebooklm_service

# ─── Rol del analista (se establece como custom_prompt del notebook) ──────────
# Corto a propósito: va en configure(), no en cada mensaje

ANALYST_ROLE = (
    "Eres un analista financiero senior de PASK Stocks con expertise en equity research "
    "e investment banking. Respondes SIEMPRE EN ESPAÑOL. "
    "Empieza siempre con el resumen ejecutivo (2-3 líneas). "
    "Usa tablas markdown para métricas y comparaciones. "
    "Cita las fuentes de los datos. "
    "Si los datos son insuficientes, trabaja con lo disponible e indícalo."
)

# ─── Queries de búsqueda por skill ────────────────────────────────────────────

COMMAND_SEARCHES: dict[str, list[str]] = {
    "/dcf": [
        "{ticker} {name} annual revenue EBITDA income statement 2022 2023 2024",
        "{ticker} {name} free cash flow CapEx depreciation amortization history",
        "{ticker} {name} 10-K SEC annual report financial statements",
        "{ticker} {name} total debt shares outstanding beta",
    ],
    "/one-pager": [
        "{ticker} {name} company overview business model sector 2024",
        "{ticker} {name} stock price market cap revenue growth margins",
    ],
    "/earnings": [
        "{ticker} {name} latest earnings results revenue EPS 2024 2025",
        "{ticker} {name} earnings call transcript guidance quarterly",
    ],
    "/comps": [
        "{ticker} {name} comparable companies sector peers valuation multiples",
        "{ticker} {name} EV EBITDA PER competitor analysis",
    ],
    "/competitive": [
        "{ticker} {name} competitive landscape market share industry 2024",
        "{ticker} {name} competitors strengths weaknesses",
    ],
    "/screen": [
        "{ticker} {name} sector stocks screening investment ideas 2024",
    ],
    "/initiate": [
        "{ticker} {name} investment thesis price target analyst rating 2024",
        "{ticker} {name} financial overview valuation business model",
    ],
    "/merger": [
        "{ticker} {name} merger acquisition deal 2024 2025",
        "{ticker} {name} M&A synergies valuation premium",
    ],
    "/ipo": [
        "{ticker} {name} IPO prospectus S-1 filing valuation",
        "{ticker} {name} IPO financials revenue growth business model",
    ],
    "/credit": [
        "{ticker} {name} credit rating debt covenants leverage ratio",
        "{ticker} {name} bond yield interest coverage FCF debt maturity",
    ],
}

# ─── Comandos rápidos ──────────────────────────────────────────────────────────

COMMAND_TEMPLATES = {
    "/one-pager": (
        "Genera un one-pager profesional de calidad investment banking para {ticker} ({name}). "
        "Estructura: 4 cuadrantes — descripción empresa, posicionamiento competitivo, "
        "métricas financieras clave (tabla), comportamiento bursátil. "
        "Incluye veredicto COMPRAR/MANTENER/VENDER con price target estimado."
    ),
    "/dcf": (
        "Realiza un modelo DCF institucional completo para {ticker} ({name}): "
        "calcula UFCF histórico (EBIT×(1-t)+D&A-CapEx-ΔNWC), proyecta 5 años en 3 escenarios "
        "(bajista/base/alcista), estima WACC con CAPM, calcula valor terminal por Gordon y múltiplo "
        "de salida, y muestra tabla de sensibilidad WACC vs. tasa de crecimiento terminal. "
        "Usa los datos financieros de las búsquedas realizadas."
    ),
    "/earnings": (
        "Analiza los últimos resultados trimestrales de {ticker} ({name}): "
        "titular beat/miss, tabla resultados vs. estimaciones, análisis márgenes, "
        "guidance actualizado, 3-5 puntos clave del earnings call, reacción del mercado."
    ),
    "/comps": (
        "Construye un análisis de comparables institucional para {ticker} ({name}): "
        "identifica 5-8 empresas del mismo sector, calcula EV/EBITDA, EV/Ventas y PER (LTM y NTM), "
        "presenta tabla comparativa con mediana del sector y valoración implícita."
    ),
    "/competitive": (
        "Realiza un análisis competitivo completo para {ticker} ({name}): "
        "métricas clave del sector, mapa competidores, deep-dive 3-4 principales rivales, "
        "tabla comparativa con ratings, evaluación del moat y escenarios alcista/base/bajista."
    ),
    "/screen": (
        "Genera ideas de inversión en el sector de {ticker} ({name}) aplicando pantallas "
        "value, growth y quality. Para cada idea: métricas vs. pares, tesis 3-5 bullets, "
        "catalizador y riesgos. Devuelve shortlist de 3-5 ideas ordenadas por convicción."
    ),
    "/initiate": (
        "Inicia cobertura de {ticker} ({name}) con informe institucional completo: "
        "executive summary con rating y price target, company overview, investment thesis "
        "(3-5 catalizadores), valoración (DCF + comps), risk factors y tabla financiera resumen."
    ),
    "/merger": (
        "Analiza la operación de M&A de {ticker} ({name}): "
        "deal summary, rationale y sinergias, valoración, financing, análisis regulatorio "
        "y conclusión sobre si es un buen negocio para ambas partes."
    ),
    "/ipo": (
        "Analiza el IPO de {ticker} ({name}): company overview, business model, TAM/SAM/SOM, "
        "financials históricos y proyectados, valoración vs. comparables, risk factors "
        "y rating COMPRAR/MANTENER/VENDER."
    ),
    "/credit": (
        "Realiza un análisis de crédito corporativo para {ticker} ({name}): "
        "ratios solvencia (Deuda/EBITDA, cobertura intereses), liquidez, estructura de capital, "
        "vencimientos, covenants, rating crediticio implícito y recomendación."
    ),
}


def expand_command(question: str, stock_ticker: str = "", stock_name: str = "") -> str:
    q = question.strip()
    for cmd, template in COMMAND_TEMPLATES.items():
        if q.lower().startswith(cmd):
            extra = q[len(cmd):].strip()
            ticker = stock_ticker or extra or "la empresa"
            name = stock_name or extra or ticker
            prompt = template.format(ticker=ticker, name=name)
            if extra and extra.upper() != ticker.upper():
                prompt += f"\nNota adicional: {extra}"
            return prompt
    return question


# ─── Helpers ───────────────────────────────────────────────────────────────────

def _extract_ticker_name(stock_context: str) -> tuple[str, str]:
    ticker, name = "", ""
    if not stock_context:
        return ticker, name
    first_line = stock_context.splitlines()[0]
    m = re.search(r"DE\s+([A-Z0-9.\-]+)\s+\((.+?)\)", first_line)
    if m:
        return m.group(1), m.group(2)
    for line in stock_context.splitlines():
        clean = line.lstrip("- ").strip()
        if clean.startswith("Ticker:"):
            ticker = clean.split(":", 1)[-1].strip()
        elif clean.startswith("Empresa:"):
            name = clean.split(":", 1)[-1].strip()
    return ticker, name


async def _run_searches(queries: list[str], actions: list) -> str:
    """Ejecuta búsquedas en paralelo. Devuelve resultados resumidos (título + URL + snippet corto)."""
    if not queries:
        return ""

    async def search_one(query: str) -> tuple[str, list]:
        try:
            loop = asyncio.get_event_loop()
            results = await loop.run_in_executor(
                None, lambda: list(DDGS().text(query, max_results=5))
            )
            return query, results
        except Exception:
            return query, []

    results_list = await asyncio.gather(*[search_one(q) for q in queries])

    parts = []
    for query, results in results_list:
        actions.append({"type": "search", "query": query, "count": len(results)})
        if results:
            lines = [f"[{query}]"]
            for r in results:
                body = r.get("body", "")[:200]  # truncado para controlar longitud
                lines.append(f"• {r.get('title', '')} | {r.get('href', '')}\n  {body}")
            parts.append("\n".join(lines))

    return "\n\n".join(parts)


async def _resolve_notebook_id(notebook_id: str | None) -> str:
    if notebook_id:
        return notebook_id
    notebooks = await notebooklm_service.get_notebooks()
    nb = next((n for n in notebooks if getattr(n, "title", "") == "PASK stocks"), None)
    if not nb:
        raise ValueError("Notebook 'PASK stocks' no encontrado")
    return nb.id


# ─── Agente principal ─────────────────────────────────────────────────────────

async def run_agent(question: str, history: list[dict], stock_context: str = "", notebook_id: str | None = None) -> dict:
    """
    Flujo:
    1. Expandir comando si aplica (/dcf, /earnings, etc.)
    2. Buscar datos relevantes en internet (ddgs, paralelo)
    3. Configurar notebook con rol de analista (custom_prompt, persiste)
    4. Enviar pregunta corta + datos a NotebookLM y devolver respuesta
    """
    actions = []

    ticker, name = _extract_ticker_name(stock_context)
    expanded_question = expand_command(question, ticker, name)

    # Determinar búsquedas según el comando
    q_lower = question.strip().lower()
    search_queries: list[str] = []
    for cmd, templates in COMMAND_SEARCHES.items():
        if q_lower.startswith(cmd):
            search_queries = [
                t.format(ticker=ticker or "empresa", name=name or ticker or "empresa")
                for t in templates
            ]
            break

    if not search_queries and ticker and len(question.strip()) > 10:
        search_queries = [f"{ticker} {name} {question.strip()[:60]}"]

    search_context = await _run_searches(search_queries, actions)

    # Construir el mensaje para NotebookLM (corto, sin instrucciones de rol)
    parts: list[str] = []

    if stock_context:
        parts.append(f"DATOS DE LA ACCIÓN:\n{stock_context}")

    if search_context:
        parts.append(f"DATOS DE INTERNET:\n{search_context}")

    if history:
        hist_lines = []
        for m in history[-4:]:
            role = "Usuario" if m["role"] == "user" else "Asistente"
            hist_lines.append(f"{role}: {m['content'][:300]}")
        parts.append("HISTORIAL:\n" + "\n\n".join(hist_lines))

    parts.append(f"TAREA:\n{expanded_question}")

    final_message = "\n\n---\n\n".join(parts)

    # Preguntar a NotebookLM con el rol configurado como custom_prompt
    try:
        nb_id = await _resolve_notebook_id(notebook_id)

        async with await NotebookLMClient.from_storage() as client:
            from notebooklm.rpc import ChatGoal, ChatResponseLength
            await client.chat.configure(
                nb_id,
                goal=ChatGoal.CUSTOM,
                response_length=ChatResponseLength.LONGER,
                custom_prompt=ANALYST_ROLE,
            )
            result = await client.chat.ask(nb_id, final_message)

        answer = (result.answer or "").strip()
        if not answer:
            answer = (
                "NotebookLM no generó respuesta. "
                "Comprueba que el notebook 'PASK stocks' existe y tiene fuentes disponibles."
            )

    except Exception as e:
        import traceback
        return {
            "answer": f"Error al consultar NotebookLM: {type(e).__name__}: {e}",
            "actions": actions,
        }

    return {"answer": answer, "actions": actions}
