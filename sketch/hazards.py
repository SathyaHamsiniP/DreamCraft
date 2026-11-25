"""Fit generated hazards to a single jump without changing shared physics."""
from copy import deepcopy
from contracts import OBJECT_SIZES, validate_level

MAX_FITS = 8


def fit_hazards(level):
    working = deepcopy(level)
    changes = []
    height_limit = OBJECT_SIZES['spike']['height']
    width_limit = OBJECT_SIZES['spike']['width']
    for hazard in (o for o in working['objects'] if o['type'] == 'spike'):
        if len(changes) >= MAX_FITS:
            break
        before = deepcopy(hazard)
        cx, base = hazard['x']+hazard['width']/2, hazard['y']+hazard['height']
        supports = [p for p in working['objects'] if p['type'] == 'platform'
                    and p['x'] <= cx-width_limit/2
                    and cx+width_limit/2 <= p['x']+p['width'] and abs(p['y']-base) <= 18]
        if len(supports) != 1:
            continue
        hazard['width'] = width_limit
        hazard['height'] = height_limit
        hazard['x'] = cx-hazard['width']/2
        hazard['y'] = supports[0]['y']-hazard['height']
        if hazard != before:
            try:
                validate_level(working)
            except ValueError:
                hazard.update(before)
                continue
            changes.append({'kind': 'fit_hazard', 'reason': 'Seat this obstacle on its nearby platform.',
                            'before': before, 'after': deepcopy(hazard), 'geometry_valid_after': True})
    return working, changes
