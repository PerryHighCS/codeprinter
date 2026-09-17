import { getPageDimensions } from '../lib/pageGeometry';
import type { PageSettings } from '../types/settings';
import type { DuplexMode } from '../lib/duplexTransform';

interface PrintReminderProps {
    settings: PageSettings;
    duplexMode: DuplexMode;
}

const ORIENTATION_LABEL: Record<PageSettings['orientation'], string> = {
    portrait: 'Portrait',
    landscape: 'Landscape',
};

const DUPLEX_LABEL: Record<DuplexMode, string> = {
    'long-edge': 'Long-edge duplex',
    'short-edge': 'Short-edge duplex',
};

/**
 * Browser and printer settings can't be fully forced from CSS, so this
 * reminds the teacher what to select in the print dialog to get the
 * physical dimensions the worksheet was generated for.
 */
export function PrintReminder({ settings, duplexMode }: PrintReminderProps) {
    const { widthIn, heightIn } = getPageDimensions(settings);

    return (
        <div className="text-muted-foreground rounded-md border px-3 py-2 text-xs">
            <p className="text-foreground font-medium">Worksheet format</p>
            <p>
                {widthIn} × {heightIn} in, {ORIENTATION_LABEL[settings.orientation]}, {DUPLEX_LABEL[duplexMode]}
            </p>
            <p className="mt-1">
                Recommended printer settings: <strong className="text-foreground">100% / Actual Size</strong>
            </p>
            <p>Do not use: Fit to Page or Shrink to Fit</p>
        </div>
    );
}
