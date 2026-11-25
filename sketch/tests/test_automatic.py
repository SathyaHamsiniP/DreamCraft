"""Complete controlled scenes test plumbing, not real handwriting quality."""
import io
import json
from copy import deepcopy

import pytest
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

from backend.app.main import create_app
from contracts import ROOT, validate_level
from sketch.automatic import generate, repair_level, shape_problem
from sketch.detection import detect
from sketch.model_service import _load
from sketch.tests.automatic_fixture import make_fixture, scene


@pytest.fixture(scope='module')
def real_fixture(tmp_path_factory):
    import torch
    torch.set_num_threads(2)
    return make_fixture(tmp_path_factory.mktemp('automatic'))


@pytest.fixture
def configured(real_fixture, monkeypatch):
    monkeypatch.setenv('DREAMCRAFT_CHECKPOINT', str(real_fixture))
    monkeypatch.setenv('DREAMCRAFT_REVIEW_THRESHOLD', '.8')
    _load.cache_clear()


@pytest.mark.parametrize('scale', [1, .75])
def test_whole_scene_uses_real_cnn_and_shared_geometry(configured, scale):
    result = generate(scene(scale))
    assert result['model_status'] == 'ran'
    assert result['status'] == 'awaiting_phaser', result['issues']
    assert {c['predicted_class'] for c in result['candidates']} == {'platform','coin','spike','spawn','goal'}
    assert result['assessment']['status'] == 'reachable'
    assert not result['assessment']['verified_in_game']
    assert sum(c['kind'] == 'standard_size' for c in result['changes']) == 2
    assert sum(c['kind'] != 'standard_size' for c in result['changes']) <= 3
    assert len(result['attempts']) <= 2
    assert result['original_level'] != result['level']
    validate_level(result['level'])
    assert result['stages'] == ['detection','recognition','geometry','playability']


def test_missing_model_never_creates_a_game(monkeypatch):
    monkeypatch.delenv('DREAMCRAFT_CHECKPOINT', raising=False)
    result = generate(scene())
    assert result['status'] == 'needs_correction'
    assert result['model_status'] == 'unavailable'
    assert result['level'] is None and result['candidates']
    assert all('confidence' not in c for c in result['candidates'])


def test_invalid_and_low_predictions_do_not_create_games(monkeypatch):
    for prediction in [None, dict(predicted_class='platform', confidence=.2, scores=dict(platform=.2,coin=.2,spike=.2,spawn=.2,goal=.2))]:
        monkeypatch.setattr('sketch.automatic.local_predictor', lambda: (lambda image: prediction, .8, 'ready'))
        result = generate(scene())
        assert result['status'] == 'needs_correction' and result['level'] is None


def test_strong_score_does_not_bypass_shape_checks(configured):
    image = scene()
    platform = max(detect(image), key=lambda b: b['width'])
    assert shape_problem(image, platform, 'coin')
    result = generate(scene(1.5))
    assert result['status'] == 'needs_correction'
    assert result['level'] is None
    assert any(c.get('confidence', 0) > .99 and c.get('needs_correction') for c in result['candidates'])


def test_user_only_corrects_unclear_candidates(configured):
    image = scene(1.5)
    result = generate(image)
    corrections = {}
    for c in result['candidates']:
        if c.get('needs_correction'):
            x = c['x']/1.5
            corrections[c['id']] = 'spawn' if x < 100 else 'coin' if x < 400 else 'spike' if x < 700 else 'goal'
    assert len(corrections) < len(result['candidates'])
    fixed = generate(image, corrections)
    assert fixed['status'] == 'awaiting_phaser', fixed['issues']
    assert sum(c.get('label_source') == 'user' for c in fixed['candidates']) == len(corrections)


def test_blank_touching_noise_and_fragments_are_not_fake_success(configured):
    blank = Image.new('RGB', (960,540), 'white')
    assert generate(blank)['level'] is None
    touching = scene(); ImageDraw.Draw(touching).line((80,430,80,470), fill='black', width=4)
    result = generate(touching)
    assert result['status'] == 'needs_correction'
    assert result['level'] is None
    for i in range(50): ImageDraw.Draw(blank).point((i*10, i*5), fill='black')
    assert generate(blank)['level'] is None
    fragmented = scene(); ImageDraw.Draw(fragmented).rectangle((60,426,105,433), fill='white')
    assert generate(fragmented)['status'] == 'needs_correction'


def flat():
    return json.loads((ROOT/'examples'/'flat.json').read_text())


def test_small_gap_repair_is_bounded_logged_and_rechecked():
    level = flat()
    floor = next(o for o in level['objects'] if o['type']=='platform')
    floor['width'] = 260
    level['objects'].append(dict(floor, id='right', x=440, width=520))
    before = deepcopy(level)
    result = repair_level(level)
    assert level == before and result['original_level'] == before
    assert result['assessment']['status'] == 'reachable'
    assert [c['kind'] for c in result['changes']] == ['add_bridge']
    assert len(result['attempts']) == 2
    assert result['changes'][0]['before'] is None
    validate_level(result['level'])
    disabled = repair_level(level, False)
    assert disabled['changes'] == []
    assert disabled['assessment']['status'] != 'reachable'


def test_large_or_ambiguous_repairs_stop():
    level = json.loads((ROOT/'examples'/'wide-gap.json').read_text())
    result = repair_level(level)
    assert result['assessment']['status'] != 'reachable'
    assert not result['changes']
    level = flat(); next(o for o in level['objects'] if o['type']=='goal')['y']=0
    assert repair_level(level)['assessment']['status'] == 'unreachable'


def test_geometry_failure_does_not_get_clamped_or_hidden():
    level = flat(); next(o for o in level['objects'] if o['type']=='spawn')['x'] = 958
    result = repair_level(level)
    assert result['problem'] and result['level'] is None
    assert result['original_level'] == level


def test_standard_sizes_are_recorded_even_when_optional_repairs_are_off():
    from sketch.levels import fixed_object_sizes
    from sketch.tests.test_object_sizes import objects
    level = dict(schema_version='1.0', world=dict(width=960, height=540), objects=objects(180, 150))
    before = deepcopy(level)
    result = repair_level(level, allow_repairs=False)
    assert level == before and result['original_level'] == before
    assert result['assessment']['status'] == 'reachable'
    assert [c['kind'] for c in result['changes']] == ['standard_size', 'standard_size']
    assert result['level']['objects'][-1]['height'] == 24
    again, changes = fixed_object_sizes(result['level'])
    assert again == result['level'] and changes == []


def test_endpoint_records_the_actual_stages_and_rejects_bad_inputs(configured, tmp_path):
    stream = io.BytesIO(); scene().save(stream, 'PNG')
    with TestClient(create_app(tmp_path/'db.sqlite3')) as client:
        result = client.post('/api/sketch/generate', files={'file': ('scene.png', stream.getvalue())})
        assert result.status_code == 200
        assert result.json()['status'] == 'awaiting_phaser'
        assert client.get('/api/levels').json() == []
        for value in ['[]','null','{"candidate_0":"door"}','{"unknown":"goal"}']:
            assert client.post('/api/sketch/generate', files={'file': ('scene.png',stream.getvalue())}, data={'corrections':value}).status_code == 422
        assert client.post('/api/sketch/generate', files={'file': ('bad.png',b'bad')}).status_code == 422
        assert client.post('/api/sketch/generate', files={'file': ('big.png',b'x'*(5*1024*1024+1))}).status_code == 413
