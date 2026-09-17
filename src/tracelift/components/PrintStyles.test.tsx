import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { PrintStyles } from './PrintStyles';
import type { PageSettings } from '../types/settings';

function settings(overrides: Partial<PageSettings> = {}): PageSettings {
    return {
        paperSize: 'letter',
        orientation: 'portrait',
        marginIn: 0.5,
        fontSizePt: 24,
        lineSpacing: 1.7,
        ...overrides,
    };
}

describe('PrintStyles', () => {
    it('generates an @page size rule matching the selected paper and orientation', () => {
        const { container } = render(<PrintStyles settings={settings()} />);
        expect(container.querySelector('style')?.textContent).toContain('size: 8.5in 11in;');
    });

    it('generates a matching @page size for all four page configurations', () => {
        const configs: Array<[PageSettings['paperSize'], PageSettings['orientation'], string]> = [
            ['letter', 'portrait', '8.5in 11in'],
            ['letter', 'landscape', '11in 8.5in'],
            ['tabloid', 'portrait', '11in 17in'],
            ['tabloid', 'landscape', '17in 11in'],
        ];

        for (const [paperSize, orientation, expectedSize] of configs) {
            const { container } = render(<PrintStyles settings={settings({ paperSize, orientation })} />);
            expect(container.querySelector('style')?.textContent).toContain(`size: ${expectedSize};`);
        }
    });

    it('sizes .print-page to match the selected page and forces a page break between pages', () => {
        const { container } = render(<PrintStyles settings={settings({ paperSize: 'tabloid', orientation: 'landscape' })} />);
        const css = container.querySelector('style')?.textContent ?? '';

        expect(css).toContain('width: 17in;');
        expect(css).toContain('height: 11in;');
        expect(css).toContain('break-after: page;');
    });
});
