import type { FlapPageData } from '../types/layout';
import { CALIBRATION_TITLE } from '../lib/calibrationLayout';
import { ptToUnits } from '../lib/measureText';
import { flapLabelBaselineY, FLAP_HORIZONTAL_PADDING } from '../lib/flapGeometry';
import { WorksheetPage } from './WorksheetPage';
import { FlapCutGuide } from './FlapCutGuide';

interface CalibrationFrontPageProps {
    layout: FlapPageData;
}

const TITLE_FONT_SCALE = 1.3;

/**
 * The front of the duplex calibration page: a title plus five labeled flap
 * samples at fixed positions (see calibrationLayout.ts), so a teacher can
 * cut one from each area of the page rather than just the corner nearest
 * the hinge, and see whether registration holds across the whole sheet.
 */
export function CalibrationFrontPage({ layout }: CalibrationFrontPageProps) {
    const { geometry, settings, flaps } = layout;
    const fontSize = ptToUnits(settings.fontSizePt);

    return (
        <WorksheetPage geometry={geometry}>
            <text x={geometry.margin} y={geometry.margin + fontSize * TITLE_FONT_SCALE} fontSize={fontSize * TITLE_FONT_SCALE} fontWeight="bold">
                {CALIBRATION_TITLE}
            </text>

            {flaps.map((flap) => (
                <g key={flap.id}>
                    <text x={flap.x + FLAP_HORIZONTAL_PADDING} y={flapLabelBaselineY(flap, fontSize)} fontSize={fontSize}>
                        {flap.label}
                    </text>
                    <FlapCutGuide flap={flap} />
                </g>
            ))}
        </WorksheetPage>
    );
}
