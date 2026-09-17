import type { PageGeometry } from '../types/layout';
import type { PageSettings, PaperSize } from '../types/settings';

export const UNITS_PER_INCH = 100;

interface PaperDimensions {
    name: string;
    widthIn: number;
    heightIn: number;
}

export const PAPER_SIZES: Record<PaperSize, PaperDimensions> = {
    letter: {
        name: 'Letter',
        widthIn: 8.5,
        heightIn: 11,
    },
    tabloid: {
        name: '11 × 17',
        widthIn: 11,
        heightIn: 17,
    },
};

export function getPageDimensions(settings: PageSettings): { widthIn: number; heightIn: number } {
    const paper = PAPER_SIZES[settings.paperSize];

    if (settings.orientation === 'portrait') {
        return { widthIn: paper.widthIn, heightIn: paper.heightIn };
    }

    return { widthIn: paper.heightIn, heightIn: paper.widthIn };
}

const LINE_NUMBER_GUTTER_UNITS = 60;

export function createPageGeometry(settings: PageSettings): PageGeometry {
    const { widthIn, heightIn } = getPageDimensions(settings);

    const width = widthIn * UNITS_PER_INCH;
    const height = heightIn * UNITS_PER_INCH;
    const margin = settings.marginIn * UNITS_PER_INCH;

    return {
        widthIn,
        heightIn,
        width,
        height,
        margin,
        contentWidth: width - margin * 2,
        contentHeight: height - margin * 2,
        lineNumberGutter: LINE_NUMBER_GUTTER_UNITS,
    };
}
