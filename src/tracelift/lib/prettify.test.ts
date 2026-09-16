import { describe, expect, it } from 'vitest';
import { prettifySource } from './prettify';

describe('prettifySource', () => {
    it('formats code spacing while leaving the title line and flap markers untouched', async () => {
        const source = [
            'Title: Round 4',
            '',
            'score=3;',
            'score=[[score]]+10;',
            'score=[[score]]*2;',
            'score=[[score]]-4;',
            '',
        ].join('\n');

        const result = await prettifySource(source);

        expect(result).toBe(
            [
                'Title: Round 4',
                '',
                'score = 3;',
                'score = [[score]] + 10;',
                'score = [[score]] * 2;',
                'score = [[score]] - 4;',
            ].join('\n') + '\n',
        );
    });

    it('formats code with no Title line', async () => {
        const result = await prettifySource('x=1;y=2;');
        expect(result).toBe('x = 1;\ny = 2;\n');
    });

    it('preserves multiple flap markers on one line, including their exact text', async () => {
        const result = await prettifySource('total=[[price]]*[[quantity]];');
        expect(result).toBe('total = [[price]] * [[quantity]];\n');
    });

    it('preserves a flap-only line', async () => {
        const result = await prettifySource('[[score]];');
        expect(result).toBe('[[score]];\n');
    });

    it('rejects when the code is not valid JavaScript once flap markers are substituted', async () => {
        await expect(prettifySource('this is not code;;;{')).rejects.toThrow();
    });
});
