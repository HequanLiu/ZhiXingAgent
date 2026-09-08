export function dateText(value: unknown, includeTime = false): string {
  if (typeof value !== 'string' || !value.trim()) return '待补充';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '待补充';
  return includeTime ? date.toLocaleString('zh-CN') : date.toLocaleDateString('zh-CN');
}

export function percentText(value: unknown): string {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}%` : '待补充';
}

export function feedbackProgress(feedback: {completed: number; total: number; mode?: string}): string {
  if (feedback.mode === 'percent') return `已完成 ${percentText(feedback.completed)}`;
  const completed = Number.isFinite(feedback.completed) ? feedback.completed : '待补充';
  const total = Number.isFinite(feedback.total) ? feedback.total : '待补充';
  const quantity = `已完成 ${completed} / ${total}`;
  return typeof completed === 'number' && typeof total === 'number' && total > 0
    ? `${quantity} · ${Math.round(completed / total * 100)}%`
    : `${quantity}，比例待核实`;
}

export function versionLabel(observed: number | null | undefined, latest: number | undefined): string {
  if (typeof observed !== 'number' || !Number.isFinite(observed)) return '版本待核实';
  if (latest === undefined || observed > latest) return `查询版本 v${observed}（当前版本待核实）`;
  return observed < latest ? `历史版本 v${observed}` : `当前版本 v${observed}`;
}

export function newestFirst<T extends {at: string}>(rows: T[]): T[] {
  const timestamp = (value: string) => new Date(value).getTime() || 0;
  return [...rows].sort((a, b) => timestamp(b.at) - timestamp(a.at));
}

export const nodeStateLabels: Record<string, string> = {
  not_started: '未开始', in_progress: '进行中', blocked: '有阻塞',
  reported_complete: '待验收', accepted: '已验收', rework: '返工中',
};
