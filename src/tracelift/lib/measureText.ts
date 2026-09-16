import { UNITS_PER_INCH } from './pageGeometry';

const POINTS_PER_INCH = 72;

/**
 * Typical width-to-height ratio for a monospaced font (e.g. Courier-style
 * faces average close to 0.6). Used instead of real browser text
 * measurement so layout stays deterministic in tests and doesn't require a
 * DOM. Revisit if a specific worksheet font turns out to measure noticeably
 * differently in Phase 8 physical testing.
 */
const MONOSPACE_CHAR_WIDTH_RATIO = 0.6;

export function ptToUnits(fontSizePt: number): number {
    return (fontSizePt / POINTS_PER_INCH) * UNITS_PER_INCH;
}

export function measureTokenWidth(text: string, fontSizePt: number): number {
    const charWidth = ptToUnits(fontSizePt) * MONOSPACE_CHAR_WIDTH_RATIO;
    return text.length * charWidth;
}
