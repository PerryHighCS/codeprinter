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

    it('renders one U-shaped cut guide per flap, tagged with its flap id', () => {
        const layout = layoutWorksheet(parseWorksheet(ROUND_4_SOURCE), SETTINGS);
        const { container } = render(<FrontPage layout={layout} />);

        const paths = container.querySelectorAll('path');
        expect(paths).toHaveLength(3);

        const flapIds = Array.from(paths).map((el) => el.getAttribute('data-flap-id'));
        expect(flapIds).toEqual(['line-2-flap-1', 'line-3-flap-1', 'line-4-flap-1']);
    });

    it('draws a vertical rule separating the line numbers from the code', () => {
        const layout = layoutWorksheet(parseWorksheet(ROUND_4_SOURCE), SETTINGS);
        const { container } = render(<FrontPage layout={layout} />);

        const rule = container.querySelector('line');
        expect(rule).not.toBeNull();
        expect(rule).toHaveAttribute('x1', String(layout.lineNumberRuleX));
        expect(rule).toHaveAttribute('x2', String(layout.lineNumberRuleX));
        expect(rule).toHaveAttribute('y1', String(layout.lineNumberRuleTop));
    });

    it('starts the rule below the title instead of at the page margin, so a long title is never crossed by it', () => {
        const source = ['Title: A Very Long Worksheet Title About Variable Tracing', '', 'score = 3;'].join('\n');
        const layout = layoutWorksheet(parseWorksheet(source), SETTINGS);
        const { container } = render(<FrontPage layout={layout} />);

        const rule = container.querySelector('line')!;
        expect(Number(rule.getAttribute('y1'))).toBeGreaterThan(layout.title.y);
    });

    it('omits the line-number rule for a program with no code lines', () => {
        const layout = layoutWorksheet(parseWorksheet('Title: Empty'), SETTINGS);
        const { container } = render(<FrontPage layout={layout} />);

        expect(container.querySelector('line')).toBeNull();
    });

    it('preserves leading whitespace on an indented line so the code text stays aligned with the layout math', () => {
        // Prettier-formatted code (e.g. inside an if-block) can indent a
        // line with leading spaces. SVG collapses whitespace by default, so
        // without xml:space="preserve" those spaces render away while the
        // flap/token x-positions (computed assuming they're there) don't
        // move, leaving a gap between the code text and its cut guides.
        const source = ['if (x) {', '    score = [[score]] + 1;', '}'].join('\n');
        const layout = layoutWorksheet(parseWorksheet(source), SETTINGS);
        const { container } = render(<FrontPage layout={layout} />);

        const svg = container.querySelector('svg');
        expect(svg).toHaveAttribute('xml:space', 'preserve');

        const indentedTextElement = Array.from(container.querySelectorAll('text')).find((el) =>
            (el.textContent ?? '').startsWith('    score'),
        );
        expect(indentedTextElement).toBeDefined();
    });
});
