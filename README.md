# DreamCraft — AI-powered sketch-to-playable game generator

DreamCraft is a college project that turns a simple hand-drawn **2D platformer level** into a playable Phaser game. Draw horizontal rectangles (**platforms**), circles (**coins**), upward triangles (**hazards**), one **S** (start/spawn) and one **G** (goal). The game currently supports this one platformer genre; maze, racing and survival games are **not yet implemented**.

The default React Studio workflow on the latest development branch is:

**Upload image → Detect shapes (OpenCV) → Recognize symbols (CNN) → Calculate level geometry → Check/repair a route → Verify it in Phaser → Play and save.**

For clear supported sketches, you do not need to type labels, widths, heights or coordinates. Unclear or impossible drawings may require a small correction. **Advanced Edit** remains available if you want to inspect or change the objects.

> **Branch status:** The automatic-generation work is in draft [PR #11](https://github.com/SathyaHamsiniP/DreamCraft/pull/11) (`feature/automatic-sketch-game`), and the newer visuals, controls and sketch improvements are in draft [PR #12](https://github.com/SathyaHamsiniP/DreamCraft/pull/12) (`feature/sketch-runner-polish`). PR #12 is based on PR #11, **not directly on `main`**. This README describes the PR #12 branch. Do not assume these features are already on `main`.

## What is implemented

| Area | Current functionality |
| --- | --- |
| Sketch input | PNG/JPEG upload with size checks and oriented preview |
| Detection | OpenCV candidate boxes; a specialized splitter can separate clearly attached upward triangles from platform rails |
| Recognition | Five-class CNN using a trusted **local** checkpoint; uncertain predictions require correction |
| Game generation | Automatic box-to-world scaling, spawn/goal placement and validated level JSON |
| Limited repairs | Nearby spawn/goal alignment, small supported-hazard size fits, and up to two short gap bridges; changes are logged |
| Playability | Bounded Python physics route search with `reachable`, `unreachable` and `unknown` outcomes; candidate winning routes are replayed in real Phaser |
| Gameplay | Phaser 3 platformer with horizontal movement, air control, jumping, collisions, hazards, optional coins, death, restart and goal |
| Visuals | Cartoon runner with idle/run/jump frames, red-and-white barriers, styled platforms, glowing coins and finish portal |
| Studio | One-click **Generate My Game** when possible; optional **Advanced Edit** with one **Approve all** button |
| Persistence | Save and reopen level JSON in FastAPI/SQLite; generation image and repair report stay in the browser session unless downloaded |
| Testing | Python, React and game unit tests; browser tests exercise real API, OpenCV, controlled CNN inference, Phaser and keyboard input |

A **successful Phaser replay verifies one engine route**, not that the game is easy for a person, that every interpretation matches the drawing, or that every possible sketch can be converted. Automatic generation stops instead of claiming success when recognition or geometry is too uncertain. The additional finer jump-timing work described as still in progress is not claimed as completed here.

## Run DreamCraft on GitHub Codespaces

**Requirements:** A GitHub Codespace with Python **3.12** and Node.js **24**, or Node.js **22.12+**. The commands below are **Bash commands for Codespaces**, run from the repository root.

### 1. Open the repository and switch to the latest development branch

On [GitHub](https://github.com/SathyaHamsiniP/DreamCraft), choose **Code → Codespaces** and open an existing Codespace, or create one. Codespaces normally opens the repository for you, so **do not clone a second copy** if `DreamCraft` is already open.

Inside its terminal:

```bash
pwd
git status
git fetch origin
git switch feature/sketch-runner-polish
git pull --ff-only
git log -1 --oneline
```

If that branch is not already present locally, use this instead of the `git switch` command above:

```bash
git switch --track origin/feature/sketch-runner-polish
git pull --ff-only
```

The last reviewed PR #12 commit was `4734b8b`; a newer commit is fine if GitHub has since been updated. **If `git status` lists uncommitted changes, check and preserve them before changing branches.** Do not use `git reset --hard` or `git clean -fd` as a routine setup step.

**Only if you are using a completely empty Codespace or terminal without the repository**, clone it first:

```bash
git clone https://github.com/SathyaHamsiniP/DreamCraft.git
cd DreamCraft
git fetch origin
git switch --track origin/feature/sketch-runner-polish
```

### 2. Install dependencies (first setup only)

Check the versions:

```bash
python3 --version
node --version
```

If Node is too old and `nvm` is installed, run `nvm install 24` and `nvm use 24`.

```bash
# Create the virtual environment once; reuse it on later starts.
if [ ! -d .venv ]; then python3 -m venv .venv; fi
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install 'torch>=2.6,<3' --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r sketch/requirements.txt
npm ci --prefix game
npm ci --prefix frontend
```

`sketch/requirements.txt` also pulls in the ML and backend Python requirements. The React Studio imports shared game code, so **both** npm installations are necessary. No GPU, dataset download or Blender installation is required just to run the app.

### 3. Put your trained CNN model in the Codespace

Automatic recognition needs the **actual** trained `best.pt` from your laptop; the repository intentionally does not include it.

```bash
mkdir -p ml/runs/public
ls -lh ml/runs/public/best.pt
```

If the file is missing, in the **Codespaces Explorer** right-click `ml/runs/public`, choose **Upload**, and select your laptop's `best.pt`. This copies it into that Codespace's filesystem; it does **not** commit it to GitHub. Do not upload weights using the Studio's drawing picker.

The expected location is `ml/runs/public/best.pt`. Keep a separate backup on your own device. Only load weights you trained or otherwise trust.

### 4. Start the backend — Terminal 1

Open a terminal in the repository root:

```bash
source .venv/bin/activate
export DREAMCRAFT_CHECKPOINT="$(pwd)/ml/runs/public/best.pt"
export OMP_NUM_THREADS=2
export MKL_NUM_THREADS=2

python -c "from sketch.model_service import local_predictor; s=local_predictor()[2]; print('CNN status:', s); raise SystemExit(0 if s=='ready' else 1)"

python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

The model check should print **`CNN status: ready`**. If it does not, confirm the checkpoint path, dependencies and file before testing automatic generation. Sample games and Advanced Edit can work without the checkpoint, but real automatic classification cannot.

Keep this terminal running. From another terminal you may test `curl http://127.0.0.1:8000/api/health`; the response should contain `"status":"ok"`.

### 5. Start the website — Terminal 2

Open another terminal in the same repository:

```bash
npm run dev --prefix frontend
```

Go to the Codespaces **Ports** panel and select **Open in Browser** for port **5174**. Keep the forwarded website port **private**. The frontend proxies `/api` to the backend on port 8000 inside the Codespace, so you normally do **not** need a forwarded backend URL, public port 8000 or a `VITE_API_URL` setting.

If an older `frontend/.env.local` contains a `VITE_API_URL` pointing to a forwarded backend, remove that line or leave the value empty and restart Vite.

To stop either server, press **Ctrl+C** in its terminal. On later restarts, simply activate `.venv` and repeat Steps 4–5; dependency installation is not usually necessary again. Environment variables from Terminal 1 do not automatically transfer to a different terminal.

### 6. Try the complete upload-to-game flow

1. Open **Studio** on port 5174.
2. Upload a clear **PNG/JPEG** sketch and click **Generate My Game**.
3. Allow small repairs if desired. The app will detect symbols, run the local CNN, compute positions and search for a possible route.
4. If the route succeeds in an actual Phaser replay, play the resulting game with **Left/Right** or **A/D** to move and **Space/W/Up** to jump. **Start game** is above the canvas; **Restart** or **R** immediately begins another attempt.
5. If the drawing is unclear, answer the specific correction question or open **Advanced Edit**. There, adjust shapes and select **Approve all** to approve valid labeled boxes.
6. Save a completed level in **My Levels**. Review **Automatic adjustments** and download the generation report if you need a record of the interpretation or repairs.

Uploads are limited to **5 MiB**, **4096 px per side**, and **12 million pixels**. Only one S and one G are supported. The source sketch and automatic repair report are not stored in the level database. Coins are optional for winning.

For a game without any model, use **Try a sample game**. The standalone Phaser demo is also available with `npm run dev --prefix game` (typically port **5173**).

## Current physics and generation limits

The shared settings live in [`contracts/physics.json`](contracts/physics.json) (version **1.1**): 60 Hz updates, gravity 900 px/s², horizontal speed 180 px/s, jump velocity −360 px/s, with coyote time and jump buffering. The Python checker uses the same configuration but approximates Phaser collisions. `unknown` does **not** mean proven impossible.

The automatic system can fit supported hazards to at most **48 × 24** game units, align spawn/goal to a nearby platform by at most **18** units, and try at most **two 48 × 12 bridges** for suitable gaps. Every accepted change is recorded. It will **not** rebuild a large, ambiguous level, invent missing S/G labels or silently promise that a difficult scene is playable. Actual user sketches with touching/fragmented symbols still need evaluation.

The visual art is separate from the CNN labels and collision bodies. See [runner artwork, CC0 sources and licenses](game/ART.md). A local PNG sprite sheet is loaded at runtime; Blender is **optional** and used only to re-render artwork.

## ML experiment and dataset status

The five unchanged classes are `platform`, `coin`, `spike`, `spawn`, and `goal`. Public training sources are **Google Quick, Draw!** (adapted square/circle/triangle bitmaps) and **EMNIST ByClass** (uppercase S and G). See [public dataset preparation and source terms](ml/PUBLIC_DATASETS.md).

The project owner reported a **local** CPU training run on **14,847 cropped public symbols** (9,000 train / 3,000 validation / 2,847 test), with **98.84% held-out test accuracy** and **98.85% macro F1-score** after 30 epochs. These are **isolated-symbol results**, not full-scene or real-photo game-generation accuracy. The trained checkpoint and evaluation files are local, were not reproduced in GitHub CI and must not be committed as part of the normal repository.

## Test commands (Codespaces)

Stop the normal frontend/backend servers before running browser suites; Playwright starts its **own** test servers and temporary databases. From the repository root with `.venv` active:

```bash
python -m pytest ml/tests contracts/tests backend/tests sketch/tests playability/tests -q

npm test --prefix game
npm test --prefix frontend
npm run typecheck --prefix game
npm run typecheck --prefix frontend
npm run build --prefix game
npm run build --prefix frontend

# Install Playwright Chromium once on a compatible Linux image.
npx --prefix game playwright install --with-deps chromium

npm run test:browser --prefix game
npm run test:browser --prefix frontend
npm run test:collection --prefix game
```

The frontend browser command runs both the manual/sample suite and the automatic-generation suite using a **controlled test-only CNN checkpoint**, not the owner's `best.pt`. Those automated checks cover integration, common failure cases and selected winning routes; they do not measure recognition performance on arbitrary handwritten photographs. See the current GitHub Actions results on [PR #12](https://github.com/SathyaHamsiniP/DreamCraft/pull/12).

## Repository guide

| Folder | Purpose |
| --- | --- |
| [`frontend/`](frontend/README.md) | React Studio, upload UI, Advanced Edit, saved levels and browser tests |
| [`sketch/`](sketch/AUTOMATIC.md) | OpenCV detection, symbol crops, automatic generation, small repairs and local collection tools |
| [`ml/`](ml/README.md) | PyTorch CNN, preprocessing, public data importer and training/evaluation commands |
| [`backend/`](backend/README.md) | FastAPI, trusted local model configuration and SQLite level storage |
| [`game/`](game/README.md) | Phaser engine, controls, art, sample games and browser tests |
| [`playability/`](playability/README.md) | Bounded route search and validation reasons |
| [`contracts/`](contracts/README.md) | JSON level format, world coordinates and shared physics |
| `.github/workflows/` | ML, game/backend and React Studio CI |

Local databases (`backend/data/`), downloaded datasets (`ml/data/`), checkpoint/experiment outputs (`ml/runs/`), `*.pt`, `node_modules/`, `.venv/`, `dist/`, and browser test reports are intentionally Git-ignored. **Never commit weights, training datasets, secrets or personal Codespaces URLs.**

More detail: [automatic game setup](sketch/AUTOMATIC.md) · [local CNN setup](backend/RECOGNITION.md) · [runner art credits](game/ART.md) · [frontend guide](frontend/README.md).
