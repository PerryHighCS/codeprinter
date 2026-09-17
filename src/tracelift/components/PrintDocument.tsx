import type { ReactNode } from 'react';

interface PrintDocumentProps {
    front: ReactNode;
    back: ReactNode;
}

/**
 * Print-only DOM: hidden on screen, shown under @media print via Tailwind's
 * print: variant. Takes the front/back page content as children rather
 * than owning a specific layout type, so it works for both a regular
 * worksheet (FrontPage/BackPage) and the calibration page
 * (CalibrationFrontPage/BackPage) without a second near-duplicate
 * component. Callers render at full physical size, not the on-screen
 * preview's responsive scaled-down rendering.
 */
export function PrintDocument({ front, back }: PrintDocumentProps) {
    return (
        <div className="print-document hidden print:block">
            <div className="print-page">{front}</div>
            <div className="print-page">{back}</div>
        </div>
    );
}
