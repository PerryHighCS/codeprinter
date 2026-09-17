import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OverflowWarning } from './OverflowWarning';

describe('OverflowWarning', () => {
    it('explains that a horizontal overflow can come from the title', () => {
        render(<OverflowWarning overflow={{ fits: false, overflowLines: 0, overflowsHorizontally: true }} />);

        expect(screen.getByRole('alert')).toHaveTextContent('The title or one or more lines run past the right margin.');
    });
});
