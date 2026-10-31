"""Classify a single cropped symbol using checkpoint preprocessing."""
import argparse
import json

import torch

from . import CLASSES
from .preprocess import preprocess
from .runtime import load_checkpoint, select_device


def predict(checkpoint, image, device='cpu'):
    device = select_device(device)
    model, saved = load_checkpoint(checkpoint, device)
    tensor = preprocess(image, **saved['config']['preprocessing']).unsqueeze(0).to(device)
    with torch.inference_mode():
        scores = model(tensor).softmax(1)[0].cpu().tolist()
    index = max(range(len(scores)), key=scores.__getitem__)
    return {'predicted_class': CLASSES[index], 'confidence': scores[index], 'scores': dict(zip(CLASSES, scores))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('checkpoint')
    parser.add_argument('image')
    parser.add_argument('--device', default='cpu')
    args = parser.parse_args()
    try:
        print(json.dumps(predict(**vars(args)), indent=2))
    except (ValueError, OSError, KeyError) as exc:
        parser.exit(2, f"Prediction error: {exc}\n")


if __name__ == '__main__':
    main()
