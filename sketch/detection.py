"""Find possible ink regions. These boxes are suggestions, not class labels."""
import io
import math
import warnings
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageOps

MAX_BYTES = 5 * 1024 * 1024
MAX_PIXELS = 12_000_000


def load_image(source):
    data = source if isinstance(source, bytes) else Path(source).read_bytes()
    if len(data) > MAX_BYTES:
        raise ValueError('Image must be at most 5 MiB')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(io.BytesIO(data)) as image:
                if image.format not in ('PNG', 'JPEG'):
                    raise ValueError('Only PNG and JPEG images are supported')
                if max(image.size) > 4096 or image.width * image.height > MAX_PIXELS:
                    raise ValueError('Image dimensions exceed the limit')
                image.verify()
            with Image.open(io.BytesIO(data)) as image:
                oriented = ImageOps.exif_transpose(image).convert('RGBA')
                background = Image.new('RGBA', oriented.size, 'white')
                return Image.alpha_composite(background, oriented).convert('RGB')
    except (OSError, SyntaxError, Image.DecompressionBombWarning, Image.DecompressionBombError) as exc:
        raise ValueError('Image is damaged or cannot be read') from exc


def checked_box(image, box):
    try:
        values = [box[k] for k in ('x', 'y', 'width', 'height')]
    except (KeyError, TypeError) as exc:
        raise ValueError('Boxes need x, y, width and height') from exc
    if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) or int(v) != v for v in values):
        raise ValueError('Crop coordinates must be finite integers')
    x, y, w, h = map(int, values)
    if x < 0 or y < 0 or w <= 0 or h <= 0 or x + w > image.width or y + h > image.height:
        raise ValueError('Crop must stay inside the oriented image')
    return dict(zip(('x', 'y', 'width', 'height'), (x, y, w, h)))


def crop(image, box):
    b = checked_box(image, box)
    return image.crop((b['x'], b['y'], b['x'] + b['width'], b['y'] + b['height']))


def detect(image, method='adaptive', min_area_ratio=0.00008, max_side=1600, region=None):
    if method not in ('adaptive', 'otsu'):
        raise ValueError('Threshold method must be adaptive or otsu')
    if not 0 < min_area_ratio < .1 or not 128 <= max_side <= 4096:
        raise ValueError('Invalid detection settings')
    bounds = checked_box(image, region) if region is not None else dict(x=0, y=0, width=image.width, height=image.height)
    view = crop(image, bounds)
    scale = min(1, max_side / max(view.size))
    gray = np.array(view.convert('L').resize((max(1, round(view.width * scale)), max(1, round(view.height * scale)))))
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    if method == 'adaptive':
        mask = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 12)
    else:
        _, mask = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    # Close short gaps without joining distant symbols. Keep thin strokes intact.
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    boxes = []
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        ink = cv2.countNonZero(mask[y:y+h, x:x+w])
        if ink < max(8, mask.size * min_area_ratio) or min(w, h) < 3:
            continue
        left, top = max(0, math.floor(x / scale) - 3), max(0, math.floor(y / scale) - 3)
        right, bottom = min(view.width, math.ceil((x+w) / scale) + 3), min(view.height, math.ceil((y+h) / scale) + 3)
        boxes.append(dict(x=left + bounds['x'], y=top + bounds['y'], width=right-left, height=bottom-top))
    boxes.sort(key=lambda b: (b['y'], b['x']))
    return [dict(id=f'candidate_{i}', **b) for i, b in enumerate(boxes)]


def preview(image, boxes):
    output = image.copy()
    draw = ImageDraw.Draw(output)
    for i, box in enumerate(boxes):
        b = checked_box(image, box)
        x, y, w, h = (b[k] for k in ('x', 'y', 'width', 'height'))
        draw.rectangle((x, y, x+w-1, y+h-1), outline='red', width=2)
        draw.text((x, y), str(i+1), fill='red')
    return output
