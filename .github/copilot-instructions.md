# Copilot Instructions for pask-stocks

## Build, Test, and Lint Commands

- **Start development server:**
  - `npm run dev` (Next.js frontend)
- **Build frontend:**
  - `npm run build`
- **Start production frontend:**
  - `npm run start`
- **Lint frontend:**
  - `npm run lint`
- **Backend (Python/FastAPI):**
  - Install dependencies: `pip install -r backend/requirements.txt`
  - Start server: `uvicorn backend.app:app --reload`

> **Note:** No test scripts or test files were found in the current codebase.

## High-Level Architecture

- **Frontend:** Next.js (TypeScript, React) in the root directory, using Tailwind CSS for styling. Entry point: `src/` (see `README.md`).
- **Backend:** Python FastAPI app in `backend/`. Key services:
  - `app.py`: Main FastAPI app, CORS enabled for local dev, exposes endpoints for financial analysis and podcast jobs.
  - `agent_service.py`: Handles financial analysis commands, uses a Spanish-speaking analyst persona, integrates with NotebookLM and DuckDuckGo search.
  - `briefing_service.py`: Generates daily market briefings using NotebookLM, manages news sources/notebooks.
  - `notebooklm_service.py`: Abstraction for interacting with NotebookLM notebooks (create, query, add sources, notes).
- **Data Flow:** Frontend communicates with backend via HTTP API (localhost:3000 for frontend, backend default port for API).

## Key Conventions

- **Language:** All financial analysis responses are in Spanish, with executive summaries and markdown tables for metrics.
- **NotebookLM:** Used for storing and querying financial data and news. Notebooks are created and managed programmatically.
- **CORS:** Backend allows requests from `localhost:3000` and `localhost:5173` for local development.
- **Environment:** Backend loads environment variables from `.env.local` at the project root.

---

This file summarizes build/run commands, architecture, and conventions for Copilot and other AI assistants. If you add tests or new conventions, update this file.
