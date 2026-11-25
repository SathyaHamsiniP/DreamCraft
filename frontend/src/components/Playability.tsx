import type { CheckResult } from "../types";
import { userMessage, userNotes } from '../services/messages';
export function Playability({ result }: { result: CheckResult }) {
  const title = {
    reachable: "A path to the finish was found",
    unreachable: "This level needs a change",
    unknown: "We could not finish checking this level",
  }[result.status];
  return (
    <section
      className={`card check-result ${result.status}`}
      aria-live="polite"
    >
      <div className="eyebrow">CAN YOU REACH THE FINISH?</div>
      <h2>{title}</h2>
      <p>{userMessage(result.reason)}</p>
      {result.status === "reachable" && !result.verified_in_game && (
        <p>This path has not been tried in the game yet.</p>
      )}
      {result.verified_in_game && <p>An automatic test reached the finish in the game.</p>}
      {result.difficulty?.status === 'timing_sensitive' && <p>Some jumps may need careful timing. Try the level to see how they feel.</p>}
      {result.status !== 'reachable' && userNotes(result.suggestions).map(s => <p key={s}>{s}</p>)}
      {(result.status === "unknown" || result.status === "unreachable") && <p>You can use Advanced Edit to add a step, shorten a gap or lower the finish, then check again.</p>}
      {result.status === "unknown" && (
        <p>
          This does not mean the level is impossible. Try it in the game and
          review the object positions.
        </p>
      )}
      {userNotes(result.warnings).map((w) => (
        <p key={w}>{w}</p>
      ))}
      <div className="search-info">
        {typeof result.search?.expanded === 'number' && <span>Paths checked: {result.search.expanded}</span>}
      </div>
    </section>
  );
}
