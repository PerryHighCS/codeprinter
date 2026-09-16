import { describe, expect, it } from 'vitest';
import { flapCutPath, FLAP_HORIZONTAL_PADDING, FLAP_VERTICAL_PADDING } from './flapGeometry';
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

const SETTINGS: PageSettings = {
    paperSize: 'letter',
    orientation: 'portrait',
    marginIn: 0.5,
    fontSizePt: 24,
    lineSpacing: 1.7,
};

describe('computeFlapLayouts', () => {
    it('produces one FlapLayout per flap token, in document order', () => {
        const doc = parseWorksheet(ROUND_4_SOURCE);
        const layout = layoutWorksheet(doc, SETTINGS);

        expect(layout.flaps.map((flap) => flap.id)).toEqual([
            'line-2-flap-1',
            'line-3-flap-1',
            'line-4-flap-1',
        ]);
        layout.flaps.forEach((flap) => expect(flap.label).toBe('score'));
    });

    it('pads the flap rectangle around the underlying token position', () => {
        const doc = parseWorksheet('score = [[score]] + 10;');
        const layout = layoutWorksheet(doc, SETTINGS);
        const line = layout.lines[0];
        const flapToken = line.tokens.find((t) => t.token.type === 'flap')!;
        const flap = layout.flaps[0];

        expect(flap.x).toBeCloseTo(flapToken.x - FLAP_HORIZONTAL_PADDING);
        expect(flap.width).toBeCloseTo(flapToken.width + FLAP_HORIZONTAL_PADDING * 2);
        expect(flap.height).toBeCloseTo(line.fontSize + FLAP_VERTICAL_PADDING * 2);

        // The padded box should straddle the text baseline: its top is
        // above the baseline and its bottom is below it.
        expect(flap.y).toBeLessThan(line.baselineY);
        expect(flap.y + flap.height).toBeGreaterThan(line.baselineY);
    });

    it('returns no flaps for a line with no flap tokens', () => {
        const doc = parseWorksheet('score = 3;');
        const layout = layoutWorksheet(doc, SETTINGS);
        expect(layout.flaps).toEqual([]);
    });
});

describe('flapCutPath', () => {
    const flap = { id: 'x', label: 'x', x: 10, y: 20, width: 30, height: 15 };

    it('draws left, bottom, and right edges only, leaving the top open as the hinge', () => {
        const path = flapCutPath(flap);

        expect(path).toBe('M 10 20 L 10 35 L 40 35 L 40 20');
        // No closing command back to the start, which would re-draw the top edge.
        expect(path).not.toContain('Z');
    });
});
