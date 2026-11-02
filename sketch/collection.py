"""Store original sheets, reviewed crops and portable training metadata."""
import csv
import hashlib
import io
import json
import re
import sqlite3
from pathlib import Path

from ml import CLASSES
from .detection import checked_box, crop, load_image


def png_bytes(image):
    buffer = io.BytesIO()
    image.save(buffer, format='PNG')
    return buffer.getvalue()


class Collection:
    def __init__(self, root):
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)
        for name in ('originals', 'crops', 'processed'):
            (self.root / name).mkdir(exist_ok=True)
        with self.connect() as db:
            db.executescript('''
                CREATE TABLE IF NOT EXISTS sheets (
                    sheet_id TEXT PRIMARY KEY, contributor_id TEXT NOT NULL,
                    label TEXT NOT NULL, digest TEXT UNIQUE NOT NULL);
                CREATE TABLE IF NOT EXISTS samples (
                    digest TEXT PRIMARY KEY, sheet_id TEXT NOT NULL,
                    path TEXT NOT NULL, box TEXT NOT NULL);
            ''')

    def connect(self):
        return sqlite3.connect(self.root / 'collection.sqlite3', timeout=30)

    def save(self, data, sheet_id, contributor_id, label, boxes):
        for value in (sheet_id, contributor_id):
            if not isinstance(value, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,80}', value):
                raise ValueError('Use 1–80 letters, numbers, underscores or hyphens for IDs')
        if label not in CLASSES or not boxes or len(boxes) > 1000:
            raise ValueError('Choose a class and 1–1000 accepted boxes')
        image = load_image(data)
        boxes = [checked_box(image, box) for box in boxes]
        digest = hashlib.sha256(png_bytes(image)).hexdigest()
        # Use the same preprocessing as training when checking exact duplicates.
        from ml.preprocess import preprocess
        prepared = []
        for box in boxes:
            sample = crop(image, box)
            tensor = preprocess(sample)
            sample_hash = hashlib.sha256(tensor.numpy().tobytes()).hexdigest()
            prepared.append((box, sample, tensor, sample_hash))
        saved, skipped = 0, 0
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            previous = db.execute('SELECT contributor_id,label,digest FROM sheets WHERE sheet_id=?', (sheet_id,)).fetchone()
            if previous and previous != (contributor_id, label, digest):
                raise ValueError('Sheet ID already belongs to a different image, contributor or class')
            same_image = db.execute('SELECT sheet_id FROM sheets WHERE digest=?', (digest,)).fetchone()
            if same_image and same_image[0] != sheet_id:
                raise ValueError('This image already has a sheet ID: ' + same_image[0])
            db.execute('INSERT OR IGNORE INTO sheets VALUES (?,?,?,?)', (sheet_id, contributor_id, label, digest))
            for _, _, _, sample_hash in prepared:
                existing = db.execute('SELECT s.label FROM samples p JOIN sheets s USING(sheet_id) WHERE p.digest=?', (sample_hash,)).fetchone()
                if existing and existing[0] != label:
                    raise ValueError('An identical prepared crop already has a different label')
            original = self.root / 'originals' / f'{digest}.source'
            if not original.exists():
                original.write_bytes(data)
            for box, sample, tensor, sample_hash in prepared:
                existing = db.execute('SELECT s.label FROM samples p JOIN sheets s USING(sheet_id) WHERE p.digest=?', (sample_hash,)).fetchone()
                if existing:
                    skipped += 1
                    continue
                relative = f'crops/{sample_hash}.png'
                sample.save(self.root / relative)
                from PIL import Image
                import numpy as np
                Image.fromarray(np.uint8(np.rint((1-tensor.numpy()[0])*255))).save(self.root / 'processed' / f'{sample_hash}.png')
                db.execute('INSERT INTO samples VALUES (?,?,?,?)', (sample_hash, sheet_id, relative, json.dumps(box)))
                saved += 1
        return {'saved': saved, 'duplicates_skipped': skipped}

    def export(self):
        # Return a snapshot instead of rewriting a manifest while another save runs.
        with self.connect() as db:
            rows = db.execute("SELECT p.path,s.label,s.sheet_id,s.contributor_id,p.box,('originals/' || s.digest || '.source') FROM samples p JOIN sheets s USING(sheet_id) ORDER BY s.sheet_id,p.path").fetchall()
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(('path', 'label', 'sheet_id', 'contributor_id', 'box', 'original_path'))
        writer.writerows(rows)
        return output.getvalue()
