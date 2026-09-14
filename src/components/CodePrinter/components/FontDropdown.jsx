import { useState } from 'react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { Button } from '@/components/ui/button';

export const FontDropdown = ({ defaultFont, fontList, onChange }) => {
    const [font, setFont] = useState(defaultFont ? defaultFont : 'Inconsolata');

    const handleChange = (font) => {
        setFont(font);
        if (onChange) onChange(font);
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline">
                    <div style={{ textAlign: 'center' }}>
                        Font: <span style={{ fontFamily: font }}>{font}</span>
                    </div>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
                {fontList.map((item, index) => (
                    <DropdownMenuItem
                        key={item}
                        onClick={() => handleChange(item)}
                    >
                        <span style={{ fontFamily: item }}>{item}</span>
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

export default FontDropdown;
