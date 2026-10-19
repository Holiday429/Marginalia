import QRCode from 'qrcode';
import { MarginaliaAI } from '../services/ai-gateway.ts';

export interface ReadingCardData {
  title: string;
  displayTitle: string;
  subtitle?: string;
  author: string;
  rating?: number | null;
  summary?: string;
  highlights: string[];
  takeaway: string;
  keywords: string[];
  coverUrl?: string;
  shareUrl?: string;
  readingWindow?: string;
  edition?: string;
  publisher?: string;
  publishedYear?: string;
  spineColor: string;
  textColor: string;
}

export interface ReadingCardInput {
  book: {
    id?: string;
    title: string;
    titleZh?: string;
    author?: string;
    authorZh?: string;
    summary?: string;
    rating?: number | null;
    year?: number | string | null;
    tags?: string[];
    meta?: {
      startedAt?: string;
      finishedAt?: string;
      edition?: string;
      publisher?: string;
    };
    cover?: { bg?: string; text?: string; image?: string };
  };
  highlights: Array<{ quote: string; annotation?: string }>;
  notes?: string;
}

interface ReadingCardAIResult {
  takeaway: string;
  keywords: string[];
}

const CARD_W = 1242;
const CARD_H = 1760;
const PAD_X = 58;
const ACCENT = '#c9a46a';
const RULE = 'rgba(201,164,106,0.28)';

export async function fetchReadingCardAI(
  input: ReadingCardInput,
): Promise<ReadingCardAIResult> {
  // Server assembles the prompt from this book's Firestore data; only the book id is sent.
  const bookId = input.book.id;
  if (!bookId) throw new Error('Reading card needs a saved book.');
  let failure: Error | null = null;
  const result = await MarginaliaAI.generateJSON({
    featureId: 'reading-card',
    bookId,
    onError: (err) => { failure = err; },
  });
  if (!result || typeof result !== 'object') {
    throw failure ?? new Error('AI gateway returned no result.');
  }
  return normalizeAIResult(result as Record<string, unknown>);
}

export async function generateReadingCardBlob(data: ReadingCardData): Promise<Blob> {
  await document.fonts.ready;

  const canvas = document.createElement('canvas');
  canvas.width = CARD_W;
  canvas.height = CARD_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas context unavailable.');

  paintBackground(ctx);
  drawFrame(ctx);
  drawHeader(ctx);

  const coverRect = { x: PAD_X, y: 154, w: 350, h: 512 };
  const bodyX = 472;
  const bodyW = CARD_W - bodyX - PAD_X;
  const bodyTop = 166;
  const footerTop = CARD_H - 224;

  await drawCover(ctx, data, coverRect);
  drawBookHeader(ctx, data, bodyX, bodyTop, bodyW);
  drawRating(ctx, data.rating, bodyX, 572);
  drawMetaRow(ctx, data, bodyX, 646, bodyW);
  const highlightsEndY = drawHighlights(ctx, data.highlights, 790, CARD_W - PAD_X * 2);
  const takeawayStartY = Math.max(highlightsEndY + 48, 1140);
  drawTakeaway(ctx, data.takeaway, takeawayStartY, CARD_W - PAD_X * 2, footerTop - takeawayStartY - 36);
  await drawFooter(ctx, data);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Canvas toBlob failed'))),
      'image/png',
    );
  });
}

function normalizeAIResult(value: Record<string, unknown>): ReadingCardAIResult {
  const takeaway = String(value.takeaway || '').trim();
  const keywords = Array.isArray(value.keywords)
    ? value.keywords.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 6)
    : [];

  if (!takeaway) throw new Error('AI returned empty takeaway.');
  return { takeaway, keywords };
}

function paintBackground(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#1b1714';
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const glow = ctx.createRadialGradient(CARD_W * 0.4, CARD_H * 0.22, 40, CARD_W * 0.4, CARD_H * 0.22, CARD_W * 0.95);
  glow.addColorStop(0, 'rgba(255,255,255,0.06)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  const fade = ctx.createLinearGradient(0, 0, 0, CARD_H);
  fade.addColorStop(0, 'rgba(0,0,0,0.12)');
  fade.addColorStop(1, 'rgba(0,0,0,0.42)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, CARD_W, CARD_H);

  ctx.save();
  ctx.globalAlpha = 0.05;
  for (let i = 0; i < 520; i += 1) {
    const x = ((i * 73) % CARD_W);
    const y = ((i * 149) % CARD_H);
    const radius = 0.8 + ((i % 7) * 0.25);
    ctx.fillStyle = i % 3 === 0 ? '#f1e2c4' : '#8c6b43';
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawFrame(ctx: CanvasRenderingContext2D): void {
  roundRect(ctx, 18, 18, CARD_W - 36, CARD_H - 36, 20);
  ctx.strokeStyle = 'rgba(201,164,106,0.55)';
  ctx.lineWidth = 1.35;
  ctx.stroke();
}

function drawHeader(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = '#efe2cb';
  ctx.font = '500 32px Fraunces';
  ctx.fillText('Marginalia', PAD_X, 94);

  ctx.font = '400 16px "IBM Plex Mono"';
  ctx.textAlign = 'right';
  ctx.fillText(formatCardDate(new Date()), CARD_W - PAD_X, 98);
  ctx.textAlign = 'left';

  drawDivider(ctx, 128);
}

async function drawCover(
  ctx: CanvasRenderingContext2D,
  data: ReadingCardData,
  rect: { x: number; y: number; w: number; h: number },
): Promise<void> {
  ctx.save();
  roundRect(ctx, rect.x, rect.y, rect.w, rect.h, 4);
  ctx.clip();

  if (data.coverUrl) {
    try {
      const img = await loadImage(data.coverUrl);
      ctx.drawImage(img, rect.x, rect.y, rect.w, rect.h);
      ctx.restore();
      return;
    } catch {
      // fall through to placeholder
    }
  }

  const gradient = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.w, rect.y + rect.h);
  gradient.addColorStop(0, 'rgba(247,238,225,0.95)');
  gradient.addColorStop(1, 'rgba(232,220,198,0.85)');
  ctx.fillStyle = gradient;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  ctx.fillStyle = '#28211a';
  ctx.font = '500 36px Fraunces';
  ctx.fillText(data.displayTitle.slice(0, 18), rect.x + 28, rect.y + rect.h - 72, rect.w - 56);
  ctx.font = '400 18px "IBM Plex Mono"';
  ctx.fillStyle = 'rgba(40,33,26,0.65)';
  ctx.fillText(data.author.toUpperCase(), rect.x + 28, rect.y + rect.h - 34, rect.w - 56);
  ctx.restore();
}

function drawBookHeader(
  ctx: CanvasRenderingContext2D,
  data: ReadingCardData,
  x: number,
  y: number,
  maxW: number,
): void {
  ctx.fillStyle = '#f2e3cc';
  ctx.font = '600 72px Fraunces';
  drawTextBlock(ctx, data.displayTitle, x, y, maxW, 86, 2);

  let cursorY = y + estimateBlockHeight(ctx, data.displayTitle, maxW, 86, 2) + 18;
  if (data.subtitle) {
    ctx.fillStyle = 'rgba(242,227,204,0.86)';
    ctx.font = '400 24px Fraunces';
    drawTextBlock(ctx, data.subtitle, x, cursorY, maxW, 34, 2);
    cursorY += estimateBlockHeight(ctx, data.subtitle, maxW, 34, 2) + 16;
  }

  ctx.fillStyle = '#e8d7bc';
  ctx.font = '400 28px Fraunces';
  drawTextBlock(ctx, data.author, x, cursorY, maxW, 38, 2);
  cursorY += estimateBlockHeight(ctx, data.author, maxW, 38, 2) + 16;

  const summary = String(data.summary || '').trim();
  if (summary) {
    ctx.fillStyle = 'rgba(232,215,188,0.72)';
    ctx.font = '400 19px Fraunces';
    drawTextBlock(ctx, summary, x, cursorY, maxW, 27, 3);
  }
}

function drawRating(ctx: CanvasRenderingContext2D, rating: number | null | undefined, x: number, y: number): void {
  const normalized = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  for (let i = 0; i < 5; i += 1) {
    drawStar(ctx, x + i * 56, y, 18, i < normalized);
  }
  ctx.fillStyle = ACCENT;
  ctx.font = '400 18px "IBM Plex Mono"';
  ctx.fillText(normalized ? `${normalized} / 5` : 'NO RATING', x + 310, y + 8);
}

function drawMetaRow(
  ctx: CanvasRenderingContext2D,
  data: ReadingCardData,
  x: number,
  y: number,
  width: number,
): void {
  ctx.fillStyle = ACCENT;
  ctx.font = '400 12px "IBM Plex Mono"';
  ctx.fillText('READING WINDOW', x, y);
  ctx.fillStyle = '#efe2cb';
  ctx.font = '400 22px Fraunces';
  drawTextBlock(ctx, data.readingWindow || 'No reading window recorded', x, y + 34, width, 28, 2);

  const items = data.keywords.slice(0, 6);
  if (!items.length) return;

  ctx.fillStyle = ACCENT;
  ctx.font = '400 12px "IBM Plex Mono"';
  ctx.fillText('TAGS', x, y + 92);
  let cursorX = x;
  let cursorY = y + 112;
  items.forEach((item, index) => {
    const text = item.toUpperCase();
    ctx.font = '400 16px Fraunces';
    const pillW = Math.min(width, ctx.measureText(text).width + 34);
    if (cursorX + pillW > x + width) {
      cursorX = x;
      cursorY += 44;
    }
    const bg = [
      'rgba(168,132,90,0.18)',
      'rgba(100,138,120,0.18)',
      'rgba(140,110,160,0.18)',
      'rgba(90,130,165,0.18)',
      'rgba(160,110,100,0.18)',
      'rgba(120,145,90,0.18)',
    ][index % 6];
    ctx.fillStyle = bg;
    roundRect(ctx, cursorX, cursorY, pillW, 32, 16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.stroke();
    ctx.fillStyle = '#f2e3cc';
    ctx.font = '400 16px Fraunces';
    ctx.fillText(text, cursorX + 17, cursorY + 21);
    cursorX += pillW + 10;
  });
}

function drawHighlights(
  ctx: CanvasRenderingContext2D,
  highlights: string[],
  startY: number,
  width: number,
): number {
  ctx.fillStyle = ACCENT;
  ctx.font = '400 15px "IBM Plex Mono"';
  ctx.fillText('HIGHLIGHTS', PAD_X, startY);

  let cursorY = startY + 44;
  highlights.slice(0, 3).forEach((quote) => {
    const wrapped = ensureQuoted(quote);
    ctx.fillStyle = '#efe2cb';
    ctx.font = '400 30px Fraunces';
    drawTextBlock(ctx, wrapped, PAD_X, cursorY, width, 40, 3);
    cursorY += estimateBlockHeight(ctx, wrapped, width, 40, 3) + 28;
  });
  return cursorY;
}

function drawTakeaway(
  ctx: CanvasRenderingContext2D,
  takeaway: string,
  startY: number,
  width: number,
  maxHeight: number,
): void {
  drawDivider(ctx, startY - 20);
  ctx.fillStyle = ACCENT;
  ctx.font = '400 15px "IBM Plex Mono"';
  ctx.fillText('MY TAKEAWAY', PAD_X, startY);

  ctx.fillStyle = '#f4e6d0';
  ctx.font = '400 36px Fraunces';
  const maxLines = Math.max(4, Math.floor(maxHeight / 48));
  drawTextBlock(ctx, takeaway, PAD_X, startY + 46, width, 48, maxLines);
}

async function drawFooter(ctx: CanvasRenderingContext2D, data: ReadingCardData): Promise<void> {
  const footerY = CARD_H - 220;
  drawDivider(ctx, footerY - 36);

  if (data.shareUrl) {
    const qrCanvas = document.createElement('canvas');
    await QRCode.toCanvas(qrCanvas, data.shareUrl, {
      width: 124,
      margin: 1,
      color: {
        dark: '#f3e6d1',
        light: '#00000000',
      },
    });
    ctx.drawImage(qrCanvas, PAD_X, footerY, 124, 124);
  }

  ctx.fillStyle = '#f1e2c8';
  ctx.font = '400 17px "IBM Plex Mono"';
  ctx.fillText('Created with Marginalia', PAD_X + 156, footerY + 54);
  ctx.fillStyle = 'rgba(241,226,200,0.78)';
  ctx.fillText('Turn your reading notes into a card.', PAD_X + 156, footerY + 92);
}

function drawDivider(ctx: CanvasRenderingContext2D, y: number): void {
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD_X, y);
  ctx.lineTo(CARD_W - PAD_X, y);
  ctx.stroke();
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, filled: boolean): void {
  ctx.save();
  ctx.beginPath();
  for (let i = 0; i < 5; i += 1) {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    const outerX = x + Math.cos(angle) * radius;
    const outerY = y + Math.sin(angle) * radius;
    const innerAngle = angle + Math.PI / 5;
    const innerX = x + Math.cos(innerAngle) * radius * 0.42;
    const innerY = y + Math.sin(innerAngle) * radius * 0.42;
    if (i === 0) ctx.moveTo(outerX, outerY);
    else ctx.lineTo(outerX, outerY);
    ctx.lineTo(innerX, innerY);
  }
  ctx.closePath();
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1.3;
  if (filled) {
    ctx.fillStyle = ACCENT;
    ctx.fill();
  }
  ctx.stroke();
  ctx.restore();
}

function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = Number.POSITIVE_INFINITY,
): void {
  const lines = wrapText(ctx, text, maxWidth, maxLines);
  lines.forEach((line, index) => {
    ctx.fillText(line, x, y + index * lineHeight);
  });
}

function estimateBlockHeight(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  lineHeight: number,
  maxLines = Number.POSITIVE_INFINITY,
): number {
  const lines = wrapText(ctx, text, maxWidth, maxLines);
  return Math.max(1, lines.length) * lineHeight;
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = Number.POSITIVE_INFINITY,
): string[] {
  const paragraphs = String(text || '').split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const lines: string[] = [];

  paragraphs.forEach((paragraph, paragraphIndex) => {
    const segments = segmentText(paragraph);
    let line = '';

    segments.forEach((segment) => {
      const test = line + segment;
      if (line && ctx.measureText(test).width > maxWidth) {
        lines.push(line.trim());
        line = segment.trimStart();
      } else {
        line = test;
      }
    });

    if (line.trim()) lines.push(line.trim());
    if (paragraphIndex !== paragraphs.length - 1) lines.push('');
  });

  const filtered = lines.filter((line, index) => line || (index > 0 && lines[index - 1]));
  if (filtered.length <= maxLines) return filtered;

  const clipped = filtered.slice(0, maxLines);
  const last = clipped[maxLines - 1] || '';
  clipped[maxLines - 1] = last.length > 2 ? `${last.slice(0, -1)}…` : `${last}…`;
  return clipped;
}

function segmentText(text: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
    return Array.from(segmenter.segment(text), (item) => item.segment);
  }
  return text.split(/(\s+)/).filter(Boolean);
}

function ensureQuoted(text: string): string {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '';
  if (/^["“].*["”]$/.test(trimmed)) return trimmed;
  return `“${trimmed}”`;
}

function formatCardDate(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}.${mm}.${dd}`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Image load failed: ${url}`));
    img.src = url;
  });
}
