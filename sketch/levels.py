"""Convert reviewed labels to a draft that still passes the shared level rules."""
from contracts import PHYSICS, validate_level
from contracts.coordinates import image_to_world
from ml import CLASSES


def reviewed_level(image_width, image_height, objects, world_width, world_height):
    if any(o.get('type') not in CLASSES or o.get('reviewed') is not True for o in objects):
        raise ValueError('Every object needs a reviewed class label')
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
    return validate_level({'schema_version': '1.0', 'world': {'width': world_width, 'height': world_height}, 'objects': placed})
