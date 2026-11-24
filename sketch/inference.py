"""Classify crops with real weights while keeping every object open for review."""
import math
from pathlib import Path

from ml import CLASSES
from .detection import crop


def valid_prediction(result):
    if not isinstance(result, dict) or result.get('predicted_class') not in CLASSES:
        return False
    scores = result.get('scores')
    confidence = result.get('confidence')
    if not isinstance(scores, dict) or set(scores) != set(CLASSES):
        return False
    values = [confidence, *scores.values()]
    if any(isinstance(n, bool) or not isinstance(n, (int, float)) or not math.isfinite(n) or not 0 <= n <= 1 for n in values):
        return False
    return (abs(sum(scores.values()) - 1) < 1e-4
            and abs(scores[result['predicted_class']] - confidence) < 1e-5
            and confidence >= max(scores.values()) - 1e-5)


def classify_candidates(image, boxes, checkpoint=None, review_threshold=.8, predictor=None):
    if not math.isfinite(review_threshold) or not 0 <= review_threshold <= 1:
        raise ValueError('Review threshold must be between zero and one')
    if predictor is None and (checkpoint is None or not Path(checkpoint).is_file()):
        return {'model_status': 'unavailable', 'candidates': [dict(b, review_required=True) for b in boxes]}
    if not boxes:
        return {'model_status': 'not_run', 'candidates': []}
    if predictor is None:
        from ml.predict import predict
        predictor = lambda sample: predict(checkpoint, sample)
    results = []
    for index, box in enumerate(boxes):
        if index >= 256:
            results.append(dict(box, review_required=True, prediction_status='not_run'))
            continue
        sample = crop(image, box)
        try:
            prediction = predictor(sample)
            if not valid_prediction(prediction):
                raise ValueError('Invalid model output')
        except Exception:
            results.append(dict(box, review_required=True, prediction_status='invalid'))
            continue
        safe = {key: prediction[key] for key in ('predicted_class', 'confidence', 'scores')}
        results.append(dict(box, **safe, review_required=True,
                            low_confidence=prediction['confidence'] < review_threshold,
                            prediction_status='predicted'))
    return {'model_status': 'ran', 'candidates': results}
