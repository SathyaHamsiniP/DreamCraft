import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { routes } from "../src/App";
import { StudioProvider } from "../src/state";
import { sampleLevel } from "../src/services/samples";
vi.mock("../src/components/GamePlayer", () => ({
  GamePlayer: () => <div>Game mounted</div>,
}));
const level = sampleLevel("flat");
const record = {
  id: "stored",
  level,
  created_at: "2026-11-02",
  updated_at: "2026-11-02",
};
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
let fetchMock: ReturnType<typeof vi.fn>;
function open(path = "/") {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <StudioProvider>
      <RouterProvider router={router} />
    </StudioProvider>,
  );
  return router;
}
beforeEach(() => {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/api/sketch/preview"))
      return response({
        url: "data:image/png;base64,x",
        width: 960,
        height: 540,
      });
    if (url.includes("/api/sketch/candidates"))
      return response({
        image: { width: 960, height: 540, coordinates: "exif_oriented_pixels" },
        candidates: [{ id: "one", x: 10, y: 10, width: 20, height: 20 }],
        model_status: "unavailable",
        warnings: ["Review candidates."],
      });
    if (url.endsWith("/validate"))
      return response({
        status: "reachable",
        reason: "A route was found.",
        verified_in_game: false,
        search: { expanded: 10 },
        path: [],
        physics_version: "1.0",
      });
    if (url.includes("/api/levels?")) return response([record]);
    if (url.includes("/api/levels"))
      return response(record, init?.method === "POST" ? 201 : 200);
    return response({ error: { message: "Not found" } }, 404);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
it("navigates through home, help, levels and a saved game", async () => {
  const user = userEvent.setup();
  open();
  expect(
    screen.getByRole("heading", { name: /Your sketch/ }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("link", { name: "Help" }));
  expect(
    screen.getByRole("heading", { name: "Let's make a game." }),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("link", { name: "My Levels" }));
  await user.click(
    await screen.findByRole("link", { name: "Open, edit & play →" }),
  );
  await screen.findByText("Game mounted");
  expect(screen.getByText("Saved in database")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Check playability" }));
  expect(await screen.findByText("A route was found.")).toBeInTheDocument();
});
it("saves a sample and warns before leaving unsaved edits", async () => {
  const user = userEvent.setup();
  open("/studio?sample=flat");
  await screen.findByText("Game mounted");
  await user.click(screen.getByRole("link", { name: "My Levels" }));
  expect(await screen.findByRole("dialog")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Keep editing" }));
  await user.click(screen.getByRole("button", { name: "Save level" }));
  expect(await screen.findByText("Saved in database")).toBeInTheDocument();
  const call = fetchMock.mock.calls.find(
    ([url, init]) => url.endsWith("/api/levels") && init?.method === "POST",
  );
  expect(call).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Back to editor" }));
  fireEvent.change(screen.getByLabelText("Height"), {
    target: { value: "19" },
  });
  expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  expect(screen.getByLabelText("I reviewed this object")).not.toBeChecked();
});
it("previews an upload, shows detection errors and retries real editor data", async () => {
  const user = userEvent.setup();
  open("/studio");
  const file = new File(["synthetic"], "sheet.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText("Upload drawing"), {
    target: { files: [file] },
  });
  await screen.findByText("sheet.png");
  expect(
    screen.getByRole("group", { name: "Object editor" }).querySelector("image"),
  ).toHaveAttribute("href", "data:image/png;base64,x");
  fetchMock.mockResolvedValueOnce(
    response({ error: { message: "Detection is busy. Try again." } }, 503),
  );
  await user.click(screen.getByRole("button", { name: "Detect candidates" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Detection is busy",
  );
  await user.click(screen.getByRole("button", { name: "Detect candidates" }));
  await screen.findByRole("button", { name: "Select object 1: Unlabeled" });
  expect(screen.getByLabelText("Review warnings")).toHaveTextContent(
    "Choose a type",
  );
  expect(screen.getByRole("button", { name: "Create level →" })).toBeDisabled();
  await user.selectOptions(screen.getByLabelText("Object type"), "spawn");
  await user.click(screen.getByLabelText("I reviewed this object"));
  expect(screen.getByLabelText("Review warnings")).toHaveTextContent(
    "Add one goal",
  );
});
it("shows loading and failed saved-level requests with retry", async () => {
  let release: (value: Response) => void = () => {};
  fetchMock.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  open("/levels");
  expect(screen.getByRole("status")).toHaveTextContent("Loading saved levels");
  release(response({ error: { message: "Storage unavailable" } }, 503));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Storage unavailable",
  );
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
  await waitFor(() =>
    expect(
      screen.getByRole("link", { name: "Open, edit & play →" }),
    ).toBeInTheDocument(),
  );
});

it("keeps the current level when saving fails", async () => {
  const user = userEvent.setup();
  open("/studio?sample=flat");
  await screen.findByText("Game mounted");
  fetchMock.mockResolvedValueOnce(
    response({ error: { message: "Database is busy" } }, 503),
  );
  await user.click(screen.getByRole("button", { name: "Save level" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Database is busy",
  );
  expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  expect(screen.getByText("Game mounted")).toBeInTheDocument();
});

it("keeps invalid game geometry in the editor for correction", async () => {
  const user = userEvent.setup();
  open("/studio?sample=flat");
  await screen.findByText("Game mounted");
  await user.click(screen.getByRole("button", { name: "Back to editor" }));
  await user.click(
    screen.getByRole("button", { name: "Select object 2: spawn" }),
  );
  fireEvent.change(screen.getByLabelText("X"), { target: { value: "850" } });
  await user.click(screen.getByLabelText("I reviewed this object"));
  await user.click(screen.getByRole("button", { name: "Create level →" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Level validation: Spawn must not overlap",
  );
  expect(screen.getByLabelText("X")).toHaveValue(850);
  expect(screen.queryByText("Game mounted")).not.toBeInTheDocument();
});
