import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import { WsPaths } from '../firebase/paths.ts';
import { getWorkspaceId } from '../firebase/workspace.ts';

export interface AnnualShelfDoc {
  _v: 1;
  year: number;
  bookIds: string[];
  savedAt: number;
  isPublished: boolean;
}

export async function loadAnnualShelf(db: Firestore, uid: string, year: number): Promise<AnnualShelfDoc | null> {
  try {
    const snap = await getDoc(doc(db, WsPaths.annualShelf(getWorkspaceId(), uid, year)));
    return snap.exists() ? (snap.data() as AnnualShelfDoc) : null;
  } catch { return null; }
}

export async function saveAnnualShelf(db: Firestore, uid: string, year: number, bookIds: string[]): Promise<void> {
  await setDoc(
    doc(db, WsPaths.annualShelf(getWorkspaceId(), uid, year)),
    { _v: 1, year, bookIds, savedAt: Date.now(), isPublished: true },
  );
}
