import Phaser from 'phaser';
import { PHYSICS as P, parseLevel } from './contracts';

export type GameState = 'ready' | 'playing' | 'dead' | 'completed';
export interface GameEvent { type: 'state' | 'coin'; state: GameState; score: number }
export interface Snapshot { state: GameState; score: number; x: number; y: number; vx: number; vy: number; grounded: boolean; ticks: number }
export interface GameHandle {
  loadLevel(value: unknown): void; restart(): void; start(): void;
  snapshot(): Snapshot | null; step(frames: number): void; destroy(): void;
}
interface MountOptions { onEvent?: (event: GameEvent) => void; manual?: boolean }

export function mountGame(parent: HTMLElement, initial: unknown, options: MountOptions = {}): GameHandle {
  let current = parseLevel(initial);
  let alive = true;
  let pending = true;
  class LevelScene extends Phaser.Scene {
    player!: Phaser.GameObjects.Rectangle;
    keys!: Record<string, Phaser.Input.Keyboard.Key>;
    state: GameState = 'ready';
    score = 0; ticks = 0; accumulator = 0; jumpHeld = false;
    get body() { return this.player.body as Phaser.Physics.Arcade.Body; }
    emitState() { options.onEvent?.({ type: 'state', state: this.state, score: this.score }); }
    create() {
      pending = false;
      this.state = 'ready'; this.score = 0; this.ticks = 0; this.accumulator = 0; this.jumpHeld = false;
      this.physics.world.setBounds(0, 0, current.world.width, current.world.height, true, true, true, false);
      this.cameras.main.setBounds(0, 0, current.world.width, current.world.height);
      const solids = this.physics.add.staticGroup();
      const coins = this.physics.add.staticGroup();
      const spikes = this.physics.add.staticGroup();
      const goals = this.physics.add.staticGroup();
      for (const o of current.objects) {
        if (o.type === 'spawn') continue;
        const colors = { platform: 0x40556b, coin: 0xf1bd32, spike: 0xc63c3c, goal: 0x258d5b };
        const shape = o.type === 'spike'
          ? this.add.triangle(o.x + o.width / 2, o.y + o.height / 2, 0, o.height, o.width / 2, 0, o.width, o.height, colors.spike)
          : this.add.rectangle(o.x + o.width / 2, o.y + o.height / 2, o.width, o.height, colors[o.type]);
        this.physics.add.existing(shape, true);
        const body = shape.body as Phaser.Physics.Arcade.StaticBody;
        body.setSize(o.width, o.height); body.position.set(o.x, o.y); body.updateCenter();
        ({ platform: solids, coin: coins, spike: spikes, goal: goals })[o.type].add(shape);
      }
      const spawn = current.objects.find(o => o.type === 'spawn')!;
      this.player = this.add.rectangle(spawn.x + P.player_width / 2, spawn.y + P.player_height / 2, P.player_width, P.player_height, 0x2877c6);
      this.physics.add.existing(this.player);
      this.body.setCollideWorldBounds(true).setMaxVelocity(P.speed, P.max_fall_speed);
      this.body.setSize(P.player_width, P.player_height);
      this.physics.add.collider(this.player, solids);
      this.physics.add.overlap(this.player, coins, (_player, coin) => {
        const item = coin as Phaser.GameObjects.Rectangle;
        if (this.state !== 'playing' || !(item.body as Phaser.Physics.Arcade.StaticBody).enable) return;
        (item.body as Phaser.Physics.Arcade.StaticBody).enable = false;
        item.setVisible(false);
        this.score += 1; options.onEvent?.({ type: 'coin', state: this.state, score: this.score });
      });
      this.physics.add.overlap(this.player, spikes, () => this.die());
      this.physics.add.overlap(this.player, goals, () => {
        if (this.state === 'playing') { this.state = 'completed'; this.body.setVelocity(0, 0); this.body.enable = false; this.emitState(); }
      });
      this.keys = this.input.keyboard!.addKeys('A,D,W,LEFT,RIGHT,UP,SPACE,R,ENTER') as Record<string, Phaser.Input.Keyboard.Key>;
      this.cameras.main.startFollow(this.player, true); this.emitState();
    }
    start() { if (this.state === 'ready') { this.state = 'playing'; this.emitState(); } }
    die() {
      if (this.state !== 'playing') return;
      this.state = 'dead'; this.body.setVelocity(0, 0); this.body.enable = false; this.emitState();
    }
    fixedStep() {
      if (pending || !this.player || !this.keys) return;
      if (Phaser.Input.Keyboard.JustDown(this.keys.R)) { pending = true; this.scene.restart(); return; }
      if (Phaser.Input.Keyboard.JustDown(this.keys.ENTER)) this.start();
      const jumping = this.keys.SPACE.isDown || this.keys.W.isDown || this.keys.UP.isDown;
      if (this.state === 'playing') {
        const direction = Number(this.keys.D.isDown || this.keys.RIGHT.isDown) - Number(this.keys.A.isDown || this.keys.LEFT.isDown);
        this.body.setVelocityX(direction * P.speed);
        if (jumping && !this.jumpHeld && this.body.blocked.down) this.body.setVelocityY(P.jump_velocity);
        this.physics.world.update(0, 1000 / P.fps); this.physics.world.postUpdate(); this.ticks++;
        if (this.body.y >= current.world.height) this.die();
      }
      this.jumpHeld = jumping;
    }
    update(_time: number, delta: number) {
      if (options.manual) return;
      this.accumulator += Math.min(delta, 100);
      while (this.accumulator >= 1000 / P.fps) { this.fixedStep(); this.accumulator -= 1000 / P.fps; }
    }
    snapshot(): Snapshot {
      return { state: this.state, score: this.score, x: this.body.x, y: this.body.y, vx: this.body.velocity.x, vy: this.body.velocity.y, grounded: this.body.blocked.down, ticks: this.ticks };
    }
  }
  const scene = new LevelScene('level');
  const game = new Phaser.Game({
    type: Phaser.CANVAS, parent, width: 960, height: 540, backgroundColor: '#e8eff5',
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { gravity: { x: 0, y: P.gravity }, fps: P.fps, fixedStep: true, customUpdate: true, overlapBias: P.collision.overlap_bias, tileBias: P.collision.tile_bias } },
    scene: [scene], audio: { noAudio: true },
  });
  function ready() { return alive && !pending && scene.sys.isActive() && Boolean(scene.player); }
  return {
    loadLevel(value) { const next = parseLevel(value); if (!alive) throw new Error('Game has been destroyed'); current = next; if (ready()) { pending = true; scene.scene.restart(); } },
    restart() { if (ready()) { pending = true; scene.scene.restart(); } }, start() { if (ready()) scene.start(); },
    snapshot() { return ready() ? scene.snapshot() : null; },
    step(frames) {
      if (!options.manual) throw new Error('Manual stepping is only available in test mode');
      if (!Number.isInteger(frames) || frames < 0 || frames > 3600) throw new Error('Step count must be between 0 and 3600');
      if (ready()) for (let i = 0; i < frames; i++) scene.fixedStep();
    },
    destroy() { if (alive) { alive = false; game.destroy(true); } },
  };
}
