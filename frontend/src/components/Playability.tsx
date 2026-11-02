import type { CheckResult } from "../types";
export function Playability({ result }: { result: CheckResult }) {
  const title = {
    reachable: "A route was found",
    unreachable: "The checker found an unreachable condition",
    unknown: "The checker could not decide",
  }[result.status];
  return (
    <section
      className={`card check-result ${result.status}`}
      aria-live="polite"
    >
      <div className="eyebrow">PLAYABILITY · {result.status.toUpperCase()}</div>
      <h2>{title}</h2>
      <p>{result.reason}</p>
      {result.status === "reachable" && !result.verified_in_game && (
        <p>This route has not been verified in Phaser for this request.</p>
      )}
      {result.status === "unknown" && (
        <p>
          This does not mean the level is impossible. Try it in the game and
          review the object positions.
        </p>
      )}
      {result.warnings?.map((w) => (
        <p key={w}>{w}</p>
      ))}
      <div className="search-info">
        {Object.entries(result.search || {}).map(([key, value]) => (
          <span key={key}>
            {key.replaceAll("_", " ")}: {String(value)}
          </span>
        ))}
      </div>
      <details>
        <summary>Technical details</summary>
        <pre>{JSON.stringify(result, null, 2)}</pre>
      </details>
    </section>
  );
}
