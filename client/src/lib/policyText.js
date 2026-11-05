// Turns a policy .txt file into a small list of blocks. Pure (no React, no HTML): the page renders blocks as text nodes, so file content
// can never inject markup. Understands the two layouts the policy files use: Markdown-style (# / ### / - / **bold**) and plain text
// ("1. Heading" lines and short stand-alone sub-heading lines).
// Block: { type: "title"|"h2"|"h3"|"p"|"ul", text?, lines?, items? }

const isBlank = (l) => l.trim() === "";
const TERMINAL = /[.!?:;,]$/;

export function parsePolicy(raw) {
  const lines = String(raw ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let para = [], list = [];
  const flushPara = () => { if (para.length) blocks.push({ type: "p", lines: para }); para = []; };
  const flushList = () => { if (list.length) blocks.push({ type: "ul", items: list }); list = []; };
  const flush = () => { flushPara(); flushList(); };
  let sawTitle = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+$/, "");
    const prevBlank = i === 0 || isBlank(lines[i - 1]);
    const nextBlank = i === lines.length - 1 || isBlank(lines[i + 1]);
    if (isBlank(line)) { flush(); continue; }

    let m;
    if ((m = /^#\s+(.+)$/.exec(line))) { flush(); blocks.push({ type: sawTitle ? "h2" : "title", text: m[1].trim() }); sawTitle = true; continue; }
    if ((m = /^#{2,3}\s+(.+)$/.exec(line))) { flush(); blocks.push({ type: "h2", text: m[1].trim() }); continue; }
    if ((m = /^[-*]\s+(.+)$/.exec(line))) { flushPara(); list.push(m[1].trim()); continue; }

    // Plain-text layouts
    if (!sawTitle && blocks.length === 0 && prevBlank && nextBlank && line.length <= 80 && !TERMINAL.test(line)) { blocks.push({ type: "title", text: line.trim() }); sawTitle = true; continue; }
    if (prevBlank && nextBlank && /^\d+\.\s+\S/.test(line) && line.length <= 80 && !TERMINAL.test(line)) { flush(); blocks.push({ type: "h2", text: line.trim() }); continue; }
    if (prevBlank && nextBlank && line.length <= 40 && !/[:.!?,;]/.test(line)) { flush(); blocks.push({ type: "h3", text: line.trim() }); continue; }

    flushList();
    para.push(line.trim());
  }
  flush();
  return blocks;
}

// Inline pieces of one line: **bold**, https:// links, e-mail addresses, and references to the other policies.
// -> [{ text, bold? , href? , to? }]
const POLICY_REFS = [["Shipping & Delivery Policy", "/policies/shipping"], ["Refund & Return Policy", "/policies/refund"]];
export function inlineParts(text) {
  const out = [];
  const re = /\*\*(.+?)\*\*|(https:\/\/[^\s<>"']+[^\s<>"'.,;:!?)])|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})|(Shipping & Delivery Policy|Refund & Return Policy)/g;
  let last = 0, m;
  const pushPlain = (s) => { if (s) out.push({ text: s }); };
  while ((m = re.exec(text))) {
    pushPlain(text.slice(last, m.index));
    if (m[1] !== undefined) out.push({ text: m[1], bold: true });
    else if (m[2]) out.push({ text: m[2], href: m[2] });
    else if (m[3]) out.push({ text: m[3], href: `mailto:${m[3]}` });
    else out.push({ text: m[4], to: POLICY_REFS.find(([n]) => n === m[4])[1] });
    last = m.index + m[0].length;
  }
  pushPlain(text.slice(last));
  return out;
}
