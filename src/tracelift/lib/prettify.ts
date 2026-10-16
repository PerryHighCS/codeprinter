import { parseWorksheet } from './parseWorksheet';

const TITLE_PATTERN = /^Title:.*$/m;
const MARKER_PATTERN = /\{\{.*?\}\}|\[\[.*?\]\]/g;

/**
 * Formats a worksheet source's code with Prettier, preserving the parts of
 * TraceLift's authoring syntax that Prettier doesn't understand:
 *
 * - The "Title: ..." line isn't JavaScript, so it's set aside before
 *   formatting and reattached verbatim afterward.
 * - Each whole `{{expression}}` region (including its inner flaps) and
 *   remaining standalone `[[variable]]` flap marker is
 *   swapped for a unique placeholder identifier (valid anywhere an
 *   identifier can appear) before formatting, then swapped back to its
 *   original markup afterward. Protecting a whole evaluation keeps its
 *   expression on one source line even when Prettier wraps surrounding code.
 *
 * Throws if the code (with placeholders substituted in) isn't valid
 * JavaScript. Callers should catch this and leave the source untouched.
 */
export async function prettifySource(source: string, tabWidth?: number): Promise<string> {
    const parsed = parseWorksheet(source, tabWidth);
    if (parsed.errors?.length) throw new Error(parsed.errors.join(' '));
    const titleMatch = TITLE_PATTERN.exec(source);
    const titleLine = titleMatch?.[0] ?? null;
    const codeSource = titleMatch
        ? (source.slice(0, titleMatch.index) + source.slice(titleMatch.index + titleLine!.length)).replace(
              /^\s+/,
              '',
          )
        : source;

    // Choose the shortest collision-free identifier prefix. This avoids
    // altering Prettier's line-width decisions with long temporary names
    // while still ensuring restoration cannot touch the user's identifiers.
    const markerCount = [...codeSource.matchAll(MARKER_PATTERN)].length;
    let prefixSuffix = '';
    while (
        Array.from({ length: markerCount }, (_, index) => `_$${prefixSuffix}${index}_`).some((placeholder) =>
            codeSource.includes(placeholder),
        )
    ) {
        prefixSuffix = (Number.parseInt(prefixSuffix || '0', 36) + 1).toString(36);
    }
    const placeholderPrefix = `_$${prefixSuffix}`;

    const placeholders: string[] = [];
    const codeWithPlaceholders = codeSource.replace(MARKER_PATTERN, (fullMatch) => {
        const placeholder = `${placeholderPrefix}${placeholders.length}_`;
        placeholders.push(fullMatch);
        return placeholder;
    });

    // Prettier's babel/estree plugins are large; load them only when
    // Prettify is actually used instead of bundling them into the initial
    // /tracelift chunk every visitor downloads.
    const [{ format }, { default: babelPlugin }, { default: estreePlugin }] = await Promise.all([
        import('prettier/standalone'),
        import('prettier/plugins/babel'),
        import('prettier/plugins/estree'),
    ]);

    const formatted = await format(codeWithPlaceholders, {
        parser: 'babel',
        plugins: [babelPlugin, estreePlugin],
        ...(tabWidth !== undefined && { tabWidth }),
    });

    const restored = placeholders.reduce(
        (text, original, index) => text.split(`${placeholderPrefix}${index}_`).join(original),
        formatted,
    );

    // A formatter must not duplicate, remove, or split a physical mark.
    const restoredMarkers = [...restored.matchAll(MARKER_PATTERN)].map((match) => match[0]);
    if (restoredMarkers.length !== placeholders.length || restoredMarkers.some((marker, index) => marker !== placeholders[index])) {
        throw new Error('Formatting could not preserve the worksheet markers safely.');
    }

    return titleLine ? `${titleLine}\n\n${restored}` : restored;
}
