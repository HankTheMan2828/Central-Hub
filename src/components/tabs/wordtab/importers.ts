import mammoth from "mammoth";
import {
  dominantRunStyleString,
  extractDocxProperties,
  paragraphStyleString,
  type ParagraphProps,
} from "./docxProperties";
import { markdownToHtml } from "./markdownToHtml";

// Block elements in mammoth's output that correspond 1:1 with a docx <w:p>.
// Order in the HTML is the same as paragraph order in document.xml, so we
// can zip them with the extracted property list to overlay formatting that
// mammoth strips by default.
const DOCX_BLOCK_TAGS = new Set([
  "P",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "LI",
  "BLOCKQUOTE",
  "PRE",
]);

function mergeStyleString(existing: string, addition: string): string {
  if (!addition) return existing;
  if (!existing) return addition;
  const trimmed = existing.trim().replace(/;\s*$/, "");
  return `${trimmed}; ${addition}`;
}

function applyDocxParagraphFormatting(
  html: string,
  paragraphs: ParagraphProps[]
): string {
  if (!paragraphs.length) return html;
  const doc = new DOMParser().parseFromString(
    `<div>${html}</div>`,
    "text/html"
  );
  const root = doc.body.firstElementChild;
  if (!root) return html;

  // Collect block elements in document order across the entire subtree —
  // mammoth nests <li> inside <ul>/<ol>, but each <li> still maps to a
  // single docx paragraph, so a flat in-order walk works.
  const blocks: HTMLElement[] = [];
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, {
    acceptNode(node) {
      return DOCX_BLOCK_TAGS.has((node as HTMLElement).tagName)
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_SKIP;
    },
  });
  let current = walker.nextNode();
  while (current) {
    blocks.push(current as HTMLElement);
    current = walker.nextNode();
  }

  // Match HTML blocks to XML paragraphs by text content with a forward-
  // scanning cursor. This survives mammoth dropping leading empty/spacer
  // paragraphs (or wrapping body content under <w:sdt>), which would
  // otherwise shift a strict index zip and leave the first 1-2 paragraphs
  // un-styled.
  const normalizeText = (s: string) =>
    s
      .normalize("NFKC")
      .replace(/[‘’‚‛]/g, "'")
      .replace(/[“”„‟]/g, '"')
      .replace(/[–—―]/g, "-")
      .replace(/[­]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const xmlTexts = paragraphs.map((p) => normalizeText(p.text || ""));
  const used = new Array<boolean>(paragraphs.length).fill(false);
  let cursor = 0;
  const applyTo = (el: HTMLElement, props: ParagraphProps) => {
    const paraStyle = paragraphStyleString(props);
    const runStyle = dominantRunStyleString(props);
    const combined = mergeStyleString(paraStyle, runStyle);
    if (!combined) return;
    el.setAttribute(
      "style",
      mergeStyleString(el.getAttribute("style") || "", combined)
    );
  };
  for (const block of blocks) {
    const htmlText = normalizeText(block.textContent || "");
    let matched = -1;
    if (htmlText.length > 0) {
      // Scan forward from the cursor — first equal text wins. Bound the
      // scan to avoid pathological cases when text is highly repetitive.
      const scanEnd = Math.min(paragraphs.length, cursor + 64);
      for (let j = cursor; j < scanEnd; j++) {
        if (!used[j] && xmlTexts[j] === htmlText) {
          matched = j;
          break;
        }
      }
    }
    // Fallback: if no text match, fall back to the cursor position so
    // empty paragraphs (no text on either side) still pair up positionally.
    if (matched < 0 && cursor < paragraphs.length && !used[cursor]) {
      matched = cursor;
    }
    if (matched < 0) continue;
    used[matched] = true;
    cursor = matched + 1;
    applyTo(block, paragraphs[matched]);
  }

  // Convert literal tab characters in text nodes to a run of non-breaking
  // spaces so they survive HTML whitespace collapsing.
  const textWalker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const tabHosts: Text[] = [];
  let textNode = textWalker.nextNode();
  while (textNode) {
    if ((textNode.nodeValue || "").includes("\t")) {
      tabHosts.push(textNode as Text);
    }
    textNode = textWalker.nextNode();
  }
  tabHosts.forEach((node) => {
    // Plain non-breaking spaces — the previous inline-block <span> per tab
    // was atomic inside contenteditable and broke cursor placement near
    // tabs. 6 nbsp ≈ Word's default half-inch tab stop at 11pt.
    const value = node.nodeValue || "";
    node.nodeValue = value.replace(/\t/g, "      ");
  });
  return root.innerHTML;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _unusedTabPathStub(_value: string): string { return _value; }
const _DEAD_TAB_PATH_REMOVED = `
  /*
    const parts = value.split("\t");
    const fragment = doc.createDocumentFragment();
    parts.forEach((part, index) => {
      if (part) fragment.appendChild(doc.createTextNode(part));
      if (index < parts.length - 1) {
        const tab = doc.createElement("span");
        tab.setAttribute("data-word-tab", "true");
        tab.setAttribute(
          "style",
          "display: inline-block; min-width: 0.5in; white-space: pre;"
        );
        tab.appendChild(doc.createTextNode(" "));
        fragment.appendChild(tab);
      }
    });
    node.parentNode?.replaceChild(fragment, node);
  });

  return "";
  */
  return _value;
`;
void _DEAD_TAB_PATH_REMOVED;
void _unusedTabPathStub;

export type ImportResult = {
  title: string;
  html: string;
  notes?: string[];
};

const ALLOWED_TAGS = new Set([
  "p", "div", "span", "br", "h1", "h2", "h3", "h4", "h5", "h6", "strong",
  "b", "em", "i", "u", "s", "del", "mark", "sub", "sup", "ul", "ol", "li",
  "blockquote", "hr", "a", "img", "table", "thead", "tbody", "tr", "td", "th",
  "code", "pre", "font",
]);
const STYLE_PROPS = new Set([
  "color",
  "background-color",
  "display",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "line-height",
  "margin-left",
  "margin-right",
  "margin-top",
  "margin-bottom",
  "min-width",
  "mso-list",
  "padding-left",
  "padding-right",
  "text-indent",
  "text-decoration",
  "text-align",
  "text-transform",
  "vertical-align",
  "white-space",
]);
const MAX_IMPORTED_IMAGE_EDGE_PX = 1600;

type MammothImage = {
  contentType: string;
  readAsArrayBuffer: () => Promise<ArrayBuffer>;
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function titleFromName(name: string): string {
  return name.replace(/\.[^.]+$/, "") || "Imported document";
}

function safeUrl(value: string, allowImageData = false): string | null {
  try {
    const url = new URL(value, "https://centralhub.local");
    if (["http:", "https:", "mailto:"].includes(url.protocol)) return value;
    if (allowImageData && value.startsWith("data:image/")) return value;
    return null;
  } catch {
    return null;
  }
}

function cleanStyle(value: string): string {
  return value
    .split(";")
    .map((part) => {
      const [rawProp, ...rawValue] = part.split(":");
      const prop = rawProp?.trim().toLowerCase();
      const val = rawValue.join(":").trim();
      if (!prop || !val || !STYLE_PROPS.has(prop)) return "";
      if (/url\s*\(/i.test(val)) return "";
      return `${prop}: ${val}`;
    })
    .filter(Boolean)
    .join("; ");
}

export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const cleanNode = (node: Node): Node | null => {
    if (node.nodeType === Node.TEXT_NODE) {
      return document.createTextNode(node.textContent ?? "");
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return null;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) {
      const fragment = document.createDocumentFragment();
      el.childNodes.forEach((child) => {
        const clean = cleanNode(child);
        if (clean) fragment.appendChild(clean);
      });
      return fragment;
    }
    const next = document.createElement(tag);
    Array.from(el.attributes).forEach((attr) => {
      const name = attr.name.toLowerCase();
      const value = attr.value;
      if (name.startsWith("on")) return;
      if (name === "style") {
        const style = cleanStyle(value);
        if (style) next.setAttribute("style", style);
        return;
      }
      // Preserve our own data-word-* hooks (e.g. data-word-tab,
      // data-word-page-break) — they drive editor-side rendering.
      if (name.startsWith("data-word-")) {
        next.setAttribute(name, value);
        return;
      }
      if (tag === "a" && (name === "href" || name === "title")) {
        if (name === "href") {
          const safe = safeUrl(value);
          if (safe) next.setAttribute(name, safe);
        } else {
          next.setAttribute(name, value);
        }
      }
      if (tag === "img" && ["src", "alt", "width", "height"].includes(name)) {
        if (name === "src") {
          const safe = safeUrl(value, true);
          if (safe) next.setAttribute(name, safe);
        } else {
          next.setAttribute(name, value);
        }
      }
      if (tag === "font" && ["face", "size", "color"].includes(name)) {
        next.setAttribute(name, value);
      }
    });
    el.childNodes.forEach((child) => {
      const clean = cleanNode(child);
      if (clean) next.appendChild(clean);
    });
    return next;
  };
  const fragment = document.createDocumentFragment();
  doc.body.childNodes.forEach((node) => {
    const clean = cleanNode(node);
    if (clean) fragment.appendChild(clean);
  });
  const container = document.createElement("div");
  container.appendChild(fragment);
  return container.innerHTML;
}

function txtToHtml(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block.trim()).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

function rtfToText(rtf: string): string {
  return rtf
    .replace(/\\par[d]?/g, "\n")
    .replace(/\\'[0-9a-f]{2}/gi, "")
    .replace(/\\[a-z]+-?\d* ?/gi, "")
    .replace(/[{}]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

async function convertDocxImage(image: MammothImage): Promise<{ src: string }> {
  const arrayBuffer = await image.readAsArrayBuffer();
  if (
    typeof document === "undefined" ||
    typeof Blob === "undefined" ||
    typeof createImageBitmap === "undefined"
  ) {
    return {
      src: `data:${image.contentType};base64,${arrayBufferToBase64(arrayBuffer)}`,
    };
  }

  try {
    const blob = new Blob([arrayBuffer], { type: image.contentType });
    const bitmap = await createImageBitmap(blob);
    const largestEdge = Math.max(bitmap.width, bitmap.height);
    if (largestEdge <= MAX_IMPORTED_IMAGE_EDGE_PX) {
      bitmap.close();
      return {
        src: `data:${image.contentType};base64,${arrayBufferToBase64(arrayBuffer)}`,
      };
    }

    const scale = MAX_IMPORTED_IMAGE_EDGE_PX / largestEdge;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return {
        src: `data:${image.contentType};base64,${arrayBufferToBase64(arrayBuffer)}`,
      };
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const outputType = image.contentType === "image/png" ? "image/png" : "image/jpeg";
    return { src: canvas.toDataURL(outputType, 0.86) };
  } catch {
    return {
      src: `data:${image.contentType};base64,${arrayBufferToBase64(arrayBuffer)}`,
    };
  }
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export async function importDocxDocument(
  name: string,
  input: ArrayBuffer | Uint8Array
): Promise<ImportResult> {
  const arrayBuffer =
    input instanceof ArrayBuffer ? input : bytesToArrayBuffer(input);
  // Mammoth handles structure (paragraphs, runs, lists, tables, headings,
  // images) but throws away direct formatting (alignment, indent, spacing,
  // font sizes, tab stops). We run mammoth and the raw-XML property
  // extractor in parallel and overlay the extracted styles onto mammoth's
  // HTML before sanitizing.
  const [result, extracted] = await Promise.all([
    mammoth.convertToHtml(
      { arrayBuffer },
      { convertImage: mammoth.images.imgElement(convertDocxImage) }
    ),
    extractDocxProperties(arrayBuffer).catch(() => ({ paragraphs: [] })),
  ]);
  const enriched = applyDocxParagraphFormatting(
    result.value,
    extracted.paragraphs
  );
  return {
    title: titleFromName(name),
    html: sanitizeHtml(enriched),
    notes: result.messages.map((message) => message.message),
  };
}

export function importTextDocument(
  name: string,
  text: string,
  type = ""
): ImportResult {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const title = titleFromName(name);
  if (ext === "docx") {
    throw new Error("DOCX files must be imported as binary files.");
  }
  if (ext === "doc" || type === "application/msword") {
    throw new Error(
      "Legacy .doc files are not supported. Please convert the file to .docx and try again."
    );
  }
  if (ext === "md" || ext === "markdown") {
    return { title, html: sanitizeHtml(markdownToHtml(text)) };
  }
  if (ext === "html" || ext === "htm" || type === "text/html") {
    return { title, html: sanitizeHtml(text) };
  }
  if (ext === "rtf") {
    return {
      title,
      html: txtToHtml(rtfToText(text)),
      notes: ["RTF formatting was simplified."],
    };
  }
  if (ext === "txt" || type.startsWith("text/")) {
    return { title, html: txtToHtml(text) };
  }
  throw new Error("This file type is not supported yet.");
}

export async function importFile(file: File): Promise<ImportResult> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".doc") || file.type === "application/msword") {
    throw new Error(
      "Legacy .doc files are not supported. Please convert the file to .docx and try again."
    );
  }
  if (
    lowerName.endsWith(".docx") ||
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return importDocxDocument(file.name, await file.arrayBuffer());
  }
  return importTextDocument(file.name, await file.text(), file.type);
}
