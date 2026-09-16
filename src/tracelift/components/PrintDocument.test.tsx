import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { PrintDocument } from './PrintDocument';
import { layoutWorksheet } from '../lib/layoutWorksheet';
import { parseWorksheet } from '../lib/parseWorksheet';
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

describe('PrintDocument', () => {
    it('is hidden on screen and shown under print, via Tailwind print: classes', () => {
        const layout = layoutWorksheet(parseWorksheet(ROUND_4_SOURCE), SETTINGS);
        const { container } = render(<PrintDocument layout={layout} duplexMode="long-edge" />);

        const root = container.querySelector('.print-document');
        expect(root).toHaveClass('hidden');
        expect(root).toHaveClass('print:block');
    });

    it('renders exactly two print-page sections, front then back', () => {
        const layout = layoutWorksheet(parseWorksheet(ROUND_4_SOURCE), SETTINGS);
        const { container } = render(<PrintDocument layout={layout} duplexMode="long-edge" />);

        const pages = container.querySelectorAll('.print-page');
        expect(pages).toHaveLength(2);

        // Front page has line-number groups; back page doesn't.
        expect(pages[0].querySelectorAll('g')).toHaveLength(4);
        expect(pages[1].querySelectorAll('g')).toHaveLength(0);
        expect(pages[1].querySelectorAll('text')).toHaveLength(3);
    });

    it('renders each print page at its full physical size, not the preview scale', () => {
        const layout = layoutWorksheet(parseWorksheet(ROUND_4_SOURCE), SETTINGS);
        const { container } = render(<PrintDocument layout={layout} duplexMode="long-edge" />);

        const svgs = container.querySelectorAll('svg');
        svgs.forEach((svg) => {
            expect(svg).toHaveAttribute('width', '8.5in');
            expect(svg).toHaveAttribute('height', '11in');
        });
    });
});
