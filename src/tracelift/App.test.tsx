import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';

// The page settings panel lives behind a gear button by default (to keep
// the front preview visible without scrolling), so any test touching its
// fields has to open it first.
function openSettings() {
    fireEvent.click(screen.getByRole('button', { name: 'Page settings' }));
}

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

        const textarea = screen.getByLabelText('Source');
        fireEvent.change(textarea, {
            target: { value: Array.from({ length: 20 }, (_, index) => `score${index} = ${index};`).join('\n') },
        });

        openSettings();
        const fontInput = screen.getByLabelText('Font size (pt)');
        await user.clear(fontInput);
        await user.type(fontInput, '72');
        await user.tab();

        expect(screen.getByRole('alert')).toHaveTextContent('does not fit');
    });

    it('applies the page preset when switching paper size', async () => {
        const user = userEvent.setup();
        render(<App />);

        openSettings();
        const paperSelect = screen.getByLabelText('Paper') as HTMLSelectElement;
        const fontInput = screen.getByLabelText('Font size (pt)') as HTMLInputElement;

        expect(fontInput.value).toBe('24');

        await user.selectOptions(paperSelect, 'tabloid');

        expect(fontInput.value).toBe('32');
    });

    it('keeps the field editable while clearing it, but falls back to the minimum on blur', () => {
        render(<App />);

        // fireEvent.change sets the value directly; userEvent.type on a
        // number input reports intermediate keystrokes ("8" then "8-") that
        // don't reflect a real cleared-and-retyped value.
        openSettings();
        const fontInput = screen.getByLabelText('Font size (pt)') as HTMLInputElement;

        fireEvent.change(fontInput, { target: { value: '' } });
        // Clearing the field to retype a new value must not immediately
        // snap back to the minimum — that would make the field impossible
        // to actually clear and replace.
        expect(fontInput.value).toBe('');

        fireEvent.blur(fontInput);
        expect(fontInput.value).toBe('8');

        fireEvent.change(fontInput, { target: { value: '-100' } });
        fireEvent.blur(fontInput);
        expect(fontInput.value).toBe('8');
    });

    it('lets a cleared numeric field be retyped with a new value instead of losing the edit', () => {
        render(<App />);

        openSettings();
        const fontInput = screen.getByLabelText('Font size (pt)') as HTMLInputElement;

        fireEvent.change(fontInput, { target: { value: '' } });
        fireEvent.change(fontInput, { target: { value: '16' } });
        expect(fontInput.value).toBe('16');

        fireEvent.blur(fontInput);
        expect(fontInput.value).toBe('16');
    });

    it('keeps the page settings panel collapsed behind the gear button until it is clicked', async () => {
        const user = userEvent.setup();
        render(<App />);

        expect(screen.queryByLabelText('Font size (pt)')).not.toBeInTheDocument();

        const settingsButton = screen.getByRole('button', { name: 'Page settings' });
        expect(settingsButton).toHaveAttribute('aria-pressed', 'false');

        await user.click(settingsButton);
        expect(settingsButton).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByLabelText('Font size (pt)')).toBeInTheDocument();

        await user.click(settingsButton);
        expect(screen.queryByLabelText('Font size (pt)')).not.toBeInTheDocument();
    });

    it('shows a summary of the current page settings even while the panel is collapsed', () => {
        render(<App />);
        expect(screen.getByText('Letter, portrait, 24pt')).toBeInTheDocument();
    });

    it('defaults the preview to the front page only, with no scrolling required to see it', () => {
        render(<App />);

        expect(screen.getByRole('button', { name: 'Front' })).toHaveAttribute('aria-pressed', 'true');
        const preview = document.querySelector('#tracelift-preview')!;
        // Only the front page's line-number groups are present; the back
        // page isn't rendered into the preview at all by default.
        expect(preview.querySelectorAll('g').length).toBeGreaterThan(0);
        expect(Array.from(preview.querySelectorAll('svg'))).toHaveLength(1);
    });

    it('marks the active editor/calibration mode with aria-pressed', async () => {
        const user = userEvent.setup();
        render(<App />);

        const editorButton = screen.getByRole('button', { name: 'editor' });
        const calibrationButton = screen.getByRole('button', { name: 'calibration' });
        expect(editorButton).toHaveAttribute('aria-pressed', 'true');
        expect(calibrationButton).toHaveAttribute('aria-pressed', 'false');

        await user.click(calibrationButton);

        expect(editorButton).toHaveAttribute('aria-pressed', 'false');
        expect(calibrationButton).toHaveAttribute('aria-pressed', 'true');
    });

    it('switches the preview between front, back, and side by side', async () => {
        const user = userEvent.setup();
        render(<App />);

        const backTab = screen.getByRole('button', { name: 'Back' });
        expect(backTab).toHaveAttribute('aria-pressed', 'false');
        await user.click(backTab);
        expect(backTab).toHaveAttribute('aria-pressed', 'true');

        const preview = document.querySelector('#tracelift-preview')!;
        const textElements = Array.from(preview.querySelectorAll('text'));
        expect(textElements.some((el) => el.textContent === 'score')).toBe(true);
        // Only the back page is shown in the preview: no front-page
        // line-number labels (the always-rendered, hidden print document
        // has its own <g> elements, so this must stay scoped to preview).
        expect(preview.querySelectorAll('g')).toHaveLength(0);
    });

    it('switches to the calibration page and shows its five sample flaps', async () => {
        const user = userEvent.setup();
        render(<App />);

        await user.click(screen.getByRole('button', { name: 'calibration' }));

        // Scoped to the visible calibration view: the print document also
        // renders the calibration page (hidden via CSS) once in this mode.
        const calibration = document.querySelector('#tracelift-calibration')!;
        expect(calibration).toHaveTextContent('Duplex Calibration');
        expect(calibration).toHaveTextContent('TOP LEFT');
        expect(calibration).toHaveTextContent('CENTER');
        // The regular worksheet editor is gone while in calibration mode.
        expect(screen.queryByLabelText('Source')).not.toBeInTheDocument();
    });

    it('persists the calibrated duplex mode for the current page config to localStorage', async () => {
        const user = userEvent.setup();
        render(<App />);

        await user.click(screen.getByRole('button', { name: 'calibration' }));
        await user.click(screen.getByLabelText(/Short-edge/));

        expect(JSON.parse(localStorage.getItem('tracelift.duplexPreferences')!)).toEqual({
            'letter-portrait': 'short-edge',
        });
    });

    it('reuses the calibrated duplex mode for the worksheet preview, not just the calibration page', async () => {
        const user = userEvent.setup();
        render(<App />);

        await user.click(screen.getByRole('button', { name: 'Back' }));
        // The editor subtree unmounts/remounts when switching modes, so
        // #tracelift-preview must be re-queried after switching back
        // rather than reusing a reference to the (now detached) old node.
        const longEdgeX = document
            .querySelector('#tracelift-preview')
            ?.querySelector('text[data-flap-id]')
            ?.getAttribute('x');

        await user.click(screen.getByRole('button', { name: 'calibration' }));
        await user.click(screen.getByLabelText(/Short-edge/));
        await user.click(screen.getByRole('button', { name: 'editor' }));
        await user.click(screen.getByRole('button', { name: 'Back' }));

        const shortEdgeX = document
            .querySelector('#tracelift-preview')
            ?.querySelector('text[data-flap-id]')
            ?.getAttribute('x');

        // Long-edge mirrors x; short-edge only mirrors y. If the worksheet
        // preview picked up the calibrated short-edge mode, its back
        // label's x should now match the front flap's x instead of the
        // long-edge-mirrored position.
        expect(shortEdgeX).not.toBe(longEdgeX);
    });

    it('warns on the calibration page when the font size is too large for a right-aligned sample flap to fit', () => {
        render(<App />);

        openSettings();
        const fontInput = screen.getByLabelText('Font size (pt)');
        // "Duplex Calibration" at 72pt on Letter portrait is wider than the
        // content area, so the calibration page should warn before printing.
        fireEvent.change(fontInput, { target: { value: '72' } });
        fireEvent.blur(fontInput);

        fireEvent.click(screen.getByRole('button', { name: 'calibration' }));

        expect(screen.getByRole('alert')).toHaveTextContent("don't fit within the page margins");
    });
});
