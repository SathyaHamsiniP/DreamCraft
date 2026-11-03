import type { Box, Candidates } from "../types";
import { symbols } from "../types";
export function candidateBoxes(data: Candidates): Box[] {
  // Detection and future predictions enter the editor through this one adapter.
  return data.candidates.map(({ predicted_class, confidence, ...box }) => ({
    id: box.id,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    reviewed: false,
    ...(data.model_status === "ran" &&
    symbols.some((s) => s.kind === predicted_class) &&
    typeof confidence === "number" &&
    Number.isFinite(confidence) &&
    confidence >= 0 &&
    confidence <= 1
      ? { prediction: { label: predicted_class!, confidence } }
      : {}),
  }));
}
export function boxWarnings(
  boxes: Box[],
  width: number,
  height: number,
): string[] {
  const warnings: string[] = [];
  if (!boxes.length)
    warnings.push(
      "No objects yet. Add boxes for the drawings you want to use.",
    );
  if (boxes.some((b) => !b.type))
    warnings.push("Choose a type for every object.");
  if (boxes.some((b) => !b.reviewed))
    warnings.push("Confirm that every object has been reviewed.");
  for (const kind of ["spawn", "goal"]) {
    const count = boxes.filter((b) => b.type === kind).length;
    if (count !== 1)
      warnings.push(count ? `Use only one ${kind}.` : `Add one ${kind}.`);
  }
  if (
    boxes.some(
      (b) =>
        ![b.x, b.y, b.width, b.height].every(Number.isFinite) ||
        b.x < 0 ||
        b.y < 0 ||
        b.width <= 0 ||
        b.height <= 0 ||
        b.x + b.width > width ||
        b.y + b.height > height,
    )
  )
    warnings.push(
      "Every box must have a positive size and stay inside the image or world.",
    );
  if (new Set(boxes.map((b) => b.id)).size !== boxes.length)
    warnings.push("Object IDs must be unique.");
  return warnings;
}
