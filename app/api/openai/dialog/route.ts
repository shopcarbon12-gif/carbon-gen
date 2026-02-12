import OpenAI from "openai";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isRequestAuthed } from "@/lib/auth";

type DialogMessage = {
  role: "user" | "assistant";
  content: string;
};

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
    const contextError =
      typeof body?.contextError === "string" ? body.contextError.trim().slice(0, 6000) : "";

    if (!messages.length) {
      return NextResponse.json({ error: "Missing dialog messages" }, { status: 400 });
    }

    const apiKey = (process.env.OPENAI_API_KEY || "").trim();
    if (!apiKey) {
      return NextResponse.json({
        reply:
          "OPENAI_API_KEY is not configured. Check .env.local, then restart dev server and retry.",
      });
    }

    const client = new OpenAI({ apiKey });
    const system =
      "You are a concise troubleshooting assistant for a fashion ecommerce image studio app. " +
      "Give practical debugging steps, likely causes, and exact next actions.";

    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "system", content: system },
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

    const reply = completion.choices?.[0]?.message?.content?.trim() || "(No response text)";
    return NextResponse.json({ reply });
  } catch (e: any) {
    const details = e?.message || "OpenAI dialog failed";
    return NextResponse.json(
      { error: "OpenAI dialog failed", details, openaiRaw: details },
      { status: 500 }
    );
  }
}
