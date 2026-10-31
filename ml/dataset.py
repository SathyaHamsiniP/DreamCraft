"""Validated image manifests and leakage-safe group splits."""
import csv
import hashlib
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from sklearn.model_selection import GroupShuffleSplit
from torch.utils.data import Dataset

from . import CLASSES
from .preprocess import preprocess


@dataclass(frozen=True)
class Sample:
    path: Path
    label: int
    sheet_id: str
    contributor_id: str = ""
    split: str = ""


def load_samples(source):
    """CSV paths are relative to CSV; folder layout is class/sheet_id/image.*."""
    source = Path(source).resolve()
    if not source.exists():
        raise ValueError(f"Dataset does not exist: {source}")
    rows = []
    if source.is_file() and source.suffix.lower() == ".csv":
        with source.open(newline="") as handle:
            reader = csv.DictReader(handle)
            if not {"path", "label", "sheet_id"} <= set(reader.fieldnames or []):
                raise ValueError("CSV requires path,label,sheet_id columns")
            for row in reader:
                if any(row.get(key) is None for key in ('path', 'label', 'sheet_id')):
                    raise ValueError('CSV row is missing required values')
                rows.append((source.parent / row['path'], row['label'], row['sheet_id'], row.get('contributor_id', ''), row.get('split', '')))
    elif source.is_dir():
        for path in sorted(source.rglob('*')):
            if path.suffix.lower() in {'.png', '.jpg', '.jpeg', '.bmp', '.webp'}:
                relative = path.relative_to(source)
                if len(relative.parts) < 3:
                    raise ValueError("Folder images require class/sheet_id/image layout; use CSV for grouping metadata")
                rows.append((path, relative.parts[0], relative.parts[1], '', ''))
    else:
        raise ValueError("Dataset must be an image folder or CSV metadata file")
    if not rows:
        raise ValueError("Dataset contains no labeled images")
    samples, seen = [], set()
    for path, label, sheet, contributor, split in rows:
        path = path.resolve()
        if label not in CLASSES or not sheet.strip() or split not in ('', 'train', 'val', 'test'):
            raise ValueError(f"Invalid label, sheet_id, or split for {path}")
        if not path.is_file() or path in seen:
            raise ValueError(f"Missing or duplicate image path: {path}")
        seen.add(path)
        preprocess(path)  # Fail before a potentially long training run.
        samples.append(Sample(path, CLASSES.index(label), sheet.strip(), contributor.strip(), split))
    if {s.label for s in samples} != set(range(5)):
        raise ValueError("Dataset must contain all five classes")
    return samples


def split_samples(samples, val_fraction=.2, test_fraction=.2, seed=42, group_by='sheet_id'):
    """Group-connected components also keep sheets, contributors and exact duplicates together."""
    if group_by not in ('sheet_id', 'contributor_id'):
        raise ValueError("group_by must be sheet_id or contributor_id")
    if not 0 < val_fraction < 1 or not 0 < test_fraction < 1 or val_fraction + test_fraction >= 1:
        raise ValueError("Validation and test fractions must be positive and sum to less than one")
    parent = list(range(len(samples)))

    def root(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    keys = {}
    for i, sample in enumerate(samples):
        if group_by == 'contributor_id' and not sample.contributor_id:
            raise ValueError("Contributor grouping requires contributor_id on every sample")
        fingerprint = hashlib.sha256(preprocess(sample.path).numpy().tobytes()).hexdigest()
        tags = [('sheet', sample.sheet_id), ('image', fingerprint)]
        if group_by == 'contributor_id':
            tags.append(('contributor', sample.contributor_id))
        for tag in tags:
            if tag in keys:
                parent[root(i)] = root(keys[tag])
            keys[tag] = i
    groups = np.array([root(i) for i in range(len(samples))])
    explicit = [s.split for s in samples]
    if any(explicit):
        if not all(explicit):
            raise ValueError("Explicit splits must be specified for every row")
        for group in set(groups):
            if len({samples[i].split for i in np.flatnonzero(groups == group)}) != 1:
                raise ValueError("Data leakage: a sheet, contributor, or duplicate spans explicit splits")
        result = {name: [s for s in samples if s.split == name] for name in ('train', 'val', 'test')}
    else:
        if len(set(groups)) < 3:
            raise ValueError("At least three independent groups are required for train/val/test")
        indices = np.arange(len(samples))
        try:
            remaining, test = next(GroupShuffleSplit(n_splits=1, test_size=test_fraction, random_state=seed).split(indices, groups=groups))
            train_local, val_local = next(GroupShuffleSplit(n_splits=1, test_size=val_fraction / (1 - test_fraction), random_state=seed).split(remaining, groups=groups[remaining]))
        except ValueError as exc:
            raise ValueError("Too few independent groups for requested split fractions") from exc
        result = {name: [samples[i] for i in subset] for name, subset in [('train', remaining[train_local]), ('val', remaining[val_local]), ('test', test)]}
    for name, subset in result.items():
        if {s.label for s in subset} != set(range(5)):
            raise ValueError(f"{name} split lacks one or more classes; add groups or supply explicit balanced splits")
    return result


class SymbolDataset(Dataset):
    def __init__(self, samples, preprocessing=None, augment=False):
        self.samples, self.preprocessing, self.augment = samples, preprocessing or {}, augment

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, index):
        sample = self.samples[index]
        return preprocess(sample.path, **self.preprocessing, augment=self.augment), sample.label
