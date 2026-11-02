export type { GameHandle, GameEvent } from "../../../game/src/engine";
export function loadEngine() {
  return import("../../../game/src/engine");
}
