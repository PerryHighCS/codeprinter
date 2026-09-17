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

    return (
        <WorksheetPage geometry={geometry}>
            {backFlaps.map((flap) => (
                <BackFlapLabel key={flap.id} flap={flap} fontSize={fontSize} />
            ))}
        </WorksheetPage>
    );
}
