/* eslint-disable @typescript-eslint/no-unused-vars */
import { randomBytes, scrypt } from "node:crypto";
import { Router, type Request, type Response } from "express";

import { db } from "../db/database.ts";
import { requireAuth, requireRole } from "./auth.ts";

/*
|--------------------------------------------------------------------------
| DivyaDhara — Super Admin API
|--------------------------------------------------------------------------
|
| Canonical v4 control plane for the Super Admin dashboard.
|
| Supported system roles (managed here):
|   visitor, pandit, temple_manager, ashram_manager, sales, super_admin
|
| Public registration is NOT controlled by this router. The canonical policy
| is enforced by auth.ts + settings/roles in the database:
|   visitor, pandit, temple_manager, ashram_manager = public
|   sales, super_admin = internal-only
|
| This router is deliberately Super-Admin-only. Domain-specific non-admin
| workflows stay in their own route modules.
|
| Commercial architecture:
|   subscription_plans               = catalogue / entitlements
|   subscription_plan_prices         = billing-period price variants
|   *_subscriptions                  = active/history ledger per audience
|   payment_orders / payments / links = payment ledger
|   subscription_events              = subscription audit trail
|--------------------------------------------------------------------------
*/

const router = Router();
router.use(requireAuth, requireRole("super_admin"));

type JsonRecord = Record<string, unknown>;
type SqlRow = Record<string, unknown>;

type ListParams = { limit: number; offset: number };

type Audience = "pandit" | "temple" | "ashram";
type ManagerRole = "temple_manager" | "ashram_manager";
type SubscriptionStatus =
  | "pending"
  | "active"
  | "expired"
  | "cancelled"
  | "paused"
  | "payment_failed";

const AUDIENCES: readonly Audience[] = ["pandit", "temple", "ashram"];
const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  "pending",
  "active",
  "expired",
  "cancelled",
  "paused",
  "payment_failed",
];
const SEO_PAGE_TYPES = [
  "home", "listing", "detail", "pandit", "puja", "temple", "event",
  "gallery", "video", "ashram", "course", "package", "place", "custom",
] as const;
const PLAN_NAMES = ["Basic", "Premium"] as const;
const BILLING_INTERVALS = ["monthly", "quarterly", "yearly", "custom"] as const;

function normalizeText(value: unknown, max = 500): string {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeNullableText(value: unknown, max = 500): string | null {
  const text = normalizeText(value, max);
  return text || null;
}

function asPositiveId(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function normalizeInteger(
  value: unknown,
  fallback = 0,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function normalizeMoney(value: unknown, fallback = 0): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.round(n * 100) / 100;
}

function normalizeBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const lower = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(lower)) return true;
    if (["0", "false", "no", "off"].includes(lower)) return false;
  }
  return fallback;
}

function boolInt(value: unknown, fallback = false): number {
  return normalizeBoolean(value, fallback) ? 1 : 0;
}

function parseListParams(req: Request): ListParams {
  const limit = normalizeInteger(req.query.limit, 50, 1, 200);
  const offset = normalizeInteger(req.query.offset, 0, 0, 100_000);
  return { limit, offset };
}

function parseJsonArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const decoded = JSON.parse(value);
    return Array.isArray(decoded) ? decoded : [];
  } catch {
    return [];
  }
}

function jsonArray(value: unknown): string {
  return JSON.stringify(parseJsonArray(value));
}

function jsonObject(value: unknown): string {
  if (value && typeof value === "object" && !Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === "string") {
    try {
      const decoded = JSON.parse(value);
      return decoded && typeof decoded === "object" && !Array.isArray(decoded)
        ? JSON.stringify(decoded)
        : "{}";
    } catch {
      return "{}";
    }
  }
  return "{}";
}

function safeTableName(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error("Unsafe SQL identifier.");
  return name;
}

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function tableExists(tableName: string): boolean {
  const table = safeTableName(tableName);
  const row = db.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`,
  ).get(table) as { name?: string } | undefined;
  return Boolean(row?.name);
}

function tableColumns(tableName: string): Set<string> {
  const table = safeTableName(tableName);
  if (!tableExists(table)) return new Set();
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name?: string }>;
  return new Set(rows.map((r) => normalizeText(r.name, 120)).filter(Boolean));
}

function firstExistingColumn(columns: Set<string>, candidates: string[]): string | null {
  return candidates.find((c) => columns.has(c)) ?? null;
}

function getRowById(tableName: string, id: number): SqlRow | undefined {
  const table = safeTableName(tableName);
  if (!tableExists(table)) return undefined;
  return db.prepare(`SELECT * FROM ${table} WHERE id=? LIMIT 1`).get(id) as SqlRow | undefined;
}

function requireTable(res: Response, tableName: string): boolean {
  if (tableExists(tableName)) return true;
  res.status(503).json({
    success: false,
    error: `Required database table "${tableName}" is not available. Apply the current schema/migration first.`,
  });
  return false;
}

function currentUserId(res: Response): number {
  const id = Number((res.locals.user as { id?: unknown } | undefined)?.id ?? 0);
  return Number.isInteger(id) && id > 0 ? id : 0;
}

function normalizeAudience(value: unknown): Audience | null {
  const a = normalizeText(value, 30).toLowerCase() as Audience;
  return AUDIENCES.includes(a) ? a : null;
}

function normalizeSubscriptionStatus(value: unknown): SubscriptionStatus | null {
  const s = normalizeText(value, 40).toLowerCase() as SubscriptionStatus;
  return SUBSCRIPTION_STATUSES.includes(s) ? s : null;
}

function normalizeBillingInterval(value: unknown): string {
  const s = normalizeText(value || "monthly", 20).toLowerCase();
  return BILLING_INTERVALS.includes(s as (typeof BILLING_INTERVALS)[number]) ? s : "monthly";
}

function pathOnly(value: unknown): string {
  const p = normalizeText(value, 2000);
  if (!p) return "/";
  return p.startsWith("/") ? p : `/${p}`;
}

function statusText(value: unknown): string {
  return normalizeText(value, 50).toLowerCase();
}

function audit(
  req: Request,
  actorId: number,
  action: string,
  entityType: string,
  entityId: number | null,
  oldData: JsonRecord | SqlRow | null,
  newData: JsonRecord | SqlRow | null,
): void {
  if (!tableExists("audit_logs")) return;
  try {
    db.prepare(`
      INSERT INTO audit_logs (
        user_id, visitor_id, session_id, request_id, actor_type,
        action, entity_type, entity_id, old_data_json, new_data_json,
        ip_address, user_agent, created_at
      ) VALUES (?, ?, ?, ?, 'super_admin', ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).run(
      actorId || null,
      null,
      null,
      normalizeNullableText(req.get("x-request-id"), 200),
      normalizeText(action, 150),
      normalizeText(entityType, 100),
      entityId,
      oldData ? JSON.stringify(oldData) : null,
      newData ? JSON.stringify(newData) : null,
      req.ip || null,
      normalizeNullableText(req.get("user-agent"), 1000),
    );
  } catch (error) {
    console.error("Admin audit log error:", error);
  }
}

function maskSecret(value: unknown): string | null {
  const text = normalizeText(value, 300);
  if (!text) return null;
  if (text.length <= 8) return "••••••••";
  return `${text.slice(0, 4)}••••${text.slice(-4)}`;
}

/* -------------------------------------------------------------------------
 * Dashboard
 * ---------------------------------------------------------------------- */

router.get("/dashboard", (_req, res) => {
  try {
    const scalar = (sql: string, ...params: unknown[]): number => {
      const row = db.prepare(sql).get(...params) as { value?: unknown } | undefined;
      return Number(row?.value ?? 0) || 0;
    };

    const stats = {
      users: tableExists("users") ? scalar("SELECT COUNT(*) value FROM users") : 0,
      activeUsers: tableExists("users") ? scalar("SELECT COUNT(*) value FROM users WHERE status='active'") : 0,
      pendingUsers: tableExists("users") ? scalar("SELECT COUNT(*) value FROM users WHERE status='pending'") : 0,
      blockedUsers: tableExists("users") ? scalar("SELECT COUNT(*) value FROM users WHERE status='blocked'") : 0,
      visitors: tableExists("web_visitors") ? scalar("SELECT COUNT(*) value FROM web_visitors WHERE is_bot=0") : 0,
      sessions: tableExists("web_sessions") ? scalar("SELECT COUNT(*) value FROM web_sessions WHERE is_bot=0") : 0,
      pageViews: tableExists("web_page_views") ? scalar("SELECT COUNT(*) value FROM web_page_views WHERE is_bot=0") : 0,
      microEvents: tableExists("web_events") ? scalar("SELECT COUNT(*) value FROM web_events") : 0,
      conversions: tableExists("web_conversions") ? scalar("SELECT COUNT(*) value FROM web_conversions") : 0,
      formSubmissions: tableExists("form_submissions") ? scalar("SELECT COUNT(*) value FROM form_submissions") : 0,
      pandits: tableExists("pandit_profiles") ? scalar("SELECT COUNT(*) value FROM pandit_profiles") : 0,
      pendingPandits: tableExists("pandit_profiles") ? scalar("SELECT COUNT(*) value FROM pandit_profiles WHERE profile_status='pending' OR verification_status='pending'") : 0,
      templeManagers: tableExists("temple_manager_profiles") ? scalar("SELECT COUNT(*) value FROM temple_manager_profiles") : 0,
      pendingTempleManagers: tableExists("temple_manager_profiles") && tableExists("users") ? scalar(`
        SELECT COUNT(*) value FROM temple_manager_profiles tmp
        JOIN users u ON u.id=tmp.user_id
        JOIN roles r ON r.id=u.role_id
        WHERE r.code='temple_manager' AND (u.status='pending' OR tmp.verification_status='pending')
      `) : 0,
      ashramManagers: tableExists("ashram_manager_profiles") ? scalar("SELECT COUNT(*) value FROM ashram_manager_profiles") : 0,
      pendingAshramManagers: tableExists("ashram_manager_profiles") && tableExists("users") ? scalar(`
        SELECT COUNT(*) value FROM ashram_manager_profiles amp
        JOIN users u ON u.id=amp.user_id
        JOIN roles r ON r.id=u.role_id
        WHERE r.code='ashram_manager' AND (u.status='pending' OR amp.verification_status='pending')
      `) : 0,
      temples: tableExists("temples") ? scalar("SELECT COUNT(*) value FROM temples") : 0,
      publishedTemples: tableExists("temples") ? scalar("SELECT COUNT(*) value FROM temples WHERE status='published'") : 0,
      ashrams: tableExists("ashrams") ? scalar("SELECT COUNT(*) value FROM ashrams") : 0,
      publishedAshrams: tableExists("ashrams") ? scalar("SELECT COUNT(*) value FROM ashrams WHERE status='published'") : 0,
      leads: tableExists("leads") ? scalar("SELECT COUNT(*) value FROM leads") : 0,
      openLeads: tableExists("leads") ? scalar("SELECT COUNT(*) value FROM leads WHERE status IN ('new','qualified','assigned','contacted','follow_up')") : 0,
      convertedLeads: tableExists("leads") ? scalar("SELECT COUNT(*) value FROM leads WHERE status='converted'") : 0,
      plans: tableExists("subscription_plans") ? scalar("SELECT COUNT(*) value FROM subscription_plans") : 0,
      planPrices: tableExists("subscription_plan_prices") ? scalar("SELECT COUNT(*) value FROM subscription_plan_prices") : 0,
      activeSubscriptions:
        (tableExists("pandit_subscriptions") ? scalar("SELECT COUNT(*) value FROM pandit_subscriptions WHERE status='active'") : 0) +
        (tableExists("temple_subscriptions") ? scalar("SELECT COUNT(*) value FROM temple_subscriptions WHERE status='active'") : 0) +
        (tableExists("ashram_subscriptions") ? scalar("SELECT COUNT(*) value FROM ashram_subscriptions WHERE status='active'") : 0),
      revenue: tableExists("payments") ? scalar("SELECT COALESCE(SUM(amount),0) value FROM payments WHERE status IN ('paid','captured')") : 0,
      seoEntries: tableExists("seo_entries") ? scalar("SELECT COUNT(*) value FROM seo_entries") : 0,
      seoLocationPages: tableExists("seo_location_pages") ? scalar("SELECT COUNT(*) value FROM seo_location_pages") : 0,
      auditLogs: tableExists("audit_logs") ? scalar("SELECT COUNT(*) value FROM audit_logs") : 0,
    };

    const roleCounts: Record<string, number> = {};
    if (tableExists("users") && tableExists("roles")) {
      for (const row of db.prepare(`
        SELECT r.code role, COUNT(u.id) count
        FROM roles r LEFT JOIN users u ON u.role_id=r.id
        GROUP BY r.id,r.code ORDER BY r.id
      `).all() as Array<{ role?: string; count?: unknown }>) {
        if (row.role) roleCounts[row.role] = Number(row.count ?? 0);
      }
    }

    const approvalQueue = {
      pendingPandits: tableExists("pandit_profiles") && tableExists("users") ? db.prepare(`
        SELECT p.id,p.user_id,p.slug,p.display_name,p.title,p.city,p.district,p.state,
               p.profile_status,p.verification_status,p.featured,p.listing_active,p.rejection_reason,
               u.name account_name,u.email,u.phone,u.status account_status
        FROM pandit_profiles p JOIN users u ON u.id=p.user_id
        WHERE p.profile_status='pending' OR p.verification_status='pending'
        ORDER BY p.id DESC LIMIT 25
      `).all() as SqlRow[] : [],
      pendingTempleManagers: tableExists("temple_manager_profiles") && tableExists("users") ? db.prepare(`
        SELECT tmp.id manager_id,tmp.user_id,tmp.designation,tmp.organization_name,tmp.verification_status,
               u.name,u.email,u.phone,u.city,u.state,u.status
        FROM temple_manager_profiles tmp JOIN users u ON u.id=tmp.user_id JOIN roles r ON r.id=u.role_id
        WHERE r.code='temple_manager' AND (u.status='pending' OR tmp.verification_status='pending')
        ORDER BY tmp.id DESC LIMIT 25
      `).all() as SqlRow[] : [],
      pendingAshramManagers: tableExists("ashram_manager_profiles") && tableExists("users") ? db.prepare(`
        SELECT amp.id manager_id,amp.user_id,amp.designation,amp.organization_name,amp.verification_status,
               u.name,u.email,u.phone,u.city,u.state,u.status
        FROM ashram_manager_profiles amp JOIN users u ON u.id=amp.user_id JOIN roles r ON r.id=u.role_id
        WHERE r.code='ashram_manager' AND (u.status='pending' OR amp.verification_status='pending')
        ORDER BY amp.id DESC LIMIT 25
      `).all() as SqlRow[] : [],
    };

    const topPages = tableExists("web_page_views") ? db.prepare(`
      SELECT path,COUNT(*) views,COUNT(DISTINCT visitor_id) unique_visitors,
             ROUND(AVG(duration_seconds),2) avg_duration_seconds,MAX(entered_at) last_viewed_at
      FROM web_page_views WHERE is_bot=0 GROUP BY path ORDER BY views DESC LIMIT 20
    `).all() as SqlRow[] : [];

    const topLocations = tableExists("web_page_views") ? db.prepare(`
      SELECT COALESCE(country,'') country,COALESCE(state,'') state,COALESCE(district,'') district,
             COALESCE(city,'') city,COUNT(*) page_views,COUNT(DISTINCT visitor_id) unique_visitors
      FROM web_page_views WHERE is_bot=0
      GROUP BY country,state,district,city ORDER BY unique_visitors DESC LIMIT 20
    `).all() as SqlRow[] : [];

    const recentActivity = tableExists("audit_logs") ? db.prepare(`
      SELECT id,user_id,visitor_id,session_id,request_id,actor_type,action,entity_type,entity_id,
             old_data_json,new_data_json,ip_address,user_agent,created_at
      FROM audit_logs ORDER BY id DESC LIMIT 25
    `).all() as SqlRow[] : [];

    res.json({
      success: true,
      stats,
      roleCounts,
      approvalQueue,
      topPages,
      topLocations,
      recentActivity,
      premium: {
        razorpay: {
          configured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
          mode: normalizeText(process.env.RAZORPAY_MODE || "test", 20).toLowerCase() === "live" ? "live" : "test",
          currency: normalizeText(process.env.RAZORPAY_CURRENCY || "INR", 10).toUpperCase(),
        },
        subscriptionPlans: tableExists("subscription_plans"),
        subscriptionPlanPrices: tableExists("subscription_plan_prices"),
        panditSubscriptions: tableExists("pandit_subscriptions"),
        templeSubscriptions: tableExists("temple_subscriptions"),
        ashramSubscriptions: tableExists("ashram_subscriptions"),
        paymentOrders: tableExists("payment_orders"),
        payments: tableExists("payments"),
        paymentLinks: tableExists("payment_links"),
      },
    });
  } catch (error) {
    console.error("Admin dashboard error:", error);
    res.status(500).json({ success: false, error: "Unable to load the admin dashboard." });
  }
});

/* -------------------------------------------------------------------------
 * Users / RBAC visibility
 * ---------------------------------------------------------------------- */

router.get("/users", (req, res) => {
  try {
    if (!requireTable(res, "users") || !requireTable(res, "roles")) return;
    const { limit, offset } = parseListParams(req);
    const search = normalizeText(req.query.search, 200);
    const role = normalizeText(req.query.role, 50).toLowerCase();
    const status = normalizeText(req.query.status, 50).toLowerCase();
    const where: string[] = ["1=1"];
    const params: unknown[] = [];
    if (search) {
      where.push("(u.name LIKE ? OR u.email LIKE ? OR COALESCE(u.phone,'') LIKE ?)");
      const p = `%${search}%`; params.push(p,p,p);
    }
    if (role) { where.push("r.code=?"); params.push(role); }
    if (status) { where.push("LOWER(u.status)=?"); params.push(status); }
    const rows = db.prepare(`
      SELECT u.id,u.name,u.email,u.phone,u.city,u.state,u.country,u.status,u.avatar,
             u.email_verified_at,u.phone_verified_at,u.last_login_at,u.created_at,u.updated_at,r.code role
      FROM users u JOIN roles r ON r.id=u.role_id
      WHERE ${where.join(" AND ")}
      ORDER BY u.id DESC LIMIT ? OFFSET ?
    `).all(...params,limit,offset) as SqlRow[];
    const total = Number((db.prepare(`
      SELECT COUNT(*) value FROM users u JOIN roles r ON r.id=u.role_id WHERE ${where.join(" AND ")}
    `).get(...params) as {value?:unknown}|undefined)?.value ?? 0);
    res.json({success:true,users:rows,pagination:{limit,offset,total,totalPages:Math.ceil(total/limit)}});
  } catch(error){ console.error("Admin users error:",error); res.status(500).json({success:false,error:"Unable to load users."}); }
});

router.patch("/users/:id/status", (req,res) => {
  try {
    if (!requireTable(res,"users")) return;
    const id=asPositiveId(req.params.id); const status=statusText(req.body?.status);
    if(!id) return void res.status(400).json({success:false,error:"Invalid user id."});
    if(!["active","pending","blocked","suspended","rejected"].includes(status)) return void res.status(400).json({success:false,error:"Invalid user status."});
    const oldRow=getRowById("users",id); if(!oldRow) return void res.status(404).json({success:false,error:"User not found."});
    if(id===currentUserId(res) && status!=="active") return void res.status(400).json({success:false,error:"The current Super Admin cannot deactivate its own account from this endpoint."});
    db.prepare(`UPDATE users SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(status,id);
    const updated=getRowById("users",id)||{}; audit(req,currentUserId(res),"admin.user.status_updated","user",id,oldRow,updated);
    res.json({success:true,user:updated});
  } catch(error){ console.error("Admin user status error:",error); res.status(500).json({success:false,error:"Unable to update user status."}); }
});

/* -------------------------------------------------------------------------
 * User role management (canonical six roles)
 * ---------------------------------------------------------------------- */

router.patch("/users/:id/role", (req,res) => {
  try {
    if (!requireTable(res,"users") || !requireTable(res,"roles")) return;
    const id = asPositiveId(req.params.id);
    const role = normalizeText(req.body?.role,50).toLowerCase();
    const allowedRoles = ["visitor","pandit","temple_manager","ashram_manager","sales","super_admin"];
    if (!id) return void res.status(400).json({success:false,error:"Invalid user id."});
    if (!allowedRoles.includes(role)) return void res.status(400).json({success:false,error:"Invalid system role."});
    if (id === currentUserId(res)) return void res.status(400).json({success:false,error:"The current Super Admin cannot change its own role."});
    const old = db.prepare(`SELECT u.*,r.code role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=? LIMIT 1`).get(id) as SqlRow|undefined;
    if (!old) return void res.status(404).json({success:false,error:"User not found."});
    const target = db.prepare(`SELECT id,code,public_registration_enabled,approval_required,is_active FROM roles WHERE code=? LIMIT 1`).get(role) as SqlRow|undefined;
    if (!target || Number(target.is_active)!==1) return void res.status(409).json({success:false,error:"Target role is not active in the canonical database."});
    db.prepare(`UPDATE users SET role_id=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(target.id,id);
    if (role === "temple_manager" && tableExists("temple_manager_profiles")) db.prepare(`INSERT OR IGNORE INTO temple_manager_profiles (user_id,designation,organization_name,verification_status,created_at,updated_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run(id,null,null,"pending");
    if (role === "ashram_manager" && tableExists("ashram_manager_profiles")) db.prepare(`INSERT OR IGNORE INTO ashram_manager_profiles (user_id,designation,organization_name,verification_status,created_at,updated_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run(id,null,null,"pending");
    if (role === "super_admin") db.prepare(`UPDATE users SET status='active',email_verified_at=COALESCE(email_verified_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
    const updated = getRowById("users",id) || {};
    audit(req,currentUserId(res),"admin.user.role_updated","user",id,old,updated);
    res.json({success:true,user:updated});
  } catch(error) { console.error("Admin user role error:",error); res.status(500).json({success:false,error:"Unable to update user role."}); }
});

/* -------------------------------------------------------------------------
 * Pandits
 * ---------------------------------------------------------------------- */

router.get("/pandits", (req,res) => {
  try {
    if(!requireTable(res,"pandit_profiles")||!requireTable(res,"users")) return;
    const {limit,offset}=parseListParams(req); const search=normalizeText(req.query.search,180); const status=statusText(req.query.status);
    const where:string[]=["1=1"]; const params:unknown[]=[];
    if(search){where.push(`(p.display_name LIKE ? OR p.slug LIKE ? OR COALESCE(p.city,'') LIKE ? OR COALESCE(p.state,'') LIKE ?)`);const x=`%${search}%`;params.push(x,x,x,x)}
    if(status){where.push(`(LOWER(COALESCE(p.profile_status,''))=? OR LOWER(COALESCE(p.verification_status,''))=?)`);params.push(status,status)}
    const rows=db.prepare(`SELECT p.*,u.name account_name,u.email,u.phone,u.status account_status FROM pandit_profiles p JOIN users u ON u.id=p.user_id WHERE ${where.join(" AND ")} ORDER BY p.id DESC LIMIT ? OFFSET ?`).all(...params,limit,offset) as SqlRow[];
    const total=Number((db.prepare(`SELECT COUNT(*) value FROM pandit_profiles p JOIN users u ON u.id=p.user_id WHERE ${where.join(" AND ")}`).get(...params) as {value?:unknown}|undefined)?.value??0);
    res.json({success:true,pandits:rows,pagination:{limit,offset,total,totalPages:Math.ceil(total/limit)}});
  } catch(error){console.error("Admin pandits error:",error);res.status(500).json({success:false,error:"Unable to load Pandits."});}
});

function updatePanditApproval(req:Request,res:Response,target:"approved"|"rejected"):void{
  try{
    if(!requireTable(res,"pandit_profiles")||!requireTable(res,"users"))return;
    const id=asPositiveId(req.params.id);if(!id)return void res.status(400).json({success:false,error:"Invalid Pandit id."});
    const profile=getRowById("pandit_profiles",id);if(!profile)return void res.status(404).json({success:false,error:"Pandit profile not found."});
    const userId=asPositiveId(profile.user_id);if(!userId)return void res.status(409).json({success:false,error:"Pandit profile has no valid user account."});
    const oldUser=getRowById("users",userId);
    db.transaction(()=>{
      if(target==="approved") db.prepare(`UPDATE pandit_profiles SET profile_status='approved',verification_status='verified',profile_verified=1,listing_active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);
      else db.prepare(`UPDATE pandit_profiles SET profile_status='rejected',verification_status='rejected',listing_active=0,rejection_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(normalizeNullableText(req.body?.reason,1000),id);
      db.prepare(`UPDATE users SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(target==="approved"?"active":"rejected",userId);
      if(target==="rejected") db.prepare(`DELETE FROM sessions WHERE user_id=?`).run(userId);
    })();
    const updated=getRowById("pandit_profiles",id)||{};audit(req,currentUserId(res),`admin.pandit.${target}`,"pandit_profile",id,profile,{...updated,user:oldUser});
    res.json({success:true,message:target==="approved"?"Pandit profile approved.":"Pandit profile rejected.",pandit:updated});
  }catch(error){console.error("Admin Pandit approval error:",error);res.status(500).json({success:false,error:"Unable to update Pandit approval."});}
}
router.patch("/pandits/:id/approve",(req,res)=>updatePanditApproval(req,res,"approved"));
router.patch("/pandits/:id/reject",(req,res)=>updatePanditApproval(req,res,"rejected"));
router.patch("/pandits/:id/feature",(req,res)=>{
  try{if(!requireTable(res,"pandit_profiles"))return;const id=asPositiveId(req.params.id);if(!id)return void res.status(400).json({success:false,error:"Invalid Pandit id."});const old=getRowById("pandit_profiles",id);if(!old)return void res.status(404).json({success:false,error:"Pandit profile not found."});db.prepare(`UPDATE pandit_profiles SET featured=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(boolInt(req.body?.featured),id);const updated=getRowById("pandit_profiles",id)||{};audit(req,currentUserId(res),"admin.pandit.featured_updated","pandit_profile",id,old,updated);res.json({success:true,pandit:updated});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to update featured status."});}
});
router.patch("/pandits/:id/listing",(req,res)=>{
  try{if(!requireTable(res,"pandit_profiles"))return;const id=asPositiveId(req.params.id);if(!id)return void res.status(400).json({success:false,error:"Invalid Pandit id."});const old=getRowById("pandit_profiles",id);if(!old)return void res.status(404).json({success:false,error:"Pandit profile not found."});if(statusText(old.profile_status)!=="approved")return void res.status(409).json({success:false,error:"Only an approved Pandit can have an active listing."});const active=boolInt(req.body?.listingActive??req.body?.active);db.prepare(`UPDATE pandit_profiles SET listing_active=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(active,id);const updated=getRowById("pandit_profiles",id)||{};audit(req,currentUserId(res),"admin.pandit.listing_updated","pandit_profile",id,old,updated);res.json({success:true,listingActive:active===1,pandit:updated});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to update Pandit listing."});}
});

/* -------------------------------------------------------------------------
 * Temple / Ashram Manager approval + assignment
 * ---------------------------------------------------------------------- */

function managerConfig(role:ManagerRole){
  if(role==="temple_manager") return {profile:"temple_manager_profiles",assignment:"temple_manager_assignments",entity:"temples",entityId:"temple_id",entityAlias:"t",nameExpr:"COALESCE(t.name,'')",dashboard:"/temple/dashboard"};
  return {profile:"ashram_manager_profiles",assignment:"ashram_manager_assignments",entity:"ashrams",entityId:"ashram_id",entityAlias:"a2",nameExpr:"COALESCE(a2.name,'')",dashboard:"/ashram/dashboard"};
}

function listManagers(role:ManagerRole,req:Request,res:Response):void{
  try{
    const c=managerConfig(role);if(!requireTable(res,c.profile)||!requireTable(res,"users")||!requireTable(res,"roles"))return;
    const {limit,offset}=parseListParams(req);const search=normalizeText(req.query.search,180);const where:string[]=[`r.code='${role}'`];const params:unknown[]=[];
    if(search){where.push(`(u.name LIKE ? OR u.email LIKE ? OR COALESCE(mp.organization_name,'') LIKE ? OR COALESCE(u.city,'') LIKE ? OR COALESCE(u.state,'') LIKE ?)`);const p=`%${search}%`;params.push(p,p,p,p,p)}
    const rows=db.prepare(`SELECT mp.*,u.name user_name,u.email user_email,u.phone user_phone,u.city,u.state,u.country,u.status user_status,r.code role FROM ${c.profile} mp JOIN users u ON u.id=mp.user_id JOIN roles r ON r.id=u.role_id WHERE ${where.join(" AND ")} ORDER BY CASE WHEN u.status='pending' THEN 0 ELSE 1 END,mp.id DESC LIMIT ? OFFSET ?`).all(...params,limit,offset) as SqlRow[];
    const total=Number((db.prepare(`SELECT COUNT(*) value FROM ${c.profile} mp JOIN users u ON u.id=mp.user_id JOIN roles r ON r.id=u.role_id WHERE ${where.join(" AND ")}`).get(...params) as {value?:unknown}|undefined)?.value??0);
    res.json({success:true,managers:rows, [role==="temple_manager"?"templeManagers":"ashramManagers"]:rows,pagination:{limit,offset,total,totalPages:Math.ceil(total/limit)}});
  }catch(error){console.error(`Admin ${role} list error:`,error);res.status(500).json({success:false,error:`Unable to load ${role.replace("_"," ")} accounts.`});}
}
router.get("/temple-managers",(req,res)=>listManagers("temple_manager",req,res));
router.get("/ashram-managers",(req,res)=>listManagers("ashram_manager",req,res));

function updateManagerApproval(role:ManagerRole,req:Request,res:Response,target:"verified"|"rejected"):void{
  try{
    const c=managerConfig(role);if(!requireTable(res,c.profile)||!requireTable(res,"users"))return;
    const id=asPositiveId(req.params.id);if(!id)return void res.status(400).json({success:false,error:"Invalid manager id."});
    const profile=getRowById(c.profile,id);if(!profile)return void res.status(404).json({success:false,error:"Manager profile not found."});
    const userId=asPositiveId(profile.user_id);if(!userId)return void res.status(409).json({success:false,error:"Manager profile is not linked to a valid user account."});
    const oldUser=getRowById("users",userId);const status=target==="verified"?"active":"rejected";
    db.transaction(()=>{
      db.prepare(`UPDATE ${c.profile} SET verification_status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(target,id);
      db.prepare(`UPDATE users SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(status,userId);
      if(target==="rejected" && tableExists(c.assignment)) db.prepare(`UPDATE ${c.assignment} SET status='revoked',revoked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE manager_user_id=? AND status='active'`).run(userId);
      if(target==="rejected") db.prepare(`DELETE FROM sessions WHERE user_id=?`).run(userId);
    })();
    const updated=getRowById(c.profile,id)||{};audit(req,currentUserId(res),`admin.${role}.${target}`,role,id,{profile,user:oldUser},{profile:updated,user:getRowById("users",userId)});
    res.json({success:true,message:target==="verified"?`${role.replace("_"," ")} approved.`:`${role.replace("_"," ")} rejected.`,manager:{...updated,userId,status,verificationStatus:target}});
  }catch(error){console.error(`Admin ${role} approval error:`,error);res.status(500).json({success:false,error:`Unable to update ${role.replace("_"," ")} approval.`});}
}
router.patch("/temple-managers/:id/approve",(req,res)=>updateManagerApproval("temple_manager",req,res,"verified"));
router.patch("/temple-managers/:id/reject",(req,res)=>updateManagerApproval("temple_manager",req,res,"rejected"));
router.patch("/ashram-managers/:id/approve",(req,res)=>updateManagerApproval("ashram_manager",req,res,"verified"));
router.patch("/ashram-managers/:id/reject",(req,res)=>updateManagerApproval("ashram_manager",req,res,"rejected"));

function getAssignments(role:ManagerRole,req:Request,res:Response):void{
  try{const c=managerConfig(role);if(!requireTable(res,c.assignment)||!requireTable(res,c.entity)||!requireTable(res,"users"))return;const {limit,offset}=parseListParams(req);const managerId=asPositiveId(req.query.managerUserId);const entityId=asPositiveId(req.query.entityId??req.query[ c.entityId ]);const status=normalizeText(req.query.status,30).toLowerCase();const where:string[]=["1=1"];const params:unknown[]=[];if(managerId){where.push("a.manager_user_id=?");params.push(managerId)}if(entityId){where.push(`a.${c.entityId}=?`);params.push(entityId)}if(status){where.push("a.status=?");params.push(status)}const rows=db.prepare(`SELECT a.*,u.name manager_name,u.email manager_email,${c.nameExpr} entity_name FROM ${c.assignment} a JOIN users u ON u.id=a.manager_user_id JOIN ${c.entity} ${c.entityAlias} ON ${c.entityAlias}.id=a.${c.entityId} WHERE ${where.join(" AND ")} ORDER BY a.id DESC LIMIT ? OFFSET ?`).all(...params,limit,offset) as SqlRow[];const total=Number((db.prepare(`SELECT COUNT(*) value FROM ${c.assignment} a WHERE ${where.join(" AND ")}`).get(...params) as {value?:unknown}|undefined)?.value??0);res.json({success:true,assignments:rows,pagination:{limit,offset,total,totalPages:Math.ceil(total/limit)}});}catch(error){console.error(`Admin ${role} assignments error:`,error);res.status(500).json({success:false,error:"Unable to load manager assignments."});}
}
router.get("/temple-manager-assignments",(req,res)=>getAssignments("temple_manager",req,res));
router.get("/ashram-manager-assignments",(req,res)=>getAssignments("ashram_manager",req,res));

function createAssignment(role:ManagerRole,req:Request,res:Response):void{
  try{
    const c=managerConfig(role);if(!requireTable(res,c.assignment)||!requireTable(res,"users")||!requireTable(res,c.entity))return;
    const managerUserId=asPositiveId(req.body?.managerUserId);const entityId=asPositiveId(req.body?.entityId??req.body?.[c.entityId]);const status=normalizeText(req.body?.status??"active",30).toLowerCase();
    if(!managerUserId||!entityId)return void res.status(400).json({success:false,error:"managerUserId and entityId are required."});
    if(!["active","inactive","revoked"].includes(status))return void res.status(400).json({success:false,error:"Invalid assignment status."});
    const manager=db.prepare(`SELECT u.id,u.status,r.code role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=? LIMIT 1`).get(managerUserId) as SqlRow|undefined;
    if(!manager||manager.role!==role)return void res.status(400).json({success:false,error:`The selected user must have role ${role}.`});
    if(manager.status!=="active"&&status==="active")return void res.status(409).json({success:false,error:"Only an active manager can receive an active assignment."});
    const entity=getRowById(c.entity,entityId);if(!entity)return void res.status(404).json({success:false,error:`${role==="temple_manager"?"Temple":"Ashram"} not found.`});
    const profile=db.prepare(`SELECT verification_status FROM ${c.profile} WHERE user_id=? LIMIT 1`).get(managerUserId) as {verification_status?:string}|undefined;
    if(status==="active" && profile?.verification_status!=="verified")return void res.status(409).json({success:false,error:"Manager must be verified before an active assignment can be created."});
    const duplicate=db.prepare(`SELECT id,status FROM ${c.assignment} WHERE ${c.entityId}=? AND manager_user_id=? LIMIT 1`).get(entityId,managerUserId) as SqlRow|undefined;
    if(duplicate)return void res.status(409).json({success:false,error:"This manager is already mapped to this entity."});
    const result=db.prepare(`INSERT INTO ${c.assignment} (${c.entityId},manager_user_id,assigned_by,status,assigned_at,created_at,updated_at) VALUES (?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run(entityId,managerUserId,currentUserId(res)||null,status);
    const id=Number(result.lastInsertRowid);const row=getRowById(c.assignment,id)||{};audit(req,currentUserId(res),`admin.${role}.assignment_created`,c.assignment,id,null,row);res.status(201).json({success:true,assignment:row});
  }catch(error){console.error(`Admin ${role} create assignment error:`,error);const msg=error instanceof Error?error.message:String(error);res.status(/UNIQUE constraint failed/i.test(msg)?409:500).json({success:false,error:/UNIQUE constraint failed/i.test(msg)?"This manager/entity assignment already exists.":"Unable to create manager assignment."});}
}
router.post("/temple-manager-assignments",(req,res)=>createAssignment("temple_manager",req,res));
router.post("/ashram-manager-assignments",(req,res)=>createAssignment("ashram_manager",req,res));

function updateAssignmentStatus(role:ManagerRole,req:Request,res:Response,target:"active"|"inactive"|"revoked"):void{
  try{const c=managerConfig(role);if(!requireTable(res,c.assignment))return;const id=asPositiveId(req.params.id);if(!id)return void res.status(400).json({success:false,error:"Invalid assignment id."});const old=getRowById(c.assignment,id);if(!old)return void res.status(404).json({success:false,error:"Assignment not found."});if(target==="active"&&tableExists("users")){const u=db.prepare(`SELECT u.status,r.code role FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=?`).get(old.manager_user_id) as SqlRow|undefined;if(!u||u.role!==role||u.status!=="active")return void res.status(409).json({success:false,error:"Manager must be an active account."});const p=db.prepare(`SELECT verification_status FROM ${c.profile} WHERE user_id=? LIMIT 1`).get(old.manager_user_id) as {verification_status?:string}|undefined;if(p?.verification_status!=="verified")return void res.status(409).json({success:false,error:"Manager must be verified before activation."});}db.prepare(`UPDATE ${c.assignment} SET status=?,revoked_at=CASE WHEN ?='revoked' THEN CURRENT_TIMESTAMP ELSE revoked_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(target,target,id);const updated=getRowById(c.assignment,id)||{};audit(req,currentUserId(res),`admin.${role}.assignment_${target}`,c.assignment,id,old,updated);res.json({success:true,assignment:updated});}catch(error){console.error(`Admin ${role} assignment status error:`,error);res.status(500).json({success:false,error:"Unable to update manager assignment."});}
}
router.patch("/temple-manager-assignments/:id/status",(req,res)=>{const s=normalizeText(req.body?.status,30).toLowerCase();if(!["active","inactive","revoked"].includes(s))return void res.status(400).json({success:false,error:"Invalid assignment status."});updateAssignmentStatus("temple_manager",req,res,s as "active"|"inactive"|"revoked")});
router.patch("/ashram-manager-assignments/:id/status",(req,res)=>{const s=normalizeText(req.body?.status,30).toLowerCase();if(!["active","inactive","revoked"].includes(s))return void res.status(400).json({success:false,error:"Invalid assignment status."});updateAssignmentStatus("ashram_manager",req,res,s as "active"|"inactive"|"revoked")});

/* -------------------------------------------------------------------------
 * Temple / Ashram catalogue
 * ---------------------------------------------------------------------- */

router.get("/temples",(req,res)=>{
  try{if(!requireTable(res,"temples"))return;const {limit,offset}=parseListParams(req);const search=normalizeText(req.query.search,160);const status=statusText(req.query.status);const where:string[]=["1=1"];const params:unknown[]=[];if(search){where.push("(name LIKE ? OR slug LIKE ? OR COALESCE(city,'') LIKE ? OR COALESCE(state,'') LIKE ?)");const p=`%${search}%`;params.push(p,p,p,p)}if(status) {where.push("LOWER(status)=?");params.push(status)}const rows=db.prepare(`SELECT * FROM temples WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params,limit,offset) as SqlRow[];const total=Number((db.prepare(`SELECT COUNT(*) value FROM temples WHERE ${where.join(" AND ")}`).get(...params) as {value?:unknown}|undefined)?.value??0);res.json({success:true,temples:rows.map(r=>({...r,templeId:r.id,isActive:statusText(r.status)==="published",featured:normalizeBoolean(r.featured)})),pagination:{limit,offset,total,totalPages:Math.ceil(total/limit)}});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load temples."});}
});

function updateCatalogueStatus(table:"temples"|"ashrams",req:Request,res:Response){
  try{if(!requireTable(res,table))return;const id=asPositiveId(req.params.id);if(!id)return void res.status(400).json({success:false,error:`Invalid ${table==="temples"?"temple":"ashram"} id.`});const old=getRowById(table,id);if(!old)return void res.status(404).json({success:false,error:`${table==="temples"?"Temple":"Ashram"} not found.`});const columns=tableColumns(table);const updates:string[]=[];const values:unknown[]=[];if(Object.prototype.hasOwnProperty.call(req.body||{},"status")){const status=statusText(req.body.status);if(!["draft","published","unpublished","pending","rejected","active","inactive"].includes(status))return void res.status(400).json({success:false,error:"Invalid catalogue status."});if(columns.has("status")){updates.push("status=?");values.push(status)}}if(Object.prototype.hasOwnProperty.call(req.body||{},"featured")&&columns.has("featured")){updates.push("featured=?");values.push(boolInt(req.body.featured))}if(table==="ashrams"&&Object.prototype.hasOwnProperty.call(req.body||{},"listingActive")&&columns.has("listing_active")){updates.push("listing_active=?");values.push(boolInt(req.body.listingActive))}if(!updates.length)return void res.status(400).json({success:false,error:"No supported status fields were supplied."});updates.push("updated_at=CURRENT_TIMESTAMP");values.push(id);db.prepare(`UPDATE ${table} SET ${updates.join(",")} WHERE id=?`).run(...values);const updated=getRowById(table,id)||{};audit(req,currentUserId(res),`admin.${table}.status_updated`,table.slice(0,-1),id,old,updated);res.json({success:true, [table==="temples"?"temple":"ashram"]:updated});}catch(error){console.error(`Admin ${table} status error:`,error);res.status(500).json({success:false,error:`Unable to update ${table===`temples`?"Temple":"Ashram"}.`});}
}
router.patch("/temples/:id/status",(req,res)=>updateCatalogueStatus("temples",req,res));
router.get("/ashrams",(req,res)=>{
  try{if(!requireTable(res,"ashrams"))return;const {limit,offset}=parseListParams(req);const search=normalizeText(req.query.search,160);const status=statusText(req.query.status);const where:string[]=["1=1"];const params:unknown[]=[];if(search){where.push("(name LIKE ? OR slug LIKE ? OR COALESCE(city,'') LIKE ? OR COALESCE(state,'') LIKE ?)");const p=`%${search}%`;params.push(p,p,p,p)}if(status){where.push("LOWER(status)=?");params.push(status)}const rows=db.prepare(`SELECT * FROM ashrams WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params,limit,offset) as SqlRow[];const total=Number((db.prepare(`SELECT COUNT(*) value FROM ashrams WHERE ${where.join(" AND ")}`).get(...params) as {value?:unknown}|undefined)?.value??0);res.json({success:true,ashrams:rows,pagination:{limit,offset,total,totalPages:Math.ceil(total/limit)}});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load Ashrams."});}
});
router.patch("/ashrams/:id/status",(req,res)=>updateCatalogueStatus("ashrams",req,res));

/* -------------------------------------------------------------------------
 * Sales team (internal only)
 * ---------------------------------------------------------------------- */

router.get("/sales",(req,res)=>{
  try{if(!requireTable(res,"users")||!requireTable(res,"roles"))return;const {limit,offset}=parseListParams(req);const rows=db.prepare(`SELECT u.id,u.name,u.email,u.phone,u.city,u.state,u.country,u.status,u.created_at,u.last_login_at,r.code role FROM users u JOIN roles r ON r.id=u.role_id WHERE r.code='sales' ORDER BY u.id DESC LIMIT ? OFFSET ?`).all(limit,offset) as SqlRow[];const total=Number((db.prepare(`SELECT COUNT(*) value FROM users u JOIN roles r ON r.id=u.role_id WHERE r.code='sales'`).get() as {value?:unknown}|undefined)?.value??0);res.json({success:true,sales:rows,pagination:{limit,offset,total,totalPages:Math.ceil(total/limit)}});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load Sales Team."});}
});

async function hashPassword(password:string):Promise<string>{const salt=randomBytes(16);const key=await new Promise<Buffer>((resolve,reject)=>scrypt(password,salt,64,{N:16_384,r:8,p:1,maxmem:32*1024*1024},(error,derived)=>{if(error)return reject(error);if(!Buffer.isBuffer(derived))return reject(new Error("Password derivation failed."));resolve(derived)}));return `${salt.toString("hex")}:${key.toString("hex")}`;}

router.post("/sales",async(req,res)=>{
  try{if(!requireTable(res,"users")||!requireTable(res,"roles"))return;const name=normalizeText(req.body?.name,150);const email=normalizeText(req.body?.email,255).toLowerCase();const phone=normalizeNullableText(req.body?.phone,30);const city=normalizeNullableText(req.body?.city,120);const state=normalizeNullableText(req.body?.state,120);const country=normalizeNullableText(req.body?.country,100)||"India";const password=req.body?.password;if(name.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||typeof password!=="string"||password.length<8||password.length>128)return void res.status(400).json({success:false,error:"Valid name, email and password (8-128 characters) are required."});const existing=db.prepare(`SELECT id FROM users WHERE LOWER(email)=LOWER(?) LIMIT 1`).get(email);if(existing)return void res.status(409).json({success:false,error:"An account with this email already exists."});const role=db.prepare(`SELECT id FROM roles WHERE code='sales' AND is_active=1 LIMIT 1`).get() as {id?:number}|undefined;if(!role?.id)return void res.status(409).json({success:false,error:'The "sales" role is not configured.'});const hash=await hashPassword(password);const result=db.prepare(`INSERT INTO users (role_id,name,email,phone,password_hash,email_verified_at,status,city,state,country,created_at,updated_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP,'active',?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run(role.id,name,email,phone,hash,city,state,country);const id=Number(result.lastInsertRowid);const row=getRowById("users",id)||{};audit(req,currentUserId(res),"admin.sales.created","user",id,null,{...row,password_hash:"[redacted]"});res.status(201).json({success:true,sales:{...row,password_hash:undefined}});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to create Sales account."});}
});

router.patch("/sales/:id/status",(req,res)=>{
  try{if(!requireTable(res,"users")||!requireTable(res,"roles"))return;const id=asPositiveId(req.params.id);const status=statusText(req.body?.status);if(!id)return void res.status(400).json({success:false,error:"Invalid Sales id."});if(!["active","blocked","suspended","rejected"].includes(status))return void res.status(400).json({success:false,error:"Invalid Sales status."});const old=db.prepare(`SELECT u.* FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=? AND r.code='sales'`).get(id) as SqlRow|undefined;if(!old)return void res.status(404).json({success:false,error:"Sales account not found."});db.prepare(`UPDATE users SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(status,id);if(status!=="active")db.prepare(`DELETE FROM sessions WHERE user_id=?`).run(id);const updated=getRowById("users",id)||{};audit(req,currentUserId(res),"admin.sales.status_updated","user",id,old,updated);res.json({success:true,sales:updated});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to update Sales status."});}
});

/* -------------------------------------------------------------------------
 * Subscription plans + billing variants
 * ---------------------------------------------------------------------- */

function serializePlan(row:SqlRow):JsonRecord{
  return {...row,id:Number(row.id??0),priceAmount:Number(row.price_amount??0),durationDays:Number(row.duration_days??30),audience:normalizeAudience(row.audience)??normalizeText(row.audience,30),isActive:normalizeBoolean(row.is_active,true),listingEnabled:normalizeBoolean(row.listing_enabled,true),featuredListing:normalizeBoolean(row.featured_listing),prioritySupport:normalizeBoolean(row.priority_support),verificationBadge:normalizeBoolean(row.verification_badge),analyticsAccess:normalizeBoolean(row.analytics_access),homepagePromotion:normalizeBoolean(row.homepage_promotion),liveAartiEnabled:normalizeBoolean(row.live_aarti_enabled),enhancedSeo:normalizeBoolean(row.enhanced_seo),enhancedProfile:normalizeBoolean(row.enhanced_profile),whatsappEnquiry:normalizeBoolean(row.whatsapp_enquiry,true),features:parseJsonArray(row.plan_features_json),planFeaturesJson:String(row.plan_features_json??"[]")};
}

function planPayload(req:Request,partial=false){
  const b=req.body||{};const f:Record<string,unknown>={};const has=(k:string)=>Object.prototype.hasOwnProperty.call(b,k);const aud=normalizeAudience(b.audience);const name=normalizeText(b.name??b.title,150);
  if(!partial||has("audience")){if(!aud)return {fields:f,error:"Valid plan audience is required: pandit, temple, or ashram."};f.audience=aud}
  if(!partial||has("name")||has("title")){if(!PLAN_NAMES.includes(name as (typeof PLAN_NAMES)[number]))return {fields:f,error:"Plan name must be Basic or Premium in the current schema."};f.name=name}
  if(!partial||has("code")){const code=normalizeText(b.code,120).toLowerCase();if(!/^[a-z0-9][a-z0-9_-]{2,119}$/.test(code))return {fields:f,error:"Plan code must be 3-120 characters."};f.code=code}
  const nums:Array<[string,string,number,number]>=[["priceAmount","price_amount",0,Number.MAX_SAFE_INTEGER],["durationDays","duration_days",30,3650],["leadLimit","lead_limit",0,Number.MAX_SAFE_INTEGER],["serviceLimit","service_limit",0,Number.MAX_SAFE_INTEGER],["serviceAreaLimit","service_area_limit",0,Number.MAX_SAFE_INTEGER],["galleryLimit","gallery_limit",0,Number.MAX_SAFE_INTEGER],["videoLimit","video_limit",0,Number.MAX_SAFE_INTEGER],["programLimit","program_limit",0,Number.MAX_SAFE_INTEGER],["sortOrder","sort_order",0,Number.MAX_SAFE_INTEGER]];
  for(const [input,col,fb,max] of nums)if(!partial||has(input)||has(col))f[col]=normalizeInteger(b[input]??b[col],fb,col==="duration_days"?1:0,max);
  if(!partial||has("currency")){const c=normalizeText(b.currency||"INR",10).toUpperCase();if(c!=="INR")return {fields:f,error:"Subscription plans must use INR."};f.currency=c}
  if(!partial||has("billingInterval")||has("billing_interval"))f.billing_interval=normalizeBillingInterval(b.billingInterval??b.billing_interval);
  const bools:Array<[string,string,boolean]>=[["listingEnabled","listing_enabled",true],["featuredListing","featured_listing",false],["prioritySupport","priority_support",false],["verificationBadge","verification_badge",false],["analyticsAccess","analytics_access",false],["homepagePromotion","homepage_promotion",false],["liveAartiEnabled","live_aarti_enabled",false],["enhancedSeo","enhanced_seo",false],["enhancedProfile","enhanced_profile",false],["whatsappEnquiry","whatsapp_enquiry",true],["isActive","is_active",true]];
  for(const [input,col,fb] of bools)if(!partial||has(input)||has(col))f[col]=boolInt(b[input]??b[col],fb);
  if(!partial||has("searchVisibility")||has("search_visibility")){const s=normalizeText(b.searchVisibility??b.search_visibility??"standard",20).toLowerCase();f.search_visibility=["standard","higher"].includes(s)?s:"standard"}
  if(!partial||has("analyticsLevel")||has("analytics_level")){const s=normalizeText(b.analyticsLevel??b.analytics_level??"none",20).toLowerCase();f.analytics_level=["none","basic","advanced"].includes(s)?s:"none"}
  if(!partial||has("description"))f.description=normalizeNullableText(b.description,5000);
  if(!partial||has("features")||has("planFeatures")||has("plan_features_json"))f.plan_features_json=b.features!==undefined?jsonArray(b.features):b.planFeatures!==undefined?jsonArray(b.planFeatures):jsonArray(b.plan_features_json);
  if(!partial||has("razorpayPlanId")||has("razorpay_plan_id"))f.razorpay_plan_id=normalizeNullableText(b.razorpayPlanId??b.razorpay_plan_id,200);
  return {fields:f};
}

router.get("/plans",(req,res)=>{
  try{if(!requireTable(res,"subscription_plans"))return;const audience=normalizeAudience(req.query.audience);const activeOnly=req.query.activeOnly===undefined?false:normalizeBoolean(req.query.activeOnly);const where:string[]=[];const params:unknown[]=[];if(audience){where.push("audience=?");params.push(audience)}if(activeOnly){where.push("is_active=1")}const rows=db.prepare(`SELECT * FROM subscription_plans ${where.length?`WHERE ${where.join(" AND ")}`:""} ORDER BY audience,sort_order,price_amount,id`).all(...params) as SqlRow[];res.json({success:true,plans:rows.map(serializePlan),total:rows.length,filters:{audience,activeOnly}});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load subscription plans."});}
});

router.get("/plans/:id/prices",(req,res)=>{
  try{if(!requireTable(res,"subscription_plan_prices"))return;const id=asPositiveId(req.params.id);if(!id)return void res.status(400).json({success:false,error:"Invalid plan id."});const rows=db.prepare(`SELECT * FROM subscription_plan_prices WHERE plan_id=? ORDER BY billing_interval,sort_order,id`).all(id) as SqlRow[];res.json({success:true,prices:rows});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load plan price variants."});}
});

router.post("/plans",(req,res)=>{
  try{if(!requireTable(res,"subscription_plans"))return;const payload=planPayload(req,false);if(payload.error)return void res.status(400).json({success:false,error:payload.error});const fields=payload.fields;const columns=tableColumns("subscription_plans");const code=String(fields.code);if(db.prepare(`SELECT id FROM subscription_plans WHERE code=? LIMIT 1`).get(code))return void res.status(409).json({success:false,error:"A subscription plan with this code already exists."});if(db.prepare(`SELECT id FROM subscription_plans WHERE audience=? AND name=? LIMIT 1`).get(fields.audience,fields.name))return void res.status(409).json({success:false,error:"A plan with the same audience and name already exists."});const insertable=Object.keys(fields).filter(c=>columns.has(c));const result=db.prepare(`INSERT INTO subscription_plans (${insertable.map(quoteIdentifier).join(",")},created_at,updated_at) VALUES (${insertable.map(()=>"?").join(",")},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run(...insertable.map(c=>fields[c]));const id=Number(result.lastInsertRowid);const row=getRowById("subscription_plans",id)||{};
    if(tableExists("subscription_plan_prices")){
      db.prepare(`INSERT OR IGNORE INTO subscription_plan_prices (plan_id,billing_interval,duration_days,price_amount,currency,provider,razorpay_plan_id,is_active,sort_order,metadata_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run(id,String(fields.billing_interval??"monthly"),Number(fields.duration_days??30),Number(fields.price_amount??0),String(fields.currency??"INR"),"razorpay",fields.razorpay_plan_id??null,Number(fields.is_active??1),Number(fields.sort_order??0),"{}");
    }
    audit(req,currentUserId(res),"admin.subscription_plan.created","subscription_plan",id,null,row);res.status(201).json({success:true,plan:serializePlan(row),prices:tableExists("subscription_plan_prices")?db.prepare(`SELECT * FROM subscription_plan_prices WHERE plan_id=? ORDER BY id`).all(id):[]});
  }catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to create subscription plan."});}
});

router.patch("/plans/:id",(req,res)=>{
  try{if(!requireTable(res,"subscription_plans"))return;const id=asPositiveId(req.params.id);if(!id)return void res.status(400).json({success:false,error:"Invalid plan id."});const old=getRowById("subscription_plans",id);if(!old)return void res.status(404).json({success:false,error:"Subscription plan not found."});const payload=planPayload(req,true);if(payload.error)return void res.status(400).json({success:false,error:payload.error});const fields=payload.fields;if(fields.code!==undefined&&db.prepare(`SELECT id FROM subscription_plans WHERE code=? AND id<>? LIMIT 1`).get(fields.code,id))return void res.status(409).json({success:false,error:"Another plan already uses this code."});const updates=Object.entries(fields).filter(([c])=>tableColumns("subscription_plans").has(c)).map(([c])=>`${quoteIdentifier(c)}=?`);const values=Object.entries(fields).filter(([c])=>tableColumns("subscription_plans").has(c)).map(([,v])=>v);if(!updates.length)return void res.status(400).json({success:false,error:"No supported plan fields were supplied."});updates.push("updated_at=CURRENT_TIMESTAMP");values.push(id);db.prepare(`UPDATE subscription_plans SET ${updates.join(",")} WHERE id=?`).run(...values);const updated=getRowById("subscription_plans",id)||{};
    if(tableExists("subscription_plan_prices")){
      const monthly=db.prepare(`SELECT * FROM subscription_plan_prices WHERE plan_id=? AND billing_interval=? LIMIT 1`).get(id,"monthly") as SqlRow|undefined;
      if(monthly){const priceFields:{column:string,value:unknown}[]=[];if(fields.price_amount!==undefined)priceFields.push({column:"price_amount",value:fields.price_amount});if(fields.duration_days!==undefined)priceFields.push({column:"duration_days",value:fields.duration_days});if(fields.currency!==undefined)priceFields.push({column:"currency",value:fields.currency});if(fields.is_active!==undefined)priceFields.push({column:"is_active",value:fields.is_active});if(fields.razorpay_plan_id!==undefined)priceFields.push({column:"razorpay_plan_id",value:fields.razorpay_plan_id});if(priceFields.length)db.prepare(`UPDATE subscription_plan_prices SET ${priceFields.map(x=>`${x.column}=?`).join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...priceFields.map(x=>x.value),monthly.id)}
    }
    audit(req,currentUserId(res),"admin.subscription_plan.updated","subscription_plan",id,old,updated);res.json({success:true,plan:serializePlan(updated)});
  }catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to update subscription plan."});}
});

router.delete("/plans/:id",(req,res)=>{
  try{if(!requireTable(res,"subscription_plans"))return;const id=asPositiveId(req.params.id);if(!id)return void res.status(400).json({success:false,error:"Invalid plan id."});const old=getRowById("subscription_plans",id);if(!old)return void res.status(404).json({success:false,error:"Subscription plan not found."});const refs=["pandit_subscriptions","temple_subscriptions","ashram_subscriptions"].some(t=>tableExists(t)&&Boolean(db.prepare(`SELECT id FROM ${safeTableName(t)} WHERE plan_id=? LIMIT 1`).get(id)));if(refs){db.prepare(`UPDATE subscription_plans SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);db.prepare(`UPDATE subscription_plan_prices SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE plan_id=?`).run(id);audit(req,currentUserId(res),"admin.subscription_plan.archived","subscription_plan",id,old,{archived:true});return void res.json({success:true,archived:true,plan:serializePlan(getRowById("subscription_plans",id)||old)})}db.transaction(()=>{if(tableExists("subscription_plan_prices"))db.prepare(`DELETE FROM subscription_plan_prices WHERE plan_id=?`).run(id);db.prepare(`DELETE FROM subscription_plans WHERE id=?`).run(id)})();audit(req,currentUserId(res),"admin.subscription_plan.deleted","subscription_plan",id,old,null);res.json({success:true,deleted:true});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to delete subscription plan."});}
});

router.post("/plans/:id/prices",(req,res)=>{
  try{if(!requireTable(res,"subscription_plan_prices")||!requireTable(res,"subscription_plans"))return;const planId=asPositiveId(req.params.id);if(!planId)return void res.status(400).json({success:false,error:"Invalid plan id."});const plan=getRowById("subscription_plans",planId);if(!plan)return void res.status(404).json({success:false,error:"Subscription plan not found."});const interval=normalizeBillingInterval(req.body?.billingInterval??req.body?.billing_interval);const duration=normalizeInteger(req.body?.durationDays??req.body?.duration_days,30,1,3650);const price=normalizeMoney(req.body?.priceAmount??req.body?.price_amount,Number(plan.price_amount??0));const currency=normalizeText(req.body?.currency??plan.currency??"INR",10).toUpperCase();const provider=normalizeText(req.body?.provider??"razorpay",50).toLowerCase();if(currency!=="INR")return void res.status(400).json({success:false,error:"Only INR is supported."});if(db.prepare(`SELECT id FROM subscription_plan_prices WHERE plan_id=? AND billing_interval=? LIMIT 1`).get(planId,interval))return void res.status(409).json({success:false,error:"A price variant already exists for this billing interval."});const result=db.prepare(`INSERT INTO subscription_plan_prices (plan_id,billing_interval,duration_days,price_amount,currency,provider,razorpay_plan_id,is_active,sort_order,metadata_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run(planId,interval,duration,price,currency,provider,normalizeNullableText(req.body?.razorpayPlanId??req.body?.razorpay_plan_id,200),boolInt(req.body?.isActive,true),normalizeInteger(req.body?.sortOrder,0),jsonObject(req.body?.metadata));const id=Number(result.lastInsertRowid);const row=getRowById("subscription_plan_prices",id)||{};audit(req,currentUserId(res),"admin.subscription_plan_price.created","subscription_plan_price",id,null,row);res.status(201).json({success:true,price:row});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to create price variant."});}
});

router.patch("/plan-prices/:id",(req,res)=>{
  try{if(!requireTable(res,"subscription_plan_prices"))return;const id=asPositiveId(req.params.id);if(!id)return void res.status(400).json({success:false,error:"Invalid price id."});const old=getRowById("subscription_plan_prices",id);if(!old)return void res.status(404).json({success:false,error:"Price variant not found."});const updates:string[]=[];const values:unknown[]=[];const b=req.body||{};if(Object.prototype.hasOwnProperty.call(b,"billingInterval")||Object.prototype.hasOwnProperty.call(b,"billing_interval")){updates.push("billing_interval=?");values.push(normalizeBillingInterval(b.billingInterval??b.billing_interval))}if(Object.prototype.hasOwnProperty.call(b,"durationDays")||Object.prototype.hasOwnProperty.call(b,"duration_days")){updates.push("duration_days=?");values.push(normalizeInteger(b.durationDays??b.duration_days,30,1,3650))}if(Object.prototype.hasOwnProperty.call(b,"priceAmount")||Object.prototype.hasOwnProperty.call(b,"price_amount")){updates.push("price_amount=?");values.push(normalizeMoney(b.priceAmount??b.price_amount))}if(Object.prototype.hasOwnProperty.call(b,"currency")){const c=normalizeText(b.currency,10).toUpperCase();if(c!=="INR")return void res.status(400).json({success:false,error:"Only INR is supported."});updates.push("currency=?");values.push(c)}if(Object.prototype.hasOwnProperty.call(b,"provider")){updates.push("provider=?");values.push(normalizeText(b.provider,50).toLowerCase())}if(Object.prototype.hasOwnProperty.call(b,"razorpayPlanId")||Object.prototype.hasOwnProperty.call(b,"razorpay_plan_id")){updates.push("razorpay_plan_id=?");values.push(normalizeNullableText(b.razorpayPlanId??b.razorpay_plan_id,200))}if(Object.prototype.hasOwnProperty.call(b,"isActive")){updates.push("is_active=?");values.push(boolInt(b.isActive))}if(Object.prototype.hasOwnProperty.call(b,"sortOrder")){updates.push("sort_order=?");values.push(normalizeInteger(b.sortOrder,0))}if(Object.prototype.hasOwnProperty.call(b,"metadata")){updates.push("metadata_json=?");values.push(jsonObject(b.metadata))}if(!updates.length)return void res.status(400).json({success:false,error:"No supported price fields were supplied."});updates.push("updated_at=CURRENT_TIMESTAMP");values.push(id);db.prepare(`UPDATE subscription_plan_prices SET ${updates.join(",")} WHERE id=?`).run(...values);const updated=getRowById("subscription_plan_prices",id)||{};audit(req,currentUserId(res),"admin.subscription_plan_price.updated","subscription_plan_price",id,old,updated);res.json({success:true,price:updated});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to update price variant."});}
});
router.delete("/plan-prices/:id",(req,res)=>{try{if(!requireTable(res,"subscription_plan_prices"))return;const id=asPositiveId(req.params.id);if(!id)return void res.status(400).json({success:false,error:"Invalid price id."});const old=getRowById("subscription_plan_prices",id);if(!old)return void res.status(404).json({success:false,error:"Price variant not found."});if(db.prepare(`SELECT id FROM pandit_subscriptions WHERE subscription_plan_price_id=? LIMIT 1`).get(id)||db.prepare(`SELECT id FROM temple_subscriptions WHERE subscription_plan_price_id=? LIMIT 1`).get(id)||db.prepare(`SELECT id FROM ashram_subscriptions WHERE subscription_plan_price_id=? LIMIT 1`).get(id)){db.prepare(`UPDATE subscription_plan_prices SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);audit(req,currentUserId(res),"admin.subscription_plan_price.archived","subscription_plan_price",id,old,{archived:true});return void res.json({success:true,archived:true})}db.prepare(`DELETE FROM subscription_plan_prices WHERE id=?`).run(id);audit(req,currentUserId(res),"admin.subscription_plan_price.deleted","subscription_plan_price",id,old,null);res.json({success:true,deleted:true});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to delete price variant."});}});

/* -------------------------------------------------------------------------
 * Unified subscriptions
 * ---------------------------------------------------------------------- */

function subscriptionConfig(audience:Audience){
  if(audience==="pandit")return{table:"pandit_subscriptions",ownerTable:"pandit_profiles",ownerIdColumn:"pandit_id",ownerAlias:"p",ownerName:"COALESCE(p.display_name,u.name,'')",ownerJoin:`JOIN pandit_profiles p ON p.id=s.pandit_id LEFT JOIN users u ON u.id=p.user_id`,managerJoin:"",managerUserColumn:""};
  if(audience==="temple")return{table:"temple_subscriptions",ownerTable:"temples",ownerIdColumn:"temple_id",ownerAlias:"t",ownerName:"COALESCE(t.name,'')",ownerJoin:`JOIN temples t ON t.id=s.temple_id LEFT JOIN users u ON u.id=s.manager_user_id`,managerJoin:"",managerUserColumn:"manager_user_id"};
  return{table:"ashram_subscriptions",ownerTable:"ashrams",ownerIdColumn:"ashram_id",ownerAlias:"a",ownerName:"COALESCE(a.name,'')",ownerJoin:`JOIN ashrams a ON a.id=s.ashram_id LEFT JOIN users u ON u.id=s.manager_user_id`,managerJoin:"",managerUserColumn:"manager_user_id"};
}

function serializeSubscription(row:SqlRow,audience:Audience):JsonRecord{
  let snapshot:unknown={};try{const s=JSON.parse(String(row.plan_snapshot_json??"{}"));snapshot=s&&typeof s==="object"?s:{}}catch{snapshot={}}
  const leadLimit=Number(row.lead_limit??0);const used=Number(row.leads_used??0);const expiresAt=row.expires_at?String(row.expires_at):null;const days=expiresAt?Math.ceil((new Date(expiresAt).getTime()-Date.now())/86400000):null;
  return {...row,id:Number(row.id??0),subscriptionId:Number(row.id??0),audience,ownerId:Number(row.owner_entity_id??row[audience==="pandit"?"pandit_id":audience==="temple"?"temple_id":"ashram_id"]??0),ownerName:normalizeText(row.owner_name,250),accountName:normalizeText(row.account_name,250),accountEmail:normalizeText(row.account_email,255),accountPhone:normalizeText(row.account_phone,50),planId:Number(row.plan_id??0),planCode:normalizeText(row.plan_code,120),planName:normalizeText(row.plan_name,150),planPrice:Number(row.price_amount??row.plan_price??0),currency:normalizeText(row.currency||"INR",10).toUpperCase(),status:statusText(row.status),leadLimit,leadsUsed:used,leadsRemaining:Math.max(0,leadLimit-used),subscriptionPlanPriceId:asPositiveId(row.subscription_plan_price_id),billingInterval:normalizeBillingInterval(row.billing_interval),durationDays:Number(row.duration_days??30),startsAt:row.starts_at??null,expiresAt,daysToExpiry:days,paymentOrderId:asPositiveId(row.payment_order_id),paymentId:asPositiveId(row.payment_id),planSnapshot:snapshot};
}

router.get("/subscriptions",(req,res)=>{
  try{
    if(!requireTable(res,"subscription_plans")||!requireTable(res,"pandit_subscriptions")||!requireTable(res,"temple_subscriptions")||!requireTable(res,"ashram_subscriptions"))return;
    const page=normalizeInteger(req.query.page,1,1,100000);const limit=normalizeInteger(req.query.limit,50,1,200);const audience=normalizeAudience(req.query.audience);const status=normalizeSubscriptionStatus(req.query.status);const search=normalizeText(req.query.search,180);const audiences:Audience[]=audience?[audience]:["pandit","temple","ashram"];const result:SqlRow[]=[];
    for(const a of audiences){const c=subscriptionConfig(a);const where:string[]=["1=1"];const params:unknown[]=[];if(status){where.push("s.status=?");params.push(status)}if(search){where.push(`(CAST(s.id AS TEXT) LIKE ? OR LOWER(s.status) LIKE LOWER(?) OR LOWER(sp.code) LIKE LOWER(?) OR LOWER(sp.name) LIKE LOWER(?) OR LOWER(${c.ownerName}) LIKE LOWER(?) OR LOWER(COALESCE(u.email,'')) LIKE LOWER(?))`);const p=`%${search}%`;params.push(p,p,p,p,p,p)}const rows=db.prepare(`SELECT s.*, '${a}' audience, ${c.ownerIdColumn?`${c.ownerAlias}.id`:"0"} owner_entity_id, ${c.ownerName} owner_name, u.name account_name,u.email account_email,u.phone account_phone,sp.code plan_code,sp.name plan_name,sp.price_amount plan_price FROM ${c.table} s JOIN subscription_plans sp ON sp.id=s.plan_id ${c.ownerJoin} WHERE ${where.join(" AND ")} ORDER BY COALESCE(s.expires_at,s.created_at) DESC,s.id DESC`).all(...params) as SqlRow[];result.push(...rows)}
    result.sort((x,y)=>String(y.expires_at??y.created_at).localeCompare(String(x.expires_at??x.created_at))||Number(y.id??0)-Number(x.id??0));const total=result.length;const offset=(page-1)*limit;res.json({success:true,subscriptions:result.slice(offset,offset+limit).map(r=>serializeSubscription(r,normalizeAudience(r.audience)||"pandit")),pagination:{page,limit,offset,total,totalPages:Math.ceil(total/limit)},filters:{audience,status,search:search||null}});
  }catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load subscriptions."});}
});

router.get("/subscriptions/stats",(_req,res)=>{
  try{const totals={subscriptions:0,active:0,pending:0,expired:0,cancelled:0,paused:0,paymentFailed:0,totalLeadLimit:0,totalLeadsUsed:0,activeValue:0};const byAudience:JsonRecord[]=[];for(const audience of AUDIENCES){const c=subscriptionConfig(audience);if(!tableExists(c.table))continue;const row=db.prepare(`SELECT COUNT(*) subscriptions,SUM(CASE WHEN status='active' THEN 1 ELSE 0 END) active,SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending,SUM(CASE WHEN status='expired' THEN 1 ELSE 0 END) expired,SUM(CASE WHEN status='cancelled' THEN 1 ELSE 0 END) cancelled,SUM(CASE WHEN status='paused' THEN 1 ELSE 0 END) paused,SUM(CASE WHEN status='payment_failed' THEN 1 ELSE 0 END) payment_failed,COALESCE(SUM(lead_limit),0) total_lead_limit,COALESCE(SUM(leads_used),0) total_leads_used,COALESCE(SUM(CASE WHEN status='active' THEN price_amount ELSE 0 END),0) active_value FROM ${c.table}`).get() as SqlRow;const n={audience,subscriptions:Number(row.subscriptions??0),active:Number(row.active??0),pending:Number(row.pending??0),expired:Number(row.expired??0),cancelled:Number(row.cancelled??0),paused:Number(row.paused??0),paymentFailed:Number(row.payment_failed??0),totalLeadLimit:Number(row.total_lead_limit??0),totalLeadsUsed:Number(row.total_leads_used??0),activeValue:Number(row.active_value??0)};byAudience.push(n);totals.subscriptions+=n.subscriptions;totals.active+=n.active;totals.pending+=n.pending;totals.expired+=n.expired;totals.cancelled+=n.cancelled;totals.paused+=n.paused;totals.paymentFailed+=n.paymentFailed;totals.totalLeadLimit+=n.totalLeadLimit;totals.totalLeadsUsed+=n.totalLeadsUsed;totals.activeValue+=n.activeValue}res.json({success:true,totals,byAudience});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load subscription statistics."});}
});

function subscriptionRow(audience:Audience,id:number){const c=subscriptionConfig(audience);return db.prepare(`SELECT s.*, '${audience}' audience, ${c.ownerAlias}.id owner_entity_id, ${c.ownerName} owner_name, u.name account_name,u.email account_email,u.phone account_phone,sp.code plan_code,sp.name plan_name,sp.price_amount plan_price FROM ${c.table} s JOIN subscription_plans sp ON sp.id=s.plan_id ${c.ownerJoin} WHERE s.id=? LIMIT 1`).get(id) as SqlRow|undefined}

router.get("/subscriptions/:id",(req,res)=>{try{const id=asPositiveId(req.params.id);const audience=normalizeAudience(req.query.audience);if(!id||!audience)return void res.status(400).json({success:false,error:"Valid subscription id and audience are required."});const c=subscriptionConfig(audience);if(!requireTable(res,c.table))return;const row=subscriptionRow(audience,id);if(!row)return void res.status(404).json({success:false,error:"Subscription not found."});res.json({success:true,subscription:serializeSubscription(row,audience)});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load subscription."});}});

router.patch("/subscriptions/:id/status",(req,res)=>{try{const id=asPositiveId(req.params.id);const audience=normalizeAudience(req.body?.audience??req.query.audience);const status=normalizeSubscriptionStatus(req.body?.status);if(!id||!audience||!status)return void res.status(400).json({success:false,error:"Valid subscription id, audience and status are required."});const c=subscriptionConfig(audience);if(!requireTable(res,c.table))return;const old=db.prepare(`SELECT * FROM ${c.table} WHERE id=? LIMIT 1`).get(id) as SqlRow|undefined;if(!old)return void res.status(404).json({success:false,error:"Subscription not found."});const fields:string[]=["status=?","updated_at=CURRENT_TIMESTAMP"];const values:unknown[]=[status];if(status==="active"&&!old.starts_at)fields.push("starts_at=COALESCE(starts_at,CURRENT_TIMESTAMP)");if(status==="active"&&!old.expires_at){if(tableExists("subscription_plan_prices"))fields.push("expires_at=datetime(CURRENT_TIMESTAMP,'+' || COALESCE((SELECT duration_days FROM subscription_plan_prices WHERE id=subscription_plan_price_id),(SELECT duration_days FROM subscription_plans WHERE id=plan_id),30) || ' days')");else fields.push("expires_at=datetime(CURRENT_TIMESTAMP,'+' || COALESCE((SELECT duration_days FROM subscription_plans WHERE id=plan_id),30) || ' days')");}db.prepare(`UPDATE ${c.table} SET ${fields.join(",")} WHERE id=?`).run(...values,id);const updated=db.prepare(`SELECT * FROM ${c.table} WHERE id=? LIMIT 1`).get(id) as SqlRow;if(tableExists("subscription_events")){db.prepare(`INSERT INTO subscription_events (subscription_type,subscription_id,payment_order_id,payment_id,user_id,event_type,old_status,new_status,old_expires_at,new_expires_at,notes,metadata_json,created_at) VALUES (?,?,?,?,?,'admin_status_changed',?,?,?,?,?,?,CURRENT_TIMESTAMP)`).run(audience,id,asPositiveId(updated.payment_order_id),asPositiveId(updated.payment_id),currentUserId(res)||null,statusText(old.status)||null,status,old.expires_at??null,updated.expires_at??null,"Subscription status changed by Super Admin.",JSON.stringify({actor_user_id:currentUserId(res),audience}))}audit(req,currentUserId(res),"admin.subscription.status_updated","subscription",id,old,updated);res.json({success:true,subscription:serializeSubscription({...updated,audience},audience)});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to update subscription status."});}});

router.post("/subscriptions/:id/cancel",(req,res)=>{req.body={...(req.body||{}),status:"cancelled"};const handler=(req2:Request,res2:Response)=>{const id=asPositiveId(req2.params.id);const audience=normalizeAudience(req2.body?.audience??req2.query.audience);if(!id||!audience)return void res2.status(400).json({success:false,error:"Valid subscription id and audience are required."});try{const c=subscriptionConfig(audience);if(!requireTable(res2,c.table))return;const old=db.prepare(`SELECT * FROM ${c.table} WHERE id=? LIMIT 1`).get(id) as SqlRow|undefined;if(!old)return void res2.status(404).json({success:false,error:"Subscription not found."});if(statusText(old.status)==="cancelled")return void res2.json({success:true,message:"Subscription is already cancelled.",subscription:serializeSubscription({...old,audience},audience)});db.prepare(`UPDATE ${c.table} SET status='cancelled',updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(id);const updated=db.prepare(`SELECT * FROM ${c.table} WHERE id=? LIMIT 1`).get(id) as SqlRow;if(tableExists("subscription_events"))db.prepare(`INSERT INTO subscription_events (subscription_type,subscription_id,payment_order_id,payment_id,user_id,event_type,old_status,new_status,old_expires_at,new_expires_at,notes,metadata_json,created_at) VALUES (?,?,?,?,?,'admin_cancelled',?,'cancelled',?,?,?,?,CURRENT_TIMESTAMP)`).run(audience,id,asPositiveId(updated.payment_order_id),asPositiveId(updated.payment_id),currentUserId(res2)||null,statusText(old.status)||null,old.expires_at??null,updated.expires_at??null,"Subscription cancelled by Super Admin.",JSON.stringify({actor_user_id:currentUserId(res2),audience}));audit(req2,currentUserId(res2),"admin.subscription.cancelled","subscription",id,old,updated);res2.json({success:true,subscription:serializeSubscription({...updated,audience},audience)});}catch(error){console.error(error);res2.status(500).json({success:false,error:"Unable to cancel subscription."});}};handler(req,res)});

/* -------------------------------------------------------------------------
 * Payments
 * ---------------------------------------------------------------------- */

function serializePayment(row:SqlRow):JsonRecord{
  return {...row,id:Number(row.id??0),paymentNumber:row.payment_number,ownerType:row.entity_type,ownerId:row.entity_id,panditId:row.pandit_id,templeId:row.temple_id,ashramId:row.ashram_id,subscriptionId:row.subscription_id??row.pandit_subscription_id??row.temple_subscription_id??row.ashram_subscription_id,planId:row.plan_id,subscriptionPlanPriceId:row.subscription_plan_price_id,amount:Number(row.amount??0),amountPaise:Number(row.amount_paise??0),currency:normalizeText(row.currency||"INR",10).toUpperCase(),provider:normalizeText(row.provider||"razorpay",50).toLowerCase(),status:statusText(row.status),razorpayOrderId:row.provider_order_id,razorpayPaymentId:row.provider_payment_id};
}
router.get("/payments",(req,res)=>{try{if(!requireTable(res,"payments"))return;const {limit,offset}=parseListParams(req);const status=statusText(req.query.status);const provider=statusText(req.query.provider);const where:string[]=["1=1"];const params:unknown[]=[];if(status){where.push("status=?");params.push(status)}if(provider){where.push("LOWER(provider)=?");params.push(provider)}const rows=db.prepare(`SELECT * FROM payments WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params,limit,offset) as SqlRow[];const total=Number((db.prepare(`SELECT COUNT(*) value FROM payments WHERE ${where.join(" AND ")}`).get(...params) as {value?:unknown}|undefined)?.value??0);res.json({success:true,payments:rows.map(serializePayment),pagination:{limit,offset,total,totalPages:Math.ceil(total/limit)}});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load payments."});}});
router.get("/payment-orders",(req,res)=>{try{if(!requireTable(res,"payment_orders"))return;const {limit,offset}=parseListParams(req);const status=statusText(req.query.status);const where=status?"status=?":"1=1";const params=status?[status]:[];const rows=db.prepare(`SELECT * FROM payment_orders WHERE ${where} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params,limit,offset) as SqlRow[];res.json({success:true,orders:rows,paymentOrders:rows,pagination:{limit,offset}});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load payment orders."});}});
router.get("/payment-links",(req,res)=>{try{if(!requireTable(res,"payment_links"))return;const {limit,offset}=parseListParams(req);const rows=db.prepare(`SELECT * FROM payment_links ORDER BY id DESC LIMIT ? OFFSET ?`).all(limit,offset) as SqlRow[];res.json({success:true,links:rows,paymentLinks:rows,pagination:{limit,offset}});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load payment links."});}});
router.get("/payments/config",(_req,res)=>{const key=normalizeText(process.env.RAZORPAY_KEY_ID,200);const secret=normalizeText(process.env.RAZORPAY_KEY_SECRET,300);const merchant=normalizeText(process.env.RAZORPAY_MERCHANT_ID,200);const webhook=normalizeText(process.env.RAZORPAY_WEBHOOK_SECRET,300);res.json({success:true,razorpay:{configured:Boolean(key&&secret),mode:normalizeText(process.env.RAZORPAY_MODE||"test",20).toLowerCase()==="live"?"live":"test",keyIdMasked:maskSecret(key),merchantIdPresent:Boolean(merchant),merchantIdMasked:maskSecret(merchant),secretConfigured:Boolean(secret),webhookConfigured:Boolean(webhook),currency:normalizeText(process.env.RAZORPAY_CURRENCY||"INR",10).toUpperCase(),apiBaseUrl:normalizeText(process.env.RAZORPAY_API_BASE_URL||"https://api.razorpay.com/v1",300)}})});
router.patch("/payments/:id/status",(req,res)=>{try{if(!requireTable(res,"payments"))return;const id=asPositiveId(req.params.id);const status=statusText(req.body?.status);if(!id)return void res.status(400).json({success:false,error:"Invalid payment id."});if(!["created","pending","authorized","paid","captured","failed","refunded","partially_refunded","cancelled"].includes(status))return void res.status(400).json({success:false,error:"Invalid payment status."});const old=getRowById("payments",id);if(!old)return void res.status(404).json({success:false,error:"Payment not found."});db.prepare(`UPDATE payments SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(status,id);const updated=getRowById("payments",id)||{};audit(req,currentUserId(res),"admin.payment.status_updated","payment",id,old,updated);res.json({success:true,payment:serializePayment(updated)});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to update payment status."});}});

/* -------------------------------------------------------------------------
 * Leads / CRM
 * ---------------------------------------------------------------------- */

const LEAD_STATUSES=["new","qualified","assigned","contacted","follow_up","converted","lost","closed","spam"] as const;
const LEAD_PRIORITIES=["low","normal","high","urgent"] as const;
const LEAD_TEMPERATURES=["cold","warm","hot"] as const;

router.get("/leads",(req,res)=>{
  try{if(!requireTable(res,"leads"))return;const {limit,offset}=parseListParams(req);const columns=tableColumns("leads");const where:string[]=["1=1"];const params:unknown[]=[];const search=normalizeText(req.query.search,180);if(search){const cols=["lead_number","lead_type","name","email","phone","service_type","puja_type","message","source_type","source_page","source_form","form_key","country","state","district","city","status","priority"].filter(c=>columns.has(c));if(cols.length){where.push(`(${cols.map(c=>`LOWER(COALESCE(${quoteIdentifier(c)},'')) LIKE LOWER(?)`).join(" OR ")})`);const p=`%${search}%`;for(const _ of cols)params.push(p)}}const filterPairs:Array<[unknown,string[]]>=[[req.query.status,["status"]],[req.query.leadType??req.query.type,["lead_type","type"]],[req.query.sourceType??req.query.source,["source_type","source"]],[req.query.serviceType,["service_type"]],[req.query.pujaType,["puja_type"]],[req.query.country,["country"]],[req.query.state,["state"]],[req.query.district,["district"]],[req.query.city,["city"]],[req.query.priority,["priority"]],[req.query.temperature??req.query.leadTemperature,["lead_temperature"]]];for(const [value,cands] of filterPairs){const v=normalizeText(value,120);const c=firstExistingColumn(columns,cands);if(v&&c){where.push(`${quoteIdentifier(c)}=?`);params.push(v)}}const owner=asPositiveId(req.query.ownerUserId);if(owner&&columns.has("owner_user_id")){where.push("owner_user_id=?");params.push(owner)}const from=normalizeText(req.query.from??req.query.dateFrom,40);const to=normalizeText(req.query.to??req.query.dateTo,40);if(from&&columns.has("created_at")){where.push("created_at>=?");params.push(from)}if(to&&columns.has("created_at")){where.push("created_at<=?");params.push(to)}const whereSql=where.join(" AND ");const total=Number((db.prepare(`SELECT COUNT(*) value FROM leads WHERE ${whereSql}`).get(...params) as {value?:unknown}|undefined)?.value??0);const idCol=columns.has("id")?"id":"rowid";const rows=db.prepare(`SELECT * FROM leads WHERE ${whereSql} ORDER BY ${quoteIdentifier(idCol)} DESC LIMIT ? OFFSET ?`).all(...params,limit,offset) as SqlRow[];res.json({success:true,leads:rows,pagination:{limit,offset,page:Math.floor(offset/limit)+1,total,totalPages:Math.ceil(total/limit)}});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load leads."});}
});
router.get("/leads/:id",(req,res)=>{try{if(!requireTable(res,"leads"))return;const id=asPositiveId(req.params.id);if(!id)return void res.status(400).json({success:false,error:"Invalid lead id."});const lead=getRowById("leads",id);if(!lead)return void res.status(404).json({success:false,error:"Lead not found."});const related:JsonRecord={};const map:Array<[string,string,string]>=[["temple_id","temples","temple"],["requested_pandit_id","pandit_profiles","pandit"],["ashram_id","ashrams","ashram"],["puja_service_id","puja_services","pujaService"],["yatra_package_id","yatra_packages","yatraPackage"],["event_id","events","event"],["course_id","courses","course"],["spiritual_place_id","spiritual_places","spiritualPlace"]];for(const [col,table,key] of map){const ref=asPositiveId(lead[col]);if(ref&&tableExists(table))related[key]=getRowById(table,ref)||null}const submission=asPositiveId(lead.source_submission_id)&&tableExists("form_submissions")?getRowById("form_submissions",Number(lead.source_submission_id))||null:null;res.json({success:true,lead,related,formSubmission:submission});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load lead."});}});
router.patch("/leads/:id",(req,res)=>{try{if(!requireTable(res,"leads"))return;const id=asPositiveId(req.params.id);if(!id)return void res.status(400).json({success:false,error:"Invalid lead id."});const old=getRowById("leads",id);if(!old)return void res.status(404).json({success:false,error:"Lead not found."});const cols=tableColumns("leads");const updates:string[]=[];const values:unknown[]=[];const body=req.body||{};if(Object.prototype.hasOwnProperty.call(body,"status")){const s=statusText(body.status);if(!LEAD_STATUSES.includes(s as (typeof LEAD_STATUSES)[number]))return void res.status(400).json({success:false,error:"Invalid lead status."});if(cols.has("status")){updates.push("status=?");values.push(s)}if(s==="converted"&&cols.has("converted_at"))updates.push("converted_at=CURRENT_TIMESTAMP");if(s==="closed"&&cols.has("closed_at"))updates.push("closed_at=CURRENT_TIMESTAMP")}if(Object.prototype.hasOwnProperty.call(body,"priority")){const p=statusText(body.priority);if(!LEAD_PRIORITIES.includes(p as (typeof LEAD_PRIORITIES)[number]))return void res.status(400).json({success:false,error:"Invalid lead priority."});if(cols.has("priority")){updates.push("priority=?");values.push(p)}}if(Object.prototype.hasOwnProperty.call(body,"leadTemperature")&&cols.has("lead_temperature")){const t=statusText(body.leadTemperature);if(!LEAD_TEMPERATURES.includes(t as (typeof LEAD_TEMPERATURES)[number]))return void res.status(400).json({success:false,error:"Invalid lead temperature."});updates.push("lead_temperature=?");values.push(t)}if(Object.prototype.hasOwnProperty.call(body,"leadScore")&&cols.has("lead_score")){updates.push("lead_score=?");values.push(normalizeInteger(body.leadScore,0,0,1000))}if(Object.prototype.hasOwnProperty.call(body,"ownerUserId")&&cols.has("owner_user_id")){updates.push("owner_user_id=?");values.push(body.ownerUserId==null||body.ownerUserId===""?null:asPositiveId(body.ownerUserId))}if(Object.prototype.hasOwnProperty.call(body,"contactPreference")&&cols.has("contact_preference")){const x=statusText(body.contactPreference);if(x&&!['call','whatsapp','email','any'].includes(x))return void res.status(400).json({success:false,error:"Invalid contact preference."});updates.push("contact_preference=?");values.push(x||null)}const textMap:Array<[string,string,number]>=[["message","message",10000],["preferredDate","preferred_date",40],["preferredTime","preferred_time",80]];for(const [input,col,max] of textMap)if(Object.prototype.hasOwnProperty.call(body,input)&&cols.has(col)){updates.push(`${col}=?`);values.push(normalizeNullableText(body[input],max))}if(cols.has("last_activity_at"))updates.push("last_activity_at=CURRENT_TIMESTAMP");if(cols.has("updated_at"))updates.push("updated_at=CURRENT_TIMESTAMP");if(!updates.length)return void res.status(400).json({success:false,error:"No supported lead fields were supplied."});values.push(id);db.prepare(`UPDATE leads SET ${updates.join(",")} WHERE id=?`).run(...values);const updated=getRowById("leads",id)||{};audit(req,currentUserId(res),"admin.lead.updated","lead",id,old,updated);res.json({success:true,lead:updated});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to update lead."});}});
router.patch("/leads/:id/status",(req,res)=>{req.body={...(req.body||{}),status:req.body?.status};const s=statusText(req.body.status);if(!LEAD_STATUSES.includes(s as (typeof LEAD_STATUSES)[number]))return void res.status(400).json({success:false,error:"Invalid lead status."});try{if(!requireTable(res,"leads"))return;const id=asPositiveId(req.params.id);if(!id)return void res.status(400).json({success:false,error:"Invalid lead id."});const old=getRowById("leads",id);if(!old)return void res.status(404).json({success:false,error:"Lead not found."});db.prepare(`UPDATE leads SET status=?,last_activity_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(s,id);const updated=getRowById("leads",id)||{};audit(req,currentUserId(res),"admin.lead.status_updated","lead",id,old,updated);res.json({success:true,lead:updated});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to update lead status."});}});
router.get("/lead-stats",(_req,res)=>{try{if(!requireTable(res,"leads"))return;const cols=tableColumns("leads");const byStatus=db.prepare(`SELECT status,COUNT(*) count FROM leads GROUP BY status ORDER BY count DESC`).all() as SqlRow[];const byType=cols.has("lead_type")?db.prepare(`SELECT lead_type,COUNT(*) count FROM leads GROUP BY lead_type ORDER BY count DESC`).all() as SqlRow[]:[];const bySource=cols.has("source_type")?db.prepare(`SELECT source_type,COUNT(*) count FROM leads GROUP BY source_type ORDER BY count DESC`).all() as SqlRow[]:[];const byLocation=db.prepare(`SELECT country,state,district,city,COUNT(*) count FROM leads GROUP BY country,state,district,city ORDER BY count DESC LIMIT 100`).all() as SqlRow[];const byService=db.prepare(`SELECT service_type,puja_type,COUNT(*) count FROM leads GROUP BY service_type,puja_type ORDER BY count DESC LIMIT 100`).all() as SqlRow[];res.json({success:true,byStatus,byType,bySource,byLocation,byService});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load lead statistics."});}});

/* -------------------------------------------------------------------------
 * Puja Services — canonical columns only
 * ---------------------------------------------------------------------- */

function serializePuja(row:SqlRow):JsonRecord{return{...row,id:Number(row.id??0),descriptionJson:parseJsonArray(row.description_json),samagri:parseJsonArray(row.samagri_json),benefits:parseJsonArray(row.benefits_json),suitableFor:parseJsonArray(row.suitable_for_json),gallery:parseJsonArray(row.gallery_json),faqs:parseJsonArray(row.faqs_json),priceFromAmount:row.price_from_amount==null?null:Number(row.price_from_amount),currency:normalizeText(row.currency||"INR",10).toUpperCase(),bookingEnabled:normalizeBoolean(row.booking_enabled,true),featured:normalizeBoolean(row.featured),status:statusText(row.status)};}
router.get("/pujas",(req,res)=>{try{if(!requireTable(res,"puja_services"))return;const {limit,offset}=parseListParams(req);const cols=tableColumns("puja_services");const where:string[]=["1=1"];const params:unknown[]=[];const search=normalizeText(req.query.search,160);if(search){const s=["name","slug","category","tagline","short_description","deity","sampradaya"].filter(c=>cols.has(c));if(s.length){where.push(`(${s.map(c=>`${quoteIdentifier(c)} LIKE ?`).join(" OR ")})`);for(const _ of s)params.push(`%${search}%`)}}const status=statusText(req.query.status);if(status&&cols.has("status")){where.push("status=?");params.push(status)}const category=normalizeText(req.query.category,100);if(category&&cols.has("category")){where.push("category=?");params.push(category)}const rows=db.prepare(`SELECT * FROM puja_services WHERE ${where.join(" AND ")} ORDER BY sort_order ASC,id DESC LIMIT ? OFFSET ?`).all(...params,limit,offset) as SqlRow[];const total=Number((db.prepare(`SELECT COUNT(*) value FROM puja_services WHERE ${where.join(" AND ")}`).get(...params) as {value?:unknown}|undefined)?.value??0);res.json({success:true,pujas:rows.map(serializePuja),pagination:{limit,offset,total,totalPages:Math.ceil(total/limit)}});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load Puja services."});}});

function pujaPayload(req:Request,partial=false){const b=req.body||{};const f:Record<string,unknown>={};const has=(k:string)=>Object.prototype.hasOwnProperty.call(b,k);if(!partial||has("slug"))f.slug=normalizeText(b.slug,140);if(!partial||has("name"))f.name=normalizeText(b.name,180);if(!partial||has("category"))f.category=normalizeNullableText(b.category,100);const pairs:Array<[string,string,number]>=[["tagline","tagline",500],["shortDescription","short_description",1000],["description","description",20000],["deity","deity",120],["sampradaya","sampradaya",120],["durationText","duration_text",120],["samagriDetails","samagri_details",5000],["image","image",2000],["videoUrl","video_url",2000],["priceDisplay","price_display",120]];for(const [input,col,max] of pairs)if(has(input)||(!partial&&["tagline","shortDescription","description","deity","sampradaya","durationText","samagriDetails","image","videoUrl","priceDisplay"].includes(input)))f[col]=normalizeNullableText(b[input]??b[col],max);if(has("descriptionJson"))f.description_json=jsonArray(b.descriptionJson);if(has("samagri")||has("samagriJson"))f.samagri_json=jsonArray(b.samagri??b.samagriJson);if(has("benefits")||has("benefitsJson"))f.benefits_json=jsonArray(b.benefits??b.benefitsJson);if(has("suitableFor")||has("suitableForJson"))f.suitable_for_json=jsonArray(b.suitableFor??b.suitableForJson);if(has("gallery")||has("galleryJson"))f.gallery_json=jsonArray(b.gallery??b.galleryJson);if(has("faqs")||has("faqsJson"))f.faqs_json=jsonArray(b.faqs??b.faqsJson);if(has("durationText"))f.duration_text=normalizeNullableText(b.durationText,120);if(has("samagriIncluded"))f.samagri_included=boolInt(b.samagriIncluded);if(has("priceFromAmount")||has("price"))f.price_from_amount=b.priceFromAmount==null&&b.price==null?null:normalizeMoney(b.priceFromAmount??b.price);if(has("currency"))f.currency=normalizeText(b.currency||"INR",10).toUpperCase();if(has("availabilityScope"))f.availability_scope=normalizeNullableText(b.availabilityScope,100);if(has("defaultLocationId"))f.default_location_id=asPositiveId(b.defaultLocationId);if(has("bookingEnabled"))f.booking_enabled=boolInt(b.bookingEnabled);if(has("featured")||has("isFeatured"))f.featured=boolInt(b.featured??b.isFeatured);if(has("status")){const s=statusText(b.status);if(!["draft","published","unpublished"].includes(s))return{fields:f,error:"Invalid Puja status."};f.status=s}if(has("sortOrder"))f.sort_order=normalizeInteger(b.sortOrder,0);return{fields:f};}
router.post("/pujas",(req,res)=>{try{if(!requireTable(res,"puja_services"))return;const p=pujaPayload(req,false);if(p.error)return void res.status(400).json({success:false,error:p.error});if(!p.fields.slug||!p.fields.name)return void res.status(400).json({success:false,error:"Puja slug and name are required."});if(db.prepare(`SELECT id FROM puja_services WHERE slug=? LIMIT 1`).get(p.fields.slug))return void res.status(409).json({success:false,error:"A Puja with this slug already exists."});const cols=tableColumns("puja_services");const insertable=Object.keys(p.fields).filter(c=>cols.has(c));const result=db.prepare(`INSERT INTO puja_services (${insertable.map(quoteIdentifier).join(",")},created_at,updated_at) VALUES (${insertable.map(()=>"?").join(",")},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run(...insertable.map(c=>p.fields[c]));const id=Number(result.lastInsertRowid);const row=getRowById("puja_services",id)||{};audit(req,currentUserId(res),"admin.puja.created","puja_service",id,null,row);res.status(201).json({success:true,puja:serializePuja(row)});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to create Puja."});}});
router.patch("/pujas/:id",(req,res)=>{try{if(!requireTable(res,"puja_services"))return;const id=asPositiveId(req.params.id);if(!id)return void res.status(400).json({success:false,error:"Invalid Puja id."});const old=getRowById("puja_services",id);if(!old)return void res.status(404).json({success:false,error:"Puja not found."});const p=pujaPayload(req,true);if(p.error)return void res.status(400).json({success:false,error:p.error});const cols=tableColumns("puja_services");const entries=Object.entries(p.fields).filter(([c])=>cols.has(c));if(!entries.length)return void res.status(400).json({success:false,error:"No supported Puja fields were supplied."});db.prepare(`UPDATE puja_services SET ${entries.map(([c])=>`${quoteIdentifier(c)}=?`).join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...entries.map(([,v])=>v),id);const updated=getRowById("puja_services",id)||{};audit(req,currentUserId(res),"admin.puja.updated","puja_service",id,old,updated);res.json({success:true,puja:serializePuja(updated)});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to update Puja."});}});
router.delete("/pujas/:id",(req,res)=>{try{if(!requireTable(res,"puja_services"))return;const id=asPositiveId(req.params.id);if(!id)return void res.status(400).json({success:false,error:"Invalid Puja id."});const old=getRowById("puja_services",id);if(!old)return void res.status(404).json({success:false,error:"Puja not found."});db.prepare(`DELETE FROM puja_services WHERE id=?`).run(id);audit(req,currentUserId(res),"admin.puja.deleted","puja_service",id,old,null);res.json({success:true,deleted:true});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to delete Puja."});}});

/* -------------------------------------------------------------------------
 * Videos — All Videos catalogue
 * ---------------------------------------------------------------------- */

function videoPayload(req:Request, partial=false){
  const b=req.body||{};const f:Record<string,unknown>={};const has=(k:string)=>Object.prototype.hasOwnProperty.call(b,k);
  if(!partial||has("slug"))f.slug=normalizeText(b.slug,140);
  if(!partial||has("title"))f.title=normalizeText(b.title,220);
  const text:Array<[string,string,number]>=[["shortDescription","short_description",1000],["description","description",20000],["videoId","video_id",300],["watchUrl","watch_url",1500],["videoProvider","video_provider",50],["videoUrl","video_url",1500],["embedUrl","embed_url",1500],["externalVideoId","external_video_id",300],["thumbnailUrl","thumbnail_url",1500],["image","image",1500],["durationText","duration_text",100],["category","category",100]];
  for(const [input,col,max] of text)if(has(input))f[col]=normalizeNullableText(b[input],max);
  if(has("provider")){const p=normalizeText(b.provider,30).toLowerCase();if(!["youtube","vimeo","self-hosted","external"].includes(p))return{fields:f,error:"Invalid video provider."};f.provider=p}
  if(has("durationSeconds"))f.duration_seconds=b.durationSeconds==null||b.durationSeconds===""?null:normalizeInteger(b.durationSeconds,0,0,10_000_000); if(!partial && !has("videoUrl")) f.video_url=normalizeText(b.watchUrl,1500); if(Object.prototype.hasOwnProperty.call(f,"video_url") && f.video_url == null) f.video_url="";
  if(has("tags")||has("tagsJson"))f.tags_json=jsonArray(b.tags??b.tagsJson);
  const ids:Array<[string,string]>=[["relatedEntityId","related_entity_id"],["relatedTempleId","related_temple_id"],["relatedPanditId","related_pandit_id"],["relatedAshramId","related_ashram_id"],["relatedPujaId","related_puja_id"],["relatedEventId","related_event_id"],["relatedCourseId","related_course_id"],["locationId","location_id"],["countryLocationId","country_location_id"],["stateLocationId","state_location_id"],["districtLocationId","district_location_id"],["cityLocationId","city_location_id"]];
  for(const [input,col] of ids)if(has(input))f[col]=asPositiveId(b[input]);
  if(has("status")){const s=statusText(b.status);if(!["draft","published","unpublished","scheduled"].includes(s))return{fields:f,error:"Invalid video status."};f.status=s}
  if(has("featured")||has("isFeatured"))f.featured=boolInt(b.featured??b.isFeatured);
  if(has("isActive"))f.is_active=boolInt(b.isActive);
  if(has("sortOrder"))f.sort_order=normalizeInteger(b.sortOrder,0);
  if(has("publishedAt"))f.published_at=normalizeNullableText(b.publishedAt,100);
  return{fields:f};
}
router.get("/videos",(req,res)=>{try{if(!requireTable(res,"videos"))return;const {limit,offset}=parseListParams(req);const status=statusText(req.query.status);const where:string[]=["1=1"];const params:unknown[]=[];if(status){where.push("LOWER(status)=?");params.push(status)}const rows=db.prepare(`SELECT * FROM videos WHERE ${where.join(" AND ")} ORDER BY sort_order ASC,COALESCE(published_at,created_at) DESC,id DESC LIMIT ? OFFSET ?`).all(...params,limit,offset) as SqlRow[];const total=Number((db.prepare(`SELECT COUNT(*) value FROM videos WHERE ${where.join(" AND ")}`).get(...params) as {value?:unknown}|undefined)?.value??0);res.json({success:true,videos:rows,listing:"all",pagination:{limit,offset,total,totalPages:Math.ceil(total/limit)}});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load videos."});}});
router.post("/videos",(req,res)=>{try{if(!requireTable(res,"videos"))return;const p=videoPayload(req,false);if(p.error)return void res.status(400).json({success:false,error:p.error});if(!p.fields.slug||!p.fields.title)return void res.status(400).json({success:false,error:"Video slug and title are required."});if(db.prepare(`SELECT id FROM videos WHERE slug=? LIMIT 1`).get(p.fields.slug))return void res.status(409).json({success:false,error:"A video with this slug already exists."});const cols=tableColumns("videos");const fields:Record<string,unknown>={provider:"youtube",video_provider:"youtube",video_url:"",tags_json:"[]",status:"draft",featured:0,is_active:1,sort_order:0,...p.fields};const insertable=Object.keys(fields).filter(c=>cols.has(c));const result=db.prepare(`INSERT INTO videos (${insertable.map(quoteIdentifier).join(",")},created_at,updated_at) VALUES (${insertable.map(()=>"?").join(",")},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run(...insertable.map(c=>fields[c]));const id=Number(result.lastInsertRowid);const row=getRowById("videos",id)||{};audit(req,currentUserId(res),"admin.video.created","video",id,null,row);res.status(201).json({success:true,video:row});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to create video."});}});
router.patch("/videos/:id",(req,res)=>{try{if(!requireTable(res,"videos"))return;const id=asPositiveId(req.params.id);if(!id)return void res.status(400).json({success:false,error:"Invalid video id."});const old=getRowById("videos",id);if(!old)return void res.status(404).json({success:false,error:"Video not found."});const p=videoPayload(req,true);if(p.error)return void res.status(400).json({success:false,error:p.error});const cols=tableColumns("videos");const entries=Object.entries(p.fields).filter(([c])=>cols.has(c));if(!entries.length)return void res.status(400).json({success:false,error:"No supported video fields were supplied."});db.prepare(`UPDATE videos SET ${entries.map(([c])=>`${quoteIdentifier(c)}=?`).join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...entries.map(([,v])=>v),id);const updated=getRowById("videos",id)||{};audit(req,currentUserId(res),"admin.video.updated","video",id,old,updated);res.json({success:true,video:updated});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to update video."});}});
router.delete("/videos/:id",(req,res)=>{try{if(!requireTable(res,"videos"))return;const id=asPositiveId(req.params.id);if(!id)return void res.status(400).json({success:false,error:"Invalid video id."});const old=getRowById("videos",id);if(!old)return void res.status(404).json({success:false,error:"Video not found."});db.prepare(`DELETE FROM videos WHERE id=?`).run(id);audit(req,currentUserId(res),"admin.video.deleted","video",id,old,null);res.json({success:true,deleted:true});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to delete video."});}});

/* -------------------------------------------------------------------------
 * SEO — canonical seo_entries + deep location pages
 * ---------------------------------------------------------------------- */

function normalizeSeoPageType(value:unknown):string{const p=normalizeText(value||"custom",50).toLowerCase();return SEO_PAGE_TYPES.includes(p as (typeof SEO_PAGE_TYPES)[number])?p:"custom";}
function seoEntryPayload(req:Request,partial=false){const b=req.body||{};const f:Record<string,unknown>={};const has=(k:string)=>Object.prototype.hasOwnProperty.call(b,k);if(!partial||has("path")||has("routePath"))f.path=pathOnly(b.path??b.routePath);if(!partial||has("pageType"))f.page_type=normalizeSeoPageType(b.pageType);const map:Array<[string,string,number]>=[["entityType","entity_type",100],["seoTitle","seo_title",300],["title","seo_title",300],["metaDescription","meta_description",2500],["description","meta_description",2500],["h1","h1",300],["introContent","intro_content",10000],["bodyContent","body_content",50000],["canonicalUrl","canonical_url",1500],["ogTitle","og_title",300],["ogDescription","og_description",500],["ogImage","og_image",1500],["twitterCard","twitter_card",50],["twitterTitle","twitter_title",300],["twitterDescription","twitter_description",500],["twitterImage","twitter_image",1500],["robots","robots",120],["schemaType","schema_type",100],["imageAlt","image_alt",500],["focusKeyword","focus_keyword",250],["area","area",150],["locationLabel","location_label",250],["noindexReason","noindex_reason",500],["sitemapChangefreq","sitemap_changefreq",30]];for(const [input,col,max] of map){if(!has(input))continue;f[col]=normalizeNullableText(b[input],max)}const ids:Array<[string,string]>=[["entityId","entity_id"],["countryId","country_id"],["stateId","state_id"],["districtId","district_id"],["cityId","city_id"],["areaId","area_id"]];for(const [input,col] of ids)if(has(input))f[col]=asPositiveId(b[input]);if(has("locationLevel"))f.location_level=normalizeText(b.locationLevel,40).toLowerCase()||null;if(has("canonicalLocked"))f.canonical_locked=boolInt(b.canonicalLocked);if(has("twitterCard"))f.twitter_card=normalizeText(b.twitterCard||"summary_large_image",50);if(has("faq")||has("faqJson"))f.faq_json=jsonArray(b.faq??b.faqJson);if(has("breadcrumb")||has("breadcrumbJson"))f.breadcrumb_json=jsonArray(b.breadcrumb??b.breadcrumbJson);if(has("schemaJson"))f.schema_json=jsonObject(b.schemaJson);if(has("hreflang")||has("hreflangJson"))f.hreflang_json=jsonObject(b.hreflang??b.hreflangJson);if(has("keywords")||has("keywordsJson"))f.keywords_json=jsonArray(b.keywords??b.keywordsJson);if(has("primaryKeywords")||has("primaryKeywordsJson"))f.primary_keywords_json=jsonArray(b.primaryKeywords??b.primaryKeywordsJson);if(has("locationKeywords")||has("locationKeywordsJson"))f.location_keywords_json=jsonArray(b.locationKeywords??b.locationKeywordsJson);if(has("longTailKeywords")||has("longTailKeywordsJson"))f.long_tail_keywords_json=jsonArray(b.longTailKeywords??b.longTailKeywordsJson);if(has("searchIntents")||has("searchIntentsJson"))f.search_intents_json=jsonArray(b.searchIntents??b.searchIntentsJson);if(has("isIndexable"))f.is_indexable=boolInt(b.isIndexable,true);if(has("qualityScore"))f.quality_score=normalizeInteger(b.qualityScore,0,0,100);if(has("sitemapPriority"))f.sitemap_priority=Number(b.sitemapPriority)||0;if(has("status")){const s=statusText(b.status);if(!["draft","published","unpublished"].includes(s))return{fields:f,error:"Invalid SEO status."};f.status=s}if(!partial&&!f.status)f.status="published";if(!partial&&!has("robots"))f.robots=`${boolInt(b.robotsIndex,true)?"index":"noindex"},${boolInt(b.robotsFollow,true)?"follow":"nofollow"}`;return{fields:f};}
router.get("/seo",(req,res)=>{try{if(!requireTable(res,"seo_entries"))return;const {limit,offset}=parseListParams(req);const cols=tableColumns("seo_entries");const where:string[]=["1=1"];const params:unknown[]=[];const search=normalizeText(req.query.search,180);if(search){const s=["path","page_type","entity_type","seo_title","meta_description","focus_keyword","location_label"].filter(c=>cols.has(c));if(s.length){where.push(`(${s.map(c=>`${quoteIdentifier(c)} LIKE ?`).join(" OR ")})`);for(const _ of s)params.push(`%${search}%`)}}const pageType=statusText(req.query.pageType);if(pageType&&cols.has("page_type")){where.push("page_type=?");params.push(pageType)}const status=statusText(req.query.status);if(status&&cols.has("status")){where.push("status=?");params.push(status)}const rows=db.prepare(`SELECT * FROM seo_entries WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params,limit,offset) as SqlRow[];const total=Number((db.prepare(`SELECT COUNT(*) value FROM seo_entries WHERE ${where.join(" AND ")}`).get(...params) as {value?:unknown}|undefined)?.value??0);res.json({success:true,entries:rows.map(r=>({...r,title:r.seo_title,description:r.meta_description,routePath:r.path,isPublished:r.status==="published"})),pagination:{limit,offset,total,totalPages:Math.ceil(total/limit)}});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load SEO entries."});}});
router.post("/seo",(req,res)=>{try{if(!requireTable(res,"seo_entries"))return;const p=seoEntryPayload(req,false);if(p.error)return void res.status(400).json({success:false,error:p.error});if(!p.fields.path||p.fields.path==="/"||!p.fields.seo_title)return void res.status(400).json({success:false,error:"A non-root path and SEO title are required."});if(db.prepare(`SELECT id FROM seo_entries WHERE path=? LIMIT 1`).get(p.fields.path))return void res.status(409).json({success:false,error:"SEO entry already exists for this path."});const cols=tableColumns("seo_entries");const fields:Record<string,unknown>={page_type:"custom",seo_title:"",status:"published",is_indexable:1,robots:"index,follow",...p.fields};const insertable=Object.keys(fields).filter(c=>cols.has(c));const result=db.prepare(`INSERT INTO seo_entries (${insertable.map(quoteIdentifier).join(",")},created_at,updated_at) VALUES (${insertable.map(()=>"?").join(",")},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run(...insertable.map(c=>fields[c]));const id=Number(result.lastInsertRowid);const row=getRowById("seo_entries",id)||{};audit(req,currentUserId(res),"admin.seo.created","seo_entry",id,null,row);res.status(201).json({success:true,entry:row});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to create SEO entry."});}});
router.patch("/seo/:id",(req,res)=>{try{if(!requireTable(res,"seo_entries"))return;const id=asPositiveId(req.params.id);if(!id)return void res.status(400).json({success:false,error:"Invalid SEO id."});const old=getRowById("seo_entries",id);if(!old)return void res.status(404).json({success:false,error:"SEO entry not found."});const p=seoEntryPayload(req,true);if(p.error)return void res.status(400).json({success:false,error:p.error});const cols=tableColumns("seo_entries");const entries=Object.entries(p.fields).filter(([c])=>cols.has(c));if(!entries.length)return void res.status(400).json({success:false,error:"No supported SEO fields were supplied."});db.prepare(`UPDATE seo_entries SET ${entries.map(([c])=>`${quoteIdentifier(c)}=?`).join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...entries.map(([,v])=>v),id);const updated=getRowById("seo_entries",id)||{};audit(req,currentUserId(res),"admin.seo.updated","seo_entry",id,old,updated);res.json({success:true,entry:updated});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to update SEO entry."});}});
router.delete("/seo/:id",(req,res)=>{try{if(!requireTable(res,"seo_entries"))return;const id=asPositiveId(req.params.id);if(!id)return void res.status(400).json({success:false,error:"Invalid SEO id."});const old=getRowById("seo_entries",id);if(!old)return void res.status(404).json({success:false,error:"SEO entry not found."});db.prepare(`DELETE FROM seo_entries WHERE id=?`).run(id);audit(req,currentUserId(res),"admin.seo.deleted","seo_entry",id,old,null);res.json({success:true,deleted:true});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to delete SEO entry."});}});

function seoLocationPayload(req:Request,partial=false){const b=req.body||{};const f:Record<string,unknown>={};const has=(k:string)=>Object.prototype.hasOwnProperty.call(b,k);const idFields:Array<[string,string]>=[["seoEntryId","seo_entry_id"],["templateId","template_id"],["locationId","location_id"],["entityId","entity_id"]];for(const [input,col] of idFields)if(has(input))f[col]=asPositiveId(b[input]);if(!partial||has("locationLevel")){const s=normalizeText(b.locationLevel,40).toLowerCase();if(!["country","state","district","city","area"].includes(s))return{fields:f,error:"Invalid location level."};f.location_level=s}for(const [input,col,max] of [["catalogType","catalog_type",80],["pageKind","page_kind",80],["entityType","entity_type",100],["pageKey","page_key",250],["path","path",1500],["urlPattern","url_pattern",1500],["canonicalPath","canonical_path",1500],["primaryKeyword","primary_keyword",250],["generatedTitle","generated_title",300],["generatedDescription","generated_description",2500],["generatedH1","generated_h1",300],["generatedIntro","generated_intro",10000],["noindexReason","noindex_reason",500],["generationVersion","generation_version",80],["sitemapChangefreq","sitemap_changefreq",30]] as const)if(has(input))f[col]=col==="path"||col==="canonical_path"?pathOnly(b[input]):normalizeNullableText(b[input],max);if(has("keywordCluster"))f.keyword_cluster_json=jsonArray(b.keywordCluster);if(has("searchIntent"))f.search_intent_json=jsonArray(b.searchIntent);if(has("generatedFaq"))f.generated_faq_json=jsonArray(b.generatedFaq);if(has("generatedSchema"))f.generated_schema_json=jsonObject(b.generatedSchema);if(has("generatedBreadcrumb"))f.generated_breadcrumb_json=jsonArray(b.generatedBreadcrumb);if(has("generatedBody"))f.generated_body=normalizeNullableText(b.generatedBody,50000);if(has("listingCount"))f.listing_count=normalizeInteger(b.listingCount,0);if(has("minimumListingsToIndex"))f.minimum_listings_to_index=normalizeInteger(b.minimumListingsToIndex,0);if(has("isIndexable"))f.is_indexable=boolInt(b.isIndexable,true);if(has("status")){const s=statusText(b.status);if(!["draft","published","unpublished"].includes(s))return{fields:f,error:"Invalid SEO location page status."};f.status=s}if(has("priority"))f.priority=normalizeInteger(b.priority,0);return{fields:f};}
router.get("/seo-location-pages",(req,res)=>{try{if(!requireTable(res,"seo_location_pages")||!requireTable(res,"locations"))return;const {limit,offset}=parseListParams(req);const where:string[]=["1=1"];const params:unknown[]=[];const level=statusText(req.query.locationLevel);const entity=statusText(req.query.entityType);const location=asPositiveId(req.query.locationId);const status=statusText(req.query.status);if(level){where.push("slp.location_level=?");params.push(level)}if(entity){where.push("LOWER(slp.entity_type)=?");params.push(entity)}if(location){where.push("slp.location_id=?");params.push(location)}if(status){where.push("LOWER(slp.status)=?");params.push(status)}const rows=db.prepare(`SELECT slp.*,l.name location_name,l.type location_type FROM seo_location_pages slp JOIN locations l ON l.id=slp.location_id WHERE ${where.join(" AND ")} ORDER BY slp.priority DESC,slp.id DESC LIMIT ? OFFSET ?`).all(...params,limit,offset) as SqlRow[];const total=Number((db.prepare(`SELECT COUNT(*) value FROM seo_location_pages slp WHERE ${where.join(" AND ")}`).get(...params) as {value?:unknown}|undefined)?.value??0);res.json({success:true,pages:rows,seoLocationPages:rows,pagination:{limit,offset,total,totalPages:Math.ceil(total/limit)}});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load SEO location pages."});}});
router.post("/seo-location-pages",(req,res)=>{try{if(!requireTable(res,"seo_location_pages")||!requireTable(res,"locations"))return;const p=seoLocationPayload(req,false);if(p.error)return void res.status(400).json({success:false,error:p.error});const f=p.fields;if(!f.location_id||!f.location_level||!f.page_key||!f.path||f.path==="/")return void res.status(400).json({success:false,error:"locationId, locationLevel, pageKey and path are required."});if(!getRowById("locations",Number(f.location_id)))return void res.status(404).json({success:false,error:"Location not found."});if(db.prepare(`SELECT id FROM seo_location_pages WHERE page_key=? OR path=? LIMIT 1`).get(f.page_key,f.path))return void res.status(409).json({success:false,error:"SEO location page key or path already exists."});const cols=tableColumns("seo_location_pages");const fields:Record<string,unknown>={status:"draft",is_indexable:1,priority:0,...f};const insertable=Object.keys(fields).filter(c=>cols.has(c));const result=db.prepare(`INSERT INTO seo_location_pages (${insertable.map(quoteIdentifier).join(",")},created_at,updated_at) VALUES (${insertable.map(()=>"?").join(",")},CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run(...insertable.map(c=>fields[c]));const id=Number(result.lastInsertRowid);const row=getRowById("seo_location_pages",id)||{};audit(req,currentUserId(res),"admin.seo_location_page.created","seo_location_page",id,null,row);res.status(201).json({success:true,page:row});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to create SEO location page."});}});
router.patch("/seo-location-pages/:id",(req,res)=>{try{if(!requireTable(res,"seo_location_pages"))return;const id=asPositiveId(req.params.id);if(!id)return void res.status(400).json({success:false,error:"Invalid SEO location page id."});const old=getRowById("seo_location_pages",id);if(!old)return void res.status(404).json({success:false,error:"SEO location page not found."});const p=seoLocationPayload(req,true);if(p.error)return void res.status(400).json({success:false,error:p.error});const cols=tableColumns("seo_location_pages");const entries=Object.entries(p.fields).filter(([c])=>cols.has(c));if(!entries.length)return void res.status(400).json({success:false,error:"No supported SEO location fields were supplied."});db.prepare(`UPDATE seo_location_pages SET ${entries.map(([c])=>`${quoteIdentifier(c)}=?`).join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...entries.map(([,v])=>v),id);const updated=getRowById("seo_location_pages",id)||{};audit(req,currentUserId(res),"admin.seo_location_page.updated","seo_location_page",id,old,updated);res.json({success:true,page:updated});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to update SEO location page."});}});
router.delete("/seo-location-pages/:id",(req,res)=>{try{if(!requireTable(res,"seo_location_pages"))return;const id=asPositiveId(req.params.id);if(!id)return void res.status(400).json({success:false,error:"Invalid SEO location page id."});const old=getRowById("seo_location_pages",id);if(!old)return void res.status(404).json({success:false,error:"SEO location page not found."});db.prepare(`DELETE FROM seo_location_pages WHERE id=?`).run(id);audit(req,currentUserId(res),"admin.seo_location_page.deleted","seo_location_page",id,old,null);res.json({success:true,deleted:true});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to delete SEO location page."});}});

/* SEO content blocks / redirects / settings */
router.get("/seo/:seoId/blocks",(req,res)=>{try{if(!requireTable(res,"seo_content_blocks"))return;const id=asPositiveId(req.params.seoId);if(!id)return void res.status(400).json({success:false,error:"Invalid SEO id."});const rows=db.prepare(`SELECT * FROM seo_content_blocks WHERE seo_entry_id=? ORDER BY sort_order,id`).all(id) as SqlRow[];res.json({success:true,blocks:rows});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load SEO blocks."});}});
router.post("/seo/:seoId/blocks",(req,res)=>{try{if(!requireTable(res,"seo_content_blocks"))return;const seoId=asPositiveId(req.params.seoId);const key=normalizeText(req.body?.blockKey,150);const type=normalizeText(req.body?.blockType||"text",30).toLowerCase();if(!seoId||!key)return void res.status(400).json({success:false,error:"SEO id and blockKey are required."});if(!["heading","text","html","faq","list","image","cta","json"].includes(type))return void res.status(400).json({success:false,error:"Invalid SEO block type."});const r=db.prepare(`INSERT INTO seo_content_blocks (seo_entry_id,block_key,block_type,heading,content,content_json,sort_order,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?, ?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run(seoId,key,type,normalizeNullableText(req.body?.heading,300),normalizeNullableText(req.body?.content??req.body?.body,20000),jsonObject(req.body?.contentJson??req.body?.json),normalizeInteger(req.body?.sortOrder,0),boolInt(req.body?.isActive,true));const id=Number(r.lastInsertRowid);const row=getRowById("seo_content_blocks",id)||{};audit(req,currentUserId(res),"admin.seo_block.created","seo_content_block",id,null,row);res.status(201).json({success:true,block:row});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to create SEO content block."});}});
router.patch("/seo-blocks/:id",(req,res)=>{try{if(!requireTable(res,"seo_content_blocks"))return;const id=asPositiveId(req.params.id);if(!id)return void res.status(400).json({success:false,error:"Invalid SEO block id."});const old=getRowById("seo_content_blocks",id);if(!old)return void res.status(404).json({success:false,error:"SEO block not found."});const b=req.body||{};const up:string[]=[];const val:unknown[]=[];const map:Array<[string,string,number]>=[["blockKey","block_key",150],["blockType","block_type",30],["heading","heading",300],["content","content",20000]];for(const [input,col,max] of map)if(Object.prototype.hasOwnProperty.call(b,input)){let x=normalizeNullableText(b[input],max);if(col==="block_type")x=statusText(b[input]);if(col==="block_key")x=normalizeText(b[input],150);if(col==="block_type"&&!['heading','text','html','faq','list','image','cta','json'].includes(x||""))return void res.status(400).json({success:false,error:"Invalid SEO block type."});up.push(`${col}=?`);val.push(x)}if(Object.prototype.hasOwnProperty.call(b,"contentJson")){up.push("content_json=?");val.push(jsonObject(b.contentJson))}if(Object.prototype.hasOwnProperty.call(b,"sortOrder")){up.push("sort_order=?");val.push(normalizeInteger(b.sortOrder,0))}if(Object.prototype.hasOwnProperty.call(b,"isActive")){up.push("is_active=?");val.push(boolInt(b.isActive))}if(!up.length)return void res.status(400).json({success:false,error:"No supported SEO block fields were supplied."});up.push("updated_at=CURRENT_TIMESTAMP");val.push(id);db.prepare(`UPDATE seo_content_blocks SET ${up.join(",")} WHERE id=?`).run(...val);const updated=getRowById("seo_content_blocks",id)||{};audit(req,currentUserId(res),"admin.seo_block.updated","seo_content_block",id,old,updated);res.json({success:true,block:updated});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to update SEO content block."});}});
router.delete("/seo-blocks/:id",(req,res)=>{try{if(!requireTable(res,"seo_content_blocks"))return;const id=asPositiveId(req.params.id);if(!id)return void res.status(400).json({success:false,error:"Invalid SEO block id."});const old=getRowById("seo_content_blocks",id);if(!old)return void res.status(404).json({success:false,error:"SEO block not found."});db.prepare(`DELETE FROM seo_content_blocks WHERE id=?`).run(id);audit(req,currentUserId(res),"admin.seo_block.deleted","seo_content_block",id,old,null);res.json({success:true,deleted:true});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to delete SEO content block."});}});
router.get("/seo-redirects",(req,res)=>{try{if(!requireTable(res,"seo_redirects"))return;const {limit,offset}=parseListParams(req);const rows=db.prepare(`SELECT * FROM seo_redirects ORDER BY id DESC LIMIT ? OFFSET ?`).all(limit,offset) as SqlRow[];res.json({success:true,redirects:rows.map(r=>({...r,fromPath:r.source_path,toPath:r.target_path,note:r.notes})),pagination:{limit,offset}});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load SEO redirects."});}});
router.post("/seo-redirects",(req,res)=>{try{if(!requireTable(res,"seo_redirects"))return;const source=pathOnly(req.body?.sourcePath??req.body?.fromPath);const target=pathOnly(req.body?.targetPath??req.body?.toPath);const code=normalizeInteger(req.body?.statusCode,301);if(source==="/"||target==="/"||source===target||![301,302,307,308].includes(code))return void res.status(400).json({success:false,error:"Valid source, target and redirect status are required."});const r=db.prepare(`INSERT INTO seo_redirects (source_path,target_path,status_code,is_active,notes,created_at,updated_at) VALUES (?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`).run(source,target,code,boolInt(req.body?.isActive,true),normalizeNullableText(req.body?.notes??req.body?.note,1000));const id=Number(r.lastInsertRowid);const row=getRowById("seo_redirects",id)||{};audit(req,currentUserId(res),"admin.seo_redirect.created","seo_redirect",id,null,row);res.status(201).json({success:true,redirect:row});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to create SEO redirect."});}});
router.patch("/seo-redirects/:id",(req,res)=>{try{if(!requireTable(res,"seo_redirects"))return;const id=asPositiveId(req.params.id);if(!id)return void res.status(400).json({success:false,error:"Invalid redirect id."});const old=getRowById("seo_redirects",id);if(!old)return void res.status(404).json({success:false,error:"SEO redirect not found."});const b=req.body||{};const up:string[]=[];const val:unknown[]=[];if(Object.prototype.hasOwnProperty.call(b,"sourcePath")||Object.prototype.hasOwnProperty.call(b,"fromPath")){up.push("source_path=?");val.push(pathOnly(b.sourcePath??b.fromPath))}if(Object.prototype.hasOwnProperty.call(b,"targetPath")||Object.prototype.hasOwnProperty.call(b,"toPath")){up.push("target_path=?");val.push(pathOnly(b.targetPath??b.toPath))}if(Object.prototype.hasOwnProperty.call(b,"statusCode")){const c=normalizeInteger(b.statusCode,301);if(![301,302,307,308].includes(c))return void res.status(400).json({success:false,error:"Invalid redirect status code."});up.push("status_code=?");val.push(c)}if(Object.prototype.hasOwnProperty.call(b,"isActive")){up.push("is_active=?");val.push(boolInt(b.isActive))}if(Object.prototype.hasOwnProperty.call(b,"notes")||Object.prototype.hasOwnProperty.call(b,"note")){up.push("notes=?");val.push(normalizeNullableText(b.notes??b.note,1000))}if(!up.length)return void res.status(400).json({success:false,error:"No supported redirect fields were supplied."});up.push("updated_at=CURRENT_TIMESTAMP");val.push(id);db.prepare(`UPDATE seo_redirects SET ${up.join(",")} WHERE id=?`).run(...val);const updated=getRowById("seo_redirects",id)||{};audit(req,currentUserId(res),"admin.seo_redirect.updated","seo_redirect",id,old,updated);res.json({success:true,redirect:updated});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to update SEO redirect."});}});
router.delete("/seo-redirects/:id",(req,res)=>{try{if(!requireTable(res,"seo_redirects"))return;const id=asPositiveId(req.params.id);if(!id)return void res.status(400).json({success:false,error:"Invalid redirect id."});const old=getRowById("seo_redirects",id);if(!old)return void res.status(404).json({success:false,error:"SEO redirect not found."});db.prepare(`DELETE FROM seo_redirects WHERE id=?`).run(id);audit(req,currentUserId(res),"admin.seo_redirect.deleted","seo_redirect",id,old,null);res.json({success:true,deleted:true});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to delete SEO redirect."});}});
router.get("/seo-settings",(_req,res)=>{try{if(!requireTable(res,"seo_settings"))return;res.json({success:true,settings:db.prepare(`SELECT * FROM seo_settings ORDER BY id`).all()});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load SEO settings."});}});
router.patch("/seo-settings",(req,res)=>{try{if(!requireTable(res,"seo_settings"))return;const key=normalizeText(req.body?.settingKey??req.body?.key,150);if(!key)return void res.status(400).json({success:false,error:"settingKey is required."});const old=db.prepare(`SELECT * FROM seo_settings WHERE setting_key=? LIMIT 1`).get(key) as SqlRow|undefined;if(!old)return void res.status(404).json({success:false,error:"SEO setting not found."});const up:string[]=[];const val:unknown[]=[];if(Object.prototype.hasOwnProperty.call(req.body||{},"value")||Object.prototype.hasOwnProperty.call(req.body||{},"settingValue")){const v=req.body.value??req.body.settingValue;up.push("setting_value=?");val.push(typeof v==="string"?v:JSON.stringify(v))}if(Object.prototype.hasOwnProperty.call(req.body||{},"type")||Object.prototype.hasOwnProperty.call(req.body||{},"settingType")){up.push("setting_type=?");val.push(normalizeText(req.body.type??req.body.settingType,30))}if(Object.prototype.hasOwnProperty.call(req.body||{},"description")){up.push("description=?");val.push(normalizeNullableText(req.body.description,1000))}if(Object.prototype.hasOwnProperty.call(req.body||{},"isPublic")){up.push("is_public=?");val.push(boolInt(req.body.isPublic))}if(!up.length)return void res.status(400).json({success:false,error:"No supported SEO setting fields were supplied."});up.push("updated_at=CURRENT_TIMESTAMP");val.push(key);db.prepare(`UPDATE seo_settings SET ${up.join(",")} WHERE setting_key=?`).run(...val);const updated=db.prepare(`SELECT * FROM seo_settings WHERE setting_key=? LIMIT 1`).get(key) as SqlRow|undefined;audit(req,currentUserId(res),"admin.seo_settings.updated","seo_settings",Number(old.id??0),old,updated||null);res.json({success:true,setting:updated||null});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to update SEO settings."});}});

/* -------------------------------------------------------------------------
 * Locations / Forms / Settings / Audit
 * ---------------------------------------------------------------------- */

router.get("/locations",(req,res)=>{
  try{if(!requireTable(res,"locations"))return;const {limit,offset}=parseListParams(req);const type=statusText(req.query.type);const parent=asPositiveId(req.query.parentId);const search=normalizeText(req.query.search,150);const where:string[]=["1=1"];const params:unknown[]=[];if(["country","state","district","city","area"].includes(type)){where.push("type=?");params.push(type)}if(parent){where.push("parent_id=?");params.push(parent)}if(search){where.push("(name LIKE ? OR slug LIKE ? OR COALESCE(code,'') LIKE ?)");const p=`%${search}%`;params.push(p,p,p)}const rows=db.prepare(`SELECT id,parent_id,type,name,slug,code,state_code,district_code,city_code,country_code,canonical_name,latitude,longitude,timezone,country_id,state_id,district_id,city_id,seo_path,seo_enabled,sort_order,status,created_at,updated_at FROM locations WHERE ${where.join(" AND ")} ORDER BY type,name LIMIT ? OFFSET ?`).all(...params,limit,offset) as SqlRow[];const total=Number((db.prepare(`SELECT COUNT(*) value FROM locations WHERE ${where.join(" AND ")}`).get(...params) as {value?:unknown}|undefined)?.value??0);res.json({success:true,locations:rows,pagination:{limit,offset,total,totalPages:Math.ceil(total/limit)}});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load locations."});}
});
router.get("/locations/tree",(_req,res)=>{try{if(!requireTable(res,"locations"))return;const rows=db.prepare(`SELECT id,parent_id,type,name,slug,code,state_code,district_code,city_code,country_code,status FROM locations WHERE status<>'inactive' ORDER BY type,name`).all() as SqlRow[];const byParent=new Map<number|null,SqlRow[]>();for(const r of rows){const key=r.parent_id==null?null:Number(r.parent_id);const list=byParent.get(key)||[];list.push(r);byParent.set(key,list)}const build=(parent:number|null):SqlRow[]=>(byParent.get(parent)||[]).map(r=>({...r,children:build(Number(r.id))}));res.json({success:true,tree:build(null),count:rows.length});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load location tree."});}});

router.get("/form-submissions",(req,res)=>{try{if(!requireTable(res,"form_submissions"))return;const {limit,offset}=parseListParams(req);const cols=tableColumns("form_submissions");const where:string[]=["1=1"];const params:unknown[]=[];const formKey=normalizeText(req.query.formKey,150);const status=statusText(req.query.status);const entity=statusText(req.query.entityType);if(formKey&&cols.has("form_key")){where.push("form_key=?");params.push(formKey)}if(status&&cols.has("status")){where.push("status=?");params.push(status)}if(entity&&cols.has("entity_type")){where.push("LOWER(entity_type)=?");params.push(entity)}const search=normalizeText(req.query.search,180);if(search){const s=["submission_number","form_key","name","email","phone","whatsapp","country","state","district","city","page_path","landing_page"].filter(c=>cols.has(c));if(s.length){where.push(`(${s.map(c=>`${quoteIdentifier(c)} LIKE ?`).join(" OR ")})`);for(const _ of s)params.push(`%${search}%`)}}const ws=where.join(" AND ");const total=Number((db.prepare(`SELECT COUNT(*) value FROM form_submissions WHERE ${ws}`).get(...params) as {value?:unknown}|undefined)?.value??0);const order=cols.has("submitted_at")?"submitted_at DESC,id DESC":"id DESC";const rows=db.prepare(`SELECT * FROM form_submissions WHERE ${ws} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params,limit,offset) as SqlRow[];res.json({success:true,submissions:rows,formSubmissions:rows,pagination:{limit,offset,total,totalPages:Math.ceil(total/limit)}});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load form submissions."});}});
router.get("/form-submissions/:id",(req,res)=>{try{if(!requireTable(res,"form_submissions"))return;const id=asPositiveId(req.params.id);if(!id)return void res.status(400).json({success:false,error:"Invalid form submission id."});const submission=getRowById("form_submissions",id);if(!submission)return void res.status(404).json({success:false,error:"Form submission not found."});const lead=asPositiveId(submission.lead_id)&&tableExists("leads")?getRowById("leads",Number(submission.lead_id))||null:null;res.json({success:true,submission,lead});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load form submission."});}});

router.get("/settings",(_req,res)=>{try{if(!tableExists("settings"))return void res.json({success:true,settings:[]});res.json({success:true,settings:db.prepare(`SELECT * FROM settings ORDER BY id`).all()});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load settings."});}});
router.patch("/settings",(req,res)=>{try{if(!requireTable(res,"settings"))return;const key=normalizeText(req.body?.settingKey??req.body?.key,150);if(!key)return void res.status(400).json({success:false,error:"settingKey is required."});const old=db.prepare(`SELECT * FROM settings WHERE setting_key=? LIMIT 1`).get(key) as SqlRow|undefined;if(!old)return void res.status(404).json({success:false,error:"Setting not found."});const up:string[]=[];const val:unknown[]=[];if(Object.prototype.hasOwnProperty.call(req.body||{},"value")||Object.prototype.hasOwnProperty.call(req.body||{},"settingValue")){const v=req.body.value??req.body.settingValue;up.push("setting_value=?");val.push(typeof v==="string"?v:JSON.stringify(v))}if(Object.prototype.hasOwnProperty.call(req.body||{},"settingType")){up.push("setting_type=?");val.push(normalizeText(req.body.settingType,30))}if(Object.prototype.hasOwnProperty.call(req.body||{},"description")){up.push("description=?");val.push(normalizeNullableText(req.body.description,1000))}if(Object.prototype.hasOwnProperty.call(req.body||{},"isPublic")){up.push("is_public=?");val.push(boolInt(req.body.isPublic))}if(!up.length)return void res.status(400).json({success:false,error:"No supported setting fields were supplied."});up.push("updated_at=CURRENT_TIMESTAMP");val.push(key);db.prepare(`UPDATE settings SET ${up.join(",")} WHERE setting_key=?`).run(...val);const updated=db.prepare(`SELECT * FROM settings WHERE setting_key=? LIMIT 1`).get(key) as SqlRow|undefined;audit(req,currentUserId(res),"admin.settings.updated","setting",Number(old.id??0),old,updated||null);res.json({success:true,setting:updated||null});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to update setting."});}});

router.get("/audit-logs",(req,res)=>{try{if(!requireTable(res,"audit_logs"))return;const {limit,offset}=parseListParams(req);const actor=statusText(req.query.actorType);const action=normalizeText(req.query.action,150);const entityType=statusText(req.query.entityType);const where:string[]=["1=1"];const params:unknown[]=[];if(actor){where.push("actor_type=?");params.push(actor)}if(action){where.push("action LIKE ?");params.push(`%${action}%`)}if(entityType){where.push("entity_type=?");params.push(entityType)}const rows=db.prepare(`SELECT id,user_id,visitor_id,session_id,request_id,actor_type,action,entity_type,entity_id,old_data_json,new_data_json,ip_address,user_agent,created_at FROM audit_logs WHERE ${where.join(" AND ")} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params,limit,offset) as SqlRow[];const total=Number((db.prepare(`SELECT COUNT(*) value FROM audit_logs WHERE ${where.join(" AND ")}`).get(...params) as {value?:unknown}|undefined)?.value??0);res.json({success:true,logs:rows,auditLogs:rows,pagination:{limit,offset,total,totalPages:Math.ceil(total/limit)}});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load audit logs."});}});

/* -------------------------------------------------------------------------
 * Visitor analytics — date filters are actually applied to every metric.
 * ---------------------------------------------------------------------- */

function analyticsDateClause(column:string,req:Request):{sql:string;params:string[]} {
  const clauses:string[]=[];const params:string[]=[];const from=normalizeText(req.query.from??req.query.dateFrom,40);const to=normalizeText(req.query.to??req.query.dateTo,40);if(from){clauses.push(`${column}>=?`);params.push(from)}if(to){clauses.push(`${column}<=?`);params.push(to)}return{sql:clauses.length?` AND ${clauses.join(" AND ")}`:"",params};
}
router.get("/analytics/overview",(req,res)=>{try{if(!requireTable(res,"web_page_views"))return;const pv=analyticsDateClause("entered_at",req);const ev=analyticsDateClause("occurred_at",req);const vv=analyticsDateClause("created_at",req);const scalar=(table:string,where="1=1",params:unknown[]=[]):number=>tableExists(table)?Number((db.prepare(`SELECT COUNT(*) value FROM ${safeTableName(table)} WHERE ${where}`).get(...params) as {value?:unknown}|undefined)?.value??0):0;const visitors=tableExists("web_visitors")?scalar("web_visitors",`is_bot=0${vv.sql}`,vv.params):0;const sessions=tableExists("web_sessions")?scalar("web_sessions",`is_bot=0${analyticsDateClause("started_at",req).sql}`,analyticsDateClause("started_at",req).params):0;const pageViews=scalar("web_page_views",`is_bot=0${pv.sql}`,pv.params);const events=tableExists("web_events")?scalar("web_events",`1=1${ev.sql}`,ev.params):0;const conversions=tableExists("web_conversions")?scalar("web_conversions",`1=1${analyticsDateClause("created_at",req).sql}`,analyticsDateClause("created_at",req).params):0;const forms=tableExists("form_submissions")?scalar("form_submissions",`1=1${analyticsDateClause("submitted_at",req).sql}`,analyticsDateClause("submitted_at",req).params):0;const leads=tableExists("leads")?scalar("leads",`1=1${analyticsDateClause("created_at",req).sql}`,analyticsDateClause("created_at",req).params):0;const revenue=tableExists("payments")?Number((db.prepare(`SELECT COALESCE(SUM(amount),0) value FROM payments WHERE status IN ('paid','captured')${analyticsDateClause("paid_at",req).sql}`).get(...analyticsDateClause("paid_at",req).params) as {value?:unknown}|undefined)?.value??0):0;const topPages=db.prepare(`SELECT path,COUNT(*) views,COUNT(DISTINCT visitor_id) unique_visitors,COUNT(DISTINCT session_id) sessions,ROUND(AVG(duration_seconds),2) avg_duration_seconds,MAX(entered_at) last_viewed_at FROM web_page_views WHERE is_bot=0${pv.sql} GROUP BY path ORDER BY views DESC LIMIT 50`).all(...pv.params) as SqlRow[];const sources=db.prepare(`SELECT COALESCE(utm_source,'direct') source,COUNT(*) page_views,COUNT(DISTINCT visitor_id) unique_visitors FROM web_page_views WHERE is_bot=0${pv.sql} GROUP BY COALESCE(utm_source,'direct') ORDER BY page_views DESC LIMIT 50`).all(...pv.params) as SqlRow[];const locations=db.prepare(`SELECT COALESCE(country,'') country,COALESCE(state,'') state,COALESCE(district,'') district,COALESCE(city,'') city,COUNT(*) page_views,COUNT(DISTINCT visitor_id) unique_visitors FROM web_page_views WHERE is_bot=0${pv.sql} GROUP BY country,state,district,city ORDER BY unique_visitors DESC LIMIT 100`).all(...pv.params) as SqlRow[];res.json({success:true,filters:{from:req.query.from??req.query.dateFrom??null,to:req.query.to??req.query.dateTo??null},totals:{visitors,sessions,pageViews,events,conversions,formSubmissions:forms,leads,convertedLeads:tableExists("leads")?scalar("leads",`status='converted'${analyticsDateClause("created_at",req).sql}`,analyticsDateClause("created_at",req).params):0,revenue},topPages,sourceBreakdown:sources,locationBreakdown:locations});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load analytics overview."});}});
router.get("/analytics/pages",(req,res)=>{try{if(!requireTable(res,"web_page_views"))return;const limit=normalizeInteger(req.query.limit,50,1,500);const search=normalizeText(req.query.search,300);const df=analyticsDateClause("entered_at",req);const where:string[]=[`is_bot=0${df.sql}`];const params:unknown[]=[...df.params];if(search){where.push("path LIKE ?");params.push(`%${search}%`)}const rows=db.prepare(`SELECT path,page_type,COUNT(*) views,COUNT(DISTINCT visitor_id) unique_visitors,COUNT(DISTINCT session_id) sessions,ROUND(AVG(duration_seconds),2) avg_duration_seconds,ROUND(AVG(scroll_depth_percent),2) avg_scroll_depth_percent,SUM(click_count) clicks,SUM(interaction_count) interactions,SUM(CASE WHEN engaged=1 THEN 1 ELSE 0 END) engaged_views,MAX(entered_at) last_viewed_at FROM web_page_views WHERE ${where.join(" AND ")} GROUP BY path,page_type ORDER BY views DESC LIMIT ?`).all(...params,limit) as SqlRow[];res.json({success:true,pages:rows});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load page analytics."});}});
router.get("/analytics/events",(req,res)=>{try{if(!requireTable(res,"web_events"))return;const limit=normalizeInteger(req.query.limit,100,1,500);const df=analyticsDateClause("occurred_at",req);const rows=db.prepare(`SELECT event_name,event_category,target_type,COUNT(*) count,COUNT(DISTINCT visitor_id) unique_visitors,MAX(occurred_at) last_occurred_at FROM web_events WHERE 1=1${df.sql} GROUP BY event_name,event_category,target_type ORDER BY count DESC LIMIT ?`).all(...df.params,limit) as SqlRow[];res.json({success:true,events:rows});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load event analytics."});}});
router.get("/analytics/locations",(req,res)=>{try{if(!requireTable(res,"web_page_views"))return;const level=statusText(req.query.level);const selected = ({country:"country",state:"state",district:"district",city:"city"} as Record<string,string>)[level] || "city";const df=analyticsDateClause("entered_at",req);const rows=db.prepare(`SELECT COALESCE(${quoteIdentifier(selected)},'') location,COUNT(*) page_views,COUNT(DISTINCT visitor_id) unique_visitors,COUNT(DISTINCT session_id) sessions FROM web_page_views WHERE is_bot=0${df.sql} GROUP BY ${quoteIdentifier(selected)} ORDER BY unique_visitors DESC LIMIT ?`).all(...df.params,normalizeInteger(req.query.limit,100,1,500)) as SqlRow[];res.json({success:true,level:level||"city",locations:rows});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load location analytics."});}});
router.get("/analytics/daily",(req,res)=>{try{if(tableExists("analytics_daily_site_stats"))return void res.json({success:true,daily:db.prepare(`SELECT * FROM analytics_daily_site_stats ORDER BY date DESC LIMIT 90`).all(),source:"analytics_daily_site_stats"});if(requireTable(res,"web_page_views")){const df=analyticsDateClause("entered_at",req);const rows=db.prepare(`SELECT substr(entered_at,1,10) date,COUNT(*) page_views,COUNT(DISTINCT visitor_id) unique_visitors,COUNT(DISTINCT session_id) sessions,ROUND(AVG(duration_seconds),2) avg_duration_seconds FROM web_page_views WHERE is_bot=0${df.sql} GROUP BY substr(entered_at,1,10) ORDER BY date DESC LIMIT 90`).all(...df.params) as SqlRow[];return void res.json({success:true,daily:rows,source:"web_page_views"})}}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load daily analytics."});}});

/* -------------------------------------------------------------------------
 * Feature flags / schema health
 * ---------------------------------------------------------------------- */

router.get("/feature-flags",(_req,res)=>{res.json({success:true,flags:{premiumSubscriptions:Boolean(tableExists("subscription_plans")&&tableExists("subscription_plan_prices")&&(tableExists("pandit_subscriptions")||tableExists("temple_subscriptions")||tableExists("ashram_subscriptions"))),panditSubscriptions:tableExists("pandit_subscriptions"),templeSubscriptions:tableExists("temple_subscriptions"),ashramSubscriptions:tableExists("ashram_subscriptions"),subscriptionPlanPrices:tableExists("subscription_plan_prices"),payments:tableExists("payments"),paymentOrders:tableExists("payment_orders"),paymentLinks:tableExists("payment_links"),razorpay:Boolean(process.env.RAZORPAY_KEY_ID&&process.env.RAZORPAY_KEY_SECRET),seoManagement:Boolean(tableExists("seo_entries")&&tableExists("seo_location_pages")),pujaServices:tableExists("puja_services"),videoCatalogue:tableExists("videos"),visitorAnalytics:Boolean(tableExists("web_visitors")&&tableExists("web_sessions")&&tableExists("web_page_views")&&tableExists("web_events")),formCRM:Boolean(tableExists("form_submissions")&&tableExists("leads")),ashramManagerArchitecture:Boolean(tableExists("ashram_manager_profiles")&&tableExists("ashram_manager_assignments")),templeManagerArchitecture:Boolean(tableExists("temple_manager_profiles")&&tableExists("temple_manager_assignments"))}})});

const SCHEMA_TABLES=[
  "users","roles","permissions","role_permissions","sessions","password_reset_tokens","verification_tokens","auth_identities",
  "locations","location_aliases","visitor_profiles","pandit_profiles","pandit_service_offerings","pandit_verification_documents","pandit_subscriptions","subscription_plan_prices",
  "temples","temple_manager_profiles","temple_manager_assignments","ashrams","ashram_manager_profiles","ashram_manager_assignments","ashram_programs","ashram_courses","ashram_subscriptions",
  "puja_services","temple_puja_services","yatra_packages","yatra_package_locations","package_itineraries","spiritual_places","events","event_schedules","gallery_items","gallery_media","videos","courses","course_lessons","articles","live_streams",
  "form_definitions","form_submissions","contact_requests","puja_service_requests","pandit_booking_requests","temple_enquiry_requests","ashram_enquiry_requests","yatra_booking_requests","event_enquiry_requests","course_enquiry_requests",
  "leads","lead_capture_sessions","lead_capture_signals","lead_assignments","lead_events","lead_consents","lead_documents","lead_notes","lead_followups","lead_communications","lead_tags","lead_tag_map","bookings","sales_activities",
  "subscription_plans","subscription_events","payment_orders","payments","payment_links","payment_webhook_events",
  "web_visitors","web_sessions","web_page_views","web_events","analytics_goals","analytics_daily_page_stats","analytics_daily_site_stats","web_conversions",
  "seo_entries","seo_content_blocks","seo_redirects","seo_settings","seo_pages","seo_templates","seo_location_pages","seo_keywords","seo_internal_links","seo_url_health",
  "homepage_content","homepage_sections","homepage_stats","settings","audit_logs",
];

router.get("/schema-status",(_req,res)=>{try{const status=Object.fromEntries(SCHEMA_TABLES.map(t=>[t,tableExists(t)]));const missing=SCHEMA_TABLES.filter(t=>!status[t]);const roles=tableExists("roles")?(db.prepare(`SELECT code,public_registration_enabled,approval_required,dashboard_path,is_system,is_active FROM roles ORDER BY id`).all() as SqlRow[]):[];const permissions=tableExists("permissions")?(db.prepare(`SELECT COUNT(*) count FROM permissions`).get() as SqlRow):{};const rolePermissions=tableExists("role_permissions")?(db.prepare(`SELECT r.code role,COUNT(*) count FROM role_permissions rp JOIN roles r ON r.id=rp.role_id GROUP BY r.code ORDER BY r.id`).all() as SqlRow[]):[];res.json({success:true,database:"SQLite",status,summary:{available:SCHEMA_TABLES.length-missing.length,missing:missing.length,missingTables:missing},canonicalRoles:roles,permissionSummary:{permissions,rolePermissions},canonicalCommercialSchema:{subscriptionPlans:tableExists("subscription_plans"),subscriptionPlanPrices:tableExists("subscription_plan_prices"),panditSubscriptions:tableExists("pandit_subscriptions"),templeSubscriptions:tableExists("temple_subscriptions"),ashramSubscriptions:tableExists("ashram_subscriptions"),payments:tableExists("payments"),paymentOrders:tableExists("payment_orders"),paymentLinks:tableExists("payment_links")},razorpay:{configured:Boolean(process.env.RAZORPAY_KEY_ID&&process.env.RAZORPAY_KEY_SECRET),mode:normalizeText(process.env.RAZORPAY_MODE||"test",20).toLowerCase()==="live"?"live":"test"}});}catch(error){console.error(error);res.status(500).json({success:false,error:"Unable to load schema status."});}});

export default router;
