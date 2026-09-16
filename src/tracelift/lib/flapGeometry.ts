import { UNITS_PER_INCH } from './pageGeometry';
import type { FlapLayout, LayoutLine } from '../types/layout';

const HORIZONTAL_PADDING_IN = 0.1;
const VERTICAL_PADDING_IN = 0.08;

/**
 * Extra clearance kept clear of any other content beyond the padded box
 * itself, on all sides. Without it the box's own edge sits exactly where
 * the neighboring token starts, so cut lines can end up flush against (or,
 * since text width is only measured/estimated, even crossing through)
 * adjacent characters or an adjacent line's flap.
 */
const MARGIN_IN = 0.05;

/**
 * Approximate fraction of the font size that sits above the text baseline.
 * Used to place the flap's top edge close to the glyph's actual cap height
 * rather than the full em box, since the padded rectangle is meant to hug
 * the printed word.
 */
const ASCENT_RATIO = 0.8;

export const FLAP_HORIZONTAL_PADDING = HORIZONTAL_PADDING_IN * UNITS_PER_INCH;
export const FLAP_VERTICAL_PADDING = VERTICAL_PADDING_IN * UNITS_PER_INCH;
export const FLAP_MARGIN = MARGIN_IN * UNITS_PER_INCH;

/**
 * Walks every line's tokens and produces a padded FlapLayout for each flap
 * token, in document order. The top edge is intentionally excluded from the
 * later cut path (see flapCutPath) so it remains the hinge.
 */
export function computeFlapLayouts(lines: LayoutLine[]): FlapLayout[] {
    const flaps: FlapLayout[] = [];

    for (const line of lines) {
        for (const layoutToken of line.tokens) {
            const { token, x, width } = layoutToken;
            if (token.type !== 'flap') {
                continue;
            }

            flaps.push({
                id: token.id,
                label: token.text,
                x: x - FLAP_HORIZONTAL_PADDING,
                y: line.baselineY - line.fontSize * ASCENT_RATIO - FLAP_VERTICAL_PADDING,
                width: width + FLAP_HORIZONTAL_PADDING * 2,
                height: line.fontSize + FLAP_VERTICAL_PADDING * 2,
            });
        }
    }

    return flaps;
}

/**
 * U-shaped cut guide: left, bottom, right. The top edge is deliberately
 * omitted so it remains attached as the flap's hinge.
 */
export function flapCutPath(flap: FlapLayout): string {
    const { x, y, width, height } = flap;
    return `M ${x} ${y} L ${x} ${y + height} L ${x + width} ${y + height} L ${x + width} ${y}`;
}
