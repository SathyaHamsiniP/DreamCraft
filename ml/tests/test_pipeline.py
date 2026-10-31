"""CPU tests with temporary artificial inputs; no real performance assertions."""
from dataclasses import replace

import numpy as np
import pytest
import torch

from ml import CLASSES
from ml.dataset import SymbolDataset, load_samples, split_samples
from ml.evaluate import evaluate
from ml.model import SymbolCNN
from ml.predict import predict
from ml.preprocess import preprocess
from ml.runtime import load_checkpoint, load_config, seed_everything
from ml.synthetic import generate
from ml.train import train


@pytest.fixture
def samples(tmp_path):
    return load_samples(generate(tmp_path / 'data'))


def test_preprocessing():
    image = np.full((20, 100, 3), 255, np.uint8)
    image[5:15, 10:90] = 0
    tensor = preprocess(image)
    assert tensor.shape == (1, 64, 64)
    assert tensor.dtype == torch.float32
    assert 0 <= tensor.min() <= tensor.max() <= 1
    assert not tensor[:, :20].any()  # Wide image preserves aspect ratio.
    seed_everything(7)
    first = preprocess(image, augment=True)
    seed_everything(7)
    assert torch.equal(first, preprocess(image, augment=True))
    assert preprocess(image, threshold=False).shape == tensor.shape


@pytest.mark.parametrize('image', [np.empty((0, 0), np.uint8), np.ones((3, 3)), np.zeros((3, 3, 2), np.uint8), 'missing.png', None])
def test_invalid_images(image):
    with pytest.raises(ValueError):
        preprocess(image)


def test_loading_and_splits(samples):
    assert len(samples) == 75
    folder = samples[0].path.parents[2]
    assert len(load_samples(folder)) == 75
    for group_by in ('sheet_id', 'contributor_id'):
        splits = split_samples(samples, group_by=group_by)
        sets = [{getattr(s, group_by) for s in subset} for subset in splits.values()]
        assert all(not sets[i] & sets[j] for i in range(3) for j in range(i))
        assert sum(map(len, splits.values())) == 75
        assert splits == split_samples(samples, group_by=group_by)
    tensor, label = SymbolDataset(samples)[0]
    assert tensor.shape == (1, 64, 64) and label in range(5)


def test_explicit_leakage_and_missing_groups(samples):
    with pytest.raises(ValueError, match='Contributor'):
        split_samples([replace(s, contributor_id='') for s in samples], group_by='contributor_id')
    with pytest.raises(ValueError, match='leakage'):
        split_samples([replace(s, split='test' if i == 0 else 'train') for i, s in enumerate(samples)])
    with pytest.raises(ValueError, match='every row'):
        split_samples([replace(samples[0], split='train'), *samples[1:]])
    with pytest.raises(ValueError, match='fractions'):
        split_samples(samples, val_fraction=.8, test_fraction=.8)


def test_duplicate_image_leakage(samples, tmp_path):
    duplicate = tmp_path / 'copy.png'
    duplicate.write_bytes(samples[0].path.read_bytes())
    explicit = [replace(s, split='train') for s in samples]
    explicit.append(replace(samples[0], path=duplicate, sheet_id='different', split='test'))
    with pytest.raises(ValueError, match='leakage'):
        split_samples(explicit)


def test_invalid_datasets(tmp_path):
    with pytest.raises(ValueError, match='does not exist'):
        load_samples(tmp_path / 'missing')
    with pytest.raises(ValueError, match='no labeled'):
        load_samples(tmp_path)
    metadata = tmp_path / 'bad.csv'
    metadata.write_text('path,label\nx.png,coin\n')
    with pytest.raises(ValueError, match='sheet_id'):
        load_samples(metadata)
    metadata.write_text('path,label,sheet_id\nx.png,unknown,s1\n')
    with pytest.raises(ValueError, match='Invalid'):
        load_samples(metadata)


def test_forward():
    model = SymbolCNN(channels=[4, 8], hidden=12)
    assert model(torch.zeros(3, 1, 64, 64)).shape == (3, 5)
    with pytest.raises(ValueError):
        SymbolCNN(channels=[])


def test_end_to_end(samples, tmp_path):
    config = load_config('ml/config.yaml')
    config['data'] = str(samples[0].path.parents[2] / 'metadata.csv')
    config['output'] = str(tmp_path / 'run')
    config['model'] = {'channels': [4, 8], 'hidden': 12, 'dropout': .1}
    config['training'].update(epochs=3, patience=1, min_delta=100)
    checkpoint = train(config)
    assert checkpoint.is_file()
    model, saved = load_checkpoint(checkpoint)
    assert saved['epoch'] == 1
    assert model.training is False
    import json
    history = json.loads((checkpoint.parent / 'history.json').read_text())
    assert len(history) == 2  # Early stopping actually fires.
    assert all(np.isfinite(row['val']['loss']) for row in history)
    result = predict(checkpoint, samples[0].path)
    assert result['predicted_class'] in CLASSES
    assert sum(result['scores'].values()) == pytest.approx(1)
    metrics = evaluate(checkpoint, output=tmp_path / 'evaluation')
    assert metrics['samples'] == len(saved['splits']['test'])
    assert np.array(metrics['confusion_matrix']).shape == (5, 5)
    assert (tmp_path / 'evaluation' / 'confusion_matrix.png').is_file()
    with pytest.raises(ValueError):
        predict(checkpoint, tmp_path / 'missing.png')
    with pytest.raises(ValueError, match='Checkpoint'):
        load_checkpoint(tmp_path / 'missing.pt')


def test_explicit_split_success(samples):
    automatic = split_samples(samples)
    explicit = [replace(sample, split=name) for name, subset in automatic.items() for sample in subset]
    result = split_samples(explicit)
    assert {key: len(value) for key, value in result.items()} == {key: len(value) for key, value in automatic.items()}


def test_corrupt_image_and_missing_class(tmp_path):
    path = tmp_path / 'coin' / 'sheet1' / 'bad.png'
    path.parent.mkdir(parents=True)
    path.write_bytes(b'not an image')
    with pytest.raises(ValueError, match='Cannot read image'):
        load_samples(tmp_path)
    from PIL import Image
    Image.new('L', (10, 10), 255).save(path)
    with pytest.raises(ValueError, match='all five'):
        load_samples(tmp_path)


def test_training_reproducibility(samples, tmp_path):
    config = load_config('ml/config.yaml')
    config['data'] = str(samples[0].path.parents[2])
    config['model'] = {'channels': [4], 'hidden': 8, 'dropout': .1}
    config['training']['epochs'] = 1
    config['output'] = str(tmp_path / 'first')
    _, first = load_checkpoint(train(config))
    config['output'] = str(tmp_path / 'second')
    _, second = load_checkpoint(train(config))
    assert all(torch.equal(first['model_state'][key], second['model_state'][key]) for key in first['model_state'])


@pytest.fixture
def single_class_sheets(tmp_path):
    """Each contributor photographs one separate sheet per symbol category."""
    import csv
    metadata = generate(tmp_path / 'collection', sheets=6)
    with metadata.open(newline='') as handle:
        rows = list(csv.DictReader(handle))
    # Each crop's photographed sheet contains only its own class.
    for row in rows:
        row['sheet_id'] = f"{row['label']}_{row['sheet_id']}"
        old_path = metadata.parent / row['path']
        new_path = metadata.parent / row['label'] / row['sheet_id'] / old_path.name
        new_path.parent.mkdir(parents=True)
        old_path.rename(new_path)
        row['path'] = new_path.relative_to(metadata.parent).as_posix()
    extra = []
    for row in rows:
        if row['contributor_id'] == 'writer_005':
            continue  # Include unequal numbers of crops per sheet.
        copy = dict(row)
        image = metadata.parent / row['path']
        destination = image.with_name('second_crop.png')
        destination.write_bytes(image.read_bytes())
        copy['path'] = destination.relative_to(metadata.parent).as_posix()
        extra.append(copy)
    with metadata.open('w', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows + extra)
    return load_samples(metadata)


@pytest.mark.parametrize('group_by', ['sheet_id', 'contributor_id'])
@pytest.mark.parametrize('seed', [0, 7, 42])
def test_one_class_per_sheet(single_class_sheets, group_by, seed):
    samples = single_class_sheets
    assert all(len({s.label for s in samples if s.sheet_id == sheet}) == 1 for sheet in {s.sheet_id for s in samples})
    splits = split_samples(samples, group_by=group_by, seed=seed)
    for subset in splits.values():
        assert {s.label for s in subset} == set(range(5))
    for attribute in ('sheet_id', group_by):
        sets = [{getattr(s, attribute) for s in subset} for subset in splits.values()]
        assert all(not sets[i] & sets[j] for i in range(3) for j in range(i))
    assert sum(map(len, splits.values())) == len(samples)
    assert splits == split_samples(samples, group_by=group_by, seed=seed)


def test_insufficient_independent_sheets(single_class_sheets):
    samples = single_class_sheets
    selected = sorted({s.sheet_id for s in samples if s.label == 0})[:2]
    samples = [s for s in samples if s.label != 0 or s.sheet_id in selected]
    with pytest.raises(ValueError, match="platform.*only 2 independent groups"):
        split_samples(samples)
    collapsed = [replace(s, contributor_id='only_writer') for s in single_class_sheets]
    with pytest.raises(ValueError, match='only 1 independent groups'):
        split_samples(collapsed, group_by='contributor_id')


def test_incompatible_group_coverage():
    from ml.dataset import Sample, _automatic_split
    from pathlib import Path
    samples, groups = [], []
    # Each of four contributors supplies three of the first four classes.
    # Every triple would need all three splits, impossible with four groups.
    for group in range(4):
        for label in range(5):
            if label != group:
                samples.append(Sample(Path('unused'), label, str(group)))
                groups.append(group)
    with pytest.raises(ValueError, match='No valid train/val/test assignment'):
        _automatic_split(samples, np.array(groups), .2, .2, 42)


@pytest.mark.parametrize('source_type', ['csv', 'folder'])
def test_portable_evaluation_and_integrity(single_class_sheets, tmp_path, source_type):
    import shutil
    from pathlib import Path
    config = load_config('ml/config.yaml')
    original = single_class_sheets[0].path.parents[2]
    config['data'] = str(original / 'metadata.csv' if source_type == 'csv' else original)
    config['output'] = str(tmp_path / 'run')
    config['model'] = {'channels': [4], 'hidden': 8, 'dropout': .1}
    config['training']['epochs'] = 1
    checkpoint = train(config)
    _, saved = load_checkpoint(checkpoint)
    assert saved['manifest_version'] == 2
    assert all(not Path(entry['path']).is_absolute() for entries in saved['splits'].values() for entry in entries)
    before = evaluate(checkpoint, output=tmp_path / 'before')
    moved = tmp_path / 'moved_collection'
    shutil.move(original, moved)
    source = moved / 'metadata.csv' if source_type == 'csv' else moved
    after = evaluate(checkpoint, data=source, output=tmp_path / 'after')
    assert before == after
    entry = saved['splits']['test'][0]
    image = moved / entry['path']
    original_bytes = image.read_bytes()
    # Same readable pixels, different file bytes must also be noticed.
    image.write_bytes(original_bytes + b'changed')
    with pytest.raises(ValueError, match='integrity check failed'):
        evaluate(checkpoint, data=source, output=tmp_path / 'changed')
    image.write_bytes(original_bytes)
    image.unlink()
    with pytest.raises(ValueError, match='Missing|Missing or duplicate'):
        evaluate(checkpoint, data=source, output=tmp_path / 'missing')


def test_held_out_label_change(samples):
    from ml.dataset import make_manifest, resolve_test_samples
    splits = split_samples(samples)
    saved = {'manifest_version': 2, 'splits': make_manifest(splits)}
    test = splits['test'][0]
    changed = [replace(s, label=(s.label + 1) % 5) if s == test else s for s in samples]
    with pytest.raises(ValueError, match='Label changed'):
        resolve_test_samples(changed, saved)
    with pytest.raises(ValueError, match='legacy'):
        resolve_test_samples(samples, {'splits': {'test': []}})


def test_prediction_uses_checkpoint_preprocessing(samples, tmp_path):
    config = load_config('ml/config.yaml')
    config['preprocessing'] = {'size': 48, 'threshold': False}
    model = SymbolCNN(**config['model']).eval()
    checkpoint = tmp_path / 'prediction.pt'
    torch.save({'classes': list(CLASSES), 'config': config, 'model_state': model.state_dict()}, checkpoint)
    tensor, _ = SymbolDataset(samples, config['preprocessing'])[0]
    assert torch.equal(tensor, preprocess(samples[0].path, **config['preprocessing']))
    with torch.inference_mode():
        expected = model(tensor.unsqueeze(0)).softmax(1)[0].tolist()
    actual = predict(checkpoint, samples[0].path)
    assert list(actual['scores'].values()) == pytest.approx(expected)
    assert actual['confidence'] == max(actual['scores'].values())


def test_minimum_single_class_sheets(single_class_sheets):
    samples = [s for s in single_class_sheets if s.contributor_id in {'writer_000', 'writer_001', 'writer_002'}]
    for grouping in ('sheet_id', 'contributor_id'):
        splits = split_samples(samples, group_by=grouping)
        assert all({s.label for s in subset} == set(range(5)) for subset in splits.values())


def test_duplicates_reduce_available_groups(single_class_sheets):
    samples = [s for s in single_class_sheets if s.contributor_id in {'writer_000', 'writer_001', 'writer_002'}]
    coins = [s for s in samples if s.label == 1]
    # Different sheet IDs cannot make duplicate crops independent.
    original = coins[0].path.read_bytes()
    for sample in coins:
        sample.path.write_bytes(original)
    with pytest.raises(ValueError, match="coin.*only 1 independent groups"):
        split_samples(samples)
