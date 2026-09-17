import { describe, expect, it } from 'vitest';
import { buildCalibrationLayout, calibrationFlapsOverlap } from './calibrationLayout';
import type { PageSettings } from '../types/settings';

const SETTINGS: PageSettings = {
    paperSize: 'letter',
    orientation: 'portrait',
    marginIn: 0.5,
    fontSizePt: 24,
    lineSpacing: 1.7,
};

describe('buildCalibrationLayout', () => {
    it('produces exactly five flaps, one per named position', () => {
        const layout = buildCalibrationLayout(SETTINGS);

        expect(layout.flaps.map((flap) => flap.label)).toEqual([
            'TOP LEFT',
            'TOP RIGHT',
            'CENTER',
            'BOTTOM LEFT',
            'BOTTOM RIGHT',
        ]);
        expect(new Set(layout.flaps.map((flap) => flap.id)).size).toBe(5);
    });

    it('places left/right pairs at the same y and top/bottom pairs at the same x', () => {
        const layout = buildCalibrationLayout(SETTINGS);
        const byLabel = Object.fromEntries(layout.flaps.map((flap) => [flap.label, flap]));

        expect(byLabel['TOP LEFT'].y).toBeCloseTo(byLabel['TOP RIGHT'].y);
        expect(byLabel['BOTTOM LEFT'].y).toBeCloseTo(byLabel['BOTTOM RIGHT'].y);
        expect(byLabel['TOP LEFT'].x).toBeCloseTo(byLabel['BOTTOM LEFT'].x);
        // Right-aligned labels have different text widths ("TOP RIGHT" vs
        // "BOTTOM RIGHT"), so their boxes share a right edge, not a left one.
        expect(byLabel['TOP RIGHT'].x + byLabel['TOP RIGHT'].width).toBeCloseTo(
            byLabel['BOTTOM RIGHT'].x + byLabel['BOTTOM RIGHT'].width,
        );
    });

    it('keeps every flap within the page content area', () => {
        const layout = buildCalibrationLayout(SETTINGS);
        const { geometry } = layout;
        const contentRight = geometry.margin + geometry.contentWidth;
        const contentBottom = geometry.margin + geometry.contentHeight;

        for (const flap of layout.flaps) {
            expect(flap.x).toBeGreaterThanOrEqual(geometry.margin - 1e-6);
            expect(flap.y).toBeGreaterThanOrEqual(geometry.margin - 1e-6);
            expect(flap.x + flap.width).toBeLessThanOrEqual(contentRight + 1e-6);
            expect(flap.y + flap.height).toBeLessThanOrEqual(contentBottom + 1e-6);
        }
    });

    it('centers the CENTER flap horizontally, and vertically between the top and bottom samples', () => {
        const layout = buildCalibrationLayout(SETTINGS);
        const byLabel = Object.fromEntries(layout.flaps.map((flap) => [flap.label, flap]));
        const { geometry } = layout;
        const center = byLabel.CENTER;
        const top = byLabel['TOP LEFT'];
        const bottom = byLabel['BOTTOM LEFT'];

        const expectedCenterX = geometry.margin + geometry.contentWidth / 2;
        expect(center.x + center.width / 2).toBeCloseTo(expectedCenterX);

        const expectedCenterY = (top.y + top.height / 2 + bottom.y + bottom.height / 2) / 2;
        expect(center.y + center.height / 2).toBeCloseTo(expectedCenterY);
    });

    it('produces valid layouts across all four page configurations', () => {
        const configs: Array<[PageSettings['paperSize'], PageSettings['orientation']]> = [
            ['letter', 'portrait'],
            ['letter', 'landscape'],
            ['tabloid', 'portrait'],
            ['tabloid', 'landscape'],
        ];

        for (const [paperSize, orientation] of configs) {
            const layout = buildCalibrationLayout({ ...SETTINGS, paperSize, orientation });
            expect(layout.flaps).toHaveLength(5);
        }
    });

    it('detects overlapping sample flaps at larger valid font sizes', () => {
        expect(calibrationFlapsOverlap(buildCalibrationLayout({ ...SETTINGS, fontSizePt: 38 }))).toBe(true);
    });
});
