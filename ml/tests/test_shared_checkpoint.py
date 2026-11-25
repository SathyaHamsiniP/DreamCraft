"""Check the shared file and real inference without claiming photo accuracy."""
import hashlib
import json
from pathlib import Path

import pytest
from PIL import Image, ImageDraw

from ml import CLASSES
from ml.predict import predict_loaded
from ml.runtime import load_checkpoint
from sketch.inference import valid_prediction


def test_shared_checkpoint_matches_its_record_and_runs_inference():
    folder = Path(__file__).resolve().parents[1] / 'checkpoints'
    record = json.loads((folder / 'model.json').read_text())
    path = folder / record['file']
    assert path.stat().st_size == record['size_bytes']
    assert hashlib.sha256(path.read_bytes()).hexdigest() == record['sha256']
    assert record['classes'] == list(CLASSES)
    model, saved = load_checkpoint(path)
    assert saved['config']['preprocessing'] == {'size': 64, 'threshold': True}
    image = Image.new('RGB', (90, 90), 'white')
    ImageDraw.Draw(image).ellipse((15, 15, 75, 75), outline='black', width=5)
    result = predict_loaded(model, saved, image)
    assert valid_prediction(result)
    assert set(result['scores']) == set(CLASSES)
    assert sum(result['scores'].values()) == pytest.approx(1)


def test_shared_checkpoint_works_with_the_server_adapter(monkeypatch):
    from sketch.model_service import local_predictor
    path = Path(__file__).resolve().parents[1] / 'checkpoints' / 'best.pt'
    monkeypatch.setenv('DREAMCRAFT_CHECKPOINT', str(path))
    monkeypatch.delenv('DREAMCRAFT_REVIEW_THRESHOLD', raising=False)
    predictor, _, status = local_predictor()
    assert status == 'ready'
    image = Image.new('RGB', (80, 80), 'white')
    ImageDraw.Draw(image).polygon([(15, 65), (40, 15), (65, 65)], outline='black', width=4)
    assert valid_prediction(predictor(image))
