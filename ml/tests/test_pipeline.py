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
