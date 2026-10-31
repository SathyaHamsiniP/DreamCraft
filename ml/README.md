# Symbol classification

This module recognises one cropped game symbol at a time. It uses a CNN, a neural network that learns image patterns, to choose between `platform`, `coin`, `spike`, `spawn` and `goal`.

The input is a cropped image of a rectangle, circle, triangle, S or G drawn with dark strokes on light paper. Images are prepared as 64×64 grayscale inputs by default. Finding and cropping symbols from a full sheet is separate work and is not included here.

## Set up the environment

Python 3.12 is the tested version. Run the following commands from the repository root, not from inside `ml/`:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install 'torch>=2.6,<3' --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r ml/requirements.txt
```

A virtual environment keeps these packages separate from other Python projects. The activation command above is for Bash on Linux or macOS. In Windows PowerShell, use `.venv\Scripts\Activate.ps1` instead.

The first install command selects the CPU version of PyTorch, so CUDA libraries are not needed. The remaining packages are listed in `requirements.txt`:

| Package | Purpose |
| --- | --- |
| PyTorch | Builds and trains the CNN |
| OpenCV | Resizes images, applies thresholding and changes training images slightly |
| NumPy | Handles image arrays and random values |
| scikit-learn | Calculates evaluation metrics |
| Pillow | Opens image files and reads image orientation |
| Matplotlib | Saves the confusion matrix plot |
| PyYAML | Reads the settings in `config.yaml` |
| pytest | Runs automated tests |

The requirements use version ranges. For an experiment that needs exact package versions, record the environment with `python -m pip freeze` in a local file.

If a cloud environment has a read-only home directory, set writable cache paths before running the commands below:

```bash
export MPLCONFIGDIR=/tmp/dreamcraft-matplotlib
export XDG_CACHE_HOME=/tmp/dreamcraft-cache
```

### Optional GPU use

For a compatible NVIDIA GPU, install the matching CUDA build from the official PyTorch installation instructions instead of the CPU build. Set `device: cuda` in `ml/config.yaml`, or use `auto` to select CUDA when it is available and CPU otherwise. The default is `cpu`.

GPU execution has not been tested yet. Deterministic CUDA operations may also need `CUBLAS_WORKSPACE_CONFIG=:4096:8` set before Python starts.

## Try a short run

The real handwritten dataset is not ready yet. The synthetic generator draws a few simple shapes and letters so the loading, training and prediction steps can be checked without downloading a dataset.

```bash
python -m ml.synthetic --output ml/data/synthetic --sheets 15 --seed 42
python -m ml.train --config ml/config.yaml --epochs 2 --output ml/runs/smoke
python -m ml.evaluate ml/runs/smoke/best.pt --output ml/runs/smoke/evaluation
python -m ml.predict ml/runs/smoke/best.pt ml/data/synthetic/coin/sheet_000/symbol.png
```

This creates 75 images: one image for each of the five classes on each of 15 artificial sheets. The generator stops if its output directory is not empty, so existing images are not overwritten. If that dataset already exists, skip the generator command. To generate another dataset, choose a different output directory and pass its `metadata.csv` to training with `--data`.

A smoke test is a small run that checks whether the main steps work together. Two epochs are enough for that check, but are not intended to train a useful model. Scores on these artificial images do not measure performance on real handwriting.

## Prepare real images

Use these exact labels:

| Label | Symbol |
| --- | --- |
| `platform` | Rectangle |
| `coin` | Circle |
| `spike` | Triangle |
| `spawn` | S |
| `goal` | G |

PNG, JPG/JPEG, BMP and WebP files are supported. Each image should contain one cropped symbol. Keep the source sheet and contributor information while collecting crops; it is needed to split the data correctly.

### CSV metadata

CSV is the preferred option when contributor information or fixed split assignments are needed. For example, `ml/data/real/metadata.csv` could begin with:

```csv
path,label,sheet_id,contributor_id
images/rectangle_001.png,platform,sheet_001,writer_001
images/circle_001.png,coin,sheet_001,writer_001
images/triangle_001.png,spike,sheet_002,writer_002
```

This only shows the format. A usable dataset needs all five classes and enough separate groups for training, validation and testing.

- `path` points to the image, relative to the CSV file.
- `label` is one of the five names above.
- `sheet_id` identifies the original drawing sheet and cannot be empty. Use a globally unique ID, such as `writer_001_sheet_001`, if different people number their sheets the same way.
- `contributor_id` identifies the person who drew the sheet. It is optional for sheet grouping and required for contributor grouping.
- `split` is an optional column. If used, every row must contain `train`, `val` or `test`.

For example, a fixed assignment can use this header and row:

```csv
path,label,sheet_id,contributor_id,split
images/rectangle_001.png,platform,writer_001_sheet_001,writer_001,train
```

All images from that sheet must then use the same split. The loader also checks the other grouping rules described below.

### Labeled folders

For sheet grouping without a CSV, use `class/sheet_id/image` folders:

```text
ml/data/real/
  platform/sheet_001/rectangle.png
  coin/sheet_001/circle.png
  spike/sheet_002/triangle.png
  spawn/sheet_002/start.png
  goal/sheet_003/finish.png
```

This is a layout example, not enough data for training. Each split needs images from all five classes. Images placed directly under a class folder are rejected because the loader would have no sheet ID. Use CSV input if contributors need to be grouped or splits need to be assigned manually.

### Why grouping matters

The dataset is divided into three parts:

- Training images are used to update the model’s weights, the numbers it learns during training.
- Validation images help select the best model and decide when training should stop.
- Test images are kept aside for evaluation after training.

Crops from the same sheet must stay in one part. Otherwise, the model could see similar drawing styles or backgrounds during both training and testing, making its test results look better than they should. This is called data leakage.

The default split groups images by `sheet_id`. Set `split.group_by: contributor_id` to keep all sheets from the same person together as well. Contributor grouping is useful when checking how the model handles a new person’s handwriting.

The split code also keeps images with identical results under the default preprocessing together, even if their sheet IDs differ. It does not detect every near-duplicate, so accurate sheet IDs still matter.

Automatic splitting supports collections where each photographed sheet contains only one class. It first finds an assignment that puts all five classes in training, validation and test without separating related images. It then places the remaining groups to get reasonably close to the requested class counts. The seed makes the assignment repeatable.

Each class needs at least three independent groups after sheet, contributor and duplicate grouping. For example, three coin sheets from one person count as only one group when contributor grouping is selected. Having three groups per class is necessary, but overlapping contributor groups can still make an assignment impossible. The error explains whether a class has too few groups or the combined grouping rules prevent a valid split.

The default targets are 60% training, 20% validation and 20% testing. Class coverage and keeping groups together take priority over exact percentages. A small dataset with only three single-class sheets per class will need one of each class in each split, even though that gives roughly equal split sizes. Collect more independent sheets or contributors for a closer match. Explicit splits are also checked for class coverage and leakage. Do not change the seed just to get a better test score.

## Train the model

For CSV input:

```bash
python -m ml.train --config ml/config.yaml --data ml/data/real/metadata.csv --output ml/runs/real
```

For folder input, replace the data argument:

```bash
python -m ml.train --config ml/config.yaml --data ml/data/real --output ml/runs/real
```

Only run the command that matches the dataset layout. Use a separate output directory for each experiment because files from an earlier run can be overwritten.

Training uses Adam, an algorithm that updates the model’s weights, and cross-entropy loss, which measures how far the predicted class scores are from the labels. One epoch means one pass through the training images. Validation runs after every epoch.

### Configuration

`ml/config.yaml` contains the defaults. Paths in the YAML file and command arguments are relative to the current working directory. CSV image paths are the exception: they are relative to the CSV itself.

| Setting | Default | Meaning |
| --- | --- | --- |
| `seed` | `42` | Makes random choices repeatable on the same setup |
| `device` | `cpu` | Selects CPU, CUDA or automatic device selection |
| `threads` | `2` | Number of CPU threads used by PyTorch |
| `data` | `ml/data/synthetic/metadata.csv` | Dataset folder or CSV |
| `output` | `ml/runs/default` | Directory for training outputs |
| `preprocessing.size` | `64` | Width and height of the prepared image |
| `preprocessing.threshold` | `true` | Converts grayscale pixels to black or white before resizing |
| `model.channels` | `[16, 32, 64]` | Feature counts in the convolution layers |
| `model.hidden` | `64` | Size of the dense layer used for classification |
| `model.dropout` | `0.2` | Fraction of hidden values randomly disabled during training to reduce memorisation |
| `split.val_fraction` | `0.2` | Approximate validation share |
| `split.test_fraction` | `0.2` | Approximate test share |
| `split.group_by` | `sheet_id` | Groups by sheet or contributor |
| `training.epochs` | `30` | Maximum number of training passes |
| `training.batch_size` | `32` | Number of images processed together |
| `training.learning_rate` | `0.001` | Controls the size of weight updates |
| `training.weight_decay` | `0.0001` | Penalty that discourages large weights |
| `training.patience` | `5` | Consecutive epochs without enough validation improvement before stopping |
| `training.min_delta` | `0.0001` | Required decrease in validation loss to count as improvement |
| `training.augment` | `true` | Applies small image variations during training |

The command line can override `data`, `output` and `epochs`; other settings are changed in YAML. The model accepts one to five convolution blocks. Each block uses a convolution, ReLU activation and max pooling, followed by adaptive pooling before the dense layers. Pooling reduces the image features to a smaller representation. Larger networks need an input size that can pass through all pooling layers.

### Image preparation

Training and prediction share the same preprocessing steps:

1. Open the image, apply its stored orientation when available and convert it to grayscale.
2. If enabled, apply Otsu thresholding, which chooses a cutoff to separate dark strokes from light paper.
3. Resize while keeping the original width-to-height ratio, then centre the image on a white square. The longest side has a two-pixel margin at the default settings.
4. Convert pixel values to float32 numbers between 0 and 1, with paper near 0 and ink near 1.

Only training images receive augmentation: small random rotations, size changes and shifts. Images are not flipped because a flipped letter may no longer represent the intended symbol. Set `preprocessing.threshold: false` if black-and-white conversion removes useful detail from real scans.

The Python preprocessing function accepts a file path, a Pillow image or a NumPy array. Arrays must use `uint8` values and grayscale, RGB or RGBA channels. OpenCV colour arrays use BGR by default and must be converted to RGB first.

### Saved outputs

The training output directory contains:

- `best.pt`: a checkpoint saved when validation loss improves by more than `min_delta`.
- `history.json`: training and validation loss and accuracy for each completed epoch.
- `splits.json`: image paths relative to the dataset directory, labels and SHA-256 hashes for each split. A SHA-256 hash records the file contents so later changes can be detected.

A checkpoint stores model weights, optimizer state, class order, configuration, the portable split manifest, its format version, the saved epoch and validation loss. It can be loaded for evaluation and prediction. Automatic training resume is not implemented.

Python, NumPy and PyTorch seeds are set for repeatability. Training uses deterministic operations and zero background data-loader workers. Identical results across different hardware or package versions are not guaranteed.

## Evaluate a saved model

```bash
python -m ml.evaluate ml/runs/real/best.pt --output ml/runs/real/evaluation
```

Evaluation uses the test images recorded in the checkpoint. Image identifiers are paths relative to the dataset folder, or relative to the CSV’s parent folder for CSV input. Keep that internal folder layout when moving the dataset. CSV image paths should also be relative so the metadata can move with the images. All referenced images must be inside the CSV’s parent directory or its subdirectories; external paths are rejected because they do not share a portable dataset root.

Use `--data` to select the new location:

```bash
python -m ml.evaluate ml/runs/real/best.pt --data /new/location/real/metadata.csv --output ml/runs/real/evaluation
```

For folder input, pass `/new/location/real` instead. Without `--data`, evaluation uses the original dataset setting stored in the checkpoint. The new location must contain the same saved test images, not a replacement test set. Before computing metrics, evaluation checks that every test identifier exists, its label matches and its file bytes match the saved hash. Even re-encoding an image changes its bytes and requires a new training run if that version is to be evaluated. Keep an unchanged copy of the original data.

Older checkpoints with absolute-path manifests do not contain the labels and hashes needed for these checks. Retrain once to produce the new portable manifest. Existing checkpoints can still be used for single-image prediction.

The output directory receives `metrics.json` and `confusion_matrix.png`. The report includes:

- Accuracy: the fraction of test images classified correctly.
- Precision: how often predictions for a class are correct.
- Recall: how many actual examples of a class are found.
- F1-score: a combined measure of precision and recall.
- Confusion matrix: a table showing which actual classes were predicted as each class.

Precision, recall and F1 are reported per class, as a macro average that gives every class equal weight, and as a weighted average based on class counts.

## Predict one symbol

```bash
python -m ml.predict ml/runs/real/best.pt path/to/cropped_symbol.png
```

Replace the image path with an actual crop. Prediction uses the model settings and preprocessing stored in the checkpoint. Evaluation and prediction also accept `--device cpu`, `--device cuda` or `--device auto`.

The JSON result contains `predicted_class`, `confidence` and `scores` for all five labels. The scores come from softmax, which converts the model’s outputs into values that sum to one. These values have not been calibrated against real handwriting, so a score of 0.9 should not be treated as a proven 90% chance of being correct. Blank images and unknown symbols still receive one of the five labels; there is no rejection option yet.

Only load checkpoints from trusted sources. Loading uses PyTorch’s restricted `weights_only=True` mode.

## Module guide

| File | What it does and why it is needed |
| --- | --- |
| `__init__.py` | Defines the shared class order so labels stay consistent across training and prediction. |
| `preprocess.py` | Converts different image inputs into the same tensor format, keeping training and inference consistent. A tensor is the numeric array passed to PyTorch. |
| `dataset.py` | Reads folders or CSV metadata, finds class-covering group splits, builds portable manifests and checks test image labels and hashes. It also supplies samples to the training loader. |
| `model.py` | Defines the configurable CNN that learns to classify each crop. |
| `runtime.py` | Reads YAML settings, sets random seeds, selects a device and reloads checkpoints. These shared steps are used by several commands. |
| `train.py` | Updates model weights, checks validation results, stops training early and saves the best checkpoint. |
| `evaluate.py` | Measures the saved model on held-out test images and writes metrics and a confusion plot. |
| `predict.py` | Loads a checkpoint and returns a class and scores for one image. |
| `synthetic.py` | Generates small artificial datasets for checking the code before real images are available. |
| `config.yaml` | Stores settings so experiments can be changed without editing training code. |
| `requirements.txt` | Lists the packages needed to run and test the module. |
| `tests/test_pipeline.py` | Checks the main steps and expected errors using temporary synthetic images. |

## Tests and common problems

Run the automated checks from the repository root:

```bash
python -m pytest ml/tests -q
```

Tests cover image dimensions, invalid inputs, folder and CSV loading, grouped and explicit splits, duplicate leakage checks, the model’s forward pass, training and validation, early stopping, checkpoint loading, repeatable training, evaluation and prediction. They also check one-class-per-sheet collections, impossible group assignments, moved datasets, changed labels and image contents, and consistent preprocessing during prediction.

The GitHub Actions workflow in `../.github/workflows/ml-tests.yml` runs the suite on Python 3.12 with CPU PyTorch for pushes to `main` and `feature/ml-pipeline`, and for pull requests targeting `main`. No real dataset or GPU is needed.

Common setup and data errors:

- `Dataset does not exist`: check `--data` or the `data` setting and run from the repository root.
- `CSV requires path,label,sheet_id columns`: add the required header fields.
- Too few independent groups or no valid assignment: collect more independent sheets or contributors for the affected classes. Check that grouping IDs describe the collection correctly.
- An explicit split lacks a class: prepare assignments containing every class in each split.
- `Data leakage`: keep related sheets, contributors or identical preprocessed images in the same split.
- A held-out image is missing or fails its label/hash check: check the dataset location and restore the unchanged training data.
- `CUDA requested but unavailable`: use `cpu` or `auto`, or check the GPU and PyTorch installation.
- Synthetic output directory is not empty: reuse the existing dataset or choose a new directory.

Keep local images under `ml/data/` and generated results under `ml/runs/`. Both are ignored by Git, as are checkpoints, virtual environments and Python caches. Other custom data or output locations need their own ignore rules before committing.

## Work still needed

The CPU workflow has passed automated tests and a short synthetic training run. Real handwriting performance still needs to be measured after labeled images are collected. GPU execution, confidence calibration and handling unknown symbols also need further work. Full-sheet object localisation and the playable game are outside this module’s current scope.
