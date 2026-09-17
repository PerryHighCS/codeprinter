import { getPageDimensions } from '../lib/pageGeometry';
import type { PageSettings } from '../types/settings';

interface PrintStylesProps {
    settings: PageSettings;
}

/**
 * Everything static (hiding the app UI, showing the print document) is
 * handled with Tailwind's print: variant directly in JSX, matching the
 * rest of the app's print convention. Only what genuinely depends on the
 * selected paper settings — physical @page size and per-page dimensions —
 * needs to be generated here.
 */
export function PrintStyles({ settings }: PrintStylesProps) {
    const { widthIn, heightIn } = getPageDimensions(settings);

    return (
        <style>{`
            @page {
                size: ${widthIn}in ${heightIn}in;
                margin: 0;
            }

            @media print {
                .print-page {
                    width: ${widthIn}in;
                    height: ${heightIn}in;
                    break-after: page;
                    page-break-after: always;
                    overflow: hidden;
                }

                .print-page:last-child {
                    break-after: auto;
                    page-break-after: auto;
                }
            }
        `}</style>
    );
}
