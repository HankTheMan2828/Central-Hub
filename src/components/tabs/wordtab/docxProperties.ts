/* ------------------------------------------------------------------ */
/*  docx → paragraph/run property extractor.                          */
/*                                                                    */
/*  Mammoth converts .docx to HTML but throws away direct formatting  */
/*  (alignment, indent, line/paragraph spacing, font size/family,     */
/*  tab stops). This module reads word/document.xml + styles.xml      */
/*  out of the same .docx and produces a per-paragraph property list  */
/*  that the importer overlays back onto mammoth's HTML output.       */
/* ------------------------------------------------------------------ */

import JSZip from "jszip";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

// Conversion helpers.
//   1 twip  = 1/20 pt
//   1 pt    = 1/72 in
//   1 in    = 96 CSS px
//   font size in <w:sz> is half-points (24 = 12pt).
const TWIPS_PER_INCH = 1440;
const PX_PER_INCH = 96;
function twipsToPx(twips: number): number {
  return (twips / TWIPS_PER_INCH) * PX_PER_INCH;
}
function twipsToCss(twips: number): string {
  return `${twipsToPx(twips).toFixed(2)}px`;
}
function halfPointsToPt(hp: number): number {
  return hp / 2;
}

export type RunProps = {
  fontSizePt?: number;
  fontFamily?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  hasTab?: boolean;
};

export type ParagraphProps = {
  styleId?: string;
  alignment?: "left" | "center" | "right" | "justify" | "start" | "end";
  indentLeftTwips?: number;
  indentRightTwips?: number;
  indentFirstLineTwips?: number;
  indentHangingTwips?: number;
  spacingBeforeTwips?: number;
  spacingAfterTwips?: number;
  // lineHeight is either a numeric ratio (1.0, 1.5, etc.) or a px value.
  lineHeightRatio?: number;
  lineHeightPx?: number;
  runs: RunProps[];
};

export type StyleDefaults = {
  // Defaults pulled from styles.xml for a given styleId so paragraphs
  // that only reference a style can still inherit its formatting.
  byStyleId: Map<string, Partial<ParagraphProps>>;
  documentDefaults: Partial<ParagraphProps>;
};

function getChildByLocalName(
  parent: Element | null,
  localName: string
): Element | null {
  if (!parent) return null;
  for (let i = 0; i < parent.childNodes.length; i++) {
    const node = parent.childNodes[i];
    if (
      node.nodeType === 1 &&
      (node as Element).localName === localName
    ) {
      return node as Element;
    }
  }
  return null;
}

function getChildrenByLocalName(
  parent: Element | null,
  localName: string
): Element[] {
  if (!parent) return [];
  const out: Element[] = [];
  for (let i = 0; i < parent.childNodes.length; i++) {
    const node = parent.childNodes[i];
    if (
      node.nodeType === 1 &&
      (node as Element).localName === localName
    ) {
      out.push(node as Element);
    }
  }
  return out;
}

function attr(el: Element | null, name: string): string | null {
  if (!el) return null;
  // Try both prefixed and namespaced lookups.
  const direct = el.getAttribute(`w:${name}`);
  if (direct !== null) return direct;
  const ns = el.getAttributeNS(WORD_NS, name);
  if (ns) return ns;
  return el.getAttribute(name);
}

function attrInt(el: Element | null, name: string): number | undefined {
  const raw = attr(el, name);
  if (raw === null) return undefined;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : undefined;
}

function parseAlignment(val: string | null): ParagraphProps["alignment"] {
  if (!val) return undefined;
  switch (val) {
    case "left":
    case "start":
      return "left";
    case "right":
    case "end":
      return "right";
    case "center":
      return "center";
    case "both":
    case "distribute":
    case "justify":
      return "justify";
    default:
      return undefined;
  }
}

function extractRunProps(rEl: Element): RunProps {
  const rPr = getChildByLocalName(rEl, "rPr");
  const props: RunProps = {};

  const sz = getChildByLocalName(rPr, "sz");
  const szVal = attrInt(sz, "val");
  if (szVal !== undefined) props.fontSizePt = halfPointsToPt(szVal);

  const rFonts = getChildByLocalName(rPr, "rFonts");
  const font =
    attr(rFonts, "ascii") ||
    attr(rFonts, "hAnsi") ||
    attr(rFonts, "cs") ||
    attr(rFonts, "eastAsia");
  if (font) props.fontFamily = font;

  const color = getChildByLocalName(rPr, "color");
  const colorVal = attr(color, "val");
  if (colorVal && colorVal.toLowerCase() !== "auto") {
    props.color = `#${colorVal.replace(/^#/, "").padStart(6, "0")}`;
  }

  if (getChildByLocalName(rPr, "b")) props.bold = true;
  if (getChildByLocalName(rPr, "i")) props.italic = true;
  if (getChildByLocalName(rPr, "u")) props.underline = true;

  // <w:tab/> inside a run signals a tab character.
  if (getChildrenByLocalName(rEl, "tab").length > 0) {
    props.hasTab = true;
  }

  return props;
}

function extractParagraphPropsRaw(pPr: Element | null): Partial<ParagraphProps> {
  if (!pPr) return {};
  const out: Partial<ParagraphProps> = {};

  const pStyle = getChildByLocalName(pPr, "pStyle");
  const styleId = attr(pStyle, "val");
  if (styleId) out.styleId = styleId;

  const jc = getChildByLocalName(pPr, "jc");
  const alignment = parseAlignment(attr(jc, "val"));
  if (alignment) out.alignment = alignment;

  const ind = getChildByLocalName(pPr, "ind");
  if (ind) {
    const left =
      attrInt(ind, "left") ??
      attrInt(ind, "start");
    if (left !== undefined) out.indentLeftTwips = left;
    const right =
      attrInt(ind, "right") ??
      attrInt(ind, "end");
    if (right !== undefined) out.indentRightTwips = right;
    const firstLine = attrInt(ind, "firstLine");
    if (firstLine !== undefined) out.indentFirstLineTwips = firstLine;
    const hanging = attrInt(ind, "hanging");
    if (hanging !== undefined) out.indentHangingTwips = hanging;
  }

  const spacing = getChildByLocalName(pPr, "spacing");
  if (spacing) {
    const before = attrInt(spacing, "before");
    if (before !== undefined) out.spacingBeforeTwips = before;
    const after = attrInt(spacing, "after");
    if (after !== undefined) out.spacingAfterTwips = after;
    const line = attrInt(spacing, "line");
    const lineRule = attr(spacing, "lineRule");
    if (line !== undefined) {
      if (lineRule === "exact" || lineRule === "atLeast") {
        out.lineHeightPx = twipsToPx(line);
      } else {
        // Default rule is "auto" — line value is in 240ths.
        out.lineHeightRatio = line / 240;
      }
    }
  }

  return out;
}

function mergeProps(
  base: Partial<ParagraphProps>,
  override: Partial<ParagraphProps>
): Partial<ParagraphProps> {
  return { ...base, ...override };
}

async function loadStyleDefaults(
  stylesXmlText: string | undefined
): Promise<StyleDefaults> {
  const result: StyleDefaults = {
    byStyleId: new Map(),
    documentDefaults: {},
  };
  if (!stylesXmlText) return result;
  const dom = new DOMParser().parseFromString(stylesXmlText, "application/xml");
  const root = dom.documentElement;
  if (!root) return result;

  const docDefaults = root.getElementsByTagNameNS(WORD_NS, "docDefaults")[0];
  if (docDefaults) {
    const pPrDefault = getChildByLocalName(docDefaults, "pPrDefault");
    const pPr = getChildByLocalName(pPrDefault, "pPr");
    result.documentDefaults = extractParagraphPropsRaw(pPr);
  }

  const styles = root.getElementsByTagNameNS(WORD_NS, "style");
  for (let i = 0; i < styles.length; i++) {
    const style = styles[i];
    const type = attr(style, "type");
    if (type !== "paragraph") continue;
    const id = attr(style, "styleId");
    if (!id) continue;
    const pPr = getChildByLocalName(style, "pPr");
    const props = extractParagraphPropsRaw(pPr);
    if (Object.keys(props).length > 0) {
      result.byStyleId.set(id, props);
    }
  }
  return result;
}

export type DocxExtraction = {
  paragraphs: ParagraphProps[];
};

export async function extractDocxProperties(
  arrayBuffer: ArrayBuffer
): Promise<DocxExtraction> {
  const zip = await JSZip.loadAsync(arrayBuffer);
  const documentXmlText = await zip.file("word/document.xml")?.async("string");
  const stylesXmlText = await zip.file("word/styles.xml")?.async("string");
  if (!documentXmlText) {
    return { paragraphs: [] };
  }
  const styleDefaults = await loadStyleDefaults(stylesXmlText);
  const dom = new DOMParser().parseFromString(documentXmlText, "application/xml");
  const body =
    dom.getElementsByTagNameNS(WORD_NS, "body")[0] ||
    dom.documentElement;

  const out: ParagraphProps[] = [];
  // Iterate ONLY top-level <w:p> children of the body in order. Nested
  // paragraphs inside text-boxes etc. are skipped — mammoth doesn't surface
  // those as siblings either.
  for (let i = 0; i < body.childNodes.length; i++) {
    const node = body.childNodes[i];
    if (node.nodeType !== 1) continue;
    const el = node as Element;
    if (el.localName !== "p") continue;

    const pPr = getChildByLocalName(el, "pPr");
    const direct = extractParagraphPropsRaw(pPr);
    const inherited = direct.styleId
      ? styleDefaults.byStyleId.get(direct.styleId) ?? {}
      : {};
    const merged = mergeProps(
      mergeProps(styleDefaults.documentDefaults, inherited),
      direct
    );

    const runs: RunProps[] = [];
    for (let j = 0; j < el.childNodes.length; j++) {
      const child = el.childNodes[j];
      if (child.nodeType !== 1) continue;
      const childEl = child as Element;
      if (childEl.localName === "r") {
        runs.push(extractRunProps(childEl));
      }
    }

    out.push({
      styleId: merged.styleId,
      alignment: merged.alignment,
      indentLeftTwips: merged.indentLeftTwips,
      indentRightTwips: merged.indentRightTwips,
      indentFirstLineTwips: merged.indentFirstLineTwips,
      indentHangingTwips: merged.indentHangingTwips,
      spacingBeforeTwips: merged.spacingBeforeTwips,
      spacingAfterTwips: merged.spacingAfterTwips,
      lineHeightRatio: merged.lineHeightRatio,
      lineHeightPx: merged.lineHeightPx,
      runs,
    });
  }

  return { paragraphs: out };
}

// Build the inline style string for a paragraph's properties. Returns ""
// when nothing should be emitted.
export function paragraphStyleString(props: ParagraphProps): string {
  const parts: string[] = [];
  if (props.alignment) {
    parts.push(`text-align: ${props.alignment}`);
  }
  if (props.indentLeftTwips !== undefined && props.indentLeftTwips !== 0) {
    parts.push(`margin-left: ${twipsToCss(props.indentLeftTwips)}`);
  }
  if (props.indentRightTwips !== undefined && props.indentRightTwips !== 0) {
    parts.push(`margin-right: ${twipsToCss(props.indentRightTwips)}`);
  }
  if (
    props.indentFirstLineTwips !== undefined &&
    props.indentFirstLineTwips !== 0
  ) {
    parts.push(`text-indent: ${twipsToCss(props.indentFirstLineTwips)}`);
  } else if (
    props.indentHangingTwips !== undefined &&
    props.indentHangingTwips !== 0
  ) {
    // Hanging indent is the opposite of first-line indent.
    parts.push(`text-indent: -${twipsToCss(props.indentHangingTwips)}`);
  }
  if (
    props.spacingBeforeTwips !== undefined &&
    props.spacingBeforeTwips !== 0
  ) {
    parts.push(`margin-top: ${twipsToCss(props.spacingBeforeTwips)}`);
  }
  if (props.spacingAfterTwips !== undefined && props.spacingAfterTwips !== 0) {
    parts.push(`margin-bottom: ${twipsToCss(props.spacingAfterTwips)}`);
  }
  if (props.lineHeightRatio !== undefined && props.lineHeightRatio > 0) {
    parts.push(`line-height: ${props.lineHeightRatio.toFixed(3)}`);
  } else if (props.lineHeightPx !== undefined && props.lineHeightPx > 0) {
    parts.push(`line-height: ${props.lineHeightPx.toFixed(2)}px`);
  }
  return parts.join("; ");
}

// Build inline style for the *first* run that carries character-level
// formatting we want to lift to the paragraph (font-size, font-family, color).
// This is a deliberate approximation — applying run styles to the paragraph
// keeps things simple while still surfacing the doc's default text size.
export function dominantRunStyleString(props: ParagraphProps): string {
  const parts: string[] = [];
  const firstRun = props.runs.find(
    (r) => r.fontSizePt || r.fontFamily || r.color
  );
  if (!firstRun) return "";
  if (firstRun.fontSizePt) {
    parts.push(`font-size: ${firstRun.fontSizePt}pt`);
  }
  if (firstRun.fontFamily) {
    const safe = firstRun.fontFamily.replace(/["';]/g, "");
    parts.push(`font-family: "${safe}"`);
  }
  if (firstRun.color) {
    parts.push(`color: ${firstRun.color}`);
  }
  return parts.join("; ");
}
