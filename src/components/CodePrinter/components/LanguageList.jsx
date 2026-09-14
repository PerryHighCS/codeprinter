import * as React from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';

export const LanguageList = ({ options, defaultItem, onChange }) => {
    const [open, setOpen] = React.useState(false);
    const [value, setValue] = React.useState(defaultItem);

    const handleChange = (newVal) => {
        setValue(newVal);
        if (onChange) onChange(newVal);
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="justify-between"
                >
                    {value ? 'Language: ' + value : 'Select language...'}
                    {/*<ChevronsUpDown className="opacity-50" />*/}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[200px] p-0">
                <Command>
                    <CommandInput placeholder="Search languages..." />
                    <CommandList>
                        <CommandEmpty>Language not found.</CommandEmpty>
                        <CommandGroup>
                            {options.map((language) => (
                                <CommandItem
                                    key={language}
                                    value={language}
                                    onSelect={(newValue) => {
                                        handleChange(newValue);
                                        setOpen(false);
                                    }}
                                >
                                    {language}
                                    <Check
                                        className={cn(
                                            'ml-auto',
                                            value === language
                                                ? 'opacity-100'
                                                : 'opacity-0',
                                        )}
                                    />
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
};
