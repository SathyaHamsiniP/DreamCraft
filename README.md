# DreamCraft

DreamCraft is a college mini-project that aims to turn hand-drawn 2D levels into playable platform games. The drawings use rectangles for platforms, circles for coins, triangles for spikes, S for spawn and G for the goal.

The game and backend can run now using sample JSON levels. Real drawing recognition is not connected yet: the handwritten dataset, object detector and trained CNN checkpoint are still needed. Mock uploads return clearly marked sample levels and do not analyse the drawing.

## What works

- A Phaser game with movement, jumping, solid platforms, coins, spikes, death, restart and victory.
- A shared, validated level format and one versioned physics configuration.
- A FastAPI service that saves, lists, reads and updates levels in SQLite.
- JPEG/PNG upload checks and separate mock and real-recognition adapters. Real mode returns an unavailable error until the detector and model are connected.
- A bounded physics-based route search that returns reachable, unreachable or unknown with an explanation.
- The existing CNN pipeline for cropped symbols, including grouped dataset splits, training, evaluation and portable checkpoints.

The browser tests replay seven checker routes in real Phaser, including multiple jumps and jumps near the movement limits. This verifies those examples, not every possible level. The API marks each newly computed path as unverified until it is replayed. A failed search returns unknown unless a supported height-bound proof applies.

## Start locally

Use Python 3.12 and Node.js 22 or newer. Run from the repository root:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r backend/requirements.txt
npm ci --prefix game
```

For Windows PowerShell, activate with `.venv\Scripts\Activate.ps1` instead. The Bash commands below assume Linux or macOS.

Start the backend in one terminal:

```bash
python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

Start the game in another terminal:

```bash
npm --prefix game run dev
```

Open the local Vite address from the terminal. Select a sample, click Load sample, then press Enter. The standalone game works without the backend. To load a stored level, keep the backend running, enter its ID in Saved level ID and click Load saved level. The game uses `http://127.0.0.1:8000` by default; set `VITE_API_URL` before starting Vite to change it.

The API guide is available at `http://127.0.0.1:8000/docs`. This is a local development setup with no authentication, not a public deployment.

## Controls

| Key | Action |
| --- | --- |
| Enter | Start |
| A / left arrow | Move left |
| D / right arrow | Move right |
| Space / W / up arrow | Jump from a platform; release before another jump |
| R | Restart, including after death or victory |

Spikes and falling below the world cause death; press R to restart. Coins increase the score once each. Reaching the goal ends the level even if coins remain.

## Save and check a sample

With the backend running:

```bash
curl -X POST http://127.0.0.1:8000/api/levels \
  -H 'Content-Type: application/json' \
  --data-binary @contracts/examples/multi-jump.json
```

Copy the returned ID into the game's Saved level ID field. The response contains the level, creation time and update time. To retrieve it or check its route:

```bash
curl http://127.0.0.1:8000/api/levels/LEVEL_ID
curl -X POST http://127.0.0.1:8000/api/levels/LEVEL_ID/validate
```

Replace `LEVEL_ID` with the actual ID. The validator can also run without a server:

```bash
python -m playability.validator contracts/examples/multi-jump.json
```

## Project structure

| Directory | Purpose |
| --- | --- |
| [`contracts/`](contracts/README.md) | JSON Schema, coordinate conversion, shared physics and sample levels |
| [`game/`](game/README.md) | Phaser engine, standalone demo, mount interface, TypeScript and browser tests |
| [`backend/`](backend/README.md) | FastAPI routes, SQLite storage, image checks and recognition adapters |
| [`playability/`](playability/README.md) | Bounded movement search, route output and uncertainty rules |
| [`ml/`](ml/README.md) | Existing cropped-symbol CNN training and prediction pipeline |
| `.github/workflows/` | ML tests and game/backend CI |

All object positions are top-left world coordinates, measured in pixels. There must be exactly one spawn and one goal. The player starts in the spawn rectangle, which must be 20×30. Platforms are solid rectangles; spikes use rectangular hitboxes even though they look triangular. The [contract guide](contracts/README.md) explains the full rules and each sample.

Physics version 1.0 uses gravity 900 pixels/s², speed 180 pixels/s, jump velocity -360 pixels/s and a 60 Hz update rate. The measured jump rise is 69 pixels. The checker reads the same settings, but collision differences are still possible on untested geometry.

## Run tests

After installing backend and game dependencies:

```bash
python -m pytest contracts/tests backend/tests playability/tests -q
npm --prefix game test
npm --prefix game run typecheck
npm --prefix game run build
cd game
npx playwright install --with-deps chromium
npm run test:browser
```

The browser suite starts its own backend on port 8001 with a temporary database and the game on port 5173. It saves a level, retrieves it, requests a route, loads that saved level through the demo and plays it using keyboard input. It also tests mock uploads, movement, collisions, error handling and scene reloads. Stop other servers on these ports before running it. See the [game guide](game/README.md) for using an installed Chromium or a specific Python executable.

For the ML tests, install CPU PyTorch and the remaining packages in the same Python environment:

```bash
python -m pip install 'torch>=2.6,<3' --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r ml/requirements.txt
python -m pytest ml/tests -q
```

No real dataset or GPU is needed for these tests. Synthetic ML scores and mock outputs do not show accuracy on real handwriting.

## Connecting the next parts

The [game mount API](game/README.md) can be called from a future React component and destroyed during component cleanup. A full React editor is not included.

For real recognition, the adapter should use OpenCV to locate boxes, send each crop to the existing CNN, convert the boxes to world coordinates, and return objects for review. `contracts.coordinates.image_to_world` already handles aspect-preserving scale and padding. The classifier does not locate objects in a full image. The game and storage API only need the shared level document, so they do not depend on a particular detector.

## Limits and local files

Playability search is approximate and bounded. It can miss real routes, and arbitrary returned routes still need Phaser replay. Only a limited height-bound case is reported as proven unreachable. Moving platforms, slopes and extra jumps are not supported. GPU training and real handwriting accuracy remain unverified. The production game build currently reports a large-bundle warning because it includes Phaser.

SQLite data lives under `backend/data/` by default. Keep ML images in `ml/data/` and ML outputs in `ml/runs/`. Databases, uploads, checkpoints, virtual environments, `node_modules`, build files and test reports are ignored by Git. Do not commit datasets, weights or secrets.

## Sketch detection and sheet collection

The [sketch tool guide](sketch/README.md) explains how to detect possible symbols,
correct boxes, collect labeled crops and export training metadata. It works without
a trained checkpoint. Real handwriting and real-photo accuracy are still untested.
