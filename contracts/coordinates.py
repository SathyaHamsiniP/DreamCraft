"""Place image bounding boxes into a world without stretching the image."""
import math


def image_to_world(image_width, image_height, boxes, world_width, world_height):
    dimensions = (image_width, image_height, world_width, world_height)
    if any(isinstance(n, bool) or not isinstance(n, (int, float)) or not math.isfinite(n) or n <= 0 for n in dimensions):
        raise ValueError('Image and world dimensions must be positive finite numbers')
    scale = min(world_width / image_width, world_height / image_height)
    if scale <= 0 or not math.isfinite(scale):
        raise ValueError('Image scale is outside the supported numeric range')
    padding_x = max(0, (world_width - image_width * scale) / 2)
    padding_y = max(0, (world_height - image_height * scale) / 2)
    result = []
    for box in boxes:
        try:
            x, y, w, h = (box[k] for k in ('x', 'y', 'width', 'height'))
        except (KeyError, TypeError) as exc:
            raise ValueError('Each box needs x, y, width and height') from exc
        if any(isinstance(n, bool) or not isinstance(n, (int, float)) or not math.isfinite(n) for n in (x, y, w, h)) or x < 0 or y < 0 or w <= 0 or h <= 0 or x + w > image_width or y + h > image_height:
            raise ValueError('Bounding boxes must be finite and inside the image')
        left = min(world_width, padding_x + x * scale)
        top = min(world_height, padding_y + y * scale)
        # Floating-point rounding must not put a right/bottom edge outside.
        width = min(w * scale, world_width - left)
        height = min(h * scale, world_height - top)
        if width <= 0 or height <= 0:
            raise ValueError('Converted box is outside the supported numeric range')
        result.append({**box, 'x': left, 'y': top, 'width': width, 'height': height})
    return {'objects': result, 'scale': scale, 'padding': {'x': padding_x, 'y': padding_y}}
