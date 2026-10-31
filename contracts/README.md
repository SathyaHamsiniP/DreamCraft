# Shared level format

`level.schema.json` defines version `1.0`. The game, API and checker use this same format. Python and TypeScript also apply the same geometry rules, because JSON Schema alone cannot check relationships between objects. Both test suites read `validation-cases.json`.

## Coordinates and objects

The origin is the top-left of the world. X increases to the right and Y increases down. All values are world pixels. Every object's `x` and `y` are its top-left corner, including spawn and goal. Width and height must be positive finite numbers. Edges may touch without overlapping.

A level contains `schema_version`, a `world` with width and height, and an `objects` array. Each object needs `id`, `type`, `x`, `y`, `width` and `height`. IDs must be unique. Types are `platform`, `coin`, `spike`, `spawn` and `goal`. Optional `recognition` objects can store review or model metadata. Unknown top-level and object fields are rejected.

```json
{
  "schema_version": "1.0",
  "world": {"width": 960, "height": 540},
  "objects": [
    {"id": "floor", "type": "platform", "x": 0, "y": 460, "width": 960, "height": 20},
    {"id": "start", "type": "spawn", "x": 50, "y": 430, "width": 20, "height": 30},
    {"id": "finish", "type": "goal", "x": 850, "y": 424, "width": 24, "height": 36}
  ]
}
```

The current limits are 64–4096 pixels per world dimension and 256 objects. A playable document needs exactly one spawn and one goal. Everything must stay inside the world. Platforms cannot overlap each other, spawn or goal. Spawn also cannot overlap a spike or the goal. Coins and spikes may touch platforms; a spike standing on the floor has its bottom edge at the floor's top.

Spawn is the player's initial rectangle, with exactly the width and height in `physics.json` (20×30). To stand on a platform at Y=460, set spawn Y=430. Spawn may be in the air; it will fall when play starts. Validation rejects an embedded spawn but does not promise a safe landing.

Platforms are solid rectangles on all sides. Coins, spikes and goals use their entire rectangular bounds as overlap hitboxes. Spikes look triangular but their collision area includes the corners of that rectangle. Touching edges alone does not trigger a coin, spike or goal.

## Physics 1.0

`physics.json` is the only source of movement settings for the game and Python checker:

| Setting | Value |
| --- | --- |
| Gravity | 900 pixels/s² down |
| Horizontal speed | 180 pixels/s |
| Jump velocity | -360 pixels/s |
| Player | 20×30 pixels |
| Maximum fall speed | 600 pixels/s |
| Update rate | 60 Hz |
| Arcade overlap bias / tile bias | 4 / 16 |

Each step sets horizontal velocity from the keys, applies gravity, moves the body and resolves collisions. Jumping requires a new jump-key press while grounded. There is no double jump, air acceleration, bounce or moving platform. Side and top world boundaries are solid. Falling past the bottom causes death.

At 60 Hz, an unobstructed jump rises 69 pixels in Arcade Physics with these settings. The continuous formula gives 72 pixels, which is only an upper bound. Browser tests measure the actual jump. Shared numbers do not guarantee matching collision code, so checker paths are also replayed in Phaser.

## Image coordinates

`coordinates.image_to_world` accepts image dimensions, boxes with top-left coordinates, and target world dimensions. It uses the smaller of the horizontal and vertical scale factors and centres the result. The returned `padding` describes the unused space. Invalid or out-of-image boxes are rejected rather than silently clipped.

```python
from contracts.coordinates import image_to_world

result = image_to_world(200, 100, [
    {"id": "p1", "type": "platform", "x": 10, "y": 20, "width": 30, "height": 40}
], 960, 540)
# Scale: 4.8; padding: x=0, y=30; box: x=48, y=126, width=144, height=192.
```

This utility does not detect or classify symbols. A future recognition adapter should supply the boxes, choose the CNN labels, and then convert them. The converted spawn marker must be adjusted to the fixed player dimensions before saving a playable level. Objects should be shown for review; an incomplete detection result may not pass level validation yet.

## Examples

All examples are hand-authored JSON, not recognition results. Use the game selector or upload the JSON file in the demo.

| File | Purpose and observed expectation |
| --- | --- |
| `flat.json` | Walk to the goal; route replayed in Phaser. |
| `one-jump.json` | Jump across a gap onto a higher platform; route replayed. |
| `multi-jump.json` | Two upward jumps; route replayed. |
| `coins.json` | Collect a coin once; goal route replayed. |
| `spikes.json` | Walking into a spike kills the player; a jumping route was replayed. |
| `wide-gap.json` | Large gap; checker returns unknown and a tested jump attempt fails. |
| `high-goal.json` | Platform well above one jump's rise; checker returns unknown. |
| `blocked-jump.json` | A tall solid wall blocks the direct jump; checker returns unknown. |
| `edge-horizontal.json` | Gap near horizontal jump reach; route replayed. |
| `edge-vertical-low.json` | A 68-pixel rise near the measured limit; route replayed. |
| `edge-vertical.json` | A 70-pixel rise above the 69-pixel jump; checker returns unknown. |
| `invalid-*.json` | Missing spawn/goal/world/IDs, duplicate IDs, extra spawn/goal, bad types/versions, bad bounds, zero size, embedded spawn and overlapping solids. Validation rejects these. |

A filename is not proof of reachability. The results above come from tests; other movement sequences may behave differently on levels marked unknown.

Run the Python checks from the root with `python -m pytest contracts/tests -q`. Run TypeScript checks with `npm --prefix game test`.
