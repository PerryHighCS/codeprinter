import type { FlapLayout, FlapPageData } from '../types/layout';
import type { PageSettings } from '../types/settings';
import { createPageGeometry } from './pageGeometry';
import { measureTokenWidth, ptToUnits } from './measureText';
import { FLAP_HORIZONTAL_PADDING, FLAP_VERTICAL_PADDING } from './flapGeometry';

type HorizontalAlign = 'left' | 'center' | 'right';
type VerticalAlign = 'top' | 'center' | 'bottom';

interface CalibrationSpot {
    id: string;
    label: string;
    hAlign: HorizontalAlign;
    vAlign: VerticalAlign;
}

const TITLE_FONT_SCALE = 1.3;
const TITLE_GAP_LINES = 1.5;
export const CALIBRATION_TITLE = 'Duplex Calibration';

const CALIBRATION_SPOTS: CalibrationSpot[] = [
    { id: 'cal-top-left', label: 'TOP LEFT', hAlign: 'left', vAlign: 'top' },
    { id: 'cal-top-right', label: 'TOP RIGHT', hAlign: 'right', vAlign: 'top' },
    { id: 'cal-center', label: 'CENTER', hAlign: 'center', vAlign: 'center' },
    { id: 'cal-bottom-left', label: 'BOTTOM LEFT', hAlign: 'left', vAlign: 'bottom' },
    { id: 'cal-bottom-right', label: 'BOTTOM RIGHT', hAlign: 'right', vAlign: 'bottom' },
];

/**
 * Builds a page of sample flaps at five fixed positions (the four corners
 * of the content area, plus center) rather than deriving positions from
 * code, so a teacher can print it duplex, cut a sample or two, and see
 * whether the back registers correctly across the page, not just in one
 * spot.
 */
export function buildCalibrationLayout(settings: PageSettings): FlapPageData {
    const geometry = createPageGeometry(settings);
    const fontSize = ptToUnits(settings.fontSizePt);

    // Leave the same title clearance layoutWorksheet.ts does, so the "top"
    // samples don't sit under the "Duplex Calibration" heading.
    const titleFontSize = fontSize * TITLE_FONT_SCALE;
    const contentTop = geometry.margin + titleFontSize * TITLE_GAP_LINES;
    const contentBottom = geometry.margin + geometry.contentHeight;
    const contentHeight = contentBottom - contentTop;

    const flaps: FlapLayout[] = CALIBRATION_SPOTS.map(({ id, label, hAlign, vAlign }) => {
        const textWidth = measureTokenWidth(label, settings.fontSizePt);
        const width = textWidth + FLAP_HORIZONTAL_PADDING * 2;
        const height = fontSize + FLAP_VERTICAL_PADDING * 2;

        const x =
            hAlign === 'left'
                ? geometry.margin
                : hAlign === 'right'
                  ? geometry.margin + geometry.contentWidth - width
                  : geometry.margin + geometry.contentWidth / 2 - width / 2;

        const y =
            vAlign === 'top'
                ? contentTop
                : vAlign === 'bottom'
                  ? contentTop + contentHeight - height
                  : contentTop + contentHeight / 2 - height / 2;

        return { id, label, x, y, width, height };
    });

    return { geometry, settings, flaps };
}

/** Returns whether the calibration heading fits within the printable content area. */
export function calibrationTitleFitsWithinPage(layout: FlapPageData): boolean {
    const titleWidth = measureTokenWidth(CALIBRATION_TITLE, layout.settings.fontSizePt * TITLE_FONT_SCALE);
    return layout.geometry.margin + titleWidth <= layout.geometry.margin + layout.geometry.contentWidth;
}

/** Returns whether any two calibration flap boxes intersect. */
export function calibrationFlapsOverlap(layout: FlapPageData): boolean {
    return layout.flaps.some((flap, index) =>
        layout.flaps.slice(index + 1).some(
            (other) =>
                flap.x < other.x + other.width &&
                flap.x + flap.width > other.x &&
                flap.y < other.y + other.height &&
                flap.y + flap.height > other.y,
        ),
    );
}
