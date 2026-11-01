"""Classify detected crops only when a real checkpoint is supplied."""
from pathlib import Path

from .detection import crop


def classify_candidates(image, boxes, checkpoint=None, review_threshold=.8):
    if not 0 <= review_threshold <= 1:
        raise ValueError('Review threshold must be between zero and one')
    if checkpoint is None or not Path(checkpoint).is_file():
        return {'model_status': 'unavailable', 'candidates': [dict(b, review_required=True) for b in boxes]}
    if not boxes:
        return {'model_status': 'not_run', 'candidates': []}
    from ml.predict import predict
    results = []
    for box in boxes:
        result = predict(checkpoint, crop(image, box))
        results.append(dict(box, **result, review_required=result['confidence'] < review_threshold))
    return {'model_status': 'ran', 'candidates': results}
