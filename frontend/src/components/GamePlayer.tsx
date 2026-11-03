import { useEffect, useRef, useState } from "react";
import { loadEngine, type GameHandle, type GameEvent } from "../services/game";
import type { Level } from "../types";
export function GamePlayer({ level }: { level: Level }) {
  const container = useRef<HTMLDivElement>(null),
    handle = useRef<GameHandle | null>(null);
  const [event, setEvent] = useState<GameEvent>({
    type: "state",
    state: "ready",
    score: 0,
  });
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let game: GameHandle | undefined;
    setLoading(true);
    setError("");
    // A separate parent keeps a delayed Phaser destroy from affecting the next mount.
    const parent = document.createElement("div");
    parent.className = "phaser-host";
    container.current!.append(parent);
    loadEngine()
      .then(({ mountGame }) => {
        if (!active) return;
        game = mountGame(parent, level, {
          keyboardTarget: container.current!,
          onEvent: (next) => {
            if (active) {
              setEvent(next);
              setLoading(false);
            }
          },
        });
        handle.current = game;
      })
      .catch((e) => {
        if (active) {
          setError(String(e));
          setLoading(false);
        }
      });
    return () => {
      active = false;
      handle.current = null;
      game?.destroy();
      parent.remove();
    };
  }, [level]);
  function control(action: "start" | "restart") {
    handle.current?.[action]();
    container.current?.focus();
  }
  return (
    <section className="card game-player">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">GAME PREVIEW</div>
          <h2>Give your world a try</h2>
        </div>
        <div className="game-stats">
          <span data-testid="game-state">
            {loading ? "Loading…" : event.state}
          </span>
          <span>
            ● Coins: <b data-testid="coin-score">{event.score}</b>
          </span>
        </div>
      </div>
      {error && (
        <p role="alert" className="error">
          Cannot start the game: {error}
        </p>
      )}
      <div
        ref={container}
        className="game-container"
        tabIndex={0}
        aria-label="Game area. Use arrow keys to move and Space to jump."
      />
      <div className="panel-heading">
        <div className="actions">
          <button
            className="primary"
            disabled={loading || !!error}
            onClick={() => control("start")}
          >
            Start game
          </button>
          <button
            disabled={loading || !!error}
            onClick={() => control("restart")}
          >
            Restart
          </button>
        </div>
        <small>
          ← → or A / D to move · Space to jump · Enter to start · R to restart
        </small>
      </div>
      <p className="hint">
        Click Start game to focus the game. Move focus away before using
        keyboard shortcuts in the editor. Touch devices can view the game;
        playing needs a keyboard.
      </p>
    </section>
  );
}
