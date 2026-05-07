// Number / date formatters used across feed and post-detail.

export function formatScore(n: number): string {
	if (!Number.isFinite(n)) return '0';
	const abs = Math.abs(n);
	if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
	if (abs >= 10_000) return `${Math.round(n / 1000)}k`;
	if (abs >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
	return String(n);
}

export function formatRelativeTime(epochSeconds: number, now = Date.now() / 1000): string {
	const diff = Math.max(0, now - epochSeconds);
	if (diff < 60) return 'now';
	if (diff < 3600) return `${Math.floor(diff / 60)}m`;
	if (diff < 86_400) return `${Math.floor(diff / 3600)}h`;
	if (diff < 86_400 * 7) return `${Math.floor(diff / 86_400)}d`;
	if (diff < 86_400 * 30) return `${Math.floor(diff / (86_400 * 7))}w`;
	if (diff < 86_400 * 365) return `${Math.floor(diff / (86_400 * 30))}mo`;
	return `${Math.floor(diff / (86_400 * 365))}y`;
}

export function formatDateTime(epochSeconds: number): string {
	return new Date(epochSeconds * 1000).toLocaleString();
}
