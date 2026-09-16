import { Textarea } from '@/components/ui/textarea';

interface WorksheetEditorProps {
    source: string;
    onChange: (source: string) => void;
}

export function WorksheetEditor({ source, onChange }: WorksheetEditorProps) {
    return (
        <div className="flex h-full flex-col gap-2">
            <label htmlFor="tracelift-source" className="text-muted-foreground text-sm font-medium">
                Source
            </label>
            <Textarea
                id="tracelift-source"
                className="min-h-[300px] flex-1 resize-none font-mono text-sm"
                value={source}
                onChange={(event) => onChange(event.target.value)}
                spellCheck={false}
            />
        </div>
    );
}
