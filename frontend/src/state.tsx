import {
  createContext,
  useCallback,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { ConfirmDialog } from "./components/ConfirmDialog";
import type { Draft, Level, LevelRecord } from "./types";
import { emptyDraft } from "./types";
interface State {
  draft: Draft;
  setDraft: Dispatch<SetStateAction<Draft>>;
  ask: (message: string) => Promise<boolean>;
}
const Context = createContext<State | null>(null);
export function StudioProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState(emptyDraft);
  const [question, setQuestion] = useState<{
    message: string;
    resolve: (value: boolean) => void;
  } | null>(null);
  const ask = useCallback(
    (message: string) =>
      new Promise<boolean>((resolve) => setQuestion({ message, resolve })),
    [],
  );
  return (
    <Context.Provider value={{ draft, setDraft, ask }}>
      {children}
      {question && (
        <ConfirmDialog
          message={question.message}
          onAnswer={(answer) => {
            question.resolve(answer);
            setQuestion(null);
          }}
        />
      )}
    </Context.Provider>
  );
}
export function useStudio() {
  const state = useContext(Context);
  if (!state) throw new Error("Studio provider is missing");
  return state;
}
export function fromLevel(level: Level, saved?: LevelRecord): Draft {
  return {
    ...emptyDraft(),
    boxes: level.objects.map((o) => ({ ...o, reviewed: true })),
    width: level.world.width,
    height: level.world.height,
    worldWidth: level.world.width,
    worldHeight: level.world.height,
    level,
    mode: saved ? "saved" : "sample",
    savedId: saved?.id,
    dirty: !saved,
    stage: "play",
  };
}
