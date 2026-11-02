# Sketch detection and dataset collection

The real handwritten sheets and trained weights are not available yet. This tool
finds possible ink regions and helps people save labeled crops. A candidate is
not a recognized game object. Synthetic checks do not measure handwriting accuracy.

## Run the local tool

From the repository root, using the project's Python environment:

```bash
python -m pip install -r sketch/requirements.txt
python -m sketch.app --data ml/data/collected
```

Open http://127.0.0.1:7860 in a browser. The server binds to localhost. It is a local
collection tool, with no accounts or permissions. Do not expose it as a public
service. Use `--port` to choose another port.

1. Choose a PNG or JPEG sheet, then click **Detect drawings**.
2. Choose adaptive thresholding for changing lighting, or Otsu for even lighting.
3. Check every box and crop preview. Uncheck bad suggestions or remove them.
4. Change X, Y, width and height to correct boxes. Drag on the image to add a
   missed drawing, or use **Add box using numbers**. Coordinates are whole pixels
   in the EXIF-oriented image, with the origin at the top left.
5. If the background is included, enter a paper crop, select **Detect only inside
   this area**, and detect again. This replaces the current suggestions. It does
   not change the source image or the coordinate system.
6. Select the class drawn on the sheet: rectangle=`platform`, circle=`coin`,
   triangle=`spike`, S=`spawn`, G=`goal`.
7. Enter a unique sheet ID and a contributor code. Use the same contributor code
   for the same person, including anonymous contributors. Do not use private names
   when a code is enough. Save the accepted crops.
8. Export `metadata.csv` and put it inside the dataset root (`ml/data/collected`
   by default), beside `crops/`. Export again after adding more samples.

Each sheet has one class. Reusing a sheet ID with another image, contributor or
class is rejected. Uploading the same oriented image under another sheet ID is
also rejected. Saves add samples; they do not delete earlier saved crops. Review
before saving. This version has no saved-sample relabel or deletion screen.

## Saved data and training

```text
ml/data/collected/
  originals/<sheet-hash>.source
  crops/<sample-hash>.png
  processed/<sample-hash>.png
  collection.sqlite3
  metadata.csv                 # downloaded export
```

Original upload bytes stay in `originals/`; `.source` files are the unchanged
PNG or JPEG and can be opened with Pillow. `crops/` contains full-resolution RGB
crops. `processed/` contains 64×64 previews made by the current default ML
preprocessing. Training reads the RGB crops and applies its configured preprocessing,
not the preview images. The SQLite index stores labels, contributor IDs, sheet
IDs and the corrected boxes. Keep it with the images and back up the whole folder.

CSV columns are `path,label,sheet_id,contributor_id,box,original_path`. The existing
training loader uses the first four columns and ignores the extra review fields.
Paths are relative to the CSV. Keep crops from a sheet in one split. Set
`split.group_by: contributor_id` in the ML config to keep a writer's sheets together.
The existing loader checks split leakage and requires all five classes. Automatic
splitting needs at least three independent groups per class, and may need more
when contributor groups overlap. See [the ML guide](../ml/README.md).

```bash
python -m ml.train --config ml/config.yaml --data ml/data/collected/metadata.csv --output ml/runs/real
```

Exact duplicates after default ML preprocessing are skipped across the collection.
A duplicate with a different label is rejected. This may skip identical clean
synthetic shapes; it does not detect all near-duplicates or alternate crops of the
same drawing. Keep sheet and contributor IDs accurate. Detection and duplicate
settings will need review on real sheets.

`ml/data/` is ignored by Git. Keep real images there. If choosing another storage
folder, use a location outside the repository or add an ignore rule before saving.
No real dataset or checkpoint is included in this change.

## How detection works

`detection.py` checks image bytes and size limits (5 MiB, 4096 pixels per side,
12 million pixels), verifies PNG/JPEG content, applies EXIF orientation and places
transparent PNGs over white. Detection converts to grayscale, works at a limited
size (1600 pixels on the longest side by default), smooths small noise, thresholds
the page and closes short stroke gaps. External contours give candidate boxes;
small ink regions are filtered. Padding and coordinates are mapped back to the
oriented source image. `preview(image, boxes)` draws boxes on a copy of that image.

`detect()` accepts `method`, `min_area_ratio`, `max_side` and an optional manual
`region`. Use `crop()` to extract a validated box. Invalid boxes are rejected,
not clamped. The manual region is the fallback for paper cropping. Automatic paper
boundary detection and perspective correction are not implemented: dark desk
edges, shadows and skew need real photo tests before adding that behavior.

Disconnected strokes may produce several boxes. Touching shapes may share one
box. Nested shapes may be merged. Light pencil, severe shadows, ruled paper,
large rotations, perspective, very thin strokes and small distant symbols may
fail. Size limits are intentional; resize larger photos before uploading. Manual
editing is needed when automatic boxes are wrong.

## CNN connection

```python
from sketch.detection import load_image, detect
from sketch.inference import classify_candidates

image = load_image('sheet.jpg')
boxes = detect(image)
result = classify_candidates(image, boxes, checkpoint=None)
# Later, supply a trusted real checkpoint path instead of None.
```

Without a checkpoint, this returns `model_status: unavailable`, the candidate
boxes and `review_required: true`. It returns no predicted labels or confidence
scores. With an existing checkpoint, the adapter calls `ml.predict.predict` on
each RGB crop. That function loads the checkpoint's preprocessing and class order.
Labels, scores and coordinates stay together. Scores below `review_threshold`
(default 0.8) are flagged for review. This threshold is a starting setting, not a
calibrated handwriting confidence threshold. Unknown symbols still receive one of
the five labels when a model runs. Review remains necessary.

A supplied corrupt or incompatible checkpoint raises an error; there is no mock
fallback. Only load trusted checkpoints. The current adapter reloads the model
for each crop; batch loading can be added if measured latency needs it. The public
candidate endpoint deliberately does not select or load a model from upload data.

## Frontend and backend API

Install `backend/requirements.txt` for candidate detection without PyTorch, and
start the existing backend as described in [its guide](../backend/README.md).
Existing level routes, mock mode and the level schema stay the same.

`POST /api/sketch/candidates` takes multipart `file`, optional query `method`
(`adaptive` or `otsu`) and `min_area_ratio` (default `0.00008`). Example response:

```json
{
  "image": {"width": 600, "height": 400, "coordinates": "exif_oriented_pixels"},
  "stage": "candidates",
  "image_analyzed": true,
  "model_status": "unavailable",
  "candidates": [
    {"id": "candidate_0", "x": 27, "y": 37, "width": 127, "height": 57, "review_required": true}
  ],
  "warnings": ["Unclassified candidates need review. No CNN was run."]
}
```

A blank sheet returns an empty candidate list. IDs are local to each detection
request. Do not use them as permanent sample IDs. The frontend should display the
EXIF-oriented image and allow users to add, remove, resize, label and review boxes.
It should not treat these candidates as finished game objects.

`POST /api/sketch/reviewed-level` takes JSON with `image_width`, `image_height`,
`world_width`, `world_height` and `objects`. Each object needs `id`, `type`,
`x`, `y`, `width`, `height`, and `reviewed: true`. Positions are in oriented image
pixels. Only the five known types are accepted. The shared `image_to_world`
utility fits the image into the world without stretching, centering unused space.
Portrait and landscape images use the same rule. Spawn is anchored at the bottom
centre of its scaled box, then uses the game's fixed player width and height.
Goal keeps its scaled box; the checker uses the fixed player dimensions for reach.
No invalid position is moved into bounds. The shared validator rejects invalid
geometry, missing spawn/goal, overlaps and unsupported dimensions.

The response is `{ "level": <schema 1.0 document>, "playability_checked": false }`.
It is a validated draft, not a promise that the goal is reachable. Review the
returned spawn position, save through `POST /api/levels`, and use the existing
`POST /api/levels/{id}/validate` and game preview to check playability. This route
does not save a level. Invalid/incomplete inputs return 422; oversized uploads
return 413. Existing backend error responses use its normal `error` envelope.
`/api/levels/from-sketch?mode=real` still returns 503. Mock mode stays explicit.

## Checks and remaining work

```bash
python -m pytest ml/tests backend/tests contracts/tests playability/tests sketch/tests -q
cd game
npm test
npm run typecheck
npm run build
npm run test:browser
npm run test:collection
```

For a custom Python interpreter, set `DREAMCRAFT_PYTHON` for browser tests. Set
`CHROMIUM_PATH` if using system Chromium rather than Playwright's installed browser.

Synthetic tests cover loading, EXIF rotation, transparent input, bad files, blank
paper, single and multiple symbols, scaling, portrait images, controlled lighting,
noise, crop bounds and corrections, CSV export, grouping metadata, duplicate
checks, missing weights, CNN call arguments, real model execution with test-only
untrained weights, candidate responses and invalid/incomplete reviewed levels.
The collection browser test uploads a generated drawing, edits a box, rejects a
crop, adds a box by dragging, saves, checks duplicate handling and exports metadata.
Test-only untrained weights check plumbing; they are not a trained recognizer.

Still required after the sheets arrive: test varied writers and real photos,
measure box recall and crop quality, tune detection without using the test split,
collect enough independent groups, train and evaluate a checkpoint, calibrate
review thresholds and measure the full correction workflow. No handwriting
accuracy, real-photo reliability or trained recognition result is claimed here.

Local verification for this change passed 123 Python tests, 27 game unit tests,
type checking, the production build, 16 gameplay browser tests and one collection
browser test using system Chromium. The build still reports its existing large
JavaScript bundle warning. Python reports dependency deprecation warnings. No
real handwritten sheets, trained checkpoint or GPU were used in these checks.
