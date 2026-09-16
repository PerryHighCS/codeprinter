import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { FrontPage } from './FrontPage';
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

describe('FrontPage', () => {
    it('renders an SVG sized to the page geometry', () => {
        const layout = layoutWorksheet(parseWorksheet(ROUND_4_SOURCE), SETTINGS);
        const { container } = render(<FrontPage layout={layout} />);

        const svg = container.querySelector('svg');
        expect(svg).not.toBeNull();
        expect(svg).toHaveAttribute('width', '8.5in');
        expect(svg).toHaveAttribute('height', '11in');
    });

    it('renders the title and one text element per token, including flap tokens as plain text', () => {
        const layout = layoutWorksheet(parseWorksheet(ROUND_4_SOURCE), SETTINGS);
        const { container } = render(<FrontPage layout={layout} />);

        expect(container).toHaveTextContent('Round 4');

        // 1 title + 4 line-number labels + 10 code tokens: line 1 has no
        // flap (1 text token), lines 2-4 each split into 3 tokens around
        // their flap marker (text, flap, text) = 1 + 3 + 3 + 3
        const textElements = container.querySelectorAll('text');
        expect(textElements).toHaveLength(1 + 4 + 10);

        const renderedText = Array.from(textElements).map((el) => el.textContent);
        expect(renderedText).toContain('score');
        expect(renderedText.filter((text) => text === 'score')).toHaveLength(3);
    });

    it('renders one line-number label per program line, in order', () => {
        const layout = layoutWorksheet(parseWorksheet(ROUND_4_SOURCE), SETTINGS);
        const { container } = render(<FrontPage layout={layout} />);

        const groups = container.querySelectorAll('g');
        expect(groups).toHaveLength(4);
        groups.forEach((group, index) => {
            expect(group.querySelector('text')).toHaveTextContent(String(index + 1));
        });
    });
});
