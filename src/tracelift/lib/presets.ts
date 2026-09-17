import type { Orientation, PageSettings, PaperSize } from '../types/settings';

interface PagePreset {
    fontSizePt: number;
    lineSpacing: number;
    marginIn: number;
}

const PRESETS: Record<PaperSize, Record<Orientation, PagePreset>> = {
    letter: {
        portrait: { fontSizePt: 24, lineSpacing: 1.7, marginIn: 0.5 },
        landscape: { fontSizePt: 26, lineSpacing: 1.8, marginIn: 0.5 },
    },
    tabloid: {
        portrait: { fontSizePt: 32, lineSpacing: 2.0, marginIn: 0.7 },
        landscape: { fontSizePt: 36, lineSpacing: 2.0, marginIn: 0.75 },
    },
};

export function getPreset(paperSize: PaperSize, orientation: Orientation): PagePreset {
    return PRESETS[paperSize][orientation];
}

/**
 * Applies the suggested font/spacing/margin preset for the settings'
 * current paper size and orientation. Intended to run whenever the paper
 * size or orientation changes, so the numeric fields land somewhere
 * reasonable for that page instead of carrying over values tuned for a
 * different page size.
 */
export function applyPreset(settings: PageSettings): PageSettings {
    return { ...settings, ...getPreset(settings.paperSize, settings.orientation) };
}
