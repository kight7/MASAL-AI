"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";

/** Copies text to the clipboard and shows a tick for 2 seconds. */
export function CopyButton({
  text,
  label = "Copy",
  showLabel = true,
  className = "",
}: {
  text: string;
  label?: string;
  showLabel?: boolean;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      toast.error("Could not copy. Select the text and copy it manually.");
    }
  }

  const Icon = copied ? Check : Copy;
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Copied" : label}
      className={`inline-flex min-h-10 items-center sm:min-h-8 gap-1.5 rounded-md border border-[#D5DDE6] bg-white px-2.5 text-xs font-medium text-[#14213D] outline-none transition-colors hover:bg-[#F3F5F8] focus-visible:ring-2 focus-visible:ring-[#14213D] ${className}`}
    >
      <Icon className={`size-3.5 ${copied ? "text-[#1F7A4D]" : ""}`} aria-hidden />
      {showLabel && (copied ? "Copied" : label)}
    </button>
  );
}
