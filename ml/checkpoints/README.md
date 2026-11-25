# Shared model

`best.pt` is the trained file supplied by the project owner. It is 2,678,625 bytes
and is small enough to keep directly in Git. A normal clone includes it; Git LFS
and a separate download are not needed. This is the only checkpoint allowed by
`.gitignore`. Datasets and new training outputs still belong in ignored folders.

The SHA-256 is:

```text
18a5d4ddbdb7bcce769dcb127e2d61bbd83ee7b6501e9bddc3ad0ffeeaf35ffd
```

The file is unchanged from the owner's upload. It uses the existing five classes,
64 by 64 grayscale preprocessing with thresholding, and the existing CNN. Source
data came from Quick, Draw! and EMNIST; see [source credits and terms](../PUBLIC_DATASETS.md).
The owner's reported 98.84% accuracy and 98.85% macro F1 measure individual public
symbol crops. Those figures have not been reproduced here and do not measure
recognition of photographed levels.

From the repository root, use this model in Codespaces or Linux:

```bash
export DREAMCRAFT_CHECKPOINT="$PWD/ml/checkpoints/best.pt"
export OMP_NUM_THREADS=2
export MKL_NUM_THREADS=2
python -c "from sketch.model_service import local_predictor; print(local_predictor()[2])"
```

In Windows PowerShell:

```powershell
$env:DREAMCRAFT_CHECKPOINT = (Resolve-Path 'ml/checkpoints/best.pt').Path
$env:OMP_NUM_THREADS = '2'
$env:MKL_NUM_THREADS = '2'
.\.venv\Scripts\python.exe -c "from sketch.model_service import local_predictor; print(local_predictor()[2])"
```

The check should print `ready`. Follow the [application run commands](../../README.md)
to start both servers. The server still requires an explicit path. Without one,
manual editing and sample games work, but automatic recognition is unavailable.
An explicit missing or broken path does not fall back to this file or to a mock.
Requests cannot choose a path or upload model files.

To use a newer trusted checkpoint, point the same variable at a file in
`ml/runs/` or another local folder. To replace this shared version, update its
checksum and size in `model.json`, test loading and predictions, and open a PR.
Never load untrusted checkpoints. Loading uses PyTorch's `weights_only=True`.
