import type { WorksheetLayout } from '../types/layout';
import type { DuplexMode } from '../lib/duplexTransform';
import { FrontPage } from './FrontPage';
import { BackPage } from './BackPage';

interface PrintDocumentProps {
    layout: WorksheetLayout;
    duplexMode: DuplexMode;
}

/**
 * Print-only DOM: hidden on screen, shown under @media print via Tailwind's
 * print: variant. Renders the same FrontPage/BackPage components as the
 * on-screen preview, but at their full physical size rather than the
 * preview's responsive scaled-down rendering.
 */
export function PrintDocument({ layout, duplexMode }: PrintDocumentProps) {
    return (
        <div className="print-document hidden print:block">
            <div className="print-page">
                <FrontPage layout={layout} />
            </div>
            <div className="print-page">
                <BackPage layout={layout} duplexMode={duplexMode} />
            </div>
        </div>
    );
}
