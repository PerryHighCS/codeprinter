import { describe, expect, it } from 'vitest';
import { parseWorksheet } from './parseWorksheet';

describe('parseWorksheet', () => {
    it('parses the Round 4 fixture from the plan', () => {
        const source = [
            'Title: Round 4',
            '',
            'score = 3;',
            'score = [[score]] + 10;',
            'score = [[score]] * 2;',
            'score = [[score]] - 4;',
        ].join('\n');

        const doc = parseWorksheet(source);

        expect(doc.title).toBe('Round 4');
        expect(doc.lines).toHaveLength(4);
        expect(doc.lines.map((line) => line.number)).toEqual([1, 2, 3, 4]);

        expect(doc.lines[0].tokens).toEqual([{ type: 'text', text: 'score = 3;' }]);

        expect(doc.lines[1].tokens).toEqual([
            { type: 'text', text: 'score = ' },
            { type: 'flap', text: 'score', id: 'line-2-flap-1' },
            { type: 'text', text: ' + 10;' },
        ]);
    });

    it('trims whitespace around the title text', () => {
        const doc = parseWorksheet('Title:   Round 4   \n\nx = 1;');
        expect(doc.title).toBe('Round 4');
    });

    it('defaults to an empty title when no Title line is present', () => {
        const doc = parseWorksheet('x = 1;\ny = 2;');
        expect(doc.title).toBe('');
        expect(doc.lines).toHaveLength(2);
    });

    it('renders a plain line with no flaps as a single text token', () => {
        const doc = parseWorksheet('total = price * quantity;');
        expect(doc.lines).toEqual([
            {
                number: 1,
                tokens: [{ type: 'text', text: 'total = price * quantity;' }],
            },
        ]);
    });

    it('produces one flap token per marker on a line, in order, with sequential ids', () => {
        const doc = parseWorksheet('total = [[price]] * [[quantity]];');

        expect(doc.lines[0].tokens).toEqual([
            { type: 'text', text: 'total = ' },
            { type: 'flap', text: 'price', id: 'line-1-flap-1' },
            { type: 'text', text: ' * ' },
            { type: 'flap', text: 'quantity', id: 'line-1-flap-2' },
            { type: 'text', text: ';' },
        ]);
    });

    it('does not number or emit blank lines, including blank lines between code lines', () => {
        const doc = parseWorksheet('Title: Gaps\n\nscore = 1;\n\n\nscore = [[score]] + 1;\n');

        expect(doc.lines.map((line) => line.number)).toEqual([1, 2]);
        expect(doc.lines[1].tokens).toContainEqual({
            type: 'flap',
            text: 'score',
            id: 'line-2-flap-1',
        });
    });

    it('treats a line that is a flap marker with nothing else as a single flap token', () => {
        const doc = parseWorksheet('[[score]]');
        expect(doc.lines[0].tokens).toEqual([{ type: 'flap', text: 'score', id: 'line-1-flap-1' }]);
    });

    it('trims whitespace inside a flap marker', () => {
        const doc = parseWorksheet('x = [[ score ]];');
        expect(doc.lines[0].tokens[1]).toEqual({ type: 'flap', text: 'score', id: 'line-1-flap-1' });
    });
});
