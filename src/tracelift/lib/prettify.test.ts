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

    it('does not introduce a line break for multiple short flap markers', async () => {
        const result = await prettifySource('total=[[a]]+[[b]]+[[c]];');

        expect(result).toBe('total = [[a]] + [[b]] + [[c]];\n');
    });

    it('preserves a flap-only line', async () => {
        const result = await prettifySource('[[score]];');
        expect(result).toBe('[[score]];\n');
    });

    it('rejects when the code is not valid JavaScript once flap markers are substituted', async () => {
        await expect(prettifySource('this is not code;;;{')).rejects.toThrow();
    });

    it('does not corrupt an earlier occurrence of the title text inside the code', async () => {
        const source = [
            'let title = "Title: Round 4";',
            'Title: Round 4',
            '',
            'score=1;',
        ].join('\n');

        const result = await prettifySource(source);

        expect(result).toBe(
            ['Title: Round 4', '', 'let title = "Title: Round 4";', '', 'score = 1;'].join('\n') + '\n',
        );
    });

    it('does not corrupt an identifier in the source that collides with the placeholder scheme', async () => {
        const result = await prettifySource('__tracelift_flap_0__=1;score=[[score]]+__tracelift_flap_0__;');
        expect(result).toBe('__tracelift_flap_0__ = 1;\nscore = [[score]] + __tracelift_flap_0__;\n');
    });
});
