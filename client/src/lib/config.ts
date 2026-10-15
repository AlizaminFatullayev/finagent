const int = (value: string | undefined, fallback: number) => {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
};

/**
 * Upload limits for copy and the size pre-check. The API does not expose them (docs/API_GAPS.md, gap 4);
 * defaults mirror server/.env.example. The server always has the final word.
 */
export const UPLOAD_LIMITS = {
  maxBytes: int(import.meta.env.VITE_UPLOAD_MAX_BYTES, 20 * 1024 * 1024),
  maxSheets: int(import.meta.env.VITE_UPLOAD_MAX_SHEETS, 20),
  maxRows: int(import.meta.env.VITE_UPLOAD_MAX_ROWS, 200_000),
  extensions: ['.xlsx', '.csv'] as const,
};
