import { randomBytes } from "node:crypto";
import { Router, type Request, type Response } from "express";

import { db } from "../db/database.ts";
import {
  optionalAuth,
  requireAuth,
  requireRole,
  type AuthenticatedUser,
} from "./auth.ts";

/*
|-----------------------------------------------------------------------------
| DivyaDhara — Booking Operations API — FINAL ROLE-ALIGNED VERSION
|-----------------------------------------------------------------------------
|
| Canonical business roles:
|   visitor          -> customer-owned bookings
|   pandit           -> assigned Pandit bookings only
|   temple_manager   -> assigned Temple bookings only
|   ashram_manager   -> assigned Ashram bookings only
|   sales            -> global booking operations
|   super_admin      -> global booking operations
|
| Important ownership rules:
|   - Public lead/enquiry capture remains in leads.ts.
|   - Direct booking creation is authenticated.
|   - Only visitor can create a self-owned direct booking.
|   - Sales/Super Admin can create a booking on behalf of an active visitor
|     account or an existing CRM lead.
|   - Pandit/Temple Manager/Ashram Manager cannot manufacture customer
|     bookings for arbitrary customers.
|   - Ashram Manager authorization comes from ashram_manager_assignments,
|     not from ashram_subscriptions.manager_user_id.
|   - Payment truth remains payments.ts / payment ledger. This router only
|     mirrors the effective status on bookings.payment_status.
|   - Bookings are never hard-deleted because they are operational/financial
|     records.
|-----------------------------------------------------------------------------
*/

const router = Router();

type Row = Record<string, unknown>;

type BookingKind =
  | "pandit"
  | "puja"
  | "temple"
  | "ashram"
  | "yatra"
  | "course"
  | "event"
  | "other";

type BookingStatus =
  | "received"
  | "confirmed"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "rejected";

type BookingPaymentStatus =
  | "unpaid"
  | "pending"
  | "paid"
  | "partially_paid"
  | "refunded"
  | "failed";

const BOOKING_KINDS = [
  "pandit",
  "puja",
  "temple",
  "ashram",
  "yatra",
  "course",
  "event",
  "other",
] as const satisfies readonly BookingKind[];

const BOOKING_STATUSES = [
  "received",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "rejected",
] as const satisfies readonly BookingStatus[];

const BOOKING_PAYMENT_STATUSES = [
  "unpaid",
  "pending",
  "paid",
  "partially_paid",
  "refunded",
  "failed",
] as const satisfies readonly BookingPaymentStatus[];

const TERMINAL_BOOKING_STATUSES = new Set<BookingStatus>([
  "completed",
  "cancelled",
  "rejected",
]);

const CUSTOMER_CANCELLABLE_STATUSES = new Set<BookingStatus>([
  "received",
  "confirmed",
]);

const PROVIDER_CANCELLABLE_STATUSES = new Set<BookingStatus>([
  "received",
  "confirmed",
  "in_progress",
]);

const PROVIDER_STATUSES = new Set<BookingStatus>([
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "rejected",
]);

const MAX_PAGE_SIZE = 100;

function isValidBookingTransition(
  current: BookingStatus,
  next: BookingStatus,
): boolean {
  if (current === next) return true;

  switch (current) {
    case "received":
      return ["confirmed", "cancelled", "rejected"].includes(next);
    case "confirmed":
      return ["in_progress", "cancelled", "rejected"].includes(next);
    case "in_progress":
      return ["completed", "cancelled"].includes(next);
    default:
      return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Generic helpers                                                           */
/* -------------------------------------------------------------------------- */

function text(value: unknown, max = 500): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  return String(value).trim().slice(0, max);
}

function nullableText(value: unknown, max = 500): string | null {
  const result = text(value, max);
  return result || null;
}

function positiveId(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeInteger(
  value: unknown,
  fallback: number | null = null,
  max = 1_000_000_000,
): number | null {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(String(value).replace(/,/g, "").trim());
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) return fallback;
  return parsed;
}

function bodyOf(req: Request): Row {
  return req.body && typeof req.body === "object" ? (req.body as Row) : {};
}

function enumValue<T extends readonly string[]>(
  value: unknown,
  allowed: T,
): T[number] | null {
  const normalized = text(value, 80).toLowerCase();
  return (allowed as readonly string[]).includes(normalized)
    ? (normalized as T[number])
    : null;
}

function jsonText(value: unknown, fallback = "{}"): string {
  try {
    const result = JSON.stringify(value ?? {});
    return result || fallback;
  } catch {
    return fallback;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function makeReference(prefix = "DD-BOOK"): string {
  const stamp = new Date()
    .toISOString()
    .replace(/[-:.TZ]/g, "")
    .slice(0, 14);
  return `${prefix}-${stamp}-${randomBytes(5).toString("hex").toUpperCase()}`;
}

function currentUser(res: Response): AuthenticatedUser | undefined {
  return res.locals.user as AuthenticatedUser | undefined;
}

function currentUserRequired(res: Response): AuthenticatedUser {
  const user = currentUser(res);
  if (!user) throw new Error("Authentication required.");
  return user;
}

function clientIp(req: Request): string | null {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0]?.trim().slice(0, 100) || null;
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].trim().slice(0, 100) || null;
  }
  return req.ip?.trim().slice(0, 100) || null;
}

function tableExists(tableName: string): boolean {
  const row = db
    .prepare(
      `
      SELECT 1
      FROM sqlite_master
      WHERE type = 'table'
        AND name = ?
      LIMIT 1
      `,
    )
    .get(tableName);
  return Boolean(row);
}

/* -------------------------------------------------------------------------- */
/* Audit / notifications                                                     */
/* -------------------------------------------------------------------------- */

function audit(
  req: Request,
  action: string,
  entityType: string,
  entityId: number | null,
  oldData: unknown = null,
  newData: unknown = null,
): void {
  if (!tableExists("audit_logs")) return;

  try {
    db.prepare(
      `
      INSERT INTO audit_logs (
        user_id,
        request_id,
        actor_type,
        action,
        entity_type,
        entity_id,
        old_data_json,
        new_data_json,
        ip_address,
        user_agent,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `,
    ).run(
      req.res?.locals?.user?.id ?? null,
      req.res?.locals?.requestId ?? null,
      req.res?.locals?.user?.role ?? "system",
      text(action, 150),
      text(entityType, 100),
      entityId,
      oldData == null ? null : jsonText(oldData),
      newData == null ? null : jsonText(newData),
      clientIp(req),
      nullableText(req.get("user-agent"), 1000),
    );
  } catch (error) {
    console.error("Booking audit error:", error);
  }
}

function notifyUser(
  userId: number | null,
  type: string,
  title: string,
  message: string,
  actionUrl: string | null,
  metadata: unknown = {},
): void {
  if (!userId || !tableExists("notifications")) return;

  try {
    db.prepare(
      `
      INSERT INTO notifications (
        user_id,
        type,
        title,
        message,
        action_url,
        is_read,
        metadata_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP)
      `,
    ).run(
      userId,
      text(type, 50) || "booking",
      text(title, 250),
      text(message, 2000),
      actionUrl,
      jsonText(metadata),
    );
  } catch (error) {
    console.error("Booking notification error:", error);
  }
}

/* -------------------------------------------------------------------------- */
/* Core booking access                                                       */
/* -------------------------------------------------------------------------- */

function getBookingRaw(bookingId: number): Row | undefined {
  return db
    .prepare(`SELECT * FROM bookings WHERE id = ? LIMIT 1`)
    .get(bookingId) as Row | undefined;
}

function getCustomerUser(userId: number): Row | undefined {
  return db
    .prepare(
      `
      SELECT
        u.id,
        u.name,
        u.email,
        u.phone,
        u.status,
        r.code AS role_code
      FROM users u
      INNER JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?
      LIMIT 1
      `,
    )
    .get(userId) as Row | undefined;
}

function getPanditProfileByUser(userId: number): Row | undefined {
  return db
    .prepare(
      `
      SELECT id, user_id, display_name, slug, profile_status,
             verification_status, listing_active
      FROM pandit_profiles
      WHERE user_id = ?
      LIMIT 1
      `,
    )
    .get(userId) as Row | undefined;
}

function isAssignedTempleManager(userId: number, templeId: number): boolean {
  return Boolean(
    db
      .prepare(
        `
        SELECT 1
        FROM temple_manager_assignments
        WHERE manager_user_id = ?
          AND temple_id = ?
          AND status = 'active'
        LIMIT 1
        `,
      )
      .get(userId, templeId),
  );
}

function isAssignedAshramManager(userId: number, ashramId: number): boolean {
  return Boolean(
    db
      .prepare(
        `
        SELECT 1
        FROM ashram_manager_assignments
        WHERE manager_user_id = ?
          AND ashram_id = ?
          AND status = 'active'
        LIMIT 1
        `,
      )
      .get(userId, ashramId),
  );
}

function providerUserIds(booking: Row): number[] {
  const ids = new Set<number>();

  const panditId = positiveId(booking.pandit_id);
  if (panditId) {
    const row = db
      .prepare(`SELECT user_id FROM pandit_profiles WHERE id = ? LIMIT 1`)
      .get(panditId) as { user_id?: number | null } | undefined;
    const userId = positiveId(row?.user_id);
    if (userId) ids.add(userId);
  }

  const templeId = positiveId(booking.temple_id);
  if (templeId) {
    const managers = db
      .prepare(
        `
        SELECT manager_user_id
        FROM temple_manager_assignments
        WHERE temple_id = ?
          AND status = 'active'
        `,
      )
      .all(templeId) as Array<{ manager_user_id?: number | null }>;

    for (const manager of managers) {
      const userId = positiveId(manager.manager_user_id);
      if (userId) ids.add(userId);
    }
  }

  const ashramId = positiveId(booking.ashram_id);
  if (ashramId) {
    const managers = db
      .prepare(
        `
        SELECT manager_user_id
        FROM ashram_manager_assignments
        WHERE ashram_id = ?
          AND status = 'active'
        `,
      )
      .all(ashramId) as Array<{ manager_user_id?: number | null }>;

    for (const manager of managers) {
      const userId = positiveId(manager.manager_user_id);
      if (userId) ids.add(userId);
    }
  }

  return Array.from(ids);
}

function providerScopeMatches(user: AuthenticatedUser, booking: Row): boolean {
  if (user.role === "sales" || user.role === "super_admin") return true;

  if (user.role === "pandit") {
    const profile = getPanditProfileByUser(user.id);
    const panditId = positiveId(booking.pandit_id);
    return Boolean(profile?.id && panditId && Number(profile.id) === panditId);
  }

  if (user.role === "temple_manager") {
    const templeId = positiveId(booking.temple_id);
    return Boolean(templeId && isAssignedTempleManager(user.id, templeId));
  }

  if (user.role === "ashram_manager") {
    const ashramId = positiveId(booking.ashram_id);
    return Boolean(ashramId && isAssignedAshramManager(user.id, ashramId));
  }

  return false;
}

function customerOwnsBooking(user: AuthenticatedUser, booking: Row): boolean {
  return positiveId(booking.user_id) === user.id;
}

function canViewBooking(user: AuthenticatedUser, booking: Row): boolean {
  if (customerOwnsBooking(user, booking)) return true;
  return providerScopeMatches(user, booking);
}

function bookingEntityLabel(booking: Row): string {
  return (
    nullableText(booking.title, 250) ||
    nullableText(booking.kind, 50) ||
    `Booking #${String(booking.id ?? "")}`
  );
}

/* -------------------------------------------------------------------------- */
/* Bookable entity validation                                                 */
/* -------------------------------------------------------------------------- */

function ensurePublishedEntity(
  kind: BookingKind,
  body: Row,
): {
  panditId: number | null;
  templeId: number | null;
  ashramId: number | null;
  pujaId: number | null;
  packageId: number | null;
  courseId: number | null;
  eventId: number | null;
} {
  const panditId = positiveId(body.panditId);
  const templeId = positiveId(body.templeId);
  const ashramId = positiveId(body.ashramId);
  const pujaId = positiveId(body.pujaId ?? body.pujaServiceId);
  const packageId = positiveId(body.packageId ?? body.yatraPackageId);
  const courseId = positiveId(body.courseId);
  const eventId = positiveId(body.eventId);

  if (panditId) {
    const pandit = db
      .prepare(
        `
        SELECT p.id, p.profile_status, p.verification_status, p.listing_active,
               u.status AS user_status
        FROM pandit_profiles p
        INNER JOIN users u ON u.id = p.user_id
        WHERE p.id = ?
        LIMIT 1
        `,
      )
      .get(panditId) as Row | undefined;

    if (
      !pandit ||
      pandit.profile_status !== "approved" ||
      pandit.verification_status !== "approved" ||
      Number(pandit.listing_active ?? 0) !== 1 ||
      pandit.user_status !== "active"
    ) {
      throw new Error("Selected Pandit is not currently bookable.");
    }
  }

  if (templeId) {
    const temple = db
      .prepare(`SELECT id, name, status FROM temples WHERE id = ? LIMIT 1`)
      .get(templeId) as Row | undefined;
    if (!temple || temple.status !== "published") {
      throw new Error("Selected Temple is not currently bookable.");
    }
  }

  if (ashramId) {
    const ashram = db
      .prepare(
        `SELECT id, name, status, listing_active FROM ashrams WHERE id = ? LIMIT 1`,
      )
      .get(ashramId) as Row | undefined;
    if (
      !ashram ||
      ashram.status !== "published" ||
      Number(ashram.listing_active ?? 0) !== 1
    ) {
      throw new Error("Selected Ashram is not currently bookable.");
    }
  }

  if (pujaId) {
    const puja = db
      .prepare(
        `
        SELECT id, name, status, booking_enabled
        FROM puja_services
        WHERE id = ?
        LIMIT 1
        `,
      )
      .get(pujaId) as Row | undefined;
    if (
      !puja ||
      puja.status !== "published" ||
      Number(puja.booking_enabled ?? 0) !== 1
    ) {
      throw new Error("Selected Puja Service is not currently bookable.");
    }
  }

  if (packageId) {
    const pkg = db
      .prepare(
        `
        SELECT id, name, status, booking_enabled
        FROM yatra_packages
        WHERE id = ?
        LIMIT 1
        `,
      )
      .get(packageId) as Row | undefined;
    if (
      !pkg ||
      pkg.status !== "published" ||
      Number(pkg.booking_enabled ?? 0) !== 1
    ) {
      throw new Error("Selected Yatra package is not currently bookable.");
    }
  }

  if (courseId) {
    const course = db
      .prepare(`SELECT id, title, status FROM courses WHERE id = ? LIMIT 1`)
      .get(courseId) as Row | undefined;
    if (!course || course.status !== "published") {
      throw new Error("Selected Course is not currently bookable.");
    }
  }

  if (eventId) {
    const event = db
      .prepare(`SELECT id, title, status FROM events WHERE id = ? LIMIT 1`)
      .get(eventId) as Row | undefined;
    if (!event || event.status !== "published") {
      throw new Error("Selected Event is not currently bookable.");
    }
  }

  if (!panditId && !templeId && !ashramId && !pujaId && !packageId && !courseId && !eventId) {
    if (kind !== "other") throw new Error("A valid bookable entity is required.");
  }

  switch (kind) {
    case "pandit":
      if (!panditId) throw new Error("panditId is required for a Pandit booking.");
      break;
    case "puja":
      if (!pujaId) throw new Error("pujaId is required for a Puja booking.");
      break;
    case "temple":
      if (!templeId) throw new Error("templeId is required for a Temple booking.");
      break;
    case "ashram":
      if (!ashramId) throw new Error("ashramId is required for an Ashram booking.");
      break;
    case "yatra":
      if (!packageId) throw new Error("packageId is required for a Yatra booking.");
      break;
    case "course":
      if (!courseId) throw new Error("courseId is required for a Course booking.");
      break;
    case "event":
      if (!eventId) throw new Error("eventId is required for an Event booking.");
      break;
    default:
      break;
  }

  const panditServiceId = positiveId(body.panditServiceId);
  if (panditServiceId) {
    if (!panditId) {
      throw new Error("panditServiceId requires panditId.");
    }

    const service = db
      .prepare(
        `
        SELECT id, pandit_id, is_active
        FROM pandit_service_offerings
        WHERE id = ?
        LIMIT 1
        `,
      )
      .get(panditServiceId) as Row | undefined;

    if (
      !service ||
      Number(service.pandit_id) !== panditId ||
      Number(service.is_active ?? 0) !== 1
    ) {
      throw new Error("Selected Pandit service is not available for this Pandit.");
    }
  }

  return {
    panditId,
    templeId,
    ashramId,
    pujaId,
    packageId,
    courseId,
    eventId,
  };
}

function inferredKind(body: Row): BookingKind {
  const provided = enumValue(body.kind, BOOKING_KINDS);
  if (provided) return provided as BookingKind;
  if (positiveId(body.panditId)) return "pandit";
  if (positiveId(body.pujaId ?? body.pujaServiceId)) return "puja";
  if (positiveId(body.templeId)) return "temple";
  if (positiveId(body.ashramId)) return "ashram";
  if (positiveId(body.packageId ?? body.yatraPackageId)) return "yatra";
  if (positiveId(body.courseId)) return "course";
  if (positiveId(body.eventId)) return "event";
  return "other";
}

function makeBookingTitle(kind: BookingKind, body: Row): string {
  const explicit = text(body.title, 250);
  if (explicit) return explicit;

  const names: string[] = [];

  const nameLookups: Array<[number | null, string, string]> = [
    [positiveId(body.panditId), "pandit_profiles", "display_name"],
    [positiveId(body.templeId), "temples", "name"],
    [positiveId(body.ashramId), "ashrams", "name"],
    [positiveId(body.pujaId ?? body.pujaServiceId), "puja_services", "name"],
    [positiveId(body.packageId ?? body.yatraPackageId), "yatra_packages", "name"],
    [positiveId(body.courseId), "courses", "title"],
    [positiveId(body.eventId), "events", "title"],
  ];

  for (const [id, table, column] of nameLookups) {
    if (!id) continue;
    const row = db
      .prepare(`SELECT ${column} AS label FROM ${table} WHERE id = ? LIMIT 1`)
      .get(id) as { label?: string } | undefined;
    if (row?.label) names.push(row.label);
  }

  if (names.length > 0) {
    return `${kind[0].toUpperCase()}${kind.slice(1)} Booking — ${names[0]}`.slice(0, 250);
  }

  return `${kind[0].toUpperCase()}${kind.slice(1)} Booking`;
}

/* -------------------------------------------------------------------------- */
/* Payments                                                                  */
/* -------------------------------------------------------------------------- */

function paymentSummary(bookingId: number): {
  payments: Row[];
  paymentOrders: Row[];
  effectiveStatus: BookingPaymentStatus;
  paidAmount: number;
  refundedAmount: number;
  outstandingAmount: number | null;
} {
  const payments = db
    .prepare(`SELECT * FROM payments WHERE booking_id = ? ORDER BY id DESC`)
    .all(bookingId) as Row[];

  const paymentOrders = db
    .prepare(`SELECT * FROM payment_orders WHERE booking_id = ? ORDER BY id DESC`)
    .all(bookingId) as Row[];

  const successfulStatuses = new Set(["paid", "captured"]);
  const pendingStatuses = new Set(["created", "pending", "authorized"]);
  const failedStatuses = new Set(["failed", "cancelled"]);

  const grossPaidAmount = payments.reduce((sum, payment) => {
    const status = text(payment.status, 40).toLowerCase();
    return successfulStatuses.has(status) ? sum + Number(payment.amount ?? 0) : sum;
  }, 0);

  const refundedAmount = payments.reduce(
    (sum, payment) => sum + Number(payment.refund_amount_paise ?? 0) / 100,
    0,
  );

  const paidAmount = Math.max(0, grossPaidAmount - refundedAmount);
  const booking = getBookingRaw(bookingId);
  const bookingAmount =
    booking?.amount === null || booking?.amount === undefined
      ? null
      : Number(booking.amount);

  let effectiveStatus: BookingPaymentStatus = "unpaid";

  if (payments.length === 0) {
    effectiveStatus = "unpaid";
  } else if (grossPaidAmount > 0 && refundedAmount >= grossPaidAmount) {
    effectiveStatus = "refunded";
  } else if (paidAmount > 0 && bookingAmount !== null && paidAmount < bookingAmount) {
    effectiveStatus = "partially_paid";
  } else if (paidAmount > 0) {
    effectiveStatus = "paid";
  } else if (
    payments.some((payment) => pendingStatuses.has(text(payment.status, 40).toLowerCase()))
  ) {
    effectiveStatus = "pending";
  } else if (
    payments.length > 0 &&
    payments.every((payment) => failedStatuses.has(text(payment.status, 40).toLowerCase()))
  ) {
    effectiveStatus = "failed";
  }

  const outstandingAmount =
    bookingAmount === null ? null : Math.max(0, bookingAmount - paidAmount);

  return {
    payments,
    paymentOrders,
    effectiveStatus,
    paidAmount,
    refundedAmount,
    outstandingAmount,
  };
}

function safePaymentForUser(payment: Row, user: AuthenticatedUser): Row {
  if (user.role === "sales" || user.role === "super_admin") return payment;

  return {
    id: payment.id,
    payment_number: payment.payment_number,
    booking_id: payment.booking_id,
    purpose: payment.purpose,
    amount: payment.amount,
    currency: payment.currency,
    provider: payment.provider,
    provider_order_id: payment.provider_order_id,
    provider_payment_id: payment.provider_payment_id,
    status: payment.status,
    payment_method: payment.payment_method,
    paid_at: payment.paid_at,
    failed_at: payment.failed_at,
    failure_reason: payment.failure_reason,
    refund_amount_paise: payment.refund_amount_paise,
    refunded_at: payment.refunded_at,
    receipt: payment.receipt,
    created_at: payment.created_at,
    updated_at: payment.updated_at,
  };
}

function safePaymentOrderForUser(order: Row, user: AuthenticatedUser): Row {
  if (user.role === "sales" || user.role === "super_admin") return order;

  return {
    id: order.id,
    order_number: order.order_number,
    booking_id: order.booking_id,
    purpose: order.purpose,
    amount: order.amount,
    amount_paise: order.amount_paise,
    currency: order.currency,
    provider: order.provider,
    provider_order_id: order.provider_order_id,
    status: order.status,
    receipt: order.receipt,
    expires_at: order.expires_at,
    created_at: order.created_at,
    updated_at: order.updated_at,
  };
}

function serializeBooking(
  booking: Row,
  includeFinancial = true,
  user?: AuthenticatedUser,
): Row {
  const payment = includeFinancial ? paymentSummary(Number(booking.id)) : null;

  return {
    ...booking,
    kind: booking.kind as BookingKind,
    status: booking.status as BookingStatus,
    payment_status: payment?.effectiveStatus ?? booking.payment_status,
    payment: payment
      ? {
          effectiveStatus: payment.effectiveStatus,
          paidAmount: payment.paidAmount,
          grossPaidAmount: Math.max(
            0,
            payment.paidAmount + payment.refundedAmount,
          ),
          refundedAmount: payment.refundedAmount,
          outstandingAmount: payment.outstandingAmount,
        }
      : null,
    paymentRecords:
      user && payment
        ? payment.payments.map((item) => safePaymentForUser(item, user))
        : undefined,
  };
}

/* -------------------------------------------------------------------------- */
/* Booking details                                                           */
/* -------------------------------------------------------------------------- */

function bookingDetail(bookingId: number, user: AuthenticatedUser): Row | null {
  const booking = db
    .prepare(
      `
      SELECT
        b.*,
        u.name AS customer_name,
        u.email AS customer_email,
        u.phone AS customer_phone,
        l.lead_number,
        l.name AS lead_name,
        l.phone AS lead_phone,
        l.email AS lead_email,
        pp.display_name AS pandit_name,
        pp.slug AS pandit_slug,
        t.name AS temple_name,
        t.slug AS temple_slug,
        a.name AS ashram_name,
        a.slug AS ashram_slug,
        ps.name AS puja_service_name,
        ps.slug AS puja_service_slug,
        yp.name AS yatra_package_name,
        yp.slug AS yatra_package_slug,
        c.title AS course_name,
        c.slug AS course_slug,
        e.title AS event_name,
        e.slug AS event_slug
      FROM bookings b
      LEFT JOIN users u ON u.id = b.user_id
      LEFT JOIN leads l ON l.id = b.lead_id
      LEFT JOIN pandit_profiles pp ON pp.id = b.pandit_id
      LEFT JOIN temples t ON t.id = b.temple_id
      LEFT JOIN ashrams a ON a.id = b.ashram_id
      LEFT JOIN puja_services ps ON ps.id = b.puja_id
      LEFT JOIN yatra_packages yp ON yp.id = b.package_id
      LEFT JOIN courses c ON c.id = b.course_id
      LEFT JOIN events e ON e.id = b.event_id
      WHERE b.id = ?
      LIMIT 1
      `,
    )
    .get(bookingId) as Row | undefined;

  if (!booking || !canViewBooking(user, booking)) return null;

  const detail = serializeBooking(booking, true, user);
  const requests: Row[] = [];

  const leadId = positiveId(booking.lead_id);
  if (leadId && tableExists("form_submissions")) {
    const submission = db
      .prepare(
        `
        SELECT *
        FROM form_submissions
        WHERE lead_id = ?
        ORDER BY id DESC
        LIMIT 1
        `,
      )
      .get(leadId) as Row | undefined;

    if (submission) {
      detail.form_submission = submission;

      const requestTables: string[] = [
        "puja_service_requests",
        "pandit_booking_requests",
        "yatra_booking_requests",
        "temple_enquiry_requests",
        "ashram_enquiry_requests",
        "event_enquiry_requests",
        "course_enquiry_requests",
        "contact_requests",
      ];

      for (const tableName of requestTables) {
        if (!tableExists(tableName)) continue;
        const row = db
          .prepare(
            `SELECT * FROM ${tableName} WHERE form_submission_id = ? LIMIT 1`,
          )
          .get(submission.id) as Row | undefined;
        if (row) requests.push(row);
      }
    }
  }

  detail.structured_requests = requests;

  if (
    (user.role === "sales" || user.role === "super_admin") &&
    leadId &&
    tableExists("lead_events")
  ) {
    detail.lead_events = db
      .prepare(
        `
        SELECT le.*, u.name AS actor_name
        FROM lead_events le
        LEFT JOIN users u ON u.id = le.user_id
        WHERE le.lead_id = ?
        ORDER BY le.id DESC
        LIMIT 200
        `,
      )
      .all(leadId);
  }

  const payments = paymentSummary(bookingId);
  detail.payments = payments.payments.map((item) => safePaymentForUser(item, user));
  detail.payment_orders = payments.paymentOrders.map((item) =>
    safePaymentOrderForUser(item, user),
  );

  return detail;
}

/* -------------------------------------------------------------------------- */
/* Analytics conversion                                                      */
/* -------------------------------------------------------------------------- */

function recordBookingConversion(
  bookingId: number,
  userId: number | null,
  leadId: number | null,
  kind: BookingKind,
  entityId: number | null,
  amount: number | null,
  currency: string,
): void {
  if (!tableExists("web_conversions")) return;

  try {
    const lead = leadId
      ? (db
          .prepare(
            `
            SELECT visitor_id, session_id, source_page,
                   utm_source, utm_medium, utm_campaign, utm_term, utm_content
            FROM leads
            WHERE id = ?
            LIMIT 1
            `,
          )
          .get(leadId) as Row | undefined)
      : undefined;

    let visitorId = positiveId(lead?.visitor_id);
    let sessionId = positiveId(lead?.session_id);
    let pageViewId: number | null = null;
    let path = nullableText(lead?.source_page, 1000);
    let utmSource = nullableText(lead?.utm_source, 250);
    let utmMedium = nullableText(lead?.utm_medium, 250);
    let utmCampaign = nullableText(lead?.utm_campaign, 250);
    let utmTerm = nullableText(lead?.utm_term, 250);
    let utmContent = nullableText(lead?.utm_content, 250);

    if (!sessionId && userId && tableExists("web_sessions")) {
      const session = db
        .prepare(
          `
          SELECT id, visitor_id
          FROM web_sessions
          WHERE user_id = ?
            AND is_bot = 0
            AND last_activity_at >= datetime('now', '-1 day')
          ORDER BY id DESC
          LIMIT 1
          `,
        )
        .get(userId) as { id?: number; visitor_id?: number | null } | undefined;

      sessionId = positiveId(session?.id);
      visitorId = visitorId ?? positiveId(session?.visitor_id);
    }

    if (sessionId && tableExists("web_page_views")) {
      const page = db
        .prepare(
          `
          SELECT id, path, utm_source, utm_medium, utm_campaign, utm_term, utm_content
          FROM web_page_views
          WHERE session_id = ?
          ORDER BY id DESC
          LIMIT 1
          `,
        )
        .get(sessionId) as Row | undefined;

      pageViewId = positiveId(page?.id);
      path = path ?? nullableText(page?.path, 1000);
      utmSource = utmSource ?? nullableText(page?.utm_source, 250);
      utmMedium = utmMedium ?? nullableText(page?.utm_medium, 250);
      utmCampaign = utmCampaign ?? nullableText(page?.utm_campaign, 250);
      utmTerm = utmTerm ?? nullableText(page?.utm_term, 250);
      utmContent = utmContent ?? nullableText(page?.utm_content, 250);
    }

    const alreadyRecorded = db
      .prepare(
        `
        SELECT 1
        FROM web_conversions
        WHERE booking_id = ?
          AND conversion_type = 'booking'
        LIMIT 1
        `,
      )
      .get(bookingId);

    if (alreadyRecorded) return;

    db.prepare(
      `
      INSERT INTO web_conversions (
        visitor_id,
        session_id,
        page_view_id,
        conversion_type,
        booking_id,
        lead_id,
        user_id,
        value_amount,
        currency,
        path,
        entity_type,
        entity_id,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_term,
        utm_content,
        created_at
      ) VALUES (?, ?, ?, 'booking', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `,
    ).run(
      visitorId,
      sessionId,
      pageViewId,
      bookingId,
      leadId,
      userId,
      amount,
      currency,
      path,
      kind,
      entityId,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
    );
  } catch (error) {
    console.error("Booking analytics conversion error:", error);
  }
}

/* -------------------------------------------------------------------------- */
/* GET /meta                                                                 */
/* -------------------------------------------------------------------------- */

router.get("/meta", (_req: Request, res: Response) => {
  res.json({
    success: true,
    bookingKinds: BOOKING_KINDS,
    bookingStatuses: BOOKING_STATUSES,
    bookingPaymentStatuses: BOOKING_PAYMENT_STATUSES,
    terminalStatuses: Array.from(TERMINAL_BOOKING_STATUSES),
    operationalRoles: [
      "pandit",
      "temple_manager",
      "ashram_manager",
      "sales",
      "super_admin",
    ],
  });
});

/* -------------------------------------------------------------------------- */
/* GET /health                                                               */
/* -------------------------------------------------------------------------- */

router.get("/health", (_req: Request, res: Response) => {
  try {
    const bookingCount = db
      .prepare(`SELECT COUNT(*) AS count FROM bookings`)
      .get() as { count?: number } | undefined;

    res.json({
      success: true,
      service: "bookings",
      status: "healthy",
      database: true,
      bookingCount: Number(bookingCount?.count ?? 0),
      timestamp: nowIso(),
    });
  } catch (error) {
    console.error("Booking health error:", error);
    res.status(500).json({
      success: false,
      service: "bookings",
      status: "unhealthy",
      database: false,
    });
  }
});

/* -------------------------------------------------------------------------- */
/* GET /stats                                                                */
/* -------------------------------------------------------------------------- */

router.get(
  "/stats",
  requireAuth,
  requireRole("sales", "super_admin"),
  (req: Request, res: Response) => {
    try {
      const from = text(req.query.from ?? req.query.dateFrom, 50);
      const to = text(req.query.to ?? req.query.dateTo, 50);
      const filters: string[] = ["1 = 1"];
      const params: unknown[] = [];

      if (from) {
        filters.push("b.created_at >= ?");
        params.push(from);
      }
      if (to) {
        filters.push("b.created_at <= ?");
        params.push(to);
      }

      const whereSql = `WHERE ${filters.join(" AND ")}`;

      const totals = db
        .prepare(
          `
          SELECT
            COUNT(*) AS total,
            SUM(CASE WHEN status = 'received' THEN 1 ELSE 0 END) AS received,
            SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
            SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
            SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled,
            SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
            COALESCE(SUM(COALESCE(amount, 0)), 0) AS booking_value
          FROM bookings b
          ${whereSql}
          `,
        )
        .get(...params) as Row | undefined;

      const paymentTotals = db
        .prepare(
          `
          SELECT
            COUNT(DISTINCT p.booking_id) AS paid_booking_count,
            COALESCE(
              SUM(CASE WHEN p.status IN ('paid','captured') THEN COALESCE(p.amount, 0) ELSE 0 END),
              0
            ) AS gross_collected,
            COALESCE(SUM(COALESCE(p.refund_amount_paise, 0)) / 100.0, 0) AS refunded_amount
          FROM payments p
          INNER JOIN bookings b ON b.id = p.booking_id
          ${whereSql}
          `,
        )
        .get(...params) as Row | undefined;

      const byKind = db
        .prepare(
          `
          SELECT
            kind,
            COUNT(*) AS count,
            COALESCE(SUM(COALESCE(amount, 0)), 0) AS booking_value
          FROM bookings b
          ${whereSql}
          GROUP BY kind
          ORDER BY count DESC, kind ASC
          `,
        )
        .all(...params);

      res.json({
        success: true,
        range: { from: from || null, to: to || null },
        totals: {
          total: Number(totals?.total ?? 0),
          received: Number(totals?.received ?? 0),
          confirmed: Number(totals?.confirmed ?? 0),
          inProgress: Number(totals?.in_progress ?? 0),
          completed: Number(totals?.completed ?? 0),
          cancelled: Number(totals?.cancelled ?? 0),
          rejected: Number(totals?.rejected ?? 0),
          bookingValue: Number(totals?.booking_value ?? 0),
        },
        payments: {
          paidBookingCount: Number(paymentTotals?.paid_booking_count ?? 0),
          grossCollected: Number(paymentTotals?.gross_collected ?? 0),
          refundedAmount: Number(paymentTotals?.refunded_amount ?? 0),
          netCollected: Math.max(
            0,
            Number(paymentTotals?.gross_collected ?? 0) -
              Number(paymentTotals?.refunded_amount ?? 0),
          ),
        },
        byKind,
      });
    } catch (error) {
      console.error("Booking stats error:", error);
      res.status(500).json({
        success: false,
        error: "Unable to load booking statistics.",
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* GET /mine                                                                 */
/* -------------------------------------------------------------------------- */

router.get("/mine", requireAuth, (req: Request, res: Response) => {
  try {
    const user = currentUserRequired(res);
    const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(1, Math.floor(Number(req.query.limit) || 25)),
    );
    const offset = (page - 1) * limit;

    const where: string[] = ["b.user_id = ?"];
    const params: unknown[] = [user.id];

    const status = enumValue(req.query.status, BOOKING_STATUSES);
    if (status) {
      where.push("b.status = ?");
      params.push(status);
    }

    const kind = enumValue(req.query.kind, BOOKING_KINDS);
    if (kind) {
      where.push("b.kind = ?");
      params.push(kind);
    }

    const search = text(req.query.search, 180);
    if (search) {
      const pattern = `%${search}%`;
      where.push(`
        (
          LOWER(COALESCE(b.booking_number, '')) LIKE LOWER(?)
          OR LOWER(COALESCE(b.title, '')) LIKE LOWER(?)
        )
      `);
      params.push(pattern, pattern);
    }

    const whereSql = `WHERE ${where.join(" AND ")}`;
    const totalRow = db
      .prepare(`SELECT COUNT(*) AS count FROM bookings b ${whereSql}`)
      .get(...params) as { count?: number } | undefined;
    const total = Number(totalRow?.count ?? 0);

    const rows = db
      .prepare(
        `
        SELECT
          b.*,
          pp.display_name AS pandit_name,
          t.name AS temple_name,
          a.name AS ashram_name,
          ps.name AS puja_service_name,
          yp.name AS yatra_package_name,
          c.title AS course_name,
          e.title AS event_name
        FROM bookings b
        LEFT JOIN pandit_profiles pp ON pp.id = b.pandit_id
        LEFT JOIN temples t ON t.id = b.temple_id
        LEFT JOIN ashrams a ON a.id = b.ashram_id
        LEFT JOIN puja_services ps ON ps.id = b.puja_id
        LEFT JOIN yatra_packages yp ON yp.id = b.package_id
        LEFT JOIN courses c ON c.id = b.course_id
        LEFT JOIN events e ON e.id = b.event_id
        ${whereSql}
        ORDER BY b.id DESC
        LIMIT ? OFFSET ?
        `,
      )
      .all(...params, limit, offset) as Row[];

    res.json({
      success: true,
      bookings: rows.map((row) => serializeBooking(row, true, user)),
      pagination: {
        page,
        limit,
        offset,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("My bookings error:", error);
    res.status(500).json({
      success: false,
      error: "Unable to load your bookings.",
    });
  }
});

/* -------------------------------------------------------------------------- */
/* GET /assigned                                                             */
/* -------------------------------------------------------------------------- */

router.get(
  "/assigned",
  requireAuth,
  requireRole(
    "pandit",
    "temple_manager",
    "ashram_manager",
    "sales",
    "super_admin",
  ),
  (req: Request, res: Response) => {
    try {
      const user = currentUserRequired(res);
      const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
      const limit = Math.min(
        MAX_PAGE_SIZE,
        Math.max(1, Math.floor(Number(req.query.limit) || 25)),
      );
      const offset = (page - 1) * limit;

      const scopeClauses: string[] = [];
      const scopeParams: unknown[] = [];

      if (user.role === "pandit") {
        scopeClauses.push(
          `b.pandit_id = (SELECT id FROM pandit_profiles WHERE user_id = ? LIMIT 1)`,
        );
        scopeParams.push(user.id);
      } else if (user.role === "temple_manager") {
        scopeClauses.push(`
          EXISTS (
            SELECT 1
            FROM temple_manager_assignments tma
            WHERE tma.temple_id = b.temple_id
              AND tma.manager_user_id = ?
              AND tma.status = 'active'
          )
        `);
        scopeParams.push(user.id);
      } else if (user.role === "ashram_manager") {
        scopeClauses.push(`
          EXISTS (
            SELECT 1
            FROM ashram_manager_assignments ama
            WHERE ama.ashram_id = b.ashram_id
              AND ama.manager_user_id = ?
              AND ama.status = 'active'
          )
        `);
        scopeParams.push(user.id);
      }

      const where: string[] = [scopeClauses.length ? scopeClauses.join(" AND ") : "1 = 1"];
      const params: unknown[] = [...scopeParams];

      const status = enumValue(req.query.status, BOOKING_STATUSES);
      if (status) {
        where.push("b.status = ?");
        params.push(status);
      }

      const kind = enumValue(req.query.kind, BOOKING_KINDS);
      if (kind) {
        where.push("b.kind = ?");
        params.push(kind);
      }

      const search = text(req.query.search, 180);
      if (search) {
        const pattern = `%${search}%`;
        where.push(`
          (
            LOWER(COALESCE(b.booking_number, '')) LIKE LOWER(?)
            OR LOWER(COALESCE(b.title, '')) LIKE LOWER(?)
            OR LOWER(COALESCE(u.name, '')) LIKE LOWER(?)
            OR LOWER(COALESCE(u.phone, '')) LIKE LOWER(?)
          )
        `);
        params.push(pattern, pattern, pattern, pattern);
      }

      const whereSql = `WHERE ${where.join(" AND ")}`;

      const totalRow = db
        .prepare(
          `
          SELECT COUNT(*) AS count
          FROM bookings b
          LEFT JOIN users u ON u.id = b.user_id
          ${whereSql}
          `,
        )
        .get(...params) as { count?: number } | undefined;

      const total = Number(totalRow?.count ?? 0);

      const rows = db
        .prepare(
          `
          SELECT
            b.*,
            u.name AS customer_name,
            u.email AS customer_email,
            u.phone AS customer_phone,
            l.lead_number,
            pp.display_name AS pandit_name,
            t.name AS temple_name,
            a.name AS ashram_name,
            ps.name AS puja_service_name,
            yp.name AS yatra_package_name,
            c.title AS course_name,
            e.title AS event_name
          FROM bookings b
          LEFT JOIN users u ON u.id = b.user_id
          LEFT JOIN leads l ON l.id = b.lead_id
          LEFT JOIN pandit_profiles pp ON pp.id = b.pandit_id
          LEFT JOIN temples t ON t.id = b.temple_id
          LEFT JOIN ashrams a ON a.id = b.ashram_id
          LEFT JOIN puja_services ps ON ps.id = b.puja_id
          LEFT JOIN yatra_packages yp ON yp.id = b.package_id
          LEFT JOIN courses c ON c.id = b.course_id
          LEFT JOIN events e ON e.id = b.event_id
          ${whereSql}
          ORDER BY
            CASE b.status
              WHEN 'received' THEN 0
              WHEN 'confirmed' THEN 1
              WHEN 'in_progress' THEN 2
              WHEN 'completed' THEN 3
              ELSE 4
            END,
            b.id DESC
          LIMIT ? OFFSET ?
          `,
        )
        .all(...params, limit, offset) as Row[];

      res.json({
        success: true,
        bookings: rows.map((row) => serializeBooking(row, true, user)),
        pagination: {
          page,
          limit,
          offset,
          total,
          totalPages: Math.ceil(total / limit),
        },
        scope: user.role,
      });
    } catch (error) {
      console.error("Assigned booking list error:", error);
      res.status(500).json({
        success: false,
        error: "Unable to load assigned bookings.",
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* GET / global                                                             */
/* -------------------------------------------------------------------------- */

router.get(
  "/",
  requireAuth,
  requireRole("sales", "super_admin"),
  (req: Request, res: Response) => {
    try {
      const user = currentUserRequired(res);
      const page = Math.max(1, Math.floor(Number(req.query.page) || 1));
      const limit = Math.min(
        MAX_PAGE_SIZE,
        Math.max(1, Math.floor(Number(req.query.limit) || 25)),
      );
      const offset = (page - 1) * limit;
      const where: string[] = ["1 = 1"];
      const params: unknown[] = [];

      const status = enumValue(req.query.status, BOOKING_STATUSES);
      if (status) {
        where.push("b.status = ?");
        params.push(status);
      }

      const paymentStatus = enumValue(req.query.paymentStatus, BOOKING_PAYMENT_STATUSES);
      if (paymentStatus) {
        const paidExists = `EXISTS (
          SELECT 1 FROM payments bp
          WHERE bp.booking_id = b.id
            AND bp.status IN ('paid', 'captured')
        )`;
        const pendingExists = `EXISTS (
          SELECT 1 FROM payments bp
          WHERE bp.booking_id = b.id
            AND bp.status IN ('created', 'pending', 'authorized')
        )`;
        const failedExists = `EXISTS (
          SELECT 1 FROM payments bp
          WHERE bp.booking_id = b.id
            AND bp.status = 'failed'
        )`;
        const netPaidExpression = `
          COALESCE((
            SELECT SUM(CASE WHEN bp.status IN ('paid', 'captured')
              THEN COALESCE(bp.amount, 0) ELSE 0 END)
            FROM payments bp
            WHERE bp.booking_id = b.id
          ), 0)
          -
          COALESCE((
            SELECT SUM(COALESCE(bp.refund_amount_paise, 0)) / 100.0
            FROM payments bp
            WHERE bp.booking_id = b.id
          ), 0)
        `;

        switch (paymentStatus) {
          case "paid":
            where.push(`${paidExists} AND (b.amount IS NULL OR ${netPaidExpression} >= b.amount)`);
            break;
          case "partially_paid":
            where.push(
              `${paidExists} AND b.amount IS NOT NULL AND ${netPaidExpression} > 0 AND ${netPaidExpression} < b.amount`,
            );
            break;
          case "refunded":
            where.push(
              `${paidExists} AND ${netPaidExpression} <= 0 AND EXISTS (SELECT 1 FROM payments rb WHERE rb.booking_id = b.id AND COALESCE(rb.refund_amount_paise, 0) > 0)`,
            );
            break;
          case "pending":
            where.push(`NOT (${paidExists}) AND ${pendingExists}`);
            break;
          case "failed":
            where.push(`NOT (${paidExists}) AND NOT (${pendingExists}) AND ${failedExists}`);
            break;
          case "unpaid":
            where.push(`NOT (${paidExists}) AND NOT (${pendingExists})`);
            break;
        }
      }

      const kind = enumValue(req.query.kind, BOOKING_KINDS);
      if (kind) {
        where.push("b.kind = ?");
        params.push(kind);
      }

      const panditId = positiveId(req.query.panditId);
      if (panditId) {
        where.push("b.pandit_id = ?");
        params.push(panditId);
      }

      const templeId = positiveId(req.query.templeId);
      if (templeId) {
        where.push("b.temple_id = ?");
        params.push(templeId);
      }

      const ashramId = positiveId(req.query.ashramId);
      if (ashramId) {
        where.push("b.ashram_id = ?");
        params.push(ashramId);
      }

      const from = text(req.query.from ?? req.query.dateFrom, 50);
      const to = text(req.query.to ?? req.query.dateTo, 50);

      if (from) {
        where.push("b.created_at >= ?");
        params.push(from);
      }
      if (to) {
        where.push("b.created_at <= ?");
        params.push(to);
      }

      const search = text(req.query.search, 180);
      if (search) {
        const pattern = `%${search}%`;
        where.push(`
          (
            LOWER(COALESCE(b.booking_number, '')) LIKE LOWER(?)
            OR LOWER(COALESCE(b.title, '')) LIKE LOWER(?)
            OR LOWER(COALESCE(u.name, '')) LIKE LOWER(?)
            OR LOWER(COALESCE(u.email, '')) LIKE LOWER(?)
            OR LOWER(COALESCE(u.phone, '')) LIKE LOWER(?)
            OR LOWER(COALESCE(l.lead_number, '')) LIKE LOWER(?)
          )
        `);
        params.push(pattern, pattern, pattern, pattern, pattern, pattern);
      }

      const whereSql = `WHERE ${where.join(" AND ")}`;

      const totalRow = db
        .prepare(
          `
          SELECT COUNT(*) AS count
          FROM bookings b
          LEFT JOIN users u ON u.id = b.user_id
          LEFT JOIN leads l ON l.id = b.lead_id
          ${whereSql}
          `,
        )
        .get(...params) as { count?: number } | undefined;

      const total = Number(totalRow?.count ?? 0);

      const rows = db
        .prepare(
          `
          SELECT
            b.*,
            u.name AS customer_name,
            u.email AS customer_email,
            u.phone AS customer_phone,
            l.lead_number,
            pp.display_name AS pandit_name,
            t.name AS temple_name,
            a.name AS ashram_name,
            ps.name AS puja_service_name,
            yp.name AS yatra_package_name,
            c.title AS course_name,
            e.title AS event_name
          FROM bookings b
          LEFT JOIN users u ON u.id = b.user_id
          LEFT JOIN leads l ON l.id = b.lead_id
          LEFT JOIN pandit_profiles pp ON pp.id = b.pandit_id
          LEFT JOIN temples t ON t.id = b.temple_id
          LEFT JOIN ashrams a ON a.id = b.ashram_id
          LEFT JOIN puja_services ps ON ps.id = b.puja_id
          LEFT JOIN yatra_packages yp ON yp.id = b.package_id
          LEFT JOIN courses c ON c.id = b.course_id
          LEFT JOIN events e ON e.id = b.event_id
          ${whereSql}
          ORDER BY
            CASE b.status
              WHEN 'received' THEN 0
              WHEN 'confirmed' THEN 1
              WHEN 'in_progress' THEN 2
              WHEN 'completed' THEN 3
              ELSE 4
            END,
            b.id DESC
          LIMIT ? OFFSET ?
          `,
        )
        .all(...params, limit, offset) as Row[];

      res.json({
        success: true,
        bookings: rows.map((row) => serializeBooking(row, false, user)),
        pagination: {
          page,
          limit,
          offset,
          total,
          totalPages: Math.ceil(total / limit),
        },
        filters: {
          status: status ?? null,
          paymentStatus: paymentStatus ?? null,
          kind: kind ?? null,
          panditId,
          templeId,
          ashramId,
          from: from || null,
          to: to || null,
          search: search || null,
        },
      });
    } catch (error) {
      console.error("Booking global list error:", error);
      res.status(500).json({
        success: false,
        error: "Unable to load bookings.",
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* POST /                                                                    */
/* -------------------------------------------------------------------------- */

router.post("/", optionalAuth, (req: Request, res: Response) => {
  try {
    const user = currentUser(res);
    const body = bodyOf(req);
    const leadId = positiveId(body.leadId);
    const customerUserId = positiveId(body.customerUserId ?? body.customerId);

    if (!user) {
      res.status(401).json({
        success: false,
        error: "Please sign in before creating a direct booking. Public enquiries should use the lead form.",
        code: "AUTH_REQUIRED_FOR_DIRECT_BOOKING",
      });
      return;
    }

    const isCustomer = user.role === "visitor";
    const isInternal = user.role === "sales" || user.role === "super_admin";

    if (!isCustomer && !isInternal) {
      res.status(403).json({
        success: false,
        error: "Only a Visitor or internal Sales/Super Admin account can create a direct booking.",
      });
      return;
    }

    if (leadId && !isInternal) {
      res.status(403).json({
        success: false,
        error: "Only Sales or Super Admin can attach an existing CRM lead to a booking.",
      });
      return;
    }

    if (customerUserId && !isInternal) {
      res.status(403).json({
        success: false,
        error: "You can only create a booking for your own account.",
      });
      return;
    }

    if (leadId) {
      const lead = db
        .prepare(`SELECT id, user_id FROM leads WHERE id = ? LIMIT 1`)
        .get(leadId) as Row | undefined;
      if (!lead) {
        res.status(400).json({ success: false, error: "Lead not found." });
        return;
      }
    }

    let userId: number | null = null;

    if (isCustomer) {
      userId = user.id;
    } else if (customerUserId) {
      const customer = getCustomerUser(customerUserId);
      if (!customer || customer.status !== "active" || customer.role_code !== "visitor") {
        res.status(400).json({
          success: false,
          error: "Selected customer account must be an active Visitor account.",
        });
        return;
      }
      userId = customerUserId;
    } else if (leadId) {
      const lead = db
        .prepare(`SELECT user_id FROM leads WHERE id = ? LIMIT 1`)
        .get(leadId) as { user_id?: number | null } | undefined;
      userId = positiveId(lead?.user_id);

      if (!userId) {
        res.status(400).json({
          success: false,
          error: "The selected lead is not linked to a customer account. Supply customerUserId for an internal booking.",
        });
        return;
      }
    } else {
      res.status(400).json({
        success: false,
        error: "Internal booking creation requires leadId or customerUserId.",
      });
      return;
    }

    const kind = inferredKind(body);
    const entities = ensurePublishedEntity(kind, body);
    const title = makeBookingTitle(kind, body);
    const date = nullableText(
      body.date ?? body.requestedDate ?? body.preferredDate,
      80,
    );
    const time = nullableText(body.time ?? body.preferredTime, 80);
    const detailValue = body.detail ?? body.details ?? body.message;
    const detail =
      typeof detailValue === "object" ? jsonText(detailValue) : nullableText(detailValue, 20_000);
    const amount = nonNegativeInteger(
      body.amount ?? body.price ?? body.totalAmount,
      null,
      1_000_000_000,
    );
    const currency = text(body.currency ?? "INR", 10).toUpperCase() || "INR";

    if (!/^[A-Z]{3}$/.test(currency)) {
      res.status(400).json({ success: false, error: "Invalid currency." });
      return;
    }

    const bookingNumber = makeReference("DD-BOOK");

    const result = db.transaction(() => {
      const inserted = db
        .prepare(
          `
          INSERT INTO bookings (
            booking_number,
            user_id,
            lead_id,
            pandit_id,
            temple_id,
            ashram_id,
            puja_id,
            package_id,
            course_id,
            event_id,
            kind,
            title,
            date,
            time,
            status,
            detail,
            amount,
            currency,
            payment_status,
            created_at,
            updated_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
            'received', ?, ?, ?, 'unpaid', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
          )
          `,
        )
        .run(
          bookingNumber,
          userId,
          leadId,
          entities.panditId,
          entities.templeId,
          entities.ashramId,
          entities.pujaId,
          entities.packageId,
          entities.courseId,
          entities.eventId,
          kind,
          title,
          date,
          time,
          detail,
          amount,
          currency,
        );

      const bookingId = Number(inserted.lastInsertRowid);

      if (leadId && tableExists("lead_events")) {
        db.prepare(
          `
          INSERT INTO lead_events (
            lead_id,
            user_id,
            event_type,
            notes,
            metadata_json
          ) VALUES (?, ?, 'booking_created', ?, ?)
          `,
        ).run(
          leadId,
          user.id,
          `Booking ${bookingNumber} created.`,
          jsonText({ bookingId, bookingKind: kind }),
        );
      }

      return bookingId;
    })();

    const booking = getBookingRaw(result);

    recordBookingConversion(
      result,
      userId,
      leadId,
      kind,
      entities.panditId ??
        entities.templeId ??
        entities.ashramId ??
        entities.pujaId ??
        entities.packageId ??
        entities.courseId ??
        entities.eventId,
      amount,
      currency,
    );

    audit(req, "booking.created", "booking", result, null, booking);

    if (booking) {
      for (const providerUserId of providerUserIds(booking)) {
        notifyUser(
          providerUserId,
          "booking",
          "New booking received",
          `${bookingEntityLabel(booking)} has been received.`,
          `/bookings/${result}`,
          { bookingId: result, source: "booking.create" },
        );
      }

      if (userId) {
        notifyUser(
          userId,
          "booking",
          "Booking received",
          `Your booking ${bookingNumber} has been received.`,
          `/bookings/${result}`,
          { bookingId: result },
        );
      }
    }

    res.status(201).json({
      success: true,
      booking: booking ? serializeBooking(booking, true, user) : null,
      bookingNumber,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const badRequestMessages = new Set([
      "Selected Pandit is not currently bookable.",
      "Selected Temple is not currently bookable.",
      "Selected Ashram is not currently bookable.",
      "Selected Puja Service is not currently bookable.",
      "Selected Yatra package is not currently bookable.",
      "Selected Course is not currently bookable.",
      "Selected Event is not currently bookable.",
      "A valid bookable entity is required.",
      "panditId is required for a Pandit booking.",
      "pujaId is required for a Puja booking.",
      "templeId is required for a Temple booking.",
      "ashramId is required for an Ashram booking.",
      "packageId is required for a Yatra booking.",
      "courseId is required for a Course booking.",
      "eventId is required for an Event booking.",
      "Selected Pandit service is not available for this Pandit.",
      "panditServiceId requires panditId.",
    ]);

    if (badRequestMessages.has(message)) {
      res.status(400).json({ success: false, error: message });
      return;
    }

    console.error("Booking create error:", error);
    res.status(500).json({ success: false, error: "Unable to create booking." });
  }
});

/* -------------------------------------------------------------------------- */
/* GET /:id                                                                  */
/* -------------------------------------------------------------------------- */

router.get("/:id", requireAuth, (req: Request, res: Response) => {
  try {
    const user = currentUserRequired(res);
    const bookingId = positiveId(req.params.id);
    if (!bookingId) {
      res.status(400).json({ success: false, error: "Invalid booking id." });
      return;
    }

    const detail = bookingDetail(bookingId, user);
    if (!detail) {
      res.status(404).json({
        success: false,
        error: "Booking not found or you do not have access to it.",
      });
      return;
    }

    res.json({ success: true, booking: detail });
  } catch (error) {
    console.error("Booking detail error:", error);
    res.status(500).json({ success: false, error: "Unable to load booking details." });
  }
});

/* -------------------------------------------------------------------------- */
/* POST /:id/cancel                                                          */
/* -------------------------------------------------------------------------- */

router.post("/:id/cancel", requireAuth, (req: Request, res: Response) => {
  try {
    const user = currentUserRequired(res);
    const bookingId = positiveId(req.params.id);
    if (!bookingId) {
      res.status(400).json({ success: false, error: "Invalid booking id." });
      return;
    }

    const booking = getBookingRaw(bookingId);
    if (!booking) {
      res.status(404).json({ success: false, error: "Booking not found." });
      return;
    }

    const status = enumValue(booking.status, BOOKING_STATUSES) as BookingStatus | null;
    if (!status) {
      res.status(500).json({ success: false, error: "Stored booking status is invalid." });
      return;
    }

    const isOpsUser = user.role === "sales" || user.role === "super_admin";
    const isProvider = providerScopeMatches(user, booking);
    const isOwner = customerOwnsBooking(user, booking);

    if (!isOpsUser && !isProvider && !isOwner) {
      res.status(403).json({
        success: false,
        error: "You do not have access to cancel this booking.",
      });
      return;
    }

    if (isOwner && !isOpsUser && !isProvider && !CUSTOMER_CANCELLABLE_STATUSES.has(status)) {
      res.status(409).json({
        success: false,
        error: "This booking can no longer be cancelled from the customer side.",
      });
      return;
    }

    if (isProvider && !isOpsUser && !isOwner && !PROVIDER_CANCELLABLE_STATUSES.has(status)) {
      res.status(409).json({
        success: false,
        error: "This booking can no longer be cancelled from the provider side.",
      });
      return;
    }

    if (isOpsUser && TERMINAL_BOOKING_STATUSES.has(status)) {
      res.status(409).json({
        success: false,
        error: "A terminal booking cannot be cancelled again.",
      });
      return;
    }

    const reason = nullableText(bodyOf(req).reason, 5000);

    db.prepare(
      `
      UPDATE bookings
      SET
        status = 'cancelled',
        detail = CASE
          WHEN ? IS NULL OR TRIM(?) = '' THEN detail
          WHEN detail IS NULL OR TRIM(detail) = '' THEN ?
          ELSE detail || '\nCancellation reason: ' || ?
        END,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
    ).run(reason, reason, reason, reason, bookingId);

    if (booking.lead_id && tableExists("lead_events")) {
      db.prepare(
        `
        INSERT INTO lead_events (
          lead_id,
          user_id,
          event_type,
          old_status,
          new_status,
          notes,
          metadata_json
        ) VALUES (?, ?, 'booking_cancelled', ?, 'cancelled', ?, ?)
        `,
      ).run(
        booking.lead_id,
        user.id,
        booking.status,
        `Booking ${text(booking.booking_number, 120)} cancelled by ${user.name}.`,
        jsonText({ bookingId, reason: reason ?? null }),
      );
    }

    const updated = getBookingRaw(bookingId);
    audit(req, "booking.cancelled", "booking", bookingId, booking, updated);

    if (updated) {
      const ownerId = positiveId(updated.user_id);
      if (ownerId) {
        notifyUser(
          ownerId,
          "booking",
          "Booking cancelled",
          `${bookingEntityLabel(updated)} has been cancelled.`,
          `/bookings/${bookingId}`,
          { bookingId, reason: reason ?? null },
        );
      }

      for (const providerUserId of providerUserIds(updated)) {
        notifyUser(
          providerUserId,
          "booking",
          "Booking cancelled",
          `${bookingEntityLabel(updated)} has been cancelled.`,
          `/bookings/${bookingId}`,
          { bookingId, reason: reason ?? null },
        );
      }
    }

    res.json({
      success: true,
      booking: updated ? serializeBooking(updated, true, user) : null,
    });
  } catch (error) {
    console.error("Booking cancellation error:", error);
    res.status(500).json({ success: false, error: "Unable to cancel booking." });
  }
});

/* -------------------------------------------------------------------------- */
/* PATCH /:id/status                                                         */
/* -------------------------------------------------------------------------- */

router.patch("/:id/status", requireAuth, (req: Request, res: Response) => {
  try {
    const user = currentUserRequired(res);
    const bookingId = positiveId(req.params.id);
    const status = enumValue(req.body?.status, BOOKING_STATUSES) as BookingStatus | null;

    if (!bookingId) {
      res.status(400).json({ success: false, error: "Invalid booking id." });
      return;
    }
    if (!status) {
      res.status(400).json({ success: false, error: "Invalid booking status." });
      return;
    }

    const booking = getBookingRaw(bookingId);
    if (!booking) {
      res.status(404).json({ success: false, error: "Booking not found." });
      return;
    }

    const currentStatus = enumValue(booking.status, BOOKING_STATUSES) as BookingStatus | null;
    if (!currentStatus) {
      res.status(500).json({ success: false, error: "Stored booking status is invalid." });
      return;
    }

    const isOpsUser = user.role === "sales" || user.role === "super_admin";
    const isProvider = providerScopeMatches(user, booking);

    if (!isOpsUser && !isProvider) {
      res.status(403).json({
        success: false,
        error: "Only the assigned provider or internal operations can change booking status.",
      });
      return;
    }

    if (!isOpsUser && !PROVIDER_STATUSES.has(status)) {
      res.status(400).json({
        success: false,
        error: "Providers may only use operational booking statuses.",
      });
      return;
    }

    if (!isValidBookingTransition(currentStatus, status)) {
      res.status(409).json({
        success: false,
        error: `Booking status transition ${currentStatus} → ${status} is not allowed.`,
      });
      return;
    }

    db.transaction(() => {
      db.prepare(
        `
        UPDATE bookings
        SET status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
      ).run(status, bookingId);

      const leadId = positiveId(booking.lead_id);
      if (leadId && tableExists("lead_events")) {
        db.prepare(
          `
          INSERT INTO lead_events (
            lead_id,
            user_id,
            event_type,
            old_status,
            new_status,
            notes,
            metadata_json
          ) VALUES (?, ?, 'booking_status_changed', ?, ?, ?, ?)
          `,
        ).run(
          leadId,
          user.id,
          currentStatus,
          status,
          `Booking ${text(booking.booking_number, 120)} changed from ${currentStatus} to ${status}.`,
          jsonText({ bookingId, status }),
        );
      }
    })();

    const updated = getBookingRaw(bookingId);
    audit(req, "booking.status_changed", "booking", bookingId, booking, updated);

    if (updated) {
      const ownerId = positiveId(updated.user_id);
      if (ownerId) {
        notifyUser(
          ownerId,
          "booking",
          "Booking status updated",
          `${bookingEntityLabel(updated)} is now ${status.replace(/_/g, " ")}.`,
          `/bookings/${bookingId}`,
          { bookingId, status },
        );
      }
    }

    res.json({
      success: true,
      booking: updated ? serializeBooking(updated, true, user) : null,
    });
  } catch (error) {
    console.error("Booking status error:", error);
    res.status(500).json({ success: false, error: "Unable to update booking status." });
  }
});

/* -------------------------------------------------------------------------- */
/* PATCH /:id                                                               */
/* -------------------------------------------------------------------------- */

router.patch("/:id", requireAuth, (req: Request, res: Response) => {
  try {
    const user = currentUserRequired(res);
    const bookingId = positiveId(req.params.id);
    if (!bookingId) {
      res.status(400).json({ success: false, error: "Invalid booking id." });
      return;
    }

    const booking = getBookingRaw(bookingId);
    if (!booking) {
      res.status(404).json({ success: false, error: "Booking not found." });
      return;
    }

    const isOpsUser = user.role === "sales" || user.role === "super_admin";
    const isProvider = providerScopeMatches(user, booking);
    const isOwner = customerOwnsBooking(user, booking);

    if (!isOpsUser && !isProvider && !isOwner) {
      res.status(403).json({
        success: false,
        error: "You do not have access to update this booking.",
      });
      return;
    }

    const currentStatus = enumValue(booking.status, BOOKING_STATUSES) as BookingStatus | null;
    if (!currentStatus) {
      res.status(500).json({ success: false, error: "Stored booking status is invalid." });
      return;
    }

    if (!isOpsUser && TERMINAL_BOOKING_STATUSES.has(currentStatus)) {
      res.status(409).json({
        success: false,
        error: "A completed/cancelled/rejected booking can no longer be edited.",
      });
      return;
    }

    const body = bodyOf(req);
    const updates: string[] = [];
    const values: unknown[] = [];
    const has = (key: string): boolean => Object.prototype.hasOwnProperty.call(body, key);

    if (has("date") || has("requestedDate") || has("preferredDate")) {
      updates.push("date = ?");
      values.push(
        nullableText(
          body.date ?? body.requestedDate ?? body.preferredDate,
          80,
        ),
      );
    }

    if (has("time") || has("preferredTime")) {
      updates.push("time = ?");
      values.push(nullableText(body.time ?? body.preferredTime, 80));
    }

    if (has("detail") || has("details") || has("message")) {
      const value = body.detail ?? body.details ?? body.message;
      updates.push("detail = ?");
      values.push(typeof value === "object" ? jsonText(value) : nullableText(value, 20_000));
    }

    if (has("title")) {
      const title = text(body.title, 250);
      if (!title) {
        res.status(400).json({ success: false, error: "Booking title cannot be empty." });
        return;
      }
      updates.push("title = ?");
      values.push(title);
    }

    if (has("amount")) {
      if (!isOpsUser) {
        res.status(403).json({
          success: false,
          error: "Only Sales or Super Admin can change booking amount.",
        });
        return;
      }
      const amount = nonNegativeInteger(body.amount, null, 1_000_000_000);
      if (amount === null) {
        res.status(400).json({ success: false, error: "Invalid booking amount." });
        return;
      }
      updates.push("amount = ?");
      values.push(amount);
    }

    if (has("currency")) {
      if (!isOpsUser) {
        res.status(403).json({
          success: false,
          error: "Only Sales or Super Admin can change booking currency.",
        });
        return;
      }
      const currency = text(body.currency, 10).toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) {
        res.status(400).json({ success: false, error: "Invalid currency." });
        return;
      }
      updates.push("currency = ?");
      values.push(currency);
    }

    const protectedFields = [
      "userId",
      "leadId",
      "panditId",
      "templeId",
      "ashramId",
      "pujaId",
      "packageId",
      "courseId",
      "eventId",
      "kind",
      "paymentStatus",
      "status",
    ];

    for (const forbidden of protectedFields) {
      if (has(forbidden)) {
        res.status(400).json({
          success: false,
          error: `${forbidden} must be changed through its dedicated booking workflow.`,
        });
        return;
      }
    }

    if (!updates.length) {
      res.status(400).json({
        success: false,
        error: "No supported booking fields were supplied.",
      });
      return;
    }

    values.push(bookingId);
    db.prepare(
      `
      UPDATE bookings
      SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
    ).run(...values);

    const updated = getBookingRaw(bookingId);
    audit(req, "booking.updated", "booking", bookingId, booking, updated);

    res.json({
      success: true,
      booking: updated ? serializeBooking(updated, true, user) : null,
      updatedFields: updates
        .map((item) => item.split(" =")[0])
        .filter(Boolean),
    });
  } catch (error) {
    console.error("Booking update error:", error);
    res.status(500).json({ success: false, error: "Unable to update booking." });
  }
});

/* -------------------------------------------------------------------------- */
/* POST /:id/assign                                                          */
/* -------------------------------------------------------------------------- */

router.post(
  "/:id/assign",
  requireAuth,
  requireRole("sales", "super_admin"),
  (req: Request, res: Response) => {
    try {
      const user = currentUserRequired(res);
      const bookingId = positiveId(req.params.id);
      if (!bookingId) {
        res.status(400).json({ success: false, error: "Invalid booking id." });
        return;
      }

      const booking = getBookingRaw(bookingId);
      if (!booking) {
        res.status(404).json({ success: false, error: "Booking not found." });
        return;
      }

      const kind = enumValue(booking.kind, BOOKING_KINDS) as BookingKind | null;
      if (!kind || kind === "other") {
        res.status(400).json({
          success: false,
          error: "This booking kind does not support provider reassignment.",
        });
        return;
      }

      const body = bodyOf(req);
      const targetMap: Record<Exclude<BookingKind, "other">, { field: string; column: string; value: number | null }> = {
        pandit: {
          field: "panditId",
          column: "pandit_id",
          value: positiveId(body.panditId),
        },
        puja: {
          field: "pujaId",
          column: "puja_id",
          value: positiveId(body.pujaId ?? body.pujaServiceId),
        },
        temple: {
          field: "templeId",
          column: "temple_id",
          value: positiveId(body.templeId),
        },
        ashram: {
          field: "ashramId",
          column: "ashram_id",
          value: positiveId(body.ashramId),
        },
        yatra: {
          field: "packageId",
          column: "package_id",
          value: positiveId(body.packageId ?? body.yatraPackageId),
        },
        course: {
          field: "courseId",
          column: "course_id",
          value: positiveId(body.courseId),
        },
        event: {
          field: "eventId",
          column: "event_id",
          value: positiveId(body.eventId),
        },
      };

      const target = targetMap[kind];
      if (!target.value) {
        res.status(400).json({
          success: false,
          error: `Provide ${target.field} to reassign this ${kind} booking.`,
        });
        return;
      }

      const validationBody: Row = { [target.field]: target.value };
      ensurePublishedEntity(kind, validationBody);

      db.transaction(() => {
        db.prepare(
          `UPDATE bookings SET ${target.column} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        ).run(target.value, bookingId);

        const leadId = positiveId(booking.lead_id);
        if (leadId && tableExists("lead_events")) {
          db.prepare(
            `
            INSERT INTO lead_events (
              lead_id,
              user_id,
              event_type,
              notes,
              metadata_json
            ) VALUES (?, ?, 'booking_assigned', ?, ?)
            `,
          ).run(
            leadId,
            user.id,
            `Booking ${text(booking.booking_number, 120)} reassigned by ${user.name}.`,
            jsonText({
              bookingId,
              bookingKind: kind,
              assignmentField: target.field,
              assignmentEntityId: target.value,
            }),
          );
        }
      })();

      const updated = getBookingRaw(bookingId);
      audit(req, "booking.assigned", "booking", bookingId, booking, updated);

      if (updated) {
        for (const providerUserId of providerUserIds(updated)) {
          notifyUser(
            providerUserId,
            "booking",
            "Booking assigned to you",
            `${bookingEntityLabel(updated)} is now assigned to your service/entity.`,
            `/bookings/${bookingId}`,
            { bookingId, bookingKind: kind },
          );
        }
      }

      res.json({
        success: true,
        booking: updated ? serializeBooking(updated, true, user) : null,
        assignment: {
          kind,
          field: target.field,
          entityId: target.value,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (
        message.includes("currently bookable") ||
        message.includes("requires panditId")
      ) {
        res.status(400).json({ success: false, error: message });
        return;
      }
      console.error("Booking assignment error:", error);
      res.status(500).json({ success: false, error: "Unable to assign booking." });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* GET /:id/payments                                                         */
/* -------------------------------------------------------------------------- */

router.get("/:id/payments", requireAuth, (req: Request, res: Response) => {
  try {
    const user = currentUserRequired(res);
    const bookingId = positiveId(req.params.id);
    if (!bookingId) {
      res.status(400).json({ success: false, error: "Invalid booking id." });
      return;
    }

    const booking = getBookingRaw(bookingId);
    if (!booking) {
      res.status(404).json({ success: false, error: "Booking not found." });
      return;
    }

    if (!canViewBooking(user, booking)) {
      res.status(403).json({
        success: false,
        error: "You do not have access to this booking.",
      });
      return;
    }

    const summary = paymentSummary(bookingId);

    res.json({
      success: true,
      bookingId,
      paymentStatus: summary.effectiveStatus,
      paidAmount: summary.paidAmount,
      refundedAmount: summary.refundedAmount,
      outstandingAmount: summary.outstandingAmount,
      payments: summary.payments.map((item) => safePaymentForUser(item, user)),
      paymentOrders: summary.paymentOrders.map((item) =>
        safePaymentOrderForUser(item, user),
      ),
    });
  } catch (error) {
    console.error("Booking payments error:", error);
    res.status(500).json({
      success: false,
      error: "Unable to load booking payments.",
    });
  }
});

/* -------------------------------------------------------------------------- */
/* POST /:id/payment-sync                                                    */
/* -------------------------------------------------------------------------- */

router.post(
  "/:id/payment-sync",
  requireAuth,
  requireRole("sales", "super_admin"),
  (req: Request, res: Response) => {
    try {
      const bookingId = positiveId(req.params.id);
      if (!bookingId) {
        res.status(400).json({ success: false, error: "Invalid booking id." });
        return;
      }

      const booking = getBookingRaw(bookingId);
      if (!booking) {
        res.status(404).json({ success: false, error: "Booking not found." });
        return;
      }

      const summary = paymentSummary(bookingId);

      db.prepare(
        `
        UPDATE bookings
        SET payment_status = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
        `,
      ).run(summary.effectiveStatus, bookingId);

      const updated = getBookingRaw(bookingId);

      audit(req, "booking.payment_status_synced", "booking", bookingId, booking, {
        paymentStatus: summary.effectiveStatus,
        paidAmount: summary.paidAmount,
        refundedAmount: summary.refundedAmount,
      });

      res.json({
        success: true,
        booking: updated ? serializeBooking(updated, true, currentUserRequired(res)) : null,
        paymentStatus: summary.effectiveStatus,
      });
    } catch (error) {
      console.error("Booking payment sync error:", error);
      res.status(500).json({
        success: false,
        error: "Unable to synchronize booking payment status.",
      });
    }
  },
);

/* -------------------------------------------------------------------------- */
/* DELETE intentionally absent                                                */
/* -------------------------------------------------------------------------- */

export {
  router as bookingRouter,
  router as bookingRoutes,
};

export default router;
