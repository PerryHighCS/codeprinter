import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WorksheetEditor } from './WorksheetEditor';

describe('WorksheetEditor', () => {
    it('renders the current source in the textarea', () => {
        render(<WorksheetEditor source="score = 3;" onChange={vi.fn()} />);
        expect(screen.getByLabelText('Source')).toHaveValue('score = 3;');
    });

    it('calls onChange with the formatted source when Prettify succeeds', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<WorksheetEditor source="score=3;score=[[score]]+1;" onChange={onChange} />);

        await user.click(screen.getByRole('button', { name: 'Prettify' }));

        await waitFor(() => {
            expect(onChange).toHaveBeenCalledWith('score = 3;\nscore = [[score]] + 1;\n');
        });
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('shows an error and leaves the source untouched when the code cannot be formatted', async () => {
        const user = userEvent.setup();
        const onChange = vi.fn();
        render(<WorksheetEditor source="this is not code;;;{" onChange={onChange} />);

        await user.click(screen.getByRole('button', { name: 'Prettify' }));

        await waitFor(() => {
            expect(screen.getByRole('alert')).toHaveTextContent('Could not prettify');
        });
        expect(onChange).not.toHaveBeenCalled();
    });
});
