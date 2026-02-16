import net from "node:net";
import { NextResponse } from "next/server";
import {
  generateLabels,
  normalizeLabelInput,
  type LabelInput,
  validateRfidSettings,
} from "@/lib/rfid";
import {
  getRfidSettings,
  insertMappings,
  reserveSerialNumbers,
} from "@/lib/rfidStore";

export const runtime = "nodejs";

function ensureValidInput(input: LabelInput) {
  if (!input.lightspeedSystemId.trim()) {
    throw new Error("Lightspeed System ID is required.");
  }
  if (input.qty < 1 || input.qty > 500) {
    throw new Error("Quantity must be between 1 and 500.");
  }
}

function sendZplToPrinter({
  ip,
  port,
  zpl,
  timeoutMs = 4000,
}: {
  ip: string;
  port: number;
  zpl: string;
  timeoutMs?: number;
}) {
  return new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({ host: ip, port }, () => {
      socket.write(zpl, "utf8", () => socket.end());
    });

    socket.setTimeout(timeoutMs);

    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error(`Printer connection timed out (${ip}:${port}).`));
    });

    socket.on("error", (err) => {
      reject(new Error(`Printer connection failed (${ip}:${port}): ${err.message}`));
    });

    socket.on("close", (hadError) => {
      if (!hadError) resolve();
    });
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const input = normalizeLabelInput(body);
    ensureValidInput(input);

    const settings = getRfidSettings();
    validateRfidSettings(settings);

    const serialNumbers = reserveSerialNumbers(input.qty);
    const result = generateLabels({
      input,
      settings,
      serialNumbers,
    });

    insertMappings(
      result.labels.map((label) => ({
        epc: label.epc,
        lightspeedSystemId: input.lightspeedSystemId,
        itemNumber: result.itemNumber,
        serialNumber: label.serialNumber,
        itemName: input.itemName,
        upc: input.upc,
        customSku: input.customSku,
        color: input.color,
        size: input.size,
        retailPrice: input.retailPrice,
        countryCode: input.countryCode,
        zpl: label.zpl,
      }))
    );

    const printerIp = input.printerIp || settings.printerIp;
    const printerPort = Number.parseInt(input.printerPort || "", 10) || settings.printerPort;
    const printStatus = { attempted: false, success: false, message: "" };

    if (input.printNow) {
      if (!printerIp) {
        throw new Error("Printer IP is required for print action.");
      }
      printStatus.attempted = true;
      try {
        await sendZplToPrinter({
          ip: printerIp,
          port: printerPort,
          zpl: result.batchZpl,
        });
        printStatus.success = true;
        printStatus.message = `Sent ${result.labels.length} label(s) to ${printerIp}:${printerPort}.`;
      } catch (e: any) {
        printStatus.message = String(e?.message || "Print failed.");
      }
    }

    return NextResponse.json(
      {
        ok: true,
        created: result.labels.length,
        itemNumber: result.itemNumber,
        labels: result.labels.map((label) => ({
          epc: label.epc,
          serialNumber: label.serialNumber,
        })),
        zpl: result.batchZpl,
        printStatus,
      },
      { status: 201 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || "Unable to generate labels.") },
      { status: 400 }
    );
  }
}

