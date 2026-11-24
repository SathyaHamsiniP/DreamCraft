"""Build a level from real predictions, with bounded and visible repairs."""
from copy import deepcopy

import cv2
import numpy as np
from PIL import ImageOps

from contracts import PHYSICS as P, overlaps, validate_level
from ml import CLASSES
from playability.validator import check_playability
from .detection import crop, detect
from .inference import classify_candidates, valid_prediction
from .levels import geometry_level
from .model_service import local_predictor

MAX_OBJECTS = 64


def shape_problem(image, box, label):
    """Independent image checks can reject a confident but implausible label."""
    gray = np.array(crop(image, box).convert('L'))
    _, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = [c for c in contours if cv2.contourArea(c) > max(6, mask.size * .005)]
    if len(contours) != 1:
        return 'This region may contain fragments or more than one drawing.'
    contour = contours[0]
    x, y, w, h = cv2.boundingRect(contour)
    if min(w, h) < 8:
        return 'This drawing is too small to recognize safely.'
    perimeter = cv2.arcLength(contour, True)
    vertices = len(cv2.approxPolyDP(contour, min(.035 * perimeter, .15 * min(w, h)), True))
    ratio = w / h
    if label == 'platform' and (ratio < 1.5 or vertices != 4):
        return 'This does not look like one horizontal platform rectangle.'
    if label == 'coin' and (not .6 <= ratio <= 1.65 or vertices < 5 or 4*np.pi*cv2.contourArea(contour)/max(1, perimeter**2) < .5):
        return 'This does not look like one circle.'
    if label == 'spike' and (vertices != 3 or not .4 <= ratio <= 2):
        return 'This does not look like one triangle.'
    return None


def assess(level):
    return check_playability(level, max_states=12000, max_seconds=1.5, max_ticks=1200)


def repair_level(level, allow_repairs=True):
    """Keep terrain fixed, fit supported hazards and try one short bridge."""
    original = deepcopy(level)
    working = deepcopy(level)
    changes, attempts = [], []
    if allow_repairs:
        for obj in working['objects']:
            if obj['type'] not in ('spawn', 'goal'):
                continue
            supports = [p for p in working['objects'] if p['type'] == 'platform'
                        and p['x'] <= obj['x'] and obj['x'] + obj['width'] <= p['x'] + p['width']
                        and abs(p['y'] - obj['y'] - obj['height']) <= 18]
            if len(supports) == 1:
                before = deepcopy(obj)
                obj['y'] = supports[0]['y'] - obj['height']
                if obj != before:
                    try:
                        validate_level(working)
                        geometry_valid = True
                    except ValueError:
                        geometry_valid = False
                    changes.append({'kind': 'align_to_platform', 'reason': 'Place the symbol base on its nearby platform.',
                                    'before': before, 'after': deepcopy(obj), 'geometry_valid_after': geometry_valid})
    try:
        validate_level(working)
    except ValueError as exc:
        return {'original_level': original, 'level': None, 'changes': changes, 'attempts': attempts,
                'assessment': None, 'problem': str(exc)}
    if allow_repairs:
        from .hazards import fit_hazards
        working, hazard_changes = fit_hazards(working)
        changes.extend(hazard_changes)
    result = assess(working)
    attempts.append({'change': 'initial_geometry', 'status': result['status']})
    if allow_repairs and result['status'] != 'reachable':
        platforms = sorted((o for o in working['objects'] if o['type'] == 'platform'), key=lambda p: p['x'])
        from playability.validator import max_jump_rise
        gaps = [(a, b) for a, b in zip(platforms, platforms[1:])
                if 80 < b['x'] - a['x'] - a['width'] <= 240
                and abs(a['y'] - b['y']) <= max_jump_rise()*.6]
        # Keep a strict edit budget. A long or crowded course needs a human decision.
        if 1 <= len(gaps) <= 2:
            trial = deepcopy(working)
            proposed = []
            for index, (a, b) in enumerate(gaps):
                gap = b['x'] - a['x'] - a['width']
                bridge = {'id': 'auto_bridge' if index == 0 else f'auto_bridge_{index}', 'type': 'platform',
                          'x': a['x'] + a['width'] + (gap-48)/2, 'y': (a['y']+b['y'])/2, 'width': 48, 'height': 12}
                if any(o['id'] == bridge['id'] or overlaps(bridge, o) for o in trial['objects']):
                    continue
                trial['objects'].append(bridge)
                try:
                    validate_level(trial)
                    checked = assess(trial)
                    attempts.append({'change': 'short_bridge', 'status': checked['status']})
                    proposed.append({'kind': 'add_bridge', 'reason': 'Add one small step across this gap.', 'before': None, 'after': bridge})
                    if checked['status'] == 'reachable':
                        working, result = trial, checked
                        changes.extend(proposed)
                        break
                except ValueError:
                    trial['objects'].pop()
                    attempts.append({'change': 'short_bridge', 'status': 'invalid_geometry'})
    return {'original_level': original, 'level': working, 'changes': changes, 'attempts': attempts,
            'assessment': result, 'problem': None}


def generate(image, corrections=None, allow_repairs=True):
    corrections = corrections or {}
    boxes = detect(image, separate_attached=True)
    base = {'image': {'width': image.width, 'height': image.height, 'coordinates': 'exif_oriented_pixels'},
            'status': 'needs_correction', 'model_status': 'not_run', 'candidates': [], 'issues': [],
            'level': None, 'original_level': None, 'assessment': None, 'changes': [], 'attempts': [],
            'stages': ['detection'], 'warnings': ['CNN scores do not guarantee correct recognition. Check the interpretation against your drawing.']}
    def stop(message):
        base['issues'].append({'id': None, 'message': message})
        return base
    if not boxes:
        return stop('No drawings were found. Use dark, separate symbols on white paper, or try Advanced Edit.')
    if len(boxes) > MAX_OBJECTS:
        return stop('Too many regions were found. Use a clearer image with fewer than 65 separate symbols.')
    if set(corrections) - {b['id'] for b in boxes} or any(v not in (*CLASSES, 'ignore') for v in corrections.values()):
        raise ValueError('Corrections must refer to detected objects and supported labels')
    predictor, threshold, status = local_predictor()
    base['model_status'] = status
    if predictor is None:
        base['candidates'] = [dict(b, review_required=True) for b in boxes]
        return stop('The local CNN checkpoint is missing or could not load. Configure DREAMCRAFT_CHECKPOINT on the backend, or use Advanced Edit.')
    classified = classify_candidates(image, boxes, predictor=predictor, review_threshold=max(.9, threshold))
    base.update(candidates=classified['candidates'], model_status=classified['model_status'])
    base['stages'].append('recognition')
    objects = []
    for item in base['candidates']:
        correction = corrections.get(item['id'])
        if correction == 'ignore':
            item['ignored_by_user'] = True
            item['review_required'] = False
            continue
        label = correction or item.get('predicted_class')
        problems = []
        if not correction:
            if item.get('prediction_status') != 'predicted' or item.get('low_confidence'):
                problems.append('The CNN is not confident enough about this drawing.')
            else:
                scores = sorted(item['scores'].values(), reverse=True)
                if scores[0]-scores[1] < .2:
                    problems.append('Two possible labels have similar scores.')
                try:
                    # A small white margin tests whether the prediction depends on crop edges.
                    second = predictor(ImageOps.expand(crop(image, item), border=2, fill='white'))
                    if not valid_prediction(second) or second['predicted_class'] != label or second['confidence'] < max(.9, threshold):
                        problems.append('The prediction changes when the crop margin changes.')
                except Exception:
                    problems.append('The CNN could not check this crop again.')
                problem = shape_problem(image, item, label)
                if problem:
                    problems.append(problem)
        item['chosen_type'] = label
        item['label_source'] = 'user' if correction else 'cnn'
        item['needs_correction'] = bool(problems)
        item['review_required'] = bool(problems)
        base['issues'].extend({'id': item['id'], 'message': p} for p in problems)
        if label:
            objects.append({k: item[k] for k in ('id', 'x', 'y', 'width', 'height')} | {'type': label})
    for kind in ('spawn', 'goal'):
        count = sum(o['type'] == kind for o in objects)
        if count > 1:
            for item in base['candidates']:
                if item.get('chosen_type') == kind and not item.get('ignored_by_user'):
                    item['needs_correction'] = True
                    item['review_required'] = True
        if count != 1:
            base['issues'].append({'id': None, 'message': f'Exactly one {kind} is needed. No missing symbols are added automatically.'})
    if base['issues']:
        return base
    # Keep the image aspect ratio and use one shared coordinate conversion.
    scale = min(960/image.width, 720/image.height)
    world_width, world_height = max(64, round(image.width*scale)), max(64, round(image.height*scale))
    interpreted = geometry_level(image.width, image.height, objects, world_width, world_height, validate=False)
    base['stages'].append('geometry')
    plan = repair_level(interpreted, allow_repairs)
    base.update(plan)
    if plan['assessment'] is not None:
        base['stages'].append('playability')
    if plan['problem']:
        return stop(plan['problem'])
    if plan['assessment']['status'] != 'reachable':
        return stop('A reliable route could not be found within the repair limits. Try Advanced Edit or draw a shorter gap and lower steps.')
    base['status'] = 'awaiting_phaser'
    return base
