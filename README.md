# DreamCraft

DreamCraft turns a simple level drawing into a 2D platform game. Draw horizontal
rectangles for platforms, circles for coins, upward triangles for obstacles, one
capital S for the start and one capital G for the finish.

Studio reads the drawing, builds the level, tries small repairs and tests a path
through the actual Phaser game. Unclear drawings may need a quick correction.
Advanced Edit lets you change boxes and approve them together. You can also play
sample games and save your own levels.

The owner's trained model is included at `ml/checkpoints/best.pt`. Set the backend
path below to use it. Sample games and manual editing work without it. Recognition accuracy on
complete photographed levels still needs testing with real drawings.

Only side-view platform games are supported. Maze, racing and survival games are
not implemented.

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

## Get the current code

If you already have the repository open in Codespaces, skip the clone commands.

```bash
git clone https://github.com/SathyaHamsiniP/DreamCraft.git
cd DreamCraft
```

While the shared-model changes are in review, use this branch to try them:

```bash
git fetch origin
git switch feature/shared-model-object-sizes
git pull --ff-only
```

This branch is stacked on [draft PR #12](https://github.com/SathyaHamsiniP/DreamCraft/pull/12),
which builds on [draft PR #11](https://github.com/SathyaHamsiniP/DreamCraft/pull/11).
These changes are still on feature branches.
After the PRs are merged, the normal starting branch is `main`. The setup below
starts from the **DreamCraft repository root** in each terminal.

## Install dependencies

Use Python 3.12 and Node.js 24, or Node.js 22.12 or newer. GitHub Codespaces
usually includes both. Check `python3 --version` and `node --version`. On Windows,
install [Python](https://www.python.org/downloads/) and
[Node.js](https://nodejs.org/) first if they are missing.

### Codespaces or Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install 'torch>=2.6,<3' --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r sketch/requirements.txt
npm ci --prefix game
npm ci --prefix frontend
```

The setup includes the ML and backend packages. Both npm installations are needed
because Studio reuses the game code. Running the app needs no dataset download or
Blender installation.

If your Codespace has an older Node version and includes nvm, run `nvm install 24`
and `nvm use 24` before the npm commands. A GPU is not needed.

### Windows PowerShell

These commands use the virtual environment directly, so you do not need to change
PowerShell's script policy.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install 'torch>=2.6,<3' --index-url https://download.pytorch.org/whl/cpu
.\.venv\Scripts\python.exe -m pip install -r sketch/requirements.txt
npm.cmd ci --prefix game
npm.cmd ci --prefix frontend
```

## Use the shared model

A normal clone or pull includes the owner's trained checkpoint:

```text
DreamCraft/
  ml/
    checkpoints/
      best.pt
```

Teammates do not need to upload a model or download training data. This 2.6 MB file
is the only checkpoint tracked by Git. Its checksum and source notes are in
[the shared model folder](ml/checkpoints/README.md). New training outputs in
`ml/runs/` remain ignored. You can still use a different trusted local file by
setting its absolute path. Requests cannot choose a path or upload weights.
See [model setup and limits](backend/RECOGNITION.md).

## Start the backend — terminal 1

### Codespaces or Linux

```bash
source .venv/bin/activate
export DREAMCRAFT_CHECKPOINT="$PWD/ml/checkpoints/best.pt"
export OMP_NUM_THREADS=2
export MKL_NUM_THREADS=2
python -c "from sketch.model_service import local_predictor; print(local_predictor()[2])"
python -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

### Windows PowerShell

```powershell
$env:DREAMCRAFT_CHECKPOINT = (Resolve-Path 'ml/checkpoints/best.pt').Path
$env:OMP_NUM_THREADS = '2'
$env:MKL_NUM_THREADS = '2'
.\.venv\Scripts\python.exe -c "from sketch.model_service import local_predictor; print(local_predictor()[2])"
.\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --reload --host 127.0.0.1 --port 8000
```

The model check should print `ready`. If it prints `unavailable` or `error`, check
that the file exists and matches the existing five-class model. A ready model
means it loaded; it does not measure its accuracy on photographs.

Keep this terminal running. Set `DREAMCRAFT_CHECKPOINT` in the same terminal where
you start the backend. You may use an absolute path outside the repository instead.
Do not put this variable or your model path in a frontend environment file.

To use only samples or Advanced Edit without a model, skip the checkpoint and
model-check commands and run the same Uvicorn command. The app will explain that
automatic generation is unavailable.

## Start the website — terminal 2

From the repository root:

```bash
npm run dev --prefix frontend -- --strictPort
```

In Windows PowerShell, use `npm.cmd run dev --prefix frontend -- --strictPort`.
Keep this second terminal running too.

- **On your laptop:** open **http://localhost:5174**.
- **In Codespaces:** open the **Ports** tab, find **5174**, and choose **Open in
  Browser**. Use that forwarded address instead of your laptop's localhost.

No `frontend/.env.local` is needed for this setup. Studio sends `/api` requests
through Vite to the backend on port 8000. If you created an environment file
earlier, leave `VITE_API_URL` blank; remove any old placeholder URL. You only need
to forward port 5174 for the website. The API guide is at
http://127.0.0.1:8000/docs inside the machine running the backend.

After pulling updates, stop both servers with Ctrl+C and start them again using
the commands above. Refresh the browser. A running server on another Git branch
does not automatically switch to the new feature branch.

## Use Studio

1. Choose **Create a game**, upload a PNG or JPEG, and choose **Generate My Game**.
2. If a drawing is unclear, choose the symbol you meant. Otherwise the game is
   built without asking you to enter object sizes or positions.
3. Choose **Start game** above the game area. The game comes into view and starts
   immediately. Restart or R begins another attempt without a second Start click.
4. Use arrows or A/D to move. Press Space, W or the up arrow to jump. Release the
   jump key before another jump. Avoid red barriers and gaps, collect optional
   coins, and reach the purple portal.
5. Choose **Save level** to keep a game. Open **My Levels** to play or edit it later.

In **Advanced Edit**, correct any wrong boxes or symbols and choose **Approve
all** once. Approved boxes stay approved while you move, resize or relabel them.
Added boxes need approval. Missing labels, invalid boxes and invalid level layouts
still block creation. Images are limited to 5 MiB, 4096 pixels per side and
12 million pixels total. Saved levels contain game objects; the source photo and
repair report stay in the browser and are lost on refresh unless downloaded.

The normal sample menu offers Sky Trail, Walking Practice, Coin Trail and One
Small Jump. Their routes are covered by game browser tests. The wide-gap and
high-goal files stay unchanged as failure cases for regression tests; they are no
longer offered as games to try. Keeping these tests catches incorrect playability
claims without confusing the sample menu.

## What the game check means

A found path is an estimate until it is tried in the game. Studio now performs
that game test automatically after creating or checking a level. Only reaching
the finish in Phaser sets its displayed verification flag.

The checker first tries a fast search, then finer jump timing when needed. Both
passes share a fixed state and time budget. **Unknown** means a path was not
confirmed; it does not mean the level is impossible. A start above a platform can
fall onto it and no longer gets a warning just for being in the air.

The API's `verified_in_game` starts false. The browser verifies a particular path,
not every possible way to play. Difficult jumps, unusual collisions and large
levels can still need changes. See [playability checks](playability/README.md).

## Optional standalone game

The React website already contains the Phaser game. You do not need this third
server to use Studio. For the separate engine demo:

```bash
npm run dev --prefix game -- --strictPort
```

Open http://localhost:5173, or forward 5173 in Codespaces. The normal menu shows
playable samples. Browser tests can still open the diagnostic fixtures in the
engine's test view. The standalone game works without the backend; loading a saved
level needs the backend running too.

## ML experiment and dataset status

The five unchanged classes are `platform`, `coin`, `spike`, `spawn`, and `goal`. Public training sources are **Google Quick, Draw!** (adapted square/circle/triangle bitmaps) and **EMNIST ByClass** (uppercase S and G). See [public dataset preparation and source terms](ml/PUBLIC_DATASETS.md).

The project owner reported a **local** CPU training run on **14,847 cropped public symbols** (9,000 train / 3,000 validation / 2,847 test), with **98.84% held-out test accuracy** and **98.85% macro F1-score** after 30 epochs. These are **isolated-symbol results**, not full-scene or real-photo game-generation accuracy. The supplied checkpoint is now shared in `ml/checkpoints/`. Its loading and inference are tested here. The original dataset and evaluation files are not included, so those metrics have not been reproduced here.

## Run checks

No dataset download or GPU is required for automated tests. Most tests use
controlled images and test-only weights; shared-model checks also load the included
checkpoint, verify its checksum and run inference. They do not measure recognition
accuracy on real level photos. Stop development servers before browser tests.
Use a separate test terminal so the tests do not load your production checkpoint.

From the repository root in Codespaces or Linux:

```bash
source .venv/bin/activate
unset DREAMCRAFT_CHECKPOINT DREAMCRAFT_REVIEW_THRESHOLD DREAMCRAFT_PYTHON
python -m pytest ml/tests backend/tests sketch/tests contracts/tests playability/tests -q
npm test --prefix game
npm test --prefix frontend
npm run build --prefix game
npm run build --prefix frontend
cd game
npx playwright install --with-deps chromium
cd ..
npm run test:browser --prefix game
npm run test:browser --prefix frontend
npm run test:collection --prefix game
```

On Windows, use `.\.venv\Scripts\python.exe` instead of `python`, `npm.cmd` instead
of `npm`, and `npx.cmd playwright install chromium` for browser installation.
In the separate PowerShell test terminal, make the virtual environment's Python
available to the browser test servers and clear model settings:

```powershell
$env:Path = (Resolve-Path '.venv/Scripts').Path + ';' + $env:Path
$env:DREAMCRAFT_PYTHON = 'python'
Remove-Item Env:DREAMCRAFT_CHECKPOINT -ErrorAction SilentlyContinue
Remove-Item Env:DREAMCRAFT_REVIEW_THRESHOLD -ErrorAction SilentlyContinue
```

The builds include TypeScript checks. Browser suites start temporary databases and
servers on their own test ports. The three GitHub Actions workflows also run the
ML, backend, game, collection and Studio checks on Ubuntu 24.04.

## Project folders

| Folder | Purpose |
| --- | --- |
| [frontend/](frontend/README.md) | React Studio, upload, object editor, saved levels and game player |
| [game/](game/README.md) | Shared Phaser engine, artwork, standalone demo and browser tests |
| [backend/](backend/README.md) | FastAPI, SQLite storage and sketch APIs |
| [sketch/](sketch/README.md) | OpenCV detection, model adapter, generation and local sheet collection |
| [playability/](playability/README.md) | Bounded path search and replay information |
| [contracts/](contracts/README.md) | Shared level schema, coordinates, physics and test fixtures |
| [ml/](ml/README.md) | Existing CNN, public data importer, training and evaluation |

The five classes and level schema are unchanged. Physics version 1.1 uses gravity
900, movement speed 180, jump velocity -360, and a 60 Hz update rate. The measured
jump rise is 69 world units. Artwork uses the same rectangular collision bodies.
See [artwork credits](game/ART.md) for the licensed runner and barrier sources.

This is a local development setup. User accounts and production deployment are
not included. SQLite files live in `backend/data/`; datasets belong in `ml/data/`
and model outputs in `ml/runs/`. Keep data, model weights, virtual environments,
secrets and generated test reports out of Git. The single shared checkpoint in
`ml/checkpoints/` is the documented exception for model weights.
