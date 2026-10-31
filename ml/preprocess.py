"""Shared training/inference preprocessing; white paper becomes zero background."""
from pathlib import Path

import cv2
import numpy as np
import torch
from PIL import Image, ImageOps


def preprocess(image, size=64, threshold=True, augment=False):
    """Accept a path, PIL image, or uint8 grayscale/RGB array; return [1,H,W]."""
    if not isinstance(size, int) or size < 8:
        raise ValueError("Image size must be an integer >= 8")
    try:
        if isinstance(image, (str, Path)):
            with Image.open(image) as source:
                gray = np.array(ImageOps.exif_transpose(source).convert("L"))
        elif isinstance(image, Image.Image):
            gray = np.array(ImageOps.exif_transpose(image).convert("L"))
        elif isinstance(image, np.ndarray):
            if image.dtype != np.uint8 or image.size == 0:
                raise ValueError("Arrays must be nonempty uint8 images")
            if image.ndim == 2:
                gray = image.copy()
            elif image.ndim == 3 and image.shape[2] in (3, 4):
                gray = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY if image.shape[2] == 3 else cv2.COLOR_RGBA2GRAY)
            else:
                raise ValueError("Expected grayscale, RGB or RGBA image")
        else:
            raise ValueError("Expected image path, PIL image, or uint8 array")
    except (OSError, SyntaxError) as exc:
        raise ValueError(f"Cannot read image {image}: {exc}") from exc
    if threshold:
        _, gray = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    h, w = gray.shape
    scale = (size - 4) / max(h, w)
    resized = cv2.resize(gray, (max(1, round(w * scale)), max(1, round(h * scale))), interpolation=cv2.INTER_AREA)
    canvas = np.full((size, size), 255, dtype=np.uint8)
    y, x = (size - resized.shape[0]) // 2, (size - resized.shape[1]) // 2
    canvas[y:y + resized.shape[0], x:x + resized.shape[1]] = resized
    if augment:
        matrix = cv2.getRotationMatrix2D((size / 2, size / 2), np.random.uniform(-12, 12), np.random.uniform(.9, 1.05))
        matrix[:, 2] += np.random.uniform(-2, 2, 2)
        canvas = cv2.warpAffine(canvas, matrix, (size, size), borderValue=255)
    return torch.from_numpy((1.0 - canvas.astype(np.float32) / 255.0)[None])
