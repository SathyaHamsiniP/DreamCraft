# DreamCraft

### AI-Powered Sketch-to-Playable Game Generator

## Overview

DreamCraft is a web application that converts hand-drawn 2D game levels into playable games.

Users upload a sketch containing platforms, obstacles, collectibles, a starting point and a goal. The application identifies these objects, calculates their positions, checks the level's playability and generates an interactive game.

DreamCraft combines computer vision, machine learning and game development to automate the process of creating 2D platform games.

## How It Works

The game generation process consists of five stages:

1. **Image Processing:** OpenCV detects objects in the uploaded sketch.
2. **Object Recognition:** A trained CNN classifies the detected symbols.
3. **Level Generation:** The application calculates object positions and dimensions.
4. **Playability Validation:** The system checks reachable paths and attempts limited adjustments when necessary.
5. **Game Rendering:** Phaser generates the playable game.

Users can play, edit and save their generated levels.

### Supported Objects

| Sketch Symbol | Game Object |
|---|---|
| Rectangle | Platform |
| Circle | Coin |
| Triangle | Obstacle |
| S | Starting point |
| G | Goal |

Sketches should contain clearly drawn symbols, with one starting point and one goal.

## Technologies Used

| Component | Technology |
|---|---|
| Frontend | React, TypeScript, Vite |
| Backend | Python, FastAPI |
| Image Processing | OpenCV |
| Machine Learning | PyTorch, CNN |
| Game Engine | Phaser 3 |
| Database | SQLite |
| Playability Validation | Python-based physics simulation |

## Installation and Setup

DreamCraft can run locally on Windows, macOS or Linux, or in GitHub Codespaces.

### Prerequisites

Install the following:

- Python 3.12
- Node.js 24 or Node.js 22.12+
- Git

### 1. Clone the Repository

Open a terminal and run:

```bash
git clone https://github.com/SathyaHamsiniP/DreamCraft.git
cd DreamCraft
```

The shared model is available on `main`. Automatic generation and the newer game
are still in draft PRs #11 and #12. To try that workflow with the shared model,
use `feature/shared-model-object-sizes`:

```bash
git fetch origin
git switch feature/shared-model-object-sizes
```

Use `git switch main` to return to main's reviewed-object workflow.

### 2. Install Dependencies

**Windows (PowerShell)**

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1

python -m pip install --upgrade pip
python -m pip install -r sketch/requirements.txt

npm ci --prefix game
npm ci --prefix frontend
```

If PowerShell prevents virtual environment activation, use `.\.venv\Scripts\python.exe` instead of `python` for the Python commands.

**macOS / Linux**

```bash
python3.12 -m venv .venv
source .venv/bin/activate

python -m pip install --upgrade pip
python -m pip install -r sketch/requirements.txt

npm ci --prefix game
npm ci --prefix frontend
```

For Linux systems that require a CPU-only PyTorch installation, use the installation instructions at https://pytorch.org/get-started/locally/.

### 3. Use the Shared Model

The owner's trained checkpoint is now included in the repository:

```text
DreamCraft/
└── ml/
    └── checkpoints/
        └── best.pt
```

A normal clone or pull includes this 2.6 MB file. Teammates do not need to upload
weights, download a dataset or install Git LFS. See the
[checksum and source notes](ml/checkpoints/README.md). New training outputs in
`ml/runs/` remain ignored. You can still use another trusted local checkpoint by
setting its absolute path. Requests cannot select or upload model files.

### 4. Start the Backend

Open a terminal inside the DreamCraft project.

**Windows (PowerShell)**

```powershell
.\.venv\Scripts\Activate.ps1

$env:DREAMCRAFT_CHECKPOINT = (Resolve-Path '.\ml\checkpoints\best.pt').Path
$env:OMP_NUM_THREADS = '2'
$env:MKL_NUM_THREADS = '2'
python -c "from sketch.model_service import local_predictor; print(local_predictor()[2])"

python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

**macOS / Linux**

```bash
source .venv/bin/activate

export DREAMCRAFT_CHECKPOINT="$PWD/ml/checkpoints/best.pt"
export OMP_NUM_THREADS=2
export MKL_NUM_THREADS=2
python -c "from sketch.model_service import local_predictor; print(local_predictor()[2])"

python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

The model check should print `ready`. The backend runs on port **8000**.

Keep this terminal running.

### 5. Start the Frontend

Open a second terminal in the DreamCraft directory.

```bash
npm run dev --prefix frontend
```

Open the application in your browser:

http://localhost:5174

The frontend runs on port **5174** and communicates with the backend through the development server.

### Running in GitHub Codespaces

GitHub Codespaces provides a cloud development environment, so local installation is not required.

1. Open the DreamCraft repository on GitHub.
2. Select **Code → Codespaces**.
3. Create or open a Codespace.
4. Switch to the required branch.
5. Follow the Linux installation and startup commands above.
6. Open port **5174** from the Codespaces Ports tab.

The shared model is already in `ml/checkpoints/best.pt`; no Codespaces upload is
needed. Use the Linux checkpoint command above in the backend terminal.

Keep the forwarded application port private.

## Using DreamCraft

Open the Studio page and upload a PNG or JPEG image of a game sketch.

Select **Generate My Game** to begin processing.

The application detects the objects, classifies them using the CNN, creates the level geometry and checks for a playable route.

When generation succeeds, the game is displayed in the browser. Unclear symbols or unsuitable layouts may require corrections through Advanced Edit.

### Game Controls

| Key | Action |
|---|---|
| Left / Right Arrow | Move |
| A / D | Move |
| Space / W / Up Arrow | Jump |
| R | Restart |

Players must reach the goal while avoiding obstacles. Coins provide additional points but are not required to complete a level.

## Model Training and Evaluation

The CNN was trained using images from Google Quick, Draw! and EMNIST.

The dataset contains 14,847 images across five object classes.

| Metric | Result |
|---|---|
| Training samples | 9,000 |
| Validation samples | 3,000 |
| Test samples | 2,847 |
| Training epochs | 30 |
| Test accuracy | 98.84% |
| Macro F1-score | 98.85% |

These are the owner's locally reported results on individual sketch symbols.
The supplied checkpoint is tested here for loading and inference. The original
dataset and evaluation reports are not included, so those metrics have not been
reproduced here. They do not represent complete game-generation accuracy.

## Running Tests

Run the following commands from the project root:

```bash
python -m pytest ml/tests contracts/tests backend/tests sketch/tests playability/tests -q

npm test --prefix game
npm test --prefix frontend

npm run build --prefix game
npm run build --prefix frontend
```

For browser tests, install Playwright Chromium and run:

```bash
npx --prefix game playwright install --with-deps chromium

npm run test:browser --prefix game
npm run test:browser --prefix frontend
```

Stop the normal development servers before starting browser tests.

## Project Structure

| Directory | Description |
|---|---|
| `frontend/` | React application and user interface |
| `backend/` | API and database operations |
| `ml/` | CNN training and inference |
| `sketch/` | Image processing and game generation |
| `game/` | Phaser game engine |
| `playability/` | Level validation |
| `contracts/` | Shared game rules and level formats |

## Limitations

DreamCraft currently supports 2D platform games using five predefined object classes.

Complex, overlapping or unclear sketches may require manual corrections. Automatic playability checking uses a bounded simulation and cannot guarantee that every generated game will be easy to complete.

Future improvements may include additional game genres, more object types and improved recognition of complex sketches.

## Repository

https://github.com/SathyaHamsiniP/DreamCraft
