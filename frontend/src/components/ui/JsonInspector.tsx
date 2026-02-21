import { useState } from 'react';
import { ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface JsonInspectorProps {
  data: unknown;
  label?: string;
  defaultOpen?: boolean;
}

export function JsonInspector({ data, label = 'Raw Data', defaultOpen = false }: JsonInspectorProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);

  const json = JSON.stringify(data, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-border bg-surface">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
      >
        <span className="flex items-center gap-1.5">
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {label}
        </span>
      </button>
      {open && (
        <div className="relative border-t border-border">
          <button
            onClick={handleCopy}
            className="absolute right-2 top-2 rounded p-1 text-text-muted hover:text-text-primary hover:bg-surface-elevated transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Copy className="h-3.5 w-3.5" />}
          </button>
          <pre className={cn('overflow-auto p-3 text-[11px] leading-relaxed font-mono text-text-secondary max-h-80')}>
            {json}
          </pre>
        </div>
      )}
    </div>
  );
}
