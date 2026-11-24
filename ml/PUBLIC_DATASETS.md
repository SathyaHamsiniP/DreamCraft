# Public sketch data

This importer keeps the existing five classes and CNN. It does not change the
backend, editor, game rules or recognition API.

## Status of this attempt

The official Quick Draw storage and NIST download hosts returned proxy HTTP 403
on 24 November 2026. No real public images were downloaded or prepared. Actual
public counts are zero for every class and split. Public-data training did not
start; no public accuracy, F1, checkpoint, confusion matrix or real-data preview
exists yet. Do not use the generated test fixtures as a substitute dataset.

The importer and experiment runner were checked with small generated format
fixtures, including one epoch through the existing CNN and the inference adapter.
That check verifies code connections, not handwriting accuracy. Real S/G orientation
and square conversion previews must be reviewed when the downloads are available.

## Sources and terms

- Google Creative Lab, [Quick Draw dataset](https://github.com/googlecreativelab/quickdraw-dataset).
  Its official README License section specifies [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
  Credit Google Creative Lab and Quick Draw contributors; keep the source link,
  license link and a statement of modifications when sharing adapted data.
  We invert, crop, resize and add white margins. Platforms also receive a 1.6x
  horizontal stretch. These are adapted squares, not real labeled rectangles.
- [NIST EMNIST page](https://www.nist.gov/itl/products-and-services/emnist-dataset),
  ByClass, 62 classes. The official page requests citation of Cohen, Afshar,
  Tapson and van Schaik (2017), *EMNIST: an extension of MNIST to handwritten
  letters*, [paper](https://arxiv.org/abs/1702.05373),
  DOI 10.1109/IJCNN.2017.7966217. The page does not specify a dataset license
  equivalent to CC BY 4.0. Its linked Readme and archive could not be retrieved
  here. EMNIST usage/redistribution terms remain a verification item before
  distributing data or weights; do not infer a license from third-party mirrors.
  The importer downloads only from the official host and never redistributes it.

EMNIST orientation follows the stored IDX convention: transpose once, then invert.
See the orientation note in [TensorFlow Datasets EMNIST documentation](https://www.tensorflow.org/datasets/catalog/emnist).
The official mapping file is read and checked for all 62 digit/uppercase/lowercase
codepoints. Labels for uppercase S and G are looked up by their codepoints, not
hardcoded. Lowercase s/g and the merged Letters split are not accepted.

## Prepare

Use the project's Python environment with `ml/requirements.txt` installed. From
the repository root. First make a small preview run:

```bash
python -m ml.public_data --output ml/data/public_preview --per-class 20 --seed 42
```

Open ml/data/public_preview/preview.png. Confirm upright S/G and suitable
square-to-platform conversion before preparing thousands of images. Then:

```bash
python -m ml.public_data --output ml/data/public --per-class 3000 --seed 42
```

Downloads are cached in `ml/data/public_sources`. Only square.npy, circle.npy and
triangle.npy are downloaded from the official numpy_bitmap directory. NIST's
binary gzip.zip archive is needed for its ByClass files; this archive includes
other splits, but only ByClass images, labels and mapping are unpacked. It is a
large download (roughly 536 MiB). Existing cached files are reused. Interrupted
downloads use a temporary file and are not treated as complete files.

If this environment is blocked, run on a network with permission to access
`storage.googleapis.com` and `biometrics.nist.gov`, or copy the unchanged official
files into the cache. Do not bypass your network's policy. Offline command:

```bash
python -m ml.public_data --cache ml/data/public_sources --output ml/data/public --per-class 3000 --seed 42 --offline
```

Cache file names:

```text
square.npy
circle.npy
triangle.npy
emnist-byclass-mapping.txt
emnist-byclass-train-images-idx3-ubyte.gz
emnist-byclass-train-labels-idx1-ubyte.gz
emnist-byclass-test-images-idx3-ubyte.gz
emnist-byclass-test-labels-idx1-ubyte.gz
```

Alternatively cache gzip.zip with the same mapping and ByClass members inside.
A damaged cache is rejected; remove the damaged file and download it again.
The output must be empty. Use another output directory for another experiment.

Each output PNG contains one symbol on a white 64x64 canvas, with dark strokes.
Inputs must be nonempty uint8 images. Ink is cropped, platform ink stretched
horizontally by 1.6, and all symbols fitted into 56x56 with margins. The existing
training preprocessor still runs once at loading time with its normal threshold
and centering settings. It does not transpose or stretch a second time.

Before training, inspect `preview.png`. Each row shows source/converted pairs,
including square/platform pairs. The cached sources are not changed. Stretching
is moderate by construction but its quality on actual square drawings has not
been visually checked in this run. Upward triangle orientation is not relabeled
or silently rotated; inspect unsuitable or ambiguous examples before training.
This first bitmap experiment has no reliable automatic semantic quality filter
for incorrectly drawn or rotated shapes. Record any later filtering rules and
regenerate from the seed rather than editing the test set to improve scores.

## Counts, splits and provenance

Target per class: 1,800 train, 600 validation, 600 test; total 15,000.
Actual counts, skips and SHA-256 hashes of each source file are saved in
`preparation.json`. If unique usable images run out, report the shortfall; the
script never duplicates samples to fill quotas. Review counts before training.

Metadata columns include path, label, sheet_id, contributor_id, split, dataset,
source_category, source_record_id, source_split, transformation and prepared_sha256.
Paths are relative to metadata.csv. Unknown contributor IDs stay empty. sheet_id
means source record, not a paper sheet. Quick Draw bitmap record IDs are category
plus stable row index within the source file, not the original stroke key_id.
Keep source file hashes to identify exactly which record ordering was used.

The fixed NumPy seed shuffles eligible source rows. Test is selected first, then
validation, then training. Quick Draw source records cannot repeat across splits.
EMNIST testing uses only official test rows; validation and training use only
train rows. Every eligible S/G official test image is reserved against training,
including test images not selected for this experiment. Exact fingerprints use
the existing default preprocessing, across classes and splits. Duplicate source
records and duplicate prepared images are skipped. Only one platform version is
created per source. Future versions must retain the same sheet ID and split.

This is not unseen-writer evaluation: bitmap files do not provide contributor
identities. Near-duplicate drawings are not fully detected. The existing training
loader rechecks explicit split assignments, class coverage and duplicate leakage.

## Train and evaluate

First inspect the preview and resolve source terms. Then run:

```bash
python -m ml.public_experiment --data ml/data/public/metadata.csv --output ml/runs/public --epochs 30
```

For a small public-data smoke run, prepare a new folder with `--per-class 100`
and train to a new run directory with `--epochs 2`. There is no synthetic fallback.
The experiment uses the existing architecture, class order, augmentation, CPU,
seed 42 and settings in ml/config.yaml. Validation loss selects the checkpoint;
the test split is evaluated once after training. Avoid reusing test scores to tune
settings. The runner records elapsed training time and config in experiment.json;
history.json records epochs, losses and validation accuracy.

Outputs under `ml/runs/public/`:

- best.pt: actual learned weights, if training finishes.
- splits.json and history.json: selected groups and learning history.
- evaluation/metrics.json: accuracy, per-class precision/recall/F1, macro F1 and counts.
- evaluation/confusion_matrix.png: actual held-out confusion matrix.
- evaluation/examples.png and examples.json: up to five correct and five incorrect
  examples from a limited deterministic test scan. Some categories of result may
  be absent; no examples are manufactured.
- experiment.json: measured duration, settings, metrics and adapter result.

Square/platform versus circle, triangle versus platform, and S versus G should be
reviewed using per-class recall and the confusion matrix, not overall accuracy
alone. Public 28x28 crops differ from real photographs, weak strokes, shadows and
OpenCV candidate crops. Even high public test accuracy would not prove the full
sketch-to-game system works. Collect an independent photo test set later.

The experiment loads best.pt through `sketch.inference.classify_candidates`, checks
real labels/scores and requests review with threshold 1. Normal confidence scores
are uncalibrated. Keep human review in the editor. A separate integration PR can
configure a trusted checkpoint, return genuine model suggestions with box IDs,
and test uncertain or unknown symbols. This PR does not enable recognition in the
public API or alter React labels.

Tests run without downloads:

```bash
python -m pytest ml/tests/test_public_data.py -q
```

All data and run folders above are ignored by Git. Do not commit sources, crops,
archives, weights, previews or caches.

## Separate game roadmap

Review feature/game-experience separately; it is not merged or overwritten here.
Future Phaser work can add textured platforms, glowing animated coins, better
spikes, an animated player, a colorful goal portal, attractive backgrounds,
particles and jump effects, sound, and better success/failure feedback. These
changes need no new CNN classes. S and G remain the drawn spawn and goal symbols.

Local verification: 129 Python tests, 27 game unit tests, 20 frontend tests,
16 game browser tests, seven frontend browser tests and the collection browser
test passed. Type checks and production builds for both apps passed. Builds retain
the large Phaser bundle warning; Python reports dependency deprecation warnings.
