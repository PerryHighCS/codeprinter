import { useMemo } from 'react';
import { buildCalibrationLayout } from '../lib/calibrationLayout';
import { flapFitsWithinPage } from '../lib/flapGeometry';
import type { DuplexMode } from '../lib/duplexTransform';
import type { PageSettings } from '../types/settings';
import { CalibrationFrontPage } from './CalibrationFrontPage';
import { BackPage } from './BackPage';
import { RESPONSIVE_SVG_CLASS } from './responsiveSvgClass';

interface CalibrationViewProps {
    settings: PageSettings;
    duplexMode: DuplexMode;
    onDuplexModeChange: (mode: DuplexMode) => void;
}

const DUPLEX_OPTIONS: { value: DuplexMode; label: string }[] = [
    { value: 'long-edge', label: 'Long-edge (flip like a book)' },
    { value: 'short-edge', label: 'Short-edge (flip like a legal pad)' },
];

export function CalibrationView({ settings, duplexMode, onDuplexModeChange }: CalibrationViewProps) {
    const layout = useMemo(() => buildCalibrationLayout(settings), [settings]);
    const overflowsPage = useMemo(
        () => layout.flaps.some((flap) => !flapFitsWithinPage(flap, layout.geometry)),
        [layout],
    );

    return (
        <div id="tracelift-calibration" className="flex flex-1 flex-col gap-4">
            {overflowsPage && (
                <div
                    role="alert"
                    className="border-destructive bg-destructive/10 text-destructive rounded-md border px-3 py-2 text-sm"
                >
                    <p className="font-medium">
                        One or more sample flaps don't fit within the page margins at this font size.
                    </p>
                    <p className="mt-1">Try a smaller font size for calibration.</p>
                </div>
            )}

            <div className="text-muted-foreground text-sm">
                <p>
                    Registration for duplex printing varies by printer and driver, so this page has to be
                    checked once per paper size and orientation, not assumed. To calibrate this page
                    configuration:
                </p>
                <ol className="mt-1 list-decimal space-y-0.5 pl-5">
                    <li>Print this page duplex, using the setting below.</li>
                    <li>Cut one or more of the five sample flaps.</li>
                    <li>Lift each cut flap and check that its label appears directly beneath it.</li>
                    <li>If the labels don't line up, switch the duplex mode below and print again.</li>
                </ol>
            </div>

            <fieldset className="flex flex-col gap-1">
                <legend className="text-sm font-medium">Duplex mode for {settings.paperSize} {settings.orientation}</legend>
                {DUPLEX_OPTIONS.map((option) => (
                    <label key={option.value} className="flex items-center gap-2 text-sm">
                        <input
                            type="radio"
                            name="duplex-mode"
                            value={option.value}
                            checked={duplexMode === option.value}
                            onChange={() => onDuplexModeChange(option.value)}
                        />
                        {option.label}
                    </label>
                ))}
            </fieldset>

            <div className="flex flex-1 gap-4 overflow-auto">
                <div className={RESPONSIVE_SVG_CLASS}>
                    <CalibrationFrontPage layout={layout} />
                </div>
                <div className={RESPONSIVE_SVG_CLASS}>
                    <BackPage layout={layout} duplexMode={duplexMode} />
                </div>
            </div>
        </div>
    );
}
