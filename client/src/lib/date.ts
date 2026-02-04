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
    const d = new Date(dateInput as string);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZoneName: "short",
    });
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
