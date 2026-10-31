"""Configuration, reproducibility and checkpoint utilities."""
import random
from pathlib import Path

import numpy as np
import torch
import yaml

from . import CLASSES
from .model import SymbolCNN


def load_config(path):
    with Path(path).open() as handle:
        config = yaml.safe_load(handle)
    if not isinstance(config, dict):
        raise ValueError("Configuration must be a YAML mapping")
    for key in ('seed', 'device', 'data', 'output', 'model', 'preprocessing', 'split', 'training'):
        if key not in config:
            raise ValueError(f"Missing configuration key: {key}")
    size = config['preprocessing'].get('size', 64)
    depth = len(config['model'].get('channels', [16, 32, 64]))
    if not isinstance(size, int) or size < max(8, 2 ** depth):
        raise ValueError("Image size is too small for the configured pooling depth")
    return config


def seed_everything(seed, threads=2):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)
    torch.set_num_threads(threads)
    torch.use_deterministic_algorithms(True)
    torch.backends.cudnn.benchmark = False


def select_device(name):
    if name == 'auto':
        name = 'cuda' if torch.cuda.is_available() else 'cpu'
    if name not in ('cpu', 'cuda'):
        raise ValueError("Device must be cpu, cuda, or auto")
    if name == 'cuda' and not torch.cuda.is_available():
        raise ValueError("CUDA requested but unavailable; select cpu or auto")
    return torch.device(name)


def load_checkpoint(path, device='cpu'):
    if not Path(path).is_file():
        raise ValueError(f"Checkpoint does not exist: {path}")
    checkpoint = torch.load(path, map_location=device, weights_only=True)
    if checkpoint.get('classes') != list(CLASSES):
        raise ValueError("Checkpoint class mapping does not match DreamCraft")
    model = SymbolCNN(**checkpoint['config']['model']).to(device)
    model.load_state_dict(checkpoint['model_state'])
    model.eval()
    return model, checkpoint
