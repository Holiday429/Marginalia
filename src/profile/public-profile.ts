/* Marginalia · Public profile card sync
   publicProfiles/{slug} is the only user data anonymous visitors can read. It is derived from the
   owner-only users/{uid} doc and exists only while the profile is public. Firestore rules make the
   slug (doc id) unique and owner-bound, so no server round-trip is needed to claim one. */

import { deleteDoc, doc, getDoc, setDoc, serverTimestamp, type Firestore } from 'firebase/firestore';
import { Paths } from '../firebase/paths.ts';

export interface PublicProfileCard {
  uid: string;
  slug: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  location?: string;
  joinedAt?: number;
  sections?: Record<string, boolean>;
}

function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

/** Publishes (or refreshes) the public card for `uid`, or removes it when the profile is private. */
export async function syncPublicProfile(db: Firestore, uid: string, authName: string, joinedAt?: number): Promise<void> {
  const userSnap = await getDoc(doc(db, Paths.user(uid)));
  const data = (userSnap.data() ?? {}) as Record<string, any>;
  const settings = data.settings ?? {};
  const slug = String(settings.slug ?? '').trim().toLowerCase();
  const previous = String(data.publishedSlug ?? '').trim().toLowerCase();

  // Slug changed or profile made private: drop the old card so the old URL stops resolving.
  if (previous && (previous !== slug || settings.profilePublic !== true)) {
    await deleteDoc(doc(db, Paths.publicProfile(previous)));
    await setDoc(doc(db, Paths.user(uid)), { publishedSlug: '' }, { merge: true });
  }
  if (!slug || settings.profilePublic !== true) return;

  const card = stripUndefined({
    uid,
    slug,
    displayName: String(data.displayName || settings.username || authName || slug),
    avatarUrl: data.avatarUrl || undefined,
    bio: settings.bio || undefined,
    location: settings.location?.city || undefined,
    joinedAt,
    sections: settings.profileSections ?? {},
    updatedAt: serverTimestamp(),
  });
  await setDoc(doc(db, Paths.publicProfile(slug)), card);
  await setDoc(doc(db, Paths.user(uid)), { publishedSlug: slug }, { merge: true });
}

export async function fetchPublicProfile(db: Firestore, slug: string): Promise<PublicProfileCard | null> {
  const snap = await getDoc(doc(db, Paths.publicProfile(slug.trim().toLowerCase())));
  return snap.exists() ? (snap.data() as PublicProfileCard) : null;
}
