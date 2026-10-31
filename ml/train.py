"""Train with validation loss early stopping; never optimize against the test split."""
import argparse
import json
from pathlib import Path

import torch
from torch.utils.data import DataLoader

from . import CLASSES
from .dataset import SymbolDataset, load_samples, split_samples, make_manifest
from .model import SymbolCNN
from .runtime import load_config, seed_everything, select_device


def run_epoch(model, loader, device, optimizer=None):
    training = optimizer is not None
    model.train(training)
    loss_sum, correct, count = 0., 0, 0
    with torch.set_grad_enabled(training):
        for images, targets in loader:
            images, targets = images.to(device), targets.to(device)
            if training:
                optimizer.zero_grad(set_to_none=True)
            logits = model(images)
            loss = torch.nn.functional.cross_entropy(logits, targets)
            if not torch.isfinite(loss):
                raise ValueError("Non-finite loss; check input data and learning rate")
            if training:
                loss.backward()
                optimizer.step()
            count += len(targets)
            loss_sum += loss.item() * len(targets)
            correct += (logits.argmax(1) == targets).sum().item()
    if not count:
        raise ValueError("Cannot run an empty data loader")
    return {'loss': loss_sum / count, 'accuracy': correct / count}


def train(config):
    settings = config['training']
    if any(settings[k] < 1 for k in ('epochs', 'batch_size', 'patience')) or settings['learning_rate'] <= 0 or settings['weight_decay'] < 0 or settings['min_delta'] < 0:
        raise ValueError("Invalid training hyperparameters")
    seed_everything(config['seed'], config.get('threads', 2))
    device = select_device(config['device'])
    splits = split_samples(load_samples(config['data']), seed=config['seed'], **config['split'])
    output = Path(config['output'])
    output.mkdir(parents=True, exist_ok=True)
    manifest = make_manifest(splits)
    (output / 'splits.json').write_text(json.dumps(manifest, indent=2))
    loaders = {name: DataLoader(SymbolDataset(subset, config['preprocessing'], augment=name == 'train' and settings['augment']), batch_size=settings['batch_size'], shuffle=name == 'train', num_workers=0) for name, subset in splits.items() if name != 'test'}
    model = SymbolCNN(**config['model']).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=settings['learning_rate'], weight_decay=settings['weight_decay'])
    history, best, stale = [], float('inf'), 0
    for epoch in range(1, settings['epochs'] + 1):
        row = {'epoch': epoch, 'train': run_epoch(model, loaders['train'], device, optimizer), 'val': run_epoch(model, loaders['val'], device)}
        history.append(row)
        print(json.dumps(row), flush=True)
        if row['val']['loss'] < best - settings['min_delta']:
            best, stale = row['val']['loss'], 0
            torch.save({'model_state': model.state_dict(), 'optimizer_state': optimizer.state_dict(), 'config': config, 'classes': list(CLASSES), 'epoch': epoch, 'val_loss': best, 'splits': manifest, 'manifest_version': 2}, output / 'best.pt')
        else:
            stale += 1
        if stale >= settings['patience']:
            break
    (output / 'history.json').write_text(json.dumps(history, indent=2))
    return output / 'best.pt'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', default='ml/config.yaml')
    parser.add_argument('--data')
    parser.add_argument('--output')
    parser.add_argument('--epochs', type=int)
    args = parser.parse_args()
    try:
        config = load_config(args.config)
        for key in ('data', 'output'):
            if getattr(args, key) is not None:
                config[key] = getattr(args, key)
        if args.epochs is not None:
            config['training']['epochs'] = args.epochs
        print(f"Best checkpoint: {train(config)}")
    except (ValueError, OSError, KeyError) as exc:
        parser.exit(2, f"Training error: {exc}\n")


if __name__ == '__main__':
    main()
