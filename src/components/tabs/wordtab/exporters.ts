export type ExportFormat = "md" | "html" | "txt" | "rtf" | "pdf";

function sanitizeFilename(title: string): string {
  const cleaned = (title || "untitled")
    .trim()
    .replace(/[^\w\d-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
  return cleaned || "untitled";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function downloadBlob(
  content: string,
  filename: string,
  mime: string
): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function textWithPageBreaks(editor: HTMLElement): string {
  const clone = editor.cloneNode(true) as HTMLElement;
  clone.querySelectorAll<HTMLElement>("[data-word-page-break]").forEach((el) => {
    el.replaceWith(document.createTextNode("\n\n----\n\n"));
  });
  return clone.innerText || clone.textContent || "";
}

function escapeRtf(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/{/g, "\\{")
    .replace(/}/g, "\\}")
    .replace(/\n/g, "\\par\n");
}

export function htmlToMarkdown(root: HTMLElement): string {
  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent || "";
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    const child = Array.from(el.childNodes).map(walk).join("");

    switch (tag) {
      case "h1":
        return `\n# ${child.trim()}\n\n`;
      case "h2":
        return `\n## ${child.trim()}\n\n`;
      case "h3":
        return `\n### ${child.trim()}\n\n`;
      case "p":
        return `${child.trim()}\n\n`;
      case "br":
        return "  \n";
      case "s":
      case "del":
        return `~~${child}~~`;
      case "mark":
        return `<mark>${child}</mark>`;
      case "strong":
      case "b":
        return `**${child}**`;
      case "em":
      case "i":
        return `*${child}*`;
      case "u":
        return `_${child}_`;
      case "code":
        return `\`${child}\``;
      case "a": {
        const href = el.getAttribute("href") || "";
        return `[${child}](${href})`;
      }
      case "blockquote": {
        const lines = child.trim().split("\n").map((l) => `> ${l}`).join("\n");
        return `\n${lines}\n\n`;
      }
      case "ul": {
        const items = Array.from(el.children)
          .filter((c) => c.tagName === "LI")
          .map((li) => `- ${walk(li).trim().replace(/\n/g, "\n  ")}`)
          .join("\n");
        return `\n${items}\n\n`;
      }
      case "ol": {
        const items = Array.from(el.children)
          .filter((c) => c.tagName === "LI")
          .map(
            (li, i) =>
              `${i + 1}. ${walk(li).trim().replace(/\n/g, "\n   ")}`
          )
          .join("\n");
        return `\n${items}\n\n`;
      }
      case "li":
        return child;
      case "div":
        if (el.dataset.wordPageBreak) return "\n\n---\n\n";
        return child + (child.endsWith("\n") ? "" : "\n");
      default:
        return child;
    }
  }
  return walk(root).replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function wrapHtml(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 780px; margin: 40px auto; line-height: 1.6; padding: 0 16px; color: #222; }
h1 { color: #b8650a; font-size: 26px; }
h2 { color: #333; font-size: 19px; }
blockquote { border-left: 3px solid #b8650a; padding: 0.2em 0.9em; color: #555; font-style: italic; margin: 1em 0; }
a { color: #16864c; }
ul, ol { padding-left: 1.4em; }
li { margin: 0.2em 0; }
p { margin: 0 0 0.8em; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
${body}
</body>
</html>`;
}

function printAsPdf(title: string, html: string): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
@page { margin: 24mm; }
body { font-family: Georgia, 'Times New Roman', serif; color: #111; line-height: 1.55; }
h1 { font-size: 22pt; margin-top: 0; }
h2 { font-size: 16pt; }
blockquote { border-left: 3px solid #888; padding: 0.2em 0.9em; color: #444; font-style: italic; }
ul, ol { padding-left: 24px; }
li { margin: 0.2em 0; }
p { margin: 0 0 0.6em; }
a { color: #1a73e8; }
[data-word-page-break] { break-before: page; page-break-before: always; }
</style>
</head>
<body>
<h1>${escapeHtml(title || "Untitled")}</h1>
${html}
</body>
</html>`);
  doc.close();
  window.setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (err) {
      console.warn("Print failed:", err);
    }
    window.setTimeout(() => iframe.remove(), 2000);
  }, 250);
}

export function exportDoc(
  format: ExportFormat,
  title: string,
  editor: HTMLElement | null
): void {
  if (!editor) return;
  const filename = sanitizeFilename(title);
  const docTitle = title.trim() || "Untitled";

  switch (format) {
    case "md": {
      const md = htmlToMarkdown(editor);
      const body = `# ${docTitle}\n\n${md}`;
      downloadBlob(body, `${filename}.md`, "text/markdown;charset=utf-8");
      return;
    }
    case "html": {
      const html = wrapHtml(docTitle, editor.innerHTML);
      downloadBlob(html, `${filename}.html`, "text/html;charset=utf-8");
      return;
    }
    case "txt": {
      const txt = `${docTitle}\n\n${textWithPageBreaks(editor)}`;
      downloadBlob(txt, `${filename}.txt`, "text/plain;charset=utf-8");
      return;
    }
    case "rtf": {
      const text = escapeRtf(textWithPageBreaks(editor));
      const rtf = `{\\rtf1\\ansi\\deff0\n{\\fonttbl{\\f0 Segoe UI;}}\n\\f0\\fs22 ${text}\n}`;
      downloadBlob(rtf, `${filename}.rtf`, "application/rtf;charset=utf-8");
      return;
    }
    case "pdf": {
      printAsPdf(docTitle, editor.innerHTML);
      return;
    }
  }
}
