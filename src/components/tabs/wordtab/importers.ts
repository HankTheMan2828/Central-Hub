import { markdownToHtml } from "./markdownToHtml";

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
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "text-decoration",
  "text-align",
]);

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function titleFromFile(file: File): string {
  return file.name.replace(/\.[^.]+$/, "") || "Imported document";
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

export async function importFile(file: File): Promise<ImportResult> {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const text = await file.text();
  const title = titleFromFile(file);
  if (ext === "md" || ext === "markdown") {
    return { title, html: sanitizeHtml(markdownToHtml(text)) };
  }
  if (ext === "html" || ext === "htm" || file.type === "text/html") {
    return { title, html: sanitizeHtml(text) };
  }
  if (ext === "rtf") {
    return { title, html: txtToHtml(rtfToText(text)), notes: ["RTF formatting was simplified."] };
  }
  if (ext === "txt" || file.type.startsWith("text/")) {
    return { title, html: txtToHtml(text) };
  }
  throw new Error("This file type is not supported yet.");
}
