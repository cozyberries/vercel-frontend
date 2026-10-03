/**
 * Validated with the dataviz palette validator (light mode, 2026-10-02): chroma, lightness and
 * contrast pass; CVD ΔE 19.3, normal-vision ΔE 25.2. Stall and Online mean those channels
 * everywhere on the dashboard, so anything that covers both uses the neutral.
 */
export const CHART_COLORS = { stall: "#c4703f", online: "#2f7fc0", neutral: "#8a6b63" } as const;

/** Chart chrome in the cb-* token values: --cb-border, --cb-muted-fg, --cb-linen, --cb-white. */
export const CHART_INK = { grid: "#e7e5e4", axis: "#78716c", cursor: "#f9f7f4", surface: "#ffffff" } as const;

/**
 * The dataviz reference status palette. Amber and green sit below 3:1 on white by design, so a
 * status colour never carries meaning alone: every use prints its label and number in ink.
 */
export const STATUS_COLORS = { in: "#0ca30c", low: "#fab219", out: "#d03b3b" } as const;
