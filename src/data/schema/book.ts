// Marginalia · Book document schema (Firestore: workspaces/{ws}/users/{uid}/books/{bookId})
import { z } from 'zod';

export const BookCoverSchema = z.object({
  image:       z.string().optional(),
  storagePath: z.string().optional(),
}).passthrough();

export const BookLocationSchema = z.object({
  country:  z.string(),
  city:     z.string().optional(),
  province: z.string().optional(),
});

export const BookGeoEntrySchema = z.object({
  country:  z.string(),
  city:     z.string().optional(),
  province: z.string().optional(),
});

export const BookGeoSchema = z.object({
  authorOrigin:    BookGeoEntrySchema.nullable().optional(),
  contentLocation: BookGeoEntrySchema.nullable().optional(),
  readerLocation:  BookGeoEntrySchema.nullable().optional(),
});

export const BookSchema = z.object({
  cover:          BookCoverSchema.optional(),
  status:         z.enum(['unread', 'reading', 'read', 'abandoned']).optional(),
  startedAt:      z.number().nullable().optional(),
  finishedAt:     z.number().nullable().optional(),
  updatedAt:      z.unknown().optional(), // FieldValue or number
  location:       BookLocationSchema.nullable().optional(),
  geo:            BookGeoSchema.nullable().optional(),
  shareInProfile: z.boolean().optional(), // opt-in: show this book on public profile
  userNote:       z.string().max(280).optional(), // one-line personal take; shown on map bubble and overview
}).passthrough();

export type Book = z.infer<typeof BookSchema>;
