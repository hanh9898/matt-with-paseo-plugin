import { createElement } from "react";
import { Text, View } from "react-native";
import { cardLines } from "./report-card-text.ts";
import type { CardProps } from "./report-card.ts";

/** The card as text in the chat: a title, each decision, the spend and the question count. It holds nothing to press. */
export function ReportCardView({ item, theme }: CardProps) {
  const lines = cardLines(item.data);
  const text = (content: string, color: string, key: string, fontSize = 14) => createElement(Text, { key, style: { color, fontSize } }, content);
  const { foreground, foregroundMuted, surface0 } = theme.colors;
  return createElement(
    View,
    { style: { gap: 4, padding: 12, borderRadius: 8, backgroundColor: surface0 } },
    text(lines.title, theme.colors.foreground, "title", 16),
    text(lines.decidedHeading, foreground, "heading"),
    ...(lines.decided.length === 0
      ? [text(lines.none, foregroundMuted, "none")]
      : lines.decided.map((line, index) => text(line, foregroundMuted, `decided-${index}`))),
    text(lines.spend, foreground, "spend"),
    text(lines.questions, foreground, "questions"),
  );
}
