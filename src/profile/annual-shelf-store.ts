import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { ENV } from '../core/env.ts';

export interface AnnualShelfDoc {
  _v: 1;
  year: number;
  bookIds: string[];
  savedAt: number;
  isPublished: boolean;
}

export async function loadAnnualShelf(db: Firestore, uid: string, year: number): Promise<AnnualShelfDoc | null> {
  const wsId = ENV.WORKSPACE_ID || 'default';
  try {
    const snap = await getDoc(doc(db, 'workspaces', wsId, 'users', uid, 'annual_shelf', String(year)));
    return snap.exists() ? (snap.data() as AnnualShelfDoc) : null;
  } catch { return null; }
}

export async function saveAnnualShelf(db: Firestore, uid: string, year: number, bookIds: string[]): Promise<void> {
  const wsId = ENV.WORKSPACE_ID || 'default';
  await setDoc(
    doc(db, 'workspaces', wsId, 'users', uid, 'annual_shelf', String(year)),
    { _v: 1, year, bookIds, savedAt: Date.now(), isPublished: true },
  );
}
