"""Configurable compact CNN with resolution-independent pooling."""
import torch.nn as nn


class SymbolCNN(nn.Module):
    def __init__(self, channels=(16, 32, 64), hidden=64, dropout=.2):
        super().__init__()
        if not channels or len(channels) > 5 or any(c < 1 for c in channels) or hidden < 1 or not 0 <= dropout < 1:
            raise ValueError("Use 1–5 positive channel sizes, positive hidden size, and dropout in [0,1)")
        layers, previous = [], 1
        for channel in channels:
            layers.extend([nn.Conv2d(previous, channel, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2)])
            previous = channel
        self.features = nn.Sequential(*layers, nn.AdaptiveAvgPool2d((2, 2)))
        self.classifier = nn.Sequential(nn.Flatten(), nn.Linear(previous * 4, hidden), nn.ReLU(), nn.Dropout(dropout), nn.Linear(hidden, 5))

    def forward(self, x):
        return self.classifier(self.features(x))
