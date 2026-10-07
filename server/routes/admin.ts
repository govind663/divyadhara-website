/* eslint-disable @typescript-eslint/no-unused-vars */

import { randomBytes, scrypt } from "node:crypto";
import {
  Router,
  type Request,
  type Response,
} from "express";

import { db } from "../db/database.ts";
import {
  requireAuth,
  requireRole,
} from "./auth.ts";

/*
|--------------------------------------------------------------------------
| DivyaDhara — Super Admin API
|--------------------------------------------------------------------------
|
| Canonical Super Admin control plane.
|
| IMPORTANT ID RULE
| -----------------
|
| Pandit actions:
|   :id = pandit_profiles.id
|
| Temple Manager actions:
|   :id = temple_manager_profiles.id
|
| Ashram Manager actions:
|   :id = ashram_manager_profiles.id
|
| User actions:
|   :id = users.id
|
| Assignment actions:
|   :id = assignment.id
|
|--------------------------------------------------------------------------
*/

const router = Router();

router.use(
  requireAuth,
  requireRole("super_admin"),
);

/* ============================================================================
 * Types
 * ========================================================================== */

type JsonRecord = Record<string, unknown>;
type SqlRow = Record<string, unknown>;

type ListParams = {
  limit: number;
  offset: number;
};

type Audience =
  | "pandit"
  | "temple"
  | "ashram";

type ManagerRole =
  | "temple_manager"
  | "ashram_manager";

type SubscriptionStatus =
  | "pending"
  | "active"
  | "expired"
  | "cancelled"
  | "paused"
  | "payment_failed";

const AUDIENCES: readonly Audience[] = [
  "pandit",
  "temple",
  "ashram",
];

const SUBSCRIPTION_STATUSES: readonly SubscriptionStatus[] = [
  "pending",
  "active",
  "expired",
  "cancelled",
  "paused",
  "payment_failed",
];

const SEO_PAGE_TYPES = [
  "home",
  "listing",
  "detail",
  "pandit",
  "puja",
  "temple",
  "event",
  "gallery",
  "video",
  "ashram",
  "course",
  "package",
  "place",
  "custom",
] as const;

const PLAN_NAMES = [
  "Basic",
  "Premium",
] as const;

const BILLING_INTERVALS = [
  "monthly",
  "quarterly",
  "yearly",
  "custom",
] as const;

const LEAD_STATUSES = [
  "new",
  "qualified",
  "assigned",
  "contacted",
  "follow_up",
  "converted",
  "lost",
  "closed",
  "spam",
] as const;

const LEAD_PRIORITIES = [
  "low",
  "normal",
  "high",
  "urgent",
] as const;

const LEAD_TEMPERATURES = [
  "cold",
  "warm",
  "hot",
] as const;

/* ============================================================================
 * Generic Helpers
 * ========================================================================== */

function normalizeText(
  value: unknown,
  max = 500,
): string {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function normalizeNullableText(
  value: unknown,
  max = 500,
): string | null {
  const text = normalizeText(
    value,
    max,
  );

  return text || null;
}

function asPositiveId(
  value: unknown,
): number | null {
  const n = Number(value);

  return Number.isInteger(n) && n > 0
    ? n
    : null;
}

function normalizeInteger(
  value: unknown,
  fallback = 0,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): number {
  const n = Number(value);

  if (!Number.isFinite(n)) {
    return fallback;
  }

  return Math.min(
    max,
    Math.max(
      min,
      Math.floor(n),
    ),
  );
}

function normalizeMoney(
  value: unknown,
  fallback = 0,
): number {
  const n = Number(value);

  if (!Number.isFinite(n) || n < 0) {
    return fallback;
  }

  return Math.round(n * 100) / 100;
}

function normalizeBoolean(
  value: unknown,
  fallback = false,
): boolean {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  if (typeof value === "string") {
    const lower = value
      .trim()
      .toLowerCase();

    if (
      [
        "1",
        "true",
        "yes",
        "on",
      ].includes(lower)
    ) {
      return true;
    }

    if (
      [
        "0",
        "false",
        "no",
        "off",
      ].includes(lower)
    ) {
      return false;
    }
  }

  return fallback;
}

function boolInt(
  value: unknown,
  fallback = false,
): number {
  return normalizeBoolean(
    value,
    fallback,
  )
    ? 1
    : 0;
}

function parseListParams(
  req: Request,
): ListParams {
  return {
    limit: normalizeInteger(
      req.query.limit,
      50,
      1,
      200,
    ),
    offset: normalizeInteger(
      req.query.offset,
      0,
      0,
      100_000,
    ),
  };
}

function parseJsonArray(
  value: unknown,
): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return [];
  }

  try {
    const decoded = JSON.parse(value);

    return Array.isArray(decoded)
      ? decoded
      : [];
  } catch {
    return [];
  }
}

function jsonArray(
  value: unknown,
): string {
  return JSON.stringify(
    parseJsonArray(value),
  );
}

function jsonObject(
  value: unknown,
): string {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return JSON.stringify(value);
  }

  if (typeof value === "string") {
    try {
      const decoded = JSON.parse(value);

      return (
        decoded &&
        typeof decoded === "object" &&
        !Array.isArray(decoded)
      )
        ? JSON.stringify(decoded)
        : "{}";
    } catch {
      return "{}";
    }
  }

  return "{}";
}

function safeTableName(
  name: string,
): string {
  if (
    !/^[A-Za-z_][A-Za-z0-9_]*$/.test(
      name,
    )
  ) {
    throw new Error(
      "Unsafe SQL identifier.",
    );
  }

  return name;
}

function quoteIdentifier(
  name: string,
): string {
  return `"${name.replace(
    /"/g,
    '""',
  )}"`;
}

function tableExists(
  tableName: string,
): boolean {
  const table =
    safeTableName(tableName);

  const row =
    db.prepare(
      `
        SELECT name
        FROM sqlite_master
        WHERE type='table'
          AND name=?
        LIMIT 1
      `,
    ).get(table) as
      | {
          name?: string;
        }
      | undefined;

  return Boolean(row?.name);
}

function tableColumns(
  tableName: string,
): Set<string> {
  const table =
    safeTableName(tableName);

  if (!tableExists(table)) {
    return new Set();
  }

  const rows =
    db.prepare(
      `PRAGMA table_info(${table})`,
    ).all() as Array<{
      name?: string;
    }>;

  return new Set(
    rows
      .map((row) =>
        normalizeText(
          row.name,
          120,
        ),
      )
      .filter(Boolean),
  );
}

function firstExistingColumn(
  columns: Set<string>,
  candidates: string[],
): string | null {
  return (
    candidates.find((candidate) =>
      columns.has(candidate),
    ) ?? null
  );
}

function getRowById(
  tableName: string,
  id: number,
): SqlRow | undefined {
  const table =
    safeTableName(tableName);

  if (!tableExists(table)) {
    return undefined;
  }

  return db.prepare(
    `
      SELECT *
      FROM ${table}
      WHERE id=?
      LIMIT 1
    `,
  ).get(id) as
    | SqlRow
    | undefined;
}

function requireTable(
  res: Response,
  tableName: string,
): boolean {
  if (tableExists(tableName)) {
    return true;
  }

  res.status(503).json({
    success: false,
    error:
      `Required database table "${tableName}" is not available. Apply the current schema/migration first.`,
  });

  return false;
}

function currentUserId(
  res: Response,
): number {
  const id = Number(
    (
      res.locals.user as
        | {
            id?: unknown;
          }
        | undefined
    )?.id ?? 0,
  );

  return Number.isInteger(id) && id > 0
    ? id
    : 0;
}

function normalizeAudience(
  value: unknown,
): Audience | null {
  const audience =
    normalizeText(
      value,
      30,
    ).toLowerCase() as Audience;

  return AUDIENCES.includes(
    audience,
  )
    ? audience
    : null;
}

function normalizeSubscriptionStatus(
  value: unknown,
): SubscriptionStatus | null {
  const status =
    normalizeText(
      value,
      40,
    ).toLowerCase() as SubscriptionStatus;

  return SUBSCRIPTION_STATUSES.includes(
    status,
  )
    ? status
    : null;
}

function normalizeBillingInterval(
  value: unknown,
): string {
  const interval =
    normalizeText(
      value || "monthly",
      20,
    ).toLowerCase();

  return BILLING_INTERVALS.includes(
    interval as (typeof BILLING_INTERVALS)[number],
  )
    ? interval
    : "monthly";
}

function pathOnly(
  value: unknown,
): string {
  const path =
    normalizeText(value, 2000);

  if (!path) {
    return "/";
  }

  return path.startsWith("/")
    ? path
    : `/${path}`;
}

function statusText(
  value: unknown,
): string {
  return normalizeText(
    value,
    50,
  ).toLowerCase();
}

/* ============================================================================
 * Audit Security
 * ========================================================================== */

function sanitizeAuditValue(
  value: unknown,
  depth = 0,
): unknown {
  if (depth > 6) {
    return "[truncated]";
  }

  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      sanitizeAuditValue(
        item,
        depth + 1,
      ),
    );
  }

  if (
    typeof value === "object"
  ) {
    const source =
      value as Record<
        string,
        unknown
      >;

    const output: Record<
      string,
      unknown
    > = {};

    for (const [
      key,
      rawValue,
    ] of Object.entries(source)) {
      const normalized =
        key
          .trim()
          .toLowerCase()
          .replace(
            /[-\s]/g,
            "_",
          );

      const sensitive =
        normalized.includes(
          "password",
        ) ||
        normalized.includes(
          "token",
        ) ||
        normalized.includes(
          "secret",
        ) ||
        normalized.includes(
          "private_key",
        ) ||
        normalized.includes(
          "api_key",
        ) ||
        normalized.includes(
          "access_key",
        ) ||
        normalized.includes(
          "refresh_token",
        ) ||
        normalized.includes("otp") ||
        normalized.includes(
          "authorization",
        );

      output[key] = sensitive
        ? "[redacted]"
        : sanitizeAuditValue(
            rawValue,
            depth + 1,
          );
    }

    return output;
  }

  return String(value);
}

function audit(
  req: Request,
  actorId: number,
  action: string,
  entityType: string,
  entityId: number | null,
  oldData:
    | JsonRecord
    | SqlRow
    | null,
  newData:
    | JsonRecord
    | SqlRow
    | null,
): void {
  if (!tableExists("audit_logs")) {
    return;
  }

  try {
    const columns =
      tableColumns("audit_logs");

    const oldSafe =
      oldData
        ? sanitizeAuditValue(oldData)
        : null;

    const newSafe =
      newData
        ? sanitizeAuditValue(newData)
        : null;

    const values: Record<
      string,
      unknown
    > = {};

    if (columns.has("user_id")) {
      values.user_id =
        actorId || null;
    }

    if (columns.has("visitor_id")) {
      values.visitor_id = null;
    }

    if (columns.has("session_id")) {
      values.session_id = null;
    }

    if (columns.has("request_id")) {
      values.request_id =
        normalizeNullableText(
          req.get(
            "x-request-id",
          ),
          200,
        );
    }

    if (columns.has("actor_type")) {
      values.actor_type =
        "super_admin";
    }

    if (columns.has("action")) {
      values.action =
        normalizeText(
          action,
          150,
        );
    }

    if (columns.has("entity_type")) {
      values.entity_type =
        normalizeText(
          entityType,
          100,
        );
    }

    if (columns.has("entity_id")) {
      values.entity_id = entityId;
    }

    if (columns.has("old_data_json")) {
      values.old_data_json =
        oldSafe
          ? JSON.stringify(oldSafe)
          : null;
    }

    if (columns.has("new_data_json")) {
      values.new_data_json =
        newSafe
          ? JSON.stringify(newSafe)
          : null;
    }

    if (columns.has("ip_address")) {
      values.ip_address =
        req.ip || null;
    }

    if (columns.has("user_agent")) {
      values.user_agent =
        normalizeNullableText(
          req.get(
            "user-agent",
          ),
          1000,
        );
    }

    const entries =
      Object.entries(values);

    if (!entries.length) {
      return;
    }

    const columnSql =
      entries
        .map(([column]) =>
          quoteIdentifier(column),
        )
        .join(",");

    const placeholderSql =
      entries
        .map(() => "?")
        .join(",");

    const hasCreatedAt =
      columns.has("created_at");

    const createdColumnSql =
      hasCreatedAt
        ? `,${quoteIdentifier(
            "created_at",
          )}`
        : "";

    const createdValueSql =
      hasCreatedAt
        ? ",CURRENT_TIMESTAMP"
        : "";

    db.prepare(`
      INSERT INTO audit_logs (
        ${columnSql}${createdColumnSql}
      )
      VALUES (
        ${placeholderSql}${createdValueSql}
      )
    `).run(
      ...entries.map(
        ([, value]) => value,
      ),
    );
  } catch (error) {
    console.error(
      "Admin audit log error:",
      error,
    );
  }
}

function maskSecret(
  value: unknown,
): string | null {
  const text =
    normalizeText(
      value,
      300,
    );

  if (!text) {
    return null;
  }

  if (text.length <= 8) {
    return "••••••••";
  }

  return `${text.slice(
    0,
    4,
  )}••••${text.slice(-4)}`;
}

function validateRejectionReason(
  value: unknown,
): string | null {
  const reason =
    normalizeText(
      value,
      1000,
    );

  return reason.length >= 5
    ? reason
    : null;
}

function getUserRoleById(
  userId: number,
): string | null {
  if (
    !tableExists("users") ||
    !tableExists("roles")
  ) {
    return null;
  }

  const row =
    db.prepare(`
      SELECT
        r.code AS role
      FROM users u
      JOIN roles r
        ON r.id=u.role_id
      WHERE u.id=?
      LIMIT 1
    `).get(userId) as
      | {
          role?: string;
        }
      | undefined;

  return row?.role
    ? normalizeText(
        row.role,
        50,
      ).toLowerCase()
    : null;
}

/* ============================================================================
 * Dashboard
 * ========================================================================== */

router.get(
  "/dashboard",
  (_req, res) => {
    try {
      /*
       * ----------------------------------------------------------------------
       * Dashboard must remain resilient when optional analytics columns are
       * unavailable in an older/legacy SQLite database.
       *
       * Core business tables are counted when present.
       * Optional analytics fields are detected dynamically.
       * Missing metrics return safe zero/empty values instead of causing a
       * complete dashboard 500.
       * ----------------------------------------------------------------------
       */

      const columnCache =
        new Map<string, Set<string>>();

      const getColumns = (
        tableName: string,
      ): Set<string> => {
        const cached =
          columnCache.get(
            tableName,
          );

        if (cached) {
          return cached;
        }

        const columns =
          tableExists(tableName)
            ? tableColumns(tableName)
            : new Set<string>();

        columnCache.set(
          tableName,
          columns,
        );

        return columns;
      };

      const hasColumn = (
        tableName: string,
        columnName: string,
      ): boolean =>
        getColumns(
          tableName,
        ).has(columnName);

      /*
       * Safe COUNT helper.
       */
      const scalar = (
        sql: string,
        ...params: unknown[]
      ): number => {
        const row =
          db.prepare(sql).get(
            ...params,
          ) as
            | {
                value?: unknown;
              }
            | undefined;

        const value =
          Number(
            row?.value ?? 0,
          );

        return Number.isFinite(
          value,
        )
          ? value
          : 0;
      };

      /*
       * COUNT(*) for a table with an optional WHERE clause.
       */
      const countTable = (
        tableName: string,
        whereSql = "1=1",
        params: unknown[] = [],
      ): number =>
        tableExists(tableName)
          ? scalar(
              `
                SELECT COUNT(*) AS value
                FROM ${safeTableName(
                  tableName,
                )}
                WHERE ${whereSql}
              `,
              ...params,
            )
          : 0;

      /*
       * Non-bot filter.
       *
       * Some deployments have is_bot, some older deployments do not.
       */
      const nonBotWhere = (
        tableName: string,
      ): string =>
        hasColumn(
          tableName,
          "is_bot",
        )
          ? "is_bot=0"
          : "1=1";

      /*
       * ----------------------------------------------------------------------
       * Core statistics
       * ----------------------------------------------------------------------
       */

      const stats = {
        users:
          countTable("users"),

        activeUsers:
          countTable(
            "users",
            "status='active'",
          ),

        pendingUsers:
          countTable(
            "users",
            "status='pending'",
          ),

        blockedUsers:
          countTable(
            "users",
            "status='blocked'",
          ),

        visitors:
          countTable(
            "web_visitors",
            nonBotWhere(
              "web_visitors",
            ),
          ),

        sessions:
          countTable(
            "web_sessions",
            nonBotWhere(
              "web_sessions",
            ),
          ),

        pageViews:
          countTable(
            "web_page_views",
            nonBotWhere(
              "web_page_views",
            ),
          ),

        microEvents:
          countTable(
            "web_events",
          ),

        conversions:
          countTable(
            "web_conversions",
          ),

        formSubmissions:
          countTable(
            "form_submissions",
          ),

        pandits:
          countTable(
            "pandit_profiles",
          ),

        pendingPandits:
          tableExists(
            "pandit_profiles",
          )
            ? countTable(
                "pandit_profiles",
                [
                  hasColumn(
                    "pandit_profiles",
                    "profile_status",
                  )
                    ? "profile_status='pending'"
                    : null,
                  hasColumn(
                    "pandit_profiles",
                    "verification_status",
                  )
                    ? "verification_status='pending'"
                    : null,
                ]
                  .filter(
                    Boolean,
                  )
                  .length > 0
                    ? `(${[
                        hasColumn(
                          "pandit_profiles",
                          "profile_status",
                        )
                          ? "profile_status='pending'"
                          : null,
                        hasColumn(
                          "pandit_profiles",
                          "verification_status",
                        )
                          ? "verification_status='pending'"
                          : null,
                      ]
                        .filter(
                          Boolean,
                        )
                        .join(
                          " OR ",
                        )})`
                    : "1=0",
              )
            : 0,

        templeManagers:
          countTable(
            "temple_manager_profiles",
          ),

        pendingTempleManagers:
          tableExists(
            "temple_manager_profiles",
          ) &&
          tableExists(
            "users",
          ) &&
          tableExists(
            "roles",
          )
            ? (() => {
                const profileColumns =
                  getColumns(
                    "temple_manager_profiles",
                  );

                const pendingConditions =
                  [
                    profileColumns.has(
                      "verification_status",
                    )
                      ? "tmp.verification_status='pending'"
                      : null,

                    "u.status='pending'",
                  ].filter(
                    Boolean,
                  );

                return scalar(
                  `
                    SELECT COUNT(*) AS value
                    FROM temple_manager_profiles tmp
                    JOIN users u
                      ON u.id=tmp.user_id
                    JOIN roles r
                      ON r.id=u.role_id
                    WHERE r.code='temple_manager'
                      AND (
                        ${pendingConditions.join(
                          " OR ",
                        )}
                      )
                  `,
                );
              })()
            : 0,

        ashramManagers:
          countTable(
            "ashram_manager_profiles",
          ),

        pendingAshramManagers:
          tableExists(
            "ashram_manager_profiles",
          ) &&
          tableExists(
            "users",
          ) &&
          tableExists(
            "roles",
          )
            ? (() => {
                const profileColumns =
                  getColumns(
                    "ashram_manager_profiles",
                  );

                const pendingConditions =
                  [
                    profileColumns.has(
                      "verification_status",
                    )
                      ? "amp.verification_status='pending'"
                      : null,

                    "u.status='pending'",
                  ].filter(
                    Boolean,
                  );

                return scalar(
                  `
                    SELECT COUNT(*) AS value
                    FROM ashram_manager_profiles amp
                    JOIN users u
                      ON u.id=amp.user_id
                    JOIN roles r
                      ON r.id=u.role_id
                    WHERE r.code='ashram_manager'
                      AND (
                        ${pendingConditions.join(
                          " OR ",
                        )}
                      )
                  `,
                );
              })()
            : 0,

        temples:
          countTable(
            "temples",
          ),

        publishedTemples:
          hasColumn(
            "temples",
            "status",
          )
            ? countTable(
                "temples",
                "status='published'",
              )
            : 0,

        ashrams:
          countTable(
            "ashrams",
          ),

        publishedAshrams:
          hasColumn(
            "ashrams",
            "status",
          )
            ? countTable(
                "ashrams",
                "status='published'",
              )
            : 0,

        leads:
          countTable(
            "leads",
          ),

        openLeads:
          hasColumn(
            "leads",
            "status",
          )
            ? countTable(
                "leads",
                `
                  status IN (
                    'new',
                    'qualified',
                    'assigned',
                    'contacted',
                    'follow_up'
                  )
                `,
              )
            : 0,

        convertedLeads:
          hasColumn(
            "leads",
            "status",
          )
            ? countTable(
                "leads",
                "status='converted'",
              )
            : 0,

        plans:
          countTable(
            "subscription_plans",
          ),

        planPrices:
          countTable(
            "subscription_plan_prices",
          ),

        activeSubscriptions:
          (
            hasColumn(
              "pandit_subscriptions",
              "status",
            )
              ? countTable(
                  "pandit_subscriptions",
                  "status='active'",
                )
              : 0
          ) +
          (
            hasColumn(
              "temple_subscriptions",
              "status",
            )
              ? countTable(
                  "temple_subscriptions",
                  "status='active'",
                )
              : 0
          ) +
          (
            hasColumn(
              "ashram_subscriptions",
              "status",
            )
              ? countTable(
                  "ashram_subscriptions",
                  "status='active'",
                )
              : 0
          ),

        revenue:
          tableExists(
            "payments",
          ) &&
          hasColumn(
            "payments",
            "amount",
          )
            ? scalar(`
                SELECT COALESCE(
                  SUM(amount),
                  0
                ) AS value
                FROM payments
                ${
                  hasColumn(
                    "payments",
                    "status",
                  )
                    ? `
                      WHERE status IN (
                        'paid',
                        'captured'
                      )
                    `
                    : ""
                }
              `)
            : 0,

        seoEntries:
          countTable(
            "seo_entries",
          ),

        seoLocationPages:
          countTable(
            "seo_location_pages",
          ),

        auditLogs:
          countTable(
            "audit_logs",
          ),
      };

      /*
       * ----------------------------------------------------------------------
       * Role counts
       * ----------------------------------------------------------------------
       */

      const roleCounts: Record<
        string,
        number
      > = {};

      if (
        tableExists(
          "users",
        ) &&
        tableExists(
          "roles",
        )
      ) {
        const rows =
          db.prepare(`
            SELECT
              r.code AS role,
              COUNT(u.id) AS count
            FROM roles r
            LEFT JOIN users u
              ON u.role_id=r.id
            GROUP BY
              r.id,
              r.code
            ORDER BY r.id
          `).all() as Array<{
            role?: string;
            count?: unknown;
          }>;

        for (
          const row of rows
        ) {
          const role =
            normalizeText(
              row.role,
              80,
            );

          if (!role) {
            continue;
          }

          roleCounts[role] =
            Number(
              row.count ?? 0,
            ) || 0;
        }
      }

      /*
       * ----------------------------------------------------------------------
       * Approval queue
       * ----------------------------------------------------------------------
       */

      const approvalQueue = {
        pendingPandits:
          tableExists(
            "pandit_profiles",
          ) &&
          tableExists(
            "users",
          )
            ? (() => {
                const pColumns =
                  getColumns(
                    "pandit_profiles",
                  );

                const uColumns =
                  getColumns(
                    "users",
                  );

                const select = [
                  "p.id",
                  pColumns.has(
                    "user_id",
                  )
                    ? "p.user_id"
                    : "NULL AS user_id",
                  pColumns.has(
                    "slug",
                  )
                    ? "p.slug"
                    : "NULL AS slug",
                  pColumns.has(
                    "display_name",
                  )
                    ? "p.display_name"
                    : "NULL AS display_name",
                  pColumns.has(
                    "title",
                  )
                    ? "p.title"
                    : "NULL AS title",
                  pColumns.has(
                    "city",
                  )
                    ? "p.city"
                    : "NULL AS city",
                  pColumns.has(
                    "district",
                  )
                    ? "p.district"
                    : "NULL AS district",
                  pColumns.has(
                    "state",
                  )
                    ? "p.state"
                    : "NULL AS state",
                  pColumns.has(
                    "profile_status",
                  )
                    ? "p.profile_status"
                    : "NULL AS profile_status",
                  pColumns.has(
                    "verification_status",
                  )
                    ? "p.verification_status"
                    : "NULL AS verification_status",
                  pColumns.has(
                    "featured",
                  )
                    ? "p.featured"
                    : "NULL AS featured",
                  pColumns.has(
                    "listing_active",
                  )
                    ? "p.listing_active"
                    : "NULL AS listing_active",
                  pColumns.has(
                    "rejection_reason",
                  )
                    ? "p.rejection_reason"
                    : "NULL AS rejection_reason",

                  uColumns.has(
                    "name",
                  )
                    ? "u.name AS account_name"
                    : "NULL AS account_name",

                  uColumns.has(
                    "email",
                  )
                    ? "u.email"
                    : "NULL AS email",

                  uColumns.has(
                    "phone",
                  )
                    ? "u.phone"
                    : "NULL AS phone",

                  uColumns.has(
                    "status",
                  )
                    ? "u.status AS account_status"
                    : "NULL AS account_status",
                ];

                const pendingConditions =
                  [
                    pColumns.has(
                      "profile_status",
                    )
                      ? "p.profile_status='pending'"
                      : null,
                    pColumns.has(
                      "verification_status",
                    )
                      ? "p.verification_status='pending'"
                      : null,
                  ].filter(
                    Boolean,
                  );

                if (
                  pendingConditions.length ===
                  0
                ) {
                  return [];
                }

                return db.prepare(`
                  SELECT
                    ${select.join(",")}
                  FROM pandit_profiles p
                  JOIN users u
                    ON u.id=p.user_id
                  WHERE
                    ${pendingConditions.join(
                      " OR ",
                    )}
                  ORDER BY p.id DESC
                  LIMIT 25
                `).all() as SqlRow[];
              })()
            : [],

        pendingTempleManagers:
          tableExists(
            "temple_manager_profiles",
          ) &&
          tableExists(
            "users",
          ) &&
          tableExists(
            "roles",
          )
            ? (() => {
                const pColumns =
                  getColumns(
                    "temple_manager_profiles",
                  );

                const uColumns =
                  getColumns(
                    "users",
                  );

                const select = [
                  "tmp.id AS manager_id",
                  pColumns.has(
                    "user_id",
                  )
                    ? "tmp.user_id"
                    : "NULL AS user_id",
                  pColumns.has(
                    "designation",
                  )
                    ? "tmp.designation"
                    : "NULL AS designation",
                  pColumns.has(
                    "organization_name",
                  )
                    ? "tmp.organization_name"
                    : "NULL AS organization_name",
                  pColumns.has(
                    "verification_status",
                  )
                    ? "tmp.verification_status"
                    : "NULL AS verification_status",
                  pColumns.has(
                    "rejection_reason",
                  )
                    ? "tmp.rejection_reason"
                    : "NULL AS rejection_reason",

                  uColumns.has(
                    "name",
                  )
                    ? "u.name"
                    : "NULL AS name",

                  uColumns.has(
                    "email",
                  )
                    ? "u.email"
                    : "NULL AS email",

                  uColumns.has(
                    "phone",
                  )
                    ? "u.phone"
                    : "NULL AS phone",

                  uColumns.has(
                    "city",
                  )
                    ? "u.city"
                    : "NULL AS city",

                  uColumns.has(
                    "state",
                  )
                    ? "u.state"
                    : "NULL AS state",

                  uColumns.has(
                    "status",
                  )
                    ? "u.status"
                    : "NULL AS status",
                ];

                const pendingConditions =
                  [
                    pColumns.has(
                      "verification_status",
                    )
                      ? "tmp.verification_status='pending'"
                      : null,

                    uColumns.has(
                      "status",
                    )
                      ? "u.status='pending'"
                      : null,
                  ].filter(
                    Boolean,
                  );

                if (
                  pendingConditions.length ===
                  0
                ) {
                  return [];
                }

                return db.prepare(`
                  SELECT
                    ${select.join(",")}
                  FROM temple_manager_profiles tmp
                  JOIN users u
                    ON u.id=tmp.user_id
                  JOIN roles r
                    ON r.id=u.role_id
                  WHERE
                    r.code='temple_manager'
                    AND (
                      ${pendingConditions.join(
                        " OR ",
                      )}
                    )
                  ORDER BY tmp.id DESC
                  LIMIT 25
                `).all() as SqlRow[];
              })()
            : [],

        pendingAshramManagers:
          tableExists(
            "ashram_manager_profiles",
          ) &&
          tableExists(
            "users",
          ) &&
          tableExists(
            "roles",
          )
            ? (() => {
                const pColumns =
                  getColumns(
                    "ashram_manager_profiles",
                  );

                const uColumns =
                  getColumns(
                    "users",
                  );

                const select = [
                  "amp.id AS manager_id",
                  pColumns.has(
                    "user_id",
                  )
                    ? "amp.user_id"
                    : "NULL AS user_id",
                  pColumns.has(
                    "designation",
                  )
                    ? "amp.designation"
                    : "NULL AS designation",
                  pColumns.has(
                    "organization_name",
                  )
                    ? "amp.organization_name"
                    : "NULL AS organization_name",
                  pColumns.has(
                    "verification_status",
                  )
                    ? "amp.verification_status"
                    : "NULL AS verification_status",
                  pColumns.has(
                    "rejection_reason",
                  )
                    ? "amp.rejection_reason"
                    : "NULL AS rejection_reason",

                  uColumns.has(
                    "name",
                  )
                    ? "u.name"
                    : "NULL AS name",

                  uColumns.has(
                    "email",
                  )
                    ? "u.email"
                    : "NULL AS email",

                  uColumns.has(
                    "phone",
                  )
                    ? "u.phone"
                    : "NULL AS phone",

                  uColumns.has(
                    "city",
                  )
                    ? "u.city"
                    : "NULL AS city",

                  uColumns.has(
                    "state",
                  )
                    ? "u.state"
                    : "NULL AS state",

                  uColumns.has(
                    "status",
                  )
                    ? "u.status"
                    : "NULL AS status",
                ];

                const pendingConditions =
                  [
                    pColumns.has(
                      "verification_status",
                    )
                      ? "amp.verification_status='pending'"
                      : null,

                    uColumns.has(
                      "status",
                    )
                      ? "u.status='pending'"
                      : null,
                  ].filter(
                    Boolean,
                  );

                if (
                  pendingConditions.length ===
                  0
                ) {
                  return [];
                }

                return db.prepare(`
                  SELECT
                    ${select.join(",")}
                  FROM ashram_manager_profiles amp
                  JOIN users u
                    ON u.id=amp.user_id
                  JOIN roles r
                    ON r.id=u.role_id
                  WHERE
                    r.code='ashram_manager'
                    AND (
                      ${pendingConditions.join(
                        " OR ",
                      )}
                    )
                  ORDER BY amp.id DESC
                  LIMIT 25
                `).all() as SqlRow[];
              })()
            : [],
      };

      /*
       * ----------------------------------------------------------------------
       * Top pages
       * ----------------------------------------------------------------------
       */

      const topPages =
        tableExists(
          "web_page_views",
        )
          ? (() => {
              const columns =
                getColumns(
                  "web_page_views",
                );

              const pathExpression =
                columns.has("path")
                  ? "path"
                  : "''";

              const visitorExpression =
                columns.has(
                  "visitor_id",
                )
                  ? "visitor_id"
                  : null;

              const durationExpression =
                columns.has(
                  "duration_seconds",
                )
                  ? "duration_seconds"
                  : null;

              const enteredExpression =
                columns.has(
                  "entered_at",
                )
                  ? "entered_at"
                  : null;

              const viewFilter =
                nonBotWhere(
                  "web_page_views",
                );

              const uniqueVisitorsSelect =
                visitorExpression
                  ? `COUNT(DISTINCT ${quoteIdentifier(
                      visitorExpression,
                    )}) unique_visitors`
                  : "0 unique_visitors";

              const averageDurationSelect =
                durationExpression
                  ? `ROUND(AVG(${quoteIdentifier(
                      durationExpression,
                    )}),2) avg_duration_seconds`
                  : "0 avg_duration_seconds";

              const lastViewedSelect =
                enteredExpression
                  ? `MAX(${quoteIdentifier(
                      enteredExpression,
                    )}) last_viewed_at`
                  : "NULL last_viewed_at";

              return db.prepare(`
                SELECT
                  ${pathExpression} AS path,
                  COUNT(*) AS views,
                  ${uniqueVisitorsSelect},
                  ${averageDurationSelect},
                  ${lastViewedSelect}
                FROM web_page_views
                WHERE ${viewFilter}
                GROUP BY ${pathExpression}
                ORDER BY views DESC
                LIMIT 20
              `).all() as SqlRow[];
            })()
          : [];

      /*
       * ----------------------------------------------------------------------
       * Top locations
       * ----------------------------------------------------------------------
       */

      const topLocations =
        tableExists(
          "web_page_views",
        )
          ? (() => {
              const columns =
                getColumns(
                  "web_page_views",
                );

              const locationFields =
                [
                  "country",
                  "state",
                  "district",
                  "city",
                ];

              const locationExpressions =
                locationFields.map(
                  (field) =>
                    columns.has(field)
                      ? `COALESCE(${quoteIdentifier(
                          field,
                        )},'') AS ${quoteIdentifier(
                          field,
                        )}`
                      : `'' AS ${quoteIdentifier(
                          field,
                        )}`,
                );

              const groupExpressions =
                locationFields.map(
                  (field) =>
                    columns.has(field)
                      ? quoteIdentifier(
                          field,
                        )
                      : "''",
                );

              const uniqueVisitorsSelect =
                columns.has(
                  "visitor_id",
                )
                  ? "COUNT(DISTINCT visitor_id) unique_visitors"
                  : "0 unique_visitors";

              return db.prepare(`
                SELECT
                  ${locationExpressions.join(",")},
                  COUNT(*) page_views,
                  ${uniqueVisitorsSelect}
                FROM web_page_views
                WHERE ${nonBotWhere(
                  "web_page_views",
                )}
                GROUP BY
                  ${groupExpressions.join(
                    ",",
                  )}
                ORDER BY
                  unique_visitors DESC
                LIMIT 20
              `).all() as SqlRow[];
            })()
          : [];

      /*
       * ----------------------------------------------------------------------
       * Recent audit activity
       * ----------------------------------------------------------------------
       */

      const recentActivity =
        tableExists(
          "audit_logs",
        )
          ? (() => {
              const columns =
                getColumns(
                  "audit_logs",
                );

              const fields = [
                "id",
                "user_id",
                "visitor_id",
                "session_id",
                "request_id",
                "actor_type",
                "action",
                "entity_type",
                "entity_id",
                "old_data_json",
                "new_data_json",
                "ip_address",
                "user_agent",
                "created_at",
              ];

              const select =
                fields.map(
                  (field) =>
                    columns.has(field)
                      ? quoteIdentifier(
                          field,
                        )
                      : `NULL AS ${quoteIdentifier(
                          field,
                        )}`,
                );

              return db.prepare(`
                SELECT
                  ${select.join(",")}
                FROM audit_logs
                ORDER BY id DESC
                LIMIT 25
              `).all() as SqlRow[];
            })()
          : [];

      /*
       * ----------------------------------------------------------------------
       * Payment / subscription feature health
       * ----------------------------------------------------------------------
       */

      const razorpayConfigured =
        Boolean(
          normalizeText(
            process.env.RAZORPAY_KEY_ID,
            200,
          ) &&
            normalizeText(
              process.env.RAZORPAY_KEY_SECRET,
              300,
            ),
        );

      const razorpayMode =
        normalizeText(
          process.env.RAZORPAY_MODE ||
            "test",
          20,
        ).toLowerCase() ===
        "live"
          ? "live"
          : "test";

      const razorpayCurrency =
        normalizeText(
          process.env.RAZORPAY_CURRENCY ||
            "INR",
          10,
        ).toUpperCase();

      /*
       * ----------------------------------------------------------------------
       * Final response
       * ----------------------------------------------------------------------
       */

      return void res.json({
        success: true,

        stats,

        roleCounts,

        approvalQueue,

        topPages,

        topLocations,

        recentActivity,

        premium: {
          razorpay: {
            configured:
              razorpayConfigured,

            mode:
              razorpayMode,

            currency:
              razorpayCurrency,
          },

          subscriptionPlans:
            tableExists(
              "subscription_plans",
            ),

          subscriptionPlanPrices:
            tableExists(
              "subscription_plan_prices",
            ),

          panditSubscriptions:
            tableExists(
              "pandit_subscriptions",
            ),

          templeSubscriptions:
            tableExists(
              "temple_subscriptions",
            ),

          ashramSubscriptions:
            tableExists(
              "ashram_subscriptions",
            ),

          paymentOrders:
            tableExists(
              "payment_orders",
            ),

          payments:
            tableExists(
              "payments",
            ),

          paymentLinks:
            tableExists(
              "payment_links",
            ),
        },
      });
    } catch (error) {
      /*
       * Server logs retain the actual SQLite/SQL error.
       * Client receives a safe generic message.
       */
      console.error(
        "Admin dashboard error:",
        error,
      );

      return void res.status(500).json({
        success: false,
        error:
          "Unable to load the admin dashboard.",
      });
    }
  },
);

/* ============================================================================
 * Users
 * ========================================================================== */

router.get(
  "/users",
  (req, res) => {
    try {
      if (
        !requireTable(res, "users") ||
        !requireTable(res, "roles")
      ) {
        return;
      }

      const {
        limit,
        offset,
      } = parseListParams(req);

      const search =
        normalizeText(
          req.query.search,
          200,
        );

      const role =
        normalizeText(
          req.query.role,
          50,
        ).toLowerCase();

      const status =
        normalizeText(
          req.query.status,
          50,
        ).toLowerCase();

      const where: string[] = [
        "1=1",
      ];

      const params: unknown[] = [];

      if (search) {
        const p =
          `%${search}%`;

        where.push(`
          (
            u.name LIKE ?
            OR u.email LIKE ?
            OR COALESCE(u.phone,'') LIKE ?
          )
        `);

        params.push(
          p,
          p,
          p,
        );
      }

      if (role) {
        where.push("r.code=?");
        params.push(role);
      }

      if (status) {
        where.push(
          "LOWER(u.status)=?",
        );
        params.push(status);
      }

      const rows =
        db.prepare(`
          SELECT
            u.id,
            u.name,
            u.email,
            u.phone,
            u.city,
            u.state,
            u.country,
            u.status,
            u.avatar,
            u.email_verified_at,
            u.phone_verified_at,
            u.last_login_at,
            u.created_at,
            u.updated_at,
            r.code role
          FROM users u
          JOIN roles r
            ON r.id=u.role_id
          WHERE ${where.join(" AND ")}
          ORDER BY u.id DESC
          LIMIT ?
          OFFSET ?
        `).all(
          ...params,
          limit,
          offset,
        ) as SqlRow[];

      const total =
        Number(
          (
            db.prepare(`
              SELECT COUNT(*) value
              FROM users u
              JOIN roles r
                ON r.id=u.role_id
              WHERE ${where.join(" AND ")}
            `).get(
              ...params,
            ) as
              | {
                  value?: unknown;
                }
              | undefined
          )?.value ?? 0,
        );

      res.json({
        success: true,
        users: rows,
        pagination: {
          limit,
          offset,
          total,
          totalPages: Math.ceil(
            total / limit,
          ),
        },
      });
    } catch (error) {
      console.error(
        "Admin users error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load users.",
      });
    }
  },
);

router.get(
  "/users/:id",
  (req, res) => {
    try {
      if (
        !requireTable(res, "users") ||
        !requireTable(res, "roles")
      ) {
        return;
      }

      const id =
        asPositiveId(
          req.params.id,
        );

      if (!id) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid user id.",
        });
      }

      const user =
        db.prepare(`
          SELECT
            u.id,
            u.name,
            u.email,
            u.phone,
            u.city,
            u.state,
            u.country,
            u.status,
            u.avatar,
            u.email_verified_at,
            u.phone_verified_at,
            u.last_login_at,
            u.created_at,
            u.updated_at,
            r.code role,
            r.dashboard_path,
            r.public_registration_enabled,
            r.approval_required,
            r.is_system,
            r.is_active
          FROM users u
          JOIN roles r
            ON r.id=u.role_id
          WHERE u.id=?
          LIMIT 1
        `).get(id) as
          | SqlRow
          | undefined;

      if (!user) {
        return void res.status(404).json({
          success: false,
          error:
            "User not found.",
        });
      }

      let pandit:
        | SqlRow
        | null = null;

      let templeManager:
        | SqlRow
        | null = null;

      let ashramManager:
        | SqlRow
        | null = null;

      if (
        user.role === "pandit" &&
        tableExists(
          "pandit_profiles",
        )
      ) {
        pandit =
          (db.prepare(`
            SELECT *
            FROM pandit_profiles
            WHERE user_id=?
            LIMIT 1
          `).get(id) as
            | SqlRow
            | undefined) ?? null;
      }

      if (
        user.role ===
          "temple_manager" &&
        tableExists(
          "temple_manager_profiles",
        )
      ) {
        templeManager =
          (db.prepare(`
            SELECT *
            FROM temple_manager_profiles
            WHERE user_id=?
            LIMIT 1
          `).get(id) as
            | SqlRow
            | undefined) ?? null;
      }

      if (
        user.role ===
          "ashram_manager" &&
        tableExists(
          "ashram_manager_profiles",
        )
      ) {
        ashramManager =
          (db.prepare(`
            SELECT *
            FROM ashram_manager_profiles
            WHERE user_id=?
            LIMIT 1
          `).get(id) as
            | SqlRow
            | undefined) ?? null;
      }

      res.json({
        success: true,
        user,
        profiles: {
          pandit,
          templeManager,
          ashramManager,
        },
      });
    } catch (error) {
      console.error(
        "Admin user detail error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load user details.",
      });
    }
  },
);

router.patch(
  "/users/:id/status",
  (req, res) => {
    try {
      if (!requireTable(res, "users")) {
        return;
      }

      const id =
        asPositiveId(
          req.params.id,
        );

      const status =
        statusText(
          req.body?.status,
        );

      if (!id) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid user id.",
        });
      }

      if (
        ![
          "active",
          "pending",
          "blocked",
          "suspended",
          "rejected",
        ].includes(status)
      ) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid user status.",
        });
      }

      const oldRow =
        getRowById(
          "users",
          id,
        );

      if (!oldRow) {
        return void res.status(404).json({
          success: false,
          error:
            "User not found.",
        });
      }

      if (
        id === currentUserId(res) &&
        status !== "active"
      ) {
        return void res.status(400).json({
          success: false,
          error:
            "The current Super Admin cannot deactivate its own account.",
        });
      }

      db.prepare(`
        UPDATE users
        SET
          status=?,
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(
        status,
        id,
      );

      if (
        status !== "active" &&
        tableExists("sessions")
      ) {
        db.prepare(`
          DELETE FROM sessions
          WHERE user_id=?
        `).run(id);
      }

      const updated =
        getRowById(
          "users",
          id,
        ) || {};

      audit(
        req,
        currentUserId(res),
        "admin.user.status_updated",
        "user",
        id,
        oldRow,
        updated,
      );

      res.json({
        success: true,
        user: updated,
      });
    } catch (error) {
      console.error(
        "Admin user status error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to update user status.",
      });
    }
  },
);

router.patch(
  "/users/:id/role",
  (req, res) => {
    try {
      if (
        !requireTable(res, "users") ||
        !requireTable(res, "roles")
      ) {
        return;
      }

      const id =
        asPositiveId(
          req.params.id,
        );

      const role =
        normalizeText(
          req.body?.role,
          50,
        ).toLowerCase();

      const allowedRoles = [
        "visitor",
        "pandit",
        "temple_manager",
        "ashram_manager",
        "sales",
        "super_admin",
      ];

      if (!id) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid user id.",
        });
      }

      if (
        !allowedRoles.includes(role)
      ) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid system role.",
        });
      }

      if (
        id === currentUserId(res)
      ) {
        return void res.status(400).json({
          success: false,
          error:
            "The current Super Admin cannot change its own role.",
        });
      }

      const old =
        db.prepare(`
          SELECT
            u.*,
            r.code role
          FROM users u
          JOIN roles r
            ON r.id=u.role_id
          WHERE u.id=?
          LIMIT 1
        `).get(id) as
          | SqlRow
          | undefined;

      if (!old) {
        return void res.status(404).json({
          success: false,
          error:
            "User not found.",
        });
      }

      const target =
        db.prepare(`
          SELECT
            id,
            code,
            public_registration_enabled,
            approval_required,
            is_active
          FROM roles
          WHERE code=?
          LIMIT 1
        `).get(role) as
          | SqlRow
          | undefined;

      if (
        !target ||
        Number(target.is_active) !== 1
      ) {
        return void res.status(409).json({
          success: false,
          error:
            "Target role is not active.",
        });
      }

      db.prepare(`
        UPDATE users
        SET
          role_id=?,
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(
        target.id,
        id,
      );

      if (
        role === "temple_manager" &&
        tableExists(
          "temple_manager_profiles",
        )
      ) {
        db.prepare(`
          INSERT OR IGNORE INTO temple_manager_profiles (
            user_id,
            verification_status,
            created_at,
            updated_at
          )
          VALUES (
            ?,
            'pending',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )
        `).run(id);
      }

      if (
        role === "ashram_manager" &&
        tableExists(
          "ashram_manager_profiles",
        )
      ) {
        db.prepare(`
          INSERT OR IGNORE INTO ashram_manager_profiles (
            user_id,
            verification_status,
            created_at,
            updated_at
          )
          VALUES (
            ?,
            'pending',
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )
        `).run(id);
      }

      if (
        role === "super_admin"
      ) {
        db.prepare(`
          UPDATE users
          SET
            status='active',
            email_verified_at=COALESCE(
              email_verified_at,
              CURRENT_TIMESTAMP
            ),
            updated_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).run(id);
      }

      const updated =
        getRowById(
          "users",
          id,
        ) || {};

      audit(
        req,
        currentUserId(res),
        "admin.user.role_updated",
        "user",
        id,
        old,
        updated,
      );

      res.json({
        success: true,
        user: updated,
      });
    } catch (error) {
      console.error(
        "Admin user role error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to update user role.",
      });
    }
  },
);

/* ============================================================================
 * Pandits
 * ========================================================================== */

router.get(
  "/pandits",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "pandit_profiles",
        ) ||
        !requireTable(
          res,
          "users",
        )
      ) {
        return;
      }

      const {
        limit,
        offset,
      } = parseListParams(req);

      const search =
        normalizeText(
          req.query.search,
          180,
        );

      const status =
        statusText(
          req.query.status,
        );

      const where: string[] = [
        "1=1",
      ];

      const params: unknown[] = [];

      if (search) {
        const p =
          `%${search}%`;

        where.push(`
          (
            p.display_name LIKE ?
            OR p.slug LIKE ?
            OR COALESCE(p.city,'') LIKE ?
            OR COALESCE(p.district,'') LIKE ?
            OR COALESCE(p.state,'') LIKE ?
            OR COALESCE(u.name,'') LIKE ?
            OR COALESCE(u.email,'') LIKE ?
            OR COALESCE(u.phone,'') LIKE ?
          )
        `);

        params.push(
          p,
          p,
          p,
          p,
          p,
          p,
          p,
          p,
        );
      }

      if (status) {
        where.push(`
          (
            LOWER(COALESCE(p.profile_status,''))=?
            OR LOWER(COALESCE(p.verification_status,''))=?
          )
        `);

        params.push(
          status,
          status,
        );
      }

      const rows =
        db.prepare(`
          SELECT
            p.*,
            u.name account_name,
            u.email,
            u.phone,
            u.status account_status,
            r.code account_role
          FROM pandit_profiles p
          JOIN users u
            ON u.id=p.user_id
          LEFT JOIN roles r
            ON r.id=u.role_id
          WHERE ${where.join(" AND ")}
          ORDER BY p.id DESC
          LIMIT ?
          OFFSET ?
        `).all(
          ...params,
          limit,
          offset,
        ) as SqlRow[];

      const total =
        Number(
          (
            db.prepare(`
              SELECT COUNT(*) value
              FROM pandit_profiles p
              JOIN users u
                ON u.id=p.user_id
              WHERE ${where.join(" AND ")}
            `).get(
              ...params,
            ) as
              | {
                  value?: unknown;
                }
              | undefined
          )?.value ?? 0,
        );

      res.json({
        success: true,
        pandits: rows,
        pagination: {
          limit,
          offset,
          total,
          totalPages:
            Math.ceil(
              total / limit,
            ),
        },
      });
    } catch (error) {
      console.error(
        "Admin pandits error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load Pandits.",
      });
    }
  },
);

function updatePanditApproval(
  req: Request,
  res: Response,
  target:
    | "approved"
    | "rejected",
): void {
  try {
    if (
      !requireTable(
        res,
        "pandit_profiles",
      ) ||
      !requireTable(
        res,
        "users",
      )
    ) {
      return;
    }

    /*
     * IMPORTANT:
     * req.params.id = pandit_profiles.id
     */
    const panditId =
      asPositiveId(
        req.params.id,
      );

    if (!panditId) {
      return void res.status(400).json({
        success: false,
        error:
          "Invalid Pandit profile id.",
      });
    }

    const profile =
      getRowById(
        "pandit_profiles",
        panditId,
      );

    if (!profile) {
      return void res.status(404).json({
        success: false,
        error:
          "Pandit profile not found.",
      });
    }

    const userId =
      asPositiveId(
        profile.user_id,
      );

    if (!userId) {
      return void res.status(409).json({
        success: false,
        error:
          "Pandit profile has no valid user account.",
      });
    }

    const accountRole =
      getUserRoleById(userId);

    if (
      accountRole &&
      accountRole !== "pandit"
    ) {
      return void res.status(409).json({
        success: false,
        error:
          "The selected profile is not linked to a Pandit account.",
      });
    }

    const oldUser =
      getRowById(
        "users",
        userId,
      );

    const rejectionReason =
      target === "rejected"
        ? validateRejectionReason(
            req.body?.reason,
          )
        : null;

    if (
      target === "rejected" &&
      !rejectionReason
    ) {
      return void res.status(400).json({
        success: false,
        error:
          "A rejection reason of at least 5 characters is required.",
      });
    }

    const columns =
      tableColumns(
        "pandit_profiles",
      );

    const updates: string[] = [];
    const values: unknown[] = [];

    if (
      target === "approved"
    ) {
      updates.push(
        "profile_status='approved'",
        "verification_status='verified'",
      );

      if (
        columns.has(
          "profile_verified",
        )
      ) {
        updates.push(
          "profile_verified=1",
        );
      }

      if (
        columns.has(
          "listing_active",
        )
      ) {
        updates.push(
          "listing_active=0",
        );
      }

      if (
        columns.has(
          "featured",
        )
      ) {
        updates.push(
          "featured=0",
        );
      }

      if (
        columns.has(
          "rejection_reason",
        )
      ) {
        updates.push(
          "rejection_reason=NULL",
        );
      }

      if (
        columns.has("updated_at")
      ) {
        updates.push(
          "updated_at=CURRENT_TIMESTAMP",
        );
      }

      db.transaction(() => {
        db.prepare(`
          UPDATE pandit_profiles
          SET ${updates.join(",")}
          WHERE id=?
        `).run(
          panditId,
        );

        db.prepare(`
          UPDATE users
          SET
            status='active',
            updated_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).run(userId);
      })();
    } else {
      if (
        columns.has(
          "profile_status",
        )
      ) {
        updates.push(
          "profile_status='rejected'",
        );
      }

      if (
        columns.has(
          "verification_status",
        )
      ) {
        updates.push(
          "verification_status='rejected'",
        );
      }

      if (
        columns.has(
          "profile_verified",
        )
      ) {
        updates.push(
          "profile_verified=0",
        );
      }

      if (
        columns.has(
          "listing_active",
        )
      ) {
        updates.push(
          "listing_active=0",
        );
      }

      if (
        columns.has("featured")
      ) {
        updates.push(
          "featured=0",
        );
      }

      if (
        columns.has(
          "rejection_reason",
        )
      ) {
        updates.push(
          "rejection_reason=?",
        );

        values.push(
          rejectionReason,
        );
      }

      if (
        columns.has("updated_at")
      ) {
        updates.push(
          "updated_at=CURRENT_TIMESTAMP",
        );
      }

      values.push(panditId);

      db.transaction(() => {
        db.prepare(`
          UPDATE pandit_profiles
          SET ${updates.join(",")}
          WHERE id=?
        `).run(...values);

        db.prepare(`
          UPDATE users
          SET
            status='rejected',
            updated_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).run(userId);

        if (
          tableExists("sessions")
        ) {
          db.prepare(`
            DELETE FROM sessions
            WHERE user_id=?
          `).run(userId);
        }
      })();
    }

    const updated =
      getRowById(
        "pandit_profiles",
        panditId,
      ) || {};

    const updatedUser =
      getRowById(
        "users",
        userId,
      ) || {};

    audit(
      req,
      currentUserId(res),
      `admin.pandit.${target}`,
      "pandit_profile",
      panditId,
      {
        profile,
        user: oldUser,
      },
      {
        profile: updated,
        user: updatedUser,
      },
    );

    res.json({
      success: true,
      message:
        target === "approved"
          ? "Pandit profile approved successfully."
          : "Pandit profile rejected successfully.",
      pandit: updated,
      user: {
        id: userId,
        status:
          target === "approved"
            ? "active"
            : "rejected",
      },
    });
  } catch (error) {
    console.error(
      "Admin Pandit approval error:",
      error,
    );

    res.status(500).json({
      success: false,
      error:
        "Unable to update Pandit approval.",
    });
  }
}

router.patch(
  "/pandits/:id/approve",
  (req, res) =>
    updatePanditApproval(
      req,
      res,
      "approved",
    ),
);

router.patch(
  "/pandits/:id/reject",
  (req, res) =>
    updatePanditApproval(
      req,
      res,
      "rejected",
    ),
);

router.patch(
  "/pandits/:id/feature",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "pandit_profiles",
        )
      ) {
        return;
      }

      const panditId =
        asPositiveId(
          req.params.id,
        );

      if (!panditId) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid Pandit profile id.",
        });
      }

      const old =
        getRowById(
          "pandit_profiles",
          panditId,
        );

      if (!old) {
        return void res.status(404).json({
          success: false,
          error:
            "Pandit profile not found.",
        });
      }

      if (
        statusText(
          old.profile_status,
        ) !== "approved" ||
        statusText(
          old.verification_status,
        ) !== "verified"
      ) {
        return void res.status(409).json({
          success: false,
          error:
            "Only an approved and verified Pandit can be featured.",
        });
      }

      if (
        !tableColumns(
          "pandit_profiles",
        ).has("featured")
      ) {
        return void res.status(503).json({
          success: false,
          error:
            "Pandit featured field is not available.",
        });
      }

      const featured =
        boolInt(
          req.body?.featured,
          false,
        );

      db.prepare(`
        UPDATE pandit_profiles
        SET
          featured=?,
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(
        featured,
        panditId,
      );

      const updated =
        getRowById(
          "pandit_profiles",
          panditId,
        ) || {};

      audit(
        req,
        currentUserId(res),
        "admin.pandit.featured_updated",
        "pandit_profile",
        panditId,
        old,
        updated,
      );

      res.json({
        success: true,
        featured:
          featured === 1,
        pandit: updated,
      });
    } catch (error) {
      console.error(
        "Admin Pandit feature error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to update featured status.",
      });
    }
  },
);

router.patch(
  "/pandits/:id/listing",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "pandit_profiles",
        )
      ) {
        return;
      }

      const panditId =
        asPositiveId(
          req.params.id,
        );

      if (!panditId) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid Pandit profile id.",
        });
      }

      const old =
        getRowById(
          "pandit_profiles",
          panditId,
        );

      if (!old) {
        return void res.status(404).json({
          success: false,
          error:
            "Pandit profile not found.",
        });
      }

      if (
        statusText(
          old.profile_status,
        ) !== "approved" ||
        statusText(
          old.verification_status,
        ) !== "verified"
      ) {
        return void res.status(409).json({
          success: false,
          error:
            "Only an approved and verified Pandit can have an active public listing.",
        });
      }

      if (
        !tableColumns(
          "pandit_profiles",
        ).has("listing_active")
      ) {
        return void res.status(503).json({
          success: false,
          error:
            "Pandit listing field is not available.",
        });
      }

      const active =
        boolInt(
          req.body?.listingActive ??
            req.body?.active,
          false,
        );

      db.prepare(`
        UPDATE pandit_profiles
        SET
          listing_active=?,
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(
        active,
        panditId,
      );

      const updated =
        getRowById(
          "pandit_profiles",
          panditId,
        ) || {};

      audit(
        req,
        currentUserId(res),
        "admin.pandit.listing_updated",
        "pandit_profile",
        panditId,
        old,
        updated,
      );

      res.json({
        success: true,
        listingActive:
          active === 1,
        pandit: updated,
      });
    } catch (error) {
      console.error(
        "Admin Pandit listing error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to update Pandit listing.",
      });
    }
  },
);

/* ============================================================================
 * Managers
 * ========================================================================== */

function managerConfig(
  role: ManagerRole,
) {
  if (
    role ===
    "temple_manager"
  ) {
    return {
      profile:
        "temple_manager_profiles",
      assignment:
        "temple_manager_assignments",
      entity: "temples",
      entityId:
        "temple_id",
      entityAlias: "t",
      nameExpr:
        "COALESCE(t.name,'')",
      dashboard:
        "/temple/dashboard",
    };
  }

  return {
    profile:
      "ashram_manager_profiles",
    assignment:
      "ashram_manager_assignments",
    entity: "ashrams",
    entityId:
      "ashram_id",
    entityAlias: "a2",
    nameExpr:
      "COALESCE(a2.name,'')",
    dashboard:
      "/ashram/dashboard",
  };
}

function listManagers(
  role: ManagerRole,
  req: Request,
  res: Response,
): void {
  try {
    const c =
      managerConfig(role);

    if (
      !requireTable(
        res,
        c.profile,
      ) ||
      !requireTable(
        res,
        "users",
      ) ||
      !requireTable(
        res,
        "roles",
      )
    ) {
      return;
    }

    const {
      limit,
      offset,
    } = parseListParams(req);

    const search =
      normalizeText(
        req.query.search,
        180,
      );

    const where: string[] = [
      `r.code='${role}'`,
    ];

    const params: unknown[] = [];

    if (search) {
      const p =
        `%${search}%`;

      where.push(`
        (
          u.name LIKE ?
          OR u.email LIKE ?
          OR COALESCE(mp.organization_name,'') LIKE ?
          OR COALESCE(u.city,'') LIKE ?
          OR COALESCE(u.state,'') LIKE ?
        )
      `);

      params.push(
        p,
        p,
        p,
        p,
        p,
      );
    }

    const rows =
      db.prepare(`
        SELECT
          mp.*,
          u.name user_name,
          u.email user_email,
          u.phone user_phone,
          u.city,
          u.state,
          u.country,
          u.status user_status,
          r.code role
        FROM ${c.profile} mp
        JOIN users u
          ON u.id=mp.user_id
        JOIN roles r
          ON r.id=u.role_id
        WHERE ${where.join(" AND ")}
        ORDER BY
          CASE
            WHEN u.status='pending'
            THEN 0
            ELSE 1
          END,
          mp.id DESC
        LIMIT ?
        OFFSET ?
      `).all(
        ...params,
        limit,
        offset,
      ) as SqlRow[];

    const total =
      Number(
        (
          db.prepare(`
            SELECT COUNT(*) value
            FROM ${c.profile} mp
            JOIN users u
              ON u.id=mp.user_id
            JOIN roles r
              ON r.id=u.role_id
            WHERE ${where.join(" AND ")}
          `).get(
            ...params,
          ) as
            | {
                value?: unknown;
              }
            | undefined
        )?.value ?? 0,
      );

    res.json({
      success: true,
      managers: rows,
      [
        role === "temple_manager"
          ? "templeManagers"
          : "ashramManagers"
      ]: rows,
      pagination: {
        limit,
        offset,
        total,
        totalPages:
          Math.ceil(
            total / limit,
          ),
      },
    });
  } catch (error) {
    console.error(
      `Admin ${role} list error:`,
      error,
    );

    res.status(500).json({
      success: false,
      error:
        `Unable to load ${role.replace(
          "_",
          " ",
        )} accounts.`,
    });
  }
}

router.get(
  "/temple-managers",
  (req, res) =>
    listManagers(
      "temple_manager",
      req,
      res,
    ),
);

router.get(
  "/ashram-managers",
  (req, res) =>
    listManagers(
      "ashram_manager",
      req,
      res,
    ),
);

function updateManagerApproval(
  role: ManagerRole,
  req: Request,
  res: Response,
  target:
    | "verified"
    | "rejected",
): void {
  try {
    const c =
      managerConfig(role);

    if (
      !requireTable(
        res,
        c.profile,
      ) ||
      !requireTable(
        res,
        "users",
      )
    ) {
      return;
    }

    /*
     * IMPORTANT:
     * req.params.id = manager profile ID
     */
    const managerProfileId =
      asPositiveId(
        req.params.id,
      );

    if (!managerProfileId) {
      return void res.status(400).json({
        success: false,
        error:
          "Invalid manager profile id.",
      });
    }

    const profile =
      getRowById(
        c.profile,
        managerProfileId,
      );

    if (!profile) {
      return void res.status(404).json({
        success: false,
        error:
          "Manager profile not found.",
      });
    }

    const userId =
      asPositiveId(
        profile.user_id,
      );

    if (!userId) {
      return void res.status(409).json({
        success: false,
        error:
          "Manager profile is not linked to a valid user account.",
      });
    }

    const accountRole =
      getUserRoleById(userId);

    if (
      accountRole &&
      accountRole !== role
    ) {
      return void res.status(409).json({
        success: false,
        error:
          "The selected profile is linked to a different role.",
      });
    }

    const rejectionReason =
      target === "rejected"
        ? validateRejectionReason(
            req.body?.reason,
          )
        : null;

    if (
      target === "rejected" &&
      !rejectionReason
    ) {
      return void res.status(400).json({
        success: false,
        error:
          "A rejection reason of at least 5 characters is required.",
      });
    }

    const columns =
      tableColumns(c.profile);

    const oldUser =
      getRowById(
        "users",
        userId,
      );

    db.transaction(() => {
      const updates: string[] = [
        "verification_status=?",
      ];

      const values: unknown[] = [
        target,
      ];

      if (
        target === "verified" &&
        columns.has(
          "rejection_reason",
        )
      ) {
        updates.push(
          "rejection_reason=NULL",
        );
      }

      if (
        target === "rejected" &&
        columns.has(
          "rejection_reason",
        )
      ) {
        updates.push(
          "rejection_reason=?",
        );

        values.push(
          rejectionReason,
        );
      }

      if (
        columns.has("updated_at")
      ) {
        updates.push(
          "updated_at=CURRENT_TIMESTAMP",
        );
      }

      values.push(
        managerProfileId,
      );

      db.prepare(`
        UPDATE ${c.profile}
        SET ${updates.join(",")}
        WHERE id=?
      `).run(...values);

      db.prepare(`
        UPDATE users
        SET
          status=?,
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(
        target === "verified"
          ? "active"
          : "rejected",
        userId,
      );

      if (
        target === "rejected" &&
        tableExists(c.assignment)
      ) {
        db.prepare(`
          UPDATE ${c.assignment}
          SET
            status='revoked',
            revoked_at=CURRENT_TIMESTAMP,
            updated_at=CURRENT_TIMESTAMP
          WHERE manager_user_id=?
            AND status='active'
        `).run(userId);
      }

      if (
        target === "rejected" &&
        tableExists("sessions")
      ) {
        db.prepare(`
          DELETE FROM sessions
          WHERE user_id=?
        `).run(userId);
      }
    })();

    const updated =
      getRowById(
        c.profile,
        managerProfileId,
      ) || {};

    audit(
      req,
      currentUserId(res),
      `admin.${role}.${target}`,
      role,
      managerProfileId,
      {
        profile,
        user: oldUser,
      },
      {
        profile: updated,
        user: getRowById(
          "users",
          userId,
        ),
      },
    );

    res.json({
      success: true,
      message:
        target === "verified"
          ? `${role.replace(
              "_",
              " ",
            )} approved successfully.`
          : `${role.replace(
              "_",
              " ",
            )} rejected successfully.`,
      manager: {
        ...updated,
        userId,
        status:
          target === "verified"
            ? "active"
            : "rejected",
        verificationStatus:
          target,
      },
    });
  } catch (error) {
    console.error(
      `Admin ${role} approval error:`,
      error,
    );

    res.status(500).json({
      success: false,
      error:
        `Unable to update ${role.replace(
          "_",
          " ",
        )} approval.`,
    });
  }
}

router.patch(
  "/temple-managers/:id/approve",
  (req, res) =>
    updateManagerApproval(
      "temple_manager",
      req,
      res,
      "verified",
    ),
);

router.patch(
  "/temple-managers/:id/reject",
  (req, res) =>
    updateManagerApproval(
      "temple_manager",
      req,
      res,
      "rejected",
    ),
);

router.patch(
  "/ashram-managers/:id/approve",
  (req, res) =>
    updateManagerApproval(
      "ashram_manager",
      req,
      res,
      "verified",
    ),
);

router.patch(
  "/ashram-managers/:id/reject",
  (req, res) =>
    updateManagerApproval(
      "ashram_manager",
      req,
      res,
      "rejected",
    ),
);

/* ============================================================================
 * Manager Assignments
 * ========================================================================== */

function getAssignments(
  role: ManagerRole,
  req: Request,
  res: Response,
): void {
  try {
    const c =
      managerConfig(role);

    if (
      !requireTable(
        res,
        c.assignment,
      ) ||
      !requireTable(
        res,
        c.entity,
      ) ||
      !requireTable(
        res,
        "users",
      )
    ) {
      return;
    }

    const {
      limit,
      offset,
    } = parseListParams(req);

    const managerId =
      asPositiveId(
        req.query.managerUserId,
      );

    const entityId =
      asPositiveId(
        req.query.entityId ??
          req.query[
            c.entityId
          ],
      );

    const status =
      normalizeText(
        req.query.status,
        30,
      ).toLowerCase();

    const where: string[] = [
      "1=1",
    ];

    const params: unknown[] = [];

    if (managerId) {
      where.push(
        "a.manager_user_id=?",
      );
      params.push(managerId);
    }

    if (entityId) {
      where.push(
        `a.${c.entityId}=?`,
      );
      params.push(entityId);
    }

    if (status) {
      where.push("a.status=?");
      params.push(status);
    }

    const rows =
      db.prepare(`
        SELECT
          a.*,
          u.name manager_name,
          u.email manager_email,
          ${c.nameExpr} entity_name
        FROM ${c.assignment} a
        JOIN users u
          ON u.id=a.manager_user_id
        JOIN ${c.entity}
          ${c.entityAlias}
          ON ${c.entityAlias}.id=a.${c.entityId}
        WHERE ${where.join(" AND ")}
        ORDER BY a.id DESC
        LIMIT ?
        OFFSET ?
      `).all(
        ...params,
        limit,
        offset,
      ) as SqlRow[];

    const total =
      Number(
        (
          db.prepare(`
            SELECT COUNT(*) value
            FROM ${c.assignment} a
            WHERE ${where.join(" AND ")}
          `).get(
            ...params,
          ) as
            | {
                value?: unknown;
              }
            | undefined
        )?.value ?? 0,
      );

    res.json({
      success: true,
      assignments: rows,
      pagination: {
        limit,
        offset,
        total,
        totalPages:
          Math.ceil(
            total / limit,
          ),
      },
    });
  } catch (error) {
    console.error(
      `Admin ${role} assignments error:`,
      error,
    );

    res.status(500).json({
      success: false,
      error:
        "Unable to load manager assignments.",
    });
  }
}

router.get(
  "/temple-manager-assignments",
  (req, res) =>
    getAssignments(
      "temple_manager",
      req,
      res,
    ),
);

router.get(
  "/ashram-manager-assignments",
  (req, res) =>
    getAssignments(
      "ashram_manager",
      req,
      res,
    ),
);

function createAssignment(
  role: ManagerRole,
  req: Request,
  res: Response,
): void {
  try {
    const c =
      managerConfig(role);

    if (
      !requireTable(
        res,
        c.assignment,
      ) ||
      !requireTable(
        res,
        "users",
      ) ||
      !requireTable(
        res,
        c.entity,
      )
    ) {
      return;
    }

    const managerUserId =
      asPositiveId(
        req.body?.managerUserId,
      );

    const entityId =
      asPositiveId(
        req.body?.entityId ??
          req.body?.[
            c.entityId
          ],
      );

    const status =
      normalizeText(
        req.body?.status ??
          "active",
        30,
      ).toLowerCase();

    if (
      !managerUserId ||
      !entityId
    ) {
      return void res.status(400).json({
        success: false,
        error:
          "managerUserId and entityId are required.",
      });
    }

    if (
      ![
        "active",
        "inactive",
        "revoked",
      ].includes(status)
    ) {
      return void res.status(400).json({
        success: false,
        error:
          "Invalid assignment status.",
      });
    }

    const manager =
      db.prepare(`
        SELECT
          u.id,
          u.status,
          r.code role
        FROM users u
        JOIN roles r
          ON r.id=u.role_id
        WHERE u.id=?
        LIMIT 1
      `).get(
        managerUserId,
      ) as
        | SqlRow
        | undefined;

    if (
      !manager ||
      manager.role !== role
    ) {
      return void res.status(400).json({
        success: false,
        error:
          `The selected user must have role ${role}.`,
      });
    }

    if (
      manager.status !== "active" &&
      status === "active"
    ) {
      return void res.status(409).json({
        success: false,
        error:
          "Only an active manager can receive an active assignment.",
      });
    }

    const entity =
      getRowById(
        c.entity,
        entityId,
      );

    if (!entity) {
      return void res.status(404).json({
        success: false,
        error:
          `${
            role ===
            "temple_manager"
              ? "Temple"
              : "Ashram"
          } not found.`,
      });
    }

    const profile =
      db.prepare(`
        SELECT
          verification_status
        FROM ${c.profile}
        WHERE user_id=?
        LIMIT 1
      `).get(
        managerUserId,
      ) as
        | {
            verification_status?: string;
          }
        | undefined;

    if (
      status === "active" &&
      statusText(
        profile?.verification_status,
      ) !== "verified"
    ) {
      return void res.status(409).json({
        success: false,
        error:
          "Manager must be verified before an active assignment can be created.",
      });
    }

    const duplicate =
      db.prepare(`
        SELECT
          id,
          status
        FROM ${c.assignment}
        WHERE ${c.entityId}=?
          AND manager_user_id=?
        LIMIT 1
      `).get(
        entityId,
        managerUserId,
      ) as
        | SqlRow
        | undefined;

    if (duplicate) {
      return void res.status(409).json({
        success: false,
        error:
          "This manager is already mapped to this entity.",
      });
    }

    const result =
      db.prepare(`
        INSERT INTO ${c.assignment} (
          ${c.entityId},
          manager_user_id,
          assigned_by,
          status,
          assigned_at,
          created_at,
          updated_at
        )
        VALUES (
          ?,
          ?,
          ?,
          ?,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
      `).run(
        entityId,
        managerUserId,
        currentUserId(res) ||
          null,
        status,
      );

    const id =
      Number(
        result.lastInsertRowid,
      );

    const row =
      getRowById(
        c.assignment,
        id,
      ) || {};

    audit(
      req,
      currentUserId(res),
      `admin.${role}.assignment_created`,
      c.assignment,
      id,
      null,
      row,
    );

    res.status(201).json({
      success: true,
      assignment: row,
    });
  } catch (error) {
    console.error(
      `Admin ${role} create assignment error:`,
      error,
    );

    const message =
      error instanceof Error
        ? error.message
        : String(error);

    res.status(
      /UNIQUE constraint failed/i.test(
        message,
      )
        ? 409
        : 500,
    ).json({
      success: false,
      error:
        /UNIQUE constraint failed/i.test(
          message,
        )
          ? "This manager/entity assignment already exists."
          : "Unable to create manager assignment.",
    });
  }
}

router.post(
  "/temple-manager-assignments",
  (req, res) =>
    createAssignment(
      "temple_manager",
      req,
      res,
    ),
);

router.post(
  "/ashram-manager-assignments",
  (req, res) =>
    createAssignment(
      "ashram_manager",
      req,
      res,
    ),
);

function updateAssignmentStatus(
  role: ManagerRole,
  req: Request,
  res: Response,
  target:
    | "active"
    | "inactive"
    | "revoked",
): void {
  try {
    const c =
      managerConfig(role);

    if (
      !requireTable(
        res,
        c.assignment,
      )
    ) {
      return;
    }

    const id =
      asPositiveId(
        req.params.id,
      );

    if (!id) {
      return void res.status(400).json({
        success: false,
        error:
          "Invalid assignment id.",
      });
    }

    const old =
      getRowById(
        c.assignment,
        id,
      );

    if (!old) {
      return void res.status(404).json({
        success: false,
        error:
          "Assignment not found.",
      });
    }

    if (
      target === "active" &&
      tableExists("users")
    ) {
      const user =
        db.prepare(`
          SELECT
            u.status,
            r.code role
          FROM users u
          JOIN roles r
            ON r.id=u.role_id
          WHERE u.id=?
          LIMIT 1
        `).get(
          old.manager_user_id,
        ) as
          | SqlRow
          | undefined;

      if (
        !user ||
        user.role !== role ||
        user.status !== "active"
      ) {
        return void res.status(409).json({
          success: false,
          error:
            "Manager must be an active account.",
        });
      }

      if (
        tableExists(
          c.profile,
        )
      ) {
        const profile =
          db.prepare(`
            SELECT
              verification_status
            FROM ${c.profile}
            WHERE user_id=?
            LIMIT 1
          `).get(
            old.manager_user_id,
          ) as
            | {
                verification_status?: string;
              }
            | undefined;

        if (
          statusText(
            profile?.verification_status,
          ) !== "verified"
        ) {
          return void res
            .status(409)
            .json({
              success: false,
              error:
                "Manager must be verified before activation.",
            });
        }
      }
    }

    db.prepare(`
      UPDATE ${c.assignment}
      SET
        status=?,
        revoked_at=
          CASE
            WHEN ?='revoked'
            THEN CURRENT_TIMESTAMP
            ELSE NULL
          END,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      target,
      target,
      id,
    );

    const updated =
      getRowById(
        c.assignment,
        id,
      ) || {};

    audit(
      req,
      currentUserId(res),
      `admin.${role}.assignment_${target}`,
      c.assignment,
      id,
      old,
      updated,
    );

    res.json({
      success: true,
      assignment: updated,
    });
  } catch (error) {
    console.error(
      `Admin ${role} assignment status error:`,
      error,
    );

    res.status(500).json({
      success: false,
      error:
        "Unable to update manager assignment.",
    });
  }
}

router.patch(
  "/temple-manager-assignments/:id/status",
  (req, res) => {
    const status =
      normalizeText(
        req.body?.status,
        30,
      ).toLowerCase();

    if (
      ![
        "active",
        "inactive",
        "revoked",
      ].includes(status)
    ) {
      return void res.status(400).json({
        success: false,
        error:
          "Invalid assignment status.",
      });
    }

    updateAssignmentStatus(
      "temple_manager",
      req,
      res,
      status as
        | "active"
        | "inactive"
        | "revoked",
    );
  },
);

router.patch(
  "/ashram-manager-assignments/:id/status",
  (req, res) => {
    const status =
      normalizeText(
        req.body?.status,
        30,
      ).toLowerCase();

    if (
      ![
        "active",
        "inactive",
        "revoked",
      ].includes(status)
    ) {
      return void res.status(400).json({
        success: false,
        error:
          "Invalid assignment status.",
      });
    }

    updateAssignmentStatus(
      "ashram_manager",
      req,
      res,
      status as
        | "active"
        | "inactive"
        | "revoked",
    );
  },
);

/* ============================================================================
 * Temples / Ashrams
 * ========================================================================== */

router.get(
  "/temples",
  (req, res) => {
    try {
      if (!requireTable(res, "temples")) {
        return;
      }

      const {
        limit,
        offset,
      } = parseListParams(req);

      const search =
        normalizeText(
          req.query.search,
          160,
        );

      const status =
        statusText(
          req.query.status,
        );

      const where = ["1=1"];
      const params: unknown[] = [];

      if (search) {
        const p =
          `%${search}%`;

        where.push(`
          (
            name LIKE ?
            OR slug LIKE ?
            OR COALESCE(city,'') LIKE ?
            OR COALESCE(state,'') LIKE ?
          )
        `);

        params.push(
          p,
          p,
          p,
          p,
        );
      }

      if (status) {
        where.push(
          "LOWER(status)=?",
        );
        params.push(status);
      }

      const rows =
        db.prepare(`
          SELECT *
          FROM temples
          WHERE ${where.join(" AND ")}
          ORDER BY id DESC
          LIMIT ?
          OFFSET ?
        `).all(
          ...params,
          limit,
          offset,
        ) as SqlRow[];

      const total =
        Number(
          (
            db.prepare(`
              SELECT COUNT(*) value
              FROM temples
              WHERE ${where.join(" AND ")}
            `).get(
              ...params,
            ) as
              | {
                  value?: unknown;
                }
              | undefined
          )?.value ?? 0,
        );

      res.json({
        success: true,
        temples: rows.map(
          (row) => ({
            ...row,
            templeId: row.id,
            isActive:
              statusText(
                row.status,
              ) === "published",
            featured:
              normalizeBoolean(
                row.featured,
              ),
          }),
        ),
        pagination: {
          limit,
          offset,
          total,
          totalPages:
            Math.ceil(
              total / limit,
            ),
        },
      });
    } catch (error) {
      console.error(
        "Admin temples error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load temples.",
      });
    }
  },
);

function updateCatalogueStatus(
  table:
    | "temples"
    | "ashrams",
  req: Request,
  res: Response,
): void {
  try {
    if (!requireTable(res, table)) {
      return;
    }

    const id =
      asPositiveId(
        req.params.id,
      );

    if (!id) {
      return void res.status(400).json({
        success: false,
        error:
          `Invalid ${
            table === "temples"
              ? "temple"
              : "ashram"
          } id.`,
      });
    }

    const old =
      getRowById(
        table,
        id,
      );

    if (!old) {
      return void res.status(404).json({
        success: false,
        error:
          `${
            table === "temples"
              ? "Temple"
              : "Ashram"
          } not found.`,
      });
    }

    const columns =
      tableColumns(table);

    const updates: string[] = [];
    const values: unknown[] = [];

    if (
      Object.prototype.hasOwnProperty.call(
        req.body || {},
        "status",
      ) &&
      columns.has("status")
    ) {
      const status =
        statusText(
          req.body.status,
        );

      if (
        ![
          "draft",
          "published",
          "unpublished",
          "pending",
          "rejected",
          "active",
          "inactive",
        ].includes(status)
      ) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid catalogue status.",
        });
      }

      updates.push(
        "status=?",
      );
      values.push(status);
    }

    if (
      Object.prototype.hasOwnProperty.call(
        req.body || {},
        "featured",
      ) &&
      columns.has("featured")
    ) {
      updates.push(
        "featured=?",
      );
      values.push(
        boolInt(
          req.body.featured,
        ),
      );
    }

    if (
      table === "ashrams" &&
      Object.prototype.hasOwnProperty.call(
        req.body || {},
        "listingActive",
      ) &&
      columns.has("listing_active")
    ) {
      updates.push(
        "listing_active=?",
      );
      values.push(
        boolInt(
          req.body.listingActive,
        ),
      );
    }

    if (!updates.length) {
      return void res.status(400).json({
        success: false,
        error:
          "No supported status fields were supplied.",
      });
    }

    if (
      columns.has("updated_at")
    ) {
      updates.push(
        "updated_at=CURRENT_TIMESTAMP",
      );
    }

    values.push(id);

    db.prepare(`
      UPDATE ${table}
      SET ${updates.join(",")}
      WHERE id=?
    `).run(
      ...values,
    );

    const updated =
      getRowById(
        table,
        id,
      ) || {};

    audit(
      req,
      currentUserId(res),
      `admin.${table}.status_updated`,
      table.slice(0, -1),
      id,
      old,
      updated,
    );

    res.json({
      success: true,
      [
        table === "temples"
          ? "temple"
          : "ashram"
      ]: updated,
    });
  } catch (error) {
    console.error(
      `Admin ${table} status error:`,
      error,
    );

    res.status(500).json({
      success: false,
      error:
        `Unable to update ${
          table === "temples"
            ? "Temple"
            : "Ashram"
        }.`,
    });
  }
}

router.patch(
  "/temples/:id/status",
  (req, res) =>
    updateCatalogueStatus(
      "temples",
      req,
      res,
    ),
);

router.get(
  "/ashrams",
  (req, res) => {
    try {
      if (!requireTable(res, "ashrams")) {
        return;
      }

      const {
        limit,
        offset,
      } = parseListParams(req);

      const search =
        normalizeText(
          req.query.search,
          160,
        );

      const status =
        statusText(
          req.query.status,
        );

      const where = ["1=1"];
      const params: unknown[] = [];

      if (search) {
        const p =
          `%${search}%`;

        where.push(`
          (
            name LIKE ?
            OR slug LIKE ?
            OR COALESCE(city,'') LIKE ?
            OR COALESCE(state,'') LIKE ?
          )
        `);

        params.push(
          p,
          p,
          p,
          p,
        );
      }

      if (status) {
        where.push(
          "LOWER(status)=?",
        );
        params.push(status);
      }

      const rows =
        db.prepare(`
          SELECT *
          FROM ashrams
          WHERE ${where.join(" AND ")}
          ORDER BY id DESC
          LIMIT ?
          OFFSET ?
        `).all(
          ...params,
          limit,
          offset,
        ) as SqlRow[];

      const total =
        Number(
          (
            db.prepare(`
              SELECT COUNT(*) value
              FROM ashrams
              WHERE ${where.join(" AND ")}
            `).get(
              ...params,
            ) as
              | {
                  value?: unknown;
                }
              | undefined
          )?.value ?? 0,
        );

      res.json({
        success: true,
        ashrams: rows,
        pagination: {
          limit,
          offset,
          total,
          totalPages:
            Math.ceil(
              total / limit,
            ),
        },
      });
    } catch (error) {
      console.error(
        "Admin ashrams error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load Ashrams.",
      });
    }
  },
);

router.patch(
  "/ashrams/:id/status",
  (req, res) =>
    updateCatalogueStatus(
      "ashrams",
      req,
      res,
    ),
);

/* ============================================================================
 * Sales
 * ========================================================================== */

router.get(
  "/sales",
  (req, res) => {
    try {
      if (
        !requireTable(res, "users") ||
        !requireTable(res, "roles")
      ) {
        return;
      }

      const {
        limit,
        offset,
      } = parseListParams(req);

      const rows =
        db.prepare(`
          SELECT
            u.id,
            u.name,
            u.email,
            u.phone,
            u.city,
            u.state,
            u.country,
            u.status,
            u.created_at,
            u.last_login_at,
            r.code role
          FROM users u
          JOIN roles r
            ON r.id=u.role_id
          WHERE r.code='sales'
          ORDER BY u.id DESC
          LIMIT ?
          OFFSET ?
        `).all(
          limit,
          offset,
        ) as SqlRow[];

      const total =
        Number(
          (
            db.prepare(`
              SELECT COUNT(*) value
              FROM users u
              JOIN roles r
                ON r.id=u.role_id
              WHERE r.code='sales'
            `).get() as
              | {
                  value?: unknown;
                }
              | undefined
          )?.value ?? 0,
        );

      res.json({
        success: true,
        sales: rows,
        pagination: {
          limit,
          offset,
          total,
          totalPages:
            Math.ceil(
              total / limit,
            ),
        },
      });
    } catch (error) {
      console.error(
        "Admin sales error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load Sales Team.",
      });
    }
  },
);

async function hashPassword(
  password: string,
): Promise<string> {
  const salt =
    randomBytes(16);

  const key =
    await new Promise<Buffer>(
      (
        resolve,
        reject,
      ) => {
        scrypt(
          password,
          salt,
          64,
          {
            N: 16_384,
            r: 8,
            p: 1,
            maxmem:
              32 *
              1024 *
              1024,
          },
          (
            error,
            derived,
          ) => {
            if (error) {
              return reject(error);
            }

            if (
              !Buffer.isBuffer(
                derived,
              )
            ) {
              return reject(
                new Error(
                  "Password derivation failed.",
                ),
              );
            }

            resolve(derived);
          },
        );
      },
    );

  return `${salt.toString(
    "hex",
  )}:${key.toString(
    "hex",
  )}`;
}

router.post(
  "/sales",
  async (req, res) => {
    try {
      if (
        !requireTable(res, "users") ||
        !requireTable(res, "roles")
      ) {
        return;
      }

      const name =
        normalizeText(
          req.body?.name,
          150,
        );

      const email =
        normalizeText(
          req.body?.email,
          255,
        ).toLowerCase();

      const phone =
        normalizeNullableText(
          req.body?.phone,
          30,
        );

      const city =
        normalizeNullableText(
          req.body?.city,
          120,
        );

      const state =
        normalizeNullableText(
          req.body?.state,
          120,
        );

      const country =
        normalizeNullableText(
          req.body?.country,
          100,
        ) || "India";

      const password =
        req.body?.password;

      if (
        name.length < 2 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
          email,
        ) ||
        typeof password !== "string" ||
        password.length < 8 ||
        password.length > 128
      ) {
        return void res.status(400).json({
          success: false,
          error:
            "Valid name, email and password (8-128 characters) are required.",
        });
      }

      const existing =
        db.prepare(`
          SELECT id
          FROM users
          WHERE LOWER(email)=LOWER(?)
          LIMIT 1
        `).get(email);

      if (existing) {
        return void res.status(409).json({
          success: false,
          error:
            "An account with this email already exists.",
        });
      }

      const role =
        db.prepare(`
          SELECT id
          FROM roles
          WHERE code='sales'
            AND is_active=1
          LIMIT 1
        `).get() as
          | {
              id?: number;
            }
          | undefined;

      if (!role?.id) {
        return void res.status(409).json({
          success: false,
          error:
            'The "sales" role is not configured.',
        });
      }

      const hash =
        await hashPassword(
          password,
        );

      const result =
        db.prepare(`
          INSERT INTO users (
            role_id,
            name,
            email,
            phone,
            password_hash,
            email_verified_at,
            status,
            city,
            state,
            country,
            created_at,
            updated_at
          )
          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            CURRENT_TIMESTAMP,
            'active',
            ?,
            ?,
            ?,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )
        `).run(
          role.id,
          name,
          email,
          phone,
          hash,
          city,
          state,
          country,
        );

      const id =
        Number(
          result.lastInsertRowid,
        );

      const row =
        getRowById(
          "users",
          id,
        ) || {};

      audit(
        req,
        currentUserId(res),
        "admin.sales.created",
        "user",
        id,
        null,
        {
          ...row,
          password_hash:
            "[redacted]",
        },
      );

      const safeRow = {
        ...row,
      };

      delete safeRow.password_hash;

      res.status(201).json({
        success: true,
        sales: safeRow,
      });
    } catch (error) {
      console.error(
        "Admin create sales error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to create Sales account.",
      });
    }
  },
);

router.patch(
  "/sales/:id/status",
  (req, res) => {
    try {
      if (
        !requireTable(res, "users") ||
        !requireTable(res, "roles")
      ) {
        return;
      }

      const id =
        asPositiveId(
          req.params.id,
        );

      const status =
        statusText(
          req.body?.status,
        );

      if (!id) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid Sales id.",
        });
      }

      if (
        ![
          "active",
          "blocked",
          "suspended",
          "rejected",
        ].includes(status)
      ) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid Sales status.",
        });
      }

      const old =
        db.prepare(`
          SELECT u.*
          FROM users u
          JOIN roles r
            ON r.id=u.role_id
          WHERE u.id=?
            AND r.code='sales'
          LIMIT 1
        `).get(
          id,
        ) as
          | SqlRow
          | undefined;

      if (!old) {
        return void res.status(404).json({
          success: false,
          error:
            "Sales account not found.",
        });
      }

      db.prepare(`
        UPDATE users
        SET
          status=?,
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(
        status,
        id,
      );

      if (
        status !== "active" &&
        tableExists("sessions")
      ) {
        db.prepare(`
          DELETE FROM sessions
          WHERE user_id=?
        `).run(id);
      }

      const updated =
        getRowById(
          "users",
          id,
        ) || {};

      audit(
        req,
        currentUserId(res),
        "admin.sales.status_updated",
        "user",
        id,
        old,
        updated,
      );

      res.json({
        success: true,
        sales: updated,
      });
    } catch (error) {
      console.error(
        "Admin Sales status error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to update Sales status.",
      });
    }
  },
);

/* ============================================================================
 * Subscription Plans
 * ========================================================================== */

function serializePlan(
  row: SqlRow,
): JsonRecord {
  return {
    ...row,
    id: Number(row.id ?? 0),
    priceAmount: Number(
      row.price_amount ?? 0,
    ),
    durationDays: Number(
      row.duration_days ?? 30,
    ),
    audience:
      normalizeAudience(
        row.audience,
      ) ??
      normalizeText(
        row.audience,
        30,
      ),
    isActive:
      normalizeBoolean(
        row.is_active,
        true,
      ),
    listingEnabled:
      normalizeBoolean(
        row.listing_enabled,
        true,
      ),
    featuredListing:
      normalizeBoolean(
        row.featured_listing,
      ),
    prioritySupport:
      normalizeBoolean(
        row.priority_support,
      ),
    verificationBadge:
      normalizeBoolean(
        row.verification_badge,
      ),
    analyticsAccess:
      normalizeBoolean(
        row.analytics_access,
      ),
    homepagePromotion:
      normalizeBoolean(
        row.homepage_promotion,
      ),
    liveAartiEnabled:
      normalizeBoolean(
        row.live_aarti_enabled,
      ),
    enhancedSeo:
      normalizeBoolean(
        row.enhanced_seo,
      ),
    enhancedProfile:
      normalizeBoolean(
        row.enhanced_profile,
      ),
    whatsappEnquiry:
      normalizeBoolean(
        row.whatsapp_enquiry,
        true,
      ),
    features:
      parseJsonArray(
        row.plan_features_json,
      ),
    planFeaturesJson:
      String(
        row.plan_features_json ??
          "[]",
      ),
  };
}

function planPayload(
  req: Request,
  partial = false,
) {
  const body =
    req.body || {};

  const fields: Record<
    string,
    unknown
  > = {};

  const has = (
    key: string,
  ) =>
    Object.prototype.hasOwnProperty.call(
      body,
      key,
    );

  const audience =
    normalizeAudience(
      body.audience,
    );

  const name =
    normalizeText(
      body.name ??
        body.title,
      150,
    );

  if (
    !partial ||
    has("audience")
  ) {
    if (!audience) {
      return {
        fields,
        error:
          "Valid plan audience is required: pandit, temple, or ashram.",
      };
    }

    fields.audience =
      audience;
  }

  if (
    !partial ||
    has("name") ||
    has("title")
  ) {
    if (
      !PLAN_NAMES.includes(
        name as (typeof PLAN_NAMES)[number],
      )
    ) {
      return {
        fields,
        error:
          "Plan name must be Basic or Premium in the current schema.",
      };
    }

    fields.name = name;
  }

  if (
    !partial ||
    has("code")
  ) {
    const code =
      normalizeText(
        body.code,
        120,
      ).toLowerCase();

    if (
      !/^[a-z0-9][a-z0-9_-]{2,119}$/.test(
        code,
      )
    ) {
      return {
        fields,
        error:
          "Plan code must be 3-120 characters.",
      };
    }

    fields.code = code;
  }

  const nums: Array<
    [
      string,
      string,
      number,
      number,
    ]
  > = [
    [
      "priceAmount",
      "price_amount",
      0,
      Number.MAX_SAFE_INTEGER,
    ],
    [
      "durationDays",
      "duration_days",
      30,
      3650,
    ],
    [
      "leadLimit",
      "lead_limit",
      0,
      Number.MAX_SAFE_INTEGER,
    ],
    [
      "serviceLimit",
      "service_limit",
      0,
      Number.MAX_SAFE_INTEGER,
    ],
    [
      "serviceAreaLimit",
      "service_area_limit",
      0,
      Number.MAX_SAFE_INTEGER,
    ],
    [
      "galleryLimit",
      "gallery_limit",
      0,
      Number.MAX_SAFE_INTEGER,
    ],
    [
      "videoLimit",
      "video_limit",
      0,
      Number.MAX_SAFE_INTEGER,
    ],
    [
      "programLimit",
      "program_limit",
      0,
      Number.MAX_SAFE_INTEGER,
    ],
    [
      "sortOrder",
      "sort_order",
      0,
      Number.MAX_SAFE_INTEGER,
    ],
  ];

  for (
    const [
      input,
      column,
      fallback,
      max,
    ] of nums
  ) {
    if (
      !partial ||
      has(input) ||
      has(column)
    ) {
      fields[column] =
        normalizeInteger(
          body[input] ??
            body[column],
          fallback,
          column ===
            "duration_days"
            ? 1
            : 0,
          max,
        );
    }
  }

  if (
    !partial ||
    has("currency")
  ) {
    const currency =
      normalizeText(
        body.currency ||
          "INR",
        10,
      ).toUpperCase();

    if (currency !== "INR") {
      return {
        fields,
        error:
          "Subscription plans must use INR.",
      };
    }

    fields.currency =
      currency;
  }

  if (
    !partial ||
    has("billingInterval") ||
    has("billing_interval")
  ) {
    fields.billing_interval =
      normalizeBillingInterval(
        body.billingInterval ??
          body.billing_interval,
      );
  }

  const bools: Array<
    [
      string,
      string,
      boolean,
    ]
  > = [
    [
      "listingEnabled",
      "listing_enabled",
      true,
    ],
    [
      "featuredListing",
      "featured_listing",
      false,
    ],
    [
      "prioritySupport",
      "priority_support",
      false,
    ],
    [
      "verificationBadge",
      "verification_badge",
      false,
    ],
    [
      "analyticsAccess",
      "analytics_access",
      false,
    ],
    [
      "homepagePromotion",
      "homepage_promotion",
      false,
    ],
    [
      "liveAartiEnabled",
      "live_aarti_enabled",
      false,
    ],
    [
      "enhancedSeo",
      "enhanced_seo",
      false,
    ],
    [
      "enhancedProfile",
      "enhanced_profile",
      false,
    ],
    [
      "whatsappEnquiry",
      "whatsapp_enquiry",
      true,
    ],
    [
      "isActive",
      "is_active",
      true,
    ],
  ];

  for (
    const [
      input,
      column,
      fallback,
    ] of bools
  ) {
    if (
      !partial ||
      has(input) ||
      has(column)
    ) {
      fields[column] =
        boolInt(
          body[input] ??
            body[column],
          fallback,
        );
    }
  }

  if (
    !partial ||
    has("searchVisibility") ||
    has("search_visibility")
  ) {
    const visibility =
      normalizeText(
        body.searchVisibility ??
          body.search_visibility ??
          "standard",
        20,
      ).toLowerCase();

    fields.search_visibility =
      [
        "standard",
        "higher",
      ].includes(visibility)
        ? visibility
        : "standard";
  }

  if (
    !partial ||
    has("analyticsLevel") ||
    has("analytics_level")
  ) {
    const level =
      normalizeText(
        body.analyticsLevel ??
          body.analytics_level ??
          "none",
        20,
      ).toLowerCase();

    fields.analytics_level =
      [
        "none",
        "basic",
        "advanced",
      ].includes(level)
        ? level
        : "none";
  }

  if (
    !partial ||
    has("description")
  ) {
    fields.description =
      normalizeNullableText(
        body.description,
        5000,
      );
  }

  if (
    !partial ||
    has("features") ||
    has("planFeatures") ||
    has("plan_features_json")
  ) {
    fields.plan_features_json =
      body.features !==
      undefined
        ? jsonArray(body.features)
        : body.planFeatures !==
          undefined
        ? jsonArray(
            body.planFeatures,
          )
        : jsonArray(
            body.plan_features_json,
          );
  }

  if (
    !partial ||
    has("razorpayPlanId") ||
    has("razorpay_plan_id")
  ) {
    fields.razorpay_plan_id =
      normalizeNullableText(
        body.razorpayPlanId ??
          body.razorpay_plan_id,
        200,
      );
  }

  return {
    fields,
  };
}

router.get(
  "/plans",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "subscription_plans",
        )
      ) {
        return;
      }

      const audience =
        normalizeAudience(
          req.query.audience,
        );

      const activeOnly =
        req.query.activeOnly ===
        undefined
          ? false
          : normalizeBoolean(
              req.query.activeOnly,
            );

      const where: string[] = [];
      const params: unknown[] = [];

      if (audience) {
        where.push(
          "audience=?",
        );
        params.push(audience);
      }

      if (activeOnly) {
        where.push(
          "is_active=1",
        );
      }

      const rows =
        db.prepare(`
          SELECT *
          FROM subscription_plans
          ${
            where.length
              ? `WHERE ${where.join(
                  " AND ",
                )}`
              : ""
          }
          ORDER BY
            audience,
            sort_order,
            price_amount,
            id
        `).all(
          ...params,
        ) as SqlRow[];

      res.json({
        success: true,
        plans: rows.map(
          serializePlan,
        ),
        total: rows.length,
        filters: {
          audience,
          activeOnly,
        },
      });
    } catch (error) {
      console.error(
        "Admin plans error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load subscription plans.",
      });
    }
  },
);

router.get(
  "/plans/:id/prices",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "subscription_plan_prices",
        )
      ) {
        return;
      }

      const id =
        asPositiveId(
          req.params.id,
        );

      if (!id) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid plan id.",
        });
      }

      const rows =
        db.prepare(`
          SELECT *
          FROM subscription_plan_prices
          WHERE plan_id=?
          ORDER BY
            billing_interval,
            sort_order,
            id
        `).all(id) as SqlRow[];

      res.json({
        success: true,
        prices: rows,
      });
    } catch (error) {
      console.error(
        "Admin plan prices error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load plan price variants.",
      });
    }
  },
);

router.post(
  "/plans",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "subscription_plans",
        )
      ) {
        return;
      }

      const payload =
        planPayload(
          req,
          false,
        );

      if (payload.error) {
        return void res.status(400).json({
          success: false,
          error:
            payload.error,
        });
      }

      const fields =
        payload.fields;

      const columns =
        tableColumns(
          "subscription_plans",
        );

      const insertable =
        Object.keys(
          fields,
        ).filter(
          (column) =>
            columns.has(column),
        );

      if (!insertable.length) {
        return void res.status(400).json({
          success: false,
          error:
            "No supported plan fields are available in the current schema.",
        });
      }

      const code =
        String(fields.code);

      if (
        db.prepare(`
          SELECT id
          FROM subscription_plans
          WHERE code=?
          LIMIT 1
        `).get(code)
      ) {
        return void res.status(409).json({
          success: false,
          error:
            "A subscription plan with this code already exists.",
        });
      }

      if (
        db.prepare(`
          SELECT id
          FROM subscription_plans
          WHERE audience=?
            AND name=?
          LIMIT 1
        `).get(
          fields.audience,
          fields.name,
        )
      ) {
        return void res.status(409).json({
          success: false,
          error:
            "A plan with the same audience and name already exists.",
        });
      }

      const result =
        db.prepare(`
          INSERT INTO subscription_plans (
            ${insertable
              .map(quoteIdentifier)
              .join(",")},
            created_at,
            updated_at
          )
          VALUES (
            ${insertable.map(() => "?").join(",")},
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )
        `).run(
          ...insertable.map(
            (column) =>
              fields[column],
          ),
        );

      const id =
        Number(
          result.lastInsertRowid,
        );

      const row =
        getRowById(
          "subscription_plans",
          id,
        ) || {};

      if (
        tableExists(
          "subscription_plan_prices",
        )
      ) {
        db.prepare(`
          INSERT OR IGNORE INTO subscription_plan_prices (
            plan_id,
            billing_interval,
            duration_days,
            price_amount,
            currency,
            provider,
            razorpay_plan_id,
            is_active,
            sort_order,
            metadata_json,
            created_at,
            updated_at
          )
          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )
        `).run(
          id,
          String(
            fields.billing_interval ??
              "monthly",
          ),
          Number(
            fields.duration_days ??
              30,
          ),
          Number(
            fields.price_amount ??
              0,
          ),
          String(
            fields.currency ??
              "INR",
          ),
          "razorpay",
          fields.razorpay_plan_id ??
            null,
          Number(
            fields.is_active ??
              1,
          ),
          Number(
            fields.sort_order ??
              0,
          ),
          "{}",
        );
      }

      audit(
        req,
        currentUserId(res),
        "admin.subscription_plan.created",
        "subscription_plan",
        id,
        null,
        row,
      );

      res.status(201).json({
        success: true,
        plan:
          serializePlan(row),
        prices:
          tableExists(
            "subscription_plan_prices",
          )
            ? db.prepare(`
                SELECT *
                FROM subscription_plan_prices
                WHERE plan_id=?
                ORDER BY id
              `).all(id)
            : [],
      });
    } catch (error) {
      console.error(
        "Admin create plan error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to create subscription plan.",
      });
    }
  },
);

router.patch(
  "/plans/:id",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "subscription_plans",
        )
      ) {
        return;
      }

      const id =
        asPositiveId(
          req.params.id,
        );

      if (!id) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid plan id.",
        });
      }

      const old =
        getRowById(
          "subscription_plans",
          id,
        );

      if (!old) {
        return void res.status(404).json({
          success: false,
          error:
            "Subscription plan not found.",
        });
      }

      const payload =
        planPayload(
          req,
          true,
        );

      if (payload.error) {
        return void res.status(400).json({
          success: false,
          error:
            payload.error,
        });
      }

      const fields =
        payload.fields;

      if (
        fields.code !==
          undefined &&
        db.prepare(`
          SELECT id
          FROM subscription_plans
          WHERE code=?
            AND id<>?
          LIMIT 1
        `).get(
          fields.code,
          id,
        )
      ) {
        return void res.status(409).json({
          success: false,
          error:
            "Another plan already uses this code.",
        });
      }

      const planColumns =
        tableColumns(
          "subscription_plans",
        );

      const entries =
        Object.entries(
          fields,
        ).filter(
          ([column]) =>
            planColumns.has(column),
        );

      if (!entries.length) {
        return void res.status(400).json({
          success: false,
          error:
            "No supported plan fields were supplied.",
        });
      }

      const updates =
        entries.map(
          ([column]) =>
            `${quoteIdentifier(
              column,
            )}=?`,
        );

      const values =
        entries.map(
          ([, value]) => value,
        );

      updates.push(
        "updated_at=CURRENT_TIMESTAMP",
      );

      values.push(id);

      db.prepare(`
        UPDATE subscription_plans
        SET ${updates.join(",")}
        WHERE id=?
      `).run(
        ...values,
      );

      const updated =
        getRowById(
          "subscription_plans",
          id,
        ) || {};

      if (
        tableExists(
          "subscription_plan_prices",
        )
      ) {
        const monthly =
          db.prepare(`
            SELECT *
            FROM subscription_plan_prices
            WHERE plan_id=?
              AND billing_interval='monthly'
            LIMIT 1
          `).get(id) as
            | SqlRow
            | undefined;

        if (monthly) {
          const priceUpdates: string[] = [];
          const priceValues: unknown[] = [];

          const priceMappings: Array<
            [
              string,
              string,
            ]
          > = [
            [
              "price_amount",
              "price_amount",
            ],
            [
              "duration_days",
              "duration_days",
            ],
            [
              "currency",
              "currency",
            ],
            [
              "is_active",
              "is_active",
            ],
            [
              "razorpay_plan_id",
              "razorpay_plan_id",
            ],
          ];

          for (
            const [
              planColumn,
              priceColumn,
            ] of priceMappings
          ) {
            if (
              fields[planColumn] !==
              undefined
            ) {
              priceUpdates.push(
                `${priceColumn}=?`,
              );
              priceValues.push(
                fields[planColumn],
              );
            }
          }

          if (
            priceUpdates.length
          ) {
            priceUpdates.push(
              "updated_at=CURRENT_TIMESTAMP",
            );

            priceValues.push(
              monthly.id,
            );

            db.prepare(`
              UPDATE subscription_plan_prices
              SET ${priceUpdates.join(",")}
              WHERE id=?
            `).run(
              ...priceValues,
            );
          }
        }
      }

      audit(
        req,
        currentUserId(res),
        "admin.subscription_plan.updated",
        "subscription_plan",
        id,
        old,
        updated,
      );

      res.json({
        success: true,
        plan:
          serializePlan(
            updated,
          ),
      });
    } catch (error) {
      console.error(
        "Admin update plan error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to update subscription plan.",
      });
    }
  },
);

router.delete(
  "/plans/:id",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "subscription_plans",
        )
      ) {
        return;
      }

      const id =
        asPositiveId(
          req.params.id,
        );

      if (!id) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid plan id.",
        });
      }

      const old =
        getRowById(
          "subscription_plans",
          id,
        );

      if (!old) {
        return void res.status(404).json({
          success: false,
          error:
            "Subscription plan not found.",
        });
      }

      const referenced =
        [
          "pandit_subscriptions",
          "temple_subscriptions",
          "ashram_subscriptions",
        ].some(
          (table) =>
            tableExists(table) &&
            Boolean(
              db.prepare(`
                SELECT id
                FROM ${safeTableName(
                  table,
                )}
                WHERE plan_id=?
                LIMIT 1
              `).get(id),
            ),
        );

      if (referenced) {
        db.prepare(`
          UPDATE subscription_plans
          SET
            is_active=0,
            updated_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).run(id);

        if (
          tableExists(
            "subscription_plan_prices",
          )
        ) {
          db.prepare(`
            UPDATE subscription_plan_prices
            SET
              is_active=0,
              updated_at=CURRENT_TIMESTAMP
            WHERE plan_id=?
          `).run(id);
        }

        audit(
          req,
          currentUserId(res),
          "admin.subscription_plan.archived",
          "subscription_plan",
          id,
          old,
          {
            archived: true,
          },
        );

        return void res.json({
          success: true,
          archived: true,
          plan:
            serializePlan(
              getRowById(
                "subscription_plans",
                id,
              ) || old,
            ),
        });
      }

      db.transaction(() => {
        if (
          tableExists(
            "subscription_plan_prices",
          )
        ) {
          db.prepare(`
            DELETE FROM subscription_plan_prices
            WHERE plan_id=?
          `).run(id);
        }

        db.prepare(`
          DELETE FROM subscription_plans
          WHERE id=?
        `).run(id);
      })();

      audit(
        req,
        currentUserId(res),
        "admin.subscription_plan.deleted",
        "subscription_plan",
        id,
        old,
        null,
      );

      res.json({
        success: true,
        deleted: true,
      });
    } catch (error) {
      console.error(
        "Admin delete plan error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to delete subscription plan.",
      });
    }
  },
);

router.post(
  "/plans/:id/prices",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "subscription_plan_prices",
        ) ||
        !requireTable(
          res,
          "subscription_plans",
        )
      ) {
        return;
      }

      const planId =
        asPositiveId(
          req.params.id,
        );

      if (!planId) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid plan id.",
        });
      }

      const plan =
        getRowById(
          "subscription_plans",
          planId,
        );

      if (!plan) {
        return void res.status(404).json({
          success: false,
          error:
            "Subscription plan not found.",
        });
      }

      const interval =
        normalizeBillingInterval(
          req.body?.billingInterval ??
            req.body?.billing_interval,
        );

      const duration =
        normalizeInteger(
          req.body?.durationDays ??
            req.body?.duration_days,
          30,
          1,
          3650,
        );

      const price =
        normalizeMoney(
          req.body?.priceAmount ??
            req.body?.price_amount,
          Number(
            plan.price_amount ?? 0,
          ),
        );

      const currency =
        normalizeText(
          req.body?.currency ??
            plan.currency ??
            "INR",
          10,
        ).toUpperCase();

      const provider =
        normalizeText(
          req.body?.provider ??
            "razorpay",
          50,
        ).toLowerCase();

      if (currency !== "INR") {
        return void res.status(400).json({
          success: false,
          error:
            "Only INR is supported.",
        });
      }

      if (
        db.prepare(`
          SELECT id
          FROM subscription_plan_prices
          WHERE plan_id=?
            AND billing_interval=?
          LIMIT 1
        `).get(
          planId,
          interval,
        )
      ) {
        return void res.status(409).json({
          success: false,
          error:
            "A price variant already exists for this billing interval.",
        });
      }

      const result =
        db.prepare(`
          INSERT INTO subscription_plan_prices (
            plan_id,
            billing_interval,
            duration_days,
            price_amount,
            currency,
            provider,
            razorpay_plan_id,
            is_active,
            sort_order,
            metadata_json,
            created_at,
            updated_at
          )
          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )
        `).run(
          planId,
          interval,
          duration,
          price,
          currency,
          provider,
          normalizeNullableText(
            req.body?.razorpayPlanId ??
              req.body?.razorpay_plan_id,
            200,
          ),
          boolInt(
            req.body?.isActive,
            true,
          ),
          normalizeInteger(
            req.body?.sortOrder,
            0,
          ),
          jsonObject(
            req.body?.metadata,
          ),
        );

      const id =
        Number(
          result.lastInsertRowid,
        );

      const row =
        getRowById(
          "subscription_plan_prices",
          id,
        ) || {};

      audit(
        req,
        currentUserId(res),
        "admin.subscription_plan_price.created",
        "subscription_plan_price",
        id,
        null,
        row,
      );

      res.status(201).json({
        success: true,
        price: row,
      });
    } catch (error) {
      console.error(
        "Admin create plan price error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to create price variant.",
      });
    }
  },
);

router.patch(
  "/plan-prices/:id",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "subscription_plan_prices",
        )
      ) {
        return;
      }

      const id =
        asPositiveId(
          req.params.id,
        );

      if (!id) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid price id.",
        });
      }

      const old =
        getRowById(
          "subscription_plan_prices",
          id,
        );

      if (!old) {
        return void res.status(404).json({
          success: false,
          error:
            "Price variant not found.",
        });
      }

      const body =
        req.body || {};

      const updates: string[] = [];
      const values: unknown[] = [];

      if (
        Object.prototype.hasOwnProperty.call(
          body,
          "billingInterval",
        ) ||
        Object.prototype.hasOwnProperty.call(
          body,
          "billing_interval",
        )
      ) {
        updates.push(
          "billing_interval=?",
        );

        values.push(
          normalizeBillingInterval(
            body.billingInterval ??
              body.billing_interval,
          ),
        );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          body,
          "durationDays",
        ) ||
        Object.prototype.hasOwnProperty.call(
          body,
          "duration_days",
        )
      ) {
        updates.push(
          "duration_days=?",
        );

        values.push(
          normalizeInteger(
            body.durationDays ??
              body.duration_days,
            30,
            1,
            3650,
          ),
        );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          body,
          "priceAmount",
        ) ||
        Object.prototype.hasOwnProperty.call(
          body,
          "price_amount",
        )
      ) {
        updates.push(
          "price_amount=?",
        );

        values.push(
          normalizeMoney(
            body.priceAmount ??
              body.price_amount,
          ),
        );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          body,
          "currency",
        )
      ) {
        const currency =
          normalizeText(
            body.currency,
            10,
          ).toUpperCase();

        if (currency !== "INR") {
          return void res
            .status(400)
            .json({
              success: false,
              error:
                "Only INR is supported.",
            });
        }

        updates.push(
          "currency=?",
        );
        values.push(currency);
      }

      if (
        Object.prototype.hasOwnProperty.call(
          body,
          "provider",
        )
      ) {
        updates.push(
          "provider=?",
        );

        values.push(
          normalizeText(
            body.provider,
            50,
          ).toLowerCase(),
        );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          body,
          "razorpayPlanId",
        ) ||
        Object.prototype.hasOwnProperty.call(
          body,
          "razorpay_plan_id",
        )
      ) {
        updates.push(
          "razorpay_plan_id=?",
        );

        values.push(
          normalizeNullableText(
            body.razorpayPlanId ??
              body.razorpay_plan_id,
            200,
          ),
        );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          body,
          "isActive",
        )
      ) {
        updates.push(
          "is_active=?",
        );

        values.push(
          boolInt(
            body.isActive,
          ),
        );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          body,
          "sortOrder",
        )
      ) {
        updates.push(
          "sort_order=?",
        );

        values.push(
          normalizeInteger(
            body.sortOrder,
            0,
          ),
        );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          body,
          "metadata",
        )
      ) {
        updates.push(
          "metadata_json=?",
        );

        values.push(
          jsonObject(
            body.metadata,
          ),
        );
      }

      if (!updates.length) {
        return void res.status(400).json({
          success: false,
          error:
            "No supported price fields were supplied.",
        });
      }

      updates.push(
        "updated_at=CURRENT_TIMESTAMP",
      );

      values.push(id);

      db.prepare(`
        UPDATE subscription_plan_prices
        SET ${updates.join(",")}
        WHERE id=?
      `).run(
        ...values,
      );

      const updated =
        getRowById(
          "subscription_plan_prices",
          id,
        ) || {};

      audit(
        req,
        currentUserId(res),
        "admin.subscription_plan_price.updated",
        "subscription_plan_price",
        id,
        old,
        updated,
      );

      res.json({
        success: true,
        price: updated,
      });
    } catch (error) {
      console.error(
        "Admin update plan price error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to update price variant.",
      });
    }
  },
);

router.delete(
  "/plan-prices/:id",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "subscription_plan_prices",
        )
      ) {
        return;
      }

      const id =
        asPositiveId(
          req.params.id,
        );

      if (!id) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid price id.",
        });
      }

      const old =
        getRowById(
          "subscription_plan_prices",
          id,
        );

      if (!old) {
        return void res.status(404).json({
          success: false,
          error:
            "Price variant not found.",
        });
      }

      const referenced =
        [
          "pandit_subscriptions",
          "temple_subscriptions",
          "ashram_subscriptions",
        ].some(
          (table) =>
            tableExists(table) &&
            Boolean(
              db.prepare(`
                SELECT id
                FROM ${safeTableName(table)}
                WHERE subscription_plan_price_id=?
                LIMIT 1
              `).get(id),
            ),
        );

      if (referenced) {
        db.prepare(`
          UPDATE subscription_plan_prices
          SET
            is_active=0,
            updated_at=CURRENT_TIMESTAMP
          WHERE id=?
        `).run(id);

        audit(
          req,
          currentUserId(res),
          "admin.subscription_plan_price.archived",
          "subscription_plan_price",
          id,
          old,
          {
            archived: true,
          },
        );

        return void res.json({
          success: true,
          archived: true,
        });
      }

      db.prepare(`
        DELETE FROM subscription_plan_prices
        WHERE id=?
      `).run(id);

      audit(
        req,
        currentUserId(res),
        "admin.subscription_plan_price.deleted",
        "subscription_plan_price",
        id,
        old,
        null,
      );

      res.json({
        success: true,
        deleted: true,
      });
    } catch (error) {
      console.error(
        "Admin delete plan price error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to delete price variant.",
      });
    }
  },
);

/* ============================================================================
 * Unified Subscriptions
 * ========================================================================== */

function subscriptionConfig(
  audience: Audience,
) {
  if (audience === "pandit") {
    return {
      table:
        "pandit_subscriptions",
      ownerTable:
        "pandit_profiles",
      ownerIdColumn:
        "pandit_id",
      ownerAlias: "p",
      ownerName:
        "COALESCE(p.display_name,u.name,'')",
      ownerJoin: `
        JOIN pandit_profiles p
          ON p.id=s.pandit_id
        LEFT JOIN users u
          ON u.id=p.user_id
      `,
    };
  }

  if (audience === "temple") {
    return {
      table:
        "temple_subscriptions",
      ownerTable:
        "temples",
      ownerIdColumn:
        "temple_id",
      ownerAlias: "t",
      ownerName:
        "COALESCE(t.name,'')",
      ownerJoin: `
        JOIN temples t
          ON t.id=s.temple_id
        LEFT JOIN users u
          ON u.id=s.manager_user_id
      `,
    };
  }

  return {
    table:
      "ashram_subscriptions",
    ownerTable:
      "ashrams",
    ownerIdColumn:
      "ashram_id",
    ownerAlias: "a",
    ownerName:
      "COALESCE(a.name,'')",
    ownerJoin: `
      JOIN ashrams a
        ON a.id=s.ashram_id
      LEFT JOIN users u
        ON u.id=s.manager_user_id
    `,
  };
}

function serializeSubscription(
  row: SqlRow,
  audience: Audience,
): JsonRecord {
  let snapshot: unknown = {};

  try {
    const parsed =
      JSON.parse(
        String(
          row.plan_snapshot_json ??
            "{}",
        ),
      );

    snapshot =
      parsed &&
      typeof parsed === "object"
        ? parsed
        : {};
  } catch {
    snapshot = {};
  }

  const leadLimit =
    Number(
      row.lead_limit ?? 0,
    );

  const used =
    Number(
      row.leads_used ?? 0,
    );

  const expiresAt =
    row.expires_at
      ? String(row.expires_at)
      : null;

  const days =
    expiresAt
      ? Math.ceil(
          (
            new Date(
              expiresAt,
            ).getTime() -
            Date.now()
          ) /
            86400000,
        )
      : null;

  const ownerColumn =
    audience === "pandit"
      ? "pandit_id"
      : audience === "temple"
      ? "temple_id"
      : "ashram_id";

  return {
    ...row,
    id: Number(row.id ?? 0),
    subscriptionId:
      Number(row.id ?? 0),
    audience,
    ownerId:
      Number(
        row.owner_entity_id ??
          row[ownerColumn] ??
          0,
      ),
    ownerName:
      normalizeText(
        row.owner_name,
        250,
      ),
    accountName:
      normalizeText(
        row.account_name,
        250,
      ),
    accountEmail:
      normalizeText(
        row.account_email,
        255,
      ),
    accountPhone:
      normalizeText(
        row.account_phone,
        50,
      ),
    planId:
      Number(
        row.plan_id ?? 0,
      ),
    planCode:
      normalizeText(
        row.plan_code,
        120,
      ),
    planName:
      normalizeText(
        row.plan_name,
        150,
      ),
    planPrice:
      Number(
        row.price_amount ??
          row.plan_price ??
          0,
      ),
    currency:
      normalizeText(
        row.currency || "INR",
        10,
      ).toUpperCase(),
    status:
      statusText(row.status),
    leadLimit,
    leadsUsed: used,
    leadsRemaining:
      Math.max(
        0,
        leadLimit - used,
      ),
    subscriptionPlanPriceId:
      asPositiveId(
        row.subscription_plan_price_id,
      ),
    billingInterval:
      normalizeBillingInterval(
        row.billing_interval,
      ),
    durationDays:
      Number(
        row.duration_days ?? 30,
      ),
    startsAt:
      row.starts_at ?? null,
    expiresAt,
    daysToExpiry: days,
    paymentOrderId:
      asPositiveId(
        row.payment_order_id,
      ),
    paymentId:
      asPositiveId(
        row.payment_id,
      ),
    planSnapshot:
      snapshot,
  };
}

router.get(
  "/subscriptions",
  (req, res) => {
    try {
      const audiences =
        normalizeAudience(
          req.query.audience,
        )
          ? [
              normalizeAudience(
                req.query.audience,
              ) as Audience,
            ]
          : AUDIENCES.filter(
              (audience) =>
                tableExists(
                  subscriptionConfig(
                    audience,
                  ).table,
                ),
            );

      const status =
        normalizeSubscriptionStatus(
          req.query.status,
        );

      const search =
        normalizeText(
          req.query.search,
          180,
        );

      const result: SqlRow[] = [];

      for (const audience of audiences) {
        const c =
          subscriptionConfig(
            audience,
          );

        if (
          !tableExists(c.table) ||
          !tableExists(
            "subscription_plans",
          )
        ) {
          continue;
        }

        const where = ["1=1"];
        const params: unknown[] = [];

        if (status) {
          where.push(
            "s.status=?",
          );
          params.push(status);
        }

        if (search) {
          const pattern =
            `%${search}%`;

          where.push(`
            (
              CAST(s.id AS TEXT) LIKE ?
              OR LOWER(s.status) LIKE LOWER(?)
              OR LOWER(sp.code) LIKE LOWER(?)
              OR LOWER(sp.name) LIKE LOWER(?)
              OR LOWER(${c.ownerName}) LIKE LOWER(?)
              OR LOWER(COALESCE(u.email,'')) LIKE LOWER(?)
            )
          `);

          params.push(
            pattern,
            pattern,
            pattern,
            pattern,
            pattern,
            pattern,
          );
        }

        const rows =
          db.prepare(`
            SELECT
              s.*,
              '${audience}' audience,
              ${c.ownerAlias}.id owner_entity_id,
              ${c.ownerName} owner_name,
              u.name account_name,
              u.email account_email,
              u.phone account_phone,
              sp.code plan_code,
              sp.name plan_name,
              sp.price_amount plan_price
            FROM ${c.table} s
            JOIN subscription_plans sp
              ON sp.id=s.plan_id
            ${c.ownerJoin}
            WHERE ${where.join(" AND ")}
            ORDER BY
              COALESCE(
                s.expires_at,
                s.created_at
              ) DESC,
              s.id DESC
          `).all(
            ...params,
          ) as SqlRow[];

        result.push(
          ...rows,
        );
      }

      result.sort(
        (a, b) =>
          String(
            b.expires_at ??
              b.created_at,
          ).localeCompare(
            String(
              a.expires_at ??
                a.created_at,
            ),
          ) ||
          Number(b.id ?? 0) -
            Number(a.id ?? 0),
      );

      const page =
        normalizeInteger(
          req.query.page,
          1,
          1,
          100000,
        );

      const limit =
        normalizeInteger(
          req.query.limit,
          50,
          1,
          200,
        );

      const offset =
        (page - 1) * limit;

      const paginated =
        result.slice(
          offset,
          offset + limit,
        );

      res.json({
        success: true,
        subscriptions:
          paginated.map(
            (row) =>
              serializeSubscription(
                row,
                normalizeAudience(
                  row.audience,
                ) || "pandit",
              ),
          ),
        pagination: {
          page,
          limit,
          offset,
          total: result.length,
          totalPages:
            Math.ceil(
              result.length / limit,
            ),
        },
        filters: {
          audience:
            normalizeAudience(
              req.query.audience,
            ),
          status,
          search:
            search || null,
        },
      });
    } catch (error) {
      console.error(
        "Admin subscriptions error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load subscriptions.",
      });
    }
  },
);

router.get(
  "/subscriptions/stats",
  (_req, res) => {
    try {
      const totals = {
        subscriptions: 0,
        active: 0,
        pending: 0,
        expired: 0,
        cancelled: 0,
        paused: 0,
        paymentFailed: 0,
        totalLeadLimit: 0,
        totalLeadsUsed: 0,
        activeValue: 0,
      };

      const byAudience:
        JsonRecord[] = [];

      for (
        const audience of AUDIENCES
      ) {
        const c =
          subscriptionConfig(
            audience,
          );

        if (!tableExists(c.table)) {
          continue;
        }

        const row =
          db.prepare(`
            SELECT
              COUNT(*) subscriptions,
              SUM(
                CASE
                  WHEN status='active'
                  THEN 1
                  ELSE 0
                END
              ) active,
              SUM(
                CASE
                  WHEN status='pending'
                  THEN 1
                  ELSE 0
                END
              ) pending,
              SUM(
                CASE
                  WHEN status='expired'
                  THEN 1
                  ELSE 0
                END
              ) expired,
              SUM(
                CASE
                  WHEN status='cancelled'
                  THEN 1
                  ELSE 0
                END
              ) cancelled,
              SUM(
                CASE
                  WHEN status='paused'
                  THEN 1
                  ELSE 0
                END
              ) paused,
              SUM(
                CASE
                  WHEN status='payment_failed'
                  THEN 1
                  ELSE 0
                END
              ) payment_failed,
              COALESCE(
                SUM(lead_limit),
                0
              ) total_lead_limit,
              COALESCE(
                SUM(leads_used),
                0
              ) total_leads_used,
              COALESCE(
                SUM(
                  CASE
                    WHEN status='active'
                    THEN price_amount
                    ELSE 0
                  END
                ),
                0
              ) active_value
            FROM ${c.table}
          `).get() as SqlRow;

        const item = {
          audience,
          subscriptions:
            Number(
              row.subscriptions ?? 0,
            ),
          active:
            Number(row.active ?? 0),
          pending:
            Number(row.pending ?? 0),
          expired:
            Number(row.expired ?? 0),
          cancelled:
            Number(
              row.cancelled ?? 0,
            ),
          paused:
            Number(row.paused ?? 0),
          paymentFailed:
            Number(
              row.payment_failed ??
                0,
            ),
          totalLeadLimit:
            Number(
              row.total_lead_limit ??
                0,
            ),
          totalLeadsUsed:
            Number(
              row.total_leads_used ??
                0,
            ),
          activeValue:
            Number(
              row.active_value ?? 0,
            ),
        };

        byAudience.push(item);

        totals.subscriptions +=
          item.subscriptions;
        totals.active +=
          item.active;
        totals.pending +=
          item.pending;
        totals.expired +=
          item.expired;
        totals.cancelled +=
          item.cancelled;
        totals.paused +=
          item.paused;
        totals.paymentFailed +=
          item.paymentFailed;
        totals.totalLeadLimit +=
          item.totalLeadLimit;
        totals.totalLeadsUsed +=
          item.totalLeadsUsed;
        totals.activeValue +=
          item.activeValue;
      }

      res.json({
        success: true,
        totals,
        byAudience,
      });
    } catch (error) {
      console.error(
        "Admin subscription stats error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load subscription statistics.",
      });
    }
  },
);

function subscriptionRow(
  audience: Audience,
  id: number,
) {
  const c =
    subscriptionConfig(
      audience,
    );

  if (
    !tableExists(c.table) ||
    !tableExists(
      "subscription_plans",
    )
  ) {
    return undefined;
  }

  return db.prepare(`
    SELECT
      s.*,
      '${audience}' audience,
      ${c.ownerAlias}.id owner_entity_id,
      ${c.ownerName} owner_name,
      u.name account_name,
      u.email account_email,
      u.phone account_phone,
      sp.code plan_code,
      sp.name plan_name,
      sp.price_amount plan_price
    FROM ${c.table} s
    JOIN subscription_plans sp
      ON sp.id=s.plan_id
    ${c.ownerJoin}
    WHERE s.id=?
    LIMIT 1
  `).get(id) as
    | SqlRow
    | undefined;
}

router.get(
  "/subscriptions/:id",
  (req, res) => {
    try {
      const id =
        asPositiveId(
          req.params.id,
        );

      const audience =
        normalizeAudience(
          req.query.audience,
        );

      if (
        !id ||
        !audience
      ) {
        return void res.status(400).json({
          success: false,
          error:
            "Valid subscription id and audience are required.",
        });
      }

      const row =
        subscriptionRow(
          audience,
          id,
        );

      if (!row) {
        return void res.status(404).json({
          success: false,
          error:
            "Subscription not found.",
        });
      }

      res.json({
        success: true,
        subscription:
          serializeSubscription(
            row,
            audience,
          ),
      });
    } catch (error) {
      console.error(
        "Admin subscription detail error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load subscription.",
      });
    }
  },
);

router.patch(
  "/subscriptions/:id/status",
  (req, res) => {
    try {
      const id =
        asPositiveId(
          req.params.id,
        );

      const audience =
        normalizeAudience(
          req.body?.audience ??
            req.query.audience,
        );

      const status =
        normalizeSubscriptionStatus(
          req.body?.status,
        );

      if (
        !id ||
        !audience ||
        !status
      ) {
        return void res.status(400).json({
          success: false,
          error:
            "Valid subscription id, audience and status are required.",
        });
      }

      const c =
        subscriptionConfig(
          audience,
        );

      if (
        !requireTable(
          res,
          c.table,
        )
      ) {
        return;
      }

      const old =
        getRowById(
          c.table,
          id,
        );

      if (!old) {
        return void res.status(404).json({
          success: false,
          error:
            "Subscription not found.",
        });
      }

      const columns =
        tableColumns(c.table);

      const updates = [
        "status=?",
      ];

      const values: unknown[] = [
        status,
      ];

      if (
        status === "active" &&
        !old.starts_at &&
        columns.has("starts_at")
      ) {
        updates.push(
          "starts_at=CURRENT_TIMESTAMP",
        );
      }

      if (
        status === "active" &&
        !old.expires_at &&
        columns.has("expires_at")
      ) {
        if (
          tableExists(
            "subscription_plan_prices",
          )
        ) {
          updates.push(`
            expires_at=datetime(
              CURRENT_TIMESTAMP,
              '+' ||
              COALESCE(
                (
                  SELECT duration_days
                  FROM subscription_plan_prices
                  WHERE id=subscription_plan_price_id
                ),
                (
                  SELECT duration_days
                  FROM subscription_plans
                  WHERE id=plan_id
                ),
                30
              ) ||
              ' days'
            )
          `);
        } else {
          updates.push(`
            expires_at=datetime(
              CURRENT_TIMESTAMP,
              '+' ||
              COALESCE(
                (
                  SELECT duration_days
                  FROM subscription_plans
                  WHERE id=plan_id
                ),
                30
              ) ||
              ' days'
            )
          `);
        }
      }

      if (
        columns.has("updated_at")
      ) {
        updates.push(
          "updated_at=CURRENT_TIMESTAMP",
        );
      }

      values.push(id);

      db.prepare(`
        UPDATE ${c.table}
        SET ${updates.join(",")}
        WHERE id=?
      `).run(
        ...values,
      );

      const updated =
        getRowById(
          c.table,
          id,
        ) || {};

      if (
        tableExists(
          "subscription_events",
        )
      ) {
        db.prepare(`
          INSERT INTO subscription_events (
            subscription_type,
            subscription_id,
            payment_order_id,
            payment_id,
            user_id,
            event_type,
            old_status,
            new_status,
            old_expires_at,
            new_expires_at,
            notes,
            metadata_json,
            created_at
          )
          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            'admin_status_changed',
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            CURRENT_TIMESTAMP
          )
        `).run(
          audience,
          id,
          asPositiveId(
            updated.payment_order_id,
          ),
          asPositiveId(
            updated.payment_id,
          ),
          currentUserId(res) ||
            null,
          statusText(
            old.status,
          ) || null,
          status,
          old.expires_at ??
            null,
          updated.expires_at ??
            null,
          "Subscription status changed by Super Admin.",
          JSON.stringify({
            actor_user_id:
              currentUserId(res),
            audience,
          }),
        );
      }

      audit(
        req,
        currentUserId(res),
        "admin.subscription.status_updated",
        "subscription",
        id,
        old,
        updated,
      );

      res.json({
        success: true,
        subscription:
          serializeSubscription(
            {
              ...updated,
              audience,
            },
            audience,
          ),
      });
    } catch (error) {
      console.error(
        "Admin subscription status error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to update subscription status.",
      });
    }
  },
);

router.post(
  "/subscriptions/:id/cancel",
  (req, res) => {
    try {
      const id =
        asPositiveId(
          req.params.id,
        );

      const audience =
        normalizeAudience(
          req.body?.audience ??
            req.query.audience,
        );

      if (
        !id ||
        !audience
      ) {
        return void res.status(400).json({
          success: false,
          error:
            "Valid subscription id and audience are required.",
        });
      }

      const c =
        subscriptionConfig(
          audience,
        );

      if (
        !requireTable(
          res,
          c.table,
        )
      ) {
        return;
      }

      const old =
        getRowById(
          c.table,
          id,
        );

      if (!old) {
        return void res.status(404).json({
          success: false,
          error:
            "Subscription not found.",
        });
      }

      if (
        statusText(
          old.status,
        ) === "cancelled"
      ) {
        return void res.json({
          success: true,
          message:
            "Subscription is already cancelled.",
          subscription:
            serializeSubscription(
              {
                ...old,
                audience,
              },
              audience,
            ),
        });
      }

      const updates = [
        "status='cancelled'",
      ];

      if (
        tableColumns(c.table).has(
          "updated_at",
        )
      ) {
        updates.push(
          "updated_at=CURRENT_TIMESTAMP",
        );
      }

      db.prepare(`
        UPDATE ${c.table}
        SET ${updates.join(",")}
        WHERE id=?
      `).run(id);

      const updated =
        getRowById(
          c.table,
          id,
        ) || {};

      if (
        tableExists(
          "subscription_events",
        )
      ) {
        db.prepare(`
          INSERT INTO subscription_events (
            subscription_type,
            subscription_id,
            payment_order_id,
            payment_id,
            user_id,
            event_type,
            old_status,
            new_status,
            old_expires_at,
            new_expires_at,
            notes,
            metadata_json,
            created_at
          )
          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            'admin_cancelled',
            ?,
            'cancelled',
            ?,
            ?,
            ?,
            ?,
            CURRENT_TIMESTAMP
          )
        `).run(
          audience,
          id,
          asPositiveId(
            updated.payment_order_id,
          ),
          asPositiveId(
            updated.payment_id,
          ),
          currentUserId(res) ||
            null,
          statusText(
            old.status,
          ) || null,
          old.expires_at ??
            null,
          updated.expires_at ??
            null,
          "Subscription cancelled by Super Admin.",
          JSON.stringify({
            actor_user_id:
              currentUserId(res),
            audience,
          }),
        );
      }

      audit(
        req,
        currentUserId(res),
        "admin.subscription.cancelled",
        "subscription",
        id,
        old,
        updated,
      );

      res.json({
        success: true,
        subscription:
          serializeSubscription(
            {
              ...updated,
              audience,
            },
            audience,
          ),
      });
    } catch (error) {
      console.error(
        "Admin cancel subscription error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to cancel subscription.",
      });
    }
  },
);

/* ============================================================================
 * Payments
 * ========================================================================== */

function serializePayment(
  row: SqlRow,
): JsonRecord {
  return {
    ...row,
    id: Number(row.id ?? 0),
    paymentNumber:
      row.payment_number,
    ownerType:
      row.entity_type,
    ownerId:
      row.entity_id,
    panditId:
      row.pandit_id,
    templeId:
      row.temple_id,
    ashramId:
      row.ashram_id,
    subscriptionId:
      row.subscription_id ??
      row.pandit_subscription_id ??
      row.temple_subscription_id ??
      row.ashram_subscription_id,
    planId: row.plan_id,
    subscriptionPlanPriceId:
      row.subscription_plan_price_id,
    amount:
      Number(row.amount ?? 0),
    amountPaise:
      Number(
        row.amount_paise ?? 0,
      ),
    currency:
      normalizeText(
        row.currency || "INR",
        10,
      ).toUpperCase(),
    provider:
      normalizeText(
        row.provider ||
          "razorpay",
        50,
      ).toLowerCase(),
    status:
      statusText(row.status),
    razorpayOrderId:
      row.provider_order_id,
    razorpayPaymentId:
      row.provider_payment_id,
  };
}

router.get(
  "/payments",
  (req, res) => {
    try {
      if (!requireTable(res, "payments")) {
        return;
      }

      const {
        limit,
        offset,
      } = parseListParams(req);

      const status =
        statusText(
          req.query.status,
        );

      const provider =
        statusText(
          req.query.provider,
        );

      const where = ["1=1"];
      const params: unknown[] = [];

      if (status) {
        where.push("status=?");
        params.push(status);
      }

      if (provider) {
        where.push(
          "LOWER(provider)=?",
        );
        params.push(provider);
      }

      const rows =
        db.prepare(`
          SELECT *
          FROM payments
          WHERE ${where.join(" AND ")}
          ORDER BY id DESC
          LIMIT ?
          OFFSET ?
        `).all(
          ...params,
          limit,
          offset,
        ) as SqlRow[];

      const total =
        Number(
          (
            db.prepare(`
              SELECT COUNT(*) value
              FROM payments
              WHERE ${where.join(" AND ")}
            `).get(
              ...params,
            ) as
              | {
                  value?: unknown;
                }
              | undefined
          )?.value ?? 0,
        );

      res.json({
        success: true,
        payments:
          rows.map(
            serializePayment,
          ),
        pagination: {
          limit,
          offset,
          total,
          totalPages:
            Math.ceil(
              total / limit,
            ),
        },
      });
    } catch (error) {
      console.error(
        "Admin payments error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load payments.",
      });
    }
  },
);

router.get(
  "/payment-orders",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "payment_orders",
        )
      ) {
        return;
      }

      const {
        limit,
        offset,
      } = parseListParams(req);

      const status =
        statusText(
          req.query.status,
        );

      const where =
        status
          ? "status=?"
          : "1=1";

      const params =
        status
          ? [status]
          : [];

      const rows =
        db.prepare(`
          SELECT *
          FROM payment_orders
          WHERE ${where}
          ORDER BY id DESC
          LIMIT ?
          OFFSET ?
        `).all(
          ...params,
          limit,
          offset,
        ) as SqlRow[];

      res.json({
        success: true,
        orders: rows,
        paymentOrders: rows,
        pagination: {
          limit,
          offset,
        },
      });
    } catch (error) {
      console.error(
        "Admin payment orders error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load payment orders.",
      });
    }
  },
);

router.get(
  "/payment-links",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "payment_links",
        )
      ) {
        return;
      }

      const {
        limit,
        offset,
      } = parseListParams(req);

      const rows =
        db.prepare(`
          SELECT *
          FROM payment_links
          ORDER BY id DESC
          LIMIT ?
          OFFSET ?
        `).all(
          limit,
          offset,
        ) as SqlRow[];

      res.json({
        success: true,
        links: rows,
        paymentLinks: rows,
        pagination: {
          limit,
          offset,
        },
      });
    } catch (error) {
      console.error(
        "Admin payment links error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load payment links.",
      });
    }
  },
);

router.get(
  "/payments/config",
  (_req, res) => {
    const key =
      normalizeText(
        process.env.RAZORPAY_KEY_ID,
        200,
      );

    const secret =
      normalizeText(
        process.env.RAZORPAY_KEY_SECRET,
        300,
      );

    const merchant =
      normalizeText(
        process.env.RAZORPAY_MERCHANT_ID,
        200,
      );

    const webhook =
      normalizeText(
        process.env.RAZORPAY_WEBHOOK_SECRET,
        300,
      );

    res.json({
      success: true,
      razorpay: {
        configured:
          Boolean(
            key && secret,
          ),
        mode:
          normalizeText(
            process.env.RAZORPAY_MODE ||
              "test",
            20,
          ).toLowerCase() ===
          "live"
            ? "live"
            : "test",
        keyIdMasked:
          maskSecret(key),
        merchantIdPresent:
          Boolean(merchant),
        merchantIdMasked:
          maskSecret(merchant),
        secretConfigured:
          Boolean(secret),
        webhookConfigured:
          Boolean(webhook),
        currency:
          normalizeText(
            process.env.RAZORPAY_CURRENCY ||
              "INR",
            10,
          ).toUpperCase(),
        apiBaseUrl:
          normalizeText(
            process.env.RAZORPAY_API_BASE_URL ||
              "https://api.razorpay.com/v1",
            300,
          ),
      },
    });
  },
);

router.patch(
  "/payments/:id/status",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "payments",
        )
      ) {
        return;
      }

      const id =
        asPositiveId(
          req.params.id,
        );

      const status =
        statusText(
          req.body?.status,
        );

      if (!id) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid payment id.",
        });
      }

      if (
        ![
          "created",
          "pending",
          "authorized",
          "paid",
          "captured",
          "failed",
          "refunded",
          "partially_refunded",
          "cancelled",
        ].includes(status)
      ) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid payment status.",
        });
      }

      const old =
        getRowById(
          "payments",
          id,
        );

      if (!old) {
        return void res.status(404).json({
          success: false,
          error:
            "Payment not found.",
        });
      }

      const updates = [
        "status=?",
      ];

      const values: unknown[] = [
        status,
      ];

      if (
        tableColumns("payments").has(
          "updated_at",
        )
      ) {
        updates.push(
          "updated_at=CURRENT_TIMESTAMP",
        );
      }

      values.push(id);

      db.prepare(`
        UPDATE payments
        SET ${updates.join(",")}
        WHERE id=?
      `).run(
        ...values,
      );

      const updated =
        getRowById(
          "payments",
          id,
        ) || {};

      audit(
        req,
        currentUserId(res),
        "admin.payment.status_updated",
        "payment",
        id,
        old,
        updated,
      );

      res.json({
        success: true,
        payment:
          serializePayment(
            updated,
          ),
      });
    } catch (error) {
      console.error(
        "Admin payment status error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to update payment status.",
      });
    }
  },
);

/* ============================================================================
 * Leads / CRM
 * ========================================================================== */

router.get(
  "/leads",
  (req, res) => {
    try {
      if (!requireTable(res, "leads")) {
        return;
      }

      const {
        limit,
        offset,
      } = parseListParams(req);

      const columns =
        tableColumns("leads");

      const where = ["1=1"];
      const params: unknown[] = [];

      const search =
        normalizeText(
          req.query.search,
          180,
        );

      if (search) {
        const searchableColumns = [
          "lead_number",
          "lead_type",
          "name",
          "email",
          "phone",
          "service_type",
          "puja_type",
          "message",
          "source_type",
          "source_page",
          "source_form",
          "form_key",
          "country",
          "state",
          "district",
          "city",
          "status",
          "priority",
        ].filter(
          (column) =>
            columns.has(column),
        );

        if (
          searchableColumns.length
        ) {
          where.push(`
            (
              ${searchableColumns
                .map(
                  (column) =>
                    `LOWER(COALESCE(${quoteIdentifier(
                      column,
                    )},'')) LIKE LOWER(?)`,
                )
                .join(" OR ")}
            )
          `);

          for (
            let index = 0;
            index <
            searchableColumns.length;
            index += 1
          ) {
            params.push(
              `%${search}%`,
            );
          }
        }
      }

      const filterPairs: Array<
        [
          unknown,
          string[],
        ]
      > = [
        [
          req.query.status,
          ["status"],
        ],
        [
          req.query.leadType ??
            req.query.type,
          ["lead_type", "type"],
        ],
        [
          req.query.sourceType ??
            req.query.source,
          ["source_type", "source"],
        ],
        [
          req.query.serviceType,
          ["service_type"],
        ],
        [
          req.query.pujaType,
          ["puja_type"],
        ],
        [
          req.query.country,
          ["country"],
        ],
        [
          req.query.state,
          ["state"],
        ],
        [
          req.query.district,
          ["district"],
        ],
        [
          req.query.city,
          ["city"],
        ],
        [
          req.query.priority,
          ["priority"],
        ],
        [
          req.query.temperature ??
            req.query.leadTemperature,
          ["lead_temperature"],
        ],
      ];

      for (
        const [
          value,
          candidates,
        ] of filterPairs
      ) {
        const text =
          normalizeText(
            value,
            120,
          );

        const column =
          firstExistingColumn(
            columns,
            candidates,
          );

        if (text && column) {
          where.push(
            `${quoteIdentifier(
              column,
            )}=?`,
          );

          params.push(text);
        }
      }

      const owner =
        asPositiveId(
          req.query.ownerUserId,
        );

      if (
        owner &&
        columns.has("owner_user_id")
      ) {
        where.push(
          "owner_user_id=?",
        );

        params.push(owner);
      }

      const from =
        normalizeText(
          req.query.from ??
            req.query.dateFrom,
          40,
        );

      const to =
        normalizeText(
          req.query.to ??
            req.query.dateTo,
          40,
        );

      if (
        from &&
        columns.has("created_at")
      ) {
        where.push(
          "created_at>=?",
        );

        params.push(from);
      }

      if (
        to &&
        columns.has("created_at")
      ) {
        where.push(
          "created_at<=?",
        );

        params.push(to);
      }

      const whereSql =
        where.join(" AND ");

      const total =
        Number(
          (
            db.prepare(`
              SELECT COUNT(*) value
              FROM leads
              WHERE ${whereSql}
            `).get(
              ...params,
            ) as
              | {
                  value?: unknown;
                }
              | undefined
          )?.value ?? 0,
        );

      const rows =
        db.prepare(`
          SELECT *
          FROM leads
          WHERE ${whereSql}
          ORDER BY id DESC
          LIMIT ?
          OFFSET ?
        `).all(
          ...params,
          limit,
          offset,
        ) as SqlRow[];

      res.json({
        success: true,
        leads: rows,
        pagination: {
          limit,
          offset,
          page:
            Math.floor(
              offset / limit,
            ) + 1,
          total,
          totalPages:
            Math.ceil(
              total / limit,
            ),
        },
      });
    } catch (error) {
      console.error(
        "Admin leads error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load leads.",
      });
    }
  },
);

router.get(
  "/leads/:id",
  (req, res) => {
    try {
      if (!requireTable(res, "leads")) {
        return;
      }

      const id =
        asPositiveId(
          req.params.id,
        );

      if (!id) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid lead id.",
        });
      }

      const lead =
        getRowById(
          "leads",
          id,
        );

      if (!lead) {
        return void res.status(404).json({
          success: false,
          error:
            "Lead not found.",
        });
      }

      const related: JsonRecord =
        {};

      const relations: Array<
        [
          string,
          string,
          string,
        ]
      > = [
        [
          "temple_id",
          "temples",
          "temple",
        ],
        [
          "requested_pandit_id",
          "pandit_profiles",
          "pandit",
        ],
        [
          "ashram_id",
          "ashrams",
          "ashram",
        ],
        [
          "puja_service_id",
          "puja_services",
          "pujaService",
        ],
        [
          "yatra_package_id",
          "yatra_packages",
          "yatraPackage",
        ],
        [
          "event_id",
          "events",
          "event",
        ],
        [
          "course_id",
          "courses",
          "course",
        ],
        [
          "spiritual_place_id",
          "spiritual_places",
          "spiritualPlace",
        ],
      ];

      for (
        const [
          column,
          table,
          key,
        ] of relations
      ) {
        const foreignId =
          asPositiveId(
            lead[column],
          );

        if (
          foreignId &&
          tableExists(table)
        ) {
          related[key] =
            getRowById(
              table,
              foreignId,
            ) || null;
        }
      }

      const sourceSubmissionId =
        asPositiveId(
          lead.source_submission_id,
        );

      const submission =
        sourceSubmissionId &&
        tableExists(
          "form_submissions",
        )
          ? getRowById(
              "form_submissions",
              sourceSubmissionId,
            ) || null
          : null;

      res.json({
        success: true,
        lead,
        related,
        formSubmission:
          submission,
      });
    } catch (error) {
      console.error(
        "Admin lead detail error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load lead.",
      });
    }
  },
);

/* --------------------------------------------------------------------------
 * Update complete lead / CRM fields
 * ------------------------------------------------------------------------ */

router.patch(
  "/leads/:id",
  (req, res) => {
    try {
      if (!requireTable(res, "leads")) {
        return;
      }

      const id =
        asPositiveId(
          req.params.id,
        );

      if (!id) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid lead id.",
        });
      }

      const old =
        getRowById(
          "leads",
          id,
        );

      if (!old) {
        return void res.status(404).json({
          success: false,
          error:
            "Lead not found.",
        });
      }

      const columns =
        tableColumns("leads");

      const body =
        req.body || {};

      const updates: string[] = [];
      const values: unknown[] = [];

      /* --------------------------------------------------------------------
       * Status
       * ------------------------------------------------------------------ */

      if (
        Object.prototype.hasOwnProperty.call(
          body,
          "status",
        )
      ) {
        const status =
          statusText(
            body.status,
          );

        if (
          !LEAD_STATUSES.includes(
            status as (typeof LEAD_STATUSES)[number],
          )
        ) {
          return void res.status(400).json({
            success: false,
            error:
              "Invalid lead status.",
          });
        }

        if (
          columns.has("status")
        ) {
          updates.push(
            "status=?",
          );

          values.push(status);
        }

        if (
          status === "converted" &&
          columns.has(
            "converted_at",
          )
        ) {
          updates.push(
            "converted_at=CURRENT_TIMESTAMP",
          );
        }

        if (
          status !== "converted" &&
          columns.has(
            "converted_at",
          ) &&
          old.converted_at
        ) {
          updates.push(
            "converted_at=NULL",
          );
        }

        if (
          status === "closed" &&
          columns.has("closed_at")
        ) {
          updates.push(
            "closed_at=CURRENT_TIMESTAMP",
          );
        }

        if (
          status !== "closed" &&
          columns.has("closed_at") &&
          old.closed_at
        ) {
          updates.push(
            "closed_at=NULL",
          );
        }
      }

      /* --------------------------------------------------------------------
       * Priority
       * ------------------------------------------------------------------ */

      if (
        Object.prototype.hasOwnProperty.call(
          body,
          "priority",
        ) &&
        columns.has("priority")
      ) {
        const priority =
          statusText(
            body.priority,
          );

        if (
          !LEAD_PRIORITIES.includes(
            priority as (typeof LEAD_PRIORITIES)[number],
          )
        ) {
          return void res.status(400).json({
            success: false,
            error:
              "Invalid lead priority.",
          });
        }

        updates.push(
          "priority=?",
        );

        values.push(
          priority,
        );
      }

      /* --------------------------------------------------------------------
       * Lead temperature
       * ------------------------------------------------------------------ */

      const hasTemperature =
        Object.prototype.hasOwnProperty.call(
          body,
          "leadTemperature",
        ) ||
        Object.prototype.hasOwnProperty.call(
          body,
          "temperature",
        );

      if (
        hasTemperature &&
        columns.has(
          "lead_temperature",
        )
      ) {
        const temperature =
          statusText(
            body.leadTemperature ??
              body.temperature,
          );

        if (
          !LEAD_TEMPERATURES.includes(
            temperature as (typeof LEAD_TEMPERATURES)[number],
          )
        ) {
          return void res.status(400).json({
            success: false,
            error:
              "Invalid lead temperature.",
          });
        }

        updates.push(
          "lead_temperature=?",
        );

        values.push(
          temperature,
        );
      }

      /* --------------------------------------------------------------------
       * Lead score
       * ------------------------------------------------------------------ */

      if (
        Object.prototype.hasOwnProperty.call(
          body,
          "leadScore",
        ) &&
        columns.has("lead_score")
      ) {
        updates.push(
          "lead_score=?",
        );

        values.push(
          normalizeInteger(
            body.leadScore,
            0,
            0,
            1000,
          ),
        );
      }

      /* --------------------------------------------------------------------
       * Owner / Sales user
       * ------------------------------------------------------------------ */

      if (
        Object.prototype.hasOwnProperty.call(
          body,
          "ownerUserId",
        ) &&
        columns.has(
          "owner_user_id",
        )
      ) {
        let ownerId:
          | number
          | null = null;

        if (
          body.ownerUserId !== null &&
          body.ownerUserId !== undefined &&
          body.ownerUserId !== ""
        ) {
          ownerId =
            asPositiveId(
              body.ownerUserId,
            );

          if (!ownerId) {
            return void res
              .status(400)
              .json({
                success: false,
                error:
                  "Invalid ownerUserId.",
              });
          }

          if (
            tableExists("users") &&
            tableExists("roles")
          ) {
            const owner =
              db.prepare(`
                SELECT
                  u.id,
                  u.status,
                  r.code role
                FROM users u
                JOIN roles r
                  ON r.id=u.role_id
                WHERE u.id=?
                LIMIT 1
              `).get(
                ownerId,
              ) as
                | SqlRow
                | undefined;

            if (!owner) {
              return void res
                .status(404)
                .json({
                  success: false,
                  error:
                    "Lead owner user not found.",
                });
            }

            if (
              owner.role !==
                "sales" &&
              owner.role !==
                "super_admin"
            ) {
              return void res
                .status(409)
                .json({
                  success: false,
                  error:
                    "Lead owner must be a Sales user or Super Admin.",
                });
            }

            if (
              owner.status !==
                "active"
            ) {
              return void res
                .status(409)
                .json({
                  success: false,
                  error:
                    "Lead owner account must be active.",
                });
            }
          }
        }

        updates.push(
          "owner_user_id=?",
        );

        values.push(
          ownerId,
        );
      }

      /* --------------------------------------------------------------------
       * Contact preference
       * ------------------------------------------------------------------ */

      if (
        Object.prototype.hasOwnProperty.call(
          body,
          "contactPreference",
        ) &&
        columns.has(
          "contact_preference",
        )
      ) {
        const preference =
          statusText(
            body.contactPreference,
          );

        if (
          preference &&
          ![
            "call",
            "whatsapp",
            "email",
            "any",
          ].includes(preference)
        ) {
          return void res.status(400).json({
            success: false,
            error:
              "Invalid contact preference.",
          });
        }

        updates.push(
          "contact_preference=?",
        );

        values.push(
          preference || null,
        );
      }

      /* --------------------------------------------------------------------
       * General text fields
       * ------------------------------------------------------------------ */

      const textFields: Array<
        [
          string,
          string,
          number,
        ]
      > = [
        [
          "message",
          "message",
          10000,
        ],
        [
          "preferredDate",
          "preferred_date",
          40,
        ],
        [
          "preferredTime",
          "preferred_time",
          80,
        ],
      ];

      for (
        const [
          input,
          column,
          max,
        ] of textFields
      ) {
        if (
          Object.prototype.hasOwnProperty.call(
            body,
            input,
          ) &&
          columns.has(column)
        ) {
          updates.push(
            `${quoteIdentifier(
              column,
            )}=?`,
          );

          values.push(
            normalizeNullableText(
              body[input],
              max,
            ),
          );
        }
      }

      /* --------------------------------------------------------------------
       * Activity / updated timestamps
       * ------------------------------------------------------------------ */

      if (
        columns.has(
          "last_activity_at",
        )
      ) {
        updates.push(
          "last_activity_at=CURRENT_TIMESTAMP",
        );
      }

      if (
        columns.has("updated_at")
      ) {
        updates.push(
          "updated_at=CURRENT_TIMESTAMP",
        );
      }

      if (!updates.length) {
        return void res.status(400).json({
          success: false,
          error:
            "No supported lead fields were supplied.",
        });
      }

      values.push(id);

      db.prepare(`
        UPDATE leads
        SET ${updates.join(",")}
        WHERE id=?
      `).run(
        ...values,
      );

      const updated =
        getRowById(
          "leads",
          id,
        ) || {};

      audit(
        req,
        currentUserId(res),
        "admin.lead.updated",
        "lead",
        id,
        old,
        updated,
      );

      res.json({
        success: true,
        lead: updated,
      });
    } catch (error) {
      console.error(
        "Admin lead update error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to update lead.",
      });
    }
  },
);

/* --------------------------------------------------------------------------
 * Update only lead status
 * ------------------------------------------------------------------------ */

router.patch(
  "/leads/:id/status",
  (req, res) => {
    try {
      if (!requireTable(res, "leads")) {
        return;
      }

      const status =
        statusText(
          req.body?.status,
        );

      if (
        !LEAD_STATUSES.includes(
          status as (typeof LEAD_STATUSES)[number],
        )
      ) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid lead status.",
        });
      }

      const id =
        asPositiveId(
          req.params.id,
        );

      if (!id) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid lead id.",
        });
      }

      const old =
        getRowById(
          "leads",
          id,
        );

      if (!old) {
        return void res.status(404).json({
          success: false,
          error:
            "Lead not found.",
        });
      }

      const columns =
        tableColumns("leads");

      const updates = [
        "status=?",
      ];

      const values: unknown[] = [
        status,
      ];

      if (
        status === "converted" &&
        columns.has(
          "converted_at",
        )
      ) {
        updates.push(
          "converted_at=CURRENT_TIMESTAMP",
        );
      }

      if (
        status !== "converted" &&
        columns.has(
          "converted_at",
        ) &&
        old.converted_at
      ) {
        updates.push(
          "converted_at=NULL",
        );
      }

      if (
        status === "closed" &&
        columns.has("closed_at")
      ) {
        updates.push(
          "closed_at=CURRENT_TIMESTAMP",
        );
      }

      if (
        status !== "closed" &&
        columns.has("closed_at") &&
        old.closed_at
      ) {
        updates.push(
          "closed_at=NULL",
        );
      }

      if (
        columns.has(
          "last_activity_at",
        )
      ) {
        updates.push(
          "last_activity_at=CURRENT_TIMESTAMP",
        );
      }

      if (
        columns.has("updated_at")
      ) {
        updates.push(
          "updated_at=CURRENT_TIMESTAMP",
        );
      }

      values.push(id);

      db.prepare(`
        UPDATE leads
        SET ${updates.join(",")}
        WHERE id=?
      `).run(
        ...values,
      );

      const updated =
        getRowById(
          "leads",
          id,
        ) || {};

      audit(
        req,
        currentUserId(res),
        "admin.lead.status_updated",
        "lead",
        id,
        old,
        updated,
      );

      res.json({
        success: true,
        lead: updated,
      });
    } catch (error) {
      console.error(
        "Admin lead status error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to update lead status.",
      });
    }
  },
);

/* ============================================================================
 * Lead Stats
 * ========================================================================== */

router.get(
  "/lead-stats",
  (_req, res) => {
    try {
      if (!requireTable(res, "leads")) {
        return;
      }

      const columns =
        tableColumns("leads");

      const byStatus =
        db.prepare(`
          SELECT
            status,
            COUNT(*) count
          FROM leads
          GROUP BY status
          ORDER BY count DESC
        `).all() as SqlRow[];

      const byType =
        columns.has("lead_type")
          ? (db.prepare(`
              SELECT
                lead_type,
                COUNT(*) count
              FROM leads
              GROUP BY lead_type
              ORDER BY count DESC
            `).all() as SqlRow[])
          : [];

      const bySource =
        columns.has("source_type")
          ? (db.prepare(`
              SELECT
                source_type,
                COUNT(*) count
              FROM leads
              GROUP BY source_type
              ORDER BY count DESC
            `).all() as SqlRow[])
          : [];

      const byLocation =
        db.prepare(`
          SELECT
            country,
            state,
            district,
            city,
            COUNT(*) count
          FROM leads
          GROUP BY
            country,
            state,
            district,
            city
          ORDER BY count DESC
          LIMIT 100
        `).all() as SqlRow[];

      const byService =
        db.prepare(`
          SELECT
            service_type,
            puja_type,
            COUNT(*) count
          FROM leads
          GROUP BY
            service_type,
            puja_type
          ORDER BY count DESC
          LIMIT 100
        `).all() as SqlRow[];

      res.json({
        success: true,
        byStatus,
        byType,
        bySource,
        byLocation,
        byService,
      });
    } catch (error) {
      console.error(
        "Admin lead stats error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load lead statistics.",
      });
    }
  },
);

/* ============================================================================
 * Puja Services
 * ========================================================================== */

function serializePuja(
  row: SqlRow,
): JsonRecord {
  return {
    ...row,
    id: Number(row.id ?? 0),
    descriptionJson:
      parseJsonArray(
        row.description_json,
      ),
    samagri:
      parseJsonArray(
        row.samagri_json,
      ),
    benefits:
      parseJsonArray(
        row.benefits_json,
      ),
    suitableFor:
      parseJsonArray(
        row.suitable_for_json,
      ),
    gallery:
      parseJsonArray(
        row.gallery_json,
      ),
    faqs:
      parseJsonArray(
        row.faqs_json,
      ),
    priceFromAmount:
      row.price_from_amount ==
      null
        ? null
        : Number(
            row.price_from_amount,
          ),
    currency:
      normalizeText(
        row.currency || "INR",
        10,
      ).toUpperCase(),
    bookingEnabled:
      normalizeBoolean(
        row.booking_enabled,
        true,
      ),
    featured:
      normalizeBoolean(
        row.featured,
      ),
    status:
      statusText(row.status),
  };
}

function pujaPayload(
  req: Request,
  partial = false,
) {
  const body =
    req.body || {};

  const fields: Record<
    string,
    unknown
  > = {};

  const has = (
    key: string,
  ) =>
    Object.prototype.hasOwnProperty.call(
      body,
      key,
    );

  if (!partial || has("slug")) {
    fields.slug =
      normalizeText(
        body.slug,
        140,
      );
  }

  if (!partial || has("name")) {
    fields.name =
      normalizeText(
        body.name,
        180,
      );
  }

  if (!partial || has("category")) {
    fields.category =
      normalizeNullableText(
        body.category,
        100,
      );
  }

  const textFields: Array<
    [
      string,
      string,
      number,
    ]
  > = [
    ["tagline", "tagline", 500],
    [
      "shortDescription",
      "short_description",
      1000,
    ],
    [
      "description",
      "description",
      20000,
    ],
    ["deity", "deity", 120],
    [
      "sampradaya",
      "sampradaya",
      120,
    ],
    [
      "durationText",
      "duration_text",
      120,
    ],
    [
      "samagriDetails",
      "samagri_details",
      5000,
    ],
    ["image", "image", 2000],
    [
      "videoUrl",
      "video_url",
      2000,
    ],
    [
      "priceDisplay",
      "price_display",
      120,
    ],
  ];

  for (
    const [
      input,
      column,
      max,
    ] of textFields
  ) {
    if (has(input)) {
      fields[column] =
        normalizeNullableText(
          body[input],
          max,
        );
    }
  }

  if (has("descriptionJson")) {
    fields.description_json =
      jsonArray(
        body.descriptionJson,
      );
  }

  if (
    has("samagri") ||
    has("samagriJson")
  ) {
    fields.samagri_json =
      jsonArray(
        body.samagri ??
          body.samagriJson,
      );
  }

  if (
    has("benefits") ||
    has("benefitsJson")
  ) {
    fields.benefits_json =
      jsonArray(
        body.benefits ??
          body.benefitsJson,
      );
  }

  if (
    has("suitableFor") ||
    has("suitableForJson")
  ) {
    fields.suitable_for_json =
      jsonArray(
        body.suitableFor ??
          body.suitableForJson,
      );
  }

  if (
    has("gallery") ||
    has("galleryJson")
  ) {
    fields.gallery_json =
      jsonArray(
        body.gallery ??
          body.galleryJson,
      );
  }

  if (
    has("faqs") ||
    has("faqsJson")
  ) {
    fields.faqs_json =
      jsonArray(
        body.faqs ??
          body.faqsJson,
      );
  }

  if (has("samagriIncluded")) {
    fields.samagri_included =
      boolInt(
        body.samagriIncluded,
      );
  }

  if (
    has("priceFromAmount") ||
    has("price")
  ) {
    fields.price_from_amount =
      body.priceFromAmount ==
        null &&
      body.price == null
        ? null
        : normalizeMoney(
            body.priceFromAmount ??
              body.price,
          );
  }

  if (has("currency")) {
    fields.currency =
      normalizeText(
        body.currency ||
          "INR",
        10,
      ).toUpperCase();
  }

  if (has("availabilityScope")) {
    fields.availability_scope =
      normalizeNullableText(
        body.availabilityScope,
        100,
      );
  }

  if (has("defaultLocationId")) {
    fields.default_location_id =
      asPositiveId(
        body.defaultLocationId,
      );
  }

  if (has("bookingEnabled")) {
    fields.booking_enabled =
      boolInt(
        body.bookingEnabled,
      );
  }

  if (
    has("featured") ||
    has("isFeatured")
  ) {
    fields.featured =
      boolInt(
        body.featured ??
          body.isFeatured,
      );
  }

  if (has("status")) {
    const status =
      statusText(
        body.status,
      );

    if (
      ![
        "draft",
        "published",
        "unpublished",
      ].includes(status)
    ) {
      return {
        fields,
        error:
          "Invalid Puja status.",
      };
    }

    fields.status =
      status;
  }

  if (has("sortOrder")) {
    fields.sort_order =
      normalizeInteger(
        body.sortOrder,
        0,
      );
  }

  return {
    fields,
  };
}

router.get(
  "/pujas",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "puja_services",
        )
      ) {
        return;
      }

      const {
        limit,
        offset,
      } = parseListParams(req);

      const columns =
        tableColumns(
          "puja_services",
        );

      const where = ["1=1"];
      const params: unknown[] = [];

      const search =
        normalizeText(
          req.query.search,
          160,
        );

      if (search) {
        const searchable = [
          "name",
          "slug",
          "category",
          "tagline",
          "short_description",
          "deity",
          "sampradaya",
        ].filter(
          (column) =>
            columns.has(column),
        );

        if (searchable.length) {
          where.push(`
            (
              ${searchable
                .map(
                  (column) =>
                    `${quoteIdentifier(
                      column,
                    )} LIKE ?`,
                )
                .join(" OR ")}
            )
          `);

          for (
            let index = 0;
            index < searchable.length;
            index += 1
          ) {
            params.push(
              `%${search}%`,
            );
          }
        }
      }

      const status =
        statusText(
          req.query.status,
        );

      if (
        status &&
        columns.has("status")
      ) {
        where.push(
          "status=?",
        );
        params.push(status);
      }

      const category =
        normalizeText(
          req.query.category,
          100,
        );

      if (
        category &&
        columns.has("category")
      ) {
        where.push(
          "category=?",
        );
        params.push(category);
      }

      const rows =
        db.prepare(`
          SELECT *
          FROM puja_services
          WHERE ${where.join(" AND ")}
          ORDER BY
            sort_order ASC,
            id DESC
          LIMIT ?
          OFFSET ?
        `).all(
          ...params,
          limit,
          offset,
        ) as SqlRow[];

      const total =
        Number(
          (
            db.prepare(`
              SELECT COUNT(*) value
              FROM puja_services
              WHERE ${where.join(" AND ")}
            `).get(
              ...params,
            ) as
              | {
                  value?: unknown;
                }
              | undefined
          )?.value ?? 0,
        );

      res.json({
        success: true,
        pujas:
          rows.map(
            serializePuja,
          ),
        pagination: {
          limit,
          offset,
          total,
          totalPages:
            Math.ceil(
              total / limit,
            ),
        },
      });
    } catch (error) {
      console.error(
        "Admin pujas error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load Puja services.",
      });
    }
  },
);

router.post(
  "/pujas",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "puja_services",
        )
      ) {
        return;
      }

      const payload =
        pujaPayload(
          req,
          false,
        );

      if (payload.error) {
        return void res.status(400).json({
          success: false,
          error:
            payload.error,
        });
      }

      if (
        !payload.fields.slug ||
        !payload.fields.name
      ) {
        return void res.status(400).json({
          success: false,
          error:
            "Puja slug and name are required.",
        });
      }

      const columns =
        tableColumns(
          "puja_services",
        );

      const insertable =
        Object.keys(
          payload.fields,
        ).filter(
          (column) =>
            columns.has(column),
        );

      if (!insertable.length) {
        return void res.status(400).json({
          success: false,
          error:
            "No supported Puja fields are available.",
        });
      }

      if (
        db.prepare(`
          SELECT id
          FROM puja_services
          WHERE slug=?
          LIMIT 1
        `).get(
          payload.fields.slug,
        )
      ) {
        return void res.status(409).json({
          success: false,
          error:
            "A Puja with this slug already exists.",
        });
      }

      const result =
        db.prepare(`
          INSERT INTO puja_services (
            ${insertable
              .map(quoteIdentifier)
              .join(",")},
            created_at,
            updated_at
          )
          VALUES (
            ${insertable.map(() => "?").join(",")},
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )
        `).run(
          ...insertable.map(
            (column) =>
              payload.fields[
                column
              ],
          ),
        );

      const id =
        Number(
          result.lastInsertRowid,
        );

      const row =
        getRowById(
          "puja_services",
          id,
        ) || {};

      audit(
        req,
        currentUserId(res),
        "admin.puja.created",
        "puja_service",
        id,
        null,
        row,
      );

      res.status(201).json({
        success: true,
        puja:
          serializePuja(row),
      });
    } catch (error) {
      console.error(
        "Admin create Puja error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to create Puja.",
      });
    }
  },
);

router.patch(
  "/pujas/:id",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "puja_services",
        )
      ) {
        return;
      }

      const id =
        asPositiveId(
          req.params.id,
        );

      if (!id) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid Puja id.",
        });
      }

      const old =
        getRowById(
          "puja_services",
          id,
        );

      if (!old) {
        return void res.status(404).json({
          success: false,
          error:
            "Puja not found.",
        });
      }

      const payload =
        pujaPayload(
          req,
          true,
        );

      if (payload.error) {
        return void res.status(400).json({
          success: false,
          error:
            payload.error,
        });
      }

      const columns =
        tableColumns(
          "puja_services",
        );

      const entries =
        Object.entries(
          payload.fields,
        ).filter(
          ([column]) =>
            columns.has(column),
        );

      if (!entries.length) {
        return void res.status(400).json({
          success: false,
          error:
            "No supported Puja fields were supplied.",
        });
      }

      db.prepare(`
        UPDATE puja_services
        SET
          ${entries
            .map(
              ([column]) =>
                `${quoteIdentifier(
                  column,
                )}=?`,
            )
            .join(",")},
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(
        ...entries.map(
          ([, value]) => value,
        ),
        id,
      );

      const updated =
        getRowById(
          "puja_services",
          id,
        ) || {};

      audit(
        req,
        currentUserId(res),
        "admin.puja.updated",
        "puja_service",
        id,
        old,
        updated,
      );

      res.json({
        success: true,
        puja:
          serializePuja(
            updated,
          ),
      });
    } catch (error) {
      console.error(
        "Admin update Puja error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to update Puja.",
      });
    }
  },
);

router.delete(
  "/pujas/:id",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "puja_services",
        )
      ) {
        return;
      }

      const id =
        asPositiveId(
          req.params.id,
        );

      if (!id) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid Puja id.",
        });
      }

      const old =
        getRowById(
          "puja_services",
          id,
        );

      if (!old) {
        return void res.status(404).json({
          success: false,
          error:
            "Puja not found.",
        });
      }

      db.prepare(`
        DELETE FROM puja_services
        WHERE id=?
      `).run(id);

      audit(
        req,
        currentUserId(res),
        "admin.puja.deleted",
        "puja_service",
        id,
        old,
        null,
      );

      res.json({
        success: true,
        deleted: true,
      });
    } catch (error) {
      console.error(
        "Admin delete Puja error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to delete Puja.",
      });
    }
  },
);

/* ============================================================================
 * Videos
 * ========================================================================== */

function videoPayload(
  req: Request,
  partial = false,
) {
  const body =
    req.body || {};

  const fields: Record<
    string,
    unknown
  > = {};

  const has = (
    key: string,
  ) =>
    Object.prototype.hasOwnProperty.call(
      body,
      key,
    );

  if (!partial || has("slug")) {
    fields.slug =
      normalizeText(
        body.slug,
        140,
      );
  }

  if (!partial || has("title")) {
    fields.title =
      normalizeText(
        body.title,
        220,
      );
  }

  const text: Array<
    [
      string,
      string,
      number,
    ]
  > = [
    [
      "shortDescription",
      "short_description",
      1000,
    ],
    [
      "description",
      "description",
      20000,
    ],
    [
      "videoId",
      "video_id",
      300,
    ],
    [
      "watchUrl",
      "watch_url",
      1500,
    ],
    [
      "videoProvider",
      "video_provider",
      50,
    ],
    [
      "videoUrl",
      "video_url",
      1500,
    ],
    [
      "embedUrl",
      "embed_url",
      1500,
    ],
    [
      "externalVideoId",
      "external_video_id",
      300,
    ],
    [
      "thumbnailUrl",
      "thumbnail_url",
      1500,
    ],
    [
      "image",
      "image",
      1500,
    ],
    [
      "durationText",
      "duration_text",
      100,
    ],
    [
      "category",
      "category",
      100,
    ],
  ];

  for (
    const [
      input,
      column,
      max,
    ] of text
  ) {
    if (has(input)) {
      fields[column] =
        normalizeNullableText(
          body[input],
          max,
        );
    }
  }

  if (has("provider")) {
    const provider =
      normalizeText(
        body.provider,
        30,
      ).toLowerCase();

    if (
      ![
        "youtube",
        "vimeo",
        "self-hosted",
        "external",
      ].includes(provider)
    ) {
      return {
        fields,
        error:
          "Invalid video provider.",
      };
    }

    fields.provider =
      provider;
  }

  if (has("durationSeconds")) {
    fields.duration_seconds =
      body.durationSeconds ==
        null ||
      body.durationSeconds ===
        ""
        ? null
        : normalizeInteger(
            body.durationSeconds,
            0,
            0,
            10_000_000,
          );
  }

  if (
    !partial &&
    !has("videoUrl")
  ) {
    fields.video_url =
      normalizeText(
        body.watchUrl,
        1500,
      );
  }

  if (
    Object.prototype.hasOwnProperty.call(
      fields,
      "video_url",
    ) &&
    fields.video_url == null
  ) {
    fields.video_url = "";
  }

  if (
    has("tags") ||
    has("tagsJson")
  ) {
    fields.tags_json =
      jsonArray(
        body.tags ??
          body.tagsJson,
      );
  }

  const ids: Array<
    [
      string,
      string,
    ]
  > = [
    [
      "relatedEntityId",
      "related_entity_id",
    ],
    [
      "relatedTempleId",
      "related_temple_id",
    ],
    [
      "relatedPanditId",
      "related_pandit_id",
    ],
    [
      "relatedAshramId",
      "related_ashram_id",
    ],
    [
      "relatedPujaId",
      "related_puja_id",
    ],
    [
      "relatedEventId",
      "related_event_id",
    ],
    [
      "relatedCourseId",
      "related_course_id",
    ],
    [
      "locationId",
      "location_id",
    ],
    [
      "countryLocationId",
      "country_location_id",
    ],
    [
      "stateLocationId",
      "state_location_id",
    ],
    [
      "districtLocationId",
      "district_location_id",
    ],
    [
      "cityLocationId",
      "city_location_id",
    ],
  ];

  for (
    const [
      input,
      column,
    ] of ids
  ) {
    if (has(input)) {
      fields[column] =
        asPositiveId(
          body[input],
        );
    }
  }

  if (has("status")) {
    const status =
      statusText(
        body.status,
      );

    if (
      ![
        "draft",
        "published",
        "unpublished",
        "scheduled",
      ].includes(status)
    ) {
      return {
        fields,
        error:
          "Invalid video status.",
      };
    }

    fields.status = status;
  }

  if (
    has("featured") ||
    has("isFeatured")
  ) {
    fields.featured =
      boolInt(
        body.featured ??
          body.isFeatured,
      );
  }

  if (has("isActive")) {
    fields.is_active =
      boolInt(
        body.isActive,
      );
  }

  if (has("sortOrder")) {
    fields.sort_order =
      normalizeInteger(
        body.sortOrder,
        0,
      );
  }

  if (has("publishedAt")) {
    fields.published_at =
      normalizeNullableText(
        body.publishedAt,
        100,
      );
  }

  return {
    fields,
  };
}

router.get(
  "/videos",
  (req, res) => {
    try {
      if (!requireTable(res, "videos")) {
        return;
      }

      const {
        limit,
        offset,
      } = parseListParams(req);

      const status =
        statusText(
          req.query.status,
        );

      const where = ["1=1"];
      const params: unknown[] = [];

      if (status) {
        where.push(
          "LOWER(status)=?",
        );
        params.push(status);
      }

      const rows =
        db.prepare(`
          SELECT *
          FROM videos
          WHERE ${where.join(" AND ")}
          ORDER BY
            sort_order ASC,
            COALESCE(
              published_at,
              created_at
            ) DESC,
            id DESC
          LIMIT ?
          OFFSET ?
        `).all(
          ...params,
          limit,
          offset,
        ) as SqlRow[];

      const total =
        Number(
          (
            db.prepare(`
              SELECT COUNT(*) value
              FROM videos
              WHERE ${where.join(" AND ")}
            `).get(
              ...params,
            ) as
              | {
                  value?: unknown;
                }
              | undefined
          )?.value ?? 0,
        );

      res.json({
        success: true,
        videos: rows,
        listing: "all",
        pagination: {
          limit,
          offset,
          total,
          totalPages:
            Math.ceil(
              total / limit,
            ),
        },
      });
    } catch (error) {
      console.error(
        "Admin videos error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load videos.",
      });
    }
  },
);

router.post(
  "/videos",
  (req, res) => {
    try {
      if (!requireTable(res, "videos")) {
        return;
      }

      const payload =
        videoPayload(
          req,
          false,
        );

      if (payload.error) {
        return void res.status(400).json({
          success: false,
          error:
            payload.error,
        });
      }

      if (
        !payload.fields.slug ||
        !payload.fields.title
      ) {
        return void res.status(400).json({
          success: false,
          error:
            "Video slug and title are required.",
        });
      }

      if (
        db.prepare(`
          SELECT id
          FROM videos
          WHERE slug=?
          LIMIT 1
        `).get(
          payload.fields.slug,
        )
      ) {
        return void res.status(409).json({
          success: false,
          error:
            "A video with this slug already exists.",
        });
      }

      const columns =
        tableColumns("videos");

      const fields: Record<
        string,
        unknown
      > = {
        provider:
          "youtube",
        video_provider:
          "youtube",
        video_url: "",
        tags_json: "[]",
        status: "draft",
        featured: 0,
        is_active: 1,
        sort_order: 0,
        ...payload.fields,
      };

      const insertable =
        Object.keys(
          fields,
        ).filter(
          (column) =>
            columns.has(column),
        );

      if (!insertable.length) {
        return void res.status(400).json({
          success: false,
          error:
            "No supported video fields are available.",
        });
      }

      const result =
        db.prepare(`
          INSERT INTO videos (
            ${insertable
              .map(quoteIdentifier)
              .join(",")},
            created_at,
            updated_at
          )
          VALUES (
            ${insertable.map(() => "?").join(",")},
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )
        `).run(
          ...insertable.map(
            (column) =>
              fields[column],
          ),
        );

      const id =
        Number(
          result.lastInsertRowid,
        );

      const row =
        getRowById(
          "videos",
          id,
        ) || {};

      audit(
        req,
        currentUserId(res),
        "admin.video.created",
        "video",
        id,
        null,
        row,
      );

      res.status(201).json({
        success: true,
        video: row,
      });
    } catch (error) {
      console.error(
        "Admin create video error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to create video.",
      });
    }
  },
);

router.patch(
  "/videos/:id",
  (req, res) => {
    try {
      if (!requireTable(res, "videos")) {
        return;
      }

      const id =
        asPositiveId(
          req.params.id,
        );

      if (!id) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid video id.",
        });
      }

      const old =
        getRowById(
          "videos",
          id,
        );

      if (!old) {
        return void res.status(404).json({
          success: false,
          error:
            "Video not found.",
        });
      }

      const payload =
        videoPayload(
          req,
          true,
        );

      if (payload.error) {
        return void res.status(400).json({
          success: false,
          error:
            payload.error,
        });
      }

      const columns =
        tableColumns("videos");

      const entries =
        Object.entries(
          payload.fields,
        ).filter(
          ([column]) =>
            columns.has(column),
        );

      if (!entries.length) {
        return void res.status(400).json({
          success: false,
          error:
            "No supported video fields were supplied.",
        });
      }

      db.prepare(`
        UPDATE videos
        SET
          ${entries
            .map(
              ([column]) =>
                `${quoteIdentifier(
                  column,
                )}=?`,
            )
            .join(",")},
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(
        ...entries.map(
          ([, value]) => value,
        ),
        id,
      );

      const updated =
        getRowById(
          "videos",
          id,
        ) || {};

      audit(
        req,
        currentUserId(res),
        "admin.video.updated",
        "video",
        id,
        old,
        updated,
      );

      res.json({
        success: true,
        video: updated,
      });
    } catch (error) {
      console.error(
        "Admin update video error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to update video.",
      });
    }
  },
);

router.delete(
  "/videos/:id",
  (req, res) => {
    try {
      if (!requireTable(res, "videos")) {
        return;
      }

      const id =
        asPositiveId(
          req.params.id,
        );

      if (!id) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid video id.",
        });
      }

      const old =
        getRowById(
          "videos",
          id,
        );

      if (!old) {
        return void res.status(404).json({
          success: false,
          error:
            "Video not found.",
        });
      }

      db.prepare(`
        DELETE FROM videos
        WHERE id=?
      `).run(id);

      audit(
        req,
        currentUserId(res),
        "admin.video.deleted",
        "video",
        id,
        old,
        null,
      );

      res.json({
        success: true,
        deleted: true,
      });
    } catch (error) {
      console.error(
        "Admin delete video error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to delete video.",
      });
    }
  },
);

/* ============================================================================
 * SEO
 * ========================================================================== */

function normalizeSeoPageType(
  value: unknown,
): string {
  const pageType =
    normalizeText(
      value || "custom",
      50,
    ).toLowerCase();

  return SEO_PAGE_TYPES.includes(
    pageType as (typeof SEO_PAGE_TYPES)[number],
  )
    ? pageType
    : "custom";
}

function seoEntryPayload(
  req: Request,
  partial = false,
) {
  const body =
    req.body || {};

  const fields: Record<
    string,
    unknown
  > = {};

  const has = (
    key: string,
  ) =>
    Object.prototype.hasOwnProperty.call(
      body,
      key,
    );

  if (
    !partial ||
    has("path") ||
    has("routePath")
  ) {
    fields.path =
      pathOnly(
        body.path ??
          body.routePath,
      );
  }

  if (
    !partial ||
    has("pageType")
  ) {
    fields.page_type =
      normalizeSeoPageType(
        body.pageType,
      );
  }

  const textFields: Array<
    [
      string,
      string,
      number,
    ]
  > = [
    [
      "entityType",
      "entity_type",
      100,
    ],
    [
      "seoTitle",
      "seo_title",
      300,
    ],
    [
      "title",
      "seo_title",
      300,
    ],
    [
      "metaDescription",
      "meta_description",
      2500,
    ],
    [
      "description",
      "meta_description",
      2500,
    ],
    ["h1", "h1", 300],
    [
      "introContent",
      "intro_content",
      10000,
    ],
    [
      "bodyContent",
      "body_content",
      50000,
    ],
    [
      "canonicalUrl",
      "canonical_url",
      1500,
    ],
    ["ogTitle", "og_title", 300],
    [
      "ogDescription",
      "og_description",
      500,
    ],
    ["ogImage", "og_image", 1500],
    [
      "twitterCard",
      "twitter_card",
      50,
    ],
    [
      "twitterTitle",
      "twitter_title",
      300,
    ],
    [
      "twitterDescription",
      "twitter_description",
      500,
    ],
    [
      "twitterImage",
      "twitter_image",
      1500,
    ],
    ["robots", "robots", 120],
    [
      "schemaType",
      "schema_type",
      100,
    ],
    [
      "imageAlt",
      "image_alt",
      500,
    ],
    [
      "focusKeyword",
      "focus_keyword",
      250,
    ],
    ["area", "area", 150],
    [
      "locationLabel",
      "location_label",
      250,
    ],
    [
      "noindexReason",
      "noindex_reason",
      500,
    ],
    [
      "sitemapChangefreq",
      "sitemap_changefreq",
      30,
    ],
  ];

  for (
    const [
      input,
      column,
      max,
    ] of textFields
  ) {
    if (!has(input)) {
      continue;
    }

    fields[column] =
      normalizeNullableText(
        body[input],
        max,
      );
  }

  const idFields: Array<
    [
      string,
      string,
    ]
  > = [
    ["entityId", "entity_id"],
    ["countryId", "country_id"],
    ["stateId", "state_id"],
    [
      "districtId",
      "district_id",
    ],
    ["cityId", "city_id"],
    ["areaId", "area_id"],
  ];

  for (
    const [
      input,
      column,
    ] of idFields
  ) {
    if (has(input)) {
      fields[column] =
        asPositiveId(
          body[input],
        );
    }
  }

  if (has("locationLevel")) {
    fields.location_level =
      normalizeText(
        body.locationLevel,
        40,
      ).toLowerCase() || null;
  }

  if (has("canonicalLocked")) {
    fields.canonical_locked =
      boolInt(
        body.canonicalLocked,
      );
  }

  if (has("twitterCard")) {
    fields.twitter_card =
      normalizeText(
        body.twitterCard ||
          "summary_large_image",
        50,
      );
  }

  if (
    has("faq") ||
    has("faqJson")
  ) {
    fields.faq_json =
      jsonArray(
        body.faq ??
          body.faqJson,
      );
  }

  if (
    has("breadcrumb") ||
    has("breadcrumbJson")
  ) {
    fields.breadcrumb_json =
      jsonArray(
        body.breadcrumb ??
          body.breadcrumbJson,
      );
  }

  if (has("schemaJson")) {
    fields.schema_json =
      jsonObject(
        body.schemaJson,
      );
  }

  if (
    has("hreflang") ||
    has("hreflangJson")
  ) {
    fields.hreflang_json =
      jsonObject(
        body.hreflang ??
          body.hreflangJson,
      );
  }

  if (
    has("keywords") ||
    has("keywordsJson")
  ) {
    fields.keywords_json =
      jsonArray(
        body.keywords ??
          body.keywordsJson,
      );
  }

  if (
    has("primaryKeywords") ||
    has("primaryKeywordsJson")
  ) {
    fields.primary_keywords_json =
      jsonArray(
        body.primaryKeywords ??
          body.primaryKeywordsJson,
      );
  }

  if (
    has("locationKeywords") ||
    has("locationKeywordsJson")
  ) {
    fields.location_keywords_json =
      jsonArray(
        body.locationKeywords ??
          body.locationKeywordsJson,
      );
  }

  if (
    has("longTailKeywords") ||
    has("longTailKeywordsJson")
  ) {
    fields.long_tail_keywords_json =
      jsonArray(
        body.longTailKeywords ??
          body.longTailKeywordsJson,
      );
  }

  if (
    has("searchIntents") ||
    has("searchIntentsJson")
  ) {
    fields.search_intents_json =
      jsonArray(
        body.searchIntents ??
          body.searchIntentsJson,
      );
  }

  if (has("isIndexable")) {
    fields.is_indexable =
      boolInt(
        body.isIndexable,
        true,
      );
  }

  if (has("qualityScore")) {
    fields.quality_score =
      normalizeInteger(
        body.qualityScore,
        0,
        0,
        100,
      );
  }

  if (has("sitemapPriority")) {
    fields.sitemap_priority =
      Math.max(
        0,
        Number(
          body.sitemapPriority,
        ) || 0,
      );
  }

  if (has("status")) {
    const status =
      statusText(
        body.status,
      );

    if (
      ![
        "draft",
        "published",
        "unpublished",
      ].includes(status)
    ) {
      return {
        fields,
        error:
          "Invalid SEO status.",
      };
    }

    fields.status =
      status;
  }

  if (
    !partial &&
    !fields.status
  ) {
    fields.status =
      "published";
  }

  if (
    !partial &&
    !has("robots")
  ) {
    fields.robots =
      `${boolInt(
        body.robotsIndex,
        true,
      )
        ? "index"
        : "noindex"},${
        boolInt(
          body.robotsFollow,
          true,
        )
          ? "follow"
          : "nofollow"
      }`;
  }

  return {
    fields,
  };
}

router.get(
  "/seo",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "seo_entries",
        )
      ) {
        return;
      }

      const {
        limit,
        offset,
      } = parseListParams(req);

      const columns =
        tableColumns(
          "seo_entries",
        );

      const where = ["1=1"];
      const params: unknown[] = [];

      const search =
        normalizeText(
          req.query.search,
          180,
        );

      if (search) {
        const searchable = [
          "path",
          "page_type",
          "entity_type",
          "seo_title",
          "meta_description",
          "focus_keyword",
          "location_label",
        ].filter(
          (column) =>
            columns.has(column),
        );

        if (searchable.length) {
          where.push(`
            (
              ${searchable
                .map(
                  (column) =>
                    `${quoteIdentifier(
                      column,
                    )} LIKE ?`,
                )
                .join(" OR ")}
            )
          `);

          for (
            let index = 0;
            index < searchable.length;
            index += 1
          ) {
            params.push(
              `%${search}%`,
            );
          }
        }
      }

      const pageType =
        statusText(
          req.query.pageType,
        );

      if (
        pageType &&
        columns.has("page_type")
      ) {
        where.push(
          "page_type=?",
        );
        params.push(pageType);
      }

      const status =
        statusText(
          req.query.status,
        );

      if (
        status &&
        columns.has("status")
      ) {
        where.push("status=?");
        params.push(status);
      }

      const rows =
        db.prepare(`
          SELECT *
          FROM seo_entries
          WHERE ${where.join(" AND ")}
          ORDER BY id DESC
          LIMIT ?
          OFFSET ?
        `).all(
          ...params,
          limit,
          offset,
        ) as SqlRow[];

      const total =
        Number(
          (
            db.prepare(`
              SELECT COUNT(*) value
              FROM seo_entries
              WHERE ${where.join(" AND ")}
            `).get(
              ...params,
            ) as
              | {
                  value?: unknown;
                }
              | undefined
          )?.value ?? 0,
        );

      res.json({
        success: true,
        entries:
          rows.map(
            (row) => ({
              ...row,
              title:
                row.seo_title,
              description:
                row.meta_description,
              routePath:
                row.path,
              isPublished:
                row.status ===
                "published",
            }),
          ),
        pagination: {
          limit,
          offset,
          total,
          totalPages:
            Math.ceil(
              total / limit,
            ),
        },
      });
    } catch (error) {
      console.error(
        "Admin SEO error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load SEO entries.",
      });
    }
  },
);

router.post(
  "/seo",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "seo_entries",
        )
      ) {
        return;
      }

      const payload =
        seoEntryPayload(
          req,
          false,
        );

      if (payload.error) {
        return void res.status(400).json({
          success: false,
          error:
            payload.error,
        });
      }

      if (
        !payload.fields.path ||
        payload.fields.path === "/" ||
        !payload.fields.seo_title
      ) {
        return void res.status(400).json({
          success: false,
          error:
            "A non-root path and SEO title are required.",
        });
      }

      if (
        db.prepare(`
          SELECT id
          FROM seo_entries
          WHERE path=?
          LIMIT 1
        `).get(
          payload.fields.path,
        )
      ) {
        return void res.status(409).json({
          success: false,
          error:
            "SEO entry already exists for this path.",
        });
      }

      const columns =
        tableColumns(
          "seo_entries",
        );

      const fields: Record<
        string,
        unknown
      > = {
        page_type:
          "custom",
        seo_title: "",
        status:
          "published",
        is_indexable: 1,
        robots:
          "index,follow",
        ...payload.fields,
      };

      const insertable =
        Object.keys(
          fields,
        ).filter(
          (column) =>
            columns.has(column),
        );

      if (!insertable.length) {
        return void res.status(400).json({
          success: false,
          error:
            "No supported SEO fields are available.",
        });
      }

      const result =
        db.prepare(`
          INSERT INTO seo_entries (
            ${insertable
              .map(quoteIdentifier)
              .join(",")},
            created_at,
            updated_at
          )
          VALUES (
            ${insertable.map(() => "?").join(",")},
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )
        `).run(
          ...insertable.map(
            (column) =>
              fields[column],
          ),
        );

      const id =
        Number(
          result.lastInsertRowid,
        );

      const row =
        getRowById(
          "seo_entries",
          id,
        ) || {};

      audit(
        req,
        currentUserId(res),
        "admin.seo.created",
        "seo_entry",
        id,
        null,
        row,
      );

      res.status(201).json({
        success: true,
        entry: row,
      });
    } catch (error) {
      console.error(
        "Admin create SEO error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to create SEO entry.",
      });
    }
  },
);

router.patch(
  "/seo/:id",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "seo_entries",
        )
      ) {
        return;
      }

      const id =
        asPositiveId(
          req.params.id,
        );

      if (!id) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid SEO id.",
        });
      }

      const old =
        getRowById(
          "seo_entries",
          id,
        );

      if (!old) {
        return void res.status(404).json({
          success: false,
          error:
            "SEO entry not found.",
        });
      }

      const payload =
        seoEntryPayload(
          req,
          true,
        );

      if (payload.error) {
        return void res.status(400).json({
          success: false,
          error:
            payload.error,
        });
      }

      const columns =
        tableColumns(
          "seo_entries",
        );

      const entries =
        Object.entries(
          payload.fields,
        ).filter(
          ([column]) =>
            columns.has(column),
        );

      if (!entries.length) {
        return void res.status(400).json({
          success: false,
          error:
            "No supported SEO fields were supplied.",
        });
      }

      db.prepare(`
        UPDATE seo_entries
        SET
          ${entries
            .map(
              ([column]) =>
                `${quoteIdentifier(
                  column,
                )}=?`,
            )
            .join(",")},
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(
        ...entries.map(
          ([, value]) => value,
        ),
        id,
      );

      const updated =
        getRowById(
          "seo_entries",
          id,
        ) || {};

      audit(
        req,
        currentUserId(res),
        "admin.seo.updated",
        "seo_entry",
        id,
        old,
        updated,
      );

      res.json({
        success: true,
        entry: updated,
      });
    } catch (error) {
      console.error(
        "Admin update SEO error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to update SEO entry.",
      });
    }
  },
);

router.delete(
  "/seo/:id",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "seo_entries",
        )
      ) {
        return;
      }

      const id =
        asPositiveId(
          req.params.id,
        );

      if (!id) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid SEO id.",
        });
      }

      const old =
        getRowById(
          "seo_entries",
          id,
        );

      if (!old) {
        return void res.status(404).json({
          success: false,
          error:
            "SEO entry not found.",
        });
      }

      db.prepare(`
        DELETE FROM seo_entries
        WHERE id=?
      `).run(id);

      audit(
        req,
        currentUserId(res),
        "admin.seo.deleted",
        "seo_entry",
        id,
        old,
        null,
      );

      res.json({
        success: true,
        deleted: true,
      });
    } catch (error) {
      console.error(
        "Admin delete SEO error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to delete SEO entry.",
      });
    }
  },
);

/* ============================================================================
 * SEO Location Pages
 * ========================================================================== */

function seoLocationPayload(
  req: Request,
  partial = false,
) {
  const body =
    req.body || {};

  const fields: Record<
    string,
    unknown
  > = {};

  const has = (
    key: string,
  ) =>
    Object.prototype.hasOwnProperty.call(
      body,
      key,
    );

  const idFields: Array<
    [
      string,
      string,
    ]
  > = [
    [
      "seoEntryId",
      "seo_entry_id",
    ],
    [
      "templateId",
      "template_id",
    ],
    [
      "locationId",
      "location_id",
    ],
    [
      "entityId",
      "entity_id",
    ],
  ];

  for (
    const [
      input,
      column,
    ] of idFields
  ) {
    if (has(input)) {
      fields[column] =
        asPositiveId(
          body[input],
        );
    }
  }

  if (
    !partial ||
    has("locationLevel")
  ) {
    const level =
      normalizeText(
        body.locationLevel,
        40,
      ).toLowerCase();

    if (
      ![
        "country",
        "state",
        "district",
        "city",
        "area",
      ].includes(level)
    ) {
      return {
        fields,
        error:
          "Invalid location level.",
      };
    }

    fields.location_level =
      level;
  }

  const textFields: Array<
    [
      string,
      string,
      number,
    ]
  > = [
    ["catalogType", "catalog_type", 80],
    ["pageKind", "page_kind", 80],
    ["entityType", "entity_type", 100],
    ["pageKey", "page_key", 250],
    ["path", "path", 1500],
    ["urlPattern", "url_pattern", 1500],
    ["canonicalPath", "canonical_path", 1500],
    ["primaryKeyword", "primary_keyword", 250],
    ["generatedTitle", "generated_title", 300],
    ["generatedDescription", "generated_description", 2500],
    ["generatedH1", "generated_h1", 300],
    ["generatedIntro", "generated_intro", 10000],
    ["noindexReason", "noindex_reason", 500],
    ["generationVersion", "generation_version", 80],
    ["sitemapChangefreq", "sitemap_changefreq", 30],
  ];

  for (
    const [
      input,
      column,
      max,
    ] of textFields
  ) {
    if (!has(input)) {
      continue;
    }

    fields[column] =
      column === "path" ||
      column === "canonical_path"
        ? pathOnly(body[input])
        : normalizeNullableText(
            body[input],
            max,
          );
  }

  if (has("keywordCluster")) {
    fields.keyword_cluster_json =
      jsonArray(
        body.keywordCluster,
      );
  }

  if (has("searchIntent")) {
    fields.search_intent_json =
      jsonArray(
        body.searchIntent,
      );
  }

  if (has("generatedFaq")) {
    fields.generated_faq_json =
      jsonArray(
        body.generatedFaq,
      );
  }

  if (has("generatedSchema")) {
    fields.generated_schema_json =
      jsonObject(
        body.generatedSchema,
      );
  }

  if (has("generatedBreadcrumb")) {
    fields.generated_breadcrumb_json =
      jsonArray(
        body.generatedBreadcrumb,
      );
  }

  if (has("generatedBody")) {
    fields.generated_body =
      normalizeNullableText(
        body.generatedBody,
        50000,
      );
  }

  if (has("listingCount")) {
    fields.listing_count =
      normalizeInteger(
        body.listingCount,
        0,
      );
  }

  if (
    has(
      "minimumListingsToIndex",
    )
  ) {
    fields.minimum_listings_to_index =
      normalizeInteger(
        body.minimumListingsToIndex,
        0,
      );
  }

  if (has("isIndexable")) {
    fields.is_indexable =
      boolInt(
        body.isIndexable,
        true,
      );
  }

  if (has("status")) {
    const status =
      statusText(
        body.status,
      );

    if (
      ![
        "draft",
        "published",
        "unpublished",
      ].includes(status)
    ) {
      return {
        fields,
        error:
          "Invalid SEO location page status.",
      };
    }

    fields.status =
      status;
  }

  if (has("priority")) {
    fields.priority =
      normalizeInteger(
        body.priority,
        0,
      );
  }

  return {
    fields,
  };
}

router.get(
  "/seo-location-pages",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "seo_location_pages",
        )
      ) {
        return;
      }

      const {
        limit,
        offset,
      } = parseListParams(req);

      const where = ["1=1"];
      const params: unknown[] = [];

      const level =
        statusText(
          req.query.locationLevel,
        );

      const entity =
        statusText(
          req.query.entityType,
        );

      const location =
        asPositiveId(
          req.query.locationId,
        );

      const status =
        statusText(
          req.query.status,
        );

      if (level) {
        where.push(
          "slp.location_level=?",
        );
        params.push(level);
      }

      if (entity) {
        where.push(
          "LOWER(slp.entity_type)=?",
        );
        params.push(entity);
      }

      if (location) {
        where.push(
          "slp.location_id=?",
        );
        params.push(location);
      }

      if (status) {
        where.push(
          "LOWER(slp.status)=?",
        );
        params.push(status);
      }

      const rows =
        tableExists("locations")
          ? (db.prepare(`
              SELECT
                slp.*,
                l.name location_name,
                l.type location_type
              FROM seo_location_pages slp
              JOIN locations l
                ON l.id=slp.location_id
              WHERE ${where.join(" AND ")}
              ORDER BY
                slp.priority DESC,
                slp.id DESC
              LIMIT ?
              OFFSET ?
            `).all(
              ...params,
              limit,
              offset,
            ) as SqlRow[])
          : [];

      const total =
        Number(
          (
            db.prepare(`
              SELECT COUNT(*) value
              FROM seo_location_pages slp
              WHERE ${where.join(" AND ")}
            `).get(
              ...params,
            ) as
              | {
                  value?: unknown;
                }
              | undefined
          )?.value ?? 0,
        );

      res.json({
        success: true,
        pages: rows,
        seoLocationPages:
          rows,
        pagination: {
          limit,
          offset,
          total,
          totalPages:
            Math.ceil(
              total / limit,
            ),
        },
      });
    } catch (error) {
      console.error(
        "Admin SEO location list error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load SEO location pages.",
      });
    }
  },
);

router.post(
  "/seo-location-pages",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "seo_location_pages",
        ) ||
        !requireTable(
          res,
          "locations",
        )
      ) {
        return;
      }

      const payload =
        seoLocationPayload(
          req,
          false,
        );

      if (payload.error) {
        return void res.status(400).json({
          success: false,
          error:
            payload.error,
        });
      }

      const fields =
        payload.fields;

      if (
        !fields.location_id ||
        !fields.location_level ||
        !fields.page_key ||
        !fields.path ||
        fields.path === "/"
      ) {
        return void res.status(400).json({
          success: false,
          error:
            "locationId, locationLevel, pageKey and path are required.",
        });
      }

      if (
        !getRowById(
          "locations",
          Number(
            fields.location_id,
          ),
        )
      ) {
        return void res.status(404).json({
          success: false,
          error:
            "Location not found.",
        });
      }

      const existing =
        db.prepare(`
          SELECT id
          FROM seo_location_pages
          WHERE page_key=?
             OR path=?
          LIMIT 1
        `).get(
          fields.page_key,
          fields.path,
        );

      if (existing) {
        return void res.status(409).json({
          success: false,
          error:
            "SEO location page key or path already exists.",
        });
      }

      const columns =
        tableColumns(
          "seo_location_pages",
        );

      const insertFields: Record<
        string,
        unknown
      > = {
        status: "draft",
        is_indexable: 1,
        priority: 0,
        ...fields,
      };

      const insertable =
        Object.keys(
          insertFields,
        ).filter(
          (column) =>
            columns.has(column),
        );

      if (!insertable.length) {
        return void res.status(400).json({
          success: false,
          error:
            "No supported SEO location fields are available.",
        });
      }

      const result =
        db.prepare(`
          INSERT INTO seo_location_pages (
            ${insertable
              .map(quoteIdentifier)
              .join(",")},
            created_at,
            updated_at
          )
          VALUES (
            ${insertable.map(() => "?").join(",")},
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )
        `).run(
          ...insertable.map(
            (column) =>
              insertFields[
                column
              ],
          ),
        );

      const id =
        Number(
          result.lastInsertRowid,
        );

      const row =
        getRowById(
          "seo_location_pages",
          id,
        ) || {};

      audit(
        req,
        currentUserId(res),
        "admin.seo_location_page.created",
        "seo_location_page",
        id,
        null,
        row,
      );

      res.status(201).json({
        success: true,
        page: row,
      });
    } catch (error) {
      console.error(
        "Admin create SEO location page error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to create SEO location page.",
      });
    }
  },
);

router.patch(
  "/seo-location-pages/:id",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "seo_location_pages",
        )
      ) {
        return;
      }

      const id =
        asPositiveId(
          req.params.id,
        );

      if (!id) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid SEO location page id.",
        });
      }

      const old =
        getRowById(
          "seo_location_pages",
          id,
        );

      if (!old) {
        return void res.status(404).json({
          success: false,
          error:
            "SEO location page not found.",
        });
      }

      const payload =
        seoLocationPayload(
          req,
          true,
        );

      if (payload.error) {
        return void res.status(400).json({
          success: false,
          error:
            payload.error,
        });
      }

      const columns =
        tableColumns(
          "seo_location_pages",
        );

      const entries =
        Object.entries(
          payload.fields,
        ).filter(
          ([column]) =>
            columns.has(column),
        );

      if (!entries.length) {
        return void res.status(400).json({
          success: false,
          error:
            "No supported SEO location fields were supplied.",
        });
      }

      db.prepare(`
        UPDATE seo_location_pages
        SET
          ${entries
            .map(
              ([column]) =>
                `${quoteIdentifier(
                  column,
                )}=?`,
            )
            .join(",")},
          updated_at=CURRENT_TIMESTAMP
        WHERE id=?
      `).run(
        ...entries.map(
          ([, value]) => value,
        ),
        id,
      );

      const updated =
        getRowById(
          "seo_location_pages",
          id,
        ) || {};

      audit(
        req,
        currentUserId(res),
        "admin.seo_location_page.updated",
        "seo_location_page",
        id,
        old,
        updated,
      );

      res.json({
        success: true,
        page: updated,
      });
    } catch (error) {
      console.error(
        "Admin update SEO location page error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to update SEO location page.",
      });
    }
  },
);

router.delete(
  "/seo-location-pages/:id",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "seo_location_pages",
        )
      ) {
        return;
      }

      const id =
        asPositiveId(
          req.params.id,
        );

      if (!id) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid SEO location page id.",
        });
      }

      const old =
        getRowById(
          "seo_location_pages",
          id,
        );

      if (!old) {
        return void res.status(404).json({
          success: false,
          error:
            "SEO location page not found.",
        });
      }

      db.prepare(`
        DELETE FROM seo_location_pages
        WHERE id=?
      `).run(id);

      audit(
        req,
        currentUserId(res),
        "admin.seo_location_page.deleted",
        "seo_location_page",
        id,
        old,
        null,
      );

      res.json({
        success: true,
        deleted: true,
      });
    } catch (error) {
      console.error(
        "Admin delete SEO location page error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to delete SEO location page.",
      });
    }
  },
);

/* ============================================================================
 * SEO Content Blocks
 * ========================================================================== */

router.get(
  "/seo/:seoId/blocks",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "seo_content_blocks",
        )
      ) {
        return;
      }

      const seoId =
        asPositiveId(
          req.params.seoId,
        );

      if (!seoId) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid SEO id.",
        });
      }

      const rows =
        db.prepare(`
          SELECT *
          FROM seo_content_blocks
          WHERE seo_entry_id=?
          ORDER BY
            sort_order,
            id
        `).all(
          seoId,
        ) as SqlRow[];

      res.json({
        success: true,
        blocks: rows,
      });
    } catch (error) {
      console.error(
        "Admin SEO blocks error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load SEO blocks.",
      });
    }
  },
);

router.post(
  "/seo/:seoId/blocks",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "seo_content_blocks",
        )
      ) {
        return;
      }

      const seoId =
        asPositiveId(
          req.params.seoId,
        );

      const key =
        normalizeText(
          req.body?.blockKey,
          150,
        );

      const type =
        normalizeText(
          req.body?.blockType ??
            "text",
          30,
        ).toLowerCase();

      if (!seoId || !key) {
        return void res.status(400).json({
          success: false,
          error:
            "SEO id and blockKey are required.",
        });
      }

      if (
        ![
          "heading",
          "text",
          "html",
          "faq",
          "list",
          "image",
          "cta",
          "json",
        ].includes(type)
      ) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid SEO block type.",
        });
      }

      const result =
        db.prepare(`
          INSERT INTO seo_content_blocks (
            seo_entry_id,
            block_key,
            block_type,
            heading,
            content,
            content_json,
            sort_order,
            is_active,
            created_at,
            updated_at
          )
          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )
        `).run(
          seoId,
          key,
          type,
          normalizeNullableText(
            req.body?.heading,
            300,
          ),
          normalizeNullableText(
            req.body?.content ??
              req.body?.body,
            20000,
          ),
          jsonObject(
            req.body?.contentJson ??
              req.body?.json,
          ),
          normalizeInteger(
            req.body?.sortOrder,
            0,
          ),
          boolInt(
            req.body?.isActive,
            true,
          ),
        );

      const id =
        Number(
          result.lastInsertRowid,
        );

      const row =
        getRowById(
          "seo_content_blocks",
          id,
        ) || {};

      audit(
        req,
        currentUserId(res),
        "admin.seo_block.created",
        "seo_content_block",
        id,
        null,
        row,
      );

      res.status(201).json({
        success: true,
        block: row,
      });
    } catch (error) {
      console.error(
        "Admin create SEO block error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to create SEO content block.",
      });
    }
  },
);

router.patch(
  "/seo-blocks/:id",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "seo_content_blocks",
        )
      ) {
        return;
      }

      const id =
        asPositiveId(
          req.params.id,
        );

      if (!id) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid SEO block id.",
        });
      }

      const old =
        getRowById(
          "seo_content_blocks",
          id,
        );

      if (!old) {
        return void res.status(404).json({
          success: false,
          error:
            "SEO block not found.",
        });
      }

      const body =
        req.body || {};

      const updates: string[] = [];
      const values: unknown[] = [];

      if (
        Object.prototype.hasOwnProperty.call(
          body,
          "blockKey",
        )
      ) {
        updates.push(
          "block_key=?",
        );
        values.push(
          normalizeText(
            body.blockKey,
            150,
          ),
        );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          body,
          "blockType",
        )
      ) {
        const type =
          statusText(
            body.blockType,
          );

        if (
          ![
            "heading",
            "text",
            "html",
            "faq",
            "list",
            "image",
            "cta",
            "json",
          ].includes(type)
        ) {
          return void res
            .status(400)
            .json({
              success: false,
              error:
                "Invalid SEO block type.",
            });
        }

        updates.push(
          "block_type=?",
        );
        values.push(type);
      }

      if (
        Object.prototype.hasOwnProperty.call(
          body,
          "heading",
        )
      ) {
        updates.push(
          "heading=?",
        );

        values.push(
          normalizeNullableText(
            body.heading,
            300,
          ),
        );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          body,
          "content",
        )
      ) {
        updates.push(
          "content=?",
        );

        values.push(
          normalizeNullableText(
            body.content,
            20000,
          ),
        );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          body,
          "contentJson",
        )
      ) {
        updates.push(
          "content_json=?",
        );

        values.push(
          jsonObject(
            body.contentJson,
          ),
        );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          body,
          "sortOrder",
        )
      ) {
        updates.push(
          "sort_order=?",
        );

        values.push(
          normalizeInteger(
            body.sortOrder,
            0,
          ),
        );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          body,
          "isActive",
        )
      ) {
        updates.push(
          "is_active=?",
        );

        values.push(
          boolInt(
            body.isActive,
          ),
        );
      }

      if (!updates.length) {
        return void res.status(400).json({
          success: false,
          error:
            "No supported SEO block fields were supplied.",
        });
      }

      updates.push(
        "updated_at=CURRENT_TIMESTAMP",
      );

      values.push(id);

      db.prepare(`
        UPDATE seo_content_blocks
        SET ${updates.join(",")}
        WHERE id=?
      `).run(
        ...values,
      );

      const updated =
        getRowById(
          "seo_content_blocks",
          id,
        ) || {};

      audit(
        req,
        currentUserId(res),
        "admin.seo_block.updated",
        "seo_content_block",
        id,
        old,
        updated,
      );

      res.json({
        success: true,
        block: updated,
      });
    } catch (error) {
      console.error(
        "Admin update SEO block error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to update SEO content block.",
      });
    }
  },
);

router.delete(
  "/seo-blocks/:id",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "seo_content_blocks",
        )
      ) {
        return;
      }

      const id =
        asPositiveId(
          req.params.id,
        );

      if (!id) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid SEO block id.",
        });
      }

      const old =
        getRowById(
          "seo_content_blocks",
          id,
        );

      if (!old) {
        return void res.status(404).json({
          success: false,
          error:
            "SEO block not found.",
        });
      }

      db.prepare(`
        DELETE FROM seo_content_blocks
        WHERE id=?
      `).run(id);

      audit(
        req,
        currentUserId(res),
        "admin.seo_block.deleted",
        "seo_content_block",
        id,
        old,
        null,
      );

      res.json({
        success: true,
        deleted: true,
      });
    } catch (error) {
      console.error(
        "Admin delete SEO block error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to delete SEO content block.",
      });
    }
  },
);

/* ============================================================================
 * SEO Redirects
 * ========================================================================== */

router.get(
  "/seo-redirects",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "seo_redirects",
        )
      ) {
        return;
      }

      const {
        limit,
        offset,
      } = parseListParams(req);

      const rows =
        db.prepare(`
          SELECT *
          FROM seo_redirects
          ORDER BY id DESC
          LIMIT ?
          OFFSET ?
        `).all(
          limit,
          offset,
        ) as SqlRow[];

      res.json({
        success: true,
        redirects:
          rows.map(
            (row) => ({
              ...row,
              fromPath:
                row.source_path,
              toPath:
                row.target_path,
              note: row.notes,
            }),
          ),
        pagination: {
          limit,
          offset,
        },
      });
    } catch (error) {
      console.error(
        "Admin SEO redirects error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load SEO redirects.",
      });
    }
  },
);

router.post(
  "/seo-redirects",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "seo_redirects",
        )
      ) {
        return;
      }

      const source =
        pathOnly(
          req.body?.sourcePath ??
            req.body?.fromPath,
        );

      const target =
        pathOnly(
          req.body?.targetPath ??
            req.body?.toPath,
        );

      const statusCode =
        normalizeInteger(
          req.body?.statusCode,
          301,
        );

      if (
        source === "/" ||
        target === "/" ||
        source === target ||
        ![
          301,
          302,
          307,
          308,
        ].includes(statusCode)
      ) {
        return void res.status(400).json({
          success: false,
          error:
            "Valid source, target and redirect status are required.",
        });
      }

      const result =
        db.prepare(`
          INSERT INTO seo_redirects (
            source_path,
            target_path,
            status_code,
            is_active,
            notes,
            created_at,
            updated_at
          )
          VALUES (
            ?,
            ?,
            ?,
            ?,
            ?,
            CURRENT_TIMESTAMP,
            CURRENT_TIMESTAMP
          )
        `).run(
          source,
          target,
          statusCode,
          boolInt(
            req.body?.isActive,
            true,
          ),
          normalizeNullableText(
            req.body?.notes ??
              req.body?.note,
            1000,
          ),
        );

      const id =
        Number(
          result.lastInsertRowid,
        );

      const row =
        getRowById(
          "seo_redirects",
          id,
        ) || {};

      audit(
        req,
        currentUserId(res),
        "admin.seo_redirect.created",
        "seo_redirect",
        id,
        null,
        row,
      );

      res.status(201).json({
        success: true,
        redirect: row,
      });
    } catch (error) {
      console.error(
        "Admin create SEO redirect error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to create SEO redirect.",
      });
    }
  },
);

router.patch(
  "/seo-redirects/:id",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "seo_redirects",
        )
      ) {
        return;
      }

      const id =
        asPositiveId(
          req.params.id,
        );

      if (!id) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid redirect id.",
        });
      }

      const old =
        getRowById(
          "seo_redirects",
          id,
        );

      if (!old) {
        return void res.status(404).json({
          success: false,
          error:
            "SEO redirect not found.",
        });
      }

      const body =
        req.body || {};

      const updates: string[] = [];
      const values: unknown[] = [];

      if (
        Object.prototype.hasOwnProperty.call(
          body,
          "sourcePath",
        ) ||
        Object.prototype.hasOwnProperty.call(
          body,
          "fromPath",
        )
      ) {
        updates.push(
          "source_path=?",
        );

        values.push(
          pathOnly(
            body.sourcePath ??
              body.fromPath,
          ),
        );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          body,
          "targetPath",
        ) ||
        Object.prototype.hasOwnProperty.call(
          body,
          "toPath",
        )
      ) {
        updates.push(
          "target_path=?",
        );

        values.push(
          pathOnly(
            body.targetPath ??
              body.toPath,
          ),
        );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          body,
          "statusCode",
        )
      ) {
        const code =
          normalizeInteger(
            body.statusCode,
            301,
          );

        if (
          ![
            301,
            302,
            307,
            308,
          ].includes(code)
        ) {
          return void res
            .status(400)
            .json({
              success: false,
              error:
                "Invalid redirect status code.",
            });
        }

        updates.push(
          "status_code=?",
        );
        values.push(code);
      }

      if (
        Object.prototype.hasOwnProperty.call(
          body,
          "isActive",
        )
      ) {
        updates.push(
          "is_active=?",
        );
        values.push(
          boolInt(
            body.isActive,
          ),
        );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          body,
          "notes",
        ) ||
        Object.prototype.hasOwnProperty.call(
          body,
          "note",
        )
      ) {
        updates.push(
          "notes=?",
        );

        values.push(
          normalizeNullableText(
            body.notes ??
              body.note,
            1000,
          ),
        );
      }

      if (!updates.length) {
        return void res.status(400).json({
          success: false,
          error:
            "No supported redirect fields were supplied.",
        });
      }

      updates.push(
        "updated_at=CURRENT_TIMESTAMP",
      );

      values.push(id);

      db.prepare(`
        UPDATE seo_redirects
        SET ${updates.join(",")}
        WHERE id=?
      `).run(
        ...values,
      );

      const updated =
        getRowById(
          "seo_redirects",
          id,
        ) || {};

      audit(
        req,
        currentUserId(res),
        "admin.seo_redirect.updated",
        "seo_redirect",
        id,
        old,
        updated,
      );

      res.json({
        success: true,
        redirect: updated,
      });
    } catch (error) {
      console.error(
        "Admin update SEO redirect error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to update SEO redirect.",
      });
    }
  },
);

router.delete(
  "/seo-redirects/:id",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "seo_redirects",
        )
      ) {
        return;
      }

      const id =
        asPositiveId(
          req.params.id,
        );

      if (!id) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid redirect id.",
        });
      }

      const old =
        getRowById(
          "seo_redirects",
          id,
        );

      if (!old) {
        return void res.status(404).json({
          success: false,
          error:
            "SEO redirect not found.",
        });
      }

      db.prepare(`
        DELETE FROM seo_redirects
        WHERE id=?
      `).run(id);

      audit(
        req,
        currentUserId(res),
        "admin.seo_redirect.deleted",
        "seo_redirect",
        id,
        old,
        null,
      );

      res.json({
        success: true,
        deleted: true,
      });
    } catch (error) {
      console.error(
        "Admin delete SEO redirect error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to delete SEO redirect.",
      });
    }
  },
);

/* ============================================================================
 * SEO Settings
 * ========================================================================== */

router.get(
  "/seo-settings",
  (_req, res) => {
    try {
      if (
        !requireTable(
          res,
          "seo_settings",
        )
      ) {
        return;
      }

      res.json({
        success: true,
        settings:
          db.prepare(`
            SELECT *
            FROM seo_settings
            ORDER BY id
          `).all(),
      });
    } catch (error) {
      console.error(
        "Admin SEO settings error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load SEO settings.",
      });
    }
  },
);

router.patch(
  "/seo-settings",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "seo_settings",
        )
      ) {
        return;
      }

      const key =
        normalizeText(
          req.body?.settingKey ??
            req.body?.key,
          150,
        );

      if (!key) {
        return void res.status(400).json({
          success: false,
          error:
            "settingKey is required.",
        });
      }

      const old =
        db.prepare(`
          SELECT *
          FROM seo_settings
          WHERE setting_key=?
          LIMIT 1
        `).get(
          key,
        ) as
          | SqlRow
          | undefined;

      if (!old) {
        return void res.status(404).json({
          success: false,
          error:
            "SEO setting not found.",
        });
      }

      const updates: string[] = [];
      const values: unknown[] = [];

      if (
        Object.prototype.hasOwnProperty.call(
          req.body || {},
          "value",
        ) ||
        Object.prototype.hasOwnProperty.call(
          req.body || {},
          "settingValue",
        )
      ) {
        const value =
          req.body.value ??
          req.body.settingValue;

        updates.push(
          "setting_value=?",
        );

        values.push(
          typeof value ===
          "string"
            ? value
            : JSON.stringify(
                value,
              ),
        );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          req.body || {},
          "type",
        ) ||
        Object.prototype.hasOwnProperty.call(
          req.body || {},
          "settingType",
        )
      ) {
        updates.push(
          "setting_type=?",
        );

        values.push(
          normalizeText(
            req.body.type ??
              req.body.settingType,
            30,
          ),
        );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          req.body || {},
          "description",
        )
      ) {
        updates.push(
          "description=?",
        );

        values.push(
          normalizeNullableText(
            req.body.description,
            1000,
          ),
        );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          req.body || {},
          "isPublic",
        )
      ) {
        updates.push(
          "is_public=?",
        );

        values.push(
          boolInt(
            req.body.isPublic,
          ),
        );
      }

      if (!updates.length) {
        return void res.status(400).json({
          success: false,
          error:
            "No supported SEO setting fields were supplied.",
        });
      }

      updates.push(
        "updated_at=CURRENT_TIMESTAMP",
      );

      values.push(key);

      db.prepare(`
        UPDATE seo_settings
        SET ${updates.join(",")}
        WHERE setting_key=?
      `).run(
        ...values,
      );

      const updated =
        db.prepare(`
          SELECT *
          FROM seo_settings
          WHERE setting_key=?
          LIMIT 1
        `).get(
          key,
        ) as
          | SqlRow
          | undefined;

      audit(
        req,
        currentUserId(res),
        "admin.seo_settings.updated",
        "seo_settings",
        Number(
          old.id ?? 0,
        ),
        old,
        updated || null,
      );

      res.json({
        success: true,
        setting:
          updated || null,
      });
    } catch (error) {
      console.error(
        "Admin update SEO settings error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to update SEO settings.",
      });
    }
  },
);

/* ============================================================================
 * Locations
 * ========================================================================== */

router.get(
  "/locations",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "locations",
        )
      ) {
        return;
      }

      const {
        limit,
        offset,
      } = parseListParams(req);

      const type =
        statusText(
          req.query.type,
        );

      const parent =
        asPositiveId(
          req.query.parentId,
        );

      const search =
        normalizeText(
          req.query.search,
          150,
        );

      const where = ["1=1"];
      const params: unknown[] = [];

      if (
        [
          "country",
          "state",
          "district",
          "city",
          "area",
        ].includes(type)
      ) {
        where.push("type=?");
        params.push(type);
      }

      if (parent) {
        where.push(
          "parent_id=?",
        );
        params.push(parent);
      }

      if (search) {
        const pattern =
          `%${search}%`;

        where.push(`
          (
            name LIKE ?
            OR slug LIKE ?
            OR COALESCE(code,'') LIKE ?
          )
        `);

        params.push(
          pattern,
          pattern,
          pattern,
        );
      }

      const rows =
        db.prepare(`
          SELECT
            id,
            parent_id,
            type,
            name,
            slug,
            code,
            state_code,
            district_code,
            city_code,
            country_code,
            canonical_name,
            latitude,
            longitude,
            timezone,
            country_id,
            state_id,
            district_id,
            city_id,
            seo_path,
            seo_enabled,
            sort_order,
            status,
            created_at,
            updated_at
          FROM locations
          WHERE ${where.join(" AND ")}
          ORDER BY
            type,
            name
          LIMIT ?
          OFFSET ?
        `).all(
          ...params,
          limit,
          offset,
        ) as SqlRow[];

      const total =
        Number(
          (
            db.prepare(`
              SELECT COUNT(*) value
              FROM locations
              WHERE ${where.join(" AND ")}
            `).get(
              ...params,
            ) as
              | {
                  value?: unknown;
                }
              | undefined
          )?.value ?? 0,
        );

      res.json({
        success: true,
        locations: rows,
        pagination: {
          limit,
          offset,
          total,
          totalPages:
            Math.ceil(
              total / limit,
            ),
        },
      });
    } catch (error) {
      console.error(
        "Admin locations error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load locations.",
      });
    }
  },
);

router.get(
  "/locations/tree",
  (_req, res) => {
    try {
      if (
        !requireTable(
          res,
          "locations",
        )
      ) {
        return;
      }

      const rows =
        db.prepare(`
          SELECT
            id,
            parent_id,
            type,
            name,
            slug,
            code,
            state_code,
            district_code,
            city_code,
            country_code,
            status
          FROM locations
          WHERE status<>'inactive'
          ORDER BY
            type,
            name
        `).all() as SqlRow[];

      const byParent =
        new Map<
          number | null,
          SqlRow[]
        >();

      for (const row of rows) {
        const parentId =
          row.parent_id == null
            ? null
            : Number(
                row.parent_id,
              );

        const children =
          byParent.get(
            parentId,
          ) || [];

        children.push(row);
        byParent.set(
          parentId,
          children,
        );
      }

      const build = (
        parentId: number | null,
      ): SqlRow[] =>
        (
          byParent.get(
            parentId,
          ) || []
        ).map(
          (row) => ({
            ...row,
            children:
              build(
                Number(row.id),
              ),
          }),
        );

      res.json({
        success: true,
        tree: build(null),
        count: rows.length,
      });
    } catch (error) {
      console.error(
        "Admin location tree error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load location tree.",
      });
    }
  },
);

/* ============================================================================
 * Form Submissions
 * ========================================================================== */

router.get(
  "/form-submissions",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "form_submissions",
        )
      ) {
        return;
      }

      const {
        limit,
        offset,
      } = parseListParams(req);

      const columns =
        tableColumns(
          "form_submissions",
        );

      const where = ["1=1"];
      const params: unknown[] = [];

      const formKey =
        normalizeText(
          req.query.formKey,
          150,
        );

      const status =
        statusText(
          req.query.status,
        );

      const entityType =
        statusText(
          req.query.entityType,
        );

      if (
        formKey &&
        columns.has("form_key")
      ) {
        where.push(
          "form_key=?",
        );
        params.push(formKey);
      }

      if (
        status &&
        columns.has("status")
      ) {
        where.push(
          "status=?",
        );
        params.push(status);
      }

      if (
        entityType &&
        columns.has("entity_type")
      ) {
        where.push(
          "LOWER(entity_type)=?",
        );
        params.push(entityType);
      }

      const search =
        normalizeText(
          req.query.search,
          180,
        );

      if (search) {
        const searchable = [
          "submission_number",
          "form_key",
          "name",
          "email",
          "phone",
          "whatsapp",
          "country",
          "state",
          "district",
          "city",
          "page_path",
          "landing_page",
        ].filter(
          (column) =>
            columns.has(column),
        );

        if (searchable.length) {
          where.push(`
            (
              ${searchable
                .map(
                  (column) =>
                    `${quoteIdentifier(
                      column,
                    )} LIKE ?`,
                )
                .join(" OR ")}
            )
          `);

          for (
            let index = 0;
            index < searchable.length;
            index += 1
          ) {
            params.push(
              `%${search}%`,
            );
          }
        }
      }

      const whereSql =
        where.join(" AND ");

      const total =
        Number(
          (
            db.prepare(`
              SELECT COUNT(*) value
              FROM form_submissions
              WHERE ${whereSql}
            `).get(
              ...params,
            ) as
              | {
                  value?: unknown;
                }
              | undefined
          )?.value ?? 0,
        );

      const order =
        columns.has(
          "submitted_at",
        )
          ? "submitted_at DESC,id DESC"
          : "id DESC";

      const rows =
        db.prepare(`
          SELECT *
          FROM form_submissions
          WHERE ${whereSql}
          ORDER BY ${order}
          LIMIT ?
          OFFSET ?
        `).all(
          ...params,
          limit,
          offset,
        ) as SqlRow[];

      res.json({
        success: true,
        submissions: rows,
        formSubmissions: rows,
        pagination: {
          limit,
          offset,
          total,
          totalPages:
            Math.ceil(
              total / limit,
            ),
        },
      });
    } catch (error) {
      console.error(
        "Admin form submissions error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load form submissions.",
      });
    }
  },
);

router.get(
  "/form-submissions/:id",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "form_submissions",
        )
      ) {
        return;
      }

      const id =
        asPositiveId(
          req.params.id,
        );

      if (!id) {
        return void res.status(400).json({
          success: false,
          error:
            "Invalid form submission id.",
        });
      }

      const submission =
        getRowById(
          "form_submissions",
          id,
        );

      if (!submission) {
        return void res.status(404).json({
          success: false,
          error:
            "Form submission not found.",
        });
      }

      const leadId =
        asPositiveId(
          submission.lead_id,
        );

      const lead =
        leadId &&
        tableExists("leads")
          ? getRowById(
              "leads",
              leadId,
            ) || null
          : null;

      res.json({
        success: true,
        submission,
        lead,
      });
    } catch (error) {
      console.error(
        "Admin form submission detail error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load form submission.",
      });
    }
  },
);

/* ============================================================================
 * General Settings
 * ========================================================================== */

router.get(
  "/settings",
  (_req, res) => {
    try {
      if (!tableExists("settings")) {
        return void res.json({
          success: true,
          settings: [],
        });
      }

      res.json({
        success: true,
        settings:
          db.prepare(`
            SELECT *
            FROM settings
            ORDER BY id
          `).all(),
      });
    } catch (error) {
      console.error(
        "Admin settings error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load settings.",
      });
    }
  },
);

router.patch(
  "/settings",
  (req, res) => {
    try {
      if (!requireTable(res, "settings")) {
        return;
      }

      const key =
        normalizeText(
          req.body?.settingKey ??
            req.body?.key,
          150,
        );

      if (!key) {
        return void res.status(400).json({
          success: false,
          error:
            "settingKey is required.",
        });
      }

      const old =
        db.prepare(`
          SELECT *
          FROM settings
          WHERE setting_key=?
          LIMIT 1
        `).get(
          key,
        ) as
          | SqlRow
          | undefined;

      if (!old) {
        return void res.status(404).json({
          success: false,
          error:
            "Setting not found.",
        });
      }

      const updates: string[] = [];
      const values: unknown[] = [];

      if (
        Object.prototype.hasOwnProperty.call(
          req.body || {},
          "value",
        ) ||
        Object.prototype.hasOwnProperty.call(
          req.body || {},
          "settingValue",
        )
      ) {
        const value =
          req.body.value ??
          req.body.settingValue;

        updates.push(
          "setting_value=?",
        );

        values.push(
          typeof value ===
          "string"
            ? value
            : JSON.stringify(
                value,
              ),
        );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          req.body || {},
          "settingType",
        )
      ) {
        updates.push(
          "setting_type=?",
        );

        values.push(
          normalizeText(
            req.body.settingType,
            30,
          ),
        );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          req.body || {},
          "description",
        )
      ) {
        updates.push(
          "description=?",
        );

        values.push(
          normalizeNullableText(
            req.body.description,
            1000,
          ),
        );
      }

      if (
        Object.prototype.hasOwnProperty.call(
          req.body || {},
          "isPublic",
        )
      ) {
        updates.push(
          "is_public=?",
        );

        values.push(
          boolInt(
            req.body.isPublic,
          ),
        );
      }

      if (!updates.length) {
        return void res.status(400).json({
          success: false,
          error:
            "No supported setting fields were supplied.",
        });
      }

      updates.push(
        "updated_at=CURRENT_TIMESTAMP",
      );

      values.push(key);

      db.prepare(`
        UPDATE settings
        SET ${updates.join(",")}
        WHERE setting_key=?
      `).run(
        ...values,
      );

      const updated =
        db.prepare(`
          SELECT *
          FROM settings
          WHERE setting_key=?
          LIMIT 1
        `).get(
          key,
        ) as
          | SqlRow
          | undefined;

      audit(
        req,
        currentUserId(res),
        "admin.settings.updated",
        "setting",
        Number(
          old.id ?? 0,
        ),
        old,
        updated || null,
      );

      res.json({
        success: true,
        setting:
          updated || null,
      });
    } catch (error) {
      console.error(
        "Admin update settings error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to update setting.",
      });
    }
  },
);

/* ============================================================================
 * Audit Logs
 * ========================================================================== */

router.get(
  "/audit-logs",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "audit_logs",
        )
      ) {
        return;
      }

      const {
        limit,
        offset,
      } = parseListParams(req);

      const actor =
        statusText(
          req.query.actorType,
        );

      const action =
        normalizeText(
          req.query.action,
          150,
        );

      const entityType =
        statusText(
          req.query.entityType,
        );

      const where = ["1=1"];
      const params: unknown[] = [];

      if (actor) {
        where.push(
          "actor_type=?",
        );
        params.push(actor);
      }

      if (action) {
        where.push(
          "action LIKE ?",
        );
        params.push(
          `%${action}%`,
        );
      }

      if (entityType) {
        where.push(
          "entity_type=?",
        );
        params.push(entityType);
      }

      const rows =
        db.prepare(`
          SELECT
            id,
            user_id,
            visitor_id,
            session_id,
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
          FROM audit_logs
          WHERE ${where.join(" AND ")}
          ORDER BY id DESC
          LIMIT ?
          OFFSET ?
        `).all(
          ...params,
          limit,
          offset,
        ) as SqlRow[];

      const total =
        Number(
          (
            db.prepare(`
              SELECT COUNT(*) value
              FROM audit_logs
              WHERE ${where.join(" AND ")}
            `).get(
              ...params,
            ) as
              | {
                  value?: unknown;
                }
              | undefined
          )?.value ?? 0,
        );

      res.json({
        success: true,
        logs: rows,
        auditLogs: rows,
        pagination: {
          limit,
          offset,
          total,
          totalPages:
            Math.ceil(
              total / limit,
            ),
        },
      });
    } catch (error) {
      console.error(
        "Admin audit logs error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load audit logs.",
      });
    }
  },
);

/* ============================================================================
 * Visitor Analytics
 * ========================================================================== */

function analyticsDateClause(
  column: string,
  req: Request,
): {
  sql: string;
  params: string[];
} {
  const clauses: string[] = [];
  const params: string[] = [];

  const from =
    normalizeText(
      req.query.from ??
        req.query.dateFrom,
      40,
    );

  const to =
    normalizeText(
      req.query.to ??
        req.query.dateTo,
      40,
    );

  if (from) {
    clauses.push(
      `${column}>=?`,
    );
    params.push(from);
  }

  if (to) {
    clauses.push(
      `${column}<=?`,
    );
    params.push(to);
  }

  return {
    sql: clauses.length
      ? ` AND ${clauses.join(
          " AND ",
        )}`
      : "",
    params,
  };
}

router.get(
  "/analytics/overview",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "web_page_views",
        )
      ) {
        return;
      }

      const pv =
        analyticsDateClause(
          "entered_at",
          req,
        );

      const ev =
        analyticsDateClause(
          "occurred_at",
          req,
        );

      /*
       * FIX:
       * Removed unused `vv` variable which was causing:
       *
       * TS6133: 'vv' is declared but its value is never read.
       */

      const scalar = (
        table: string,
        where = "1=1",
        params: unknown[] = [],
      ): number =>
        tableExists(table)
          ? Number(
              (
                db.prepare(`
                  SELECT COUNT(*) value
                  FROM ${safeTableName(
                    table,
                  )}
                  WHERE ${where}
                `).get(
                  ...params,
                ) as
                  | {
                      value?: unknown;
                    }
                  | undefined
              )?.value ?? 0,
            )
          : 0;

      const visitorDate =
        analyticsDateClause(
          "created_at",
          req,
        );

      const sessionDate =
        analyticsDateClause(
          "started_at",
          req,
        );

      const conversionDate =
        analyticsDateClause(
          "created_at",
          req,
        );

      const formDate =
        analyticsDateClause(
          "submitted_at",
          req,
        );

      const leadDate =
        analyticsDateClause(
          "created_at",
          req,
        );

      const paymentDate =
        analyticsDateClause(
          "paid_at",
          req,
        );

      const visitors =
        scalar(
          "web_visitors",
          `is_bot=0${visitorDate.sql}`,
          visitorDate.params,
        );

      const sessions =
        scalar(
          "web_sessions",
          `is_bot=0${sessionDate.sql}`,
          sessionDate.params,
        );

      const pageViews =
        scalar(
          "web_page_views",
          `is_bot=0${pv.sql}`,
          pv.params,
        );

      const events =
        scalar(
          "web_events",
          `1=1${ev.sql}`,
          ev.params,
        );

      const conversions =
        scalar(
          "web_conversions",
          `1=1${conversionDate.sql}`,
          conversionDate.params,
        );

      const forms =
        scalar(
          "form_submissions",
          `1=1${formDate.sql}`,
          formDate.params,
        );

      const leads =
        scalar(
          "leads",
          `1=1${leadDate.sql}`,
          leadDate.params,
        );

      const revenue =
        tableExists("payments")
          ? Number(
              (
                db.prepare(`
                  SELECT COALESCE(
                    SUM(amount),
                    0
                  ) value
                  FROM payments
                  WHERE status IN (
                    'paid',
                    'captured'
                  )
                  ${paymentDate.sql}
                `).get(
                  ...paymentDate.params,
                ) as
                  | {
                      value?: unknown;
                    }
                  | undefined
              )?.value ?? 0,
            )
          : 0;

      const topPages =
        db.prepare(`
          SELECT
            path,
            COUNT(*) views,
            COUNT(DISTINCT visitor_id) unique_visitors,
            COUNT(DISTINCT session_id) sessions,
            ROUND(
              AVG(duration_seconds),
              2
            ) avg_duration_seconds,
            MAX(entered_at) last_viewed_at
          FROM web_page_views
          WHERE is_bot=0
            ${pv.sql}
          GROUP BY path
          ORDER BY views DESC
          LIMIT 50
        `).all(
          ...pv.params,
        ) as SqlRow[];

      const sources =
        db.prepare(`
          SELECT
            COALESCE(
              utm_source,
              'direct'
            ) source,
            COUNT(*) page_views,
            COUNT(DISTINCT visitor_id) unique_visitors
          FROM web_page_views
          WHERE is_bot=0
            ${pv.sql}
          GROUP BY
            COALESCE(
              utm_source,
              'direct'
            )
          ORDER BY
            page_views DESC
          LIMIT 50
        `).all(
          ...pv.params,
        ) as SqlRow[];

      const locations =
        db.prepare(`
          SELECT
            COALESCE(country,'') country,
            COALESCE(state,'') state,
            COALESCE(district,'') district,
            COALESCE(city,'') city,
            COUNT(*) page_views,
            COUNT(DISTINCT visitor_id) unique_visitors
          FROM web_page_views
          WHERE is_bot=0
            ${pv.sql}
          GROUP BY
            country,
            state,
            district,
            city
          ORDER BY
            unique_visitors DESC
          LIMIT 100
        `).all(
          ...pv.params,
        ) as SqlRow[];

      const convertedLeads =
        scalar(
          "leads",
          `
            status='converted'
            ${leadDate.sql}
          `,
          leadDate.params,
        );

      res.json({
        success: true,
        filters: {
          from:
            req.query.from ??
            req.query.dateFrom ??
            null,
          to:
            req.query.to ??
            req.query.dateTo ??
            null,
        },
        totals: {
          visitors,
          sessions,
          pageViews,
          events,
          conversions,
          formSubmissions:
            forms,
          leads,
          convertedLeads,
          revenue,
        },
        topPages,
        sourceBreakdown:
          sources,
        locationBreakdown:
          locations,
      });
    } catch (error) {
      console.error(
        "Admin analytics overview error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load analytics overview.",
      });
    }
  },
);

router.get(
  "/analytics/pages",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "web_page_views",
        )
      ) {
        return;
      }

      const limit =
        normalizeInteger(
          req.query.limit,
          50,
          1,
          500,
        );

      const search =
        normalizeText(
          req.query.search,
          300,
        );

      const dateFilter =
        analyticsDateClause(
          "entered_at",
          req,
        );

      const where = [
        `is_bot=0${dateFilter.sql}`,
      ];

      const params: unknown[] = [
        ...dateFilter.params,
      ];

      if (search) {
        where.push(
          "path LIKE ?",
        );
        params.push(
          `%${search}%`,
        );
      }

      const rows =
        db.prepare(`
          SELECT
            path,
            page_type,
            COUNT(*) views,
            COUNT(DISTINCT visitor_id) unique_visitors,
            COUNT(DISTINCT session_id) sessions,
            ROUND(
              AVG(duration_seconds),
              2
            ) avg_duration_seconds,
            ROUND(
              AVG(scroll_depth_percent),
              2
            ) avg_scroll_depth_percent,
            SUM(click_count) clicks,
            SUM(interaction_count) interactions,
            SUM(
              CASE
                WHEN engaged=1
                THEN 1
                ELSE 0
              END
            ) engaged_views,
            MAX(entered_at) last_viewed_at
          FROM web_page_views
          WHERE ${where.join(" AND ")}
          GROUP BY
            path,
            page_type
          ORDER BY views DESC
          LIMIT ?
        `).all(
          ...params,
          limit,
        ) as SqlRow[];

      res.json({
        success: true,
        pages: rows,
      });
    } catch (error) {
      console.error(
        "Admin analytics pages error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load page analytics.",
      });
    }
  },
);

router.get(
  "/analytics/events",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "web_events",
        )
      ) {
        return;
      }

      const limit =
        normalizeInteger(
          req.query.limit,
          100,
          1,
          500,
        );

      const dateFilter =
        analyticsDateClause(
          "occurred_at",
          req,
        );

      const rows =
        db.prepare(`
          SELECT
            event_name,
            event_category,
            target_type,
            COUNT(*) count,
            COUNT(DISTINCT visitor_id) unique_visitors,
            MAX(occurred_at) last_occurred_at
          FROM web_events
          WHERE 1=1
            ${dateFilter.sql}
          GROUP BY
            event_name,
            event_category,
            target_type
          ORDER BY count DESC
          LIMIT ?
        `).all(
          ...dateFilter.params,
          limit,
        ) as SqlRow[];

      res.json({
        success: true,
        events: rows,
      });
    } catch (error) {
      console.error(
        "Admin analytics events error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load event analytics.",
      });
    }
  },
);

router.get(
  "/analytics/locations",
  (req, res) => {
    try {
      if (
        !requireTable(
          res,
          "web_page_views",
        )
      ) {
        return;
      }

      const level =
        statusText(
          req.query.level,
        );

      const selected =
        (
          {
            country:
              "country",
            state:
              "state",
            district:
              "district",
            city:
              "city",
          } as Record<
            string,
            string
          >
        )[level] || "city";

      const dateFilter =
        analyticsDateClause(
          "entered_at",
          req,
        );

      const limit =
        normalizeInteger(
          req.query.limit,
          100,
          1,
          500,
        );

      const rows =
        db.prepare(`
          SELECT
            COALESCE(
              ${quoteIdentifier(
                selected,
              )},
              ''
            ) location,
            COUNT(*) page_views,
            COUNT(DISTINCT visitor_id) unique_visitors,
            COUNT(DISTINCT session_id) sessions
          FROM web_page_views
          WHERE is_bot=0
            ${dateFilter.sql}
          GROUP BY
            ${quoteIdentifier(
              selected,
            )}
          ORDER BY
            unique_visitors DESC
          LIMIT ?
        `).all(
          ...dateFilter.params,
          limit,
        ) as SqlRow[];

      res.json({
        success: true,
        level:
          level || "city",
        locations: rows,
      });
    } catch (error) {
      console.error(
        "Admin analytics locations error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load location analytics.",
      });
    }
  },
);

router.get(
  "/analytics/daily",
  (req, res) => {
    try {
      if (
        tableExists(
          "analytics_daily_site_stats",
        )
      ) {
        return void res.json({
          success: true,
          daily:
            db.prepare(`
              SELECT *
              FROM analytics_daily_site_stats
              ORDER BY date DESC
              LIMIT 90
            `).all(),
          source:
            "analytics_daily_site_stats",
        });
      }

      if (
        !requireTable(
          res,
          "web_page_views",
        )
      ) {
        return;
      }

      const dateFilter =
        analyticsDateClause(
          "entered_at",
          req,
        );

      const rows =
        db.prepare(`
          SELECT
            substr(
              entered_at,
              1,
              10
            ) date,
            COUNT(*) page_views,
            COUNT(DISTINCT visitor_id) unique_visitors,
            COUNT(DISTINCT session_id) sessions,
            ROUND(
              AVG(duration_seconds),
              2
            ) avg_duration_seconds
          FROM web_page_views
          WHERE is_bot=0
            ${dateFilter.sql}
          GROUP BY
            substr(
              entered_at,
              1,
              10
            )
          ORDER BY
            date DESC
          LIMIT 90
        `).all(
          ...dateFilter.params,
        ) as SqlRow[];

      return void res.json({
        success: true,
        daily: rows,
        source:
          "web_page_views",
      });
    } catch (error) {
      console.error(
        "Admin daily analytics error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load daily analytics.",
      });
    }
  },
);

/* ============================================================================
 * Feature Flags
 * ========================================================================== */

router.get(
  "/feature-flags",
  (_req, res) => {
    res.json({
      success: true,
      flags: {
        premiumSubscriptions:
          Boolean(
            tableExists(
              "subscription_plans",
            ) &&
              tableExists(
                "subscription_plan_prices",
              ) &&
              (
                tableExists(
                  "pandit_subscriptions",
                ) ||
                tableExists(
                  "temple_subscriptions",
                ) ||
                tableExists(
                  "ashram_subscriptions",
                )
              ),
          ),

        panditSubscriptions:
          tableExists(
            "pandit_subscriptions",
          ),

        templeSubscriptions:
          tableExists(
            "temple_subscriptions",
          ),

        ashramSubscriptions:
          tableExists(
            "ashram_subscriptions",
          ),

        subscriptionPlanPrices:
          tableExists(
            "subscription_plan_prices",
          ),

        payments:
          tableExists("payments"),

        paymentOrders:
          tableExists(
            "payment_orders",
          ),

        paymentLinks:
          tableExists(
            "payment_links",
          ),

        razorpay:
          Boolean(
            process.env.RAZORPAY_KEY_ID &&
              process.env.RAZORPAY_KEY_SECRET,
          ),

        seoManagement:
          Boolean(
            tableExists("seo_entries") &&
              tableExists(
                "seo_location_pages",
              ),
          ),

        pujaServices:
          tableExists(
            "puja_services",
          ),

        videoCatalogue:
          tableExists("videos"),

        visitorAnalytics:
          Boolean(
            tableExists(
              "web_visitors",
            ) &&
              tableExists(
                "web_sessions",
              ) &&
              tableExists(
                "web_page_views",
              ) &&
              tableExists(
                "web_events",
              ),
          ),

        formCRM:
          Boolean(
            tableExists(
              "form_submissions",
            ) &&
              tableExists("leads"),
          ),

        ashramManagerArchitecture:
          Boolean(
            tableExists(
              "ashram_manager_profiles",
            ) &&
              tableExists(
                "ashram_manager_assignments",
              ),
          ),

        templeManagerArchitecture:
          Boolean(
            tableExists(
              "temple_manager_profiles",
            ) &&
              tableExists(
                "temple_manager_assignments",
              ),
          ),
      },
    });
  },
);

/* ============================================================================
 * Schema Status
 * ========================================================================== */

const SCHEMA_TABLES = [
  "users",
  "roles",
  "permissions",
  "role_permissions",
  "sessions",
  "password_reset_tokens",
  "verification_tokens",
  "auth_identities",

  "locations",
  "location_aliases",
  "visitor_profiles",
  "pandit_profiles",
  "pandit_service_offerings",
  "pandit_verification_documents",
  "pandit_subscriptions",
  "subscription_plan_prices",

  "temples",
  "temple_manager_profiles",
  "temple_manager_assignments",

  "ashrams",
  "ashram_manager_profiles",
  "ashram_manager_assignments",
  "ashram_programs",
  "ashram_courses",
  "ashram_subscriptions",

  "puja_services",
  "temple_puja_services",

  "yatra_packages",
  "yatra_package_locations",
  "package_itineraries",

  "spiritual_places",
  "events",
  "event_schedules",

  "gallery_items",
  "gallery_media",

  "videos",

  "courses",
  "course_lessons",

  "articles",
  "live_streams",

  "form_definitions",
  "form_submissions",
  "contact_requests",
  "puja_service_requests",
  "pandit_booking_requests",
  "temple_enquiry_requests",
  "ashram_enquiry_requests",
  "yatra_booking_requests",
  "event_enquiry_requests",
  "course_enquiry_requests",

  "leads",
  "lead_capture_sessions",
  "lead_capture_signals",
  "lead_assignments",
  "lead_events",
  "lead_consents",
  "lead_documents",
  "lead_notes",
  "lead_followups",
  "lead_communications",
  "lead_tags",
  "lead_tag_map",

  "bookings",
  "sales_activities",

  "subscription_plans",
  "subscription_events",

  "payment_orders",
  "payments",
  "payment_links",
  "payment_webhook_events",

  "web_visitors",
  "web_sessions",
  "web_page_views",
  "web_events",
  "analytics_goals",
  "analytics_daily_page_stats",
  "analytics_daily_site_stats",
  "web_conversions",

  "seo_entries",
  "seo_content_blocks",
  "seo_redirects",
  "seo_settings",
  "seo_pages",
  "seo_templates",
  "seo_location_pages",
  "seo_keywords",
  "seo_internal_links",
  "seo_url_health",

  "homepage_content",
  "homepage_sections",
  "homepage_stats",
  "settings",
  "audit_logs",
];

router.get(
  "/schema-status",
  (_req, res) => {
    try {
      const status =
        Object.fromEntries(
          SCHEMA_TABLES.map(
            (table) => [
              table,
              tableExists(table),
            ],
          ),
        );

      const missing =
        SCHEMA_TABLES.filter(
          (table) =>
            !status[table],
        );

      const roles =
        tableExists("roles")
          ? (db.prepare(`
              SELECT
                code,
                public_registration_enabled,
                approval_required,
                dashboard_path,
                is_system,
                is_active
              FROM roles
              ORDER BY id
            `).all() as SqlRow[])
          : [];

      const permissions =
        tableExists(
          "permissions",
        )
          ? (db.prepare(`
              SELECT COUNT(*) count
              FROM permissions
            `).get() as SqlRow)
          : {};

      const rolePermissions =
        tableExists(
          "role_permissions",
        )
          ? (db.prepare(`
              SELECT
                r.code role,
                COUNT(*) count
              FROM role_permissions rp
              JOIN roles r
                ON r.id=rp.role_id
              GROUP BY r.code
              ORDER BY r.id
            `).all() as SqlRow[])
          : [];

      res.json({
        success: true,
        database: "SQLite",
        status,
        summary: {
          available:
            SCHEMA_TABLES.length -
            missing.length,
          missing:
            missing.length,
          missingTables:
            missing,
        },
        canonicalRoles:
          roles,
        permissionSummary: {
          permissions,
          rolePermissions,
        },
        canonicalCommercialSchema: {
          subscriptionPlans:
            tableExists(
              "subscription_plans",
            ),
          subscriptionPlanPrices:
            tableExists(
              "subscription_plan_prices",
            ),
          panditSubscriptions:
            tableExists(
              "pandit_subscriptions",
            ),
          templeSubscriptions:
            tableExists(
              "temple_subscriptions",
            ),
          ashramSubscriptions:
            tableExists(
              "ashram_subscriptions",
            ),
          payments:
            tableExists("payments"),
          paymentOrders:
            tableExists(
              "payment_orders",
            ),
          paymentLinks:
            tableExists(
              "payment_links",
            ),
        },
        razorpay: {
          configured:
            Boolean(
              process.env.RAZORPAY_KEY_ID &&
                process.env.RAZORPAY_KEY_SECRET,
            ),
          mode:
            normalizeText(
              process.env.RAZORPAY_MODE ||
                "test",
              20,
            ).toLowerCase() ===
            "live"
              ? "live"
              : "test",
        },
      });
    } catch (error) {
      console.error(
        "Admin schema status error:",
        error,
      );

      res.status(500).json({
        success: false,
        error:
          "Unable to load schema status.",
      });
    }
  },
);

/* ============================================================================
 * Export
 * ========================================================================== */

export default router;