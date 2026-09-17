import { useEffect, useState, type ReactNode } from 'react';
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

interface NumberFieldProps {
    label: string;
    value: number;
    min: number;
    step: number;
    onChange: (value: number) => void;
}

// Committing every keystroke straight to `settings` (and thus back into
// this field's own `value` prop) meant clearing the field to retype it
// immediately snapped back to the minimum, so a value could never actually
// be cleared and replaced. A local draft lets the field hold an in-progress
// (even momentarily invalid) string while typing; it's only validated and
// committed to onChange on blur or Enter.
function NumberField({ label, value, min, step, onChange }: NumberFieldProps) {
    const [draft, setDraft] = useState(String(value));

    useEffect(() => {
        setDraft(String(value));
    }, [value]);

    function commit() {
        const bounded = parseBoundedNumber(draft, min);
        setDraft(String(bounded));
        onChange(bounded);
    }

    return (
        <Field label={label}>
            <input
                type="number"
                className={cn(FIELD_CLASS, 'w-24')}
                value={draft}
                min={min}
                step={step}
                onChange={(event) => setDraft(event.target.value)}
                onBlur={commit}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                        event.currentTarget.blur();
                    }
                }}
            />
        </Field>
    );
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

            <NumberField
                label="Font size (pt)"
                value={settings.fontSizePt}
                min={8}
                step={1}
                onChange={(fontSizePt) => update({ fontSizePt })}
            />

            <NumberField
                label="Line spacing"
                value={settings.lineSpacing}
                min={1}
                step={0.1}
                onChange={(lineSpacing) => update({ lineSpacing })}
            />

            <NumberField
                label="Margin (in)"
                value={settings.marginIn}
                min={0.25}
                step={0.05}
                onChange={(marginIn) => update({ marginIn })}
            />
        </div>
    );
}
