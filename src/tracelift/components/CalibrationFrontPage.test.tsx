import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { CalibrationFrontPage } from './CalibrationFrontPage';
import { buildCalibrationLayout } from '../lib/calibrationLayout';
import type { PageSettings } from '../types/settings';

const SETTINGS: PageSettings = {
    paperSize: 'letter',
    orientation: 'portrait',
    marginIn: 0.5,
    fontSizePt: 24,
    lineSpacing: 1.7,
};

describe('CalibrationFrontPage', () => {
    it('renders the title and one cut guide + label per calibration spot', () => {
        const layout = buildCalibrationLayout(SETTINGS);
        const { container } = render(<CalibrationFrontPage layout={layout} />);

        expect(container).toHaveTextContent('Duplex Calibration');
        expect(container.querySelectorAll('path[data-flap-id]')).toHaveLength(5);

        const labels = Array.from(container.querySelectorAll('text')).map((el) => el.textContent);
        expect(labels).toContain('TOP LEFT');
        expect(labels).toContain('TOP RIGHT');
        expect(labels).toContain('CENTER');
        expect(labels).toContain('BOTTOM LEFT');
        expect(labels).toContain('BOTTOM RIGHT');
    });

    it('places each label inside its own cut-guide box', () => {
        const layout = buildCalibrationLayout(SETTINGS);
        const { container } = render(<CalibrationFrontPage layout={layout} />);

        for (const flap of layout.flaps) {
            const path = container.querySelector(`path[data-flap-id="${flap.id}"]`);
            expect(path).not.toBeNull();

            const label = Array.from(container.querySelectorAll('text')).find(
                (el) => el.textContent === flap.label,
            );
            expect(label).not.toBeNull();

            const labelX = Number(label!.getAttribute('x'));
            expect(labelX).toBeGreaterThanOrEqual(flap.x);
            expect(labelX).toBeLessThanOrEqual(flap.x + flap.width);
        }
    });
});
