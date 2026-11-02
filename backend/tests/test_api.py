import io
import json

import pytest
from fastapi.testclient import TestClient
from PIL import Image

from backend.app.main import MAX_BODY_BYTES, MAX_FILE_BYTES, create_app
from contracts import ROOT


@pytest.fixture
def level():
    return json.loads((ROOT / 'examples/flat.json').read_text())


@pytest.fixture
def client(tmp_path):
    with TestClient(create_app(tmp_path / 'levels.sqlite3')) as client:
        yield client


def image_bytes(format='PNG', size=(20, 20)):
    buffer = io.BytesIO()
    Image.new('RGB', size, 'white').save(buffer, format=format)
    return buffer.getvalue()


def test_level_lifecycle(client, level):
    assert client.get('/api/health').json() == {'status': 'ok'}
    assert client.get('/docs').status_code == 200
    assert client.get('/openapi.json').status_code == 200
    created = client.post('/api/levels', json=level)
    assert created.status_code == 201
    record = created.json()
    fetched = client.get('/api/levels/' + record['id']).json()
    assert fetched['level'] == level
    assert fetched['created_at'] == record['created_at']
    assert client.get('/api/levels').json() == [record]
    level['recognition'] = {'reviewed': True}
    updated = client.put('/api/levels/' + record['id'], json=level).json()
    assert updated['level'] == level and updated['created_at'] == record['created_at']
    assert updated['updated_at'] >= record['updated_at']
    assert client.get('/api/levels?offset=1').json() == []


def test_database_survives_app_restart(tmp_path, level):
    path = tmp_path / 'persistent.sqlite3'
    with TestClient(create_app(path)) as first:
        record = first.post('/api/levels', json=level).json()
    with TestClient(create_app(path)) as second:
        assert second.get('/api/levels/' + record['id']).json() == record


@pytest.mark.parametrize('case', [c for c in json.loads((ROOT / 'validation-cases.json').read_text()) if not c['valid']], ids=lambda c: c['file'])
def test_bad_levels(client, case):
    level = json.loads((ROOT / 'examples' / case['file']).read_text())
    response = client.post('/api/levels', json=level)
    assert response.status_code == 422
    assert set(response.json()) == {'error'}
    assert client.get('/api/levels').json() == []


def test_invalid_requests(client, level):
    assert client.post('/api/levels', content='{bad').status_code == 422
    for method, url in [('get', '/api/levels/missing'), ('put', '/api/levels/missing'), ('post', '/api/levels/missing/validate')]:
        kwargs = {'json': level} if method == 'put' else {}
        result = getattr(client, method)(url, **kwargs)
        assert result.status_code == 404
        assert set(result.json()) == {'error'}
    assert client.get('/api/levels?offset=-1').status_code == 422
    response = client.post('/api/levels', content=b'x' * (MAX_BODY_BYTES + 1))
    assert response.status_code == 413


@pytest.mark.parametrize('format', ['PNG', 'JPEG'])
def test_mock_upload(client, format):
    data = image_bytes(format)
    response = client.post('/api/levels/from-sketch?mode=mock&fixture=coins', files={'file': ('../../unsafe.png', data, 'image/png')})
    assert response.status_code == 200
    result = response.json()
    assert result['mode'] == 'mock' and result['image_analyzed'] is False
    assert result['level']['recognition'] == {'mode': 'mock', 'fixture': 'coins', 'image_analyzed': False}
    assert 'confidence' not in json.dumps(result)
    again = client.post('/api/levels/from-sketch?fixture=coins', files={'file': ('other.jpg', data)}).json()
    assert again == result


@pytest.mark.parametrize('data', [b'not an image', b'', image_bytes('GIF'), image_bytes()[:30], image_bytes(size=(4097, 1))])
def test_bad_upload(client, data):
    response = client.post('/api/levels/from-sketch', files={'file': ('image.png', data, 'image/png')})
    assert response.status_code == 422
    assert set(response.json()) == {'error'}


def test_upload_limits_and_real_mode(client):
    assert client.post('/api/levels/from-sketch', files={'file': ('big.png', b'x' * (MAX_FILE_BYTES + 1))}).status_code == 413
    response = client.post('/api/levels/from-sketch?mode=real', files={'file': ('image.png', image_bytes())})
    assert response.status_code == 503
    assert 'detector' in response.json()['error']['message']
    assert client.post('/api/levels/from-sketch?mode=other', files={'file': ('image.png', image_bytes())}).status_code == 422
    assert client.post('/api/levels/from-sketch?fixture=../../secret', files={'file': ('image.png', image_bytes())}).status_code == 422


def test_cors(client):
    response = client.options('/api/levels', headers={'Origin': 'http://localhost:5173', 'Access-Control-Request-Method': 'POST'})
    assert response.headers['access-control-allow-origin'] == 'http://localhost:5173'
    response = client.get('/api/health', headers={'Origin': 'https://unknown.example'})
    assert 'access-control-allow-origin' not in response.headers


def test_saved_level_validation(client, level):
    record = client.post('/api/levels', json=level).json()
    result = client.post('/api/levels/' + record['id'] + '/validate')
    assert result.status_code == 200
    assert result.json()['status'] == 'reachable'
    assert result.json()['physics_version'] == '1.0'
    assert result.json()['verified_in_game'] is False


def test_unknown_route_and_method_errors(client):
    for response in [client.get('/api/not-here'), client.delete('/api/levels')]:
        assert response.status_code in (404, 405)
        assert set(response.json()) == {'error'}


def test_candidate_route_does_not_create_levels(client):
    data = image_bytes(size=(600, 400))
    response = client.post('/api/sketch/candidates', files={'file': ('blank.png', data)})
    assert response.status_code == 200
    assert response.json()['candidates'] == []
    assert response.json()['model_status'] == 'unavailable'
    assert client.get('/api/levels').json() == []
    assert client.post('/api/sketch/reviewed-level', json={}).status_code == 422
