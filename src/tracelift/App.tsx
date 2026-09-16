import { useMemo, useState } from 'react';
import { cn, useLocalStorage } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { parseWorksheet } from './lib/parseWorksheet';
import { layoutWorksheet } from './lib/layoutWorksheet';
import { applyPreset, getPreset } from './lib/presets';
import { buildCalibrationLayout } from './lib/calibrationLayout';
import { getDuplexMode, withDuplexMode, type DuplexPreferences } from './lib/duplexPreferences';
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

    const [source, setSource] = useLocalStorage('tracelift.source', DEFAULT_SOURCE) as [
        string,
        (value: string) => void,
    ];
    const [settings, setSettings] = useLocalStorage('tracelift.pageSettings', DEFAULT_SETTINGS) as [
        PageSettings,
        (value: PageSettings) => void,
    ];
    const [duplexPreferences, setDuplexPreferences] = useLocalStorage('tracelift.duplexPreferences', {}) as [
        DuplexPreferences,
        (value: DuplexPreferences) => void,
    ];

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

            <div className="bg-background text-foreground flex h-full min-h-screen flex-col gap-4 p-4 print:hidden">
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

                <PageSettingsPanel settings={settings} onChange={handleSettingsChange} />

                <div className="flex flex-wrap items-start gap-4">
                    <Button type="button" onClick={() => window.print()}>
                        Print {mode === 'calibration' ? 'Calibration Page' : 'Worksheet'}
                    </Button>
                    <PrintReminder settings={settings} duplexMode={duplexMode} />
                </div>

                {mode === 'editor' ? (
                    <>
                        <OverflowWarning overflow={layout.overflow} />
                        <div className="grid flex-1 grid-cols-1 gap-4 lg:grid-cols-2">
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
