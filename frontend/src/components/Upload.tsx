import { useRef, useState } from "react";
export function uploadError(file: File): string | null {
  if (!["image/png", "image/jpeg"].includes(file.type))
    return "Choose a PNG or JPEG image.";
  if (!file.size || file.size > 5 * 1024 * 1024)
    return "Choose a non-empty image no larger than 5 MiB.";
  return null;
}
export function Upload({
  onFile,
  busy,
}: {
  onFile: (file: File) => void;
  busy: boolean;
}) {
  const [error, setError] = useState("");
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  function choose(file?: File) {
    if (!file || busy) return;
    const problem = uploadError(file);
    setError(problem || "");
    if (!problem) onFile(file);
  }
  return (
    <>
      <div
        className={`dropzone ${over ? "over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          choose(e.dataTransfer.files[0]);
        }}
      >
        <span className="upload-mark" aria-hidden="true">
          ↑
        </span>
        <h3>Start with your drawing</h3>
        <p>Drop a sheet here, or choose an image.</p>
        <button disabled={busy} onClick={() => input.current?.click()}>
          {busy ? "Preparing image…" : "Choose image"}
        </button>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg"
          aria-label="Upload drawing"
          className="sr-only"
          disabled={busy}
          onChange={(e) => {
            choose(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <small>PNG or JPEG · up to 5 MiB · up to 4096 px per side</small>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
