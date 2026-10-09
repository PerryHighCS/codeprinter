import type { CodeToken, ProgramDocument, ProgramLine } from '../types/worksheet';
import { DEFAULT_TAB_WIDTH } from './persistedState';

const TITLE_PATTERN = /^Title:\s*(.*)$/;
const FLAP_PATTERN = /\[\[(.*?)\]\]/g;

/**
 * Parses TraceLift's minimal authoring syntax into a ProgramDocument.
 *
 * Blank lines are not numbered and do not appear in the output; the visual
 * spacing between lines on the worksheet is a rendering concern, not a
 * parsing one. The first "Title:" line found is consumed as the document
 * title and excluded from line numbering. Tabs are expanded to spaces at
 * tabWidth-column tab stops.
 */
export function parseWorksheet(source: string, tabWidth: number = DEFAULT_TAB_WIDTH): ProgramDocument {
    const rawLines = source.split(/\r\n|\r|\n/);

    let title = '';
    let titleLineIndex = -1;

    for (let i = 0; i < rawLines.length; i++) {
        const match = TITLE_PATTERN.exec(rawLines[i]);
        if (match) {
            title = match[1].trim();
            titleLineIndex = i;
            break;
        }
    }

    const lines: ProgramLine[] = [];
    let lineNumber = 0;

    for (let i = 0; i < rawLines.length; i++) {
        if (i === titleLineIndex) {
            continue;
        }

        const rawLine = expandTabs(rawLines[i], tabWidth);
        if (rawLine.trim().length === 0) {
            continue;
        }

        lineNumber += 1;
        lines.push({
            number: lineNumber,
            tokens: tokenizeLine(rawLine, lineNumber),
        });
    }

    return { title, lines };
}

/**
 * Replaces tabs with spaces up to the next tab stop. Layout measures every
 * character as one monospace cell, so a tab must become real spaces or the
 * rendered indentation won't match the space reserved for it.
 */
function expandTabs(text: string, tabWidth: number): string {
    let result = '';
    for (const char of text) {
        result += char === '\t' ? ' '.repeat(tabWidth - (result.length % tabWidth)) : char;
    }
    return result;
}

function tokenizeLine(text: string, lineNumber: number): CodeToken[] {
    const tokens: CodeToken[] = [];
    let cursor = 0;
    let flapIndex = 0;

    FLAP_PATTERN.lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = FLAP_PATTERN.exec(text)) !== null) {
        const [fullMatch, variableName] = match;
        const matchStart = match.index;

        if (matchStart > cursor) {
            tokens.push({ type: 'text', text: text.slice(cursor, matchStart) });
        }

        flapIndex += 1;
        tokens.push({
            type: 'flap',
            text: variableName.trim(),
            id: `line-${lineNumber}-flap-${flapIndex}`,
        });

        cursor = matchStart + fullMatch.length;
    }

    if (cursor < text.length) {
        tokens.push({ type: 'text', text: text.slice(cursor) });
    }

    return tokens;
}
