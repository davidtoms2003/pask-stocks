import re
import asyncio
from ddgs import DDGS
from notebooklm import NotebookLMClient
from notebooklm_service import notebooklm_service, get_notebook_client

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
        "Genera un one-pager profesional de calidad investment banking para {ticker} ({name}).\n"
        "RESPONDE ESTRICTAMENTE CON ESTA ESTRUCTURA MARKDOWN:\n"
        "# 1. Company Overview\n"
        "- **Modelo de Negocio:** [Descripción breve]\n"
        "- **Segmentos:** [Lista de segmentos y % ingresos]\n\n"
        "# 2. Análisis Competitivo\n"
        "- **Posición en el mercado:** [Líder/Challenger/Nicho]\n"
        "- **Moat:** [Descripción de ventajas competitivas]\n\n"
        "# 3. Financial Metrics\n"
        "| Métrica | Valor |\n"
        "|---|---|\n"
        "| Ingresos LTM | ... |\n"
        "| EBITDA | ... |\n"
        "| Margen Neto | ... |\n"
        "| Deuda Neta/EBITDA | ... |\n\n"
        "# 4. Comportamiento Bursátil & Valoración\n"
        "- **YTD Return:** [...]\n"
        "- **Múltiplo EV/EBITDA:** [...]\n\n"
        "# Veredicto\n"
        "**[COMPRAR / MANTENER / VENDER]**\n"
        "*Price Target Estimado: $[...]*"
    ),
    "/dcf": (
        "Realiza un modelo DCF institucional completo para {ticker} ({name}).\n"
        "RESPONDE ESTRICTAMENTE CON ESTA ESTRUCTURA MARKDOWN:\n"
        "# 1. Supuestos del Modelo\n"
        "- **WACC:** [Cálculo detallado: Rf, Beta, ERP]\n"
        "- **Tasa de Crecimiento Terminal (g):** [...]\n"
        "- **Tasa Impositiva:** [...]\n\n"
        "# 2. Proyección de Free Cash Flow (FCF)\n"
        "| Año | 1 | 2 | 3 | 4 | 5 |\n"
        "|---|---|---|---|---|---|\n"
        "| Ingresos | ... | ... | ... | ... | ... |\n"
        "| EBIT | ... | ... | ... | ... | ... |\n"
        "| (-) Impuestos | ... | ... | ... | ... | ... |\n"
        "| (+) D&A | ... | ... | ... | ... | ... |\n"
        "| (-) CapEx | ... | ... | ... | ... | ... |\n"
        "| (-) Var. NWC | ... | ... | ... | ... | ... |\n"
        "| **UFCF** | **...** | **...** | **...** | **...** | **...** |\n\n"
        "# 3. Valoración\n"
        "- **Valor Presente de FCF:** [...]\n"
        "- **Valor Terminal:** [...]\n"
        "- **Enterprise Value (EV):** [...]\n"
        "- **Equity Value:** [...]\n"
        "- **Precio por Acción Implícito:** **$[...]**\n\n"
        "# 4. Análisis de Sensibilidad\n"
        "| WACC \\ g | 2.0% | 2.5% | 3.0% |\n"
        "|---|---|---|---|\n"
        "| **8%** | $... | $... | $... |\n"
        "| **10%** | $... | $... | $... |\n"
        "| **12%** | $... | $... | $... |"
    ),
    "/earnings": (
        "Analiza los últimos resultados trimestrales de {ticker} ({name}).\n"
        "RESPONDE ESTRICTAMENTE CON ESTA ESTRUCTURA MARKDOWN:\n"
        "# 1. Titular (Beat/Miss)\n"
        "- **EPS:** [Reportado] vs [Esperado] -> [Beat/Miss]\n"
        "- **Revenue:** [Reportado] vs [Esperado] -> [Beat/Miss]\n\n"
        "# 2. Tabla de Resultados\n"
        "| Partida | Valor Q | Variación YoY |\n"
        "|---|---|---|\n"
        "| Ingresos | ... | ...% |\n"
        "| Margen Bruto | ...% | ... bps |\n"
        "| Ingreso Neto | ... | ...% |\n\n"
        "# 3. Key Takeaways del Earnings Call\n"
        "- [Punto clave 1]\n"
        "- [Punto clave 2]\n"
        "- [Punto clave 3]\n\n"
        "# 4. Guidance & Outlook\n"
        "Descripción del guidance para el próximo trimestre/año.\n\n"
        "# 5. Reacción del Mercado\n"
        "Análisis del movimiento de la acción tras el reporte."
    ),
    "/comps": (
        "Construye un análisis de comparables (Comps) para {ticker} ({name}).\n"
        "RESPONDE ESTRICTAMENTE CON ESTA ESTRUCTURA MARKDOWN:\n"
        "# 1. Selección de Peers\n"
        "Lista las 5 empresas comparables seleccionadas y por qué.\n\n"
        "# 2. Tabla de Valoración Relativa\n"
        "| Ticker | Empresa | EV/Sales | EV/EBITDA | P/E (LTM) | P/E (NTM) |\n"
        "|---|---|---|---|---|---|\n"
        "| [TICKER] | [Nombre] | ...x | ...x | ...x | ...x |\n"
        "| ... | ... | ... | ... | ... | ... |\n"
        "| **PROMEDIO** | | **...x** | **...x** | **...x** | **...x** |\n"
        "| **MEDIANA** | | **...x** | **...x** | **...x** | **...x** |\n\n"
        "# 3. Valoración Implícita\n"
        "Calcula el precio de la acción de {ticker} aplicando los múltiplos promedio/mediana de los pares a sus métricas financieras."
    ),
    "/competitive": (
        "Realiza un análisis competitivo completo para {ticker} ({name}).\n"
        "RESPONDE ESTRICTAMENTE CON ESTA ESTRUCTURA MARKDOWN:\n"
        "# 1. Panorama Competitivo\n"
        "Descripción general de la industria y tendencias clave.\n\n"
        "# 2. Tabla Comparativa Directa\n"
        "| Característica | {ticker} | Competidor A | Competidor B |\n"
        "|---|---|---|---|\n"
        "| Market Cap | ... | ... | ... |\n"
        "| Crecimiento | ... | ... | ... |\n"
        "| Márgenes | ... | ... | ... |\n"
        "| Puntos Fuertes | ... | ... | ... |\n\n"
        "# 3. Análisis de Ventajas (Moat)\n"
        "- **Tipo de Moat:** [Red / Costos / Marca / Switching Costs]\n"
        "- **Durabilidad:** [Alta/Media/Baja]\n\n"
        "# 4. Análisis SWOT (FODA)\n"
        "- **Fortalezas:** ...\n"
        "- **Debilidades:** ...\n"
        "- **Oportunidades:** ...\n"
        "- **Amenazas:** ..."
    ),
    "/screen": (
        "Genera un stock screener con ideas de inversión relacionadas con el sector de {ticker} ({name}).\n"
        "RESPONDE ESTRICTAMENTE CON ESTA ESTRUCTURA MARKDOWN:\n"
        "# Criterios del Screener\n"
        "Explica qué factores has usado (ej: PER bajo, alto crecimiento, calidad).\n\n"
        "# Top Picks (3-5 ideas)\n"
        "## 1. [Ticker] - [Nombre]\n"
        "- **Tesis:** [Por qué es buena inversión]\n"
        "- **Catalizador:** [Evento que subirá el precio]\n"
        "- **Riesgo Principal:** [Qué puede salir mal]\n\n"
        "## 2. [Ticker] - [Nombre]\n"
        "...\n\n"
        "# Tabla Resumen\n"
        "| Ticker | Precio | Target | Upside |\n"
        "|---|---|---|---|\n"
        "| ... | ... | ... | ... |"
    ),
    "/initiate": (
        "Inicia cobertura de {ticker} ({name}) con informe institucional completo.\n"
        "RESPONDE ESTRICTAMENTE CON ESTA ESTRUCTURA MARKDOWN:\n"
        "# INICIO DE COBERTURA: {ticker}\n"
        "**RATING:** [COMPRAR/MANTENER/VENDER]\n"
        "**PRICE TARGET:** $[...]\n\n"
        "# 1. Tesis de Inversión\n"
        "Argumento central en 3 puntos clave.\n\n"
        "# 2. Resumen Financiero\n"
        "| Año | Ingresos | EBITDA | EPS |\n"
        "|---|---|---|---|\n"
        "| 2023 | ... | ... | ... |\n"
        "| 2024E | ... | ... | ... |\n"
        "| 2025E | ... | ... | ... |\n\n"
        "# 3. Valoración\n"
        "Resumen de métodos usados (DCF, Comps) y rango de precios.\n\n"
        "# 4. Riesgos Principales\n"
        "Lista de riesgos (Bear case)."
    ),
    "/merger": (
        "Analiza la operación de M&A reciente de {ticker} ({name}).\n"
        "RESPONDE ESTRICTAMENTE CON ESTA ESTRUCTURA MARKDOWN:\n"
        "# 1. Detalles de la Transacción\n"
        "- **Target:** ...\n"
        "- **Valor del Deal:** ...\n"
        "- **Tipo:** [Efectivo / Acciones / Mixto]\n\n"
        "# 2. Rationale Estratégico\n"
        "¿Por qué tiene sentido esta compra?\n\n"
        "# 3. Sinergias y Valoración\n"
        "Análisis de precio pagado (prima) y sinergias esperadas.\n\n"
        "# 4. Veredicto\n"
        "¿Es bueno para los accionistas? [POSITIVO / NEUTRO / NEGATIVO]"
    ),
    "/ipo": (
        "Analiza el IPO de {ticker} ({name}).\n"
        "RESPONDE ESTRICTAMENTE CON ESTA ESTRUCTURA MARKDOWN:\n"
        "# 1. Perfil de la IPO\n"
        "- **Fecha:** ...\n"
        "- **Precio Salida:** ...\n"
        "- **Capital Levantado:** ...\n\n"
        "# 2. Modelo de Negocio\n"
        "¿Cómo gana dinero?\n\n"
        "# 3. Financials (S-1)\n"
        "Análisis de ingresos y rentabilidad previos a la salida.\n\n"
        "# 4. Valoración y Peers\n"
        "Comparativa con empresas cotizadas similares.\n\n"
        "# 5. Conclusión\n"
        "**[PARTICIPAR / ESPERAR]**"
    ),
    "/credit": (
        "Realiza un análisis de crédito corporativo para {ticker} ({name}).\n"
        "RESPONDE ESTRICTAMENTE CON ESTA ESTRUCTURA MARKDOWN:\n"
        "# 1. Perfil Crediticio\n"
        "- **Rating:** [IG / High Yield]\n"
        "- **Perspectiva:** [Estable / Positiva / Negativa]\n\n"
        "# 2. Ratios de Solvencia\n"
        "| Ratio | Valor | Benchmark |\n"
        "|---|---|---|\n"
        "| Deuda Neta / EBITDA | ...x | <3.0x |\n"
        "| Cobertura Intereses (EBIT/Int) | ...x | >5.0x |\n\n"
        "# 3. Liquidez y Vencimientos\n"
        "Análisis de caja disponible y calendario de deuda.\n\n"
        "# 4. Conclusión de Crédito\n"
        "Evaluación final del riesgo de impago."
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


async def _run_searches(queries: list[str], actions: list) -> tuple[str, list[str]]:
    """
    Ejecuta búsquedas en paralelo.
    Devuelve:
      1. Texto resumen (título + snippet) para contexto inmediato.
      2. Lista de URLs únicas encontradas para añadir como fuentes.
    """
    if not queries:
        return "", []

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
    found_urls = set()

    for query, results in results_list:
        actions.append({"type": "search", "query": query, "count": len(results)})
        if results:
            lines = [f"[{query}]"]
            for r in results:
                url = r.get('href', '')
                if url:
                    found_urls.add(url)
                
                body = r.get("body", "")[:200]  # truncado para controlar longitud
                lines.append(f"• {r.get('title', '')} | {url}\n  {body}")
            parts.append("\n".join(lines))

    # Limitar a top 5 URLs para no saturar
    top_urls = list(found_urls)[:5]
    return "\n\n".join(parts), top_urls


async def _resolve_notebook_id(notebook_id: str | None) -> str:
    if notebook_id:
        return notebook_id
    notebooks = await notebooklm_service.get_notebooks()
    nb = next((n for n in notebooks if getattr(n, "title", "") == "PASK stocks"), None)
    if not nb:
        raise ValueError("Notebook 'PASK stocks' no encontrado")
    return nb.id


# ─── Agente principal ─────────────────────────────────────────────────────────

async def run_agent(question: str, history: list[dict], stock_context: str = "", notebook_id: str | None = None, add_stock_context: bool = False) -> dict:
    """
    Flujo:
    1. Expandir comando si aplica (/dcf, /earnings, etc.)
    2. Buscar datos relevantes en internet (ddgs, paralelo) -> Obtener URLs y Snippets
    3. Añadir URLs encontradas como FUENTES al notebook (crawler de NotebookLM)
    4. Añadir Snippets + StockInfo como FUENTE DE TEXTO (contexto inmediato)
    5. Enviar pregunta a NotebookLM
    """
    actions = []

    ticker, name = _extract_ticker_name(stock_context)
    expanded_question = expand_command(question, ticker, name)

    # Determinar búsquedas según el comando
    q_lower = question.strip().lower()
    search_queries: list[str] = []
    
    # Lista de comandos que SÍ requieren búsqueda activa
    # (Los financieros definidos en COMMAND_SEARCHES)
    for cmd, templates in COMMAND_SEARCHES.items():
        if q_lower.startswith(cmd):
            search_queries = [
                t.format(ticker=ticker or "empresa", name=name or ticker or "empresa")
                for t in templates
            ]
            break
            
    # OTROS comandos que requieren búsqueda explícita
    # Si el usuario pide explícitamente "busca noticias de X" o similar, lo detectamos aquí
    if not search_queries:
        explicit_keywords = ["busca", "buscar", "investiga", "noticias", "news", "search", "find", "fuentes"]
        # Solo si la pregunta es lo suficientemente larga para ser una query válida
        if any(k in q_lower for k in explicit_keywords) and len(question.strip()) > 5:
             query_term = question.strip()
             # Si tenemos ticker, lo incluimos para dar contexto
             if ticker and ticker.lower() not in q_lower:
                 query_term = f"{ticker} {query_term}"
             search_queries = [query_term]

    # Ejecutar búsquedas
    search_snippets, found_urls = await _run_searches(search_queries, actions)

    # Resolver ID del notebook
    try:
        nb_id = await _resolve_notebook_id(notebook_id)
    except Exception as e:
        return {"answer": f"Error: No se encontró el notebook. {e}", "actions": actions}

    # ─── AÑADIR FUENTES URL (INTERNET) ────────────────────────────────────────
    if found_urls:
        try:
            # Añadimos las URLs encontradas como fuentes reales y ESPERAMOS que se procesen
            # Para que el modelo pueda leerlas antes de contestar
            res = await notebooklm_service.add_news_sources(found_urls, nb_id)
            for item in res.get("added", []):
                actions.append({
                    "type": "source_added",
                    "title": f"Web: {item.get('url')}",
                    "url": item.get('url')
                })
            
            if res.get("failed"):
                print(f"Algunas URLs fallaron: {res['failed']}")
        except Exception as e:
            print(f"Error añadiendo URLs como fuentes: {e}")

    # ─── AÑADIR FUENTE DE TEXTO (CONTEXTO INMEDIATO) ──────────────────────────
    # Siempre útil por si las webs tienen paywall o tardan en procesarse
    context_content = ""
    
    # Sólo añadir stock_context si se ha pedido explícitamente (inicio de sesión/stock)
    if add_stock_context and stock_context:
        context_content += f"DATOS DE LA ACCIÓN ({ticker}):\n{stock_context}\n\n"
        
    if search_snippets:
        context_content += f"RESUMEN DE BÚSQUEDA ({ticker}):\n{search_snippets}\n\n"

    parts: list[str] = []
    source_added = False

    if context_content.strip():
        try:
            source_title = f"Datos rápidos {ticker or 'Empresa'} - {question[:30]}..."
            # Añadir una espera de seguridad después de añadir texto
            await notebooklm_service.add_source_text(source_title, context_content, nb_id)
            await asyncio.sleep(2) # Pequeña pausa para asegurar consistencia
            actions.append({"type": "source_added", "title": source_title})
            source_added = True
        except Exception as e:
            print(f"Error añadiendo fuente de texto: {e}")
            # Fallback al prompt si falla, pero solo si tocaba añadirlo
            if add_stock_context and stock_context: parts.append(f"DATOS DE LA ACCIÓN:\n{stock_context}")
            if search_snippets: parts.append(f"RESUMEN BÚSQUEDA:\n{search_snippets}")

    # ─── CONSTRUIR MENSAJE ────────────────────────────────────────────────────
    
    if history:
        hist_lines = []
        for m in history[-4:]:
            role = "Usuario" if m["role"] == "user" else "Asistente"
            hist_lines.append(f"{role}: {m['content'][:300]}")
        parts.append("HISTORIAL:\n" + "\n\n".join(hist_lines))

    parts.append(f"TAREA:\n{expanded_question}")
    
    notes = []
    if found_urls:
        notes.append("He añadido varias páginas web relevantes como fuentes al cuaderno.")
    if source_added:
        notes.append("He añadido un resumen de datos financieros y búsqueda como fuente de texto.")
    
    if notes:
        parts.append(f"(Nota: {' '.join(notes)} Úsalas para realizar el análisis más completo posible.)")

    final_message = "\n\n---\n\n".join(parts)

    # Preguntar a NotebookLM con el rol configurado como custom_prompt
    try:
        # nb_id ya resuelto arriba

        async with await get_notebook_client() as client:
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
