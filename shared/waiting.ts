import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

/** The composer pill asks the daemon how many things wait for the user in one agent's chat. */
export const waitingCount = defineRpc({
  name: "waiting.count",
  input: z.object({ agentId: z.string() }),
  output: z.object({ count: z.number().int().nonnegative() }),
});
