import type { ProgramDocument } from '../types/worksheet';
import type { PageSettings } from '../types/settings';
import type { LayoutLine, LayoutToken, WorksheetLayout } from '../types/layout';
import { createPageGeometry } from './pageGeometry';
import { measureTokenWidth, ptToUnits } from './measureText';
import { computeFlapLayouts, FLAP_HORIZONTAL_PADDING, FLAP_MARGIN, FLAP_VERTICAL_PADDING } from './flapGeometry';

const TITLE_FONT_SCALE = 1.3;
const TITLE_GAP_LINES = 1.5;

export function layoutWorksheet(doc: ProgramDocument, settings: PageSettings): WorksheetLayout {
    const geometry = createPageGeometry(settings);
    const fontSize = ptToUnits(settings.fontSizePt);

    // Flaps are padded rectangles, not just their text, so lines must be at
    // least a flap's full height apart (plus a margin) or two flaps on
    // adjacent lines could touch or overlap regardless of the chosen line
    // spacing.
    const lineHeight = Math.max(
        fontSize * settings.lineSpacing,
        fontSize + (FLAP_VERTICAL_PADDING + FLAP_MARGIN) * 2,
    );

    // A flap's top edge is its hinge: the student lifts it by rotating it
    // up and out of the page, so the space directly above a flap-bearing
    // line needs to be clear, not just non-overlapping. Reserve a full
    // extra flap-height of gap above any line with a flap, on top of the
    // ordinary line spacing, so there's room for it to swing open.
    const flapBoxHeight = fontSize + FLAP_VERTICAL_PADDING * 2;

    const titleFontSize = fontSize * TITLE_FONT_SCALE;
    const titleBaselineY = geometry.margin + titleFontSize;
    const codeStartY = titleBaselineY + lineHeight * TITLE_GAP_LINES;
    const codeStartX = geometry.margin + geometry.lineNumberGutter;

    const lines: LayoutLine[] = [];
    let cursorY = codeStartY;

    for (const line of doc.lines) {
        const hasFlap = line.tokens.some((token) => token.type === 'flap');

        if (lines.length > 0) {
            cursorY += lineHeight + (hasFlap ? flapBoxHeight : 0);
        }

        let cursorX = codeStartX;
        const tokens: LayoutToken[] = line.tokens.map((token) => {
            const textWidth = measureTokenWidth(token.text, settings.fontSizePt);

            if (token.type === 'flap') {
                // Reserve the padded flap's full slot in the line, plus a
                // margin on each side, so its box neither overlaps the text
                // on either side of it nor sits flush against it.
                const inset = FLAP_HORIZONTAL_PADDING + FLAP_MARGIN;
                const layoutToken: LayoutToken = { token, x: cursorX + inset, width: textWidth };
                cursorX += textWidth + inset * 2;
                return layoutToken;
            }

            const layoutToken: LayoutToken = { token, x: cursorX, width: textWidth };
            cursorX += textWidth;
            return layoutToken;
        });

        lines.push({ number: line.number, baselineY: cursorY, fontSize, tokens });
    }

    const contentBottom = geometry.margin + geometry.contentHeight;
    const lastLineBottom = lines.length > 0 ? lines[lines.length - 1].baselineY : codeStartY;
    const overflowAmount = Math.max(0, lastLineBottom - contentBottom);
    const overflowLines = overflowAmount > 0 ? Math.ceil(overflowAmount / lineHeight) : 0;

    const flaps = computeFlapLayouts(lines);

    // A long code line (or a flap on one) can run past the right margin
    // even when every line fits vertically; the print CSS clips that
    // silently, so it has to be checked and surfaced separately from the
    // vertical overflow above.
    const contentRight = geometry.margin + geometry.contentWidth;
    const rightEdges = [
        geometry.margin + measureTokenWidth(doc.title, settings.fontSizePt * TITLE_FONT_SCALE),
        ...lines.flatMap((line) => line.tokens.map((token) => token.x + token.width)),
        ...flaps.map((flap) => flap.x + flap.width),
    ];
    const overflowsHorizontally = rightEdges.some((rightEdge) => rightEdge > contentRight);

    return {
        geometry,
        settings,
        title: { x: geometry.margin, y: titleBaselineY, text: doc.title, fontSize: titleFontSize },
        lines,
        flaps,
        overflow: {
            fits: overflowLines === 0 && !overflowsHorizontally,
            overflowLines,
            overflowsHorizontally,
        },
    };
}
