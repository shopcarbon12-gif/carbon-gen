import { NextResponse } from "next/server";
import { lsGet, lsPut, lsDelete } from "@/lib/lightspeedApi";
import { findOrCreateCustomer } from "@/lib/lightspeedCustomerSync";

export const maxDuration = 120;

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization") || "";
  const cronSecret = process.env.CRON_SECRET || "";
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const mode = body.mode || "update";

  if (mode === "search") {
    return handleSearch(body);
  }
  if (mode === "find-or-create") {
    return handleFindOrCreate(body);
  }
  if (mode === "cleanup-phones") {
    return handleCleanupPhones(body);
  }
  if (mode === "merge") {
    return handleMerge(body);
  }
  if (mode === "void-sale") {
    return handleVoidSale(body);
  }
  return handleUpdate(body);
}

async function handleSearch(body: any) {
  const results: Record<string, unknown> = {};
  const email = body.email || "";
  const phone = body.phone || "";

  if (email) {
    try {
      const r = await lsGet<any>("Customer", {
        "Contact.Emails.ContactEmail.address": `~,${email}`,
        limit: "100",
        load_relations: '["Contact"]',
      });
      const list = r?.Customer ? (Array.isArray(r.Customer) ? r.Customer : [r.Customer]) : [];
      results.emailMatches = list.map((c: any) => ({
        customerID: c.customerID,
        firstName: c.firstName,
        lastName: c.lastName,
        createTime: c.createTime,
        email: c.Contact?.Emails?.ContactEmail,
        phone: c.Contact?.Phones?.ContactPhone,
      }));
    } catch (err: any) {
      results.emailSearchError = String(err?.message || err);
    }
  }

  if (phone) {
    const cleaned = phone.replace(/[^0-9+]/g, "");
    try {
      const r = await lsGet<any>("Customer", {
        "Contact.Phones.ContactPhone.number": `~,${cleaned}`,
        limit: "100",
        load_relations: '["Contact"]',
      });
      const list = r?.Customer ? (Array.isArray(r.Customer) ? r.Customer : [r.Customer]) : [];
      results.phoneMatches = list.map((c: any) => ({
        customerID: c.customerID,
        firstName: c.firstName,
        lastName: c.lastName,
        createTime: c.createTime,
        email: c.Contact?.Emails?.ContactEmail,
        phone: c.Contact?.Phones?.ContactPhone,
      }));
    } catch (err: any) {
      results.phoneSearchError = String(err?.message || err);
    }
  }

  return NextResponse.json(results);
}

async function handleFindOrCreate(body: any) {
  const result = await findOrCreateCustomer(
    { first_name: body.firstName, last_name: body.lastName, email: body.email, phone: body.phone },
    body.address || null,
    null,
  );
  return NextResponse.json(result);
}

async function handleUpdate(body: any) {
  const customerId = body.customerId || "6";
  const newEmail = body.email || "elior@carbonjeanscompany.com";
  const newPhone = body.phone || "+13165186720";

  const steps: Record<string, unknown> = {};

  try {
    const current = await lsGet<any>(`Customer/${customerId}`, { load_relations: '["Contact"]' });
    steps.currentCustomer = {
      customerID: current?.Customer?.customerID,
      firstName: current?.Customer?.firstName,
      lastName: current?.Customer?.lastName,
      contact: current?.Customer?.Contact,
    };
  } catch (err: any) {
    steps.fetchError = String(err?.message || err);
    return NextResponse.json(steps);
  }

  const existingContact = (steps.currentCustomer as any)?.contact || {};
  const contactId = String(existingContact.contactID || "").trim();

  const existingEmails = existingContact.Emails?.ContactEmail;
  const emailArr = existingEmails ? (Array.isArray(existingEmails) ? existingEmails : [existingEmails]) : [];
  const firstEmailId = String(emailArr[0]?.contactEmailID || "").trim();

  const existingPhones = existingContact.Phones?.ContactPhone;
  const phoneArr = existingPhones ? (Array.isArray(existingPhones) ? existingPhones : [existingPhones]) : [];
  const firstPhoneId = String(phoneArr[0]?.contactPhoneID || "").trim();

  steps.existingIds = { contactId, firstEmailId, firstPhoneId };

  const contact: Record<string, unknown> = { noEmail: false, noMail: false, noPhone: false };
  if (contactId) contact.contactID = contactId;

  if (firstEmailId) {
    contact.Emails = { ContactEmail: [{ contactEmailID: firstEmailId, address: newEmail, useType: "Primary" }] };
  } else {
    contact.Emails = { ContactEmail: [{ address: newEmail, useType: "Primary" }] };
  }

  const cleaned = newPhone.replace(/[^0-9+]/g, "");
  contact.Phones = { ContactPhone: [{ number: cleaned, useType: "Mobile" }] };

  const payload = { contactConsent: true, Contact: contact };
  steps.updatePayload = payload;

  try {
    const result = await lsPut(`Customer/${customerId}`, payload);
    steps.putResult = result;
  } catch (err: any) {
    steps.putError = String(err?.message || err);
  }

  try {
    const after = await lsGet<any>(`Customer/${customerId}`, { load_relations: '["Contact"]' });
    steps.afterUpdate = {
      customerID: after?.Customer?.customerID,
      firstName: after?.Customer?.firstName,
      lastName: after?.Customer?.lastName,
      contact: after?.Customer?.Contact,
    };
  } catch (err: any) {
    steps.verifyError = String(err?.message || err);
  }

  return NextResponse.json(steps, { status: 200 });
}

async function handleCleanupPhones(body: any) {
  const customerId = body.customerId || "6";
  const keepPhone = (body.keepPhone || "").replace(/[^0-9+]/g, "");
  const steps: Record<string, unknown> = {};

  // Step 1: Overwrite both phone slots (Home + Mobile) with keepPhone to clear old numbers
  try {
    const cust = await lsGet<any>(`Customer/${customerId}`, { load_relations: '["Contact"]' });
    const contact = cust?.Customer?.Contact || {};
    const contactId = contact.contactID;

    const rawPhones = contact.Phones?.ContactPhone;
    const phoneArr = rawPhones ? (Array.isArray(rawPhones) ? rawPhones : [rawPhones]) : [];
    steps.beforePhones = phoneArr;

    // PUT with Mobile only — clear Home by setting it to empty
    const updatePayload = {
      contactConsent: true,
      Contact: {
        contactID: contactId,
        noPhone: false,
        Phones: {
          ContactPhone: [
            { number: "", useType: "Home" },
            { number: keepPhone, useType: "Mobile" },
          ],
        },
      },
    };
    steps.updatePayload = updatePayload;

    await lsPut(`Customer/${customerId}`, updatePayload);

    // Verify
    const after = await lsGet<any>(`Customer/${customerId}`, { load_relations: '["Contact"]' });
    const afterContact = after?.Customer?.Contact || {};
    const afterPhones = afterContact.Phones?.ContactPhone;
    steps.afterPhones = afterPhones;
    steps.afterCustomer = {
      customerID: after?.Customer?.customerID,
      firstName: after?.Customer?.firstName,
      lastName: after?.Customer?.lastName,
      email: afterContact.Emails?.ContactEmail,
    };
  } catch (err: any) {
    steps.updateError = String(err?.message || err);
  }

  // Step 2: Search for merge candidates — exact match and name search
  if (keepPhone) {
    // Search by exact phone
    try {
      const r = await lsGet<any>("Customer", {
        "Contact.Phones.ContactPhone.number": keepPhone,
        limit: "100",
        load_relations: '["Contact"]',
      });
      const list = r?.Customer ? (Array.isArray(r.Customer) ? r.Customer : [r.Customer]) : [];
      const filtered = list.filter((c: any) => {
        const phones = c.Contact?.Phones?.ContactPhone;
        const arr = phones ? (Array.isArray(phones) ? phones : [phones]) : [];
        return arr.some((p: any) => {
          const num = String(p.number || "").replace(/[^0-9]/g, "");
          const target = keepPhone.replace(/[^0-9]/g, "");
          return num === target || num.includes(target) || target.includes(num);
        });
      });
      steps.exactPhoneMatches = filtered.map((c: any) => ({
        customerID: c.customerID,
        firstName: c.firstName,
        lastName: c.lastName,
        createTime: c.createTime,
        emails: c.Contact?.Emails?.ContactEmail,
        phones: c.Contact?.Phones?.ContactPhone,
      }));
    } catch (err: any) {
      steps.phoneSearchError = String(err?.message || err);
    }

    // Also search by name "Elior Perez"
    const searchName = body.firstName || "Elior";
    const searchLastName = body.lastName || "Perez";
    try {
      const r = await lsGet<any>("Customer", {
        firstName: searchName,
        lastName: searchLastName,
        limit: "100",
        load_relations: '["Contact"]',
      });
      const list = r?.Customer ? (Array.isArray(r.Customer) ? r.Customer : [r.Customer]) : [];
      steps.nameMatches = list.map((c: any) => ({
        customerID: c.customerID,
        firstName: c.firstName,
        lastName: c.lastName,
        createTime: c.createTime,
        emails: c.Contact?.Emails?.ContactEmail,
        phones: c.Contact?.Phones?.ContactPhone,
      }));
    } catch (err: any) {
      steps.nameSearchError = String(err?.message || err);
    }
  }

  return NextResponse.json(steps);
}

async function handleMerge(body: any) {
  const primaryId = body.primaryId || "6";
  const duplicateId = body.duplicateId;
  if (!duplicateId) {
    return NextResponse.json({ error: "duplicateId is required" }, { status: 400 });
  }

  const steps: Record<string, unknown> = {};

  // Fetch both customers
  try {
    const primary = await lsGet<any>(`Customer/${primaryId}`, { load_relations: '["Contact"]' });
    steps.primary = {
      customerID: primary?.Customer?.customerID,
      firstName: primary?.Customer?.firstName,
      lastName: primary?.Customer?.lastName,
    };
  } catch (err: any) {
    steps.primaryError = String(err?.message || err);
  }

  try {
    const dupe = await lsGet<any>(`Customer/${duplicateId}`, { load_relations: '["Contact"]' });
    steps.duplicate = {
      customerID: dupe?.Customer?.customerID,
      firstName: dupe?.Customer?.firstName,
      lastName: dupe?.Customer?.lastName,
    };
  } catch (err: any) {
    steps.dupeError = String(err?.message || err);
    return NextResponse.json(steps);
  }

  // Fetch sales for the duplicate
  try {
    const salesResult = await lsGet<any>("Sale", {
      customerID: duplicateId,
      limit: "100",
    });
    const sales = salesResult?.Sale
      ? (Array.isArray(salesResult.Sale) ? salesResult.Sale : [salesResult.Sale])
      : [];

    steps.dupeSaleCount = sales.length;
    steps.dupeSales = sales.map((s: any) => ({
      saleID: s.saleID,
      completed: s.completed,
      total: s.calcTotal || s.total,
      completeTime: s.completeTime,
    }));

    // Reassign each sale to primary
    const reassigned: any[] = [];
    for (const sale of sales) {
      const saleId = String(sale.saleID || "").trim();
      if (!saleId) continue;
      try {
        await lsPut(`Sale/${saleId}`, { customerID: primaryId });
        reassigned.push({ saleID: saleId, reassigned: true });
      } catch (err: any) {
        reassigned.push({ saleID: saleId, reassigned: false, error: String(err?.message || err) });
      }
    }
    steps.reassigned = reassigned;
  } catch (err: any) {
    steps.salesError = String(err?.message || err);
  }

  // Delete the duplicate customer
  try {
    await lsDelete(`Customer/${duplicateId}`);
    steps.duplicateDeleted = true;
  } catch (err: any) {
    steps.deleteError = String(err?.message || err);
    steps.duplicateDeleted = false;
  }

  // Verify primary now has the sales
  try {
    const salesResult = await lsGet<any>("Sale", {
      customerID: primaryId,
      limit: "100",
    });
    const sales = salesResult?.Sale
      ? (Array.isArray(salesResult.Sale) ? salesResult.Sale : [salesResult.Sale])
      : [];
    steps.primarySaleCountAfter = sales.length;
  } catch (err: any) {
    steps.verifyError = String(err?.message || err);
  }

  return NextResponse.json(steps);
}

async function handleVoidSale(body: any) {
  const saleId = body.saleId;
  if (!saleId) return NextResponse.json({ error: "saleId required" }, { status: 400 });

  const steps: Record<string, unknown> = {};

  try {
    const sale = await lsGet<any>(`Sale/${saleId}`);
    steps.sale = {
      saleID: sale?.Sale?.saleID,
      completed: sale?.Sale?.completed,
      voided: sale?.Sale?.voided,
      total: sale?.Sale?.calcTotal,
      referenceNumber: sale?.Sale?.referenceNumber,
    };

    try {
      await lsPut(`Sale/${saleId}`, { voided: true });
      steps.voided = true;
    } catch (err: any) {
      steps.voidError = String(err?.message || err);
      try {
        await lsDelete(`Sale/${saleId}`);
        steps.deleted = true;
      } catch (err2: any) {
        steps.deleteError = String(err2?.message || err2);
      }
    }
  } catch (err: any) {
    steps.fetchError = String(err?.message || err);
  }

  return NextResponse.json(steps);
}
