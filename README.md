# DreamCraft

DreamCraft is a college mini-project with the goal of turning hand-drawn 2D game levels into playable games. The drawings use simple symbols for platforms, coins, spikes, the player’s starting point and the goal.

The repository currently contains the machine learning module for classifying one cropped symbol at a time. It includes image preparation, CNN training, evaluation and prediction. A CNN (convolutional neural network) learns image patterns that help it tell the five symbol types apart.

## Current scope

The ML module can:

- Load labeled images from folders or a CSV file.
- Prepare grayscale images and train a configurable model on CPU, with optional GPU support.
- Keep images from the same drawing sheet together, with every class in each split when the groups allow it. Contributor grouping is also supported.
- Save the best model, evaluate it on separate test images and predict a single symbol. Saved test images can be found after moving the dataset, with label and file checks before evaluation.
- Generate a small artificial dataset to check that the training steps run.

The handwritten dataset is not available yet. The artificial examples are only for checking the code; their scores do not show how well the model will recognise real drawings. CPU training has been tested. GPU training still needs testing.

## Planned work

The upload interface, finding symbols on a full drawing, converting their positions into a level and running that level as a playable game are planned for later. The current classifier expects an image that has already been cropped around one symbol.

## Symbol labels

| Label | Drawing | Intended game object |
| --- | --- | --- |
| `platform` | Rectangle | Surface the player can stand on |
| `coin` | Circle | Collectible item |
| `spike` | Triangle | Obstacle |
| `spawn` | S | Player starting point |
| `goal` | G | Level endpoint |

These label names must also be used in the dataset.

## Getting started

Use Python 3.12 for the tested setup. From the repository root, create and activate a virtual environment, which keeps the project’s Python packages separate from other projects:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install 'torch>=2.6,<3' --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r ml/requirements.txt
python -m pytest ml/tests -q
```

These activation commands are for Bash on Linux or macOS. On Windows PowerShell, use `.venv\Scripts\Activate.ps1` instead of `source .venv/bin/activate`.

Next, follow the [ML guide](ml/README.md) to generate sample images, run a short training check or prepare real data. It also explains the configuration, output files and each Python module.

## Repository layout

```text
DreamCraft/
  README.md             Project overview
  ml/
    README.md           Setup and ML usage guide
    config.yaml         Dataset, model and training settings
    requirements.txt    Python dependencies
    tests/              Automated checks
    *.py                Dataset, training and prediction modules
```

Local datasets belong in `ml/data/` and training results in `ml/runs/`. Both directories are ignored by Git, along with model checkpoints and virtual environments. Keep datasets and trained weights out of commits.
