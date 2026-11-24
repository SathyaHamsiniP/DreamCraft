# Runner artwork

The player is a cartoon human runner with a red shirt, jeans and sneakers. Idle,
run and jump poses come from Kenney's **Animated Characters Protagonists** pack,
listed as **Animated Characters 2** in the downloaded files. Kay Lousberg made
the characters. The hurdle uses the red and white divider from Kenney's
**Racing Kit**. These are CC0 assets that can be used and shared with this project.

Sources:

- [Animated Characters Protagonists](https://kenney.nl/assets/animated-characters-protagonists)
- [Racing Kit](https://kenney.nl/assets/racing-kit)
- [CC0 terms](https://creativecommons.org/publicdomain/zero/1.0/)
- [Public download mirror](https://github.com/ETdoFresh/kenney.nl), commit
  `45df48c4d45f8716216b1a9e22df0b69cd9f5932`

The license text and source checksums are in `assets/runner/`. No
characters or artwork from Subway Surfers are included. This is still a side-view
platform game, with a cartoon runner style.

## How the artwork works

Blender renders the 3D source models into small transparent PNG files. Phaser uses
those local images in both the standalone game and React Studio. The browser does
not need Blender, a 3D engine or an external asset server. Vite includes the images
in production builds. The two runtime images total about 251 KiB.

The runner sheet has eight columns and three rows of 96 by 128 pixel frames:
idle, run and jump. The renderer copies world poses because the FBX clips have
different rest poses. The game chooses poses from its physics ticks, so manual
route replays and normal gameplay use the same frames. Facing left flips the
sprite without changing its collision body.

The divider is raised three times in the source render and its red material is
darkened. The final image fills the supplied hazard box. A small warning light
marks the danger. The triangle drawing still maps to the internal `spike` class:
touching its rectangular body ends the run. It is not a new object class.

The camera follows at 1.5 times zoom to make the runner easier to see. Background
stars, the moon, distant buildings, platforms, coins and the portal use Phaser
graphics. The runner's sleeves and moving shoes are decorative. Player
dimensions, collision bodies, gravity, speed and jump velocity are unchanged.

## Render the images again

Normal setup and CI use the committed PNG files. Rebuilding the art is optional
and needs Blender 4.3.2. Download the source packs or use the public mirror:

```bash
git clone --depth 1 --filter=blob:none --sparse https://github.com/ETdoFresh/kenney.nl /tmp/dreamcraft-art
git -C /tmp/dreamcraft-art sparse-checkout set animated-characters-2
git -C /tmp/dreamcraft-art fetch --depth 1 origin 45df48c4d45f8716216b1a9e22df0b69cd9f5932
git -C /tmp/dreamcraft-art checkout --detach FETCH_HEAD
curl --fail --location 'https://raw.githubusercontent.com/ETdoFresh/kenney.nl/45df48c4d45f8716216b1a9e22df0b69cd9f5932/kenney_racingkit2/Models/GLTF%20format/barrierWall.glb' --output /tmp/barrierWall.glb
blender -b --factory-startup --python game/scripts/render_runner.py -- --character /tmp/dreamcraft-art/animated-characters-2 --barrier /tmp/barrierWall.glb --output game/assets/runner
```

Run this from the repository root. Compare downloaded files with
`assets/runner/sources.json` before rendering. Blender and graphics driver versions
can produce small rendering differences.

## Checks and limits

Browser tests check visible sprite frames, local loading, restarts, keyboard
movement, route completion and an error when artwork cannot load. Both app builds
include the images. Tests also cover the controlled touching-spike scene, CNN
classification, Phaser replay and clearing the fitted hazard with one Space press.

These gameplay checks use synthetic scenes and a controlled test checkpoint.
They do not measure handwriting accuracy. The user's trained checkpoint and
original uploaded photo were not available as local files here.
