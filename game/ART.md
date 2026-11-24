# Runner artwork

The game now draws an original teal lizard runner with a short scarf and alternating
leg poses. It uses the familiar side-view runner idea, with no copied game sprites
or external artwork. Background stars, a moon, distant ruins and textured ledges
make the level easier to read against the dark sky.

The spike symbol becomes a red armored trap with teeth and warning markings. The
coin and finish portal have pulsing light. These drawings use Phaser graphics and
tweens, so there are no image downloads or new game dependencies.

Artwork remains separate from Arcade bodies. Moving legs, glow and portal light do
not change collisions. The trap still has the shared rectangular hazard hitbox.
Automatic generation fits supported hazards to one jump and records that geometry
change; manually supplied level JSON is kept as written. The five sketch symbols,
player dimensions, gravity, speed and jump velocity are unchanged.

Browser tests check the full controlled touching-spike scene, CNN classification,
Phaser replay, and clearing the fitted hazard with one real Space press. This is
not a handwriting accuracy result. The user's actual checkpoint and original photo
were not available as local files here; the tests use synthetic scenes and the
existing test-only checkpoint.
