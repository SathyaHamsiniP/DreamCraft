# Playability checks

The checker searches for an input route using the shared `contracts/physics.json`.
It checks solid platform rectangles, rectangular spike hitboxes, world edges,
gravity, horizontal movement, buffered jumps and a short grace period after leaving
an edge. Physics version 1.1 adds five grace ticks and six jump buffer ticks.
Jump height, speed and gravity are unchanged.

The quick search still tries six-frame inputs first. If that does not find a path,
a second search can change inputs every frame. It keeps positions to half a world
unit and vertical speed to one gravity step. A small preference for progress
toward the goal helps the second search. Both passes share the same state and time
limits; the first gets at most 40 percent of the states. There is one overall
deadline, so a busy CPU does not force an early switch to the slower search.
It does not try to prove that a route is the shortest.
Consecutive equal inputs are grouped in the response to keep replays small.

## Results

- `reachable`: a route reached the goal in the Python approximation.
- `unreachable`: a supported geometric bound proves the goal cannot be reached.
- `unknown`: search failed, reached its limit, or encountered geometry it could
  not resolve reliably. This is not proof that a level is impossible.

`verified_in_game` from the server is always false. Studio now tries found paths
in the game automatically after creating or checking a level. This runs the
returned inputs in a separate hidden instance of the same Phaser scene, then
destroys it. There is no second verification button. Only reaching the goal
sets the displayed verification flag to true. A failed replay changes the displayed
assessment to unknown. It does not change the stored level or the backend result.
Verification is for that route and those level objects, not every possible input.

The Python collision solver remains an approximation. Corner separation, platform
order, thin objects and unusual obstacle layouts can differ from Arcade physics.
Runtime replay is available in the browser; the Python server does not run a browser.
Do not describe an unchecked simulation route as guaranteed playable.

## Sketch-created and edited levels

Studio calls `POST /api/levels/assess` with valid level JSON after creating a level.
This uses the same checker as `POST /api/levels/{id}/validate` but does not save or
change anything. Invalid geometry is rejected before search. Saved level checks
still work through the existing endpoint. All five symbols and the level schema
stay the same.

The response adds `suggestions` and `difficulty` alongside the existing fields.
Suggestions point out large gaps, high steps and a start without a platform beneath
it. Starting above a platform is allowed: the player can fall onto it. This no
longer produces a warning just because the feet do not touch a platform initially.
They are hints, not a complete explanation of all possible routes. Go back to the
editor to move or resize boxes, add platforms, or lower the goal, then create the
level again. The tool never moves objects automatically.

Difficulty is separate from reachability. For a found route the checker moves jump
transitions by up to three frames earlier and later in its simulation. It reports
`timing_margin` if both probes win, or `timing_sensitive` otherwise. The source is
`python_approximation`; this is not a measured human skill rating. Without a route,
difficulty is `not_assessed`. Even a verified route can need precise input.

## Controls and samples

The engine keeps input taps until a fixed physics tick. Previously, a keydown and
keyup processed in the same render frame could clear the edge before the fixed
step read it. Holding keys in manual-step tests did not cover short taps. Phaser
already guards its post-update against double movement; that was not the cause.
Studio focuses the game after Start/Restart and when the game area is clicked.
The Start button is above the canvas and brings it into view. Restart begins a
fresh attempt without another Start click. Position output is kept hidden for
browser tests.

Only playable demos appear in the normal sample menus. The wide-gap and high-goal
fixtures remain unchanged for regression tests and can still be loaded as saved
test data. The engine's test view also exposes diagnostic fixtures. One Small Jump and Sky Trail have wider
landing margins; the game still cannot jump a 400-unit gap.

## Checks

Run the commands from the repository root:

```sh
python -m pytest ml/tests backend/tests sketch/tests contracts/tests playability/tests -q
npm test --prefix game
npm test --prefix frontend
npm run build --prefix game
npm run build --prefix frontend
npm run test:browser --prefix game
npm run test:browser --prefix frontend
npm run test:collection --prefix game
```

Browser suites need Playwright Chromium. Tests cover real-time React keyboard
input, Space followed by Right in midair, simultaneous Right and Space, landing,
restart/focus, saved levels, Phaser replay and varied programmatically built
reviewed-sketch layouts. These controlled layouts and synthetic images do not
measure recognition or real-photo accuracy. No CNN or public dataset is changed.
The tight-timing fixture has a jump that the six-frame search missed. The finer
search finds it, and a browser test replays it through the real Phaser engine while
checking the returned positions. Timing checks also shift one-frame jump presses;
they no longer leave a short press unchanged when testing a later jump.

The exact reported loss of horizontal control after Space was not reproduced here
on the original engine. The original engine passed a real-time midair direction
change test. A separate short-tap test did reproduce a missed command. The changes
address that issue, game-area focus and edge timing. If movement still stops on a
particular browser, record the browser, focused element and player position so the
remaining case can be reproduced.
