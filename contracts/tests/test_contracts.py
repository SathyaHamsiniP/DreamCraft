import json

import pytest

from contracts import ROOT, validate_level
from contracts.coordinates import image_to_world


@pytest.mark.parametrize('case', json.loads((ROOT / 'validation-cases.json').read_text()), ids=lambda c: c['file'])
def test_shared_cases(case):
    data = json.loads((ROOT / 'examples' / case['file']).read_text())
    if case['valid']:
        assert validate_level(data) == data
    else:
        with pytest.raises(ValueError):
            validate_level(data)


@pytest.mark.parametrize('value', [float('nan'), float('inf'), -float('inf')])
def test_nonfinite(value):
    data = json.loads((ROOT / 'examples/flat.json').read_text())
    data['objects'][0]['x'] = value
    with pytest.raises(ValueError):
        validate_level(data)


@pytest.mark.parametrize('dimensions,scale,padding', [((100, 200, 960, 540), 2.7, (345, 0)), ((200, 100, 960, 540), 4.8, (0, 30))])
def test_coordinates(dimensions, scale, padding):
    box = {'id': 'p', 'type': 'platform', 'x': 10, 'y': 20, 'width': 30, 'height': 40}
    result = image_to_world(*dimensions[:2], [box], *dimensions[2:])
    assert result['scale'] == scale
    assert result['padding'] == {'x': padding[0], 'y': padding[1]}
    assert result['objects'][0]['x'] == pytest.approx(padding[0] + 10 * scale)
    assert result['objects'][0]['height'] == pytest.approx(40 * scale)


@pytest.mark.parametrize('box', [{'x': -1, 'y': 0, 'width': 10, 'height': 10}, {'x': 99, 'y': 0, 'width': 10, 'height': 10}, {'x': 0, 'y': 0, 'width': float('nan'), 'height': 10}, {}])
def test_invalid_box(box):
    with pytest.raises(ValueError):
        image_to_world(100, 100, [box], 960, 540)


def test_converted_edge_stays_in_bounds():
    result = image_to_world(179, 100, [{'x': 98, 'y': 0, 'width': 81, 'height': 100}], 960, 540)
    box = result['objects'][0]
    assert box['x'] + box['width'] <= 960
    assert box['y'] + box['height'] <= 540
    assert box['width'] == pytest.approx(81 * result['scale'])
