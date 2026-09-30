import type { FunctionComponent } from "react";
import { z } from "zod";
import { REPORT_CARD } from "../shared/contract.ts";
import type { CardData } from "./report-card-text.ts";

/** What the view takes: the validated row data and the theme's colours. */
export type CardProps = {
  item: { data: CardData };
  theme: { colors: { foreground: string; foregroundMuted: string; surface0: string } };
};

/** The row's data, checked before anything is drawn; a row that fails it draws nothing wrong. */
const schema: z.ZodType<CardData> = z.object({
  decided: z.array(z.object({ header: z.string(), answer: z.string(), at: z.string() })),
  spend: z.object({ totalUsd: z.number(), appetiteUsd: z.number().nullable(), partial: z.boolean() }),
  questions: z.object({ count: z.number(), budget: z.number().nullable() }),
});

export const CARD_RENDERER = { kind: REPORT_CARD.kind, version: REPORT_CARD.version, schema } as const;

/** The slice of Paseo's client context the card uses; the entry hands it the real context. */
export interface CardClient {
  addTimelineRenderer(renderer: { kind: string; version: number; schema: z.ZodType<CardData>; Component: FunctionComponent<CardProps> }): void;
}

/**
 * Registers the renderer Paseo draws the report card row with. Without it Paseo shows "Plugin timeline item
 * unavailable" for the row, so the daemon's row is the card only once this runs. The card has no buttons: the
 * round trip is unproven (ADR 0001), so the view is text only.
 */
export function contributeReportCard(client: CardClient, Component: FunctionComponent<CardProps>): void {
  client.addTimelineRenderer({ ...CARD_RENDERER, Component });
}
