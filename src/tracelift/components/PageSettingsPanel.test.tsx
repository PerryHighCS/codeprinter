import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PageSettingsPanel } from './PageSettingsPanel';
import type { PageSettings } from '../types/settings';

const SETTINGS: PageSettings = {
    paperSize: 'letter',
    orientation: 'portrait',
    marginIn: 0.5,
    fontSizePt: 24,
    lineSpacing: 1.7,
};

describe('PageSettingsPanel', () => {
    it('rejects a numeric value above its supported maximum on commit', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<PageSettingsPanel settings={SETTINGS} onChange={onChange} />);

        const fontSize = screen.getByLabelText('Font size (pt)');
        await user.clear(fontSize);
        await user.type(fontSize, '1e308');
        await user.tab();

        expect(onChange).toHaveBeenCalledWith({ ...SETTINGS, fontSizePt: 8 });
    });
});
