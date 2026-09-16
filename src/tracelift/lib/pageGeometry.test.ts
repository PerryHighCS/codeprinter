import { describe, expect, it } from 'vitest';
import { createPageGeometry, getPageDimensions, UNITS_PER_INCH } from './pageGeometry';
import type { PageSettings } from '../types/settings';

function settings(overrides: Partial<PageSettings> = {}): PageSettings {
    return {
        paperSize: 'letter',
        orientation: 'portrait',
        marginIn: 0.5,
        fontSizePt: 24,
        lineSpacing: 1.7,
        ...overrides,
    };
}

describe('getPageDimensions', () => {
    it('returns Letter portrait as 8.5 x 11', () => {
        expect(getPageDimensions(settings())).toEqual({ widthIn: 8.5, heightIn: 11 });
    });

    it('returns Letter landscape as 11 x 8.5', () => {
        expect(getPageDimensions(settings({ orientation: 'landscape' }))).toEqual({
            widthIn: 11,
            heightIn: 8.5,
        });
    });

    it('returns Tabloid portrait as 11 x 17', () => {
        expect(getPageDimensions(settings({ paperSize: 'tabloid' }))).toEqual({
            widthIn: 11,
            heightIn: 17,
        });
    });

    it('returns Tabloid landscape as 17 x 11', () => {
        expect(
            getPageDimensions(settings({ paperSize: 'tabloid', orientation: 'landscape' })),
        ).toEqual({ widthIn: 17, heightIn: 11 });
    });
});

describe('createPageGeometry', () => {
    it('converts physical dimensions and margins into units at 100 units per inch', () => {
        const geometry = createPageGeometry(settings({ marginIn: 0.5 }));

        expect(geometry.width).toBe(8.5 * UNITS_PER_INCH);
        expect(geometry.height).toBe(11 * UNITS_PER_INCH);
        expect(geometry.margin).toBe(0.5 * UNITS_PER_INCH);
    });

    it('derives content dimensions by subtracting margins from both sides', () => {
        const geometry = createPageGeometry(settings({ marginIn: 0.5 }));

        expect(geometry.contentWidth).toBe(geometry.width - geometry.margin * 2);
        expect(geometry.contentHeight).toBe(geometry.height - geometry.margin * 2);
    });

    it('produces the correct physical dimensions for all four page configurations', () => {
        const configs: Array<[PageSettings['paperSize'], PageSettings['orientation'], number, number]> = [
            ['letter', 'portrait', 8.5, 11],
            ['letter', 'landscape', 11, 8.5],
            ['tabloid', 'portrait', 11, 17],
            ['tabloid', 'landscape', 17, 11],
        ];

        for (const [paperSize, orientation, widthIn, heightIn] of configs) {
            const geometry = createPageGeometry(settings({ paperSize, orientation }));
            expect(geometry.widthIn).toBe(widthIn);
            expect(geometry.heightIn).toBe(heightIn);
        }
    });
});
