import type { ProgramDocument } from '../types/worksheet';
import type { PageSettings } from '../types/settings';
import type { EvaluationWindowLayout, LayoutLine, LayoutToken, WorksheetLayout } from '../types/layout';
import { EVALUATION_HEIGHT, EVALUATION_MIN_WIDTH, EVALUATION_PADDING, MIN_PAPER_BRIDGE } from './evaluationGeometry';
import { createPageGeometry } from './pageGeometry';
import { measureTokenWidth, ptToUnits } from './measureText';
import { computeFlapLayouts, FLAP_HORIZONTAL_PADDING, FLAP_MARGIN, FLAP_VERTICAL_PADDING } from './flapGeometry';

const TITLE_FONT_SCALE = 1.3;
const TITLE_GAP_LINES = 1.5;
const TEXT_DESCENT_RATIO = 0.2;

export function layoutWorksheet(doc: ProgramDocument, settings: PageSettings): WorksheetLayout {
    const fontSize = ptToUnits(settings.fontSizePt);
    const geometry = {
        ...createPageGeometry(settings),
        // Keep the code clear of however wide its largest line number is at
        // the selected font size, plus one blank character cell so the
        // number doesn't read as part of the code ("1function").
        lineNumberGutter: measureTokenWidth(`${Math.max(1, doc.lines.length)} `, settings.fontSizePt),
    };

    // Flaps are padded rectangles, not just their text, so lines must be at
    // least a flap's full height apart (plus a margin) or two flaps on
    // adjacent lines could touch or overlap regardless of the chosen line
    // spacing.
    const lineHeight = Math.max(
        fontSize * settings.lineSpacing,
        fontSize + (FLAP_VERTICAL_PADDING + FLAP_MARGIN) * 2,
    );

    // A flap's top edge is its hinge: the student folds it up and back, so
    // it lies over the space directly above its line. Reserve a full extra
    // flap-height of gap there so a folded flap doesn't hide the line above.
    // Every line gets that gap, not just flap-bearing ones, so the spacing
    // stays even; a worksheet with no flaps keeps the plain spacing.
    const flapBoxHeight = fontSize + FLAP_VERTICAL_PADDING * 2;
    const containsFlap = (tokens: ProgramDocument['lines'][number]['tokens']) =>
        tokens.some((token) => token.type === 'flap' ||
            (token.type === 'evaluation' && token.tokens.some((inner) => inner.type === 'flap')));
    const hasAnyFlap = doc.lines.some((line) => containsFlap(line.tokens));
    const lineStep = lineHeight + (hasAnyFlap ? flapBoxHeight : 0);

    const titleFontSize = fontSize * TITLE_FONT_SCALE;
    const titleBaselineY = geometry.margin + titleFontSize;
    const firstLineHasFlap = containsFlap(doc.lines[0]?.tokens ?? []);
    // A first-line flap folds back toward the title, so it needs the same
    // fold-back room below the title as any other flap gets above it.
    const codeStartY = doc.title
        ? titleBaselineY + lineHeight * TITLE_GAP_LINES + (firstLineHasFlap ? flapBoxHeight : 0)
        : geometry.margin + (firstLineHasFlap ? fontSize * 0.8 + FLAP_VERTICAL_PADDING : fontSize);
    const codeStartX = geometry.margin + geometry.lineNumberGutter;

    const lines: LayoutLine[] = [];
    const evaluationWindows: EvaluationWindowLayout[] = [];
    const errors = [...(doc.errors ?? [])];
    let cursorY = codeStartY;
    let previousWindowBottom = -Infinity;

    for (const line of doc.lines) {
        const hasFlap = containsFlap(line.tokens);

        if (lines.length > 0) {
            cursorY += lineStep;
        }
        // Keep the next line and the full swing of its flaps below any opening.
        cursorY = Math.max(cursorY, previousWindowBottom + MIN_PAPER_BRIDGE +
            (hasFlap ? fontSize * 0.8 + FLAP_VERTICAL_PADDING + flapBoxHeight : fontSize));

        let cursorX = codeStartX;
        const tokens: LayoutToken[] = [];
        const positionToken = (token: LayoutToken['token']): LayoutToken => {
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
        };
        for (const token of line.tokens) {
            if (token.type !== 'evaluation') {
                tokens.push(positionToken(token));
                continue;
            }
            const inner = token.tokens.map(positionToken);
            tokens.push(...inner);
            const startX = inner[0].x;
            const last = inner[inner.length - 1];
            const window: EvaluationWindowLayout = {
                id: token.id,
                expression: token.tokens.map((part) => part.text).join(''),
                x: startX - EVALUATION_PADDING,
                y: cursorY + fontSize * TEXT_DESCENT_RATIO + FLAP_VERTICAL_PADDING + MIN_PAPER_BRIDGE,
                width: Math.max(EVALUATION_MIN_WIDTH, last.x + last.width - startX + EVALUATION_PADDING * 2),
                height: EVALUATION_HEIGHT,
            };
            const prior = evaluationWindows[evaluationWindows.length - 1];
            if (prior && prior.y === window.y && window.x - (prior.x + prior.width) < MIN_PAPER_BRIDGE) {
                errors.push(`Line ${line.number}: evaluation windows need more space between cuts. Split the expressions onto separate lines.`);
            }
            evaluationWindows.push(window);
            previousWindowBottom = window.y + window.height;
        }

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
        ...evaluationWindows.map((window) => window.y + window.height),
    );
    const overflowAmount = Math.max(0, lowestContentEdge - contentBottom);
    const overflowLines = overflowAmount > 0 ? Math.ceil(overflowAmount / lineStep) : 0;

    // A long code line (or a flap on one) can run past the right margin
    // even when every line fits vertically; the print CSS clips that
    // silently, so it has to be checked and surfaced separately from the
    // vertical overflow above.
    const contentRight = geometry.margin + geometry.contentWidth;
    const rightEdges = [
        geometry.margin + measureTokenWidth(doc.title, settings.fontSizePt * TITLE_FONT_SCALE),
        ...lines.flatMap((line) => line.tokens.map((token) => token.x + token.width)),
        ...flaps.map((flap) => flap.x + flap.width),
        ...evaluationWindows.map((window) => window.x + window.width),
    ];
    const overflowsHorizontally = rightEdges.some((rightEdge) => rightEdge > contentRight);

    return {
        geometry,
        settings,
        title: { x: geometry.margin, y: titleBaselineY, text: doc.title, fontSize: titleFontSize },
        lines,
        flaps,
        evaluationWindows,
        errors,
        overflow: {
            fits: overflowLines === 0 && !overflowsHorizontally,
            overflowLines,
            overflowsHorizontally,
        },
    };
}
