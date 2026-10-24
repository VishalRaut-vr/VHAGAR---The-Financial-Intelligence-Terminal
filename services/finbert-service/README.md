# VHAGAR FinBERT service

Internal inference API based on Hugging Face `ProsusAI/finbert`. It exposes `GET /health` and `POST /infer` and never substitutes a default sentiment when inference is unavailable.

Run with Python 3.11 recommended. Install `requirements.txt`, then run `uvicorn app.main:app --host 127.0.0.1 --port 8001`. First startup downloads the model. For production, restrict network access so only the backend can reach this service.
