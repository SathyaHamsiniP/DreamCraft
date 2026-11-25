"""Drawn sizes must not change coin artwork or the obstacle collision size."""
import pytest
from fastapi.testclient import TestClient

from backend.app.main import create_app
from contracts import OBJECT_SIZES
from sketch.levels import reviewed_level


def objects(width, height):
    return [dict(id='floor', type='platform', x=0, y=460, width=960, height=20),
            dict(id='spawn', type='spawn', x=50, y=430, width=20, height=30),
            dict(id='goal', type='goal', x=850, y=424, width=24, height=36),
            dict(id='coin', type='coin', x=200-width/2, y=350-height/2, width=width, height=height),
            dict(id='spike', type='spike', x=450-width/2, y=460-height, width=width, height=height)]


@pytest.mark.parametrize('size', [(4, 4), (20, 20), (180, 150), (240, 12)])
@pytest.mark.parametrize('scale', [.5, 1, 2])
def test_drawn_sizes_and_image_scale_use_identical_game_objects(size, scale):
    source = objects(*size)
    scaled = [dict(o, **{k: o[k]*scale for k in ('x', 'y', 'width', 'height')}, reviewed=True) for o in source]
    result = reviewed_level(round(960*scale), round(540*scale), scaled, 960, 540)
    coin, spike = result['objects'][-2:]
    assert coin == dict(id='coin', type='coin', x=190, y=340, **OBJECT_SIZES['coin'])
    assert spike == dict(id='spike', type='spike', x=426, y=436, **OBJECT_SIZES['spike'])
    assert result['objects'][:3] == source[:3]


def test_fixed_sizes_do_not_silently_move_objects_inside_the_world():
    source = objects(4, 4)
    source[-2]['x'] = 0
    with pytest.raises(ValueError):
        reviewed_level(960, 540, [dict(o, reviewed=True) for o in source], 960, 540)


def test_reviewed_api_saves_the_same_sizes_that_the_game_and_checker_use(tmp_path):
    with TestClient(create_app(tmp_path/'levels.sqlite3')) as client:
        levels = []
        for width, height in [(4, 4), (180, 150)]:
            response = client.post('/api/sketch/reviewed-level', json=dict(
                image_width=960, image_height=540, world_width=960, world_height=540,
                objects=[dict(o, reviewed=True) for o in objects(width, height)]))
            assert response.status_code == 200
            level = response.json()['level']
            saved = client.post('/api/levels', json=level)
            assert saved.status_code == 201
            assert client.get('/api/levels/'+saved.json()['id']).json()['level'] == level
            levels.append(level)
        assert levels[0] == levels[1]
