import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { Orientation, PageSettings, PaperSize } from '../types/settings';

interface PageSettingsPanelProps {
    settings: PageSettings;
    onChange: (settings: PageSettings) => void;
}

const FIELD_CLASS =
    'border-input bg-background ring-offset-background focus-visible:ring-ring h-10 rounded-md border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-offset-1';

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted-foreground">{label}</span>
            {children}
        </label>
    );
}

// Numeric fields flow straight into SVG geometry and print CSS, so a
// cleared field or a value below the field's physical minimum (Number()
// coercion doesn't respect the `min` attribute) must not reach onChange;
// falling back to the field's minimum keeps the layout renderable.
function parseBoundedNumber(rawValue: string, min: number): number {
    const parsed = Number(rawValue);
    return Number.isFinite(parsed) && parsed >= min ? parsed : min;
}

export function PageSettingsPanel({ settings, onChange }: PageSettingsPanelProps) {
    const update = (patch: Partial<PageSettings>) => onChange({ ...settings, ...patch });

    return (
        <div className="flex flex-wrap items-end gap-4">
            <Field label="Paper">
                <select
                    className={FIELD_CLASS}
                    value={settings.paperSize}
                    onChange={(event) => update({ paperSize: event.target.value as PaperSize })}
                >
                    <option value="letter">Letter</option>
                    <option value="tabloid">11 × 17</option>
                </select>
            </Field>

            <Field label="Orientation">
                <select
                    className={FIELD_CLASS}
                    value={settings.orientation}
                    onChange={(event) => update({ orientation: event.target.value as Orientation })}
                >
                    <option value="portrait">Portrait</option>
                    <option value="landscape">Landscape</option>
                </select>
            </Field>

            <Field label="Font size (pt)">
                <input
                    type="number"
                    className={cn(FIELD_CLASS, 'w-24')}
                    value={settings.fontSizePt}
                    min={8}
                    step={1}
                    onChange={(event) => update({ fontSizePt: parseBoundedNumber(event.target.value, 8) })}
                />
            </Field>

            <Field label="Line spacing">
                <input
                    type="number"
                    className={cn(FIELD_CLASS, 'w-24')}
                    value={settings.lineSpacing}
                    min={1}
                    step={0.1}
                    onChange={(event) => update({ lineSpacing: parseBoundedNumber(event.target.value, 1) })}
                />
            </Field>

            <Field label="Margin (in)">
                <input
                    type="number"
                    className={cn(FIELD_CLASS, 'w-24')}
                    value={settings.marginIn}
                    min={0.25}
                    step={0.05}
                    onChange={(event) => update({ marginIn: parseBoundedNumber(event.target.value, 0.25) })}
                />
            </Field>
        </div>
    );
}
