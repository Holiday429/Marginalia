/* Marginalia · typed product events (plan 2.10).
   Every event the funnel and retention dashboards depend on goes through track(), so a typo in a
   name or property is a compile error rather than a silent hole in the data. Other incidental
   events keep using logEvent() directly.
*/

import type { AnalyticsEventMap, AnalyticsEventName } from '../../shared/analytics-events.ts';
import { logEvent } from './analytics.ts';

export type { AnalyticsEventMap, AnalyticsEventName };

export function track<K extends AnalyticsEventName>(name: K, props: AnalyticsEventMap[K]): void {
  logEvent(name, props as unknown as Record<string, unknown>);
}
