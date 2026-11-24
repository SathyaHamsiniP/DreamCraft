import json

import pytest

from contracts import ROOT, PHYSICS as P
from playability.validator import State, advance, check_playability, max_jump_rise


def fixture(name):
    return json.loads((ROOT / 'examples' / f'{name}.json').read_text())


@pytest.mark.parametrize('name', ['flat', 'one-jump', 'multi-jump', 'coins', 'spikes', 'edge-horizontal', 'edge-vertical-low'])
def test_search_finds_routes(name):
    result = check_playability(fixture(name))
    assert result['status'] == 'reachable', result
    assert result['path'] and not result['verified_in_game']
    state = State(50, 430)
    for action in result['path']:
        for _ in range(action['frames']):
            state, outcome = advance(fixture(name), state, action['direction'], action['jump'])
            assert state is not None
    assert outcome == 'won'


@pytest.mark.parametrize('name', ['wide-gap', 'high-goal', 'blocked-jump', 'edge-vertical'])
def test_no_path_is_not_a_proof(name):
    result = check_playability(fixture(name), max_states=2000, max_seconds=1)
    assert result['status'] == 'unknown'
    assert not result['verified_in_game']


def test_sound_height_bound():
    data = fixture('flat')
    goal = next(o for o in data['objects'] if o['type'] == 'goal')
    goal['y'] = 0
    result = check_playability(data)
    assert result['status'] == 'unreachable'
    assert 'highest possible' in result['reason']


def test_bounds_and_jump():
    level = fixture('flat')
    state = State(50, 430)
    state, _ = advance(level, state, 0, False)
    assert state.grounded
    rising, _ = advance(level, state, 0, True)
    assert rising.y < state.y and rising.vy == -345
    again, _ = advance(level, rising, 0, True)
    assert again.vy == -330
    assert max_jump_rise() == 69
    assert check_playability(level, max_states=1)['status'] == 'unknown'


def test_edge_grace_and_jump_buffer_match_shared_settings():
    level = fixture('flat')
    edge = State(50, 400, 0, False, False, P['coyote_ticks'])
    rising, _ = advance(level, edge, 1, True)
    assert rising.vy == -345
    buffered = State(50, 430, 0, True, True, 0, 3)
    rising, _ = advance(level, buffered, 1, True)
    assert rising.vy == -345


def test_timing_and_geometry_advice_are_separate_from_reachability():
    result = check_playability(fixture('one-jump'))
    assert result['status'] == 'reachable'
    assert result['difficulty']['source'] == 'python_approximation'
    assert result['difficulty']['tested_offset_frames'] == 3
    assert not result['verified_in_game']
    gap = check_playability(fixture('wide-gap'), max_states=100)
    assert gap['status'] == 'unknown'
    assert any('gap' in text and 'platform' in text for text in gap['suggestions'])
