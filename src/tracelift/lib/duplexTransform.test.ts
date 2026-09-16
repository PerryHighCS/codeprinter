import { describe, expect, it } from 'vitest';
import { transformFlapForDuplex, transformFlapsForDuplex } from './duplexTransform';
import type { FlapLayout, PageGeometry } from '../types/layout';

const GEOMETRY: PageGeometry = {
    widthIn: 8.5,
    heightIn: 11,
    width: 850,
    height: 1100,
    margin: 50,
    contentWidth: 750,
    contentHeight: 1000,
    lineNumberGutter: 60,
};

const FLAP: FlapLayout = { id: 'line-2-flap-1', label: 'score', x: 100, y: 200, width: 80, height: 30 };

describe('transformFlapForDuplex', () => {
    it('mirrors x horizontally across the page width for long-edge binding, leaving y unchanged', () => {
        const backFlap = transformFlapForDuplex(FLAP, GEOMETRY, 'long-edge');

        expect(backFlap.x).toBe(GEOMETRY.width - FLAP.x - FLAP.width);
        expect(backFlap.x).toBe(670);
        expect(backFlap.y).toBe(FLAP.y);
        expect(backFlap.width).toBe(FLAP.width);
        expect(backFlap.height).toBe(FLAP.height);
    });

    it('mirrors y vertically across the page height for short-edge binding, leaving x unchanged', () => {
        const backFlap = transformFlapForDuplex(FLAP, GEOMETRY, 'short-edge');

        expect(backFlap.y).toBe(GEOMETRY.height - FLAP.y - FLAP.height);
        expect(backFlap.y).toBe(870);
        expect(backFlap.x).toBe(FLAP.x);
        expect(backFlap.width).toBe(FLAP.width);
        expect(backFlap.height).toBe(FLAP.height);
    });

    it('preserves id and label through the transform', () => {
        const backFlap = transformFlapForDuplex(FLAP, GEOMETRY, 'long-edge');
        expect(backFlap.id).toBe(FLAP.id);
        expect(backFlap.label).toBe(FLAP.label);
    });
});

describe('transformFlapsForDuplex', () => {
    it('transforms every flap in the array, preserving order', () => {
        const second: FlapLayout = { ...FLAP, id: 'line-3-flap-1', x: 300 };
        const backFlaps = transformFlapsForDuplex([FLAP, second], GEOMETRY, 'long-edge');

        expect(backFlaps.map((f) => f.id)).toEqual(['line-2-flap-1', 'line-3-flap-1']);
        expect(backFlaps[0].x).toBe(GEOMETRY.width - FLAP.x - FLAP.width);
        expect(backFlaps[1].x).toBe(GEOMETRY.width - second.x - second.width);
    });
});
