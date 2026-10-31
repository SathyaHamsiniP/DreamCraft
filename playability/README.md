# Playability checker

The checker searches for a way to move the player from spawn to goal. It reads the same versioned movement settings as Phaser and uses player-sized rectangles, gravity, jumping, solid platforms, world boundaries, spikes and the goal hitbox.

## Run a check

Install `backend/requirements.txt` first. From the repository root:

```bash
python -m playability.validator contracts/examples/multi-jump.json
python -m pytest playability/tests -q
```

The API also runs the checker with `POST /api/levels/{id}/validate`.

## Search method

`validator.py` simulates short six-frame actions: left, right or still, with the jump key pressed or released. A priority queue explores states based on elapsed steps and horizontal distance to the goal. Each state includes position, vertical velocity, grounding and whether jump was held. Predecessor links record the actions for a returned route.

The default limits are 20,000 expanded states, 1,800 physics steps per path and three seconds of search time. The Python function accepts smaller or larger limits within fixed upper bounds. Visited states use rounded position and velocity to keep the search small. This rounding can miss real routes.

Collision handling is an approximation of Arcade Physics for static rectangles. It checks landing, head hits, side hits, hazards, world walls and falling. Ambiguous corner collisions are discarded. The model does not cover moving platforms, slopes, bounce, extra jumps or arbitrary Phaser collision settings.

## Results

- `reachable`: a route was found in the Python simulation. The response includes a `path`, but does not claim that this request's path was replayed in Phaser.
- `unreachable`: only the narrow height-bound proof currently uses this status. Even assuming every platform is accessible, the goal lies above the highest possible player position. The bound uses the continuous jump rise of 72 pixels, which is more generous than the actual 69-pixel discrete jump. This proof assumes fixed platforms and the current movement rules.
- `unknown`: no route was found, the search ran out of time/states/steps, or sampled states were not enough to decide. A failed search is not proof of impossibility.

Every response includes a reason, warnings, search counts and limits, physics version, optional movement path and `verified_in_game`. That last field is always false for a normal API check because the server does not launch a browser. Do not change it to true just because a similar sample worked.

## Compare with the game

The Playwright suite starts the real API, stores and retrieves a level, requests its path, then uses keyboard input to replay that path in the real Phaser scene. It compares X/Y positions at each action boundary and checks for victory. Seven sample routes pass this comparison, including two upward jumps, spikes and jumps near the horizontal and vertical limits. Replay position records are attached to browser test results.

The suite also measures the actual jump rise and tries representative actions on gap, wall and height cases. Those failed attempts do not prove those levels impossible. The checker correctly returns unknown for them.

This test evidence is limited to the included examples. Arbitrary geometry, thin platforms, collision corners and different floating-point behavior can still produce a simulation/game mismatch. Returned routes should be replayed before presenting them as verified. Browser tests fail if an expected route does not replay; they never set the player position or force victory.
