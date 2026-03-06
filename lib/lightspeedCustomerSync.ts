import { lsGet, lsPost, lsPut, lsDelete } from "@/lib/lightspeedApi";
import { upsertCustomerLsHistory } from "@/lib/lightspeedRepository";

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeLower(value: unknown) {
  return normalizeText(value).toLowerCase();
}

function normalizePhone(value: unknown) {
  return normalizeText(value).replace(/[^0-9+]/g, "");
}

export type ShopifyCustomerInfo = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
};

export type ShopifyAddressInfo = {
  first_name?: string;
  last_name?: string;
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  zip?: string;
  country?: string;
  phone?: string;
};

type LsCustomer = {
  customerID: string;
  firstName?: string;
  lastName?: string;
  createTime?: string;
  Emails?: { ContactEmail?: unknown };
  Phones?: { ContactPhone?: unknown };
  Contact?: any;
};

function extractCustomers(result: any): LsCustomer[] {
  if (!result?.Customer) return [];
  return Array.isArray(result.Customer) ? result.Customer : [result.Customer];
}

// ── Search LS for existing customers ────────────────────────────────────

async function findAllByEmail(email: string): Promise<LsCustomer[]> {
  if (!email) return [];
  try {
    const result = await lsGet<any>("Customer", {
      "Contact.Emails.ContactEmail.address": `~,${email}`,
      limit: "100",
      load_relations: '["Contact"]',
    });
    return extractCustomers(result);
  } catch { return []; }
}

async function findAllByPhone(phone: string): Promise<LsCustomer[]> {
  if (!phone) return [];
  const cleaned = normalizePhone(phone);
  if (cleaned.length < 7) return [];
  try {
    const result = await lsGet<any>("Customer", {
      "Contact.Phones.ContactPhone.number": `~,${cleaned}`,
      limit: "100",
      load_relations: '["Contact"]',
    });
    return extractCustomers(result);
  } catch { return []; }
}

async function findByName(firstName: string, lastName: string): Promise<string | null> {
  if (!firstName || !lastName) return null;
  try {
    const result = await lsGet<any>("Customer", {
      firstName,
      lastName,
      limit: "1",
    });
    const customers = extractCustomers(result);
    if (customers.length > 0) return normalizeText(customers[0].customerID);
  } catch { /* not found */ }
  return null;
}

// ── Update LS customer with latest Shopify info (Part 1) ────────────────

function extractEmails(cust: LsCustomer): string[] {
  const arr = cust.Contact?.Emails?.ContactEmail;
  if (!arr) return [];
  const list = Array.isArray(arr) ? arr : [arr];
  return list.map((e: any) => normalizeLower(e?.address)).filter(Boolean);
}

function extractPhones(cust: LsCustomer): string[] {
  const arr = cust.Contact?.Phones?.ContactPhone;
  if (!arr) return [];
  const list = Array.isArray(arr) ? arr : [arr];
  return list.map((p: any) => normalizePhone(p?.number)).filter(Boolean);
}

async function fetchCustomerContact(customerId: string): Promise<any | null> {
  try {
    const result = await lsGet<any>(`Customer/${customerId}`, {
      load_relations: '["Contact"]',
    });
    return result?.Customer || null;
  } catch { return null; }
}

async function updateLsCustomer(
  customerId: string,
  shopifyCustomer: ShopifyCustomerInfo,
  address?: ShopifyAddressInfo | null,
): Promise<{ ok: boolean; payload?: Record<string, unknown>; error?: string }> {
  const firstName = normalizeText(shopifyCustomer.first_name) || normalizeText(address?.first_name);
  const lastName = normalizeText(shopifyCustomer.last_name) || normalizeText(address?.last_name);

  console.log(`[customerSync] updateLsCustomer ${customerId} – incoming: email=${shopifyCustomer.email}, phone=${shopifyCustomer.phone || address?.phone}, name=${firstName} ${lastName}`);

  const existing = await fetchCustomerContact(customerId);
  if (!existing) {
    console.error(`[customerSync] Could not fetch existing customer ${customerId}`);
    return { ok: false, error: "Could not fetch existing customer" };
  }

  const existingContact = existing.Contact || {};
  const contactId = normalizeText(existingContact.contactID);

  console.log(`[customerSync] Existing contact for ${customerId}: contactID=${contactId}, emails=${JSON.stringify(existingContact.Emails)}, phones=${JSON.stringify(existingContact.Phones)}`);

  const payload: Record<string, unknown> = { contactConsent: true };

  if (firstName) payload.firstName = firstName;
  if (lastName) payload.lastName = lastName;

  const contact: Record<string, unknown> = {
    noEmail: false,
    noMail: false,
    noPhone: false,
  };
  if (contactId) contact.contactID = contactId;

  const email = normalizeLower(shopifyCustomer.email);
  if (email) {
    const existingEmails = existingContact.Emails?.ContactEmail;
    const emailArr = existingEmails
      ? (Array.isArray(existingEmails) ? existingEmails : [existingEmails])
      : [];

    const firstEmailId = normalizeText(emailArr[0]?.contactEmailID);
    if (firstEmailId) {
      contact.Emails = { ContactEmail: [{ contactEmailID: firstEmailId, address: email, useType: "Primary" }] };
    } else {
      contact.Emails = { ContactEmail: [{ address: email, useType: "Primary" }] };
    }
  }

  const phone = normalizePhone(shopifyCustomer.phone) || normalizePhone(address?.phone);
  if (phone) {
    contact.Phones = {
      ContactPhone: [{ number: phone, useType: "Mobile" }],
    };
  }

  if (address) {
    const addr: Record<string, string> = {};
    if (address.address1) addr.address1 = normalizeText(address.address1);
    if (address.address2) addr.address2 = normalizeText(address.address2);
    if (address.city) addr.city = normalizeText(address.city);
    if (address.province) addr.state = normalizeText(address.province);
    if (address.zip) addr.zip = normalizeText(address.zip);
    if (address.country) addr.country = normalizeText(address.country);

    if (Object.keys(addr).length > 0) {
      const existingAddrs = existingContact.Addresses?.ContactAddress;
      const addrArr = existingAddrs
        ? (Array.isArray(existingAddrs) ? existingAddrs : [existingAddrs])
        : [];
      const addrId = normalizeText(addrArr[0]?.contactAddressID);
      if (addrId) addr.contactAddressID = addrId;
      contact.Addresses = { ContactAddress: [addr] };
    }
  }

  payload.Contact = contact;

  console.log(`[customerSync] PUT Customer/${customerId} payload:`, JSON.stringify(payload));

  try {
    const result = await lsPut(`Customer/${customerId}`, payload);
    console.log(`[customerSync] PUT Customer/${customerId} success:`, JSON.stringify(result?.Customer?.customerID || result));
    return { ok: true, payload };
  } catch (err: any) {
    const msg = String(err?.message || err);
    console.error(`[customerSync] PUT Customer/${customerId} FAILED:`, msg);
    return { ok: false, payload, error: msg };
  }
}

// ── Merge duplicate LS customers (Part 2) ───────────────────────────────
// Rules: merge when same email + same phone. Oldest customer survives.

async function getSalesForCustomer(customerId: string): Promise<any[]> {
  try {
    const result = await lsGet<any>("Sale", {
      customerID: customerId,
      limit: "100",
      load_relations: '["SaleLines","SaleLines.Item"]',
    });
    if (!result?.Sale) return [];
    return Array.isArray(result.Sale) ? result.Sale : [result.Sale];
  } catch { return []; }
}

async function reassignSale(saleId: string, newCustomerId: string): Promise<void> {
  await lsPut(`Sale/${saleId}`, { customerID: newCustomerId });
}

async function mergeDuplicateCustomers(
  candidates: LsCustomer[],
  shopifyEmail: string,
  shopifyPhone: string,
): Promise<string> {
  if (candidates.length < 2) return normalizeText(candidates[0].customerID);

  const email = normalizeLower(shopifyEmail);
  const phone = normalizePhone(shopifyPhone);

  if (!email || !phone) return normalizeText(candidates[0].customerID);

  const matchBoth = candidates.filter((c) => {
    const emails = extractEmails(c);
    const phones = extractPhones(c);
    return emails.includes(email) && phones.some((p) => p.includes(phone) || phone.includes(p));
  });

  if (matchBoth.length < 2) return normalizeText(candidates[0].customerID);

  matchBoth.sort((a, b) => {
    const ta = a.createTime || "";
    const tb = b.createTime || "";
    return ta.localeCompare(tb);
  });

  const primary = matchBoth[0];
  const primaryId = normalizeText(primary.customerID);
  const duplicates = matchBoth.slice(1);

  console.log(
    `[customerSync] Merging ${duplicates.length} duplicate(s) into primary customer ${primaryId}`,
  );

  for (const dupe of duplicates) {
    const dupeId = normalizeText(dupe.customerID);
    try {
      const sales = await getSalesForCustomer(dupeId);
      for (const sale of sales) {
        const saleId = normalizeText(sale.saleID);
        if (saleId) {
          await reassignSale(saleId, primaryId);
        }
      }
      await lsDelete(`Customer/${dupeId}`);
      console.log(`[customerSync] Deleted duplicate LS customer ${dupeId}, reassigned ${sales.length} sale(s)`);
    } catch (err) {
      console.error(`[customerSync] Failed to merge/delete customer ${dupeId}:`, err);
    }
  }

  return primaryId;
}

// ── Create new LS customer ──────────────────────────────────────────────

async function createCustomer(
  customer: ShopifyCustomerInfo,
  address?: ShopifyAddressInfo | null,
): Promise<string | null> {
  const firstName = normalizeText(customer.first_name) || normalizeText(address?.first_name) || "Shopify";
  const lastName = normalizeText(customer.last_name) || normalizeText(address?.last_name) || "Customer";

  const payload: Record<string, unknown> = { firstName, lastName, contactConsent: true };

  const contact: Record<string, unknown> = {
    noEmail: false,
    noMail: false,
    noPhone: false,
  };

  const email = normalizeLower(customer.email);
  if (email) {
    contact.Emails = { ContactEmail: [{ address: email }] };
  }

  const phone = normalizePhone(customer.phone) || normalizePhone(address?.phone);
  if (phone) {
    contact.Phones = { ContactPhone: [{ number: phone, useType: "Home" }] };
  }

  if (address) {
    const addr: Record<string, string> = {};
    if (address.address1) addr.address1 = normalizeText(address.address1);
    if (address.address2) addr.address2 = normalizeText(address.address2);
    if (address.city) addr.city = normalizeText(address.city);
    if (address.province) addr.state = normalizeText(address.province);
    if (address.zip) addr.zip = normalizeText(address.zip);
    if (address.country) addr.country = normalizeText(address.country);
    if (Object.keys(addr).length > 0) {
      contact.Addresses = { ContactAddress: [addr] };
    }
  }

  payload.Contact = contact;

  try {
    const created = await lsPost<any>("Customer", payload);
    return normalizeText(created?.Customer?.customerID) || null;
  } catch {
    return null;
  }
}

// ── LS Sale History → SQL cache (Part 3b) ──────────────────────────────

export async function syncCustomerLsHistory(
  lsCustomerId: string,
  shopifyEmail: string,
): Promise<void> {
  if (!lsCustomerId || !shopifyEmail) return;

  try {
    const allSales = await getSalesForCustomer(lsCustomerId);

    if (allSales.length === 0) {
      console.log(`[customerSync] LS returned 0 sales for customer ${lsCustomerId} — skipping overwrite to preserve existing data`);
      return;
    }

    const sales = allSales.filter((s: any) => {
      if (s.completed !== "true" && s.completed !== true) return false;
      if (s.voided === "true" || s.voided === true) return false;
      const src = normalizeText(s.referenceNumberSource).toLowerCase();
      if (src === "shopify") return false;
      const total = parseFloat(normalizeText(s.calcTotal || s.total)) || 0;
      if (total <= 0) return false;
      return true;
    });

    const history = sales.map((s: any) => ({
      saleID: normalizeText(s.saleID),
      completeTime: normalizeText(s.completeTime),
      total: normalizeText(s.calcTotal || s.total),
      referenceNumber: normalizeText(s.referenceNumber),
      saleLines: extractSaleLinesSummary(s),
    }));

    await upsertCustomerLsHistory({
      shopifyEmail: normalizeLower(shopifyEmail),
      lsCustomerId,
      salesJson: history,
    });
  } catch (err) {
    console.error(`[customerSync] Failed to sync LS history for ${shopifyEmail}:`, err);
  }
}

function extractSaleLinesSummary(sale: any): Array<{ description: string; qty: number; total: string }> {
  const lines = sale?.SaleLines?.SaleLine;
  if (!lines) return [];
  const arr = Array.isArray(lines) ? lines : [lines];
  return arr.map((l: any) => ({
    description: normalizeText(l.Item?.description || l.Note?.note || "Item"),
    qty: Number(l.unitQuantity) || 1,
    total: normalizeText(l.calcTotal || l.calcSubtotal || "0"),
  }));
}

// ── Main orchestrator ───────────────────────────────────────────────────

const ECOM_CUSTOMER_NAME = "Shopify eCom";

async function getGenericEcomCustomerId(): Promise<string | null> {
  try {
    const result = await lsGet<any>("Customer", { firstName: ECOM_CUSTOMER_NAME, limit: "1" });
    const customers = extractCustomers(result);
    if (customers.length > 0) return normalizeText(customers[0].customerID);
  } catch { /* not found, create below */ }
  try {
    const created = await lsPost<any>("Customer", { firstName: ECOM_CUSTOMER_NAME, lastName: "Order" });
    return normalizeText(created?.Customer?.customerID) || null;
  } catch {
    return null;
  }
}

export async function findOrCreateCustomer(
  customer?: ShopifyCustomerInfo | null,
  shippingAddress?: ShopifyAddressInfo | null,
  billingAddress?: ShopifyAddressInfo | null,
): Promise<{ customerId: string | null; matchedBy: string }> {
  if (!customer && !shippingAddress) {
    const id = await getGenericEcomCustomerId();
    return { customerId: id, matchedBy: "generic_ecom_guest" };
  }

  const email = normalizeLower(customer?.email);
  const phone = normalizePhone(customer?.phone) || normalizePhone(shippingAddress?.phone);
  const firstName = normalizeText(customer?.first_name) || normalizeText(shippingAddress?.first_name);
  const lastName = normalizeText(customer?.last_name) || normalizeText(shippingAddress?.last_name);
  const address = shippingAddress || billingAddress;

  // Step 1: Search by email
  if (email) {
    const emailMatches = await findAllByEmail(email);

    if (emailMatches.length > 0) {
      // If we also have a phone, check for duplicates to merge
      let customerId: string;
      if (phone && emailMatches.length > 1) {
        customerId = await mergeDuplicateCustomers(emailMatches, email, phone);
      } else {
        customerId = normalizeText(emailMatches[0].customerID);
      }

      await updateLsCustomer(customerId, customer || {}, address);

      if (email) {
        syncCustomerLsHistory(customerId, email).catch(() => {});
      }

      return { customerId, matchedBy: "email" };
    }
  }

  // Step 2: Search by phone
  if (phone) {
    const phoneMatches = await findAllByPhone(phone);

    if (phoneMatches.length > 0) {
      // Check for duplicates with same email + phone
      let customerId: string;
      if (email && phoneMatches.length > 1) {
        customerId = await mergeDuplicateCustomers(phoneMatches, email, phone);
      } else {
        customerId = normalizeText(phoneMatches[0].customerID);
      }

      await updateLsCustomer(customerId, customer || {}, address);

      if (email) {
        syncCustomerLsHistory(customerId, email).catch(() => {});
      }

      return { customerId, matchedBy: "phone" };
    }
  }

  // Step 3: Search by name
  if (firstName && lastName) {
    const id = await findByName(firstName, lastName);
    if (id) {
      await updateLsCustomer(id, customer || {}, address);

      if (email) {
        syncCustomerLsHistory(id, email).catch(() => {});
      }

      return { customerId: id, matchedBy: "name" };
    }
  }

  // Step 4: Create new customer
  const info: ShopifyCustomerInfo = {
    first_name: firstName || "Shopify",
    last_name: lastName || "Customer",
    email: customer?.email,
    phone: customer?.phone || shippingAddress?.phone,
  };

  const newId = await createCustomer(info, address);
  if (newId) {
    if (email) {
      syncCustomerLsHistory(newId, email).catch(() => {});
    }
    return { customerId: newId, matchedBy: "created" };
  }

  const fallbackId = await getGenericEcomCustomerId();
  return { customerId: fallbackId, matchedBy: "generic_ecom_fallback" };
}
