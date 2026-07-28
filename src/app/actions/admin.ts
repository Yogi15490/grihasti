"use server";

import { revalidatePath } from "next/cache";
import { transaction, getDb } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import {
  markDispatched, markDelivered, setStock, adjustBalance, AdminError,
} from "@/lib/admin";
import { refundOrder } from "@/lib/orders";

async function currentAdminId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) throw new AdminError("Not authorised.", "not_admin");
  return user.userId;
}

type Result = { ok: boolean; error?: string; message?: string };

function fail(e: unknown): Result {
  if (e instanceof AdminError) return { ok: false, error: e.message };
  console.error("[admin action]", e);
  return { ok: false, error: "Something went wrong." };
}

export async function dispatchOrderAction(formData: FormData): Promise<Result> {
  try {
    const adminId = await currentAdminId();
    const orderId = String(formData.get("orderId") ?? "");
    const res = await transaction((tx) =>
      markDispatched(tx, adminId, {
        orderId,
        awb: String(formData.get("awb") ?? ""),
        courierName: String(formData.get("courier") ?? "").trim() || "Shiprocket",
      }),
    );
    revalidatePath("/admin");
    return { ok: true, message: `Dispatched · ${res.awb}` };
  } catch (e) {
    return fail(e);
  }
}

export async function deliverOrderAction(formData: FormData): Promise<Result> {
  try {
    const adminId = await currentAdminId();
    await transaction((tx) => markDelivered(tx, adminId, String(formData.get("orderId") ?? "")));
    revalidatePath("/admin");
    return { ok: true, message: "Marked delivered." };
  } catch (e) {
    return fail(e);
  }
}

/**
 * Refund. Reverses every earn for the order, returns redeemed points and
 * restocks — all in one transaction, because a partial refund is how a ledger
 * stops reconciling.
 */
export async function refundOrderAction(formData: FormData): Promise<Result> {
  try {
    const adminId = await currentAdminId();
    const { rows } = await (await getDb()).query<{ is_admin: boolean }>(`select is_admin from users where id = $1`, [adminId]);
    if (!rows[0]?.is_admin) throw new AdminError("Not authorised.", "not_admin");

    const orderId = String(formData.get("orderId") ?? "");
    const res = await transaction((tx) => refundOrder(tx, orderId));
    revalidatePath("/admin");
    return {
      ok: true,
      message: res.alreadyRefunded
        ? "Already refunded."
        : `Refunded · ${res.entries.length} ledger reversals written.`,
    };
  } catch (e) {
    return fail(e);
  }
}

export async function setStockAction(formData: FormData): Promise<Result> {
  try {
    const adminId = await currentAdminId();
    const res = await transaction((tx) =>
      setStock(
        tx,
        adminId,
        String(formData.get("productId") ?? ""),
        Number(formData.get("qty")),
        String(formData.get("reason") ?? "").trim() || "manual stock update",
      ),
    );
    revalidatePath("/admin");
    return { ok: true, message: `${res.slug}: ${res.from} → ${res.to}` };
  } catch (e) {
    return fail(e);
  }
}

export async function adjustBalanceAction(formData: FormData): Promise<Result> {
  try {
    const adminId = await currentAdminId();
    const res = await transaction((tx) =>
      adjustBalance(
        tx,
        adminId,
        String(formData.get("userId") ?? ""),
        Number(formData.get("amount")),
        String(formData.get("reason") ?? ""),
      ),
    );
    revalidatePath("/admin");
    return { ok: true, message: `New balance: ₹${res.newBalanceInr}` };
  } catch (e) {
    return fail(e);
  }
}
