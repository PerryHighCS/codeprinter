import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { BackPage } from './BackPage';
import { layoutWorksheet } from '../lib/layoutWorksheet';
import { parseWorksheet } from '../lib/parseWorksheet';
import { transformFlapsForDuplex } from '../lib/duplexTransform';
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

describe('BackPage', () => {
    it('renders one rotated label per flap, each reading the flap label', () => {
        const layout = layoutWorksheet(parseWorksheet(ROUND_4_SOURCE), SETTINGS);
        const { container } = render(<BackPage layout={layout} duplexMode="long-edge" />);

        const labels = container.querySelectorAll('text');
        expect(labels).toHaveLength(3);
        labels.forEach((label) => {
            expect(label).toHaveTextContent('score');
            expect(label.getAttribute('transform')).toMatch(/^rotate\(180 /);
        });
    });

    it('centers each rotated label on its duplex-transformed flap coordinates', () => {
        const layout = layoutWorksheet(parseWorksheet(ROUND_4_SOURCE), SETTINGS);
        const backFlaps = transformFlapsForDuplex(layout.flaps, layout.geometry, 'long-edge');
        const { container } = render(<BackPage layout={layout} duplexMode="long-edge" />);

        const labels = container.querySelectorAll('text');
        backFlaps.forEach((flap, index) => {
            const label = labels[index];
            const centerX = flap.x + flap.width / 2;
            const centerY = flap.y + flap.height / 2;

            expect(label).toHaveAttribute('x', String(centerX));
            expect(label).toHaveAttribute('y', String(centerY));
            expect(label.getAttribute('transform')).toBe(`rotate(180 ${centerX} ${centerY})`);
        });
    });

    it('mirrors flaps differently depending on the selected duplex mode', () => {
        const layout = layoutWorksheet(parseWorksheet(ROUND_4_SOURCE), SETTINGS);
        const longEdge = render(<BackPage layout={layout} duplexMode="long-edge" />).container.querySelector('text');
        const shortEdge = render(<BackPage layout={layout} duplexMode="short-edge" />).container.querySelector(
            'text',
        );

        expect(longEdge?.getAttribute('x')).not.toBe(shortEdge?.getAttribute('x'));
    });
});
