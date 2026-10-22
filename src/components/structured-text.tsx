import { parseItemText } from "@/lib/item-text";

/**
 * Plan item text with its structure: bullets, numbered points, sub-headings and paragraphs (see
 * `src/lib/item-text.ts`). Plain React elements only, no HTML from the text. Inherits the font size and colour.
 */
export function StructuredText({ text, className = "" }: { text: string; className?: string }) {
  const blocks = parseItemText(text);
  return (
    <div className={`space-y-1 break-words ${className}`}>
      {blocks.map((block, i) => {
        if (block.type === "heading") {
          return (
            <p key={i} className="pt-1 text-[0.85em] font-extrabold first:pt-0">
              {block.text}
            </p>
          );
        }
        if (block.type === "bullets") {
          return (
            <ul key={i} className="list-disc space-y-0.5 pl-5">
              {block.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ul>
          );
        }
        if (block.type === "numbered") {
          return (
            <ol key={i} className={`${block.style === "alpha" ? "list-[lower-alpha]" : "list-decimal"} space-y-0.5 pl-6`}>
              {block.items.map((item, j) => (
                <li key={j}>{item}</li>
              ))}
            </ol>
          );
        }
        return <p key={i}>{block.text}</p>;
      })}
    </div>
  );
}
