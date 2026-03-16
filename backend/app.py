import os
import asyncio
from pathlib import Path
from dotenv import load_dotenv

# Carga .env.local desde la raíz del proyecto (un nivel arriba del backend/)
load_dotenv(Path(__file__).parent.parent / ".env.local")

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from notebooklm_service import notebooklm_service
from agent_service import run_agent
from briefing_service import generate_briefing, refresh_news_notebook

app = FastAPI()

# Permite peticiones desde localhost:3000 y 5173 (React/Vite típicamente)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Modelos
class AskRequest(BaseModel):
    question: str

class AddSourcesRequest(BaseModel):
    urls: list[str]

class DailyBriefingRequest(BaseModel):
    news_items: list[dict]
    urls: list[str] = []

class ChatAgentRequest(BaseModel):
    question: str
    stock_context: str = ""
    history: list[dict] = []
    notebook_id: str | None = None

@app.get("/api/notebooks")
async def get_notebooks():
    try:
        notebooks = await notebooklm_service.get_notebooks()
        result = []
        for nb in notebooks:
            d = vars(nb) if hasattr(nb, "__dict__") else {}
            result.append({
                "id": d.get("id") or getattr(nb, "id", None),
                "title": d.get("title") or getattr(nb, "title", "Sin título"),
                "source_count": d.get("source_count") or getattr(nb, "source_count", None),
                "updated_at": str(d.get("updated_at") or getattr(nb, "updated_at", "")),
            })
        return {"success": True, "notebooks": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ask_pask_stocks")
async def ask_pask_stocks(request: AskRequest):
    try:
        notebooks = await notebooklm_service.get_notebooks()
        pask = next((nb for nb in notebooks if nb.title == "PASK stocks"), None)
        if not pask:
            raise HTTPException(status_code=404, detail="Notebook 'PASK stocks' not found")
        answer = await notebooklm_service.ask_question(pask.id, request.question)
        return {"success": True, "answer": answer}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat_agent")
async def chat_agent(request: ChatAgentRequest):
    try:
        result = await run_agent(request.question, request.history, request.stock_context, request.notebook_id)
        return {"success": True, **result}
    except Exception as e:
        import traceback
        detail = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        print(detail)
        raise HTTPException(status_code=500, detail=detail)

@app.post("/api/daily_briefing")
async def daily_briefing(request: DailyBriefingRequest, background_tasks: BackgroundTasks):
    try:
        # Generate briefing synchronously (fast, ~5-10s)
        briefing = await generate_briefing(request.news_items)

        # Refresh notebook in the background — don't block the response on this
        # (adding 40 sources one-by-one can take 40-80s and was causing timeouts)
        if request.urls:
            background_tasks.add_task(refresh_news_notebook, request.urls)

        return {"success": True, "briefing": briefing}
    except Exception as e:
        import traceback
        detail = f"{type(e).__name__}: {e}\n{traceback.format_exc()}"
        print(detail)
        raise HTTPException(status_code=500, detail=detail)

@app.post("/api/add_sources")
async def add_sources(request: AddSourcesRequest):
    try:
        result = await notebooklm_service.add_news_sources(request.urls)
        return {"success": True, **result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/health")
async def health():
    return {"status": "ok"}

@app.get("/")
async def root():
    return {"message": "Pask Stocks API - NotebookLM Integration"}

# Para ejecutar directamente con python app.py
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)