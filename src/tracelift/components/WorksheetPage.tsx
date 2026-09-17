import type { ReactNode } from 'react';
import type { PageGeometry } from '../types/layout';

export const CODE_FONT_FAMILY = "'Source Code Pro', 'Courier New', monospace";

interface WorksheetPageProps {
    geometry: PageGeometry;
    children: ReactNode;
}

export function WorksheetPage({ geometry, children }: WorksheetPageProps) {
    return (
        <svg
            width={`${geometry.widthIn}in`}
            height={`${geometry.heightIn}in`}
            viewBox={`0 0 ${geometry.width} ${geometry.height}`}
            fontFamily={CODE_FONT_FAMILY}
            fill="#000000"
            xmlSpace="preserve"
        >
            {/* The worksheet represents a physical printed sheet, so it
                always renders as black ink on white paper regardless of
                the surrounding app's theme. fill is set here so every
                descendant <text> inherits it via normal SVG presentation
                attribute inheritance. */}
            <rect x={0} y={0} width={geometry.width} height={geometry.height} fill="#ffffff" />
            {children}
        </svg>
    );
}
