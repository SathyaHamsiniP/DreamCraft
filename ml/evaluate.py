"""Evaluate the held-out split recorded in a training checkpoint."""
import argparse
import json
from pathlib import Path

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import torch
from sklearn.metrics import accuracy_score, classification_report, ConfusionMatrixDisplay, confusion_matrix
from torch.utils.data import DataLoader

from . import CLASSES
from .dataset import SymbolDataset, load_samples, resolve_test_samples
from .runtime import load_checkpoint, select_device


def evaluate(checkpoint, data=None, output='ml/runs/evaluation', device='cpu'):
    device = select_device(device)
    model, saved = load_checkpoint(checkpoint, device)
    samples = load_samples(data or saved['config']['data'])
    test_samples = resolve_test_samples(samples, saved)
    loader = DataLoader(SymbolDataset(test_samples, saved['config']['preprocessing']), batch_size=64)
    truth, predictions = [], []
    with torch.inference_mode():
        for images, labels in loader:
            predictions.extend(model(images.to(device)).argmax(1).cpu().tolist())
            truth.extend(labels.tolist())
    matrix = confusion_matrix(truth, predictions, labels=list(range(5)))
    metrics = {'accuracy': accuracy_score(truth, predictions), 'report': classification_report(truth, predictions, labels=list(range(5)), target_names=CLASSES, output_dict=True, zero_division=0), 'confusion_matrix': matrix.tolist(), 'samples': len(truth)}
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    (output / 'metrics.json').write_text(json.dumps(metrics, indent=2))
    ConfusionMatrixDisplay(matrix, display_labels=CLASSES).plot(xticks_rotation=45)
    plt.tight_layout()
    plt.savefig(output / 'confusion_matrix.png')
    plt.close()
    return metrics


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('checkpoint')
    parser.add_argument('--data')
    parser.add_argument('--output', default='ml/runs/evaluation')
    parser.add_argument('--device', default='cpu')
    args = parser.parse_args()
    try:
        print(json.dumps(evaluate(**vars(args)), indent=2))
    except (ValueError, OSError, KeyError) as exc:
        parser.exit(2, f"Evaluation error: {exc}\n")


if __name__ == '__main__':
    main()
