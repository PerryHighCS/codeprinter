import { useMemo, useState } from 'react';
import { Settings } from 'lucide-react';
import { cn, useLocalStorage } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { parseWorksheet } from './lib/parseWorksheet';
import { layoutWorksheet } from './lib/layoutWorksheet';
import { applyPreset, getPreset } from './lib/presets';
import { PAPER_SIZES } from './lib/pageGeometry';
import { buildCalibrationLayout } from './lib/calibrationLayout';
import { getDuplexMode, withDuplexMode, type DuplexPreferences } from './lib/duplexPreferences';
import { isValidDuplexPreferences, isValidPageSettings, isValidSource } from './lib/persistedState';
import type { PageSettings } from './types/settings';
import type { DuplexMode } from './lib/duplexTransform';
import { WorksheetEditor } from './components/WorksheetEditor';
import { PageSettingsPanel } from './components/PageSettingsPanel';
import { PreviewPanel } from './components/PreviewPanel';
import { OverflowWarning } from './components/OverflowWarning';
import { PrintStyles } from './components/PrintStyles';
import { PrintDocument } from './components/PrintDocument';
import { PrintReminder } from './components/PrintReminder';
import { FrontPage } from './components/FrontPage';
import { BackPage } from './components/BackPage';
import { CalibrationFrontPage } from './components/CalibrationFrontPage';
import { CalibrationView } from './components/CalibrationView';

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

type Mode = 'editor' | 'calibration';

export function App() {
    const [mode, setMode] = useState<Mode>('editor');
    const [settingsOpen, setSettingsOpen] = useState(false);

    const [rawSource, setSource] = useLocalStorage('tracelift.source', DEFAULT_SOURCE) as [
        unknown,
        (value: string) => void,
    ];
    const [rawSettings, setSettings] = useLocalStorage('tracelift.pageSettings', DEFAULT_SETTINGS) as [
        unknown,
        (value: PageSettings) => void,
    ];
    const [rawDuplexPreferences, setDuplexPreferences] = useLocalStorage(
        'tracelift.duplexPreferences',
        {},
    ) as [unknown, (value: DuplexPreferences) => void];

    // A stored value can be well-formed JSON of the wrong shape (e.g. a
    // schema change from a previous version, or a `null` written by hand),
    // which useLocalStorage's JSON.parse guard doesn't catch. Falling back
    // to the default here, rather than trusting the stored value, keeps a
    // bad localStorage entry from crashing the app before it even renders.
    const source = isValidSource(rawSource) ? rawSource : DEFAULT_SOURCE;
    const settings = isValidPageSettings(rawSettings) ? rawSettings : DEFAULT_SETTINGS;
    const duplexPreferences = isValidDuplexPreferences(rawDuplexPreferences) ? rawDuplexPreferences : {};

    const duplexMode = getDuplexMode(duplexPreferences, settings);

    const document = useMemo(() => parseWorksheet(source), [source]);
    const layout = useMemo(() => layoutWorksheet(document, settings), [document, settings]);
    const calibrationLayout = useMemo(() => buildCalibrationLayout(settings), [settings]);

    function handleSettingsChange(nextSettings: PageSettings) {
        const pageConfigChanged =
            nextSettings.paperSize !== settings.paperSize || nextSettings.orientation !== settings.orientation;
        setSettings(pageConfigChanged ? applyPreset(nextSettings) : nextSettings);
    }

    function handleDuplexModeChange(nextMode: DuplexMode) {
        setDuplexPreferences(withDuplexMode(duplexPreferences, settings, nextMode));
    }

    return (
        <>
            <PrintStyles settings={settings} />

            <div className="bg-background text-foreground flex h-screen flex-col gap-4 p-4 print:hidden">
                <header className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                        <h1 className="text-lg font-semibold">TraceLift</h1>
                        <p className="text-muted-foreground text-sm">Variable tracing flap worksheet generator.</p>
                    </div>

                    <div className="flex gap-2">
                        {(['editor', 'calibration'] as const).map((option) => (
                            <button
                                key={option}
                                type="button"
                                aria-pressed={mode === option}
                                className={cn(
                                    'rounded-md border px-3 py-1 text-sm capitalize',
                                    mode === option
                                        ? 'bg-accent text-accent-foreground'
                                        : 'bg-background text-foreground',
                                )}
                                onClick={() => setMode(option)}
                            >
                                {option}
                            </button>
                        ))}
                    </div>
                </header>

                <div className="flex flex-col gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            aria-label="Page settings"
                            aria-pressed={settingsOpen}
                            onClick={() => setSettingsOpen((open) => !open)}
                        >
                            <Settings className="h-4 w-4" />
                        </Button>
                        <span className="text-muted-foreground text-sm">
                            {PAPER_SIZES[settings.paperSize].name}, {settings.orientation}, {settings.fontSizePt}pt
                        </span>
                    </div>

                    {settingsOpen && <PageSettingsPanel settings={settings} onChange={handleSettingsChange} />}
                </div>

                <div className="flex flex-wrap items-start gap-4">
                    <Button type="button" onClick={() => window.print()}>
                        Print {mode === 'calibration' ? 'Calibration Page' : 'Worksheet'}
                    </Button>
                    <PrintReminder settings={settings} duplexMode={duplexMode} />
                </div>

                {mode === 'editor' ? (
                    <>
                        <OverflowWarning overflow={layout.overflow} />
                        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
                            <WorksheetEditor source={source} onChange={setSource} />
                            <PreviewPanel layout={layout} duplexMode={duplexMode} />
                        </div>
                    </>
                ) : (
                    <CalibrationView
                        settings={settings}
                        duplexMode={duplexMode}
                        onDuplexModeChange={handleDuplexModeChange}
                    />
                )}
            </div>

            {mode === 'editor' ? (
                <PrintDocument
                    front={<FrontPage layout={layout} />}
                    back={<BackPage layout={layout} duplexMode={duplexMode} />}
                />
            ) : (
                <PrintDocument
                    front={<CalibrationFrontPage layout={calibrationLayout} />}
                    back={<BackPage layout={calibrationLayout} duplexMode={duplexMode} />}
                />
            )}
        </>
    );
}
