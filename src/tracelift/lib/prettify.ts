const TITLE_PATTERN = /^Title:.*$/m;
const FLAP_PATTERN = /\[\[(.*?)\]\]/g;

/**
 * Formats a worksheet source's code with Prettier, preserving the parts of
 * TraceLift's authoring syntax that Prettier doesn't understand:
 *
 * - The "Title: ..." line isn't JavaScript, so it's set aside before
 *   formatting and reattached verbatim afterward.
 * - A `[[variable]]` flap marker isn't valid JS either. Each occurrence is
 *   swapped for a unique placeholder identifier (valid anywhere an
 *   identifier can appear) before formatting, then swapped back to its
 *   original `[[variable]]` text afterward.
 *
 * Throws if the code (with placeholders substituted in) isn't valid
 * JavaScript. Callers should catch this and leave the source untouched.
 */
export async function prettifySource(source: string): Promise<string> {
    const titleMatch = TITLE_PATTERN.exec(source);
    const titleLine = titleMatch?.[0] ?? null;
    const codeSource = titleMatch
        ? (source.slice(0, titleMatch.index) + source.slice(titleMatch.index + titleLine!.length)).replace(
              /^\s+/,
              '',
          )
        : source;

    // The placeholder prefix is salted so it can't collide with an
    // identifier the user's own code already contains; a fixed prefix would
    // let a source containing e.g. `__tracelift_flap_0__` get corrupted on
    // restore.
    let salt = Math.random().toString(36).slice(2);
    while (codeSource.includes(salt)) {
        salt = Math.random().toString(36).slice(2);
    }
    const placeholderPrefix = `__tracelift_flap_${salt}_`;

    const placeholders: string[] = [];
    const codeWithPlaceholders = codeSource.replace(FLAP_PATTERN, (fullMatch) => {
        const placeholder = `${placeholderPrefix}${placeholders.length}__`;
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
    });

    const restored = placeholders.reduce(
        (text, original, index) => text.split(`${placeholderPrefix}${index}__`).join(original),
        formatted,
    );

    return titleLine ? `${titleLine}\n\n${restored}` : restored;
}
