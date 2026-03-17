# backend/notebooklm_service.py

import asyncio
from notebooklm import NotebookLMClient
from pathlib import Path
import os

NOTEBOOK_NAME = "PASK stocks"
AUTH_FILE = "auth_cookies.json"  # File created by /api/config/notebooklm

async def get_notebook_client():
    """Returns a NotebookLMClient instance, using local auth file if available."""
    # Check if auth_cookies.json exists in CWD or backend/
    path = Path(AUTH_FILE)
    if not path.exists():
        path = Path("backend") / AUTH_FILE
        
    if path.exists():
        return await NotebookLMClient.from_storage(str(path))
    
    # Fallback to default (~/.notebooklm/storage_state.json)
    return await NotebookLMClient.from_storage()

class NotebookLMService:
    async def _get_client(self):
        return await get_notebook_client()

    async def _get_pask_notebook_id(self, client) -> str:
        """Obtiene el ID del notebook PASK stocks, lanzando error si no existe."""
        notebooks = await client.notebooks.list()
        notebook = next((nb for nb in notebooks if nb.title == NOTEBOOK_NAME), None)
        if not notebook:
            raise ValueError(f"Notebook '{NOTEBOOK_NAME}' not found")
        return notebook.id

    async def get_notebooks(self):
        """Obtener lista de cuadernos de NotebookLM"""
        async with await self._get_client() as client:
            return await client.notebooks.list()

    async def ask_question(self, notebook_id: str, question: str) -> str:
        """Hacer una pregunta a un cuaderno de NotebookLM"""
        async with await self._get_client() as client:
            result = await client.chat.ask(notebook_id, question)
            return result.answer

    async def add_source_url(self, notebook_id: str, url: str):
        """Agregar una fuente URL a NotebookLM"""
        async with await self._get_client() as client:
            source = await client.sources.add_url(notebook_id, url)
            return {
                "source_id": getattr(source, "id", None),
                "title": getattr(source, "title", None),
                "type": str(getattr(source, "source_type", "")),
            }

    async def add_source_text(self, title: str, content: str, notebook_id: str | None = None) -> dict:
        """Agrega texto directamente como FUENTE (no nota) al notebook."""
        async with await self._get_client() as client:
            nb_id = notebook_id or await self._get_pask_notebook_id(client)
            # add_text devuelve un objeto Source
            source = await client.sources.add_text(nb_id, title, content)
            return {
                "source_id": getattr(source, "id", None),
                "title": getattr(source, "title", None),
            }

    async def create_note(self, content: str, notebook_id: str | None = None) -> dict:
        """Crea una nota en el notebook indicado (o PASK stocks por defecto)."""
        async with await self._get_client() as client:
            nb_id = notebook_id or await self._get_pask_notebook_id(client)
            # Extraer título de la primera línea del contenido
            first_line = content.strip().splitlines()[0] if content.strip() else "Nota"
            title = first_line[:80]
            note = await client.notes.create(nb_id, title=title, content=content)
            return {"note_id": getattr(note, "id", None)}

    async def add_news_sources(self, urls: list[str], notebook_id: str | None = None) -> dict:
        """
        Añade una lista de URLs como fuentes al notebook indicado (o PASK stocks por defecto).
        Se ejecuta en paralelo para mayor velocidad.
        """
        async with await self._get_client() as client:
            nb_id = notebook_id or await self._get_pask_notebook_id(client)
            
            async def add_one(url):
                try:
                    source = await client.sources.add_url(nb_id, url)
                    return {
                        "status": "added",
                        "url": url,
                        "source_id": getattr(source, "id", None),
                        "title": getattr(source, "title", None),
                    }
                except Exception as e:
                    return {"status": "failed", "url": url, "error": str(e)}

            results = await asyncio.gather(*[add_one(url) for url in urls])
            
            added = [r for r in results if r["status"] == "added"]
            failed = [r for r in results if r["status"] == "failed"]
            
            return {"added": added, "failed": failed, "notebook_id": nb_id}

notebooklm_service = NotebookLMService()