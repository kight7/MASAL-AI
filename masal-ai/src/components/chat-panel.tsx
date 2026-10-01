"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ArrowUp, LoaderCircle, MessageSquareText, RotateCw, Square } from "lucide-react";
import { CopyButton } from "@/components/copy-button";
import type { Lead, LeadMessage } from "@/lib/types";

export const QUICK_PROMPTS = [
  "What should I emphasize on the call?",
  "Make my reply more assertive",
  "Shorten my reply for WhatsApp",
  "How do I handle their main concern?",
  "Which property should I pitch first?",
];

const MAX_TEXT = 2000;

function toUIMessages(rows: LeadMessage[]): UIMessage[] {
  return rows.map((m) => ({ id: m.id, role: m.role, parts: [{ type: "text", text: m.content }] }));
}

function messageText(m: UIMessage): string {
  return m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
}

/** Turns API error bodies like {"error":"..."} into a readable sentence. */
function friendlyError(err: Error): string {
  try {
    const parsed = JSON.parse(err.message);
    if (typeof parsed?.error === "string") return parsed.error;
  } catch {
    /* not JSON */
  }
  return err.message || "Something went wrong. Please try again.";
}

/** Minimal formatting for replies: paragraphs, "- " or "1. " lists and **bold**. No HTML is injected. */
function RichText({ text }: { text: string }) {
  const inline = (line: string) =>
    line.split(/(\*\*[^*]+\*\*)/g).map((chunk, i) =>
      chunk.startsWith("**") && chunk.endsWith("**") ? <strong key={i}>{chunk.slice(2, -2)}</strong> : <Fragment key={i}>{chunk}</Fragment>
    );

  const blocks: React.ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (!list) return;
    const Tag = list.ordered ? "ol" : "ul";
    blocks.push(
      <Tag key={blocks.length} className={`${list.ordered ? "list-decimal" : "list-disc"} space-y-1 pl-5`}>
        {list.items.map((it, i) => (
          <li key={i}>{inline(it)}</li>
        ))}
      </Tag>
    );
    list = null;
  };

  for (const raw of text.split("\n")) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = !!numbered;
      if (list && list.ordered !== ordered) flush();
      if (!list) list = { ordered, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    flush();
    if (line.trim() === "") continue;
    blocks.push(<p key={blocks.length}>{inline(line.replace(/^#+\s*/, ""))}</p>);
  }
  flush();
  return <div className="space-y-2">{blocks}</div>;
}

/**
 * Chat grounded in ONE lead. The server builds the context from the lead and its analysis;
 * this component only sends the newest message (history lives in the database).
 */
export function ChatPanel({ lead, initialMessages }: { lead: Lead; initialMessages: LeadMessage[] }) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: `/api/leads/${lead.id}/chat`,
        // Send only the newest user message; the server loads the history itself.
        prepareSendMessagesRequest: ({ messages }) => {
          const lastUser = [...messages].reverse().find((m) => m.role === "user");
          return { body: { text: lastUser ? messageText(lastUser) : "" } };
        },
      }),
    [lead.id]
  );

  const { messages, sendMessage, regenerate, stop, status, error, clearError } = useChat({
    id: `lead-${lead.id}`,
    messages: toUIMessages(initialMessages),
    transport,
  });

  const busy = status === "submitted" || status === "streaming";

  // Keep the newest message in view while streaming.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: status === "streaming" ? "auto" : "smooth" });
  }, [messages, status]);

  function send(text: string) {
    const t = text.trim();
    if (!t || busy || t.length > MAX_TEXT) return;
    clearError();
    void sendMessage({ text: t });
    setInput("");
    textareaRef.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  }

  const firstName = lead.name.split(" ")[0];
  // Retry is possible whenever there is a question to resend; regenerate() drops any partial reply first.
  const canRetry = messages.some((m) => m.role === "user");

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border bg-white">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <MessageSquareText className="size-4 text-[#14213D]" aria-hidden />
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-[#14213D]">Coach for {firstName}&apos;s lead</h2>
          <p className="truncate text-xs text-[#5B6B80]">Grounded in {lead.name}&apos;s inquiry and analysis</p>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4" aria-live="polite">
        {messages.length === 0 && (
          <div>
            <p className="text-sm text-[#5B6B80]">
              Ask anything about this lead, or start with one of these:
            </p>
            <div className="mt-3 grid gap-2">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => send(q)}
                  disabled={busy}
                  className="min-h-10 rounded-lg border border-[#D5DDE6] px-3 py-2 text-left text-sm text-[#14213D] outline-none transition-colors hover:border-[#14213D] hover:bg-[#F3F5F8] focus-visible:ring-2 focus-visible:ring-[#14213D] disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => {
          const text = messageText(m);
          if (m.role === "user") {
            return (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-lg rounded-br-sm bg-[#14213D] px-3 py-2 text-sm text-white">
                  {text}
                </p>
              </div>
            );
          }
          if (!text) return null;
          return (
            <div key={m.id} className="group max-w-[95%]">
              <div className="rounded-lg rounded-bl-sm bg-[#F3F5F8] px-3 py-2 text-sm leading-relaxed text-[#14213D]">
                <RichText text={text} />
              </div>
              {!(busy && m.id === messages[messages.length - 1]?.id) && (
                <div className="mt-1">
                  <CopyButton text={text} label="Copy" className="border-transparent px-1.5 text-[#5B6B80]" />
                </div>
              )}
            </div>
          );
        })}

        {status === "submitted" && (
          <p className="flex items-center gap-2 text-sm text-[#5B6B80]">
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
            Thinking about {firstName}&apos;s lead…
          </p>
        )}

        {error && !busy && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#F2D3D8] bg-[#FDF3F5] px-3 py-2 text-sm text-[#14213D]" role="alert">
            <span>{friendlyError(error)}</span>
            {canRetry && (
              <button
                type="button"
                onClick={() => {
                  clearError();
                  void regenerate();
                }}
                className="inline-flex items-center gap-1 rounded-md font-medium text-[#14213D] underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-[#14213D]"
              >
                <RotateCw className="size-3.5" aria-hidden />
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      <form
        className="border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <div className="flex items-end gap-2 rounded-lg border border-[#D5DDE6] bg-white p-1.5 focus-within:border-[#14213D] focus-within:ring-2 focus-within:ring-[#14213D]/15">
          <label htmlFor="chat-input" className="sr-only">
            Ask about this lead
          </label>
          <textarea
            id="chat-input"
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            rows={2}
            maxLength={MAX_TEXT}
            placeholder={`Ask about ${firstName}…`}
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-[#14213D] outline-none placeholder:text-[#8A96A6]"
          />
          {busy ? (
            <button
              type="button"
              onClick={() => void stop()}
              aria-label="Stop generating"
              className="flex size-10 shrink-0 items-center justify-center rounded-md border border-[#D5DDE6] text-[#14213D] outline-none hover:bg-[#F3F5F8] focus-visible:ring-2 focus-visible:ring-[#14213D]"
            >
              <Square className="size-3.5 fill-current" aria-hidden />
            </button>
          ) : (
            <button
              type="submit"
              disabled={!input.trim()}
              aria-label="Send message"
              className="flex size-10 shrink-0 items-center justify-center rounded-md bg-[#14213D] text-white outline-none hover:bg-[#1F3157] focus-visible:ring-2 focus-visible:ring-[#14213D] focus-visible:ring-offset-2 disabled:opacity-40"
            >
              <ArrowUp className="size-4" aria-hidden />
            </button>
          )}
        </div>
        <p className="mt-1.5 px-1 text-[11px] text-[#8A96A6]">Enter to send, Shift+Enter for a new line</p>
      </form>
    </div>
  );
}
