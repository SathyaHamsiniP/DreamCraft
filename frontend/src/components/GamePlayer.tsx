import { useEffect, useRef, useState } from "react";
import { loadEngine, type GameHandle, type GameEvent } from "../services/game";
import type { Level } from "../types";
import { userMessage } from "../services/messages";
export function GamePlayer({ level }: { level: Level }) {
  const container = useRef<HTMLDivElement>(null),
    handle = useRef<GameHandle | null>(null);
  const stage = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const [event, setEvent] = useState<GameEvent>({
    type: "state",
    state: "ready",
    score: 0,
  });
  const [position, setPosition] = useState("");
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let game: GameHandle | undefined;
    setLoading(true);
    setError("");
    started.current = false;
    // A separate parent keeps a delayed Phaser destroy from affecting the next mount.
    const parent = document.createElement("div");
    parent.className = "phaser-host";
    container.current!.append(parent);
    const monitor = setInterval(() => {
      const s = game?.snapshot?.();
      if (s && active) setPosition(`X ${Math.round(s.x)}, Y ${Math.round(s.y)} · ${s.grounded ? "on platform" : "in air"}`);
    }, 100);
    loadEngine()
      .then(({ mountGame }) => {
        if (!active) return;
        game = mountGame(parent, level, {
          keyboardTarget: container.current!,
          onError: (message) => {
            if (active) { setError(message); setLoading(false); }
          },
          onEvent: (next) => {
            if (active) {
              setEvent(next);
              setLoading(false);
              if (next.state === 'playing') started.current = true;
              if (next.state === 'ready' && started.current) {
                queueMicrotask(() => { if (active) game?.start(); });
              }
            }
          },
        });
        handle.current = game;
      })
      .catch((e) => {
        if (active) {
          setError(userMessage(e instanceof Error ? e.message : String(e)));
          setLoading(false);
        }
      });
    return () => {
      active = false;
      clearInterval(monitor);
      handle.current = null;
      game?.destroy();
      parent.remove();
    };
  }, [level]);
  const totalCoins = level.objects.filter((o) => o.type === "coin").length;
  function control(action: "start" | "restart") {
    started.current = true;
    handle.current?.[action]();
    stage.current?.scrollIntoView?.({ block: 'center', behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ? 'auto' : 'smooth' });
    container.current?.focus({ preventScroll: true });
  }
  return (
    <section className="card game-player">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">GAME PREVIEW</div>
          <h2>Reach the finish</h2>
        </div>
        <div className="game-stats">
          <span data-testid="game-state">
            {loading ? "Loading…" : event.state}
          </span>
          {totalCoins > 0 && (
            <span className="coin-counter">
              ● Bonus coins: <b data-testid="coin-score">{event.score}</b> /{" "}
              {totalCoins}
            </span>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          Cannot start the game: {error}
        </p>
      )}
      <div className="game-toolbar">
        <div className="actions">
          <button className="primary" disabled={loading || !!error || event.state !== 'ready'} onClick={() => control('start')}>Start game</button>
          <button disabled={loading || !!error} onClick={() => control('restart')}>Restart</button>
        </div>
        <p>Use ← → to move and Space to jump.</p>
      </div>
      <div ref={stage} className="game-stage">
        <div
          ref={container}
          className="game-container"
          tabIndex={0}
          onPointerDown={() => container.current?.focus({ preventScroll: true })}
          aria-label="Game area. Use arrow keys to move and Space to jump."
        />
        {!loading && !error && event.state !== "playing" && (
          <div className={`game-overlay ${event.state}`} aria-live="polite">
            <div className="game-message">
              <span className="eyebrow">
                {event.state === "completed"
                  ? "FINISH REACHED"
                  : event.state === "dead"
                    ? "ONE MORE TRY"
                    : "YOUR MISSION"}
              </span>
              <h3>
                {event.state === "completed"
                  ? "Level complete!"
                  : event.state === "dead"
                    ? "Try that jump again"
                    : "Ready to play?"}
              </h3>
              <p>
                {event.state === "completed"
                  ? totalCoins
                    ? `You collected ${event.score} of ${totalCoins} bonus coins. Reaching the portal completes the level.`
                    : "You reached the glowing finish portal. Nice work!"
                  : event.state === "dead"
                    ? "Jump over red barriers and across gaps. Restart to try again."
                    : "Move right, jump between platforms, and touch the glowing finish portal."}
              </p>
              {event.state === "completed" && totalCoins > event.score && (
                <small>
                  Want another challenge? Restart and try to collect every coin.
                </small>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="game-guide" aria-label="How to play">
        <p>Guide the runner to the purple portal. Use the arrow keys or A and D to move, and press Space, W or the up arrow to jump over gaps and red barriers.
          {totalCoins > 0 && ' Gold coins add one bonus point each; collecting them is optional.'}
        </p>
      </div>
      <output hidden aria-label="Player position">{position}</output>
    </section>
  );
}
