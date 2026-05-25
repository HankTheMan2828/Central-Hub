export type PageLayout = {
  id: string;
  label: string;
  meta: string;
  width: string;
  height: string;
  margin: string;
  columns: 1 | 2 | 3;
};

export type MarginPreset = {
  id: string;
  label: string;
  meta: string;
  margins: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  };
};

export type FontFamily = {
  id: string;
  label: string;
  stack: string;
};

export type StylePreset = {
  id: "title" | "subtitle" | "h1" | "h2" | "h3" | "p" | "quote";
  label: string;
  tag: "H1" | "H2" | "H3" | "P" | "BLOCKQUOTE";
  className?: string;
};

export type PageColor = {
  id: string;
  label: string;
  background: string;
  text: string;
  muted: string;
  heading: string;
  subheading: string;
  quote: string;
  rule: string;
  ring: string;
};

export const PAGE_LAYOUTS: PageLayout[] = [
  {
    id: "letter",
    label: "Letter",
    meta: '8.5" x 11"',
    width: "8.5in",
    height: "11in",
    margin: "1in",
    columns: 1,
  },
  {
    id: "legal",
    label: "Legal",
    meta: '8.5" x 14"',
    width: "8.5in",
    height: "14in",
    margin: "1in",
    columns: 1,
  },
  {
    id: "a4",
    label: "A4",
    meta: '8.27" x 11.69"',
    width: "8.27in",
    height: "11.69in",
    margin: "0.95in",
    columns: 1,
  },
  {
    id: "a5",
    label: "A5",
    meta: '5.83" x 8.27"',
    width: "5.83in",
    height: "8.27in",
    margin: "0.62in",
    columns: 1,
  },
  {
    id: "executive",
    label: "Executive",
    meta: '7.25" x 10.5"',
    width: "7.25in",
    height: "10.5in",
    margin: "0.78in",
    columns: 1,
  },
  {
    id: "letter-landscape-columns",
    label: "Book landscape columns",
    meta: '10.5" x 7.5" - 2 columns',
    width: "10.5in",
    height: "7.5in",
    margin: "0.62in",
    columns: 2,
  },
];

export const PAGE_COLORS: PageColor[] = [
  {
    id: "theme",
    label: "Follow theme",
    background: "var(--ch-bg-elevated)",
    text: "var(--ch-text)",
    muted: "var(--ch-text-faint)",
    heading: "var(--ch-accent)",
    subheading: "var(--ch-text)",
    quote: "var(--ch-text-muted)",
    rule: "var(--ch-border-subtle)",
    ring: "var(--ch-border)",
  },
  {
    id: "default",
    label: "Default",
    background: "#efe0c2",
    text: "#1f1a14",
    muted: "#9d9489",
    heading: "#7a4307",
    subheading: "#17130f",
    quote: "#4f4941",
    rule: "rgba(91, 69, 42, 0.2)",
    ring: "rgba(106, 77, 39, 0.2)",
  },
  {
    id: "dull-tan",
    label: "Dull Tan",
    background: "#c7b08a",
    text: "#211a11",
    muted: "#6f604b",
    heading: "#623d12",
    subheading: "#211a11",
    quote: "#4d4334",
    rule: "rgba(61, 47, 28, 0.24)",
    ring: "rgba(61, 47, 28, 0.25)",
  },
  {
    id: "dark-grey",
    label: "Dark Grey",
    background: "#2b2b2b",
    text: "#eee9df",
    muted: "#aaa39a",
    heading: "#ffbd66",
    subheading: "#f7f0e6",
    quote: "#c9c0b5",
    rule: "rgba(255, 255, 255, 0.18)",
    ring: "rgba(255, 255, 255, 0.14)",
  },
  {
    id: "black",
    label: "Black",
    background: "#050505",
    text: "#f3eee6",
    muted: "#928b83",
    heading: "#ffb347",
    subheading: "#fff8ee",
    quote: "#c7beb3",
    rule: "rgba(255, 255, 255, 0.16)",
    ring: "rgba(255, 255, 255, 0.16)",
  },
];

// Palette for the inline font-color / highlight pickers.
export const TEXT_COLORS: { label: string; value: string }[] = [
  { label: "Automatic", value: "" },
  { label: "Black", value: "#000000" },
  { label: "White", value: "#ffffff" },
  { label: "Red", value: "#d92d20" },
  { label: "Orange", value: "#f79009" },
  { label: "Yellow", value: "#eaaa08" },
  { label: "Green", value: "#16a34a" },
  { label: "Teal", value: "#0e9384" },
  { label: "Blue", value: "#2563eb" },
  { label: "Purple", value: "#7c3aed" },
  { label: "Pink", value: "#db2777" },
  { label: "Grey", value: "#667085" },
];

export const HIGHLIGHT_COLORS: { label: string; value: string }[] = [
  { label: "None", value: "transparent" },
  { label: "Yellow", value: "#fef08a" },
  { label: "Green", value: "#bbf7d0" },
  { label: "Cyan", value: "#a5f3fc" },
  { label: "Blue", value: "#bfdbfe" },
  { label: "Purple", value: "#e9d5ff" },
  { label: "Pink", value: "#fce7f3" },
  { label: "Red", value: "#fecaca" },
  { label: "Orange", value: "#fed7aa" },
  { label: "Grey", value: "#e5e7eb" },
];

// Curated list covering fonts that ship with Windows and macOS by default,
// plus the generic CSS families. The `id` is what we persist in WordDoc /
// layout sidecars; `stack` is the actual CSS font-family string.
export const FONT_FAMILIES: FontFamily[] = [
  {
    id: "sans",
    label: "Sans serif",
    stack: '-apple-system, "Segoe UI", system-ui, sans-serif',
  },
  {
    id: "serif",
    label: "Serif",
    stack: 'Georgia, "Times New Roman", serif',
  },
  {
    id: "mono",
    label: "Monospace",
    stack: '"JetBrains Mono", Consolas, monospace',
  },
  { id: "arial", label: "Arial", stack: 'Arial, Helvetica, sans-serif' },
  { id: "arial-black", label: "Arial Black", stack: '"Arial Black", Gadget, sans-serif' },
  { id: "arial-narrow", label: "Arial Narrow", stack: '"Arial Narrow", Arial, sans-serif' },
  { id: "bahnschrift", label: "Bahnschrift", stack: 'Bahnschrift, "DIN Alternate", sans-serif' },
  { id: "book-antiqua", label: "Book Antiqua", stack: '"Book Antiqua", Palatino, serif' },
  { id: "bookman", label: "Bookman Old Style", stack: '"Bookman Old Style", Bookman, serif' },
  { id: "calibri", label: "Calibri", stack: 'Calibri, "Segoe UI", system-ui, sans-serif' },
  { id: "cambria", label: "Cambria", stack: "Cambria, Georgia, serif" },
  { id: "candara", label: "Candara", stack: 'Candara, Calibri, sans-serif' },
  { id: "century", label: "Century", stack: 'Century, "Century Schoolbook", serif' },
  { id: "century-gothic", label: "Century Gothic", stack: '"Century Gothic", AppleGothic, sans-serif' },
  { id: "comic-sans", label: "Comic Sans MS", stack: '"Comic Sans MS", "Comic Sans", cursive' },
  { id: "consolas", label: "Consolas", stack: 'Consolas, "Lucida Console", monospace' },
  { id: "constantia", label: "Constantia", stack: 'Constantia, Georgia, serif' },
  { id: "corbel", label: "Corbel", stack: 'Corbel, "Lucida Sans", sans-serif' },
  { id: "courier", label: "Courier New", stack: '"Courier New", Courier, monospace' },
  { id: "ebrima", label: "Ebrima", stack: 'Ebrima, "Segoe UI", sans-serif' },
  { id: "franklin-gothic", label: "Franklin Gothic", stack: '"Franklin Gothic Medium", "Franklin Gothic", "Arial Narrow", sans-serif' },
  { id: "garamond", label: "Garamond", stack: 'Garamond, "EB Garamond", serif' },
  { id: "georgia", label: "Georgia", stack: 'Georgia, "Times New Roman", serif' },
  { id: "helvetica", label: "Helvetica", stack: 'Helvetica, Arial, sans-serif' },
  { id: "impact", label: "Impact", stack: 'Impact, Charcoal, sans-serif' },
  { id: "lucida-console", label: "Lucida Console", stack: '"Lucida Console", Monaco, monospace' },
  { id: "lucida-sans", label: "Lucida Sans", stack: '"Lucida Sans Unicode", "Lucida Sans", sans-serif' },
  { id: "palatino", label: "Palatino", stack: '"Palatino Linotype", "Book Antiqua", Palatino, serif' },
  { id: "rockwell", label: "Rockwell", stack: 'Rockwell, "Courier Bold", serif' },
  { id: "segoe-print", label: "Segoe Print", stack: '"Segoe Print", "Segoe UI", cursive' },
  { id: "segoe-script", label: "Segoe Script", stack: '"Segoe Script", "Segoe UI", cursive' },
  { id: "segoe-ui", label: "Segoe UI", stack: '"Segoe UI", Tahoma, Geneva, sans-serif' },
  { id: "sitka", label: "Sitka", stack: 'Sitka, "Sitka Text", Georgia, serif' },
  { id: "tahoma", label: "Tahoma", stack: 'Tahoma, Geneva, Verdana, sans-serif' },
  { id: "times-new-roman", label: "Times New Roman", stack: '"Times New Roman", Times, serif' },
  { id: "trebuchet", label: "Trebuchet MS", stack: '"Trebuchet MS", "Lucida Grande", sans-serif' },
  { id: "verdana", label: "Verdana", stack: 'Verdana, Geneva, sans-serif' },
];

export const FONT_SIZES_PT = [
  8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72,
];

export const MARGIN_PRESETS: MarginPreset[] = [
  {
    id: "normal",
    label: "Normal",
    meta: '1" all',
    margins: { top: "1in", right: "1in", bottom: "1in", left: "1in" },
  },
  {
    id: "narrow",
    label: "Narrow",
    meta: '0.5" all',
    margins: { top: "0.5in", right: "0.5in", bottom: "0.5in", left: "0.5in" },
  },
  {
    id: "moderate",
    label: "Moderate",
    meta: '1" x 0.75"',
    margins: { top: "1in", right: "0.75in", bottom: "1in", left: "0.75in" },
  },
  {
    id: "wide",
    label: "Wide",
    meta: '1" x 2"',
    margins: { top: "1in", right: "2in", bottom: "1in", left: "2in" },
  },
];

export const LINE_SPACING_PRESETS = [1, 1.15, 1.5, 2];

export const PARAGRAPH_SPACING_PRESETS = [
  { label: "Compact", before: 0, after: 0 },
  { label: "Word", before: 0, after: 8 },
  { label: "Roomy", before: 6, after: 12 },
];

export const STYLE_PRESETS: StylePreset[] = [
  { id: "title", label: "Title", tag: "H1", className: "word-style-title" },
  {
    id: "subtitle",
    label: "Subtitle",
    tag: "P",
    className: "word-style-subtitle",
  },
  { id: "h1", label: "Heading 1", tag: "H1" },
  { id: "h2", label: "Heading 2", tag: "H2" },
  { id: "h3", label: "Heading 3", tag: "H3" },
  { id: "p", label: "Paragraph", tag: "P" },
  { id: "quote", label: "Quote", tag: "BLOCKQUOTE" },
];
