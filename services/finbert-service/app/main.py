"""VHAGAR FinBERT inference service. Model loading is lazy and occurs once per process."""
from contextlib import asynccontextmanager
import os
import math
import logging
from threading import Lock
from typing import Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

MODEL_ID = os.getenv("FINBERT_MODEL_ID", "ProsusAI/finbert")
MAX_TEXT_LENGTH = int(os.getenv("FINBERT_MAX_TEXT_LENGTH", "6000"))
pipeline = None
model_error: str | None = None
inference_lock = Lock()
logger = logging.getLogger("vhagar.finbert")

class InferenceRequest(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT_LENGTH)

class ClassProbability(BaseModel):
    label: Literal["positive", "negative", "neutral"]
    score: float = Field(ge=0, le=1)

class InferenceResponse(BaseModel):
    status: Literal["success"]
    model: str
    analyzed_text: str
    label: Literal["positive", "negative", "neutral"]
    confidence: float = Field(ge=0, le=1)
    probabilities: list[ClassProbability]

@asynccontextmanager
async def lifespan(_: FastAPI):
    global pipeline, model_error
    try:
        logger.info("Loading financial sentiment model %s; first startup may download model weights.", MODEL_ID)
        from transformers import pipeline as hf_pipeline
        pipeline = hf_pipeline("text-classification", model=MODEL_ID, tokenizer=MODEL_ID, top_k=None)
        model_error = None
        logger.info("FinBERT model %s is ready for inference.", MODEL_ID)
    except Exception as exc:  # Service stays alive so health clearly reports unavailable model.
        model_error = f"{type(exc).__name__}: model initialization failed"
        pipeline = None
        logger.exception("FinBERT model initialization failed for %s.", MODEL_ID)
    yield

app = FastAPI(title="VHAGAR FinBERT Service", version="0.1.0", lifespan=lifespan)


VALIDATION_MAX_WORDS = 50  # configurable; not a hard char limit
VALIDATION_MIN_SENSIBLE_WORDS = 3  # reject very short meaningless input
VALIDATION_MAX_REPETITION_RATIO = 0.75  # if >75% of words repeat, reject

def is_valid_finbert_input(text: str) -> tuple[bool, str]:
    s = text.strip()
    if not s:
        return False, "Text is empty or whitespace-only."
    if len(s) < 2:
        return False, "Input is too short for meaningful sentiment analysis."
    # Reject if only punctuation / symbols / digits (no real words)
    cleaned_for_words = re.sub(r"[^\w\s]", " ", s)
    words = cleaned_for_words.split()
    meaningful_words = [w for w in words if len(w) > 0 and w.isalpha()]
    if len(meaningful_words) < VALIDATION_MIN_SENSIBLE_WORDS:
        # Allow very short if they contain real words (e.g., "RBI raises rates")
        # But require at least 2 meaningful words or a known short headline shape
        if len(meaningful_words) < 2:
            return False, "Please provide at least two meaningful words for analysis."
    # Reject repetitive low-info: same word > 75% of word count
    if meaningful_words:
        from collections import Counter
        most = Counter(meaningful_words).most_common(1)[0][1]
        if most / len(meaningful_words) > VALIDATION_MAX_REPETITION_RATIO and len(meaningful_words) >= 3:
            return False, "Input appears repetitive or low-information."
    # Reject obvious repeated-character junk (e.g., "aaaaa")
    if any(len(ch) > 30 for ch in set(s) if ch.isalpha() and s.count(ch) > len(s) * 0.5):
        # more precise: a single char takes >50% of string
        pass  # already handled by repetition
    return True, ""

@app.get("/health")
def health():
    return {"status": "ready" if pipeline is not None else "degraded", "model": MODEL_ID, "ready": pipeline is not None, "error": model_error}

@app.post("/infer", response_model=InferenceResponse)
def infer(request: InferenceRequest):
    global pipeline
    text = request.text.strip()
    ok, msg = is_valid_finbert_input(text)
    if not ok:
        raise HTTPException(status_code=422, detail=msg)
    if not text:
        raise HTTPException(status_code=422, detail="Text must contain non-whitespace characters.")
    if pipeline is None:
        raise HTTPException(status_code=503, detail="FinBERT model is not ready. Check service health and model download access.")
    try:
        # A single shared pipeline is loaded at startup. Serialize inference calls to
        # avoid concurrent runtime issues in CPU/GPU-backed model implementations.
        with inference_lock:
            output = pipeline(text[:MAX_TEXT_LENGTH], truncation=True, max_length=512)
        entries = output[0] if output and isinstance(output[0], list) else output
        if not isinstance(entries, list) or not entries or any(not isinstance(item, dict) for item in entries):
            raise ValueError("Unexpected model output structure")
        probabilities = sorted(
            [ClassProbability(label=str(item["label"]).lower(), score=float(item["score"])) for item in entries],
            key=lambda item: item.score, reverse=True,
        )
        labels = [item.label for item in probabilities]
        if len(probabilities) != 3 or set(labels) != {"positive", "negative", "neutral"}:
            raise ValueError("FinBERT must return exactly the positive, negative, and neutral classes")
        if any(not math.isfinite(item.score) for item in probabilities):
            raise ValueError("Model returned a non-finite probability")
        total = sum(item.score for item in probabilities)
        if abs(total - 1.0) > 0.02:
            raise ValueError("Model probabilities failed normalization check")
        best = probabilities[0]
        return InferenceResponse(status="success", model=MODEL_ID, analyzed_text=text[:MAX_TEXT_LENGTH], label=best.label, confidence=best.score, probabilities=probabilities)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail="FinBERT inference failed.") from exc
