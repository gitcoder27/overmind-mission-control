import { memo, useMemo, type ComponentPropsWithoutRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

/* ────────────────────────────────────────────────────────────────
 * MarkdownRenderer
 * Lightweight, memoized wrapper around react-markdown + remark-gfm.
 * Renders GitHub-flavoured Markdown (bold, italic, lists, tables,
 * code blocks, links, etc.) with dark-theme–aware prose styles.
 *
 * Usage:
 *   <MarkdownRenderer content={text} className="text-sm" />
 * ──────────────────────────────────────────────────────────────── */

const REMARK_PLUGINS = [remarkGfm];

/* Custom component overrides for dark theme styling */
const MD_COMPONENTS: ComponentPropsWithoutRef<typeof ReactMarkdown>['components'] = {
  /* ── Block elements ── */
  h1: ({ children }) => (
    <h1 className="text-lg font-bold mt-4 mb-2 text-text-primary">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-base font-bold mt-3 mb-1.5 text-text-primary">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold mt-2.5 mb-1 text-text-primary">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-semibold mt-2 mb-1 text-text-secondary">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-accent/40 pl-3 my-2 text-text-secondary italic">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-border" />,

  /* ── Lists ── */
  ul: ({ children }) => (
    <ul className="list-disc pl-5 mb-2 space-y-0.5">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal pl-5 mb-2 space-y-0.5">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="leading-relaxed">{children}</li>
  ),

  /* ── Code ── */
  code: ({ className, children, ...props }) => {
    const isBlock = className?.includes('language-');
    if (isBlock) {
      return (
        <code className={cn('block text-[12px] leading-relaxed', className)} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code
        className="rounded bg-surface-hover px-1.5 py-0.5 text-[12px] font-mono text-accent break-all"
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="rounded-lg bg-void/60 border border-border/30 p-3 my-2 overflow-x-auto text-[12px] font-mono text-text-secondary leading-relaxed">
      {children}
    </pre>
  ),

  /* ── Tables ── */
  table: ({ children }) => (
    <div className="overflow-x-auto my-2 rounded-lg border border-border/30">
      <table className="min-w-full text-[12px]">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-surface-elevated/50 text-text-secondary">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="px-3 py-1.5 text-left font-semibold border-b border-border/30">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-1.5 border-b border-border/10">{children}</td>
  ),

  /* ── Inline elements ── */
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-info hover:text-info/80 underline underline-offset-2 transition-colors"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-text-primary">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-text-secondary">{children}</em>
  ),
  del: ({ children }) => (
    <del className="text-text-muted line-through">{children}</del>
  ),

  /* ── Task list checkboxes (GFM) ── */
  input: ({ type, checked, ...props }) => {
    if (type === 'checkbox') {
      return (
        <input
          type="checkbox"
          checked={checked}
          readOnly
          className="mr-1.5 accent-accent align-middle"
          {...props}
        />
      );
    }
    return <input type={type} {...props} />;
  },
};

interface MarkdownRendererProps {
  /** Raw markdown string to render */
  content: string;
  /** Additional CSS classes applied to the wrapper */
  className?: string;
}

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  className,
}: MarkdownRendererProps) {
  /* Memoize the parsed content to avoid re-parsing on parent re-renders */
  const rendered = useMemo(
    () => (
      <ReactMarkdown remarkPlugins={REMARK_PLUGINS} components={MD_COMPONENTS}>
        {content}
      </ReactMarkdown>
    ),
    [content],
  );

  return (
    <div className={cn('markdown-prose text-sm leading-relaxed break-words', className)}>
      {rendered}
    </div>
  );
});
