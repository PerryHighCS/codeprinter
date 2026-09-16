import type { ProgramDocument } from '../types/worksheet';
import type { PageSettings } from '../types/settings';
import type { LayoutLine, LayoutToken, WorksheetLayout } from '../types/layout';
import { createPageGeometry } from './pageGeometry';
import { measureTokenWidth, ptToUnits } from './measureText';

const TITLE_FONT_SCALE = 1.3;
const TITLE_GAP_LINES = 1.5;

export function layoutWorksheet(doc: ProgramDocument, settings: PageSettings): WorksheetLayout {
    const geometry = createPageGeometry(settings);
    const fontSize = ptToUnits(settings.fontSizePt);
    const lineHeight = fontSize * settings.lineSpacing;

    const titleFontSize = fontSize * TITLE_FONT_SCALE;
    const titleBaselineY = geometry.margin + titleFontSize;
    const codeStartY = titleBaselineY + lineHeight * TITLE_GAP_LINES;
    const codeStartX = geometry.margin + geometry.lineNumberGutter;

    const lines: LayoutLine[] = doc.lines.map((line, index) => {
        const baselineY = codeStartY + index * lineHeight;
        let cursorX = codeStartX;

        const tokens: LayoutToken[] = line.tokens.map((token) => {
            const width = measureTokenWidth(token.text, settings.fontSizePt);
            const layoutToken: LayoutToken = { token, x: cursorX, width };
            cursorX += width;
            return layoutToken;
        });

        return { number: line.number, baselineY, fontSize, tokens };
    });

    const contentBottom = geometry.margin + geometry.contentHeight;
    const lastLineBottom = lines.length > 0 ? lines[lines.length - 1].baselineY : codeStartY;
    const overflowAmount = Math.max(0, lastLineBottom - contentBottom);
    const overflowLines = overflowAmount > 0 ? Math.ceil(overflowAmount / lineHeight) : 0;

    return {
        geometry,
        settings,
        title: { x: geometry.margin, y: titleBaselineY, text: doc.title, fontSize: titleFontSize },
        lines,
        overflow: { fits: overflowLines === 0, overflowLines },
    };
}
