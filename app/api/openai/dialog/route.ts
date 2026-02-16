import OpenAI from "openai";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";

type DialogMessage = {
  role: "user" | "assistant";
  content: string;
};

function normalizeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isOpenAiAuthError(err: unknown) {
  const status = Number((err as any)?.status || (err as any)?.statusCode || 0);
  const message = String((err as any)?.message || "");
  if (status === 401) return true;
  return /incorrect api key|invalid api key|api key provided/i.test(message);
}

function isOpenAiRateLimitError(err: unknown) {
  const status = Number((err as any)?.status || (err as any)?.statusCode || 0);
  const message = String((err as any)?.message || "");
  if (status === 429) return true;
  return /rate limit|quota|too many requests/i.test(message);
}

function normalizeMessages(value: unknown): DialogMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      const role = row?.role === "assistant" ? "assistant" : "user";
      const content = typeof row?.content === "string" ? row.content.trim() : "";
      if (!content) return null;
      return { role, content } as DialogMessage;
    })
    .filter((row): row is DialogMessage => Boolean(row))
    .slice(-20);
}

export async function POST(req: NextRequest) {
  if (!isRequestAuthed(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const messages = normalizeMessages(body?.messages);
    const contextError = normalizeText(body?.contextError).slice(0, 6000);
    const contextSummary = normalizeText(body?.contextSummary).slice(0, 12000);
    const contextScope = normalizeText(body?.contextScope).slice(0, 80);

    if (!messages.length) {
      return NextResponse.json({ error: "Missing dialog messages" }, { status: 400 });
    }

    const apiKey = normalizeText(process.env.OPENAI_API_KEY);
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "OPENAI_API_KEY is not configured. Add it to .env.local and restart the dev server.",
        },
        { status: 500 }
      );
    }

    const client = new OpenAI({ apiKey });
    const model =
      normalizeText(process.env.OPENAI_DIALOG_MODEL) ||
      normalizeText(process.env.OPENAI_CHAT_MODEL) ||
      "gpt-4o-mini";
    const system = [
      "You are Carbon Studio Assistant inside a generation workspace.",
      "Primary job: answer questions about generation failures, reference usage, and workflow behavior.",
      "Use provided workspace context and latest generation error payload first.",
      "When the user asks why an item was not used, troubleshoot with concrete checks: item type mismatch, missing saved refs, pending uploads, failed imports, conflicting refs, or moderation blocks.",
      "Give short, actionable next steps.",
      "Do not answer with generic capability disclaimers. If pixels are unavailable in chat, say you cannot directly inspect pixels here and continue with context-based diagnosis.",
      "If needed, ask at most two focused follow-up questions.",
      "Keep responses concise, technical, and practical.",
    ].join(" ");

    let reply = "";
    try {
      const response = await client.responses.create({
        model,
        temperature: 0.2,
        max_output_tokens: 900,
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: system }],
          },
          ...(contextScope
            ? [
                {
                  role: "system" as const,
                  content: [
                    {
                      type: "input_text" as const,
                      text: `Dialog scope: ${contextScope}`,
                    },
                  ],
                },
              ]
            : []),
          ...(contextSummary
            ? [
                {
                  role: "system" as const,
                  content: [
                    {
                      type: "input_text" as const,
                      text: `Workspace generation context:\n${contextSummary}`,
                    },
                  ],
                },
              ]
            : []),
          ...(contextError
            ? [
                {
                  role: "system" as const,
                  content: [
                    {
                      type: "input_text" as const,
                      text: `Latest generation error context:\n${contextError}`,
                    },
                  ],
                },
              ]
            : []),
          ...messages.map((m) => ({
            role: m.role,
            content: [{ type: "input_text" as const, text: m.content }],
          })),
        ],
      });
      reply = normalizeText(response.output_text);
    } catch {
      reply = "";
    }

    if (!reply) {
      const completion = await client.chat.completions.create({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: system },
          ...(contextScope
            ? [
                {
                  role: "system" as const,
                  content: `Dialog scope: ${contextScope}`,
                },
              ]
            : []),
          ...(contextSummary
            ? [
                {
                  role: "system" as const,
                  content: `Workspace generation context:\n${contextSummary}`,
                },
              ]
            : []),
          ...(contextError
            ? [
                {
                  role: "system" as const,
                  content: `Latest generation error context:\n${contextError}`,
                },
              ]
            : []),
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
      });
      reply = normalizeText(completion.choices?.[0]?.message?.content);
    }

    if (!reply) {
      return NextResponse.json({ error: "Chat returned empty content." }, { status: 502 });
    }

    return NextResponse.json({ reply });
  } catch (e: any) {
    if (isOpenAiAuthError(e)) {
      return NextResponse.json(
        {
          error:
            "OpenAI authentication failed on server. Update OPENAI_API_KEY in production env and redeploy.",
        },
        { status: 500 }
      );
    }
    if (isOpenAiRateLimitError(e)) {
      return NextResponse.json(
        { error: "OpenAI rate limit reached. Wait a moment and try again." },
        { status: 429 }
      );
    }
    const details = e?.message || "OpenAI dialog failed";
    return NextResponse.json(
      { error: "OpenAI dialog failed", details, openaiRaw: details },
      { status: 500 }
    );
  }
}
