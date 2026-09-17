import type { ProgramDocument } from '../types/worksheet';
import type { PageSettings } from '../types/settings';
import type { LayoutLine, LayoutToken, WorksheetLayout } from '../types/layout';
import { createPageGeometry } from './pageGeometry';
import { measureTokenWidth, ptToUnits } from './measureText';
import { computeFlapLayouts, FLAP_HORIZONTAL_PADDING, FLAP_MARGIN, FLAP_VERTICAL_PADDING } from './flapGeometry';

const TITLE_FONT_SCALE = 1.3;
const TITLE_GAP_LINES = 1.5;
const TEXT_DESCENT_RATIO = 0.2;

export function layoutWorksheet(doc: ProgramDocument, settings: PageSettings): WorksheetLayout {
    const fontSize = ptToUnits(settings.fontSizePt);
    const lineNumberWidth = measureTokenWidth(String(Math.max(1, doc.lines.length)), settings.fontSizePt);
    // A gutter sized to just fit the widest number reads as part of the
    // code itself (e.g. "1score"), since there's no visible separation.
    // Half an em of padding on each side of a rule line gives the number
    // room to breathe and makes the boundary between it and the code
    // unambiguous.
    const lineNumberGutterPadding = fontSize * 0.6;
    const geometry = {
        ...createPageGeometry(settings),
        lineNumberGutter: lineNumberWidth + lineNumberGutterPadding * 2,
    };
    const lineNumberRuleX = geometry.margin + lineNumberWidth + lineNumberGutterPadding;

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
    const firstLineHasFlap = doc.lines[0]?.tokens.some((token) => token.type === 'flap') ?? false;
    const codeStartY = doc.title
        ? titleBaselineY + lineHeight * TITLE_GAP_LINES
        : geometry.margin + (firstLineHasFlap ? fontSize * 0.8 + FLAP_VERTICAL_PADDING : fontSize);
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

    const flaps = computeFlapLayouts(lines);

    const contentBottom = geometry.margin + geometry.contentHeight;
    // Flaps and ordinary glyphs extend below their baselines. Checking only
    // baselines can therefore report a fit while a cut guide or descender is
    // clipped by the print page.
    const lowestContentEdge = Math.max(
        doc.title ? titleBaselineY + titleFontSize * TEXT_DESCENT_RATIO : -Infinity,
        lines.length > 0 ? lines[lines.length - 1].baselineY + fontSize * TEXT_DESCENT_RATIO : -Infinity,
        ...flaps.map((flap) => flap.y + flap.height),
    );
    const overflowAmount = Math.max(0, lowestContentEdge - contentBottom);
    const overflowLines = overflowAmount > 0 ? Math.ceil(overflowAmount / lineHeight) : 0;

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
        lineNumberRuleX,
    };
}
