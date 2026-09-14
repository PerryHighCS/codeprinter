import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useState, useEffect } from 'react';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

function getStorageValue(key: string, defaultValue: any) {
    // getting stored value
    const saved = localStorage.getItem(key);
    if (saved === null) return defaultValue;

    try {
        return JSON.parse(saved);
    } catch {
        return defaultValue;
    }
}

export const useLocalStorage = (key: string, defaultValue: any) => {
    const [value, setValue] = useState(() => {
        return getStorageValue(key, defaultValue);
    });

    useEffect(() => {
        // storing input name
        localStorage.setItem(key, JSON.stringify(value));
    }, [key, value]);

    return [value, setValue];
};
