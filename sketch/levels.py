"""Convert reviewed labels to a draft that still passes the shared level rules."""
from copy import deepcopy

from contracts import OBJECT_SIZES, PHYSICS, validate_level
from contracts.coordinates import image_to_world
from ml import CLASSES


def reviewed_level(image_width, image_height, objects, world_width, world_height):
    if any(o.get('type') not in CLASSES or o.get('reviewed') is not True for o in objects):
        raise ValueError('Every object needs a reviewed class label')
    return geometry_level(image_width, image_height, objects, world_width, world_height)


def fixed_object_sizes(level):
    """Keep coin centres and spike bases while using the standard game sizes."""
    working = deepcopy(level)
    changes = []
    for obj in working['objects']:
        size = OBJECT_SIZES.get(obj['type'])
        if size is None:
            continue
        before = deepcopy(obj)
        obj['x'] += (obj['width'] - size['width']) / 2
        obj['y'] += (obj['height'] - size['height']) / (2 if obj['type'] == 'coin' else 1)
        obj.update(size)
        if obj != before:
            changes.append({'kind': 'standard_size',
                            'reason': 'Use the same coin size in every generated game.' if obj['type'] == 'coin'
                            else 'Use the standard obstacle size that can be cleared with one jump.',
                            'before': before, 'after': deepcopy(obj)})
    return working, changes


def geometry_level(image_width, image_height, objects, world_width, world_height, validate=True, standard_sizes=True):
    """Convert geometry without claiming that CNN labels were reviewed by a person."""
    converted = image_to_world(image_width, image_height, objects, world_width, world_height)
    placed = []
    for box in converted['objects']:
        obj = {k: box[k] for k in ('id', 'type', 'x', 'y', 'width', 'height')}
        if obj['type'] == 'spawn':
            # Anchor the player at the symbol's bottom centre, without clamping.
            obj['x'] += (obj['width'] - PHYSICS['player_width']) / 2
            obj['y'] += obj['height'] - PHYSICS['player_height']
            obj['width'], obj['height'] = PHYSICS['player_width'], PHYSICS['player_height']
        placed.append(obj)
    level = {'schema_version': '1.0', 'world': {'width': world_width, 'height': world_height}, 'objects': placed}
    if standard_sizes:
        level, _ = fixed_object_sizes(level)
    return validate_level(level) if validate else level
