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
