import type { DuplexMode } from '../lib/duplexTransform';

interface PrintReminderProps {
    duplexMode: DuplexMode;
}

const DUPLEX_LABEL: Record<DuplexMode, string> = {
    'long-edge': 'Long-edge duplex',
    'short-edge': 'Short-edge duplex',
};

/**
 * Browser and printer settings can't be fully forced from CSS, so this
 * reminds the teacher what to select in the print dialog. Paper size and
 * orientation are already shown next to the settings gear button, so this
 * sticks to what's specific to the print dialog itself rather than
 * repeating them.
 */
export function PrintReminder({ duplexMode }: PrintReminderProps) {
    return (
        <div className="text-muted-foreground rounded-md border px-3 py-2 text-xs">
            <p className="text-foreground font-medium">Print settings</p>
            <p>
                {DUPLEX_LABEL[duplexMode]}. Recommended printer settings:{' '}
                <strong className="text-foreground">100% / Actual Size</strong>.
            </p>
            <p>Do not use: Fit to Page or Shrink to Fit</p>
        </div>
    );
}
