import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { GamePlayer } from "../src/components/GamePlayer";
import { sampleLevel } from "../src/services/samples";
const { mountGame } = vi.hoisted(() => ({ mountGame: vi.fn() }));
vi.mock("../src/services/game", () => ({
  loadEngine: async () => ({ mountGame }),
}));
it("mounts once in Strict Mode and destroys the game on changes and unmount", async () => {
  const instances: { destroy: ReturnType<typeof vi.fn> }[] = [];
  mountGame.mockImplementation((_parent, _level, options) => {
    const instance = { destroy: vi.fn(), start: vi.fn(), restart: vi.fn() };
    instances.push(instance);
    options.onEvent({ type: "state", state: "ready", score: 0 });
    return instance;
  });
  const rendered = render(
    <StrictMode>
      <GamePlayer level={sampleLevel("flat")} />
    </StrictMode>,
  );
  await waitFor(() => expect(instances).toHaveLength(1));
  expect(document.querySelectorAll(".phaser-host")).toHaveLength(1);
  expect(mountGame.mock.calls[0][2].keyboardTarget).toBe(
    screen.getByLabelText(/Game area/),
  );
  rendered.rerender(
    <StrictMode>
      <GamePlayer level={sampleLevel("coins")} />
    </StrictMode>,
  );
  await waitFor(() => expect(instances).toHaveLength(2));
  expect(instances[0].destroy).toHaveBeenCalledOnce();
  expect(document.querySelectorAll(".phaser-host")).toHaveLength(1);
  rendered.unmount();
  expect(instances[1].destroy).toHaveBeenCalledOnce();
  expect(document.querySelectorAll(".phaser-host")).toHaveLength(0);
});

it("explains optional coins and shows a finish message with the real score", async () => {
  mountGame.mockImplementation((_parent, _level, options) => {
    options.onEvent({ type: "state", state: "completed", score: 2 });
    return { destroy: vi.fn(), start: vi.fn(), restart: vi.fn() };
  });
  render(<GamePlayer level={sampleLevel("trail")} />);
  expect(
    await screen.findByRole("heading", { name: "Level complete!" }),
  ).toBeInTheDocument();
  expect(screen.getByTestId("coin-score")).toHaveTextContent("2");
  expect(
    screen.getByText(/You collected 2 of 4 bonus coins/),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Gold coins give 1 bonus point each/),
  ).toBeInTheDocument();
});

it("does not show a pointless coin counter on a level with no coins", async () => {
  mountGame.mockImplementation((_parent, _level, options) => {
    options.onEvent({ type: "state", state: "ready", score: 0 });
    return { destroy: vi.fn(), start: vi.fn(), restart: vi.fn() };
  });
  render(<GamePlayer level={sampleLevel("flat")} />);
  expect(
    await screen.findByRole("heading", { name: "A little adventure awaits" }),
  ).toBeInTheDocument();
  expect(screen.queryByTestId("coin-score")).not.toBeInTheDocument();
  expect(screen.getByText(/This level has no coins/)).toBeInTheDocument();
});
