# Local CNN recognition

The server classifies OpenCV candidate crops with a trusted local checkpoint. It
keeps the same five labels and level JSON rules. The owner's supplied model is
included at `ml/checkpoints/best.pt`; a normal clone includes it. Its checksum and
source notes are in [the shared model folder](../ml/checkpoints/README.md).
Weights cannot be uploaded through the API or selected by a request.

## Windows laptop setup

Use the included file, or choose another trusted local checkpoint. Run these
PowerShell commands from DreamCraft:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install 'torch>=2.6,<3' --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r sketch/requirements.txt
$env:DREAMCRAFT_CHECKPOINT = (Resolve-Path 'ml/checkpoints/best.pt').Path
$env:OMP_NUM_THREADS = '2'
$env:MKL_NUM_THREADS = '2'
$env:DREAMCRAFT_REVIEW_THRESHOLD = '0.8'
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

For a checkpoint elsewhere, use its Windows path in Resolve-Path instead. These
are server environment variables, not `VITE_` variables. Do not put the checkpoint
path in frontend/.env.local. Uvicorn does not automatically load a .env file.

In a second terminal:

```powershell
npm ci --prefix game
npm ci --prefix frontend
npm run dev --prefix frontend
```

Open http://localhost:5174. In Advanced Edit, upload a sheet and leave
**Suggest symbols automatically** checked, then select **Find shapes**. Correct any
wrong boxes or symbols and confirm them before creating a level. Missing labels
and invalid boxes block level creation. Uncheck the suggestion option to label
manually. The automatic workflow and bulk approval are still on the feature branch
linked in the main README.

For Bash, use `export DREAMCRAFT_CHECKPOINT="$PWD/ml/checkpoints/best.pt"` from
the repository root and start the same backend. Set `OMP_NUM_THREADS=2` and
`MKL_NUM_THREADS=2` as well. No model upload is needed in Codespaces. A different
file on your Windows laptop must still be copied to Codespaces before it can be
used there. Keep new training outputs in ignored folders such as `ml/runs/`.
See the [full run commands](../README.md) for both operating systems.

## Loading and failure behavior

Only DREAMCRAFT_CHECKPOINT selects a model. HTTP requests cannot select paths or
upload weights. Use only checkpoints you trained or otherwise trust. The loader
uses PyTorch's restricted `weights_only=True` mode and CPU inference. Files must
be regular .pt/.pth files up to 200 MiB. Model class order must match the existing
five classes. The saved preprocessing is reused; unsupported preprocessing options
are rejected. Keep PyTorch at least 2.6 and use current patched releases.

Each server process caches one loaded model using resolved path, modification time
and size. Predictions are serialized with a lock and run outside the async request
loop. Replace a checkpoint while the server is stopped, then restart it. There
is no automatic fallback to a different or mock model.

Missing weights return unclassified boxes with `model_status: unavailable`.
Unreadable/incompatible weights return `error`; a bad threshold returns
`invalid_configuration`. Both leave manual boxes usable and show a warning.
Absolute file paths and raw model errors are not returned to the browser.
No checkpoint means no PyTorch import is needed for manual detection.

`POST /api/sketch/candidates` keeps its multipart input and existing response
fields. Optional `classify=false` disables model use for that request. Valid model
results add `predicted_class`, `confidence`, all five `scores`, `low_confidence`
and `prediction_status: predicted` to each candidate. `review_required` is always
true. `model_status: ran` means a real model was invoked, not that every box is a
valid symbol or that the level is playable. Blank detection does not run the CNN.

Unknown labels, non-finite scores, invalid probabilities and prediction failures
leave the affected candidate unclassified with `prediction_status: invalid`.
Only the first 256 boxes are classified per request; remaining boxes stay editable
with `prediction_status: not_run` and a warning. Detection itself still returns
all candidates. Confidence below the configured threshold is highlighted. These
scores are not calibrated probabilities of correctness, and the CNN has no sixth
unknown-symbol class. A wrong or unfamiliar drawing can still score highly.

## Reported training results and limits

The project owner reports a local Windows experiment with 14,847 Quick Draw and
EMNIST samples: 9,000 training, 3,000 validation and 2,847 testing. Reported test
accuracy is 98.84% and macro F1 is 98.85%. The supplied file is now included at
`ml/checkpoints/best.pt`, unchanged from the owner's upload. Its loading and real
inference are tested, but the original dataset and metric reports are not included.
Those figures have not been reproduced here. They measure public symbol crops,
not real complete sketch photographs or OpenCV detection accuracy.

Controlled test-only CNN weights verify genuine CPU execution, API scores, box
coordinates, model caching, missing/corrupt files, manual mode, invalid outputs
and review flags. Frontend tests verify automatic labels, correction and mandatory
review. Existing full browser workflows test manual operation without any production
checkpoint. Shared-model tests also verify the supplied file's checksum, class
mapping and real predictions through the server adapter. No fake model predictions
are used in the application.

Still needed: test the shared model with several real photos,
inspect S/G errors and candidate crop quality, tune the review threshold using
validation examples, and keep an independent photo test set. Do not infer full-app
recognition accuracy from the reported 98.84% cropped-image score.

One studio browser case intercepts a controlled prediction response to test the
editor; Python API tests run the actual CNN with test-only weights. The separate
shared-checkpoint tests run the supplied trained model. Neither check measures
accuracy on real level photographs. Builds still warn about the Phaser bundle
size, and Python dependencies report deprecation warnings.
