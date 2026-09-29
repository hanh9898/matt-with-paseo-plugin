/**
 * Everything the composer pill shows, in one place: ticket 18 rewrites these words here and nowhere else.
 * `icon` is a Lucide icon name.
 */
export const PILL = {
  id: "waiting",
  title: "Waiting for you",
  icon: "Hourglass",
  label: (count: number): string => `${count} waiting`,
};
