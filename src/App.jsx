import './App.css';
import { CodePrinter } from './components/CodePrinter/CodePrinter.jsx';
import {
    defaultStyle,
    arduinoLight,
    ascetic,
    docco,
    githubGist,
    grayscale,
    idea,
    tomorrow,
    vs,
    xcode,
} from 'react-syntax-highlighter/dist/esm/styles/hljs';

function App() {
    const fontList = [
        'Anonymous Pro',
        'Cousine',
        'Cutive Mono',
        'Fira Mono',
        'IBM Plex Mono',
        'Inconsolata',
        'Nanum Gothic Coding',
        'Nova Mono',
        'Overpass Mono',
        'Oxygen Mono',
        'PT Mono',
        'Roboto Mono',
        'Share Tech Mono',
        'Source Code Pro',
        'Space Mono',
        'Ubuntu Mono',
    ];

    const sizes = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

    const themes = {
        None: null,
        Arduino: arduinoLight,
        Ascetic: ascetic,
        Docco: docco,
        GitHub: githubGist,
        Grayscale: grayscale,
        hljs: defaultStyle,
        Idea: idea,
        Tomorrow: tomorrow,
        VS: vs,
        Xcode: xcode,
    };

    return (
        <div className="flex min-h-screen flex-col">
            <CodePrinter
                fontList={fontList}
                fontSizes={sizes}
                themes={themes}
            ></CodePrinter>
        </div>
    );
}

export default App;
