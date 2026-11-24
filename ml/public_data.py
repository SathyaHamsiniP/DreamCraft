"""Prepare official Quick Draw bitmaps and EMNIST ByClass for DreamCraft."""
import argparse
import csv
import gzip
import hashlib
import json
import math
import shutil
import struct
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

from .preprocess import preprocess

QD = 'https://storage.googleapis.com/quickdraw_dataset/full/numpy_bitmap/'
EMNIST = 'https://biometrics.nist.gov/cs_links/EMNIST/gzip.zip'
CATEGORIES = {'platform': 'square', 'coin': 'circle', 'spike': 'triangle'}


def download(url, path):
    path = Path(path)
    if path.exists():
        return
    temporary = path.with_suffix(path.suffix + '.part')
    try:
        with urllib.request.urlopen(url, timeout=60) as source, temporary.open('wb') as target:
            shutil.copyfileobj(source, target)
        temporary.replace(path)
    except OSError as exc:
        temporary.unlink(missing_ok=True)
        raise ValueError(f'Download failed: {url}. Retry with network access or place the official file at {path}: {exc}') from exc


def idx(path):
    try:
        with gzip.open(path, 'rb') as stream:
            header = stream.read(4)
            if len(header) != 4 or header[:3] != b'\x00\x00\x08' or header[3] not in (1, 3):
                raise ValueError('Expected uint8 IDX labels or images')
            rank = header[3]
            dimensions = struct.unpack('>' + 'I' * rank, stream.read(4 * rank))
            if not all(dimensions) or math.prod(dimensions) > 800_000_000:
                raise ValueError('Invalid IDX dimensions')
            data = stream.read(int(math.prod(dimensions)) + 1)
            if len(data) != math.prod(dimensions):
                raise ValueError('IDX length does not match its header')
            return np.frombuffer(data, dtype=np.uint8).reshape(dimensions)
    except (OSError, EOFError, struct.error) as exc:
        raise ValueError(f'Damaged IDX file: {path}') from exc


def mapping(path):
    rows = np.loadtxt(path, dtype=int, ndmin=2)
    if rows.shape != (62, 2) or set(rows[:, 0]) != set(range(62)) or set(rows[:, 1]) != set(map(ord, '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz')):
        raise ValueError('Expected the official 62-class ByClass mapping')
    return {chr(code): int(label) for label, code in rows}


def quickdraw(path):
    data = np.load(path, mmap_mode='r', allow_pickle=False)
    if data.dtype != np.uint8 or data.ndim != 2 or data.shape[1] != 784:
        raise ValueError('Quick Draw bitmaps must be uint8 [N,784]')
    return data.reshape(-1, 28, 28)


def convert(pixels, emnist=False, platform=False):
    if pixels.shape != (28, 28) or pixels.dtype != np.uint8:
        raise ValueError('Expected a 28x28 uint8 source image')
    ink = pixels.T if emnist else pixels
    ys, xs = np.where(ink > 30)
    if len(xs) < 5:
        raise ValueError('Empty or weak drawing')
    crop = Image.fromarray(255 - ink).crop((xs.min(), ys.min(), xs.max()+1, ys.max()+1))
    # Use one moderate 1.6x horizontal stretch, then fit with white margins.
    if platform:
        crop = crop.resize((max(1, round(crop.width * 1.6)), crop.height), Image.Resampling.BICUBIC)
    scale = 56 / max(crop.size)
    crop = crop.resize((max(1, round(crop.width * scale)), max(1, round(crop.height * scale))), Image.Resampling.LANCZOS)
    canvas = Image.new('L', (64, 64), 255)
    canvas.paste(crop, ((64-crop.width)//2, (64-crop.height)//2))
    return canvas


def fingerprint(image):
    return hashlib.sha256(preprocess(image).numpy().tobytes()).hexdigest()


def sources(cache, offline=False):
    cache.mkdir(parents=True, exist_ok=True)
    for category in CATEGORIES.values():
        path = cache / f'{category}.npy'
        if not path.exists() and not offline:
            download(QD + path.name, path)
    names = ['emnist-byclass-mapping.txt'] + [f'emnist-byclass-{split}-{kind}-idx{rank}-ubyte.gz' for split in ('train', 'test') for kind, rank in [('images', 3), ('labels', 1)]]
    if any(not (cache/name).exists() for name in names):
        archive = cache/'gzip.zip'
        if not archive.exists() and not offline:
            download(EMNIST, archive)
        if archive.exists():
            with zipfile.ZipFile(archive) as z:
                for name in names:
                    matches = [n for n in z.namelist() if Path(n).name == name]
                    if len(matches) != 1:
                        raise ValueError(f'Archive must contain one {name}')
                    if not (cache/name).exists():
                        with z.open(matches[0]) as src, (cache/name).open('wb') as dst:
                            shutil.copyfileobj(src, dst)
    required = names + [f'{c}.npy' for c in CATEGORIES.values()]
    missing = [name for name in required if not (cache/name).is_file()]
    if missing:
        raise ValueError('Missing cached official files: ' + ', '.join(missing))
    return required


def prepare(cache, output, per_class=3000, seed=42, offline=False):
    cache, output = Path(cache), Path(output)
    if per_class < 5:
        raise ValueError('Use at least five samples per class')
    if output.exists() and any(output.iterdir()):
        raise ValueError('Output must be empty; choose a new folder to avoid mixing runs')
    required = sources(cache, offline)
    ids = mapping(cache/'emnist-byclass-mapping.txt')
    data = {}
    for split in ('train', 'test'):
        images = idx(cache/f'emnist-byclass-{split}-images-idx3-ubyte.gz')
        labels = idx(cache/f'emnist-byclass-{split}-labels-idx1-ubyte.gz')
        if images.shape[1:] != (28, 28) or labels.ndim != 1 or len(images) != len(labels) or np.any(labels > 61):
            raise ValueError('Invalid EMNIST image/label pairing')
        data[split] = (images, labels)
    rng = np.random.default_rng(seed)
    output.mkdir(parents=True, exist_ok=True)
    (output/'images').mkdir()
    rows, seen, reserved, skipped = [], set(), set(), 0
    used_records = set()
    raw_seen = set()
    # Reserve every official S/G test image, even those not selected for this run.
    images, labels = data['test']
    for character in ('S', 'G'):
        for i in np.flatnonzero(labels == ids[character]):
            try:
                reserved.add(fingerprint(convert(images[i], emnist=True)))
            except ValueError:
                pass
    previews = []
    ntest = nval = per_class // 5
    for label, category in list(CATEGORIES.items()) + [('spawn', 'S'), ('goal', 'G')]:
        emnist = label in ('spawn', 'goal')
        counts = dict(train=0, val=0, test=0)
        targets = dict(test=ntest, val=nval, train=per_class-ntest-nval)
        pools = data if emnist else {'all': (quickdraw(cache/f'{category}.npy'), None)}
        for split in ('test', 'val', 'train'):
            pool = 'test' if emnist and split == 'test' else 'train' if emnist else 'all'
            images, labels = pools[pool]
            indices = np.flatnonzero(labels == ids[category]) if emnist else np.arange(len(images))
            for i in rng.permutation(indices):
                if counts[split] == targets[split]:
                    break
                record = f'emnist_byclass_{pool}_{i}' if emnist else f'quickdraw_{category}_{i}'
                try:
                    image = convert(images[i], emnist=emnist, platform=label == 'platform')
                except ValueError:
                    skipped += 1
                    continue
                raw_digest = hashlib.sha256((images[i].T if emnist else images[i]).tobytes()).hexdigest()
                digest = fingerprint(image)
                if raw_digest in raw_seen or digest in seen or (emnist and split != 'test' and digest in reserved):
                    skipped += 1
                    continue
                # Also exclude repeated source records across Quick Draw split passes.
                if record in used_records:
                    continue
                used_records.add(record)
                seen.add(digest)
                raw_seen.add(raw_digest)
                relative = f'images/{record}.png'
                image.save(output/relative)
                rows.append(dict(path=relative, label=label, sheet_id=record, contributor_id='', split=split, dataset='EMNIST ByClass' if emnist else 'Quick Draw', source_category=category, source_record_id=record, source_split=pool, transformation='transpose,invert,crop,margin' if emnist else 'invert,crop,stretch_x_1.6,margin' if label == 'platform' else 'invert,crop,margin', prepared_sha256=digest))
                if sum(counts.values()) < 8:
                    previews.append((label, convert(images[i], emnist=emnist), image))
                counts[split] += 1
        print(label, counts, flush=True)
    with (output/'metadata.csv').open('w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0]) if rows else ['path','label','sheet_id','contributor_id','split'])
        writer.writeheader(); writer.writerows(rows)
    grid = Image.new('RGB', (8*150, 5*100), 'white')
    draw = ImageDraw.Draw(grid)
    for row, label in enumerate(('platform', 'coin', 'spike', 'spawn', 'goal')):
        for col, (_, original, converted) in enumerate([p for p in previews if p[0] == label][:8]):
            grid.paste(original, (col*150, row*100+24)); grid.paste(converted, (col*150+70, row*100+24))
        draw.text((0,row*100), label + ' (source | converted)', fill='black')
    grid.save(output/'preview.png')
    report = {'seed': seed, 'requested_per_class': per_class, 'actual': {label: {split: sum(r['label']==label and r['split']==split for r in rows) for split in ('train','val','test')} for label in ('platform','coin','spike','spawn','goal')}, 'skipped': skipped, 'sources': {name: hashlib.file_digest((cache/name).open('rb'), 'sha256').hexdigest() for name in required}}
    (output/'preparation.json').write_text(json.dumps(report, indent=2))
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cache', default='ml/data/public_sources')
    parser.add_argument('--output', default='ml/data/public')
    parser.add_argument('--per-class', type=int, default=3000)
    parser.add_argument('--seed', type=int, default=42)
    parser.add_argument('--offline', action='store_true')
    try:
        print(json.dumps(prepare(**vars(parser.parse_args())), indent=2))
    except (OSError, ValueError, zipfile.BadZipFile) as exc:
        parser.exit(2, f'Public data error: {exc}\n')


if __name__ == '__main__':
    main()
