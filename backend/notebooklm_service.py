# backend/notebooklm_service.py

from notebooklm import NotebookLMClient

NOTEBOOK_NAME = "PASK stocks"

class NotebookLMService:
    async def _get_pask_notebook_id(self, client) -> str:
        """Obtiene el ID del notebook PASK stocks, lanzando error si no existe."""
        notebooks = await client.notebooks.list()
        notebook = next((nb for nb in notebooks if nb.title == NOTEBOOK_NAME), None)
        if not notebook:
            raise ValueError(f"Notebook '{NOTEBOOK_NAME}' not found")
        return notebook.id

    async def get_notebooks(self):
        """Obtener lista de cuadernos de NotebookLM"""
        async with await NotebookLMClient.from_storage() as client:
            return await client.notebooks.list()

    async def ask_question(self, notebook_id: str, question: str) -> str:
        """Hacer una pregunta a un cuaderno de NotebookLM"""
        async with await NotebookLMClient.from_storage() as client:
            result = await client.chat.ask(notebook_id, question)
            return result.answer

    async def add_source_url(self, notebook_id: str, url: str):
        """Agregar una fuente URL a NotebookLM"""
        async with await NotebookLMClient.from_storage() as client:
            source = await client.sources.add_url(notebook_id, url)
            return {
                "source_id": getattr(source, "id", None),
                "title": getattr(source, "title", None),
                "type": str(getattr(source, "source_type", "")),
            }

    async def create_note(self, content: str, notebook_id: str | None = None) -> dict:
        """Crea una nota en el notebook indicado (o PASK stocks por defecto)."""
        async with await NotebookLMClient.from_storage() as client:
            nb_id = notebook_id or await self._get_pask_notebook_id(client)
            # Extraer título de la primera línea del contenido
            first_line = content.strip().splitlines()[0] if content.strip() else "Nota"
            title = first_line[:80]
            note = await client.notes.create(nb_id, title=title, content=content)
            return {"note_id": getattr(note, "id", None)}

    async def add_news_sources(self, urls: list[str], notebook_id: str | None = None) -> dict:
        """
        Añade una lista de URLs como fuentes al notebook indicado (o PASK stocks por defecto).
        Ignora errores individuales para no bloquear si una URL falla.
        """
        async with await NotebookLMClient.from_storage() as client:
            nb_id = notebook_id or await self._get_pask_notebook_id(client)
            added, failed = [], []
            for url in urls:
                try:
                    source = await client.sources.add_url(nb_id, url)
                    added.append({
                        "url": url,
                        "source_id": getattr(source, "id", None),
                        "title": getattr(source, "title", None),
                    })
                except Exception as e:
                    failed.append({"url": url, "error": str(e)})
            return {"added": added, "failed": failed, "notebook_id": nb_id}

notebooklm_service = NotebookLMService()