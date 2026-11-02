import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ObjectEditor } from "../src/components/ObjectEditor";
import { Upload, uploadError } from "../src/components/Upload";
import { Playability } from "../src/components/Playability";
import { candidateBoxes, boxWarnings } from "../src/services/recognition";
import type { Box, CheckResult } from "../src/types";
const initial: Box = {
  id: "one",
  x: 10,
  y: 10,
  width: 30,
  height: 20,
  reviewed: false,
};
function Editor() {
  const [boxes, setBoxes] = useState<Box[]>([initial]);
  return (
    <ObjectEditor
      boxes={boxes}
      onChange={setBoxes}
      width={200}
      height={100}
      image="data:image/png;base64,test"
    />
  );
}
describe("object editor", () => {
  it("selects, labels, edits and reviews a box", async () => {
    const user = userEvent.setup();
    render(<Editor />);
    expect(
      screen
        .getByRole("group", { name: "Object editor" })
        .querySelector("image"),
    ).toHaveAttribute("href", "data:image/png;base64,test");
    await user.click(
      screen.getByRole("button", { name: "Select object 1: Unlabeled" }),
    );
    await user.selectOptions(screen.getByLabelText("Object type"), "spawn");
    fireEvent.change(screen.getByLabelText("X"), { target: { value: "20" } });
    expect(screen.getByLabelText("X")).toHaveValue(20);
    await user.click(screen.getByLabelText("I reviewed this object"));
    expect(screen.getByLabelText("I reviewed this object")).toBeChecked();
    fireEvent.change(screen.getByLabelText("Width"), {
      target: { value: "50" },
    });
    expect(screen.getByLabelText("I reviewed this object")).not.toBeChecked();
    fireEvent.change(screen.getByLabelText("X"), { target: { value: "190" } });
    expect(screen.getByRole("alert")).toHaveTextContent("inside");
    expect(screen.getByLabelText("X")).toHaveValue(20);
  });
  it("adds and removes objects with keyboard controls", async () => {
    const user = userEvent.setup();
    render(<Editor />);
    await user.click(screen.getByRole("button", { name: "+ Add box" }));
    expect(
      screen.getAllByRole("button", { name: /Select object/ }),
    ).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Delete box" }));
    expect(
      screen.getAllByRole("button", { name: /Select object/ }),
    ).toHaveLength(1);
  });
});
it("validates upload type and size before sending", async () => {
  expect(uploadError(new File(["x"], "x.txt", { type: "text/plain" }))).toMatch(
    "PNG",
  );
  expect(uploadError(new File([], "blank.png", { type: "image/png" }))).toMatch(
    "non-empty",
  );
  expect(
    uploadError(
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], "large.png", {
        type: "image/png",
      }),
    ),
  ).toMatch("5 MiB");
  let uploaded: File | undefined;
  render(
    <Upload
      busy={false}
      onFile={(file) => {
        uploaded = file;
      }}
    />,
  );
  fireEvent.change(screen.getByLabelText("Upload drawing"), {
    target: { files: [new File(["x"], "bad.txt", { type: "text/plain" })] },
  });
  expect(screen.getByRole("alert")).toHaveTextContent("PNG");
  expect(uploaded).toBeUndefined();
  const file = new File(["valid"], "sheet.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText("Upload drawing"), {
    target: { files: [file] },
  });
  expect(uploaded).toBe(file);
});
it("keeps candidate detection separate from predictions", () => {
  const boxes = candidateBoxes({
    model_status: "unavailable",
    image: { width: 200, height: 100, coordinates: "exif_oriented_pixels" },
    candidates: [{ ...initial, predicted_class: "coin", confidence: 0.99 }],
    warnings: [],
  });
  expect(boxes[0].type).toBeUndefined();
  expect(boxes[0].prediction).toBeUndefined();
  expect(boxes[0].reviewed).toBe(false);
  expect(boxWarnings(boxes, 200, 100)).toEqual(
    expect.arrayContaining([
      "Choose a type for every object.",
      "Confirm that every object has been reviewed.",
      "Add one spawn.",
      "Add one goal.",
    ]),
  );
  expect(
    boxWarnings(
      [
        { ...initial, x: -1, type: "spawn", reviewed: true },
        { ...initial, id: "two", type: "spawn", reviewed: true },
      ],
      200,
      100,
    ).join(" "),
  ).toMatch("only one spawn");
});
for (const status of ["reachable", "unreachable", "unknown"] as const) {
  it(`explains a ${status} playability result`, () => {
    const result: CheckResult = {
      status,
      reason: "The checker explains its result.",
      verified_in_game: false,
      search: { expanded: 12 },
      physics_version: "1.0",
      path: [],
    };
    render(<Playability result={result} />);
    expect(screen.getByText(result.reason)).toBeInTheDocument();
    expect(screen.getByText("expanded: 12")).toBeInTheDocument();
    if (status === "unknown")
      expect(
        screen.getByText(/does not mean the level is impossible/),
      ).toBeInTheDocument();
    if (status === "reachable")
      expect(
        screen.getByText(/not been verified in Phaser/),
      ).toBeInTheDocument();
  });
}
