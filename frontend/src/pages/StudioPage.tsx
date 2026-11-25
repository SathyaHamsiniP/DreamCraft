import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { parseLevel } from "../../../game/src/contracts";
import { useStudio, fromLevel } from "../state";
import { api, createLevel, detect, normalizedImage } from "../services/api";
import { boxWarnings, candidateBoxes } from "../services/recognition";
import { verifyPlayability } from "../services/playability";
import { samples, sampleLevel } from "../services/samples";
import type { Box, CheckResult, Draft } from "../types";
import { Upload } from "../components/Upload";
import { ObjectEditor } from "../components/ObjectEditor";
import { GamePlayer } from "../components/GamePlayer";
import { AutomaticStudio } from "./AutomaticStudio";
import { Playability } from "../components/Playability";
import { userMessage, userNotes } from '../services/messages';
export function StudioPage() {
  const [search] = useSearchParams();
  if (search.has("sample") || search.has("level") || search.get("advanced") === "1") return <AdvancedStudio />;
  return <AutomaticStudio />;
}

function AdvancedStudio() {
  const { draft, setDraft, ask } = useStudio();
  const [search, setSearch] = useSearchParams();
  const [useModel, setUseModel] = useState(true);
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
          if (active) setSearch({ advanced: "1" }, { replace: true });
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
        if (active) setError(userMessage((e as Error).message));
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
      draft.dirty && (draft.level || draft.boxes.length > 0) &&
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
        setNotice("Your drawing is ready. Find the shapes or draw boxes around them.");
        setSearch({ advanced: "1" }, { replace: true });
      } catch (e) {
        if (alive.current) setError(userMessage((e as Error).message));
      } finally {
        if (alive.current) setBusy("");
      }
    });
  }
  function edit(boxes: Box[]) {
    setDraft((d) => ({ ...d, boxes, level: null, dirty: true, stage: "edit",
      generation: d.generation ? { ...d.generation, status: 'needs_correction', assessment: null,
        issues: [{ id: null, message: 'The game was edited. Use Advanced Edit to check and play the current version.' }] } : undefined }));
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
    setBusy("Finding shapes in your drawing");
    setError("");
    request.current?.abort();
    const abort = new AbortController();
    request.current = abort;
    try {
      const result = await detect(
        draft.image.file,
        method,
        abort.signal,
        useModel,
      );
      if (!alive.current) return;
      if (
        result.image.width !== draft.width ||
        result.image.height !== draft.height
      )
        throw new Error(
          "Image dimensions do not match the preview. Replace the image and try again.",
        );
      edit(candidateBoxes(result));
      setDetectionWarnings(userNotes(result.warnings));
      setNotice(
        `${result.candidates.length} shapes found. Correct anything that looks wrong, then choose Approve all.`,
      );
    } catch (e) {
      if (alive.current) setError(userMessage((e as Error).message));
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
    request.current?.abort();
    const abort = new AbortController(); request.current = abort;
    try {
      const level = await createLevel(draft, abort.signal);
      if (alive.current) {
        setDraft((d) => ({ ...d, level, dirty: true, stage: "play" }));
        try {
          setBusy('Checking the jumps and trying the game');
          const estimate = await api.assess(level, abort.signal);
          const checked = await verifyPlayability(level, estimate, abort.signal);
          if (alive.current) setCheck(checked);
        } catch { if (!abort.signal.aborted) setError("The game is ready, but its check could not finish. Please try checking it again."); }
        setNotice(
          "Your game is ready to try.",
        );
      }
    } catch (e) {
      if (alive.current && !abort.signal.aborted) setError(`Level validation: ${userMessage((e as Error).message)}`);
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
            ? "Your changes are saved."
            : "Your game is saved.",
        );
      }
      return saved.id;
    } catch (e) {
      if (alive.current) setError(userMessage((e as Error).message));
      return null;
    } finally {
      if (alive.current) setBusy("");
    }
  }
  async function validate() {
    if (!draft.level) return;
    let id = draft.savedId;
    if (draft.dirty || !id) {
      id = (await saveLevel()) || undefined;
    }
    if (!id || !alive.current) return;
    setBusy("Checking playability");
    setError("");
    request.current?.abort();
    const abort = new AbortController(); request.current = abort;
    try {
      const result = await api.check(id, abort.signal);
      const checked = await verifyPlayability(draft.level, result, abort.signal);
      if (alive.current) setCheck(checked);
    } catch (e) {
      if (alive.current) setError(userMessage((e as Error).message));
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
      setError(userMessage((e as Error).message));
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
          <Link to="/studio">Automatic generation →</Link>
          <p>Build a little adventure, one object at a time.</p>
        </div>
        <span className={`badge ${draft.dirty ? "unsaved" : ""}`}>
          {draft.dirty
            ? "Unsaved changes"
            : draft.savedId
              ? "Saved"
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
              ? "Sketch review"
              : draft.mode === "sample"
                ? "Sample level"
                : "Saved level"}
          </span>
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
                setSearch({ advanced: "1" }, { replace: true });
              });
            }}
          >
            <option value="" disabled>
              Choose a sample…
            </option>
            <optgroup label="Playable demos">
              {samples.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </optgroup>
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
                {draft.level.objects.length} objects{!draft.savedId && " · Not saved yet"}
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
                Download game file
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
                  ? `${draft.width} × ${draft.height} · ${(draft.image.file.size / 1024).toFixed(0)} KB`
                  : hasEditor
                    ? "Move or resize the boxes to change your level."
                    : "Try a sample game, or upload a drawing and label the objects yourself."}
              </p>
              {draft.image ? (
                <>
                  <label>
                    Lighting
                    <select
                      value={method}
                      disabled={!!busy}
                      onChange={(e) => setMethod(e.target.value)}
                    >
                      <option value="adaptive">
                        Uneven lighting
                      </option>
                      <option value="otsu">Even lighting</option>
                    </select>
                  </label>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={useModel}
                      disabled={!!busy}
                      onChange={(e) => setUseModel(e.target.checked)}
                    />
                    Suggest symbols automatically
                  </label>
                  <button
                    className="primary"
                    disabled={!!busy}
                    onClick={() => void runDetection()}
                  >
                    Find shapes
                  </button>
                </>
              ) : (
                !hasEditor && (
                  <Link className="button primary" to="/studio?sample=trail">
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
                    Correct any boxes or symbols that look wrong, then choose Approve all.
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
                    Any positions that need fixing will be shown here.
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
