import { describe, expect, it } from 'vitest';
import { layoutWorksheet } from './layoutWorksheet';
import { parseWorksheet } from './parseWorksheet';
import type { PageSettings } from '../types/settings';

const ROUND_4_SOURCE = [
    'Title: Round 4',
    '',
    'score = 3;',
    'score = [[score]] + 10;',
    'score = [[score]] * 2;',
    'score = [[score]] - 4;',
].join('\n');

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

describe('layoutWorksheet', () => {
    it('lays out one LayoutLine per parsed program line, in order', () => {
        const doc = parseWorksheet(ROUND_4_SOURCE);
        const layout = layoutWorksheet(doc, settings());

        expect(layout.lines).toHaveLength(4);
        expect(layout.lines.map((line) => line.number)).toEqual([1, 2, 3, 4]);
    });

    it('increases each line baseline by exactly one line height', () => {
        const doc = parseWorksheet(ROUND_4_SOURCE);
        const layout = layoutWorksheet(doc, settings());

        const gaps = layout.lines
            .slice(1)
            .map((line, i) => line.baselineY - layout.lines[i].baselineY);

        gaps.forEach((gap) => expect(gap).toBeCloseTo(gaps[0]));
        expect(gaps[0]).toBeGreaterThan(0);
    });

    it('positions tokens left to right with no gaps or overlaps', () => {
        const doc = parseWorksheet('score = [[score]] + 10;');
        const layout = layoutWorksheet(doc, settings());
        const tokens = layout.lines[0].tokens;

        for (let i = 1; i < tokens.length; i++) {
            expect(tokens[i].x).toBeCloseTo(tokens[i - 1].x + tokens[i - 1].width);
        }
    });

    it('places the title above the first code line', () => {
        const doc = parseWorksheet(ROUND_4_SOURCE);
        const layout = layoutWorksheet(doc, settings());

        expect(layout.title.text).toBe('Round 4');
        expect(layout.title.y).toBeLessThan(layout.lines[0].baselineY);
    });

    it('reports no overflow when the program fits on the page', () => {
        const doc = parseWorksheet(ROUND_4_SOURCE);
        const layout = layoutWorksheet(doc, settings());

        expect(layout.overflow.fits).toBe(true);
        expect(layout.overflow.overflowLines).toBe(0);
    });

    it('reports overflow when the program does not fit on the page', () => {
        const manyLines = Array.from({ length: 200 }, (_, i) => `line${i} = ${i};`).join('\n');
        const doc = parseWorksheet(manyLines);
        const layout = layoutWorksheet(doc, settings());

        expect(layout.overflow.fits).toBe(false);
        expect(layout.overflow.overflowLines).toBeGreaterThan(0);
    });

    it('lays out correctly across all four page configurations', () => {
        const doc = parseWorksheet(ROUND_4_SOURCE);
        const configs: Array<[PageSettings['paperSize'], PageSettings['orientation']]> = [
            ['letter', 'portrait'],
            ['letter', 'landscape'],
            ['tabloid', 'portrait'],
            ['tabloid', 'landscape'],
        ];

        for (const [paperSize, orientation] of configs) {
            const layout = layoutWorksheet(doc, settings({ paperSize, orientation }));
            expect(layout.lines).toHaveLength(4);
            expect(layout.overflow.fits).toBe(true);
        }
    });
});
