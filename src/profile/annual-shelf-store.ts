import { ENV } from '../core/env.ts';

export interface AnnualShelfDoc {
  _v: 1;
  year: number;
  bookIds: string[];
  savedAt: number;
  isPublished: boolean;
}

export async function loadAnnualShelf(db: any, uid: string, year: number): Promise<AnnualShelfDoc | null> {
  const wsId = ENV.WORKSPACE_ID || 'default';
  try {
    const snap = await db
      .collection('workspaces').doc(wsId)
      .collection('users').doc(uid)
      .collection('annual_shelf').doc(String(year))
      .get();
    return snap.exists ? (snap.data() as AnnualShelfDoc) : null;
  } catch { return null; }
}

export async function saveAnnualShelf(db: any, uid: string, year: number, bookIds: string[]): Promise<void> {
  const wsId = ENV.WORKSPACE_ID || 'default';
  await db
    .collection('workspaces').doc(wsId)
    .collection('users').doc(uid)
    .collection('annual_shelf').doc(String(year))
    .set({ _v: 1, year, bookIds, savedAt: Date.now(), isPublished: true });
}
