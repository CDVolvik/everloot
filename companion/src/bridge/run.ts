import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { readAsks } from "./asks";
import { writeAnswersAddon, type Answer } from "./answers";
import { MAX_ANSWER, type AnswerEngine } from "./engine";

/** Answers already given, kept in the companion's data folder (the newest 20 go back into the game). */
export function createAnswerStore(path: string) {
  let answers: Answer[] = existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as Answer[]) : [];
  return {
    has: (id: string) => answers.some((a) => a.id === id),
    list: () => [...answers],
    add(answer: Answer) {
      answers = [...answers.filter((a) => a.id !== answer.id), answer].slice(-20);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(`${path}.tmp`, JSON.stringify(answers));
      renameSync(`${path}.tmp`, path);
    },
  };
}

export type AnswerStore = ReturnType<typeof createAnswerStore>;

/** Answer every new /ask in one SavedVariables file and rewrite the slot addon. Failures are shown, and retried next time. */
export async function answerPending(options: {
  svFile: string; addonsDir: string; engine: AnswerEngine; store: AnswerStore; now?: () => Date;
}): Promise<{ answered: number; failed: number }> {
  const now = options.now ?? (() => new Date());
  const pending = readAsks(readFileSync(options.svFile, "utf8")).filter((a) => !options.store.has(a.id));
  if (pending.length === 0) return { answered: 0, failed: 0 };
  const failures: Answer[] = [];
  let answered = 0;
  for (const ask of pending) {
    try {
      const { answer, source } = await options.engine.answer(ask.question);
      options.store.add({ id: ask.id, answer: answer.slice(0, MAX_ANSWER), source, answeredAt: now().toISOString() });
      answered++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ id: ask.id, answer: `Could not answer: ${message}`.slice(0, MAX_ANSWER), source: "none", answeredAt: now().toISOString() });
    }
  }
  writeAnswersAddon(options.addonsDir, [...options.store.list(), ...failures]);
  return { answered, failed: failures.length };
}
