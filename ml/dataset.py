"""Validated image manifests and leakage-safe group splits."""
import csv
import hashlib
from dataclasses import dataclass
from pathlib import Path

import numpy as np
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
    image_id: str = ""


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
                rows.append((source.parent / row['path'], row['label'], row['sheet_id'], (row.get('contributor_id') or ''), (row.get('split') or '')))
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
    base = source.parent if source.is_file() else source
    samples, seen = [], set()
    for path, label, sheet, contributor, split in rows:
        path = path.resolve()
        if label not in CLASSES or not sheet.strip() or split not in ('', 'train', 'val', 'test'):
            raise ValueError(f"Invalid label, sheet_id, or split for {path}")
        if not path.is_file() or path in seen:
            raise ValueError(f"Missing or duplicate image path: {path}")
        try:
            image_id = path.relative_to(base).as_posix()
        except ValueError as exc:
            raise ValueError(f"Image must be inside the dataset directory: {path}") from exc
        seen.add(path)
        preprocess(path)  # Fail before a potentially long training run.
        samples.append(Sample(path, CLASSES.index(label), sheet.strip(), contributor.strip(), split, image_id))
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
        result = _automatic_split(samples, groups, val_fraction, test_fraction, seed)
    for name, subset in result.items():
        if {s.label for s in subset} != set(range(5)):
            raise ValueError(f"{name} split lacks one or more classes; add groups or supply explicit balanced splits")
    return result


def _automatic_split(samples, groups, val_fraction, test_fraction, seed):
    """Find class coverage exactly, then fill remaining groups toward target sizes.

    Only 5 class bits per split are needed. Groups with the same class mask are
    interchangeable for coverage, and at most three of each mask are needed.
    This avoids relying on lucky random splits for single-class sheets.
    """
    rng = np.random.default_rng(seed)
    members = [np.flatnonzero(groups == group) for group in sorted(set(groups))]
    rng.shuffle(members)
    counts = np.array([np.bincount([samples[i].label for i in subset], minlength=5) for subset in members])
    masks = [sum(1 << label for label in np.flatnonzero(row)) for row in counts]
    for label, name in enumerate(CLASSES):
        available = sum(bool(mask & (1 << label)) for mask in masks)
        if available < 3:
            raise ValueError(f"Cannot split class '{name}': only {available} independent groups remain after sheet, contributor and duplicate grouping; at least 3 are needed")
    # A state contains the class coverage of train, val and test in 15 bits.
    states = {0: ()}
    used_masks = {}
    complete = (1 << 15) - 1
    for group, mask in enumerate(masks):
        used_masks[mask] = used_masks.get(mask, 0) + 1
        if used_masks[mask] > 3:
            continue
        additions = {}
        for state, assignment in states.items():
            for split in range(3):
                updated = state | (mask << (5 * split))
                if updated != state and updated not in states and updated not in additions:
                    additions[updated] = assignment + ((group, split),)
        states.update(additions)
        if complete in states:
            break
    if complete not in states:
        raise ValueError("No valid train/val/test assignment can cover every class without breaking sheet, contributor or duplicate groups; collect more independent groups or review grouping metadata")
    assignment = dict(states[complete])
    totals = np.zeros((3, 5), dtype=float)
    for group, split in assignment.items():
        totals[split] += counts[group]
    fractions = np.array([1 - val_fraction - test_fraction, val_fraction, test_fraction])
    targets = fractions[:, None] * counts.sum(axis=0)
    # Prefer larger groups first; seeded order breaks ties reproducibly.
    for group in sorted(range(len(members)), key=lambda i: -len(members[i])):
        if group in assignment:
            continue
        costs = []
        for split in range(3):
            candidate = totals.copy()
            candidate[split] += counts[group]
            costs.append(np.sum((candidate - targets) ** 2 / np.maximum(targets, 1)))
        split = int(np.argmin(costs))
        assignment[group] = split
        totals[split] += counts[group]
    names = ('train', 'val', 'test')
    return {name: [samples[i] for group, subset in enumerate(members) if assignment[group] == split for i in subset] for split, name in enumerate(names)}


def make_manifest(splits):
    """Store portable paths, labels and byte hashes, rather than machine paths."""
    return {name: [{'path': sample.image_id, 'label': CLASSES[sample.label],
                    'sha256': hashlib.sha256(sample.path.read_bytes()).hexdigest()}
                   for sample in subset] for name, subset in splits.items()}


def resolve_test_samples(samples, saved):
    if saved.get('manifest_version') != 2:
        raise ValueError("Checkpoint has a legacy absolute-path manifest; retrain to create a portable, integrity-checked checkpoint")
    by_id = {sample.image_id: sample for sample in samples}
    entries = saved['splits']['test']
    if not entries:
        raise ValueError("Checkpoint contains no held-out test samples")
    selected, seen = [], set()
    for entry in entries:
        image_id = entry['path']
        if image_id in seen or image_id not in by_id:
            raise ValueError(f"Missing or duplicate held-out image identifier: {image_id}")
        seen.add(image_id)
        sample = by_id[image_id]
        if CLASSES[sample.label] != entry['label']:
            raise ValueError(f"Label changed for held-out image: {image_id}")
        if hashlib.sha256(sample.path.read_bytes()).hexdigest() != entry['sha256']:
            raise ValueError(f"Image integrity check failed for held-out image: {image_id}")
        selected.append(sample)
    return selected


class SymbolDataset(Dataset):
    def __init__(self, samples, preprocessing=None, augment=False):
        self.samples, self.preprocessing, self.augment = samples, preprocessing or {}, augment

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, index):
        sample = self.samples[index]
        return preprocess(sample.path, **self.preprocessing, augment=self.augment), sample.label
