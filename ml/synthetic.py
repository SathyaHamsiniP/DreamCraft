"""Small artificial fixtures for plumbing checks, never a handwriting benchmark."""
import argparse
import csv
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

from . import CLASSES


def generate(output, sheets=15, seed=42):
    if sheets < 3:
        raise ValueError("Generate at least three sheets")
    output = Path(output)
    if output.exists() and any(output.iterdir()):
        raise ValueError("Synthetic output directory must be empty to avoid overwriting data")
    output.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(seed)
    rows = []
    for sheet in range(sheets):
        for label in CLASSES:
            image = np.full((80, 100), 255, dtype=np.uint8)
            x, y = int(rng.integers(8, 18)), int(rng.integers(8, 18))
            thickness = int(rng.integers(1, 4))
            if label == 'platform':
                cv2.rectangle(image, (x, y), (x + int(rng.integers(55, 75)), y + int(rng.integers(20, 38))), 0, thickness)
            elif label == 'coin':
                cv2.circle(image, (45 + x // 3, 35 + y // 3), int(rng.integers(18, 29)), 0, thickness)
            elif label == 'spike':
                cv2.polylines(image, [np.array([[x, 65], [45 + x // 2, y], [85, 65]])], True, 0, thickness)
            else:
                cv2.putText(image, 'S' if label == 'spawn' else 'G', (x + 8, 65), cv2.FONT_HERSHEY_SIMPLEX, float(rng.uniform(1.5, 2)), 0, thickness, cv2.LINE_AA)
            relative = Path(label) / f'sheet_{sheet:03d}' / 'symbol.png'
            (output / relative).parent.mkdir(parents=True, exist_ok=True)
            Image.fromarray(image).save(output / relative)
            rows.append({'path': str(relative), 'label': label, 'sheet_id': f'sheet_{sheet:03d}', 'contributor_id': f'writer_{sheet:03d}'})
    metadata = output / 'metadata.csv'
    with metadata.open('w', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=['path', 'label', 'sheet_id', 'contributor_id'])
        writer.writeheader()
        writer.writerows(rows)
    return metadata


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', default='ml/data/synthetic')
    parser.add_argument('--sheets', type=int, default=15)
    parser.add_argument('--seed', type=int, default=42)
    args = parser.parse_args()
    try:
        print(generate(**vars(args)))
    except (ValueError, OSError) as exc:
        parser.exit(2, f"Synthetic data error: {exc}\n")
