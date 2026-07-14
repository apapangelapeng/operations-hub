import { humanize } from "../lib/api";

export function StatusBadge({ value }: { value: string }) {
  const tone =
    value.includes("high") ||
    value.includes("failed") ||
    value.includes("denied") ||
    value.includes("production")
      ? "danger"
      : value.includes("medium") ||
          value.includes("pending") ||
          value.includes("review") ||
          value.includes("staging")
        ? "warning"
        : value.includes("approved") ||
            value.includes("succeeded") ||
            value.includes("enabled") ||
            value.includes("development") ||
            value === "low"
          ? "success"
          : "neutral";

  return <span className={`status-badge ${tone}`}>{humanize(value)}</span>;
}
