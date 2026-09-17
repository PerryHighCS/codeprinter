import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { FlapCutGuide } from './FlapCutGuide';
import { flapCutPath } from '../lib/flapGeometry';
import type { FlapLayout } from '../types/layout';

const FLAP: FlapLayout = { id: 'line-2-flap-1', label: 'score', x: 10, y: 20, width: 30, height: 15 };

describe('FlapCutGuide', () => {
    it('renders a path matching flapCutPath, tagged with the flap id', () => {
        const { container } = render(
            <svg>
                <FlapCutGuide flap={FLAP} />
            </svg>,
        );

        const path = container.querySelector('path');
        expect(path).not.toBeNull();
        expect(path).toHaveAttribute('d', flapCutPath(FLAP));
        expect(path).toHaveAttribute('data-flap-id', 'line-2-flap-1');
        expect(path).toHaveAttribute('fill', 'none');
    });
});
