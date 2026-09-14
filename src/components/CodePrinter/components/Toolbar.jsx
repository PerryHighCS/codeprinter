import { useState } from 'react';
import { FontDropdown } from './FontDropdown.jsx';
import { ListDropdown } from './ListDropdown.jsx';
import { LanguageList } from './LanguageList.jsx';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';

export const Toolbar = ({
    fontList,
    defaultFont,
    fontSizes,
    defaultSize,
    themes,
    defaultTheme,
    languageList,
    defaultLanguage,
    showLineNumbers,
    onFontChange,
    onSizeChange,
    onThemeChange,
    onShowLineNumbersChange,
    onLanguageChange,
    onPreviewChange,
    onPrint,
}) => {
    const [themeName, setThemeName] = useState(defaultTheme);
    const [preview, setPreview] = useState(false);

    const handleThemeChange = (themeName) => {
        setThemeName(themeName);
        if (onThemeChange) onThemeChange(themeName);
    };

    const handlePreviewChange = (newVal) => {
        setPreview(newVal);
        if (onPreviewChange) onPreviewChange(newVal);
    };

    return (
        <nav className="flex max-h-max flex-wrap items-center bg-gray-500 p-3 align-middle">
            <div className="flex flex-wrap items-center justify-start gap-3 align-middle">
                <FontDropdown
                    fontList={fontList}
                    defaultFont={defaultFont}
                    onChange={onFontChange}
                ></FontDropdown>
                <ListDropdown
                    options={fontSizes}
                    defaultItem={defaultSize}
                    onChange={onSizeChange}
                    caption="Font Size"
                ></ListDropdown>
                <ListDropdown
                    options={themes}
                    defaultItem={themeName}
                    onChange={handleThemeChange}
                    caption="Theme"
                ></ListDropdown>
                <LanguageList
                    options={languageList}
                    defaultItem={defaultLanguage}
                    onChange={onLanguageChange}
                ></LanguageList>
                <label className="block">
                    <Checkbox
                        className="align-middle"
                        checked={showLineNumbers}
                        onCheckedChange={onShowLineNumbersChange}
                    />
                    &nbsp;Line Numbers
                </label>
            </div>
            <div className="ml-auto flex justify-end gap-3">
                <Toggle
                    className="border"
                    pressed={preview}
                    onPressedChange={handlePreviewChange}
                >
                    Preview
                </Toggle>
                <Button variant="outline" onClick={onPrint}>
                    Print
                </Button>
            </div>
        </nav>
    );
};

export default Toolbar;
