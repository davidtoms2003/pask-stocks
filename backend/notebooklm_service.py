# backend/notebooklm_service.py

from notebooklm import NotebookLMClient

class NotebookLMService:
    async def get_notebooks(self):
        """Obtener lista de cuadernos de NotebookLM"""
        async with await NotebookLMClient.from_storage() as client:
            return await client.notebooks.list()
    
    async def ask_question(self, notebook_id: str, question: str) -> str:
        """Hacer una pregunta a un cuaderno de NotebookLM"""
        async with await NotebookLMClient.from_storage() as client:
            result = await client.chat.ask(notebook_id, question)
            return result.answer  # Usar .answer según ejemplo oficial
    
    async def add_source_url(self, notebook_id: str, url: str):
        """Agregar una fuente URL a NotebookLM"""
        async with await NotebookLMClient.from_storage() as client:
            source = await client.sources.add_url(notebook_id, url)
            return {
                "source_id": getattr(source, "id", None),  # Usar .id si existe
                "title": getattr(source, "title", None),
                "type": str(getattr(source, "source_type", "")),
            }

notebooklm_service = NotebookLMService()