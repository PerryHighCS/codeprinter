import { useMemo } from 'react';
import { useLocalStorage } from '@/lib/utils';
import { parseWorksheet } from './lib/parseWorksheet';
import { layoutWorksheet } from './lib/layoutWorksheet';
import { applyPreset, getPreset } from './lib/presets';
import type { PageSettings } from './types/settings';
import type { DuplexMode } from './lib/duplexTransform';
import { WorksheetEditor } from './components/WorksheetEditor';
import { PageSettingsPanel } from './components/PageSettingsPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { OverflowWarning } from './components/OverflowWarning';

const DEFAULT_SOURCE = `Title: Round 4

score = 3;
score = [[score]] + 10;
score = [[score]] * 2;
score = [[score]] - 4;
`;

const DEFAULT_SETTINGS: PageSettings = {
    paperSize: 'letter',
    orientation: 'portrait',
    ...getPreset('letter', 'portrait'),
};

/**
 * Duplex mode selection is a Phase 7 (calibration) feature. Until then the
 * back preview always assumes long-edge binding.
 */
const DEFAULT_DUPLEX_MODE: DuplexMode = 'long-edge';

export function App() {
    const [source, setSource] = useLocalStorage('tracelift.source', DEFAULT_SOURCE) as [
        string,
        (value: string) => void,
    ];
    const [settings, setSettings] = useLocalStorage('tracelift.pageSettings', DEFAULT_SETTINGS) as [
        PageSettings,
        (value: PageSettings) => void,
    ];

    const document = useMemo(() => parseWorksheet(source), [source]);
    const layout = useMemo(() => layoutWorksheet(document, settings), [document, settings]);

    function handleSettingsChange(nextSettings: PageSettings) {
        const pageConfigChanged =
            nextSettings.paperSize !== settings.paperSize || nextSettings.orientation !== settings.orientation;
        setSettings(pageConfigChanged ? applyPreset(nextSettings) : nextSettings);
    }

    return (
        <div className="bg-background text-foreground flex h-full min-h-screen flex-col gap-4 p-4">
            <header>
                <h1 className="text-lg font-semibold">TraceLift</h1>
                <p className="text-muted-foreground text-sm">
                    Variable tracing flap worksheet generator. Printing and duplex calibration are not
                    implemented yet.
                </p>
            </header>

            <PageSettingsPanel settings={settings} onChange={handleSettingsChange} />

            <OverflowWarning overflow={layout.overflow} />

            <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
                <WorksheetEditor source={source} onChange={setSource} />
                <PreviewPanel layout={layout} duplexMode={DEFAULT_DUPLEX_MODE} />
            </div>
        </div>
    );
}
