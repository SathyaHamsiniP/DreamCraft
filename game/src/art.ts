import Phaser from "phaser";
import type { LevelObject } from "./contracts";

// Artwork is separate from the rectangles used by physics and the checker.
export function drawBackdrop(scene: Phaser.Scene) {
  const sky = scene.add.graphics().setScrollFactor(0).setDepth(-20);
  sky.fillStyle(0xdff3ff).fillRect(0, 0, 960, 540);
  sky.fillStyle(0xf2fbff).fillRect(0, 250, 960, 290);
  sky.fillStyle(0xffdf83).fillCircle(795, 92, 38);
  sky.fillStyle(0xffedb8, 0.5).fillCircle(795, 92, 50);
  for (const [x, y] of [
    [100, 95],
    [410, 150],
    [650, 65],
  ]) {
    sky.fillStyle(0xffffff, 0.9);
    sky.fillRoundedRect(x, y, 110, 24, 12);
    sky.fillCircle(x + 30, y, 21);
    sky.fillCircle(x + 65, y - 7, 28);
  }
  sky.fillStyle(0xd3e8e9).fillEllipse(160, 530, 650, 450);
  sky.fillStyle(0xc3dfe0).fillEllipse(720, 550, 750, 430);
  sky.fillStyle(0xafced2).fillEllipse(310, 620, 780, 420);
  sky.fillStyle(0x8ab3c0).fillRect(0, 520, 960, 20);
}

export function drawObject(scene: Phaser.Scene, object: LevelObject) {
  const { width: w, height: h, type } = object;
  const art = scene.add.container(object.x, object.y);
  const g = scene.add.graphics();
  art.add(g);
  if (type === "platform") {
    g.fillStyle(0x344d6a).fillRoundedRect(0, 0, w, h, Math.min(4, h / 4));
    g.fillStyle(0x547493).fillRect(0, 0, w, Math.min(7, h));
    g.fillStyle(0x7ad5c3).fillRect(0, 0, w, Math.min(3, h));
    g.lineStyle(1, 0x89a5b8, 0.35);
    for (let x = 20; x < w; x += 38)
      g.lineBetween(x, Math.min(10, h), x + 10, Math.min(10, h));
  } else if (type === "coin") {
    g.fillStyle(0xffe8a0, 0.3).fillEllipse(w / 2, h / 2, w + 8, h + 8);
    g.fillStyle(0xffce45).fillEllipse(w / 2, h / 2, w, h);
    g.lineStyle(2, 0xa66a14).strokeEllipse(w / 2, h / 2, w, h);
    g.lineStyle(2, 0xfff1a1).lineBetween(w * 0.4, h * 0.25, w * 0.4, h * 0.7);
  } else if (type === "spike") {
    g.fillStyle(0xe55561).fillTriangle(0, h, w / 2, 0, w, h);
    g.lineStyle(2, 0x953541).strokeTriangle(0, h, w / 2, 0, w, h);
    g.lineStyle(2, 0xffc2bc).lineBetween(w / 2, h * 0.25, w * 0.72, h * 0.8);
    g.fillStyle(0x953541).fillRect(0, Math.max(0, h - 3), w, Math.min(3, h));
  } else if (type === "goal") {
    g.fillStyle(0x9673dc, 0.18).fillRoundedRect(-5, -5, w + 10, h + 10, 6);
    g.fillStyle(0x8051c4).fillRoundedRect(0, 0, w, h, Math.min(5, w / 4));
    g.fillStyle(0xcdb3f4).fillRoundedRect(
      w * 0.2,
      h * 0.15,
      w * 0.6,
      h * 0.85,
      Math.min(4, w / 5),
    );
    g.lineStyle(2, 0x593890).lineBetween(w / 2, -26, w / 2, 0);
    g.fillStyle(0x8051c4).fillTriangle(w / 2, -26, w / 2 + 21, -19, w / 2, -12);
    const label = scene.add
      .text(w / 2, -43, "FINISH", {
        fontFamily: "sans-serif",
        fontSize: "11px",
        fontStyle: "bold",
        color: "#593890",
        backgroundColor: "#ffffff",
      })
      .setOrigin(0.5, 0)
      .setPadding(4, 2);
    art.add(label);
  }
  return art;
}

export function drawPlayer(scene: Phaser.Scene, width: number, height: number) {
  const g = scene.add.graphics().setDepth(5);
  g.fillStyle(0x1c437d).fillRoundedRect(0, 0, width, height, 4);
  g.fillStyle(0x3c8afa).fillRoundedRect(1, 1, width - 2, height - 4, 4);
  g.fillStyle(0xe6f4ff).fillRoundedRect(3, 5, width - 6, 10, 3);
  g.fillStyle(0x163452)
    .fillRect(6, 8, 2, 4)
    .fillRect(width - 8, 8, 2, 4);
  g.fillStyle(0x163452)
    .fillRect(1, height - 4, 6, 4)
    .fillRect(width - 7, height - 4, 6, 4);
  return g;
}
