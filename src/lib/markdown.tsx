import React, { memo } from "react";

/* ------------------------------------------------------------------ */
/*  Lightweight markdown-to-HTML renderer for chat messages.           */
/*  No heavy dependencies — just string parsing. Handles the common    */
/*  cases the AI actually sends: headings, bold/italic/strike,         */
/*  code blocks, inline code, links, lists, blockquotes, tables,       */
/*  horizontal rules, line breaks.                                     */
/* ------------------------------------------------------------------ */

interface MarkdownProps {
  content: string;
  className?: string;
}

/* ---- Inline parser (for text inside paragraphs, list items, etc.) --- */

function parseInline(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];

  // We scan left-to-right with regexes — priority order matters.
  // We collect raw + parsed spans, then merge.
  let cursor = 0;
  const spans: { start: number; end: number; type: string; raw: string; inner?: string }[] = [];

  const patterns: { re: RegExp; type: string }[] = [
    // Inline code (check first so backticks inside bold don't match)
    { re: /`([^`\n]+)`/g, type: "code" },
    // Bold+italic
    { re: /\*\*\*([^*\n]+)\*\*\*/g, type: "bold-italic" },
    // Bold
    { re: /\*\*([^*\n]+)\*\*/g, type: "bold" },
    // Italic
    { re: /\*([^*\n]+)\*/g, type: "italic" },
    // Strikethrough
    { re: /~~([^~\n]+)~~/g, type: "strike" },
    // Link  [text](url)
    { re: /\[([^\]]+)\]\(([^)]+)\)/g, type: "link" },
  ];

  // Collect all matches
  for (const { re, type } of patterns) {
    const regex = new RegExp(re.source, re.flags);
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text))) {
      spans.push({ start: m.index, end: m.index + m[0].length, type, raw: m[0], inner: m[1] });
    }
  }

  // Sort by start position, then pick non-overlapping (first wins)
  spans.sort((a, b) => a.start - b.start || a.end - b.end);
  const picked: typeof spans = [];
  let lastEnd = 0;
  for (const s of spans) {
    if (s.start >= lastEnd) {
      picked.push(s);
      lastEnd = s.end;
    }
  }

  // Build the array
  for (const s of picked) {
    if (s.start > cursor) tokens.push(text.slice(cursor, s.start));
    const inner = s.inner ?? "";
    switch (s.type) {
      case "code":
        tokens.push(
          <code
            key={`i-${s.start}`}
            className="px-1 py-0.5 rounded-sm text-[11px] font-mono"
            style={{ backgroundColor: "var(--ch-code-bg)", color: "var(--ch-code-text)" }}
          >
            {inner}
          </code>
        );
        break;
      case "bold":
        tokens.push(<strong key={`i-${s.start}`} className="font-bold">{parseInline(inner)}</strong>);
        break;
      case "italic":
        tokens.push(<em key={`i-${s.start}`} className="italic">{parseInline(inner)}</em>);
        break;
      case "bold-italic":
        tokens.push(<span key={`i-${s.start}`} className="font-bold italic">{parseInline(inner)}</span>);
        break;
      case "strike":
        tokens.push(<s key={`i-${s.start}`}>{inner}</s>);
        break;
      case "link": {
        const url = s.inner!;
        const urlRe = /\[([^\]]+)\]\(([^)]+)\)/;
        const lm = urlRe.exec(s.raw);
        if (lm) {
          tokens.push(
            <a
              key={`i-${s.start}`}
              href={lm[2]}
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
              style={{ color: "var(--ch-link)" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--ch-link-hover)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = "var(--ch-link)"; }}
            >
              {lm[1]}
            </a>
          );
        }
        break;
      }
    }
    cursor = s.end;
  }

  if (cursor < text.length) tokens.push(text.slice(cursor));
  return tokens.length ? tokens : [text];
}

/* ---- Block parser ---- */

function parseBlock(content: string): React.ReactNode[] {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Horizontal rule
    if (/^(-{3,}|_{3,}|\*{3,})\s*$/.test(line.trim())) {
      elements.push(
        <hr key={`hr-${i}`} className="my-3" style={{ borderColor: "var(--ch-border)" }} />
      );
      i++;
      continue;
    }

    // Fenced code block
    const codeMatch = line.match(/^```(\w+)?\s*$/);
    if (codeMatch) {
      const lang = codeMatch[1] || "";
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre
          key={`code-${i}`}
          className="border rounded-sm p-3 my-2 overflow-x-auto"
          style={{ backgroundColor: "var(--ch-bg-inset)", borderColor: "var(--ch-border-subtle)" }}
        >
          <code className="text-[12px] leading-relaxed font-mono whitespace-pre" style={{ color: "var(--ch-text)" }}>
            {codeLines.join("\n")}
          </code>
        </pre>
      );
      continue;
    }

    // ATX headings
    const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (hMatch) {
      const level = hMatch[1].length;
      const sizeMap: Record<number, string> = {
        1: "text-[20px] font-bold",
        2: "text-[17px] font-bold",
        3: "text-[15px] font-bold",
        4: "text-[14px] font-bold",
        5: "text-[13px] font-bold",
        6: "text-[12px] font-bold",
      };
      switch (level) {
        case 1: elements.push(<h1 key={`h-${i}`} className={`${sizeMap[1]} mt-3 mb-1`}>{parseInline(hMatch[2])}</h1>); break;
        case 2: elements.push(<h2 key={`h-${i}`} className={`${sizeMap[2]} mt-3 mb-1`}>{parseInline(hMatch[2])}</h2>); break;
        case 3: elements.push(<h3 key={`h-${i}`} className={`${sizeMap[3]} mt-3 mb-1`}>{parseInline(hMatch[2])}</h3>); break;
        case 4: elements.push(<h4 key={`h-${i}`} className={`${sizeMap[4]} mt-3 mb-1`}>{parseInline(hMatch[2])}</h4>); break;
        case 5: elements.push(<h5 key={`h-${i}`} className={`${sizeMap[5]} mt-3 mb-1`}>{parseInline(hMatch[2])}</h5>); break;
        default: elements.push(<h6 key={`h-${i}`} className={`${sizeMap[6]} mt-3 mb-1`}>{parseInline(hMatch[2])}</h6>); break;
      }
      i++;
      continue;
    }

    // Blockquote
    if (line.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i].startsWith(">") || (lines[i].trim() !== "" && lines[i].trim().length > 0 && quoteLines.length > 0 && quoteLines[quoteLines.length - 1] !== ""))) {
        if (lines[i].startsWith(">")) {
          quoteLines.push(lines[i].replace(/^>\s?/, ""));
        } else {
          break;
        }
        i++;
      }
      elements.push(
        <blockquote
          key={`bq-${i}`}
          className="border-l-2 pl-3 my-2 italic"
          style={{ borderColor: "var(--ch-border)", color: "var(--ch-text-faint)" }}
        >
          {quoteLines.map((l, li) => (
            <div key={li}>{parseInline(l)}</div>
          ))}
        </blockquote>
      );
      continue;
    }

    // Unordered list
    if (/^(\s*[-*])\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^(\s*[-*])\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s/, ""));
        i++;
      }
      elements.push(
        <ul key={`ul-${i}`} className="list-disc list-inside my-2 ml-2 space-y-0.5">
          {items.map((li, idx) => (
            <li key={idx} className="text-[12px] leading-relaxed">
              {parseInline(li)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Ordered list
    if (/^\s*\d+[.)]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+[.)]\s/, ""));
        i++;
      }
      elements.push(
        <ol key={`ol-${i}`} className="list-decimal list-inside my-2 ml-2 space-y-0.5">
          {items.map((li, idx) => (
            <li key={idx} className="text-[12px] leading-relaxed">
              {parseInline(li)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // Empty line → break
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-special lines
    const pLines: string[] = [];
    while (
      i < lines.length &&
      !lines[i].startsWith("```") &&
      !lines[i].startsWith("#") &&
      !lines[i].startsWith(">") &&
      !/^(\s*[-*])\s/.test(lines[i]) &&
      !/^\s*\d+[.)]\s/.test(lines[i]) &&
      !/^(-{3,}|_{3,}|\*{3,})\s*$/.test(lines[i].trim()) &&
      lines[i].trim() !== ""
    ) {
      pLines.push(lines[i]);
      i++;
    }
    if (pLines.length > 0) {
      elements.push(
        <p key={`p-${i}`} className="text-[12px] leading-relaxed my-1">
          {parseInline(pLines.join("\n"))}
        </p>
      );
    }
  }

  return elements;
}

/* ---- Export ---- */

export const MarkdownContent = memo(function MarkdownContent({
  content,
  className,
}: MarkdownProps) {
  if (!content) return null;
  return <div className={className}>{parseBlock(content)}</div>;
});
