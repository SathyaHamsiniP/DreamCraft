# DreamCraft 🎮

**Draw a game. Watch it come to life.**

Imagine drawing a few shapes on paper and turning them into a game. DreamCraft does just that. You upload a sketch. OpenCV finds the shapes, a trained CNN suggests what they mean, and the app turns them into a Phaser game. It checks possible paths and tries small, visible fixes when a level is difficult to complete.

Today, DreamCraft creates **2D platform games**. Other game types, such as mazes and racing games, are ideas for future versions.

## Draw your level

Use a dark pen on plain white paper. The game understands five symbols:

| Draw | Meaning |
| --- | --- |
| Long rectangle | Platform to stand on |
| Circle | Bonus coin |
| Upward triangle | Hazard to jump over |
| **S** | Where the player starts |
| **G** | Where the player finishes |

Use **one S and one G**. Leave some space between shapes. A clear PNG or JPEG works best.

In the latest development version, the normal path is simple:

**Upload sketch → Generate My Game → Play → Save.**

DreamCraft measures object positions automatically. It checks whether there is a route to the goal, then tries the route in Phaser. If the drawing is unclear, it asks for a correction. **Advanced Edit** is there when you want to move shapes or use **Approve all**. Not every sketch can be made playable automatically.

## Run on GitHub Codespaces

The newest automatic generator, cartoon runner, barriers and simpler controls are on the **`feature/sketch-runner-polish`** branch. The `main` branch still has the earlier manual Studio. Use the commands below to try the newer experience.

### 1. Open the project

Open [DreamCraft on GitHub](https://github.com/SathyaHamsiniP/DreamCraft). Select **Code → Codespaces** and open or create a Codespace.

A Codespace normally opens the project for you. You do **not** need to clone it again.

In its terminal, run:

```bash
git status
git fetch origin
git switch feature/sketch-runner-polish
git pull --ff-only
```

If the switch says the branch is not available locally, run `git switch --track origin/feature/sketch-runner-polish` instead. If `git status` shows uncommitted work, save it before switching branches. Do not delete those changes.

If you are **not** using Codespaces and have no local copy yet, start with:

```bash
git clone https://github.com/SathyaHamsiniP/DreamCraft.git
cd DreamCraft
git switch --track origin/feature/sketch-runner-polish
```

### 2. Install what the app needs

Use **Python 3.12** and **Node.js 24** (or Node.js 22.12+). Check with `python3 --version` and `node --version`. If Node is too old and `nvm` is available, run `nvm install 24` and `nvm use 24`.

Run the following **once** in the project folder:

```bash
if [ ! -d .venv ]; then python3 -m venv .venv; fi
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install 'torch>=2.6,<3' --index-url https://download.pytorch.org/whl/cpu
python -m pip install -r sketch/requirements.txt
npm ci --prefix game
npm ci --prefix frontend
```

### 3. Add your trained model

Automatic recognition needs your trained **`best.pt`**. It is not included in the repository.

```bash
mkdir -p ml/runs/public
```

In the Codespaces file explorer, right-click **`ml/runs/public` → Upload**, and choose `best.pt` from your computer. The file should be at `ml/runs/public/best.pt`.

Keep the model private. **Do not commit it or the training images to GitHub.** Without the model, you can still try sample games and the manual editor.

### 4. Start the backend (Terminal 1)

```bash
source .venv/bin/activate
export DREAMCRAFT_CHECKPOINT="$(pwd)/ml/runs/public/best.pt"
export OMP_NUM_THREADS=2
export MKL_NUM_THREADS=2
python -c "from sketch.model_service import local_predictor; print('CNN status:', local_predictor()[2])"
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

For automatic recognition, the model check should print **`CNN status: ready`**. Otherwise, check the model file and dependencies. Leave this terminal running.

### 5. Start the website (Terminal 2)

Open another terminal in the same project folder:

```bash
npm run dev --prefix frontend
```

In Codespaces, open the **Ports** tab and choose **Open in Browser** for **port 5174**. Keep the forwarded port private. The website sends API requests to the backend on port 8000 automatically.

Now open **Studio**, upload a drawing and click **Generate My Game**.

### 6. Play your game

Click **Start game**. Use **← / →** or **A / D** to move. Use **Space**, **W** or **↑** to jump. Click **Restart** or press **R** to try again.

Reach the purple finish portal. Coins give bonus points but are not required to win.

To stop either server, press **Ctrl+C** in its terminal. On future visits, you normally only need to activate `.venv` and restart the backend and frontend. You do not need to reinstall everything.

## Check that everything works

These commands run from the project root with `.venv` activated:

```bash
python -m pytest ml/tests contracts/tests backend/tests sketch/tests playability/tests -q
npm test --prefix game
npm test --prefix frontend
npm run build --prefix game
npm run build --prefix frontend
```

For browser gameplay tests, install Chromium and run:

```bash
npx --prefix game playwright install --with-deps chromium
npm run test:browser --prefix game
npm run test:browser --prefix frontend
```

Browser tests start their own servers. Stop the regular development servers before running them.

## Our AI results

The CNN was trained locally on **14,847** symbols from Google Quick, Draw! and EMNIST. It achieved **98.84% accuracy** and **98.85% macro F1-score** on 2,847 held-out **individual-symbol** test images.

This measures symbol recognition, **not** the success rate of complete photographed game sketches. Whole-sketch recognition and real-world playability still need careful testing.

## How the project is organized

- [`frontend/`](frontend/README.md) — React website and Studio.
- [`sketch/`](sketch/README.md) — image detection and game generation.
- [`ml/`](ml/README.md) — CNN, datasets and training.
- [`backend/`](backend/README.md) — FastAPI and SQLite saved games.
- [`game/`](game/README.md) — Phaser gameplay and animations.
- [`playability/`](playability/README.md) — route checking.
- [`contracts/`](contracts/README.md) — shared level and physics rules.

For more details, see the [automatic generation guide](sketch/AUTOMATIC.md), [CNN setup](backend/RECOGNITION.md) and [artwork credits](game/ART.md).
