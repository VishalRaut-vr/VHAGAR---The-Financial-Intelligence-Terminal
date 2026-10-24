"""Live smoke test for a running VHAGAR FinBERT service (uses real model weights)."""
import json
import os
import sys
import urllib.error
import urllib.request

base = os.environ.get("FINBERT_SERVICE_URL", "http://127.0.0.1:8001").rstrip("/")
model = os.environ.get("FINBERT_MODEL_ID", "ProsusAI/finbert")

def get_json(url: str, payload: dict | None = None) -> dict:
    data = json.dumps(payload).encode() if payload is not None else None
    request = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(request, timeout=120) as response:
        return json.loads(response.read().decode())

try:
    health = get_json(f"{base}/health")
    print("Health:", json.dumps(health, indent=2))
    if not health.get("ready"):
        raise RuntimeError("The service is running but the real FinBERT model is not ready. Check model download and service logs.")
    if health.get("model") != model:
        raise RuntimeError(f"Unexpected model id: {health.get('model')!r}; expected {model!r}.")
    result = get_json(f"{base}/infer", {"text": "The company beat revenue expectations and raised its full-year guidance."})
    labels = {item["label"] for item in result.get("probabilities", [])}
    total = sum(float(item["score"]) for item in result.get("probabilities", []))
    if result.get("status") != "success" or labels != {"positive", "negative", "neutral"} or abs(total - 1.0) > 0.02:
        raise RuntimeError("The live model response failed schema/probability checks.")
    print("LIVE INFERENCE PASSED:", json.dumps(result, indent=2))
except (urllib.error.URLError, TimeoutError, RuntimeError, ValueError, KeyError) as exc:
    print(f"FINBERT SMOKE TEST FAILED: {exc}", file=sys.stderr)
    sys.exit(1)
