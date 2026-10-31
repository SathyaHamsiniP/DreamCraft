"""Keep development fixtures separate from future drawing recognition."""
import json
from typing import Protocol

from PIL import Image

from contracts import ROOT, validate_level

FIXTURES = ('flat', 'one-jump', 'multi-jump', 'coins', 'spikes')


class RecognitionUnavailable(Exception):
    pass


class Recognizer(Protocol):
    def recognize(self, image: Image.Image, fixture: str) -> dict: ...


class MockRecognizer:
    def recognize(self, image, fixture='flat'):
        if fixture not in FIXTURES:
            raise ValueError('Unknown mock fixture')
        level = json.loads((ROOT / 'examples' / f'{fixture}.json').read_text())
        level['recognition'] = {'mode': 'mock', 'fixture': fixture, 'image_analyzed': False}
        return validate_level(level)


class RealRecognizer:
    def recognize(self, image, fixture='flat'):
        raise RecognitionUnavailable('Real recognition needs an object detector and a trained CNN checkpoint. Neither is connected yet.')
