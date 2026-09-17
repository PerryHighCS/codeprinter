import type { OverflowInfo } from '../types/layout';

interface OverflowWarningProps {
    overflow: OverflowInfo;
}

export function OverflowWarning({ overflow }: OverflowWarningProps) {
    if (overflow.fits) {
        return null;
    }

    return (
        <div
            role="alert"
            className="border-destructive bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
        >
            <p className="font-medium">This program does not fit on the selected page.</p>
            {overflow.overflowLines > 0 && (
                <p>
                    Overflow: {overflow.overflowLines} line{overflow.overflowLines === 1 ? '' : 's'} past the
                    bottom margin
                </p>
            )}
            {overflow.overflowsHorizontally && <p>The title or one or more lines run past the right margin.</p>}
            <p className="mt-1">
                Try reducing the font size, reducing the line spacing, using landscape orientation, or
                using 11 × 17 paper.
            </p>
        </div>
    );
}
