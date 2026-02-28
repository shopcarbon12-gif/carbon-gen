import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { syncCustomerLsHistory } from "@/lib/lightspeedCustomerSync";
import { lsGet } from "@/lib/lightspeedApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

export async function POST(req: NextRequest) {
  const secret = normalizeText(process.env.CRON_SECRET);
  const auth = normalizeText(req.headers.get("authorization"));
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { email?: string; ls_customer_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = normalizeLower(body.email);
  let lsCustomerId = normalizeText(body.ls_customer_id);

  if (!email) {
    return NextResponse.json({ error: "email is required" }, { status: 400 });
  }

  if (!lsCustomerId) {
    try {
      const result = await lsGet<any>("Customer", {
        "Contact.Emails.ContactEmail.address": `~,${email}`,
        limit: "1",
      });
      const customers = result?.Customer
        ? Array.isArray(result.Customer) ? result.Customer : [result.Customer]
        : [];
      if (customers.length > 0) {
        lsCustomerId = normalizeText(customers[0].customerID);
      }
    } catch { /* not found */ }
  }

  if (!lsCustomerId) {
    return NextResponse.json({ error: "No LS customer found for this email" }, { status: 404 });
  }

  try {
    await syncCustomerLsHistory(lsCustomerId, email);
    return NextResponse.json({ ok: true, email, ls_customer_id: lsCustomerId });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
}
