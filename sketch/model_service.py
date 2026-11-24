"""Load only the local checkpoint selected by the server operator."""
import math
import os
from functools import lru_cache
from pathlib import Path
from threading import Lock

_LOCK = Lock()


@lru_cache(maxsize=1)
def _load(path, modified, size):
    from ml.runtime import load_checkpoint
    return load_checkpoint(path, 'cpu')


def local_predictor():
    """Return a callable, threshold and safe status without exposing local paths."""
    configured = os.environ.get('DREAMCRAFT_CHECKPOINT', '').strip()
    try:
        threshold = float(os.environ.get('DREAMCRAFT_REVIEW_THRESHOLD', '0.8'))
        if not math.isfinite(threshold) or not 0 <= threshold <= 1:
            raise ValueError('Invalid review threshold')
    except ValueError:
        return None, .8, 'invalid_configuration'
    if not configured:
        return None, threshold, 'unavailable'
    try:
        path = Path(configured).expanduser().resolve(strict=True)
        info = path.stat()
        if not path.is_file() or path.suffix.lower() not in ('.pt', '.pth') or not 0 < info.st_size <= 200 * 1024 * 1024:
            raise ValueError('Invalid checkpoint file')
        # Serialize loading and prediction so concurrent uploads do not race the cache.
        with _LOCK:
            model, saved = _load(str(path), info.st_mtime_ns, info.st_size)
        def prediction(image):
            from ml.predict import predict_loaded
            with _LOCK:
                return predict_loaded(model, saved, image, 'cpu')
        return prediction, threshold, 'ready'
    except FileNotFoundError:
        return None, threshold, 'unavailable'
    except Exception:
        # A broken checkpoint must not prevent manual detection or leak its path.
        return None, threshold, 'error'
