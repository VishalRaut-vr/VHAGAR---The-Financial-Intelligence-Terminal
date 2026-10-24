import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pytest
from fastapi import HTTPException
from app import main

class FakePipeline:
    def __init__(self, output): self.output = output; self.calls = []
    def __call__(self, text, **kwargs): self.calls.append((text, kwargs)); return self.output

def test_inference_returns_real_model_output_shape(monkeypatch):
    fake = FakePipeline([{"label":"positive","score":0.80},{"label":"neutral","score":0.15},{"label":"negative","score":0.05}])
    monkeypatch.setattr(main, 'pipeline', fake)
    result = main.infer(main.InferenceRequest(text='Company revenue increased and guidance was raised.'))
    assert result.status == 'success'
    assert result.model == 'ProsusAI/finbert'
    assert result.label == 'positive'
    assert result.confidence == pytest.approx(0.80)
    assert sum(p.score for p in result.probabilities) == pytest.approx(1.0)
    assert fake.calls[0][1]['truncation'] is True

def test_inference_accepts_nested_pipeline_output(monkeypatch):
    monkeypatch.setattr(main, 'pipeline', FakePipeline([[{"label":"neutral","score":0.7},{"label":"positive","score":0.2},{"label":"negative","score":0.1}]]))
    result = main.infer(main.InferenceRequest(text='The company announced its quarterly results.'))
    assert result.label == 'neutral'

def test_inference_reports_model_unavailable(monkeypatch):
    monkeypatch.setattr(main, 'pipeline', None)
    with pytest.raises(HTTPException) as exc:
        main.infer(main.InferenceRequest(text='Market update'))
    assert exc.value.status_code == 503

def test_inference_rejects_whitespace(monkeypatch):
    monkeypatch.setattr(main, 'pipeline', FakePipeline([]))
    with pytest.raises(HTTPException) as exc:
        main.infer(main.InferenceRequest(text='   '))
    assert exc.value.status_code == 422

def test_inference_rejects_incomplete_class_probabilities(monkeypatch):
    monkeypatch.setattr(main, 'pipeline', FakePipeline([
        {"label": "positive", "score": 0.8},
        {"label": "negative", "score": 0.2},
    ]))
    with pytest.raises(HTTPException) as exc:
        main.infer(main.InferenceRequest(text='Earnings update'))
    assert exc.value.status_code == 502


def test_inference_rejects_duplicate_class_labels(monkeypatch):
    monkeypatch.setattr(main, 'pipeline', FakePipeline([
        {"label": "positive", "score": 0.6},
        {"label": "positive", "score": 0.3},
        {"label": "neutral", "score": 0.1},
    ]))
    with pytest.raises(HTTPException) as exc:
        main.infer(main.InferenceRequest(text='Earnings update'))
    assert exc.value.status_code == 502

def test_http_infer_endpoint_returns_json_contract(monkeypatch):
    from fastapi.testclient import TestClient
    monkeypatch.setattr(main, 'pipeline', FakePipeline([
        {"label": "positive", "score": 0.80},
        {"label": "neutral", "score": 0.15},
        {"label": "negative", "score": 0.05},
    ]))
    response = TestClient(main.app).post('/infer', json={"text": "Revenue increased and guidance improved."})
    assert response.status_code == 200
    body = response.json()
    assert body['status'] == 'success'
    assert body['model'] == 'ProsusAI/finbert'
    assert body['label'] == 'positive'
    assert {item['label'] for item in body['probabilities']} == {'positive', 'negative', 'neutral'}


def test_health_does_not_claim_model_is_ready_when_missing(monkeypatch):
    monkeypatch.setattr(main, 'pipeline', None)
    monkeypatch.setattr(main, 'model_error', 'ImportError: model initialization failed')
    result = main.health()
    assert result['ready'] is False
    assert result['status'] == 'degraded'
    assert result['model'] == 'ProsusAI/finbert'
