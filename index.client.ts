import type { PluginClientContext } from "@getpaseo/plugin/client";
import { contributeWaitingPill } from "./client/waiting-pill.ts";

export default function contribute(client: PluginClientContext) {
  return contributeWaitingPill(client);
}
