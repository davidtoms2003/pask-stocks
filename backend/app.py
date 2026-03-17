import os
import uuid
import asyncio
from pathlib import Path
from dotenv import load_dotenv

# Carga .env.local desde la raíz del proyecto (un nivel arriba del backend/)
load_dotenv(Path(__file__).parent.parent / ".env.local")

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from notebooklm_service import notebooklm_service
from agent_service import run_agent
from briefing_service import generate_briefing, refresh_news_notebook, get_or_create_news_notebook

# ─── In-memory podcast job tracker ───────────────────────────────────────────
podcast_jobs: dict[str, dict] = {}
PODCAST_DIR = Path("/tmp/pask_podcasts")
PODCAST_DIR.mkdir(exist_ok=True)

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
        result = await generate_briefing(request.news_items)
        return {
            "success": True,
            "briefing": result["briefing"],
            "added_urls": result["added_urls"],
            "failed_urls": result["failed_urls"],
            "telegram_urls": result["telegram_urls"],
        }
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

async def _run_podcast_generation(job_id: str) -> None:
    """Background task: generate audio overview for the News Of The Day notebook."""
    try:
        from notebooklm import NotebookLMClient
        from notebooklm.types import AudioFormat, AudioLength

        notebook_id = await get_or_create_news_notebook()
        async with await NotebookLMClient.from_storage() as client:
            status = await client.artifacts.generate_audio(
                notebook_id,
                audio_format=AudioFormat.DEEP_DIVE,
                audio_length=AudioLength.SHORT,
                language="es",
            )
            final = await client.artifacts.wait_for_completion(
                notebook_id, status.task_id, timeout=900.0
            )
            if not final.is_complete or not final.task_id:
                podcast_jobs[job_id] = {"status": "failed", "error": final.error or "No se completó la generación"}
                return

            artifact_id = final.task_id  # task_id == artifact_id once complete
            output_path = PODCAST_DIR / f"{job_id}.mp3"
            await client.artifacts.download_audio(notebook_id, str(output_path), artifact_id)
            podcast_jobs[job_id] = {"status": "ready", "artifact_id": artifact_id}
    except Exception as e:
        import traceback
        podcast_jobs[job_id] = {"status": "failed", "error": f"{type(e).__name__}: {e}", "trace": traceback.format_exc()}


@app.post("/api/generate_podcast")
async def generate_podcast(background_tasks: BackgroundTasks):
    job_id = str(uuid.uuid4())
    podcast_jobs[job_id] = {"status": "pending"}
    background_tasks.add_task(_run_podcast_generation, job_id)
    return {"job_id": job_id}


@app.get("/api/podcast_status/{job_id}")
async def podcast_status(job_id: str):
    job = podcast_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job no encontrado")
    return job


@app.get("/api/podcast_audio/{job_id}")
async def podcast_audio(job_id: str):
    job = podcast_jobs.get(job_id)
    if not job or job.get("status") != "ready":
        raise HTTPException(status_code=404, detail="Audio no disponible aún")
    audio_path = PODCAST_DIR / f"{job_id}.mp3"
    if not audio_path.exists():
        raise HTTPException(status_code=404, detail="Archivo de audio no encontrado")
    return FileResponse(audio_path, media_type="audio/mpeg", filename="podcast-del-dia.mp3")


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