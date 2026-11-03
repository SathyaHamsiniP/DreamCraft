# DreamCraft Studio

The React studio connects the existing sketch APIs, SQLite level storage, Phaser
game and playability checker. It supports predefined sample levels and manually
reviewed sketches. There is no trained handwriting model or real recognition
claim in this app.

## Run it locally

Use Node 22.12 or newer in the Node 22 line, or Node 24. Use Python 3.12 and the
project's Python environment. Run these commands from the repository root:

```bash
python -m pip install -r backend/requirements.txt
npm ci --prefix game
npm ci --prefix frontend
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

In another terminal:

```bash
npm run dev --prefix frontend
```

Open http://localhost:5174. The standalone game still uses port 5173. The backend
allows only the existing game origins and the local studio origins on port 5174.
It does not use unrestricted CORS. Use the same hostname consistently when testing.

By default, the browser sends `/api` requests through Vite to the backend on
`http://127.0.0.1:8000`. This works locally and in Codespaces without an env file.
If you already created `frontend/.env.local` with a forwarded backend URL, remove
that `VITE_API_URL` line or leave its value blank, then restart Vite.

To use another local backend port, set `DREAMCRAFT_API_PROXY_TARGET` in
`frontend/.env.local`, for example `http://127.0.0.1:8002`, then restart Vite.
`VITE_API_URL` remains an optional direct backend URL for other hosting setups;
that requires the backend to allow your exact frontend origin. Values starting
with `VITE_` are public browser settings. Do not put secrets in them.

### GitHub Codespaces

Open this branch in Codespaces. Install Python 3.12 and Node 22.12+ or Node 24
if the Codespace does not already provide them, then run the setup commands above.
Start the backend on port 8000 and the frontend on 5174. In the Codespaces Ports
tab, open the forwarded address for **5174**. Keep it private. Port 8000 does not
need to be exposed to the browser: Vite connects to it inside the Codespace.

There is no forwarded backend URL to copy and no CORS change to make. Vite allows
the exact frontend hostname from `CODESPACE_NAME` and
`GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN`. It does not allow all hostnames.
Actual hosted Codespaces access still needs checking in a signed-in Codespace;
local browser tests cover the same frontend-to-backend proxy path.

Install game dependencies even if only using the studio: the studio imports the
shared engine and contracts directly from `game/src/`. Vite deduplicates Phaser,
Ajv and React. The engine is loaded only when a game preview is opened. No physics,
coordinate conversion formula or level schema is copied into React.

## Use the app

- **Home:** start a sketch, try a sample game, or open saved levels.
- **Studio:** upload, detect, review, create a level, then play and save.
- **My Levels:** fetch actual records from SQLite. Open a record to edit, play,
  update or check it. The page supports the API's 100-record pages.
- **Help:** drawing instructions, game controls, review steps and checker limits.

A sample is a project JSON fixture, not a game made from an uploaded drawing.
The studio does not call the backend's mock sketch-to-level route.

### Sketch workflow

1. Upload or drop a PNG or JPEG. The app checks file type and the 5 MiB size limit.
   The backend verifies content, a 4096-pixel side limit and a 12-million-pixel limit.
2. The backend returns a PNG preview with EXIF orientation applied. All editor
   boxes use those exact oriented image pixels, with top-left origin. The original
   upload stays in memory for candidate detection. Nothing is stretched.
3. Choose adaptive or Otsu thresholding and click **Detect candidates**. These are
   possible ink regions, with no class labels or confidence scores. If detection
   finds nothing, add boxes manually.
4. Select a box to move it. Drag its bottom-right handle to resize it. Use **Draw
   box** or **Add box** for a missed symbol. Numeric fields and object-list buttons
   provide keyboard alternatives. Touch pointers work for drawing and dragging.
5. Choose Platform, Coin, Spike, Spawn or Goal and confirm review for each object.
   Moving, resizing or relabeling clears that object's review. Delete noise boxes.
6. Use exactly one spawn and one goal. Choose a target world size and create the
   level. The backend performs the shared coordinate conversion and level checks.
   Review warnings and geometry errors are shown separately. Errors leave the
   editor intact.
7. Try the returned game world. Spawn uses the game's fixed player size anchored
   at the scaled symbol's bottom centre. Its position is not clamped into bounds.
   Check its placement in the game. Export JSON if needed.
8. **Save level** creates a database record. **Save changes** updates the opened
   record. **Check playability** asks to save current changes first if needed.

The page shows unsaved changes. Replacing a sketch or sample asks before losing
edits. Leaving the studio warns too; edits stay in memory during navigation but
are lost on refresh unless saved. Browser refresh/close also uses the browser's
normal unsaved-change warning. There is no fake browser-storage database.

Saved games are edited in game-world coordinates using the same editor on a grid.
The shared `parseLevel()` function checks those changes. No reverse image conversion
is invented. Original photos and boxes are not stored in the levels database,
so opening a saved game does not recover its source photo.

### Play and check

Press **Start game** and use Left/Right or A/D to move. Space, W or Up jumps.
Enter starts and R restarts. Game keys are attached to the focused game area in
the React app. Moving focus away stops those shortcuts from catching editor input.
The standalone engine keeps its previous window keyboard target by default.
Mobile users can upload, review and view games; playing needs a keyboard.

The React player owns one Phaser instance. It destroys the instance and its parent
on unmount or level change, ignores late imports/events, and handles Strict Mode
setup and cleanup. Goal color is purple to match the editor. Physics and level
rules are unchanged.

The playability panel shows `reachable`, `unreachable` or `unknown` and the backend
reason, warnings and search information. Unknown is not called impossible.
`verified_in_game: false` is shown explicitly for a found route. Rendering or
playing a level does not change that field for the checker request.

## API and code guide

`src/services/api.ts` uses Fetch, a configurable base URL, 30-second timeouts,
request cancellation and common error messages. Loaded and saved levels pass
through the game's shared `parseLevel()` function.

| Request | Use |
| --- | --- |
| `POST /api/sketch/preview` | Multipart file; returns a normalized PNG data URL, width and height. Uses the same safe loader as detection. No files are stored. |
| `POST /api/sketch/candidates?method=adaptive` | Multipart file; returns unclassified candidate boxes. |
| `POST /api/sketch/reviewed-level` | Sends image/world dimensions and reviewed objects. Returns a validated draft level without saving it. |
| `GET /api/levels?offset=0` | Fetches up to 100 actual saved records. |
| `POST /api/levels` | Saves a new valid level. |
| `GET /api/levels/{id}` | Loads and validates a complete saved record. |
| `PUT /api/levels/{id}` | Updates that record. |
| `POST /api/levels/{id}/validate` | Checks the saved level and returns search results. |

The new preview route is needed because raw browser JPEG previews can disagree
with detector coordinates. No existing backend request or response contract was
changed. Existing endpoints still work, and mock mode remains separate.

`src/services/recognition.ts` is the candidate adapter. Future actual model results
can supply a label/score suggestion only when the response says a model ran. These
suggestions do not automatically label or review an object. The current API never
produces those scores. Keep detection and classification separate when adding a
real checkpoint later.

For training sample collection, run `python -m sketch.app` with the ML dependencies
installed. Help links to that separate local tool. It saves training crops and
sheet/contributor metadata; the studio saves game levels. See [the collection
guide](../sketch/README.md) for that workflow.

## Build and test

```bash
npm test --prefix frontend
npm run typecheck --prefix frontend
npm run build --prefix frontend
```

The production output is `frontend/dist/`. Serve it with SPA fallback to
`index.html` for routes like `/studio` and `/levels`. The Vite development proxy
is not part of the production build. Route `/api` to FastAPI in your hosting
server, or set `VITE_API_URL` to a backend that allows your frontend origin before
building. The backend stays a separate process; this change does not deploy or
publish the app.

For browser tests, install Playwright Chromium once:

```bash
cd frontend
npx playwright install --with-deps chromium
npm run test:browser
```

Set `DREAMCRAFT_PYTHON` if the backend needs a virtual-environment interpreter, and
`CHROMIUM_PATH` to use system Chromium. Browser tests start real Vite and FastAPI
servers on 5174 and 8002, using a temporary SQLite database. Those ports must be
free. No dataset, checkpoint, private API key or paid service is needed.

Unit/component tests use controlled API responses to check errors and loading,
editor changes, review rules, navigation, unsaved edits, requests, storage failures,
playability messages and Phaser lifecycle. Browser tests use the actual backend,
OpenCV, SQLite, React components and Phaser. They cover samples, real keyboard
movement and a known goal, all five manual labels on a synthetic sheet, detection,
corrected positions, saving, updates, refresh/retrieval, playability, EXIF dimensions,
pointer edits, empty candidates, invalid uploads and mobile layout. They also check
that navigation and repeated level changes do not leave duplicate canvases.

Run the existing regression suites too:

```bash
python -m pytest ml/tests contracts/tests backend/tests sketch/tests playability/tests -q
npm test --prefix game
npm run typecheck --prefix game
npm run build --prefix game
npm run test:browser --prefix game
npm run test:collection --prefix game
```

The new `frontend-tests.yml` workflow installs both game and frontend dependencies,
builds the studio and runs its real browser tests from a clean checkout on Node 22
and Python 3.12. Existing ML and game/backend workflows are kept.

## PR #4 and limits

Current main already contains PR #4 as squash commit `41fe331`. Its tree matches
PR head `d391383` and `feature/sketch-detection-data-tools`, with no merge conflicts.
This frontend branch starts from that updated main. No direct main push, forced
push or extra merge was used. GitHub GraphQL and REST returned `Forbidden`, so
hosted Actions checks could not be inspected from this environment. Local regression
results are reported separately; they do not stand in for a hosted CI result.

Real handwritten sheets, photo lighting, detection accuracy, model accuracy and
confidence calibration remain untested. Very faint, touching or disconnected
strokes may need manual correction. Automatic perspective correction is still
not included. Production authentication, shared-user accounts and deployment are
outside this change. Level names and deletion are not added because the current
backend has no name field or delete endpoint.

Local checks for this change passed:

| Check | Result |
| --- | --- |
| Python ML, contracts, backend, sketch and playability | 124 passed |
| Standalone game unit tests | 27 passed |
| Standalone gameplay browser tests | 16 passed |
| Collection browser test | 1 passed |
| React unit and component tests | 20 passed |
| React full workflow browser tests | 7 passed |
| Type checks and production builds for both apps | Passed |
| Frontend install from lockfile with `npm ci` | Passed |

Browser runs used system Chromium. The React browser suite checks actual keyboard
play, including reaching a goal and collecting a coin. Source photos in tests are
synthetic; no real handwriting accuracy was measured. Builds report a large Phaser
bundle warning. The game is loaded in a separate chunk. Python dependencies also
report deprecation warnings. Hosted Actions results were not available through the
blocked GitHub API.
