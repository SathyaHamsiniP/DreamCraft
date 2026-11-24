"""Small generated fixtures test formats, not public-data accuracy."""
import csv
import gzip
import struct

import numpy as np
import pytest
from PIL import Image

from ml.public_data import convert, idx, mapping, prepare, quickdraw
from ml.dataset import load_samples, split_samples


def cache_fixture(root):
    root.mkdir()
    rng = np.random.default_rng(100)
    for category in ('square', 'circle', 'triangle'):
        np.save(root/f'{category}.npy', rng.integers(0, 256, (40, 784), dtype=np.uint8))
    chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
    (root/'emnist-byclass-mapping.txt').write_text(''.join(f'{i} {ord(c)}\n' for i,c in enumerate(chars)))
    for split in ('train', 'test'):
        images = rng.integers(0, 256, (40,28,28), dtype=np.uint8)
        labels = np.array([chars.index('S')]*20+[chars.index('G')]*20, dtype=np.uint8)
        for kind, data in [('images',images),('labels',labels)]:
            with gzip.open(root/f'emnist-byclass-{split}-{kind}-idx{data.ndim}-ubyte.gz','wb') as f:
                f.write(bytes([0,0,8,data.ndim])+struct.pack('>'+'I'*data.ndim,*data.shape)+data.tobytes())


def test_formats_mapping_and_orientation(tmp_path):
    cache=tmp_path/'cache';cache_fixture(cache)
    assert quickdraw(cache/'square.npy').shape==(40,28,28)
    assert mapping(cache/'emnist-byclass-mapping.txt')['S']==28
    assert idx(cache/'emnist-byclass-test-images-idx3-ubyte.gz').shape==(40,28,28)
    pixels=np.zeros((28,28),dtype=np.uint8);pixels[4:10,5:24]=255
    upright=convert(pixels,emnist=True)
    ys,xs=np.where(np.asarray(upright)<128)
    assert np.ptp(ys)>np.ptp(xs)
    assert upright.size==(64,64) and upright.getpixel((0,0))==255
    square=np.zeros((28,28),dtype=np.uint8);square[5:23,5:23]=255
    platform=convert(square,platform=True);ys,xs=np.where(np.asarray(platform)<128)
    assert 1.5< (np.ptp(xs)+1)/(np.ptp(ys)+1)<1.7
    with pytest.raises(ValueError):convert(np.zeros((28,28),dtype=np.uint8))


def test_manifest_counts_splits_and_reproducibility(tmp_path):
    cache=tmp_path/'cache';cache_fixture(cache)
    first=prepare(cache,tmp_path/'one',10,42,True)
    second=prepare(cache,tmp_path/'two',10,42,True)
    assert first==second
    assert all(c==dict(train=6,val=2,test=2) for c in first['actual'].values())
    assert (tmp_path/'one/metadata.csv').read_bytes()==(tmp_path/'two/metadata.csv').read_bytes()
    rows=list(csv.DictReader((tmp_path/'one/metadata.csv').open()))
    assert len({r['prepared_sha256'] for r in rows})==50
    assert len({r['sheet_id'] for r in rows})==50
    assert all(r['contributor_id']=='' for r in rows)
    assert all(r['source_split']=='test' for r in rows if r['dataset']=='EMNIST ByClass' and r['split']=='test')
    splits=split_samples(load_samples(tmp_path/'one/metadata.csv'))
    assert {k:len(v) for k,v in splits.items()}==dict(train=30,val=10,test=10)
    assert Image.open(tmp_path/'one/preview.png').size==(1200,500)
    with pytest.raises(ValueError,match='empty'):prepare(cache,tmp_path/'one',10,42,True)


def test_missing_and_damaged(tmp_path):
    with pytest.raises(ValueError,match='Missing'):prepare(tmp_path/'missing',tmp_path/'out',10,42,True)
    path=tmp_path/'broken.gz';path.write_bytes(b'bad')
    with pytest.raises(ValueError):idx(path)
    np.save(tmp_path/'bad.npy',np.zeros((2,3)))
    with pytest.raises(ValueError):quickdraw(tmp_path/'bad.npy')


def test_duplicate_sources_are_not_repeated(tmp_path):
    cache=tmp_path/'cache';cache_fixture(cache)
    path=cache/'square.npy';data=np.load(path);data[:]=data[0];np.save(path,data)
    result=prepare(cache,tmp_path/'out',10,42,True)
    assert sum(result['actual']['platform'].values())==1
    assert result['skipped']>0


def test_existing_training_and_adapter(tmp_path):
    from ml.public_experiment import run
    cache=tmp_path/'cache';cache_fixture(cache)
    prepare(cache,tmp_path/'data',5,42,True)
    report=run(tmp_path/'data/metadata.csv',tmp_path/'run',epochs=1)
    assert report['adapter_check']['model_status']=='ran'
    candidate=report['adapter_check']['candidates'][0]
    assert candidate['review_required']
    assert set(candidate['scores'])=={'platform','coin','spike','spawn','goal'}
    assert 0 <= candidate['confidence'] <= 1
    assert (tmp_path/'run/evaluation/confusion_matrix.png').is_file()
