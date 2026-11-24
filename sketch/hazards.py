"""Fit generated hazards to a single jump without changing shared physics."""
from copy import deepcopy
from contracts import PHYSICS as P, validate_level
from playability.validator import max_jump_rise

MAX_FITS = 8


def fit_hazards(level):
    working = deepcopy(level)
    changes = []
    # Leave room for late input, not just a theoretical jump at its apex.
    height_limit = min(P['player_height']*.8, max_jump_rise()*.4)
    width_limit = P['player_width']*2.4
    for hazard in (o for o in working['objects'] if o['type'] == 'spike'):
        if len(changes) >= MAX_FITS:
            break
        before = deepcopy(hazard)
        cx, base = hazard['x']+hazard['width']/2, hazard['y']+hazard['height']
        supports = [p for p in working['objects'] if p['type'] == 'platform'
                    and p['x'] <= cx-min(hazard['width'],width_limit)/2
                    and cx+min(hazard['width'],width_limit)/2 <= p['x']+p['width'] and abs(p['y']-base) <= 18]
        if len(supports) != 1:
            continue
        hazard['width'] = min(hazard['width'], width_limit)
        hazard['height'] = min(hazard['height'], height_limit)
        hazard['x'] = cx-hazard['width']/2
        hazard['y'] = supports[0]['y']-hazard['height']
        if hazard != before:
            try:
                validate_level(working)
            except ValueError:
                hazard.update(before)
                continue
            changes.append({'kind': 'fit_hazard', 'reason': 'Fit this hazard to a single-jump size and seat it on its platform.',
                            'before': before, 'after': deepcopy(hazard), 'geometry_valid_after': True})
    return working, changes
