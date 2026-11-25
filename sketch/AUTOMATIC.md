# Automatic sketch games

Automatic generation is the default Studio mode on `main`. The owner's shared
checkpoint is included at `ml/checkpoints/best.pt`. Select it with the backend's
`DREAMCRAFT_CHECKPOINT` variable. Do not put this path in a Vite variable. Other
training outputs remain ignored by Git.

Upload a PNG/JPEG and click **Generate My Game**. No label, box review or world
measurement is required when recognition and route checks pass. Use **Advanced
Edit** for optional manual work. The existing candidate and reviewed-level APIs
keep their payloads. Advanced Edit uses one **Approve all** action; added boxes
need approval, while moving or relabeling an approved box keeps its approval.

## A new GitHub Codespace

Open a Codespace for SathyaHamsiniP/DreamCraft. Run this from its repository terminal:

```bash
git status
git fetch origin
git switch main
git pull --ff-only
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install 'torch>=2.6,<3' --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r sketch/requirements.txt
npm ci --prefix game
npm ci --prefix frontend
```

Use Node 24 or Node 22.12 or newer. Codespaces usually includes Node and Python.
Check with `node --version` and `python3 --version`. If the Node version is too old
and your Codespace includes nvm, run `nvm install 24` and `nvm use 24` before npm ci.

A normal clone or pull includes the shared model; no separate upload is needed.
See its [checksum and source notes](../ml/checkpoints/README.md). To use another
trusted model, copy it to an ignored local folder and set its absolute path.

In the first terminal, with the virtual environment active:

```bash
export DREAMCRAFT_CHECKPOINT="$PWD/ml/checkpoints/best.pt"
export OMP_NUM_THREADS=2
export MKL_NUM_THREADS=2
python -c "from sketch.model_service import local_predictor; s=local_predictor()[2]; print('CNN status:',s); raise SystemExit(0 if s=='ready' else 1)"
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

The check must print `CNN status: ready`. If it does not, check the selected file,
installed dependencies and checkpoint class order. Do not treat manual fallback as
working recognition. Keep this terminal running.

Open a second terminal in the repository:

```bash
npm run dev --prefix frontend
```

Open **Ports**, then **Open in Browser** beside **5174**. Vite forwards `/api` to the
backend on 8000. No forwarded backend URL or frontend/.env.local is needed for this
setup. These are development servers. A public deployment also needs a reverse
proxy, access controls, durable storage and request limits appropriate to its users.

After stopping a server with Ctrl+C, restart it with the same commands. In a new
backend terminal, activate `.venv` and set the environment variables again. Do not
recreate your virtual environment or reinstall dependencies on every restart.

## Detection and recognition

`POST /api/sketch/generate` accepts multipart `file`, `allow_repairs` (default true)
and optional `corrections` (a JSON map of candidate ID to one of the five labels or
`ignore`). Images use the same size limits, EXIF normalization and crop coordinates
as the existing sketch tools. No HTTP field can choose a checkpoint path.

The endpoint loads real CNN weights through the existing adapter. It checks score
validity, a minimum score of max(0.9, DREAMCRAFT_REVIEW_THRESHOLD), a top-two score
margin of 0.2, and label/score stability after adding a small white crop margin.
Independent contour checks reject tiny regions, several substantial fragments and
basic shape mismatches. Squares alone are not accepted as horizontal platforms.
This does not make confidence a calibrated probability of correctness. Letters,
joined objects and unfamiliar drawings can still be confidently wrong.

Short gaps in strokes may close during OpenCV detection. Larger fragments,
touching/overlapping symbols, text, shadows, faint ink and clutter can split or merge
candidates. This importer does not claim to solve general object separation. It
stops or asks about ambiguous candidates instead of inventing missing objects.
Exactly one recognized spawn and goal are required. No missing spawn/goal is added.

Only unclear candidates need quick label correction. The endpoint reruns detection
and inference on the same upload when corrections are submitted, validates their
IDs and records user labels separately from CNN predictions. A missing drawing or
ambiguous geometry may require Advanced Edit. That mode still supports manual use
without any checkpoint.

## Geometry and bounded repairs

World dimensions fit the image into 960 by 720 without changing its aspect ratio.
The shared coordinate converter maps all boxes once. Spawn uses the existing fixed
player dimensions and bottom-centre anchor. The level JSON schema is unchanged.
Automatic labels are never recorded as human-reviewed labels.

Coins always use 20 by 20 world units at the detected centre. Spikes always use
48 by 24 at the detected bottom centre. Both automatic and reviewed creation use
these sizes, even when optional repairs are off. The original interpretation and
automatic size changes are recorded. Artwork and collision bodies use the returned
dimensions. Existing saved JSON is not rewritten. An isolated standard spike has
been cleared with one jump in the real game; nearby gaps and ledges can still make
a route difficult.

Small repair permission is visible before generation and can be turned off. Spawn
and goal can align by up to 18 units to a single nearby support. Up to eight supported
spikes can be seated on their platform. Speed, gravity and jump power are unchanged.
Every fit records before/after geometry.

At most two new 48 by 12 bridges are tried for clear gaps between 80 and 240 units.
Platform height difference must be at most 60% of the shared jump rise, and a bridge
must not overlap an object. Each trial is validated and searched again. Proposed
bridges are retained only when the whole route is reachable; otherwise they are
discarded. More than two suitable gaps, a 400-unit gap or a distant high goal still
need help. Original platforms are never moved, and hazards are never deleted.

Geometry is checked after each fit. Alongside one size change per coin or spike,
there are at most twelve optional changes (two marker alignments, eight hazard
placements and two bridges), and three route searches.
Each search is bounded to 12,000 states, 1.5 seconds and 1,200 ticks. A failed search
is not proof of impossibility. The browser still verifies the final route in Phaser.

Automatic detection also tries separating upward triangles resting on a platform.
It requires two long horizontal rails, closed sides and triangular ink above the
upper rail. It uses the observed base pixels, not a generated triangle. These crops
are still classified by the real CNN. This handles common touching triangle/platform
sketches, including several triangles on one ledge. Letters, circles, heavily slanted
paper and unclear joins can still need correction. The manual candidate API keeps
its previous detection defaults.

The response includes `original_level`, `level`, `changes` with before/after objects,
`attempts`, `issues`, `candidates`, `model_status`, `stages` and `assessment`.
`awaiting_phaser` means Python found an approximate route. `needs_correction` means
no finished game is claimed. Server `verified_in_game` is always false.

React replays a candidate route in the actual Phaser engine. Only reaching the goal
sets the displayed status to `verified` and opens the playable game. Failed replay
shows unknown and keeps Advanced Edit available. This is a verification of one
route in the engine, not a guarantee that recognition is correct or that a human
will find the level easy. Timing sensitivity is shown separately from reachability.

Original images and reports stay in this browser session. Download the generation
report to keep the original interpretation and every repair. Saved level JSON keeps
only game objects; it does not store the source photo or repair history. Refresh
and retrieve saved games through My Levels. Production image/report storage can be
added separately without putting metadata into the shared level JSON.

## Tests and limits

Tests use complete controlled scenes containing all five classes. The browser suite
runs actual OpenCV, FastAPI, CNN inference, React, SQLite and Phaser without mocked
API responses. It checks PNG/JPEG, image scaling, portrait scenes, real keyboard
play and goal completion, saving and refresh/loading. Negative cases cover blank,
fragmented and touching drawings, missing weights, low/invalid predictions, invalid
input, bounded repairs and layouts that cannot be safely repaired.

`sketch/tests/automatic_fixture.py` creates a test-only checkpoint using fixed image
filters and prototype output weights for the existing SymbolCNN. No training is
run and this fixture is not committed. It has no value as a handwriting
model. Some resized fixture inputs are deliberately rejected and used to test
minimal correction. These tests establish integration behavior, not real-photo
recognition accuracy. Separate shared-model tests load the owner's supplied
checkpoint, verify its checksum and run real predictions through the adapter.

The Python collision solver remains approximate. Actual replay can reject a route.
The timing probe is limited and is not a human difficulty rating. Real photo tests
with your own checkpoint are still required. Do not infer whole-photo accuracy
from the reported public cropped-symbol test score.

```bash
python -m pytest ml/tests backend/tests sketch/tests contracts/tests playability/tests -q
npm test --prefix frontend
npm test --prefix game
npm run build --prefix frontend
npm run build --prefix game
npx --prefix game playwright install --with-deps chromium
npm run test:browser --prefix game
npm run test:browser --prefix frontend
npm run test:collection --prefix game
```

The React browser command runs both the existing manual/sample suite and the new
automatic suite. Both use isolated temporary databases. CI installs CPU PyTorch for
the controlled-checkpoint automatic tests. No public dataset download is needed.
