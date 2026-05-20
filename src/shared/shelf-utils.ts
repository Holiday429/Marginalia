interface UnifiedShelfSpineSizeOptions {
  expanded?: boolean;
  narrowExpanded?: boolean;
  widthScaleCollapsed?: number;
  widthScaleExpanded?: number;
  widthScaleNarrowExpanded?: number;
  baseHeightCollapsed?: number;
  baseHeightExpanded?: number;
  baseHeightNarrowExpanded?: number;
  minWidth?: number;
  minHeight?: number;
  widthSeed?: number;
  heightSeed?: number;
  fallbackWidth?: number;
  fallbackHeightRatio?: number;
}

export function containsCJK(value: unknown): boolean {
  return /[一-鿿㐀-䶿぀-ヿ　-〿＀-￯]/.test(String(value || ''));
}

export function getUnifiedShelfSpineSize(
  record: { w?: number; h?: number } | null | undefined,
  options: UnifiedShelfSpineSizeOptions = {},
): { width: number; height: number } {
  const expanded = Boolean(options.expanded);
  const narrowExpanded = Boolean(options.narrowExpanded);
  const widthScaleCollapsed = options.widthScaleCollapsed ?? 0.9;
  const widthScaleExpanded = options.widthScaleExpanded ?? 0.8;
  const widthScaleNarrowExpanded = options.widthScaleNarrowExpanded ?? 0.86;
  const baseHeightCollapsed = options.baseHeightCollapsed ?? 205;
  const baseHeightExpanded = options.baseHeightExpanded ?? 184;
  const baseHeightNarrowExpanded = options.baseHeightNarrowExpanded ?? 194;
  const minWidth = options.minWidth ?? 24;
  const minHeight = options.minHeight ?? 88;
  const fallbackWidth = options.fallbackWidth ?? 34;
  const fallbackHeightRatio = options.fallbackHeightRatio ?? 0.85;

  const widthSeed = Number.isFinite(record?.w) ? Number(record?.w) : (options.widthSeed ?? fallbackWidth);
  const heightSeed = Number.isFinite(record?.h) ? Number(record?.h) : (options.heightSeed ?? fallbackHeightRatio);

  const widthScale = expanded
    ? (narrowExpanded ? widthScaleNarrowExpanded : widthScaleExpanded)
    : widthScaleCollapsed;
  const baseHeight = expanded
    ? (narrowExpanded ? baseHeightNarrowExpanded : baseHeightExpanded)
    : baseHeightCollapsed;

  const width = Math.max(minWidth, Math.round(widthSeed * widthScale));
  const height = Math.max(minHeight, Math.round(baseHeight * heightSeed));
  return { width, height };
}
