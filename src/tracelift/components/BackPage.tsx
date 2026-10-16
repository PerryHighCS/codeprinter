import type { FlapPageData } from '../types/layout';
import type { DuplexMode } from '../lib/duplexTransform';
import { transformFlapsForDuplex } from '../lib/duplexTransform';
import { ptToUnits } from '../lib/measureText';
import { WorksheetPage } from './WorksheetPage';
import { BackFlapLabel } from './BackFlapLabel';

interface BackPageProps {
    layout: FlapPageData;
    duplexMode: DuplexMode;
}

export function BackPage({ layout, duplexMode }: BackPageProps) {
    const { geometry, settings, flaps } = layout;
    const backFlaps = transformFlapsForDuplex(flaps, geometry, duplexMode);
    const fontSize = ptToUnits(settings.fontSizePt);
    const title = layout.title;
    const landscape = geometry.width > geometry.height;
    const verticalFlip = duplexMode === 'long-edge' ? landscape : !landscape;

    return (
        <WorksheetPage geometry={geometry}>
            {title?.text && (
                <text x={title.x} y={title.y} fontSize={title.fontSize} fontWeight="bold"
                    data-back-title="true"
                    transform={verticalFlip ? `rotate(180 ${geometry.width / 2} ${geometry.height / 2})` : undefined}>
                    {title.text}
                </text>
            )}
            {backFlaps.map((flap) => (
                <BackFlapLabel key={flap.id} flap={flap} fontSize={fontSize} />
            ))}
        </WorksheetPage>
    );
}
