import { useMemo, useState } from 'react';
import { parseWorksheet } from './lib/parseWorksheet';

const DEFAULT_SOURCE = `Title: Round 4

score = 3;
score = [[score]] + 10;
score = [[score]] * 2;
score = [[score]] - 4;
`;

/**
 * Placeholder shell for the /tracelift route.
 *
 * Only Phase 1 (source parsing) is implemented so far. This view exists to
 * prove the parser end to end while the SVG worksheet renderer, page
 * settings, and print support are built out in later phases.
 */
export function App() {
    const [source, setSource] = useState(DEFAULT_SOURCE);
    const document = useMemo(() => parseWorksheet(source), [source]);

    return (
        <div className="grid h-full min-h-screen grid-cols-2 gap-4 bg-neutral-950 p-4 text-neutral-100">
            <div className="flex flex-col gap-2">
                <h1 className="text-lg font-semibold">TraceLift (work in progress)</h1>
                <p className="text-sm text-neutral-400">
                    Worksheet rendering, page settings, and printing are not implemented yet. This is
                    a Phase 1 checkpoint showing the source parser.
                </p>
                <textarea
                    className="min-h-[300px] flex-1 rounded border border-neutral-700 bg-neutral-900 p-3 font-mono text-sm"
                    value={source}
                    onChange={(event) => setSource(event.target.value)}
                    spellCheck={false}
                />
            </div>
            <div className="flex flex-col gap-2">
                <h2 className="text-sm font-semibold text-neutral-400">Parsed document</h2>
                <pre className="flex-1 overflow-auto rounded border border-neutral-700 bg-neutral-900 p-3 text-xs">
                    {JSON.stringify(document, null, 2)}
                </pre>
            </div>
        </div>
    );
}
