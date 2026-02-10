/**
 * Date formatting in the user's local timezone.
 * Use these helpers so all dates/times display in the visitor's local time.
 */

/** Match YYYY-MM-DD (date-only); these are treated as calendar dates in local time. */
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse a date-only string (YYYY-MM-DD) as local noon so that when we format it,
 * we get the correct calendar day in the user's timezone (no UTC-midnight shift).
 */
function parseDateOnlyAsLocal(dateOnly: string): Date {
  if (!DATE_ONLY_REGEX.test(dateOnly)) {
    return new Date(dateOnly);
  }
  const [y, m, d] = dateOnly.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/**
 * Format an ISO string or Date as a date-only string in the user's locale (local timezone).
 * Use for calendar dates (e.g. analytics "Jan 15") and date-only API values (YYYY-MM-DD).
 */
export function formatLocalDate(dateInput: string | Date): string {
  const d =
    typeof dateInput === "string" && DATE_ONLY_REGEX.test(dateInput)
      ? parseDateOnlyAsLocal(dateInput)
      : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * Format an ISO string or Date as a short date in the user's locale (e.g. "Jan 15").
 * Use for chart labels and compact date display. Date-only strings (YYYY-MM-DD) are shown as the correct local day.
 */
export function formatLocalShortDate(dateInput: string | Date): string {
  const d =
    typeof dateInput === "string" && DATE_ONLY_REGEX.test(dateInput)
      ? parseDateOnlyAsLocal(dateInput)
      : new Date(dateInput);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Format an ISO string or Date as date + time in the user's local timezone.
 * Use for "Last used", "Created", timestamps, etc.
 */
export function formatLocalDateTime(dateInput: string | Date): string {
  try {
    const d = new Date(typeof dateInput === "string" ? dateInput.trim() : dateInput);
    if (Number.isNaN(d.getTime())) return "—";
    try {
      return d.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZoneName: "short",
      });
    } catch {
      // Fallback if Intl options throw (e.g. some environments/CSP)
      const datePart = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
      const timePart = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
      return `${datePart}, ${timePart}`;
    }
  } catch {
    return "—";
  }
}

/**
 * Relative time for recent dates (e.g. "Just now", "5m ago", "2h ago").
 * Falls back to formatLocalDate for older dates. Uses local time for the cutoff.
 */
export function formatRelativeOrLocal(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));

  if (diffInMinutes < 1) return "Just now";
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  if (diffInMinutes < 1440) {
    const hours = Math.floor(diffInMinutes / 60);
    return `${hours}h ago`;
  }
  return formatLocalDate(date);
}

/** Ordinal suffix for day of month: 1st, 2nd, 3rd, 4th, 21st, 22nd, 23rd, 31st. */
function getOrdinal(n: number): string {
  const s = n % 100;
  if (s >= 11 && s <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/**
 * Format a "Created" timestamp for notifications: relative up to 7 days, then full date.
 * All in user's local timezone.
 * - &lt; 1 min: "Just now"
 * - 1–60 min: "X minute(s) ago"
 * - 1–24 h: "X hour(s) ago", then "1 day ago"
 * - 2–7 days: "X days ago"
 * - &gt; 7 days: "January 27th, 2026"
 */
export function formatCreatedAt(dateInput: string | Date | null | undefined): string {
  try {
    if (dateInput == null || dateInput === "") return "—";
    const d = new Date(dateInput as string);
    if (Number.isNaN(d.getTime())) return "—";
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMinutes < 1) return "Just now";
    if (diffMinutes < 60) return diffMinutes === 1 ? "1 minute ago" : `${diffMinutes} minutes ago`;
    if (diffHours < 24) return diffHours === 1 ? "1 hour ago" : `${diffHours} hours ago`;
    if (diffDays === 1) return "1 day ago";
    if (diffDays <= 7) return `${diffDays} days ago`;
    // > 7 days: full date in user's timezone, e.g. "January 27th, 2026"
    const month = d.toLocaleDateString(undefined, { month: "long" });
    const day = d.getDate();
    const year = d.getFullYear();
    return `${month} ${getOrdinal(day)}, ${year}`;
  } catch {
    return "—";
  }
}
