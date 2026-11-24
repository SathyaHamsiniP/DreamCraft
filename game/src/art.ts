import Phaser from "phaser";
import type { LevelObject } from "./contracts";

const runnerUrl = new URL('../assets/runner/skater.png', import.meta.url).href;
const barrierUrl = new URL('../assets/runner/barrier.png', import.meta.url).href;

export function loadArtwork(scene: Phaser.Scene) {
  if (!scene.textures.exists('skater')) scene.load.spritesheet('skater', runnerUrl, { frameWidth: 96, frameHeight: 128 });
  if (!scene.textures.exists('barrier')) scene.load.image('barrier', barrierUrl);
}

// Decorative light can extend past an object. Solid artwork follows its collision box.
export function drawBackdrop(scene: Phaser.Scene) {
  const sky = scene.add.graphics().setScrollFactor(0).setDepth(-20);
  // Keep the background fitted to the screen while the gameplay camera follows the runner.
  const camera = scene.cameras.main;
  sky.setScale(1 / camera.zoom).setPosition(camera.width * (1 - 1 / camera.zoom) / 2, camera.height * (1 - 1 / camera.zoom) / 2);
  const bands = [0x0b122c, 0x101936, 0x171f42, 0x20264c, 0x2d3157, 0x3c3860];
  bands.forEach((color, i) => sky.fillStyle(color).fillRect(0, i*90, 960, 91));
  for (let i = 0; i < 65; i++) {
    const x = (i*137+29)%960, y = (i*67+17)%300;
    sky.fillStyle(i%4 ? 0xb3ddeb : 0xf6e7b4, i%3 ? .55 : .9).fillCircle(x, y, i%7 ? 1 : 1.8);
  }
  sky.fillStyle(0x9e8be2, .08).fillCircle(782, 112, 78);
  sky.lineStyle(1, 0xbcb0fc, .25).strokeEllipse(782, 112, 175, 55);
  sky.fillStyle(0xe7dcff).fillCircle(782, 112, 43);
  sky.fillStyle(0xb1a2d8).fillCircle(796, 98, 6).fillCircle(767, 125, 10).fillCircle(789, 131, 4);
  for (let i = 0; i < 9; i++) {
    const x = i*140-80, top = 235+(i*37)%110;
    sky.fillStyle(i%2 ? 0x222e4c : 0x263851).fillTriangle(x, 455, x+90, top, x+210, 455);
    sky.lineStyle(1, 0x69949e, .25).lineBetween(x+90, top, x+120, top+65);
  }
  sky.fillStyle(0x142a3d).fillRect(0, 440, 960, 100);
  sky.lineStyle(1, 0x48b8ac, .12);
  for (let x = -600; x < 1500; x += 100) sky.lineBetween(480, 407, x, 540);
  for (let y = 450; y < 540; y += 22) sky.lineBetween(0, y, 960, y);
  for (let i = 0; i < 18; i++) {
    const x = i*61, h = 18+(i*23)%58;
    sky.fillStyle(0x102133).fillRect(x, 440-h, 22, h);
    sky.fillStyle(0x6ee7ce, .3).fillRect(x+5, 449-h, 3, 5);
  }
}

export function drawObject(scene: Phaser.Scene, object: LevelObject) {
  const { width: w, height: h, type } = object;
  const art = scene.add.container(object.x, object.y);
  const g = scene.add.graphics(); art.add(g);
  if (type === "platform") {
    g.fillStyle(0x142b3c).fillRoundedRect(0, 0, w, h, Math.min(4, h/4));
    g.fillStyle(0x365269).fillRect(0, 0, w, Math.min(8, h));
    g.fillStyle(0x7ef2d1).fillRect(0, 0, w, Math.min(3, h));
    g.lineStyle(1, 0x89aec0, .45).lineBetween(0, Math.min(9,h), w, Math.min(9,h));
    for (let x = 12; x < w-8; x += 42) {
      g.fillStyle(0x253f52).fillRect(x, Math.min(14,h*.4), Math.min(25,w-x), h*.45);
      g.fillStyle(0x78919f).fillCircle(x, Math.min(6,h*.5), 1.2);
      g.lineStyle(1, 0x476476).lineBetween(x, h*.65, Math.min(w,x+10), h-3);
    }
  } else if (type === "coin") {
    const glow = scene.add.graphics().fillStyle(0xffdd68, .2).fillEllipse(w/2,h/2,w+12,h+12);
    art.addAt(glow, 0);
    g.fillStyle(0xa86617).fillEllipse(w/2,h/2,w,h);
    g.fillStyle(0xffd55a).fillEllipse(w/2,h/2,w*.84,h*.87);
    g.lineStyle(1.5,0xfff1ba).strokeEllipse(w/2,h/2,w*.68,h*.72);
    g.fillStyle(0xa97221).fillPoints([{x:w*.5,y:h*.24},{x:w*.67,y:h*.5},{x:w*.5,y:h*.76},{x:w*.33,y:h*.5}],true);
    scene.tweens.add({ targets: glow, alpha: .35, duration: 800, yoyo: true, repeat: -1 });
  } else if (type === "spike") {
    g.fillStyle(0xf04d57,.18).fillRoundedRect(-3,-3,w+6,h+6,4);
    art.add(scene.add.image(w/2, h/2, 'barrier').setDisplaySize(w, h));
    const warning = scene.add.graphics().fillStyle(0xffc84c).fillCircle(w/2, -2, 2);
    art.add(warning);
    scene.tweens.add({ targets: warning, alpha: .35, duration: 500, yoyo: true, repeat: -1 });
  } else if (type === "goal") {
    const glow = scene.add.graphics().fillStyle(0xa478ff,.18).fillEllipse(w/2,h/2,w+18,h+14);
    art.addAt(glow,0);
    g.fillStyle(0x3e2c6f).fillRoundedRect(0,0,w,h,Math.min(w/2,12));
    g.lineStyle(3,0xba98ff).strokeRoundedRect(2,2,Math.max(1,w-4),Math.max(1,h-4),Math.min(w/2,10));
    g.fillStyle(0x704dba).fillRoundedRect(w*.2,h*.13,w*.6,h*.75,8);
    g.lineStyle(1,0x86fff0,.8);
    for(let i=0;i<3;i++) g.strokeEllipse(w/2,h*(.3+i*.2),w*(.35+i*.08),h*.14);
    g.fillStyle(0x67e6d5).fillRect(w*.2,h*.9,w*.6,Math.max(2,h*.08));
    scene.tweens.add({ targets: glow, alpha: .3, duration: 1100, yoyo: true, repeat: -1 });
    art.add(scene.add.text(w/2,-24,"FINISH",{fontFamily:'monospace',fontSize:'10px',fontStyle:'bold',color:'#dfd3ff',backgroundColor:'#251e49'}).setOrigin(.5,0).setPadding(4,3));
  }
  return art;
}

export function poseRunner(sprite: Phaser.GameObjects.Sprite, ticks: number, moving: boolean, grounded: boolean, vy: number, state: string) {
  const frame = state === 'dead' ? 21 : !grounded && state === 'playing'
    ? vy < 0 ? 19 : 21
    : moving ? 8 + Math.floor(ticks / 4) % 8 : Math.floor(ticks / 12) % 8;
  sprite.setFrame(frame).setTint(state === 'dead' ? 0xe99898 : 0xffffff);
}

export function drawPlayer(scene: Phaser.Scene, width: number, height: number) {
  // Keep the feet on the body baseline. Sleeve and shoe motion is decorative.
  return scene.add.sprite(0, 0, 'skater', 0).setOrigin(.5, .94)
    .setDisplaySize(width * 1.4, height * 1.2).setDepth(5);
}
