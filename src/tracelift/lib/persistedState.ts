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

function isFiniteNumberAtLeast(value: unknown, minimum: number): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value >= minimum;
}

export function isValidPageSettings(value: unknown): value is PageSettings {
    if (typeof value !== 'object' || value === null) {
        return false;
    }

    const candidate = value as Record<string, unknown>;
    return (
        PAPER_SIZES.includes(candidate.paperSize as PaperSize) &&
        ORIENTATIONS.includes(candidate.orientation as Orientation) &&
        isFiniteNumberAtLeast(candidate.marginIn, 0.25) &&
        isFiniteNumberAtLeast(candidate.fontSizePt, 8) &&
        isFiniteNumberAtLeast(candidate.lineSpacing, 1)
    );
}

const DUPLEX_MODES: DuplexMode[] = ['long-edge', 'short-edge'];

export function isValidDuplexPreferences(value: unknown): value is DuplexPreferences {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }

    return Object.values(value).every((mode) => DUPLEX_MODES.includes(mode as DuplexMode));
}
