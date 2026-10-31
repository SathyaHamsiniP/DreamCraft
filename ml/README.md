# DreamCraft symbol classifier

A modular PyTorch CNN for **individual cropped symbols**, in fixed class order:
`platform` (rectangle), `coin` (circle), `spike` (triangle), `spawn` (S), `goal` (G).
It does not localize objects on full sheets or generate a playable game.
No real handwriting dataset or trained production model is included.

## Environment

Run commands from the repository root. Python 3.12 is tested; Python 3.10+ is recommended.

```bash
python3 -m venv .venv
source .venv/bin/activate
# For restricted cloud home directories, keep caches writable:
export MPLCONFIGDIR=/tmp/dreamcraft-matplotlib
export XDG_CACHE_HOME=/tmp/dreamcraft-cache
# CPU build avoids downloading CUDA libraries:
pip install 'torch>=2.6,<3' --index-url https://download.pytorch.org/whl/cpu
pip install -r ml/requirements.txt
python -m pytest ml/tests -q
```

For GPU use, install the appropriate official PyTorch CUDA build instead of the
CPU command, then set `device: cuda` (requires a compatible GPU/driver) or `auto`.
CPU is the default. GPU execution was not validated in the initial implementation.
Requirements specify compatible ranges; use `pip freeze` in your own environment
when an exact experiment dependency snapshot is needed.

## Real dataset contract

Supply cropped images of dark strokes on light paper. PNG, JPEG, BMP and WebP
are supported. The loader validates every image before training. All five classes
must be represented in every split. Corrupt files, unknown labels, missing paths,
duplicate paths and insufficient groups raise errors.

Preferred CSV metadata:

```csv
path,label,sheet_id,contributor_id,split
images/crop_001.png,platform,sheet_001,writer_001,train
images/crop_002.png,coin,sheet_002,writer_002,val
images/crop_003.png,spawn,sheet_003,writer_003,test
```

This is a schema example, not a complete dataset. Paths are relative to the CSV.
`path`, `label`, and nonempty `sheet_id` are required. Sheet IDs must be globally
unique across contributors. `contributor_id` is required when selecting contributor
grouping. `split` is optional; if supplied, every row must use `train`, `val`, or
`test`. Explicit assignments are checked for leakage and class coverage.

Alternatively use folders:

```text
ml/data/real/
  platform/sheet_001/crop_001.png
  coin/sheet_001/crop_002.png
  spike/sheet_002/crop_003.png
  spawn/sheet_002/crop_004.png
  goal/sheet_003/crop_005.png
```

Add enough independently collected sheets for all three splits. Folder input
supports sheet grouping; use CSV for contributors or explicit splits. Do not
invent a separate sheet ID for each crop from the same source sheet.

Automatic splitting uses seeded group shuffle, not image-level shuffle. Crops
from a sheet stay together; `split.group_by: contributor_id` additionally keeps
all work by each contributor together. Exact preprocessed duplicates also stay
together, including duplicates assigned different sheet IDs. This does not detect
near-duplicates; reliable provenance metadata is still essential. Group splits
are approximate fractions and not stratified; if a split lacks a class, add data
or provide balanced explicit splits rather than repeatedly selecting a seed based
on test performance. Contributor grouping is preferred for unseen-writer evaluation.

## Smoke test without real data

```bash
python -m ml.synthetic --output ml/data/synthetic --sheets 15 --seed 42
python -m ml.train --config ml/config.yaml --epochs 2 --output ml/runs/smoke
python -m ml.evaluate ml/runs/smoke/best.pt --output ml/runs/smoke/evaluation
python -m ml.predict ml/runs/smoke/best.pt ml/data/synthetic/coin/sheet_000/symbol.png
```

The generator refuses to overwrite nonempty directories. These 75 artificial
symbols only test integration. **Synthetic-only accuracy says nothing about real
handwriting performance.** No external dataset is downloaded. Generated data,
checkpoints, reports and environments are ignored by Git.

## Training and configuration

```bash
python -m ml.train --config ml/config.yaml --data ml/data/real/metadata.csv --output ml/runs/real
```

Edit YAML to configure convolution channels, dense hidden size, dropout, batch
size, learning rate, weight decay, epochs, patience, minimum validation improvement,
augmentation, seed, device and split fractions. Paths in YAML and CLI are relative
to the current working directory. Use a distinct output directory per experiment;
existing run artifacts in that directory can be overwritten.

Preprocessing converts PIL images to EXIF-corrected grayscale; NumPy input must be
uint8 grayscale or RGB/RGBA (not OpenCV BGR). Optional Otsu thresholding precedes
aspect-preserving resize and white padding to 64×64 by default. The outer margin
is two pixels on the longest axis. Values become float32 in [0,1], with ink near
one and paper near zero. Training alone applies small seeded rotations, scale and
translation; flips are avoided because they change S/G semantics. Thresholding
can be disabled for shaded/noisy scans. Inspect real inputs before selecting it.

Training uses Adam and cross-entropy, validates every epoch, and saves `best.pt`
only when validation loss improves. Patience stops training after consecutive
non-improving epochs. `history.json` records actual epochs and `splits.json`
records image membership. The checkpoint contains weights, optimizer state,
class mapping, configuration, split paths, best epoch and validation loss.
It supports inference/loading; automatic training resume is not implemented.
Seeds cover Python, NumPy and Torch; deterministic algorithms and zero loader
workers aid repeatability on the same software/hardware. Cross-platform bitwise
identity is not guaranteed. CUDA may require `CUBLAS_WORKSPACE_CONFIG=:4096:8`
to be set before starting Python for deterministic operations.

## Evaluation and prediction

Evaluation uses the held-out paths saved during training, never validation data:

```bash
python -m ml.evaluate ml/runs/real/best.pt --output ml/runs/real/evaluation
python -m ml.predict ml/runs/real/best.pt path/to/cropped_symbol.png
```

Reports contain accuracy, per-class and macro/weighted precision, recall and F1,
plus a five-class confusion matrix in JSON and PNG. Keep the dataset unchanged
between training and evaluation. If relocated, restore its original absolute
paths (checkpoint membership is deliberately strict). `--data` selects a manifest
containing those same paths, not a new unrelated test dataset.

Prediction returns `predicted_class`, its softmax `confidence`, and scores for
all five classes. Scores are **not calibrated probabilities** or an out-of-domain
rejection mechanism. Even blank or unknown symbols receive a class; assess these
cases and calibrate on real held-out data before product integration. Load only
trusted checkpoints; loading uses PyTorch's restricted `weights_only=True` mode.

## Modules and verification

- `preprocess.py`, `dataset.py`: shared transforms, validation and safe splits.
- `model.py`: configurable CNN with adaptive pooling.
- `runtime.py`: configuration, seeds, devices and checkpoint loading.
- `train.py`, `evaluate.py`, `predict.py`: importable APIs and module CLIs.
- `synthetic.py`: artificial smoke fixtures only.
- `tests/test_pipeline.py`: preprocessing, loaders, group leakage, errors, forward
  pass, training/validation, early stopping, checkpoint reload, metrics and inference.

Real-world quality, GPU execution and full-sheet localization remain separate
validation tasks. No production accuracy claim is made.
