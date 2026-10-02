/** What a command gave back: the shape of `run` in `setup/run.mjs`. */
export type RunResult = { code: number; stdout: string; stderr: string };

/** How setup asks for a command to run: `interactive` inherits the terminal, `discard` drops the output unread. */
export type RunOptions = { cwd?: string; interactive?: boolean; discard?: boolean };

/** One recorded call; `line` is the command and its arguments joined by spaces, for matching. */
export type Call = { command: string; args: string[]; options: RunOptions; line: string };

/** An answer: a fixed result, or a function of the call that may change what later calls see. */
export type Answer = Partial<RunResult> | ((call: Call) => Partial<RunResult>);

/**
 * The fake runner: no process starts. It answers each call from a table keyed by the start of the call's
 * line (the longest key that matches wins; no match answers exit 0 with no output) and records every call
 * in `calls`. When given an `events` list, it pushes `run <line>` there too, so a test can read what was
 * printed and what ran in one order.
 */
export class FakeRunner {
  readonly calls: Call[] = [];
  private readonly answers: Record<string, Answer>;
  private readonly events: string[] | null;

  constructor(answers: Record<string, Answer> = {}, events: string[] | null = null) {
    this.answers = answers;
    this.events = events;
  }

  readonly run = async (command: string, args: string[], options: RunOptions = {}): Promise<RunResult> => {
    const call: Call = { command, args: [...args], options: { ...options }, line: [command, ...args].join(" ") };
    this.calls.push(call);
    this.events?.push(`run ${call.line}`);
    const key = Object.keys(this.answers)
      .filter((start) => call.line === start || call.line.startsWith(`${start} `))
      .sort((a, b) => b.length - a.length)[0];
    const answer = key === undefined ? {} : this.answers[key];
    const result = typeof answer === "function" ? answer(call) : (answer ?? {});
    return { code: result.code ?? 0, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  };
}
