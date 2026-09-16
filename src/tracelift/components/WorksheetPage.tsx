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
        >
            {children}
        </svg>
    );
}
