# Game module

The standalone demo turns a valid level JSON document into a Phaser 3.90.0 game using Arcade Physics. It needs no backend, drawing dataset or trained model. Platforms and objects are drawn with simple shapes.

## Start the demo

Use Node.js 22 or newer. From the repository root:

```bash
npm ci --prefix game
npm --prefix game run dev
```

Open the local Vite address shown in the terminal. Choose a sample and click Load sample, or select a level JSON file. The page limits JSON files to 200,000 bytes and validates them before replacing the current level. An invalid file leaves the current game intact. To fetch a stored level, start the backend on port 8000, paste its ID into Saved level ID and click Load saved level. Set `VITE_API_URL` before starting Vite if the backend uses another address.

## Controls and states

- Enter starts a ready level.
- A or left arrow moves left; D or right arrow moves right.
- Space, W or up arrow jumps. Release the jump key before jumping again. A new jump only works while standing on a platform.
- R restarts from the original spawn, including after death or victory.

The states are `ready`, `playing`, `dead` and `completed`. Touch a red spike or fall below the world to die. The game waits for R instead of restarting automatically. Touch the green goal to win; movement stays frozen until restart. Yellow coins disappear on contact and each adds one point. Coins are optional for winning.

The player is blue, platforms are dark grey, coins are yellow, spikes are red triangles and the goal is green. All collision bodies are rectangles, including spikes. See the [shared rules](../contracts/README.md) for exact coordinates and hitboxes.

## Files

- `src/contracts.ts` validates JSON Schema and geometry before Phaser sees a level.
- `src/engine.ts` owns the scene, physics, controls, game states and mount interface.
- `src/main.ts` connects the demo selector and JSON input to that interface.
- `tests/` checks the shared valid and invalid documents.
- `e2e/` tests the real game with Chromium, keyboard input and API requests.

Physics comes from `contracts/physics.json`. Arcade runs fixed 60 Hz steps through a small accumulator. A frame pause is capped at 100 ms so the page does not try to catch up indefinitely. No movement constants are duplicated in the Python checker.

## Mount in React later

Import `mountGame` from `game/src/engine.ts`. The host should give the container a width and height. A React effect can mount once and call `destroy` during cleanup:

```tsx
useEffect(() => {
  if (!container.current) return;
  const game = mountGame(container.current, level, {
    onEvent: event => console.log(event.type, event.state, event.score)
  });
  return () => game.destroy();
}, []);
```

This is an integration example, not a React component included in this repository. Store the handle in a ref to load new levels without mounting again. It provides `loadLevel(json)`, `start()`, `restart()`, `snapshot()` and `destroy()`. Events report state changes and coin collection. Loading and restarting are asynchronous scene operations; `snapshot()` returns null until the scene is ready. Invalid loads throw a readable error. Destroy is safe to call more than once. Phaser clears the old scene's objects and colliders on reload.

## Tests and build

From the repository root:

```bash
npm --prefix game test
npm --prefix game run typecheck
npm --prefix game run build
cd game
npx playwright install --with-deps chromium
npm run test:browser
```

The browser suite also starts FastAPI on port 8001 with a temporary SQLite database, so install `backend/requirements.txt` in the active Python environment first. Vite uses port 5173. Stop other servers on those ports before testing. Set `DREAMCRAFT_PYTHON` to the virtual environment's Python executable if it is not the default `python3`.

If Playwright downloads are blocked but Chromium is already installed, use `CHROMIUM_PATH=/usr/bin/chromium npm run test:browser` from `game/`. The normal CI setup downloads Chromium using Playwright.

`?test=1` enables observation and deterministic stepping through `window.dreamcraft`. Tests use actual keyboard input and call `step(n)` to advance Arcade Physics at 60 Hz. They do not teleport the player or set a win flag. Normal gameplay uses the same fixed-step function with the browser clock. These hooks are unavailable on the normal page.

Browser tests save replay position comparisons as test attachments. They cover movement, jump limits, collisions, coins, hazards, falling, victory, restart, invalid JSON, level reloads, mock uploads and saved API levels. Seven returned checker paths are replayed, including the multi-platform sample. `dist/`, browser reports and test outputs are ignored by Git.

The Phaser bundle is large enough to produce Vite's chunk-size warning. It builds successfully; no asset packs or paid services are required.
