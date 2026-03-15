from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from notebooklm_service import notebooklm_service

app = FastAPI()

# Permite peticiones desde localhost:3000 y 5173 (React/Vite típicamente)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Modelo para la pregunta
class AskRequest(BaseModel):
    question: str

@app.get("/api/notebooks")
async def get_notebooks():
    try:
        notebooks = await notebooklm_service.get_notebooks()
        # Devuelve todos los atributos disponibles de cada notebook
        return {
            "success": True,
            "notebooks": [vars(nb) for nb in notebooks]
        }
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