"""Controlled model weights test integration, not handwriting accuracy."""
import io

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from backend.app.main import create_app
from sketch.inference import classify_candidates
from sketch.model_service import local_predictor, _load


def checkpoint(path):
    import torch
    from ml import CLASSES
    from ml.model import SymbolCNN
    config = {'model': {'channels': [4], 'hidden': 8, 'dropout': 0},
              'preprocessing': {'size': 32, 'threshold': False}}
    model = SymbolCNN(**config['model'])
    with torch.no_grad():
        for parameter in model.parameters():
            parameter.zero_()
    torch.save({'classes': list(CLASSES), 'config': config, 'model_state': model.state_dict()}, path)


def sheet():
    image = Image.new('RGB', (200, 120), 'white')
    ImageDraw.Draw(image).rectangle((40,30,120,80), outline='black', width=4)
    buffer = io.BytesIO(); image.save(buffer, 'PNG')
    return image, buffer.getvalue()


def test_real_checkpoint_cached_api_and_manual_mode(tmp_path, monkeypatch):
    path = tmp_path/'fixture.pt'; checkpoint(path)
    monkeypatch.setenv('DREAMCRAFT_CHECKPOINT', str(path))
    monkeypatch.setenv('DREAMCRAFT_REVIEW_THRESHOLD', '.8')
    _load.cache_clear()
    image, data = sheet()
    with TestClient(create_app(tmp_path/'db.sqlite3')) as client:
        result = client.post('/api/sketch/candidates', files={'file': ('drawing.png',data)}).json()
        assert result['model_status'] == 'ran'
        candidate = result['candidates'][0]
        assert candidate['predicted_class'] == 'platform'
        assert candidate['confidence'] == pytest.approx(.2)
        assert candidate['review_required'] and candidate['low_confidence']
        assert len(candidate['scores']) == 5
        assert candidate['x'] < 40
        assert client.post('/api/sketch/candidates?classify=false',files={'file':('sheet.png',data)}).json()['model_status']=='disabled'
        assert _load.cache_info().misses == 1
        local_predictor(); assert _load.cache_info().hits == 1
    monkeypatch.setenv('DREAMCRAFT_REVIEW_THRESHOLD','0')
    predictor, threshold, _ = local_predictor()
    result = classify_candidates(image,[dict(x=0,y=0,width=200,height=120)],predictor=predictor,review_threshold=threshold)
    assert not result['candidates'][0]['low_confidence']
    assert result['candidates'][0]['review_required']


@pytest.mark.parametrize('setting', ['', 'missing.pt', 'https://untrusted.example/weights.pt', 'corrupt.pt'])
def test_missing_or_bad_weights_keep_manual_boxes(tmp_path, monkeypatch, setting):
    path = tmp_path/setting if setting and not setting.startswith('https') else setting
    if setting == 'corrupt.pt': path.write_bytes(b'bad')
    monkeypatch.setenv('DREAMCRAFT_CHECKPOINT',str(path))
    _, data = sheet()
    with TestClient(create_app(tmp_path/'db.sqlite3')) as client:
        response = client.post('/api/sketch/candidates',files={'file':('sheet.png',data)})
        assert response.status_code == 200
        result = response.json()
        assert result['model_status'] in ('unavailable','error')
        assert result['candidates'] and 'confidence' not in result['candidates'][0]
        assert str(tmp_path) not in response.text


@pytest.mark.parametrize('value', ['nan','inf','-1','2','bad'])
def test_bad_threshold_is_safe(monkeypatch,value):
    monkeypatch.setenv('DREAMCRAFT_REVIEW_THRESHOLD',value)
    assert local_predictor()[2]=='invalid_configuration'


@pytest.mark.parametrize('result', [None, {'predicted_class':'door'}, {'predicted_class':'coin','confidence':float('nan'),'scores':{}}, {'predicted_class':'coin','confidence':.9,'scores':dict(platform=.2,coin=.2,spike=.2,spawn=.2,goal=.2)}])
def test_invalid_outputs_are_not_labels(result):
    image,_=sheet()
    boxes=[dict(id='one',x=0,y=0,width=200,height=120)]
    output=classify_candidates(image,boxes,predictor=lambda image:result)
    assert output['candidates'][0]['prediction_status']=='invalid'
    assert 'confidence' not in output['candidates'][0]
    assert output['candidates'][0]['review_required']


def test_many_candidates_are_left_for_manual_review():
    image,_=sheet()
    boxes=[dict(id=str(i),x=0,y=0,width=200,height=120) for i in range(257)]
    prediction=dict(predicted_class='coin',confidence=.6,scores=dict(platform=.1,coin=.6,spike=.1,spawn=.1,goal=.1))
    result=classify_candidates(image,boxes,predictor=lambda _:prediction)
    assert result['candidates'][255]['predicted_class']=='coin'
    assert result['candidates'][256]['prediction_status']=='not_run'
    assert 'confidence' not in result['candidates'][256]


def test_prediction_cannot_replace_box_coordinates():
    image,_=sheet()
    prediction=dict(predicted_class='coin',confidence=.6,scores=dict(platform=.1,coin=.6,spike=.1,spawn=.1,goal=.1),x=999)
    result=classify_candidates(image,[dict(id='original',x=0,y=0,width=200,height=120)],predictor=lambda _:prediction)
    assert result['candidates'][0]['x']==0
    assert result['candidates'][0]['id']=='original'
