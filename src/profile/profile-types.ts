export interface PublicProfileData {
  displayName: string;
  uid: string;
  slug: string;
  profilePublic: boolean;
  avatarUrl?: string;
  bio?: string;
  location?: string;
  joinedAt?: number;
  showMap?: boolean;
  showPortrait?: boolean;
  showRhythm?: boolean;
  showDesk?: boolean;
}

export interface PublicBook {
  id: string;
  title: string;
  author: string;
  spine: string;
  text: string;
  status?: string;
  finishedAt?: number;
  coverSrc?: string;
  userNote?: string;
  geo?: {
    authorOrigin?: { country: string; province?: string; city?: string };
    contentLocation?: { country: string; province?: string; city?: string };
    readerLocation?: { country: string; province?: string; city?: string };
  };
  genre?: string;
  language?: string;
  year?: number;
}

export interface PublicHighlight {
  quote: string;
  bookTitle: string;
  bookId?: string;
}

export interface SessionDay {
  date: string;
  sessions: number;
  minutes: number;
  highlights: number;
}

/** One calendar date on which any recording activity occurred. */
export interface ActivityDay {
  date: string; // YYYY-MM-DD
}

export interface DemoPayload {
  profile: PublicProfileData;
  books: PublicBook[];
  highlights: PublicHighlight[];
  sessionDays: SessionDay[];
}
