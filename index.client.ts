import type { PluginClientContext } from "@getpaseo/plugin/client";
import { contributeReportCard } from "./client/report-card.ts";
import { ReportCardView } from "./client/report-card-view.ts";
import { contributeWaitingPill } from "./client/waiting-pill.ts";

export default function contribute(client: PluginClientContext) {
  contributeReportCard(client, ReportCardView);
  return contributeWaitingPill(client);
}
