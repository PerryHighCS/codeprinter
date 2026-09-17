import { describe, expect, it } from 'vitest';
import { layoutWorksheet } from './layoutWorksheet';
import { parseWorksheet } from './parseWorksheet';
import { FLAP_HORIZONTAL_PADDING, FLAP_MARGIN } from './flapGeometry';
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

    it('increases each line baseline by exactly one line height when no line has a flap', () => {
        const doc = parseWorksheet('a = 1;\nb = 2;\nc = 3;');
        const layout = layoutWorksheet(doc, settings());

        const gaps = layout.lines
            .slice(1)
            .map((line, i) => line.baselineY - layout.lines[i].baselineY);

        gaps.forEach((gap) => expect(gap).toBeCloseTo(gaps[0]));
        expect(gaps[0]).toBeGreaterThan(0);
    });

    it('adds extra clearance above a line that has a flap, since the flap hinges at the top and needs room to swing open', () => {
        const doc = parseWorksheet('a = 1;\nb = 2;\nc = [[c]] + 1;\nd = 4;');
        const layout = layoutWorksheet(doc, settings());

        const plainGap = layout.lines[1].baselineY - layout.lines[0].baselineY;
        const gapBeforeFlapLine = layout.lines[2].baselineY - layout.lines[1].baselineY;
        const gapAfterFlapLine = layout.lines[3].baselineY - layout.lines[2].baselineY;

        expect(gapBeforeFlapLine).toBeGreaterThan(plainGap);
        expect(gapAfterFlapLine).toBeCloseTo(plainGap);
    });

    it('keeps line spacing at least a flap box tall, even if lineSpacing is set very tight', () => {
        const doc = parseWorksheet('score = [[score]] + 1;\nscore = [[score]] + 1;');
        const layout = layoutWorksheet(doc, settings({ lineSpacing: 1 }));

        const [firstFlap] = layout.flaps;
        const secondFlap = layout.flaps[1];

        // The first line's flap box must not extend into the second line's.
        expect(firstFlap.y + firstFlap.height).toBeLessThanOrEqual(secondFlap.y + 1e-6);
    });

    it('positions plain text tokens left to right with no gaps or overlaps', () => {
        const doc = parseWorksheet('total = price * quantity;');
        const layout = layoutWorksheet(doc, settings());
        const tokens = layout.lines[0].tokens;

        for (let i = 1; i < tokens.length; i++) {
            expect(tokens[i].x).toBeCloseTo(tokens[i - 1].x + tokens[i - 1].width);
        }
    });

    it('reserves the flap padding and margin on both sides so its box cannot overlap or sit flush against neighboring text', () => {
        const doc = parseWorksheet('score = [[score]] + 10;');
        const layout = layoutWorksheet(doc, settings());
        const [before, flap, after] = layout.lines[0].tokens;
        const inset = FLAP_HORIZONTAL_PADDING + FLAP_MARGIN;

        expect(flap.token.type).toBe('flap');
        expect(flap.x).toBeCloseTo(before.x + before.width + inset);
        expect(after.x).toBeCloseTo(flap.x + flap.width + inset);
    });

    it('leaves a visible margin between the flap box edge and the neighboring token', () => {
        const doc = parseWorksheet('score = [[score]] + 10;');
        const layout = layoutWorksheet(doc, settings());
        const [, , after] = layout.lines[0].tokens;
        const flapBox = layout.flaps[0];

        expect(after.x - (flapBox.x + flapBox.width)).toBeCloseTo(FLAP_MARGIN);
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
        expect(layout.overflow.overflowsHorizontally).toBe(false);
    });

    it('reports overflow when a final flap extends past the bottom margin', () => {
        const doc = parseWorksheet('score = [[score]];');
        const layout = layoutWorksheet(doc, settings({ marginIn: 4.2, fontSizePt: 48 }));

        expect(layout.flaps[0].y).toBeLessThanOrEqual(layout.geometry.margin + layout.geometry.contentHeight);
        expect(layout.flaps[0].y + layout.flaps[0].height).toBeGreaterThan(
            layout.geometry.margin + layout.geometry.contentHeight,
        );
        expect(layout.overflow.fits).toBe(false);
    });

    it('reports horizontal overflow when a single line runs past the right margin, even though it fits vertically', () => {
        const longLine = `total = ${'x'.repeat(300)};`;
        const doc = parseWorksheet(longLine);
        const layout = layoutWorksheet(doc, settings());

        expect(layout.overflow.overflowsHorizontally).toBe(true);
        expect(layout.overflow.fits).toBe(false);
    });

    it('reports horizontal overflow when a flap near the right margin runs past it', () => {
        const longLine = `total = ${'x'.repeat(250)} + [[quantity]];`;
        const doc = parseWorksheet(longLine);
        const layout = layoutWorksheet(doc, settings());

        expect(layout.overflow.overflowsHorizontally).toBe(true);
    });

    it('reports horizontal overflow when a long title runs past the right margin, even with short code lines', () => {
        const doc = parseWorksheet(`Title: ${'x'.repeat(200)}\n\nscore = 3;`);
        const layout = layoutWorksheet(doc, settings());

        expect(layout.overflow.overflowsHorizontally).toBe(true);
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
