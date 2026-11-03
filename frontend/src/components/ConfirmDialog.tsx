import { useEffect, useRef } from "react";
export function ConfirmDialog({
  message,
  onAnswer,
}: {
  message: string;
  onAnswer: (answer: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onAnswer(false);
      }}
      aria-labelledby="confirm-title"
    >
      <h2 id="confirm-title">Keep your changes?</h2>
      <p>{message}</p>
      <div className="actions">
        <button autoFocus onClick={() => onAnswer(false)}>
          Keep editing
        </button>
        <button className="primary" onClick={() => onAnswer(true)}>
          Continue
        </button>
      </div>
    </dialog>
  );
}
