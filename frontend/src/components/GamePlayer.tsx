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
  const totalCoins = level.objects.filter((o) => o.type === "coin").length;
  function control(action: "start" | "restart") {
    handle.current?.[action]();
    container.current?.focus();
  }
  return (
    <section className="card game-player">
      <div className="panel-heading">
        <div>
          <div className="eyebrow">GAME PREVIEW</div>
          <h2>Reach the finish flag</h2>
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
      <div className="game-stage">
        <div
          ref={container}
          className="game-container"
          tabIndex={0}
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
                    : "A little adventure awaits"}
              </h3>
              <p>
                {event.state === "completed"
                  ? totalCoins
                    ? `You collected ${event.score} of ${totalCoins} bonus coins. Coins are optional — reaching the flag wins the level.`
                    : "You reached the purple finish flag. Nice work!"
                  : event.state === "dead"
                    ? "Avoid the red spikes and jump across gaps. Restart to try again."
                    : "Move right, jump between platforms, and touch the purple finish flag."}
              </p>
              {event.state === "ready" && (
                <small>Press Start game below, then use ← → and Space.</small>
              )}
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
        <div>
          <b>01 · Move & jump</b>
          <span>
            You are the blue explorer. ← → or A / D moves. Space, W or ↑ jumps.
          </span>
        </div>
        <div>
          <b>02 · Watch your step</b>
          <span>Land on platforms. Gaps and red spikes end a run.</span>
        </div>
        <div>
          <b>03 · Find the finish</b>
          <span>
            Touch the purple flag to win.
            {totalCoins > 0
              ? " Gold coins give 1 bonus point each; you do not need them to finish."
              : " This level has no coins."}
          </span>
        </div>
      </div>
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
        Click Start game to focus the game. All sketch levels use these controls
        and this visual style; your reviewed objects decide the layout. Playing
        needs a keyboard.
      </p>
    </section>
  );
}
