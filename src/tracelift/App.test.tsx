import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';

describe('App', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
    });

    it('renders a live preview of the default Round 4 source', () => {
        render(<App />);

        // Scoped to the on-screen preview: the print document also renders
        // the worksheet (hidden via CSS, but still present in the DOM).
        const preview = document.querySelector('#tracelift-preview')!;
        expect(preview.querySelectorAll('svg').length).toBeGreaterThan(0);
        expect(preview.querySelectorAll('path[data-flap-id]')).toHaveLength(3);
    });

    it('updates the preview when the source text changes', () => {
        render(<App />);

        // fireEvent.change sets the value directly; userEvent.type would
        // misinterpret [[ ]] as its special key-sequence syntax.
        const textarea = screen.getByLabelText('Source') as HTMLTextAreaElement;
        fireEvent.change(textarea, { target: { value: 'x = [[a]] + [[b]];' } });

        const preview = document.querySelector('#tracelift-preview')!;
        expect(preview.querySelectorAll('path[data-flap-id]')).toHaveLength(2);
    });

    it('shows the overflow warning once the program stops fitting on the page', async () => {
        const user = userEvent.setup();
        render(<App />);

        expect(screen.queryByRole('alert')).not.toBeInTheDocument();

        const fontInput = screen.getByLabelText('Font size (pt)');
        await user.clear(fontInput);
        await user.type(fontInput, '200');

        expect(screen.getByRole('alert')).toHaveTextContent('does not fit');
    });

    it('applies the page preset when switching paper size', async () => {
        const user = userEvent.setup();
        render(<App />);

        const paperSelect = screen.getByLabelText('Paper') as HTMLSelectElement;
        const fontInput = screen.getByLabelText('Font size (pt)') as HTMLInputElement;

        expect(fontInput.value).toBe('24');

        await user.selectOptions(paperSelect, 'tabloid');

        expect(fontInput.value).toBe('32');
    });

    it('switches the preview between front, back, and side by side', async () => {
        const user = userEvent.setup();
        render(<App />);

        const backTab = screen.getByRole('button', { name: 'Back' });
        await user.click(backTab);

        const preview = document.querySelector('#tracelift-preview')!;
        const textElements = Array.from(preview.querySelectorAll('text'));
        expect(textElements.some((el) => el.textContent === 'score')).toBe(true);
        // Only the back page is shown in the preview: no front-page
        // line-number labels (the always-rendered, hidden print document
        // has its own <g> elements, so this must stay scoped to preview).
        expect(preview.querySelectorAll('g')).toHaveLength(0);
    });
});
