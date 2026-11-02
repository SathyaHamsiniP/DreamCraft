import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../services/api";
import type { LevelRecord } from "../types";
export function LevelsPage() {
  const [records, setRecords] = useState<LevelRecord[]>([]),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(""),
    [offset, setOffset] = useState(0),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setBusy(true);
    setError("");
    api
      .list(offset, controller.signal)
      .then((data) => {
        if (active) setRecords(data);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [offset, retry]);
  return (
    <>
      <header className="page-heading">
        <div>
          <div className="eyebrow">MADE BY YOU</div>
          <h1>My levels</h1>
          <p>Your games, saved in the backend database.</p>
        </div>
        <Link to="/studio" className="button primary">
          + Create a game
        </Link>
      </header>
      {busy ? (
        <p role="status" className="card">
          Loading saved levels…
        </p>
      ) : error ? (
        <section role="alert" className="error">
          {error}
          <button onClick={() => setRetry((n) => n + 1)}>Try again</button>
        </section>
      ) : records.length ? (
        <div className="level-grid">
          {records.map((record, i) => (
            <article key={record.id} className="card level-card">
              <div className="mini-world" aria-hidden="true">
                {record.level.objects.map((o) => (
                  <span
                    key={o.id}
                    className={o.type}
                    style={{
                      left: `${(o.x / record.level.world.width) * 100}%`,
                      top: `${(o.y / record.level.world.height) * 100}%`,
                      width: `${Math.max(1, (o.width / record.level.world.width) * 100)}%`,
                      height: `${Math.max(2, (o.height / record.level.world.height) * 100)}%`,
                    }}
                  />
                ))}
              </div>
              <div className="level-card-body">
                <span className="badge">Saved game</span>
                <h2>Level {offset + i + 1}</h2>
                <p>
                  {record.level.objects.length} objects ·{" "}
                  {record.level.world.width} × {record.level.world.height}
                </p>
                <small>
                  Saved {new Date(record.updated_at).toLocaleString()}
                  <br />
                  <span className="record-id">{record.id}</span>
                </small>
                <Link
                  className="button primary"
                  to={`/studio?level=${record.id}`}
                >
                  Open, edit & play →
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="card empty-state">
          <span aria-hidden="true">▧</span>
          <h2>No saved levels here yet</h2>
          <p>Start with a sample or turn a drawing into a game.</p>
          <Link to="/studio?sample=flat" className="button primary">
            Try a sample game
          </Link>
        </section>
      )}
      <div className="actions pagination">
        <button
          disabled={busy || offset === 0}
          onClick={() => setOffset((n) => Math.max(0, n - 100))}
        >
          Previous
        </button>
        <span>Page {Math.floor(offset / 100) + 1}</span>
        <button
          disabled={busy || records.length < 100}
          onClick={() => setOffset((n) => n + 100)}
        >
          Next
        </button>
      </div>
    </>
  );
}
