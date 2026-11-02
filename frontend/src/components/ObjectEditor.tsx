import { useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import type { Box } from "../types";
import { symbols } from "../types";
interface Props {
  boxes: Box[];
  width: number;
  height: number;
  image?: string;
  onChange: (boxes: Box[]) => void;
  disabled?: boolean;
}
export function ObjectEditor({
  boxes,
  width,
  height,
  image,
  onChange,
  disabled,
}: Props) {
  const [selected, select] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{
    id: string;
    mode: "move" | "resize" | "draw";
    x: number;
    y: number;
    box: Box;
  } | null>(null);
  const current = boxes.find((b) => b.id === selected);
  useEffect(() => {
    if (!boxes.some((b) => b.id === selected)) select(boxes[0]?.id || null);
  }, [boxes, selected]);
  const point = (e: PointerEvent) => {
    const rect = svg.current!.getBoundingClientRect();
    return {
      x: Math.round(
        Math.max(
          0,
          Math.min(width, ((e.clientX - rect.left) * width) / rect.width),
        ),
      ),
      y: Math.round(
        Math.max(
          0,
          Math.min(height, ((e.clientY - rect.top) * height) / rect.height),
        ),
      ),
    };
  };
  function update(id: string, patch: Partial<Box>) {
    onChange(boxes.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }
  function addBox() {
    const box: Box = {
      id: `object_${crypto.randomUUID()}`,
      x: Math.round(width * 0.1),
      y: Math.round(height * 0.1),
      width: Math.min(80, width),
      height: Math.min(50, height),
      reviewed: false,
    };
    onChange([...boxes, box]);
    select(box.id);
    setAdding(false);
  }
  function begin(e: PointerEvent, box: Box, mode: "move" | "resize") {
    if (disabled) return;
    e.stopPropagation();
    const p = point(e);
    select(box.id);
    setAdding(false);
    drag.current = { id: box.id, mode, ...p, box };
    svg.current!.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (!drag.current || disabled) return;
    const d = drag.current,
      p = point(e);
    let patch: Partial<Box>;
    if (d.mode === "move")
      patch = {
        x: Math.max(0, Math.min(width - d.box.width, d.box.x + p.x - d.x)),
        y: Math.max(0, Math.min(height - d.box.height, d.box.y + p.y - d.y)),
      };
    else if (d.mode === "resize")
      patch = {
        width: Math.max(1, Math.min(width - d.box.x, d.box.width + p.x - d.x)),
        height: Math.max(
          1,
          Math.min(height - d.box.y, d.box.height + p.y - d.y),
        ),
      };
    else
      patch = {
        x: Math.min(d.x, p.x),
        y: Math.min(d.y, p.y),
        width: Math.max(1, Math.abs(p.x - d.x)),
        height: Math.max(1, Math.abs(p.y - d.y)),
      };
    update(d.id, { ...patch, reviewed: false });
  }
  function number(key: "x" | "y" | "width" | "height", value: number) {
    if (!current) return;
    const b = { ...current, [key]: value };
    if (
      !Number.isFinite(value) ||
      b.x < 0 ||
      b.y < 0 ||
      b.width <= 0 ||
      b.height <= 0 ||
      b.x + b.width > width ||
      b.y + b.height > height
    ) {
      setError("Keep the box inside the image or world with a positive size.");
      return;
    }
    setError("");
    update(current.id, { [key]: value, reviewed: false });
  }
  return (
    <div className="editor-grid">
      <section className="card editor-canvas-panel">
        <div className="panel-heading">
          <div>
            <h2>
              Review objects <span className="count">{boxes.length}</span>
            </h2>
            <small>
              {image ? "Oriented image" : "Game world"} · {width} × {height} px
            </small>
          </div>
          <div className="actions">
            <button disabled={disabled} onClick={addBox}>
              + Add box
            </button>
            <button
              disabled={disabled}
              aria-pressed={adding}
              onClick={() => setAdding(!adding)}
            >
              {adding ? "Cancel draw" : "Draw box"}
            </button>
          </div>
        </div>
        <div className="image-board">
          <svg
            ref={svg}
            viewBox={`0 0 ${width} ${height}`}
            style={{ aspectRatio: `${width}/${height}` }}
            className={adding ? "drawing" : ""}
            aria-label="Object editor"
            role="group"
            onPointerMove={move}
            onPointerUp={() => {
              drag.current = null;
              setAdding(false);
            }}
            onPointerCancel={() => {
              drag.current = null;
            }}
            onPointerDown={(e) => {
              if (!adding || disabled) return;
              const p = point(e);
              const b: Box = {
                id: `object_${crypto.randomUUID()}`,
                x: Math.min(width - 1, p.x),
                y: Math.min(height - 1, p.y),
                width: 1,
                height: 1,
                reviewed: false,
              };
              onChange([...boxes, b]);
              select(b.id);
              drag.current = { id: b.id, mode: "draw", x: b.x, y: b.y, box: b };
              svg.current!.setPointerCapture(e.pointerId);
            }}
          >
            {image && <image href={image} width={width} height={height} />}
            {boxes.map((b, i) => (
              <g
                key={b.id}
                className={`box ${b.type || "unclassified"} ${selected === b.id ? "selected" : ""}`}
                role="button"
                tabIndex={disabled ? -1 : 0}
                aria-label={`Select object ${i + 1}: ${b.type || "Unlabeled"}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    select(b.id);
                  }
                }}
                onPointerDown={(e) => begin(e, b, "move")}
              >
                <rect
                  x={b.x}
                  y={b.y}
                  width={b.width}
                  height={b.height}
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  x={b.x + 3}
                  y={b.y + Math.min(18, b.height)}
                  fontSize={Math.max(10, width / 60)}
                >
                  {i + 1} {b.type || "?"}
                </text>
                {selected === b.id && (
                  <rect
                    className="resize-handle"
                    x={b.x + b.width - width * 0.009}
                    y={b.y + b.height - width * 0.009}
                    width={width * 0.018}
                    height={width * 0.018}
                    onPointerDown={(e) => begin(e, b, "resize")}
                  />
                )}
              </g>
            ))}
          </svg>
        </div>
        <p className="hint">
          Select a box to move it. Drag its corner to resize. Use the fields for
          exact changes. Every change needs a new review.
        </p>
        {!boxes.length && (
          <p className="notice">
            No candidates found. Add or draw boxes to continue manually.
          </p>
        )}
        <div className="object-list" aria-label="Objects">
          {boxes.map((b, i) => (
            <button
              disabled={disabled}
              key={b.id}
              className={`object-chip ${b.type || ""}`}
              aria-pressed={selected === b.id}
              onClick={() => select(b.id)}
            >
              {i + 1}. {b.type || "Unlabeled"} {b.reviewed ? "✓" : ""}
            </button>
          ))}
        </div>
      </section>
      <aside className="card inspector">
        <div className="eyebrow">OBJECT DETAILS</div>
        <h2>
          {current
            ? `Object ${boxes.indexOf(current) + 1}`
            : "Select an object"}
        </h2>
        {current ? (
          <fieldset disabled={disabled}>
            <label>
              Object type
              <select
                aria-label="Object type"
                value={current.type || ""}
                onChange={(e) =>
                  update(current.id, {
                    type: (e.target.value || undefined) as Box["type"],
                    reviewed: false,
                  })
                }
              >
                <option value="">Choose a type</option>
                {symbols.map((s) => (
                  <option key={s.kind} value={s.kind}>
                    {s.icon} {s.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="number-grid">
              {(["x", "y", "width", "height"] as const).map((k) => (
                <label key={k}>
                  {k === "x" || k === "y"
                    ? k.toUpperCase()
                    : k[0].toUpperCase() + k.slice(1)}
                  <input
                    type="number"
                    step="1"
                    value={current[k]}
                    onChange={(e) => number(k, e.target.valueAsNumber)}
                  />
                </label>
              ))}
            </div>
            {current.type === "spawn" && (
              <p className="hint">
                Spawn becomes the fixed player size. Its bottom centre stays
                anchored to this box. Check its position after creating the
                level.
              </p>
            )}
            {current.prediction && (
              <p className="hint">
                Model suggestion: {current.prediction.label} (
                {Math.round(current.prediction.confidence * 100)}%). Please
                review it.
              </p>
            )}
            <label className="check-label">
              <input
                type="checkbox"
                checked={current.reviewed}
                disabled={!current.type}
                onChange={(e) =>
                  update(current.id, { reviewed: e.target.checked })
                }
              />
              I reviewed this object
            </label>
            <button
              className="danger"
              onClick={() => onChange(boxes.filter((b) => b.id !== current.id))}
            >
              Delete box
            </button>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </fieldset>
        ) : (
          <p>Select a box on the image or add a missed drawing.</p>
        )}
        <hr />
        <small>
          Manual sketch mode
          <br />
          No trained model is connected. Choose each object type yourself.
        </small>
      </aside>
    </div>
  );
}
