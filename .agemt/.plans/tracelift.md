# Variable Tracing Flap Worksheet Generator
## SPA Implementation Plan

## Overview

Build a single page application that lets an instructor enter short programs using a lightweight markup syntax, then generates printable front and back worksheet pages for tracing variable values.

The worksheet is designed to sit against a stand up whiteboard.

Variable occurrences marked in the source become physical paper flaps. Each flap is cut on the left, bottom, and right sides, leaving the top edge attached as a hinge.

When a student flips the flap upward, the whiteboard behind the paper is exposed so the student can write the variable's current value directly underneath the code.

The reverse side of each flap contains the variable name rotated so it reads correctly when the flap is lifted.

The generated worksheet should support:

- Letter, 8.5 × 11 inch paper
- Tabloid, 11 × 17 inch paper
- Portrait orientation
- Landscape orientation
- Direct printing from the browser
- Duplex front and back page generation
- Automatic line numbering
- Generous code spacing
- A gutter for a movable line tracing pointer
- Exact physical sizing using SVG
- Live front and back preview
- Configurable font size, spacing, and margins

No server is required for the initial version.

## Code Printer integration

TraceLift will be added as a dedicated Code Printer generator page at `/tracelift`, following the same standalone-entry-point pattern as the existing PPR generator at `/ppr`.

The eventual implementation should include the `/tracelift` development route and a static production output at `dist/tracelift/`.

---

# 1. Technology Stack

Use:

```text
React 19
TypeScript
Vite
SVG
CSS
Browser print API
localStorage for preferences
````

The application should remain fully client side.

SVG should be used for the actual worksheet rendering because it provides precise control over:

* physical dimensions
* text placement
* flap dimensions
* cut lines
* backside registration
* rotation
* print scaling

The same SVG components should be used for both the on screen preview and the printed output.

---

# 2. Primary User Workflow

The instructor enters:

```text
Title: Round 4

score = 3;
score = [[score]] + 10;
score = [[score]] * 2;
score = [[score]] - 4;
```

The application:

1. Parses the title.
2. Parses each code line.
3. Numbers each nonblank code line.
4. Detects each `[[variable]]` marker.
5. Renders the variable normally in the code.
6. Adds a U shaped cut guide around that occurrence.
7. Records the exact physical position of the flap.
8. Generates a matching reverse side.
9. Prints the variable name on the reverse side of the flap.
10. Rotates that reverse label 180 degrees so it reads correctly when flipped upward.
11. Displays front and back previews.
12. Allows the instructor to print directly from the SPA.

---

# 3. Source Syntax

The first version should intentionally use a very small authoring syntax.

Example:

```text
Title: Round 4

score = 3;
score = [[score]] + 10;
score = [[score]] * 2;
score = [[score]] - 4;
```

## Supported syntax

### Title

```text
Title: Round 4
```

Sets the worksheet title.

### Normal code

```javascript
score = 3;
```

Printed normally.

### Flap variable

```text
[[score]]
```

Produces:

```javascript
score
```

in the printed code, but marks that occurrence as a flap.

For example:

```text
total = [[price]] * [[quantity]];
```

renders visually as:

```javascript
total = price * quantity;
```

with separate flaps around `price` and `quantity`.

---

# 4. Parsing Model

Convert the raw source into a structured document model before rendering.

```ts
interface ProgramDocument {
  title: string;
  lines: ProgramLine[];
}
```

Each code line contains tokens.

```ts
interface ProgramLine {
  number: number;
  tokens: CodeToken[];
}
```

Token types:

```ts
type CodeToken =
  | TextToken
  | FlapToken;
```

```ts
interface TextToken {
  type: "text";
  text: string;
}
```

```ts
interface FlapToken {
  type: "flap";
  text: string;
  id: string;
}
```

For example:

```text
score = [[score]] + 10;
```

becomes conceptually:

```ts
[
  {
    type: "text",
    text: "score = "
  },
  {
    type: "flap",
    text: "score",
    id: "line-2-flap-1"
  },
  {
    type: "text",
    text: " + 10;"
  }
]
```

The renderer should not need to understand the `[[ ]]` syntax.

---

# 5. Page Settings

Page size and orientation should be first class application settings.

```ts
type PaperSize =
  | "letter"
  | "tabloid";
```

```ts
type Orientation =
  | "portrait"
  | "landscape";
```

```ts
interface PageSettings {
  paperSize: PaperSize;
  orientation: Orientation;
  marginIn: number;
  fontSizePt: number;
  lineSpacing: number;
}
```

Physical paper sizes:

```ts
const PAPER_SIZES = {
  letter: {
    name: "Letter",
    widthIn: 8.5,
    heightIn: 11
  },

  tabloid: {
    name: "11 × 17",
    widthIn: 11,
    heightIn: 17
  }
};
```

Orientation determines final physical dimensions.

```ts
function getPageDimensions(
  settings: PageSettings
) {
  const paper =
    PAPER_SIZES[settings.paperSize];

  if (
    settings.orientation === "portrait"
  ) {
    return {
      widthIn: paper.widthIn,
      heightIn: paper.heightIn
    };
  }

  return {
    widthIn: paper.heightIn,
    heightIn: paper.widthIn
  };
}
```

This produces:

```text
Letter Portrait
8.5 × 11

Letter Landscape
11 × 8.5

Tabloid Portrait
11 × 17

Tabloid Landscape
17 × 11
```

---

# 6. SVG Coordinate System

Use physical measurements throughout the layout engine.

Recommended internal scale:

```ts
const UNITS_PER_INCH = 100;
```

That gives simple conversions:

```text
1 inch = 100 units
0.5 inch = 50 units
0.25 inch = 25 units
```

Example 11 × 17 landscape SVG:

```html
<svg
  width="17in"
  height="11in"
  viewBox="0 0 1700 1100"
>
```

Example Letter portrait SVG:

```html
<svg
  width="8.5in"
  height="11in"
  viewBox="0 0 850 1100"
>
```

Avoid using browser pixels for worksheet geometry.

---

# 7. Page Geometry

Create a normalized layout object from page settings.

```ts
interface PageGeometry {
  widthIn: number;
  heightIn: number;

  width: number;
  height: number;

  margin: number;

  contentWidth: number;
  contentHeight: number;

  lineNumberGutter: number;
}
```

Example builder:

```ts
function createPageGeometry(
  settings: PageSettings
): PageGeometry {
  const {
    widthIn,
    heightIn
  } = getPageDimensions(settings);

  const width =
    widthIn * UNITS_PER_INCH;

  const height =
    heightIn * UNITS_PER_INCH;

  const margin =
    settings.marginIn *
    UNITS_PER_INCH;

  return {
    widthIn,
    heightIn,

    width,
    height,

    margin,

    contentWidth:
      width - margin * 2,

    contentHeight:
      height - margin * 2,

    lineNumberGutter: 60
  };
}
```

The layout engine should consume `PageGeometry` rather than directly checking page size.

---

# 8. Worksheet Layout

The page should contain:

```text
Title

Line Number Gutter

Code Area
```

Example:

```text
Round 4

    1    score = 3;


    2    score = score + 10;


    3    score = score * 2;


    4    score = score - 4;
```

The large vertical spacing is intentional.

Students need room to:

* open flaps
* write on the whiteboard
* move a line tracing pointer
* visually isolate the current line

---

# 9. Line Number Gutter

Reserve a generous gutter to the left of the program.

Example:

```text
    1    score = 3;

    2    score = score + 10;

    3    score = score * 2;
```

Students can use a movable magnetic pointer or arrow beside the currently executing line.

The worksheet itself does not need to print a moving pointer.

Optional later feature:

```text
○ 1
○ 2
○ 3
```

For MVP, simple large line numbers are sufficient.

---

# 10. Flap Geometry

Every `FlapToken` becomes a physical flap.

The flap should be U shaped.

Cut:

```text
left side
bottom
right side
```

Do not cut the top edge.

The top edge remains attached and acts as the hinge.

Conceptually:

```text
      hinge
   score
│           │
│___________│
```

The flap should include padding around the text.

Recommended initial values:

```text
Horizontal padding:
0.10 inch

Vertical padding:
0.08 inch
```

These should be adjustable constants initially.

---

# 11. Flap Layout Record

While rendering the front page, record the exact position of every flap.

```ts
interface FlapLayout {
  id: string;

  label: string;

  x: number;
  y: number;

  width: number;
  height: number;
}
```

The backside renderer must use these recorded coordinates.

Do not independently recalculate flap positions on the back page.

---

# 12. Front Side Rendering

Each program line is rendered token by token.

Normal text:

```ts
type: "text"
```

renders as ordinary monospaced SVG text.

Flap text:

```ts
type: "flap"
```

renders as:

1. ordinary code text
2. U shaped cut guides
3. a `FlapLayout` record

Example:

```javascript
score = score + 10;
```

The second `score` receives cut guides.

The first `score`, on the left side of the assignment, remains normal text unless explicitly marked.

---

# 13. Back Side Rendering

The reverse page should contain only the content required on the backs of flaps.

For each `FlapLayout`, render the same label.

Example:

```text
score
```

Rotate that label 180 degrees around the center of the flap.

This is necessary so that when the flap is physically lifted upward, the word reads normally.

Conceptually:

```text
Flap closed:

score = score + 10


Flap open:

          score
            ↑
      reverse label

score =    3    + 10
           ↑
       whiteboard
```

The exposed value is written by the student directly on the whiteboard.

---

# 14. Duplex Transformation

Front and back registration must be handled explicitly.

Support at least:

```ts
type DuplexMode =
  | "long-edge"
  | "short-edge";
```

The exact coordinate transformation depends on printer behavior and page orientation.

Keep this logic isolated.

```text
transformDuplex.ts
```

Possible transformations may include:

```ts
xBack =
  pageWidth -
  xFront -
  flapWidth;
```

or:

```ts
yBack =
  pageHeight -
  yFront -
  flapHeight;
```

depending on the selected mode.

Do not scatter duplex calculations throughout rendering code.

---

# 15. Calibration Page

Provide a printer calibration mode.

The page should include flap samples in multiple locations:

```text
TOP LEFT

TOP RIGHT

CENTER

BOTTOM LEFT

BOTTOM RIGHT
```

The reverse side includes corresponding rotated labels.

The teacher:

1. selects a page size
2. selects an orientation
3. prints duplex
4. cuts one or more sample flaps
5. checks alignment
6. selects the duplex mode that works

Store the chosen setting in `localStorage`.

It may be useful to store calibration preferences separately for:

```text
Letter portrait
Letter landscape
Tabloid portrait
Tabloid landscape
```

---

# 16. Application UI

Suggested layout:

```text
┌──────────────────────────────┬─────────────────────────────┐
│                              │                             │
│ Source Editor                │ Live Preview                │
│                              │                             │
│ Title: Round 4               │ Front / Back / Both         │
│                              │                             │
│ score = 3;                   │                             │
│ score = [[score]] + 10;      │                             │
│ ...                          │                             │
│                              │                             │
├──────────────────────────────┴─────────────────────────────┤
│ Paper | Orientation | Font | Spacing | Print              │
└────────────────────────────────────────────────────────────┘
```

---

# 17. Controls

## Paper Size

```text
Letter
11 × 17
```

## Orientation

```text
Portrait
Landscape
```

## Font Size

Editable numeric field.

Example:

```text
24 pt
28 pt
32 pt
36 pt
```

## Line Spacing

Editable numeric field.

Example:

```text
1.5
1.75
2.0
2.25
```

## Margin

Example:

```text
0.5 in
0.75 in
1.0 in
```

## Preview Mode

```text
Front
Back
Side by Side
Cut Guide Debug
```

## Print

```text
Print Worksheet
```

calls:

```ts
window.print();
```

---

# 18. Suggested Defaults

## Letter Portrait

```text
Font:
24 pt

Line spacing:
1.7

Margin:
0.5 inch
```

## Letter Landscape

```text
Font:
26 pt

Line spacing:
1.8

Margin:
0.5 inch
```

## Tabloid Portrait

```text
Font:
32 pt

Line spacing:
2.0

Margin:
0.7 inch
```

## Tabloid Landscape

```text
Font:
36 pt

Line spacing:
2.0

Margin:
0.75 inch
```

These should be presets, not hard coded requirements.

---

# 19. Print Output

The print document should contain two physical pages:

```text
Page 1
Front

Page 2
Back
```

Future multiple worksheet support could produce:

```text
Program 1 Front
Program 1 Back

Program 2 Front
Program 2 Back
```

---

# 20. Print DOM Structure

Example:

```tsx
<div className="print-document">

  <WorksheetPage
    side="front"
    layout={layout}
  />

  <WorksheetPage
    side="back"
    layout={layout}
  />

</div>
```

Each `WorksheetPage` should contain exactly one SVG.

---

# 21. Dynamic Print CSS

The application should generate print CSS based on the selected paper settings.

Example:

```tsx
function PrintStyles({
  settings
}: {
  settings: PageSettings;
}) {
  const {
    widthIn,
    heightIn
  } = getPageDimensions(settings);

  return (
    <style>{`
      @page {
        size: ${widthIn}in ${heightIn}in;
        margin: 0;
      }

      @media print {
        body {
          margin: 0;
        }

        .app-ui {
          display: none !important;
        }

        .print-document {
          display: block !important;
        }

        .print-page {
          width: ${widthIn}in;
          height: ${heightIn}in;

          break-after: page;
          page-break-after: always;

          overflow: hidden;
        }

        .print-page:last-child {
          break-after: auto;
          page-break-after: auto;
        }
      }

      @media screen {
        .print-document {
          display: none;
        }
      }
    `}</style>
  );
}
```

---

# 22. Browser Print Behavior

The Print button should simply call:

```ts
window.print();
```

The SPA should generate the correct physical page size.

However, browser and printer settings cannot be fully forced programmatically.

Display a print reminder such as:

```text
Worksheet Format

11 × 17
Landscape
Duplex

Recommended printer settings:

100% / Actual Size

Do not use:
Fit to Page
Shrink to Fit
```

The printer dialog may still require the teacher to select:

```text
paper tray
duplex mode
paper size
```

depending on the printer driver.

---

# 23. Screen Preview

The preview should use the actual SVG generated for printing.

Do not create a separate approximate preview renderer.

Screen scaling should happen outside the SVG.

Example:

```css
.preview-wrapper {
  transform: scale(0.55);
  transform-origin: top left;
}
```

or use a responsive wrapper.

Changing preview zoom must never change worksheet geometry.

---

# 24. Overflow Detection

Do not automatically shrink a program that does not fit.

Instead calculate whether all lines fit inside the printable content area.

If not, display a warning:

```text
This program does not fit on the selected page.

Overflow:
2 lines

Try:

Reduce font size

Reduce line spacing

Use landscape orientation

Use 11 × 17 paper
```

This is especially important because shrinking the page would also shrink the physical flaps.

---

# 25. Suggested React Structure

```text
src/

  App.tsx

  components/

    WorksheetEditor.tsx

    PageSettingsPanel.tsx

    PreviewPanel.tsx

    WorksheetPage.tsx

    FrontPage.tsx

    BackPage.tsx

    PrintDocument.tsx

    PrintStyles.tsx

    OverflowWarning.tsx

  lib/

    parseWorksheet.ts

    pageGeometry.ts

    layoutWorksheet.ts

    measureText.ts

    flapGeometry.ts

    duplexTransform.ts

    presets.ts

  types/

    worksheet.ts

    layout.ts

    settings.ts
```

---

# 26. Responsibility Separation

## `parseWorksheet.ts`

Responsible for:

```text
Title:
[[variable]]
line numbering
token generation
```

It should not contain layout logic.

---

## `pageGeometry.ts`

Responsible for:

```text
paper dimensions
orientation
margins
physical unit conversion
```

---

## `layoutWorksheet.ts`

Responsible for:

```text
line baselines
token positions
title position
line number placement
flap coordinates
overflow detection
```

---

## `measureText.ts`

Responsible for determining token width.

Because code should use a monospaced font, measurement can be simplified.

Possible approaches:

```text
SVG getComputedTextLength()
Canvas measureText()
Fixed character width
```

For MVP, using a known monospaced font and a predictable character width may be sufficient.

For highest accuracy, use actual browser text measurement.

---

## `flapGeometry.ts`

Responsible for:

```text
flap padding
U shaped cut paths
hinge location
```

---

## `duplexTransform.ts`

Responsible for:

```text
front to back coordinate transformation
long edge behavior
short edge behavior
orientation effects
```

---

# 27. Flap SVG Rendering

Conceptually:

```tsx
function FlapCutGuide({
  flap
}: {
  flap: FlapLayout;
}) {
  const {
    x,
    y,
    width,
    height
  } = flap;

  return (
    <path
      d={`
        M ${x} ${y}
        L ${x} ${y + height}
        L ${x + width} ${y + height}
        L ${x + width} ${y}
      `}
      fill="none"
      stroke="currentColor"
      strokeDasharray="5 4"
    />
  );
}
```

This draws:

```text
left
bottom
right
```

and intentionally omits the top edge.

---

# 28. Back Label Rendering

Example:

```tsx
function BackFlapLabel({
  flap
}: {
  flap: FlapLayout;
}) {
  const centerX =
    flap.x + flap.width / 2;

  const centerY =
    flap.y + flap.height / 2;

  return (
    <text
      x={centerX}
      y={centerY}
      textAnchor="middle"
      dominantBaseline="middle"
      transform={
        `rotate(180 ${centerX} ${centerY})`
      }
    >
      {flap.label}
    </text>
  );
}
```

The duplex transform should be applied before this label is rendered.

---

# 29. MVP Development Sequence

## Phase 1: Source Parser

Implement:

```text
Title parsing
code lines
line numbering
[[flap]] syntax
token model
```

Test with:

```text
Title: Round 4

score = 3;
score = [[score]] + 10;
score = [[score]] * 2;
score = [[score]] - 4;
```

---

## Phase 2: Front SVG Rendering

Render:

```text
title
line numbers
code
double spacing
selected page dimensions
```

Support all four page configurations:

```text
Letter Portrait
Letter Landscape
Tabloid Portrait
Tabloid Landscape
```

---

## Phase 3: Flap Rendering

For each `[[variable]]`:

```text
measure token
calculate padded flap rectangle
draw U shaped cut guide
record FlapLayout
```

---

## Phase 4: Back SVG Rendering

Using the exact front layout:

```text
generate blank back page
transform flap coordinates
render rotated labels
```

---

## Phase 5: Live SPA Editor

Add:

```text
source editor
page size controls
orientation control
font size control
line spacing control
margin control
live preview
```

---

## Phase 6: Print Support

Add:

```text
dynamic @page CSS
print-only DOM
window.print()
print reminder
```

Test:

```text
Letter Portrait

Letter Landscape

11 × 17 Portrait

11 × 17 Landscape
```

---

## Phase 7: Duplex Calibration

Add:

```text
calibration worksheet
long-edge option
short-edge option
registration preview
localStorage preference
```

---

## Phase 8: Physical Testing

Print a real worksheet.

Verify:

```text
font size
line spacing
flap size
ease of cutting
ease of lifting
whiteboard writing area
back label orientation
front/back alignment
line pointer gutter
```

Adjust constants based on actual classroom use.

---

# 30. MVP Acceptance Test

Input:

```text
Title: Round 4

score = 3;
score = [[score]] + 10;
score = [[score]] * 2;
score = [[score]] - 4;
```

Select:

```text
Paper:
11 × 17

Orientation:
Landscape
```

Expected front output:

```text
Round 4

1    score = 3;

2    score = score + 10;

3    score = score * 2;

4    score = score - 4;
```

The three right side `score` occurrences have U shaped cut guides.

Expected back output:

```text
score

score

score
```

Each back label:

```text
aligns with its front flap
is rotated 180 degrees
reads correctly when flap is lifted
```

Print duplex.

Place the front page against a whiteboard.

Cut:

```text
left
bottom
right
```

around a flap.

Lift the flap.

The whiteboard should be exposed behind the variable occurrence.

The word:

```text
score
```

should be readable on the raised flap.

The student should be able to write:

```text
3
```

on the whiteboard so the visible program effectively becomes:

```text
score = 3 + 10;
```

That is the primary MVP success condition.

---

# 31. Possible Post MVP Features

Do not block the MVP on these.

Possible later improvements:

```text
Multiple programs in one document

Saved worksheets

Export to PDF

Shareable encoded URLs

Automatic variable detection

Syntax highlighting

Custom line number starting point

Custom page sizes

Custom flap padding

Flap cut guide style options

Teacher answer key

Student directions section

Program notes

Round labels

Page numbering

Import from JavaScript source

Multiple worksheet templates

Memory trace area templates

Preset classroom activity packs
```

---

# 32. Design Principle

The SPA should preserve actual code as much as possible.

A source line such as:

```javascript
score = score + 10;
```

should still look like:

```javascript
score = score + 10;
```

on the student worksheet.

The flap mechanic should add a physical tracing layer without replacing the structure of the program.

The intended tracing sequence is:

```text
Read the current line

Look up the variable's current value

Lift the variable flap

Write the current value on the whiteboard

Evaluate the expression

Assign the result

Update the memory trace

Move the line pointer
```

The software exists to make that physical activity quick to author, reliable to print, and easy to reuse.
