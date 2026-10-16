import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { parseWorksheet } from './parseWorksheet';
import { layoutWorksheet } from './layoutWorksheet';
import { EVALUATION_MIN_WIDTH, MIN_PAPER_BRIDGE } from './evaluationGeometry';
import { FrontPage } from '../components/FrontPage';
import { BackPage } from '../components/BackPage';
import type { PageSettings } from '../types/settings';

const settings: PageSettings = { paperSize: 'tabloid', orientation: 'landscape', marginIn: 0.75, fontSizePt: 36, lineSpacing: 2 };
const example = 'console.log({{[[score]] * [[lives]] > 10}});';

describe('evaluation windows', () => {
    it('parses evaluations with independent, unique variable flaps in source order', () => {
        const doc = parseWorksheet(`[[before]] + {{[[score]] * [[lives]] > 10}} + [[after]];`);
        expect(doc.errors).toBeUndefined();
        const evaluation = doc.lines[0].tokens.find((token) => token.type === 'evaluation');
        expect(evaluation).toEqual({ type: 'evaluation', id: 'line-1-evaluation-1', tokens: [
            { type: 'flap', text: 'score', id: 'line-1-flap-2' },
            { type: 'text', text: ' * ' },
            { type: 'flap', text: 'lives', id: 'line-1-flap-3' },
            { type: 'text', text: ' > 10' },
        ] });
        const tokens = doc.lines[0].tokens;
        expect(tokens[tokens.length - 2]).toMatchObject({ id: 'line-1-flap-4' });
    });

    it.each(['{{x', 'x}}', '{{x\n}}', '{{x + {{y}}}}', '{{ }}'])('reports malformed evaluation markup: %s', (source) => {
        expect(parseWorksheet(source).errors?.length).toBeGreaterThan(0);
    });

    it('renders normal code, two flaps, and one closed blank window on the front only', () => {
        const layout = layoutWorksheet(parseWorksheet(example), settings);
        expect(layout.errors).toEqual([]);
        expect(layout.flaps.map((flap) => flap.label)).toEqual(['score', 'lives']);
        const front = render(<FrontPage layout={layout} />).container;
        const lineText = Array.from(front.querySelectorAll('g text')).slice(1).map((text) => text.textContent).join('');
        expect(lineText).toBe('console.log(score * lives > 10);');
        expect(front.querySelectorAll('[data-flap-id]')).toHaveLength(2);
        const window = front.querySelector('[data-evaluation-window]');
        expect(window?.getAttribute('d')).toMatch(/ Z$/);
        expect(window).toHaveAttribute('fill', 'none');
        expect(front.textContent).not.toContain('true');
        const back = render(<BackPage layout={layout} duplexMode="long-edge" />).container;
        expect(back.querySelectorAll('[data-evaluation-window]')).toHaveLength(0);
        expect(back.querySelectorAll('[data-flap-id]')).toHaveLength(2);
    });

    it('reserves the minimum width for short expressions and paper bridges above and below windows', () => {
        const layout = layoutWorksheet(parseWorksheet(`${example}\n{{x}};\ny = [[y]];`), settings);
        const [first, second] = layout.evaluationWindows!;
        expect(second.width).toBe(EVALUATION_MIN_WIDTH);
        for (const flap of layout.flaps.slice(0, 2)) {
            expect(first.y - flap.y - flap.height).toBeGreaterThanOrEqual(MIN_PAPER_BRIDGE - 1e-6);
        }
        const nextFlap = layout.flaps[2];
        expect(nextFlap.y - second.y - second.height).toBeGreaterThanOrEqual(MIN_PAPER_BRIDGE);
    });

    it('reports adjacent-window collisions but permits adequately spaced windows', () => {
        expect(layoutWorksheet(parseWorksheet('{{x}}{{y}}'), settings).errors).not.toEqual([]);
        const spaced = layoutWorksheet(parseWorksheet('{{x}}      {{y}}'), settings);
        expect(spaced.evaluationWindows).toHaveLength(2);
        expect(spaced.errors).toEqual([]);
    });

    it('includes window dimensions in horizontal and vertical overflow', () => {
        const narrow = { ...settings, paperSize: 'letter' as const, orientation: 'portrait' as const };
        const source = Array.from({ length: 9 }, () => '{{x}};').join('\n');
        expect(layoutWorksheet(parseWorksheet(source), narrow).overflow.overflowLines).toBeGreaterThan(0);
        const long = layoutWorksheet(parseWorksheet(`${'x'.repeat(23)}{{x}}`), narrow);
        expect(long.overflow.overflowsHorizontally).toBe(true);
    });
});
