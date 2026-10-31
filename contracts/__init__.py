"""Shared level rules for the API and checker."""
import json
import math
from pathlib import Path

from jsonschema import Draft7Validator

ROOT = Path(__file__).parent
PHYSICS = json.loads((ROOT / 'physics.json').read_text())
SCHEMA = json.loads((ROOT / 'level.schema.json').read_text())
_VALIDATOR = Draft7Validator(SCHEMA)


def overlaps(a, b):
    """Edges touching do not count as an overlap."""
    return (a['x'] < b['x'] + b['width'] and a['x'] + a['width'] > b['x']
            and a['y'] < b['y'] + b['height'] and a['y'] + a['height'] > b['y'])


def validate_level(level):
    """Check the shared schema and geometry. Return the unchanged document."""
    def finite(value):
        if isinstance(value, float) and not math.isfinite(value):
            raise ValueError('Level numbers must be finite')
        if isinstance(value, dict):
            for item in value.values():
                finite(item)
        if isinstance(value, list):
            for item in value:
                finite(item)
    finite(level)
    error = next(_VALIDATOR.iter_errors(level), None)
    if error:
        raise ValueError('Level does not match schema 1.0: ' + error.message)
    objects = level['objects']
    if len({o['id'] for o in objects}) != len(objects):
        raise ValueError('Object IDs must be unique')
    for kind in ('spawn', 'goal'):
        if sum(o['type'] == kind for o in objects) != 1:
            raise ValueError(f'Level needs exactly one {kind}')
    for o in objects:
        if o['x'] + o['width'] > level['world']['width'] or o['y'] + o['height'] > level['world']['height']:
            raise ValueError('Objects must stay inside the world')
    spawn = next(o for o in objects if o['type'] == 'spawn')
    if spawn['width'] != PHYSICS['player_width'] or spawn['height'] != PHYSICS['player_height']:
        raise ValueError('Spawn dimensions must match the player dimensions')
    platforms = [o for o in objects if o['type'] == 'platform']
    for i, platform in enumerate(platforms):
        if any(overlaps(platform, other) for other in platforms[i + 1:]):
            raise ValueError('Solid platforms must not overlap')
    if any(overlaps(spawn, o) for o in objects if o['type'] in ('platform', 'spike', 'goal')):
        raise ValueError('Spawn must not overlap a platform, spike or goal')
    goal = next(o for o in objects if o['type'] == 'goal')
    if any(overlaps(goal, p) for p in platforms):
        raise ValueError('Goal must not overlap a solid platform')
    return level
