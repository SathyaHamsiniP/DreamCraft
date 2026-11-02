import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { parseLevel } from "../../../game/src/contracts";
import { useStudio, fromLevel } from "../state";
import { api, createLevel, detect, normalizedImage } from "../services/api";
import { boxWarnings, candidateBoxes } from "../services/recognition";
import { samples, sampleLevel } from "../services/samples";
import type { Box, CheckResult, Draft } from "../types";
import { Upload } from "../components/Upload";
import { ObjectEditor } from "../components/ObjectEditor";
import { GamePlayer } from "../components/GamePlayer";
import { Playability } from "../components/Playability";
export function StudioPage() {
  const { draft, setDraft, ask } = useStudio();
  const [search, setSearch] = useSearchParams();
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [method, setMethod] = useState("adaptive");
  const [detectionWarnings, setDetectionWarnings] = useState<string[]>([]),
    [check, setCheck] = useState<CheckResult | null>(null);
  const request = useRef<AbortController | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      request.current?.abort();
    };
  }, []);
  const query = search.toString();
  useEffect(() => {
    const id = new URLSearchParams(query).get("level"),
      sample = new URLSearchParams(query).get("sample");
    if (!id && !sample) return;
    const abort = new AbortController();
    let active = true;
    async function open() {
      try {
        setBusy("Loading level");
        setError("");
        const record = id ? await api.get(id, abort.signal) : null;
        const level = record?.level || sampleLevel(sample!);
        if (!active) return;
        if (
          draft.dirty &&
          !(await ask(
            "Opening this level will replace your unsaved studio changes. Continue?",
          ))
        ) {
          if (active) setSearch({}, { replace: true });
          return;
        }
        if (active) {
          setDraft(fromLevel(level, record || undefined));
          setNotice(
            record
              ? "Saved level loaded."
              : "Sample level loaded. This was not generated from an image.",
          );
          setCheck(null);
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        if (active) setBusy("");
      }
    }
    void open();
    return () => {
      active = false;
      abort.abort();
    };
    // Only a new URL asks to load a level; editing the current one must not reload it.
  }, [query]);
  async function replace(next: () => Promise<void>) {
    if (
      draft.dirty &&
      !(await ask("This will replace your unsaved studio changes. Continue?"))
    )
      return;
    await next();
  }
  async function upload(file: File) {
    await replace(async () => {
      request.current?.abort();
      const abort = new AbortController();
      request.current = abort;
      setBusy("Preparing image");
      setError("");
      setNotice("");
      try {
        const image = await normalizedImage(file, abort.signal);
        if (!alive.current) return;
        setDraft({
          boxes: [],
          image: { ...image, file, name: file.name },
          width: image.width,
          height: image.height,
          worldWidth: 960,
          worldHeight: 540,
          level: null,
          dirty: true,
          mode: "manual",
          stage: "edit",
        });
        setDetectionWarnings([]);
        setCheck(null);
        setNotice("Image ready. Detect candidates, or add boxes manually.");
        setSearch({}, { replace: true });
      } catch (e) {
        if (alive.current) setError((e as Error).message);
      } finally {
        if (alive.current) setBusy("");
      }
    });
  }
  function edit(boxes: Box[]) {
    setDraft((d) => ({ ...d, boxes, level: null, dirty: true, stage: "edit" }));
    setCheck(null);
    setError("");
    setNotice("");
  }
  async function runDetection() {
    if (!draft.image) return;
    if (
      draft.boxes.length &&
      !(await ask(
        "Detection will replace the current boxes and labels. Continue?",
      ))
    )
      return;
    setBusy("Detecting candidates");
    setError("");
    request.current?.abort();
    const abort = new AbortController();
    request.current = abort;
    try {
      const result = await detect(draft.image.file, method, abort.signal);
      if (!alive.current) return;
      if (
        result.image.width !== draft.width ||
        result.image.height !== draft.height
      )
        throw new Error(
          "Image dimensions do not match the preview. Replace the image and try again.",
        );
      edit(candidateBoxes(result));
      setDetectionWarnings(result.warnings);
      setNotice(
        `${result.candidates.length} candidate boxes found. Choose a type and review each one.`,
      );
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy("");
    }
  }
  async function makeLevel() {
    setError("");
    setNotice("");
    const warnings = boxWarnings(draft.boxes, draft.width, draft.height);
    if (warnings.length) {
      setError(warnings.join(" "));
      return;
    }
    setBusy("Creating level");
    try {
      const level = await createLevel(draft);
      if (alive.current) {
        setDraft((d) => ({ ...d, level, dirty: true, stage: "play" }));
        setCheck(null);
        setNotice(
          "Valid level created. Check spawn placement and try it before saving.",
        );
      }
    } catch (e) {
      if (alive.current) setError(`Level validation: ${(e as Error).message}`);
    } finally {
      if (alive.current) setBusy("");
    }
  }
  async function saveLevel(): Promise<string | null> {
    if (!draft.level) return null;
    setBusy(draft.savedId ? "Updating level" : "Saving level");
    setError("");
    try {
      const saved = await api.save(parseLevel(draft.level), draft.savedId);
      if (alive.current) {
        setDraft((d) => ({
          ...d,
          savedId: saved.id,
          dirty: false,
        }));
        setNotice(
          draft.savedId
            ? "Changes saved to the database."
            : "Level saved to the database.",
        );
      }
      return saved.id;
    } catch (e) {
      if (alive.current) setError((e as Error).message);
      return null;
    } finally {
      if (alive.current) setBusy("");
    }
  }
  async function validate() {
    if (!draft.level) return;
    let id = draft.savedId;
    if (draft.dirty || !id) {
      if (
        !(await ask(
          "Playability checks need a saved level. Save your current level and check it?",
        ))
      )
        return;
      id = (await saveLevel()) || undefined;
    }
    if (!id || !alive.current) return;
    setBusy("Checking playability");
    setError("");
    try {
      const result = await api.check(id);
      if (alive.current) setCheck(result);
    } catch (e) {
      if (alive.current) setError((e as Error).message);
    } finally {
      if (alive.current) setBusy("");
    }
  }
  function exportLevel() {
    if (!draft.level) return;
    try {
      const blob = new Blob(
        [JSON.stringify(parseLevel(draft.level), null, 2)],
        { type: "application/json" },
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "dreamcraft-level.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const warnings = boxWarnings(draft.boxes, draft.width, draft.height);
  const hasEditor = !!draft.image || draft.mode !== "manual";
  const progress =
    draft.stage === "play" ? 4 : !hasEditor ? 0 : !draft.boxes.length ? 1 : 2;
  return (
    <>
      <header className="page-heading">
        <div>
          <div className="eyebrow">YOUR IDEAS, A PLAYABLE WORLD</div>
          <h1>Game studio</h1>
          <p>Build a little adventure, one object at a time.</p>
        </div>
        <span className={`badge ${draft.dirty ? "unsaved" : ""}`}>
          {draft.dirty
            ? "Unsaved changes"
            : draft.savedId
              ? "Saved in database"
              : "Ready to create"}
        </span>
      </header>
      <ol className="steps">
        {["Upload", "Detect", "Review", "Create level", "Play & save"].map(
          (label, i) => (
            <li
              key={label}
              className={i <= progress ? "active" : ""}
              aria-current={i === progress ? "step" : undefined}
            >
              <span>{i + 1}</span>
              {label}
            </li>
          ),
        )}
      </ol>
      <div className="studio-toolbar card">
        <div>
          <span className="badge">
            {draft.mode === "manual"
              ? "Manual sketch"
              : draft.mode === "sample"
                ? "Sample level"
                : "Saved level"}
          </span>
          <small>No trained handwriting model is connected.</small>
        </div>
        <label>
          Try a sample
          <select
            aria-label="Sample level"
            disabled={!!busy}
            value=""
            onChange={(e) => {
              const value = e.target.value;
              void replace(async () => {
                setDraft(fromLevel(sampleLevel(value)));
                setCheck(null);
                setError("");
                setNotice(
                  "Sample level loaded. It was not generated from your drawing.",
                );
                setSearch({}, { replace: true });
              });
            }}
          >
            <option value="" disabled>
              Choose a sample…
            </option>
            {samples.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {busy && (
        <p role="status" className="notice loading">
          {busy}…
        </p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {draft.stage === "play" && draft.level ? (
        <>
          <GamePlayer level={draft.level} />
          <div className="card level-actions">
            <div>
              <h2>
                {draft.mode === "sample"
                  ? "Sample game"
                  : draft.mode === "manual"
                    ? "Manually reviewed level"
                    : "Your saved level"}
              </h2>
              <small>
                {draft.level.objects.length} objects · {draft.level.world.width}{" "}
                × {draft.level.world.height} world ·{" "}
                {draft.savedId ? `ID: ${draft.savedId}` : "Not saved yet"}
              </small>
            </div>
            <div className="actions">
              <button
                disabled={!!busy}
                onClick={() => setDraft((d) => ({ ...d, stage: "edit" }))}
              >
                Back to editor
              </button>
              <button disabled={!!busy} onClick={exportLevel}>
                Export JSON
              </button>
              <button disabled={!!busy} onClick={() => void validate()}>
                Check playability
              </button>
              <button
                className="primary"
                disabled={!!busy || (!draft.dirty && !!draft.savedId)}
                onClick={() => void saveLevel()}
              >
                {draft.savedId ? "Save changes" : "Save level"}
              </button>
            </div>
          </div>
          {check && <Playability result={check} />}
        </>
      ) : (
        <>
          <div className="upload-row">
            <section className="card upload-card">
              <Upload busy={!!busy} onFile={(file) => void upload(file)} />
            </section>
            <section className="card sheet-info">
              <div className="eyebrow">YOUR SHEET</div>
              <h2>
                {draft.image
                  ? draft.image.name
                  : hasEditor
                    ? "Editing game objects"
                    : "No drawing? No problem."}
              </h2>
              <p>
                {draft.image
                  ? `${draft.width} × ${draft.height} oriented pixels · ${(draft.image.file.size / 1024).toFixed(0)} KiB`
                  : hasEditor
                    ? "These boxes use game-world coordinates. Shared game rules will validate your changes."
                    : "Try a sample game, or upload a drawing and label the objects yourself."}
              </p>
              {draft.image ? (
                <>
                  <label>
                    Detection method
                    <select
                      value={method}
                      disabled={!!busy}
                      onChange={(e) => setMethod(e.target.value)}
                    >
                      <option value="adaptive">
                        Adaptive · changing lighting
                      </option>
                      <option value="otsu">Otsu · even lighting</option>
                    </select>
                  </label>
                  <button
                    className="primary"
                    disabled={!!busy}
                    onClick={() => void runDetection()}
                  >
                    Detect candidates
                  </button>
                </>
              ) : (
                !hasEditor && (
                  <Link className="button primary" to="/studio?sample=flat">
                    Try a sample game →
                  </Link>
                )
              )}
            </section>
          </div>
          {hasEditor && (
            <>
              <fieldset disabled={!!busy} className="editor-fieldset">
                <ObjectEditor
                  boxes={draft.boxes}
                  width={draft.width}
                  height={draft.height}
                  image={draft.image?.url}
                  disabled={!!busy}
                  onChange={edit}
                />
              </fieldset>
              {detectionWarnings.length > 0 && (
                <aside className="notice">
                  <b>Detection notes</b>
                  {detectionWarnings.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </aside>
              )}
              <section className="card create-panel">
                <div>
                  <h2>Ready to build the level?</h2>
                  <p>
                    Review all objects first. The backend checks the final
                    positions and game rules.
                  </p>
                  {warnings.length > 0 && (
                    <div
                      aria-label="Review warnings"
                      className="review-warnings"
                    >
                      <b>Review needed</b>
                      <ul>
                        {warnings.map((w) => (
                          <li key={w}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div>
                  {draft.image && (
                    <div className="number-grid">
                      {(["worldWidth", "worldHeight"] as const).map((k) => (
                        <label key={k}>
                          World {k === "worldWidth" ? "width" : "height"}
                          <input
                            type="number"
                            min="64"
                            max="4096"
                            value={draft[k]}
                            disabled={!!busy}
                            onChange={(e) => {
                              const n = e.target.valueAsNumber;
                              setDraft((d) => ({
                                ...d,
                                [k]: n,
                                level: null,
                                dirty: true,
                              }));
                              setCheck(null);
                            }}
                          />
                        </label>
                      ))}
                    </div>
                  )}
                  <button
                    className="primary"
                    disabled={!!busy || warnings.length > 0}
                    onClick={() => void makeLevel()}
                  >
                    Create level →
                  </button>
                  <small>
                    Game geometry errors appear here after validation.
                  </small>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </>
  );
}
