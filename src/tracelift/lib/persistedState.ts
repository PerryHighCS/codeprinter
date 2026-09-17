import type { PageSettings, Orientation, PaperSize } from '../types/settings';
import type { DuplexMode } from './duplexTransform';
import type { DuplexPreferences } from './duplexPreferences';

/**
 * useLocalStorage only guards against invalid JSON, not against
 * well-formed JSON of the wrong shape (e.g. `null`, or a settings object
 * missing a field from a since-changed schema). Reading straight from it
 * would crash App's render — parseWorksheet(null).split(), or
 * getDuplexMode reading a property off a non-object — before the editor
 * even mounts, with no way for the user to recover except clearing
 * localStorage by hand. These guards let the caller fall back to the
 * default instead.
 */

export function isValidSource(value: unknown): value is string {
    return typeof value === 'string';
}

const PAPER_SIZES: PaperSize[] = ['letter', 'tabloid'];
const ORIENTATIONS: Orientation[] = ['portrait', 'landscape'];

// These limits keep both user-entered and restored settings within ranges
// that produce finite, practical SVG and print geometry.
export const PAGE_SETTINGS_BOUNDS = {
    marginIn: { min: 0.25, max: 2 },
    fontSizePt: { min: 8, max: 72 },
    lineSpacing: { min: 1, max: 4 },
} as const;

function isBoundedNumber(value: unknown, bounds: { min: number; max: number }): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= bounds.min && value <= bounds.max;
}

export function isValidPageSettings(value: unknown): value is PageSettings {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
        PAPER_SIZES.includes(candidate.paperSize as PaperSize) &&
        ORIENTATIONS.includes(candidate.orientation as Orientation) &&
        isBoundedNumber(candidate.marginIn, PAGE_SETTINGS_BOUNDS.marginIn) &&
        isBoundedNumber(candidate.fontSizePt, PAGE_SETTINGS_BOUNDS.fontSizePt) &&
        isBoundedNumber(candidate.lineSpacing, PAGE_SETTINGS_BOUNDS.lineSpacing)
    );
}

const DUPLEX_MODES: DuplexMode[] = ['long-edge', 'short-edge'];

export function isValidDuplexPreferences(value: unknown): value is DuplexPreferences {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }

    return Object.values(value).every((mode) => DUPLEX_MODES.includes(mode as DuplexMode));
}
