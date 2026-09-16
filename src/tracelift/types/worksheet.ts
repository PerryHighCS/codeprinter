export interface ProgramDocument {
    title: string;
    lines: ProgramLine[];
}

export interface ProgramLine {
    number: number;
    tokens: CodeToken[];
}

export type CodeToken = TextToken | FlapToken;

export interface TextToken {
    type: 'text';
    text: string;
}

export interface FlapToken {
    type: 'flap';
    text: string;
    id: string;
}
