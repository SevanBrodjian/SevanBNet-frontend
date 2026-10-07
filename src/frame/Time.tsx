import { useControl } from "../controls/store";

// Dates, in whatever calendar the controls ask for (Comfort writes 2026.03; Wireframe
// writes ISO; Broken writes Unix seconds). Use <Time> for every date on the site.

/** y: 2026 · ym: 2026.03 · ymd: 2026.03.04 · my: Mar 2026 · day: Mar 4, 2026 · long: March 4, 2026 */
export type DateFormat = "y" | "ym" | "ymd" | "my" | "day" | "long";

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** Format an ISO date (2026, 2026-03 or 2026-03-04...) in a calendar: dot, iso, unix, julian. */
export function formatDate(iso: string, f: DateFormat = "ym", calendar = "dot") {
  const m = String(iso).match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  if (!m) return "";
  const y = Number(m[1]);
  const mo = m[2] ? Number(m[2]) : 1;
  const d = m[3] ? Number(m[3]) : 1;
  const ms = Date.UTC(y, mo - 1, f === "y" ? 1 : d, 12);
  const p2 = (n: number) => String(n).padStart(2, "0");
  if (calendar === "unix") return String(Math.round(ms / 1000));
  if (calendar === "julian") return `JD ${(ms / 864e5 + 2440587.5).toFixed(1)}`;
  if (f === "y") return String(y);
  if (calendar === "iso")
    return f === "ym" || f === "my" ? `${y}-${p2(mo)}` : `${y}-${p2(mo)}-${p2(d)}`;
  if (f === "ym") return `${y}.${p2(mo)}`;
  if (f === "ymd") return `${y}.${p2(mo)}.${p2(d)}`;
  if (f === "my") return `${MON[mo - 1]} ${y}`;
  if (f === "day") return `${MON[mo - 1]} ${d}, ${y}`;
  return `${MONTH[mo - 1]} ${d}, ${y}`;
}

export default function Time({
  iso,
  f = "ym",
  className,
}: {
  iso: string;
  f?: DateFormat;
  className?: string;
}) {
  const calendar = String(useControl("epoch"));
  return (
    <time className={className} dateTime={String(iso).slice(0, 10)}>
      {formatDate(iso, f, calendar)}
    </time>
  );
}
