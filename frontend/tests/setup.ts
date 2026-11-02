import { transferableAbortController } from "node:util";
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
Element.prototype.setPointerCapture = function () {};
Element.prototype.releasePointerCapture = function () {};

// Router requests use Node's Request, so their abort signals must use Node too.
globalThis.AbortController = transferableAbortController()
  .constructor as typeof AbortController;
