import { createUIMessageStream, createUIMessageStreamResponse, type ModelMessage } from "ai";
import { z } from "zod";
import { buildChatSystem } from "@/lib/ai/prompts";
import { getChatModels, streamChatWithFallback } from "@/lib/ai/providers";
import { getLead, jsonError, MAX_CHAT_MESSAGES_PER_LEAD, readId, serverError } from "@/lib/api";
import { getServerSupabase } from "@/lib/supabase/server";
import type { LeadMessage } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60; // rule R10

type Ctx = { params: Promise<{ id: string }> };

const MAX_CHAT_TEXT = 2000;
const HISTORY_LIMIT = 20;

/*
 * Accepts either:
 *  - the body useChat (@ai-sdk/react) sends: { messages: UIMessage[], ... } - we read only the
 *    LAST user message, because history comes from the database, not from the client; or
 *  - a simple body for testing: { text: "..." }.
 */
const ChatBodySchema = z.object({
  text: z.string().optional(),
  messages: z
    .array(
      z.object({
        role: z.string(),
        parts: z.array(z.object({ type: z.string(), text: z.string().optional() }).loose()).optional(),
      }).loose()
    )
    .optional(),
}).loose();

function extractUserText(body: z.infer<typeof ChatBodySchema>): string {
  if (body.text) return body.text.trim();
  const lastUser = [...(body.messages ?? [])].reverse().find((m) => m.role === "user");
  return (lastUser?.parts ?? [])
    .filter((p) => p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("")
    .trim();
}

/**
 * POST /api/leads/[id]/chat -> streamed reply (UI message stream) grounded in this lead.
 * Saves the user message immediately and the assistant message when the stream ends.
 * 429 after 30 user messages on one lead (rule R12).
 */
export async function POST(req: Request, { params }: Ctx) {
  let body: z.infer<typeof ChatBodySchema>;
  try {
    const parsed = ChatBodySchema.safeParse(await req.json());
    if (!parsed.success) return jsonError(400, "Invalid chat request");
    body = parsed.data;
  } catch {
    return jsonError(400, "Request body must be valid JSON");
  }

  const text = extractUserText(body);
  if (!text) return jsonError(400, "Message is empty", { fieldErrors: { text: ["Type a message"] } });
  if (text.length > MAX_CHAT_TEXT) {
    return jsonError(400, `Message is too long (max ${MAX_CHAT_TEXT} characters)`, {
      fieldErrors: { text: [`Max ${MAX_CHAT_TEXT} characters`] },
    });
  }

  try {
    const id = await readId(params);
    if (!id) return jsonError(404, "Lead not found");
    const lead = await getLead(id);
    if (!lead) return jsonError(404, "Lead not found");

    const supabase = getServerSupabase();

    const { count, error: countError } = await supabase
      .from("lead_messages")
      .select("id", { count: "exact", head: true })
      .eq("lead_id", id)
      .eq("role", "user");
    if (countError) throw countError;
    if ((count ?? 0) >= MAX_CHAT_MESSAGES_PER_LEAD) {
      return jsonError(429, "Chat limit reached for this lead");
    }

    // Last 20 saved messages, oldest first.
    const { data: recent, error: historyError } = await supabase
      .from("lead_messages")
      .select("*")
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT);
    if (historyError) throw historyError;
    const history = ((recent ?? []) as LeadMessage[]).reverse();

    // Save the user message immediately, so it is never lost even if the AI fails.
    const { error: insertError } = await supabase
      .from("lead_messages")
      .insert({ lead_id: id, role: "user", content: text });
    if (insertError) throw insertError;

    const messages: ModelMessage[] = [
      ...history.map((m) => ({ role: m.role, content: m.content }) as ModelMessage),
      { role: "user", content: text },
    ];

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        writer.write({ type: "start" });
        const result = await streamChatWithFallback({
          models: getChatModels(),
          instructions: buildChatSystem(lead),
          messages,
          writer,
          abortSignal: req.signal,
        });
        if (result.text) {
          const { error } = await supabase
            .from("lead_messages")
            .insert({ lead_id: id, role: "assistant", content: result.text });
          if (error) console.error("[chat] could not save assistant message:", error.message);
        }
        writer.write({ type: "finish" });
      },
      onError: (err) => {
        console.error("[chat] stream error:", err);
        return "Something went wrong. Please try again.";
      },
    });

    return createUIMessageStreamResponse({ stream });
  } catch (err) {
    return serverError(err);
  }
}
