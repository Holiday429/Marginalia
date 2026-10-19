/* Marginalia · action counts (pure). One definition of "open" for every place that shows a number. */

/** "Open" = what the Actions tab lists above its Resolved fold (everything not done or archived). */
export function countOpenActions(actions: Array<{ status?: string }> | null | undefined): number {
  return (actions ?? []).filter((a) => a.status !== 'done' && a.status !== 'archived').length;
}

/** "3 open actions" / "1 open action". */
export function openActionLabel(count: number): string {
  return `${count} open ${count === 1 ? 'action' : 'actions'}`;
}
