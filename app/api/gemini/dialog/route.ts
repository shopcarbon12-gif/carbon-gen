import { GoogleGenAI } from "@google/genai";
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

function isAuthError(err: unknown) {
  const status = Number((err as any)?.status || (err as any)?.statusCode || 0);
  const message = String((err as any)?.message || "");
  if (status === 401 || status === 403) return true;
  return /api key|invalid key|unauthorized|forbidden/i.test(message);
}

function isRateLimitError(err: unknown) {
  const status = Number((err as any)?.status || (err as any)?.statusCode || 0);
  const message = String((err as any)?.message || "");
  if (status === 429) return true;
  return /rate limit|quota|too many requests|resource exhausted/i.test(message);
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

    const apiKey = normalizeText(process.env.GEMINI_API_KEY);
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "GEMINI_API_KEY is not configured. Add it to .env.local and restart the dev server.",
        },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({ apiKey });
    const model = normalizeText(process.env.GEMINI_DIALOG_MODEL) || "gemini-2.5-flash";

    const systemInstruction = [
      "You are Carbon Studio Assistant inside a generation workspace.",
      "Primary job: answer questions about generation failures, reference usage, and workflow behavior.",
      "Use provided workspace context and latest generation error payload first.",
      "When the user asks why an item was not used, troubleshoot with concrete checks: item type mismatch, missing saved refs, pending uploads, failed imports, conflicting refs, or moderation blocks.",
      "Give short, actionable next steps.",
      "Do not answer with generic capability disclaimers. If pixels are unavailable in chat, say you cannot directly inspect pixels here and continue with context-based diagnosis.",
      "If needed, ask at most two focused follow-up questions.",
      "Keep responses concise, technical, and practical.",
    ].join(" ");

    const contextParts: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    if (contextScope) {
      contextParts.push({
        role: "user",
        parts: [{ text: `[Context scope: ${contextScope}]` }],
      });
      contextParts.push({
        role: "model",
        parts: [{ text: "Understood, I'll keep this scope in mind." }],
      });
    }
    if (contextSummary) {
      contextParts.push({
        role: "user",
        parts: [{ text: `[Workspace generation context]\n${contextSummary}` }],
      });
      contextParts.push({
        role: "model",
        parts: [{ text: "Got it, I have the workspace context." }],
      });
    }
    if (contextError) {
      contextParts.push({
        role: "user",
        parts: [{ text: `[Latest generation error context]\n${contextError}` }],
      });
      contextParts.push({
        role: "model",
        parts: [{ text: "I see the error details. What would you like to know?" }],
      });
    }

    const geminiMessages = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const allContents = [...contextParts, ...geminiMessages];

    const response = await ai.models.generateContent({
      model,
      config: {
        systemInstruction,
        temperature: 0.2,
        maxOutputTokens: 900,
      },
      contents: allContents,
    });

    const reply = normalizeText(response.text || "");

    if (!reply) {
      return NextResponse.json({ error: "Chat returned empty content." }, { status: 502 });
    }

    return NextResponse.json({ reply });
  } catch (e: any) {
    if (isAuthError(e)) {
      return NextResponse.json(
        {
          error:
            "Gemini authentication failed on server. Update GEMINI_API_KEY in production env and redeploy.",
        },
        { status: 500 }
      );
    }
    if (isRateLimitError(e)) {
      return NextResponse.json(
        { error: "Gemini rate limit reached. Wait a moment and try again." },
        { status: 429 }
      );
    }
    const details = e?.message || "Gemini dialog failed";
    return NextResponse.json(
      { error: "Gemini dialog failed", details, geminiRaw: details },
      { status: 500 }
    );
  }
}
