export function formatDuration(
  startedAt?: number,
  fallback: string = ""
): string {
  if (!startedAt) return fallback;
  const diff = Date.now() - startedAt;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m active`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m active`;
}

export function formatRelativeTime(
  timestamp?: number,
  fallback: string = ""
): string {
  if (!timestamp) return fallback;
  const diff = Date.now() - timestamp;
  if (diff < 0) return "just now";
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
