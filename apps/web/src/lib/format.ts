const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '—';
  const s = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(s);
  if (abs < 45) return rtf.format(s, 'second');
  if (abs < 2700) return rtf.format(Math.round(s / 60), 'minute');
  if (abs < 64800) return rtf.format(Math.round(s / 3600), 'hour');
  return rtf.format(Math.round(s / 86400), 'day');
}

export function duration(startIso: string | null | undefined, endIso: string | null | undefined, now = Date.now()): string {
  if (!startIso) return '—';
  const ms = (endIso ? new Date(endIso).getTime() : now) - new Date(startIso).getTime();
  if (ms < 1000) return `${ms} ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)} s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}
