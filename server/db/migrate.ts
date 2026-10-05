/* eslint-disable @typescript-eslint/no-explicit-any */
import "dotenv/config";

import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { dirname, isAbsolute, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";
import * as fs from "node:fs";

/*
 * DivyaDhara SQLite Master Migration — FINAL v4
 *
 * Canonical source:
 *   server/db/schema.sql
 *
 * Business architecture:
 *   Visitor (registered or anonymous)
 *   Pandit
 *   Temple Manager
 *   Ashram Manager
 *   Sales
 *   Super Admin
 *
 * Commercial plans:
 *   Pandit  : ₹199 Basic / ₹499 Premium
 *   Temple  : ₹499 Basic / ₹999 Premium
 *   Ashram  : ₹499 Basic / ₹1,499 Premium
 *
 * Important:
 * - This script does NOT invent anonymous users. Anonymous activity stays
 *   attached to visitor/session IDs and may later be linked to a user_id.
 * - Existing business rows are preserved where the target schema permits it.
 * - Legacy subscription plans are NOT copied into the rebuilt plan catalogue.
 *   Historical subscription terms are preserved in subscription snapshots, and
 *   old plan references are remapped to the six canonical plans.
 * - System role identity is reconciled by stable role code, never by integer ID.
 * - The migration never silently disables foreign-key verification. The target
 *   is checked before the filesystem swap.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "../..");

const DATABASE_FILE = resolveDatabasePath();
const DATABASE_DIR = dirname(DATABASE_FILE);
const SCHEMA_FILE = resolve(__dirname, "schema.sql");
const BACKUP_DIR = resolve(DATABASE_DIR, "backups");

const MIGRATION_KEY = "2026-10-03-phase2-role-alignment-v4";
const MIGRATION_VERSION = 4;

const NO_BACKUP = process.argv.includes("--no-backup");
const FORCE = process.argv.includes("--force");

const CANONICAL_ROLE_CODES = [
  "visitor",
  "pandit",
  "temple_manager",
  "ashram_manager",
  "sales",
  "super_admin",
] as const;

type CanonicalAudience = "pandit" | "temple" | "ashram";

type SqliteRow = Record<string, unknown>;

type TableInfoRow = {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
  hidden?: number;
};

type UniqueIndexInfo = {
  name: string;
  columns: string[];
};

type MigrationStats = {
  tablesCreatedFromSchema: number;
  sourceTables: number;
  copiedTables: number;
  copiedRows: number;
  normalizedRows: number;
  skippedRows: number;
  legacyTablesPreserved: number;
  locationRowsAdded: number;
  locationAliasRowsAdded: number;
  entitiesLinkedToLocations: number;
  serviceLocationRowsAdded: number;
  seoEntriesLinked: number;
  seoKeywordsLinked: number;
  seoLocationPagesChanged: number;
  entitySeoEntriesChanged: number;
  canonicalPlansUpserted: number;
  legacyPlansDeactivated: number;
  planReferencesRewired: number;
  subscriptionExpiryRowsRepaired: number;
  subscriptionPlanPriceRowsSeeded: number;
  subscriptionPlanPriceReferencesRewired: number;
  leadsLinkedToUsers: number;
  backupsCreated: string | null;
};

function resolveDatabasePath(): string {
  const configured = process.env.DIVYADHARA_DB_PATH?.trim();
  if (!configured) return resolve(PROJECT_ROOT, "data", "divyadhara.sqlite");
  return isAbsolute(configured) ? resolve(configured) : resolve(process.cwd(), configured);
}

function isNewOrEmptyDatabase(filePath: string): boolean {
  if (!existsSync(filePath)) return true;

  try {
    return statSync(filePath).size === 0;
  } catch {
    return false;
  }
}

function ensureDirectory(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function quoteString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function nowForFilename(): string {
  const date = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function tempDatabasePath(): string {
  return resolve(DATABASE_DIR, `.divyadhara-migrating-${process.pid}-${nowForFilename()}.sqlite`);
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function tableExists(database: Database.Database, tableName: string): boolean {
  const row = database
    .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`)
    .get(tableName) as { ok?: number } | undefined;
  return Boolean(row?.ok);
}

function viewExists(database: Database.Database, viewName: string): boolean {
  const row = database
    .prepare(`SELECT 1 AS ok FROM sqlite_master WHERE type='view' AND name=? LIMIT 1`)
    .get(viewName) as { ok?: number } | undefined;
  return Boolean(row?.ok);
}

function getTableInfo(database: Database.Database, tableName: string): TableInfoRow[] {
  return database.pragma(`table_xinfo(${quoteIdentifier(tableName)})`) as TableInfoRow[];
}

function getVisibleTableInfo(database: Database.Database, tableName: string): TableInfoRow[] {
  return getTableInfo(database, tableName).filter((column) => Number(column.hidden ?? 0) === 0);
}

function getUniqueIndexes(database: Database.Database, tableName: string): UniqueIndexInfo[] {
  const indexes = database.pragma(`index_list(${quoteIdentifier(tableName)})`) as Array<{
    seq: number;
    name: string;
    unique: number;
  }>;

  return indexes
    .filter((index) => Number(index.unique) === 1)
    .map((index) => {
      const columns = database.pragma(`index_info(${quoteIdentifier(index.name)})`) as Array<{
        seqno: number;
        cid: number;
        name: string | null;
      }>;
      return {
        name: index.name,
        columns: columns
          .sort((a, b) => a.seqno - b.seqno)
          .map((column) => column.name)
          .filter((name): name is string => Boolean(name)),
      };
    });
}

function getTableSql(database: Database.Database, tableName: string): string | null {
  const row = database
    .prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=? LIMIT 1`)
    .get(tableName) as { sql?: string | null } | undefined;
  return row?.sql ?? null;
}

function getViewSql(database: Database.Database, viewName: string): string | null {
  const row = database
    .prepare(`SELECT sql FROM sqlite_master WHERE type='view' AND name=? LIMIT 1`)
    .get(viewName) as { sql?: string | null } | undefined;
  return row?.sql ?? null;
}

function getObjectSqls(
  database: Database.Database,
  type: "trigger" | "index",
  tableName?: string,
): Array<{ name: string; sql: string }> {
  const rows = database
    .prepare(`
      SELECT name, sql
      FROM sqlite_master
      WHERE type = ?
        AND sql IS NOT NULL
        ${tableName ? "AND tbl_name = ?" : ""}
      ORDER BY name
    `)
    .all(...(tableName ? [type, tableName] : [type])) as Array<{
    name: string;
    sql: string | null;
  }>;

  return rows
    .filter((row): row is { name: string; sql: string } => Boolean(row.sql))
    .map((row) => ({ name: row.name, sql: row.sql }));
}

function tableNames(database: Database.Database): string[] {
  const rows = database
    .prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `)
    .all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

function viewNames(database: Database.Database): string[] {
  const rows = database
    .prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type='view' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `)
    .all() as Array<{ name: string }>;
  return rows.map((row) => row.name);
}

function countRows(database: Database.Database, tableName: string): number {
  const row = database
    .prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(tableName)}`)
    .get() as { count?: number } | undefined;
  return Number(row?.count ?? 0);
}

function configureDatabase(
  database: Database.Database,
  options: { foreignKeys?: boolean } = {},
): void {
  database.pragma("busy_timeout = 10000");
  database.pragma("journal_mode = WAL");
  database.pragma("synchronous = NORMAL");
  database.pragma("temp_store = MEMORY");
  database.pragma("recursive_triggers = ON");
  // The temporary target deliberately disables FK enforcement while legacy
  // rows are copied and reconciled. Final verification always re-enables it.
  database.pragma(`foreign_keys = ${options.foreignKeys === false ? "OFF" : "ON"}`);
}

function ensureMigrationTable(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      migration_key TEXT NOT NULL UNIQUE,
      version INTEGER NOT NULL,
      description TEXT,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

function migrationAlreadyApplied(database: Database.Database): boolean {
  if (!tableExists(database, "schema_migrations")) return false;
  const row = database
    .prepare(`SELECT 1 AS applied FROM schema_migrations WHERE migration_key=? LIMIT 1`)
    .get(MIGRATION_KEY) as { applied?: number } | undefined;
  return Boolean(row?.applied);
}

function recordMigration(database: Database.Database, description: string): void {
  ensureMigrationTable(database);
  database
    .prepare(`
      INSERT OR IGNORE INTO schema_migrations (migration_key, version, description)
      VALUES (?, ?, ?)
    `)
    .run(MIGRATION_KEY, MIGRATION_VERSION, description);
  database.pragma(`user_version = ${MIGRATION_VERSION}`);
}

function readSchema(): string {
  if (!existsSync(SCHEMA_FILE)) throw new Error(`Schema file not found: ${SCHEMA_FILE}`);
  const schema = readFileSync(SCHEMA_FILE, "utf8").trim();
  if (!schema) throw new Error(`Schema file is empty: ${SCHEMA_FILE}`);
  return schema;
}

function schemaObjectContracts(): { tables: string[]; views: string[] } {
  const schema = readSchema();
  const tables = Array.from(
    schema.matchAll(/^CREATE TABLE IF NOT EXISTS\s+([A-Za-z0-9_]+)/gm),
  ).map((match) => String(match[1]));
  const views = Array.from(
    schema.matchAll(/^CREATE VIEW IF NOT EXISTS\s+([A-Za-z0-9_]+)/gm),
  ).map((match) => String(match[1]));

  return {
    tables: [...new Set(tables)],
    views: [...new Set(views)],
  };
}

function readMigrationSchema(): string {
  return readSchema().replace(
    /^\s*PRAGMA\s+foreign_keys\s*=\s*ON\s*;\s*/gim,
    "PRAGMA foreign_keys = OFF;\n",
  );
}

function initializeFreshDatabase(database: Database.Database): number {
  database.exec(readMigrationSchema());
  return Number(
    (
      database
        .prepare(`
          SELECT COUNT(*) AS count
          FROM sqlite_master
          WHERE type='table' AND name NOT LIKE 'sqlite_%'
        `)
        .get() as { count?: number } | undefined
    )?.count ?? 0,
  );
}

function createBackup(sourcePath: string): string {
  ensureDirectory(BACKUP_DIR);

  const baseName = `${basename(sourcePath, ".sqlite")}-before-final-migration-${nowForFilename()}-${process.pid}`;
  let backupPath = resolve(BACKUP_DIR, `${baseName}.sqlite`);
  let suffix = 1;

  while (existsSync(backupPath)) {
    backupPath = resolve(BACKUP_DIR, `${baseName}-${suffix}.sqlite`);
    suffix += 1;
  }

  copyFileSync(sourcePath, backupPath);
  return backupPath;
}

function cleanupSQLiteSidecars(basePath: string): void {
  for (const suffix of ["-wal", "-shm"]) {
    const sidecar = `${basePath}${suffix}`;
    if (existsSync(sidecar)) {
      try {
        unlinkSync(sidecar);
      } catch {
        // Best effort only.
      }
    }
  }
}

function safeSlug(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "item"
  );
}

function jsonArrayFallback(): string {
  return "[]";
}

function jsonObjectFallback(): string {
  return "{}";
}

function requiredFallbackExpression(
  tableName: string,
  column: TableInfoRow,
  sourceRow: SqliteRow,
): string | null {
  const name = column.name.toLowerCase();
  const table = tableName.toLowerCase();
  const sourceId = Number(sourceRow.id ?? 0) || 0;

  if (name === "created_at" || name === "updated_at") return "CURRENT_TIMESTAMP";
  if (name === "country") return quoteString("India");
  if (name === "currency") return quoteString("INR");
  if (name === "billing_interval") return quoteString("monthly");
  if (name === "duration_days") return "30";
  if (name === "lead_limit" || name === "leads_used") return "0";
  if (name === "audience") return quoteString("pandit");
  if (name === "status" || name === "profile_status") {
    if (table === "leads") return quoteString("new");
    if (table === "form_submissions") return quoteString("received");
    if (table === "pandit_profiles") return quoteString("pending");
    if (table === "pandit_verification_documents") return quoteString("pending");
    if (table === "temple_manager_assignments") return quoteString("active");
    return quoteString("active");
  }
  if (name === "verification_status") return quoteString("pending");
  if (name === "priority") return quoteString("normal");
  if (name === "contact_preference") return quoteString("any");
  if (name === "source_type") return quoteString("website");
  if (name === "keyword_type") return quoteString("secondary");
  if (name === "run_type") return quoteString("generate");
  if (name === "result") return quoteString("success");
  if (name === "page_kind") return quoteString("listing");
  if (name === "location_level") return quoteString("city");
  if (name === "catalog_type") return quoteString("other");
  if (name === "purpose") return quoteString("other");
  if (name === "entity_type") return quoteString("other");

  if (
    name.endsWith("_json") ||
    ["metadata", "metadata_json", "payload_json"].includes(name)
  ) {
    const arrayWords = [
      "array",
      "list",
      "keywords",
      "features",
      "gallery",
      "benefits",
      "facilities",
      "activities",
      "courses",
      "places",
      "terms",
      "inclusions",
      "exclusions",
      "services",
    ];
    return quoteString(arrayWords.some((word) => name.includes(word)) ? jsonArrayFallback() : jsonObjectFallback());
  }

  if (
    name.startsWith("is_") ||
    name.startsWith("has_") ||
    name.endsWith("_enabled") ||
    name.endsWith("_active") ||
    name.endsWith("_published") ||
    [
      "featured",
      "verified",
      "authorized_contact",
      "booking_enabled",
      "listing_enabled",
      "analytics_access",
      "featured_listing",
      "marketing_consent",
      "whatsapp_consent",
    ].includes(name)
  ) {
    return "0";
  }

  if (name === "code") {
    const rawName = String(sourceRow.name ?? sourceRow.title ?? sourceRow.slug ?? table);
    return quoteString(`${safeSlug(rawName)}-${sourceId || Date.now()}`);
  }

  if (name === "slug") {
    const rawName = String(sourceRow.name ?? sourceRow.title ?? sourceRow.display_name ?? table);
    return quoteString(`${safeSlug(rawName)}-${sourceId || Date.now()}`);
  }

  if (name.endsWith("_number")) {
    const prefix = name.replace(/_number$/, "").replace(/[^a-z0-9]+/g, "-").toUpperCase();
    return quoteString(`${prefix}-${sourceId || Date.now()}`);
  }

  const normalizedType = column.type.toUpperCase();
  if (
    normalizedType.includes("INT") ||
    normalizedType.includes("REAL") ||
    normalizedType.includes("NUM") ||
    normalizedType.includes("DEC")
  ) return "0";
  if (normalizedType.includes("BLOB")) return "X''";
  if (normalizedType.includes("TEXT") || normalizedType.includes("CHAR")) return quoteString("");
  return null;
}

function resolveSourceColumn(sourceColumns: Set<string>, targetColumn: string): string | null {
  if (sourceColumns.has(targetColumn)) return targetColumn;

  const aliases: Record<string, string[]> = {
    name: ["display_name", "service_name", "title", "full_name"],
    display_name: ["name", "full_name"],
    title: ["name"],
    image: ["image_url", "photo", "thumbnail", "cover_image"],
    photo: ["image", "image_url", "avatar", "profile_image"],
    description: ["short_description", "summary", "about", "content"],
    summary: ["short_description", "description"],
    city: ["location_city", "city_name", "town"],
    state: ["location_state", "state_name", "province"],
    district: ["location_district", "district_name"],
    country: ["location_country", "country_name", "nation"],
    phone: ["contact_phone", "mobile", "mobile_number", "phone_number"],
    email: ["contact_email", "email_address"],
    price_amount: ["price", "amount", "fee", "price_from_amount"],
    price_from_amount: ["price", "amount", "fee"],
    duration_text: ["duration", "duration_label"],
    duration_minutes: ["duration_in_minutes", "minutes"],
    event_date: ["date"],
    fee: ["price", "amount"],
    organizer: ["organiser"],
    spiritual_place_id: ["place_id"],
    yatra_package_id: ["package_id"],
    puja_service_id: ["puja_id", "service_id"],
    provider_order_id: ["razorpay_order_id"],
    provider_payment_id: ["razorpay_payment_id"],
    provider_link_id: ["razorpay_link_id"],
    featured_listing: ["featured", "is_featured"],
    listing_enabled: ["listing_active", "is_active"],
    verification_badge: ["verified", "is_verified"],
    analytics_access: ["analytics_enabled"],
    canonical_url: ["canonical"],
    robots: ["robots_meta"],
    schema_json: ["structured_data_json", "schema"],
    meta_description: ["description_meta", "meta_desc"],
    is_indexable: ["indexable", "is_seo_indexable"],
    path: ["url", "slug_path", "canonical_path"],
  };

  for (const candidate of aliases[targetColumn] ?? []) {
    if (sourceColumns.has(candidate)) return candidate;
  }
  return null;
}

function normalizeEnumValue(tableName: string, columnName: string, value: unknown): unknown {
  if (value === null || value === undefined || value === "") return value;

  const table = tableName.toLowerCase();
  const column = columnName.toLowerCase();
  const text = String(value).trim();
  const lower = text.toLowerCase();

  const booleanColumns = new Set([
    "is_active", "is_enabled", "enabled", "featured", "listing_active", "listing_enabled",
    "booking_enabled", "featured_listing", "priority_support", "verification_badge", "analytics_access",
    "authorized_contact", "identity_verified", "profile_verified", "auto_renew", "verified", "is_indexable",
    "is_public", "seo_enabled", "sitemap_enabled", "internal_linking_enabled", "is_private", "is_primary",
    "is_system", "marketing_consent", "whatsapp_consent", "samagri_included", "stay_available",
    "retreat_available", "is_live", "is_published", "is_featured", "is_deleted", "canonical_locked", "granted",
    "lead_credit_used", "live_aarti_enabled", "homepage_promotion", "enhanced_seo", "enhanced_profile",
  ]);

  if (booleanColumns.has(column) || column.startsWith("has_") || column.startsWith("is_")) {
    if (["true", "yes", "y", "on"].includes(lower)) return 1;
    if (["false", "no", "n", "off"].includes(lower)) return 0;
    if (lower === "1" || lower === "0") return Number(lower);
  }

  if (column === "type" && table === "locations") {
    const map: Record<string, string> = {
      nation: "country", country: "country", province: "state", state: "state", region: "state",
      district: "district", city: "city", town: "city", municipality: "city",
      area: "area", locality: "area", neighborhood: "area", suburb: "area",
    };
    return map[lower] ?? "city";
  }

  if (column === "status") {
    if (table === "form_submissions") {
      const map: Record<string, string> = {
        submitted: "received", received: "received", pending: "received", process: "processed",
        processed: "processed", spam: "spam", duplicate: "duplicate", archived: "archived",
      };
      return map[lower] ?? "received";
    }

    if (table === "leads") {
      const map: Record<string, string> = {
        open: "new", pending: "new", new: "new", qualified: "qualified", assigned: "assigned",
        contacted: "contacted", followup: "follow_up", follow_up: "follow_up", converted: "converted",
        won: "converted", lost: "lost", closed: "closed", spam: "spam",
      };
      return map[lower] ?? "new";
    }

    if (table === "payments") {
      const map: Record<string, string> = {
        created: "created", pending: "pending", authorized: "authorized", paid: "paid", captured: "captured",
        failed: "failed", refunded: "refunded", partially_refunded: "partially_refunded",
        cancelled: "cancelled", canceled: "cancelled",
      };
      return map[lower] ?? "pending";
    }

    if (table === "payment_webhook_events") {
      return ["received", "processed", "ignored", "failed"].includes(lower) ? lower : "received";
    }

    if (table === "seo_location_pages") {
      return ["draft", "published", "unpublished"].includes(lower) ? lower : "draft";
    }

    if (table === "seo_entries" || table === "seo_pages") {
      return ["draft", "published", "unpublished"].includes(lower) ? lower : "published";
    }

    if (table === "locations") {
      return ["draft", "active", "inactive"].includes(lower) ? lower : "active";
    }

    if (table === "pandit_profiles") {
      return ["draft", "pending", "approved", "rejected", "suspended"].includes(lower) ? lower : "pending";
    }

    if (table === "pandit_verification_documents") {
      return ["pending", "approved", "rejected"].includes(lower) ? lower : "pending";
    }

    if (table === "temples") {
      return ["draft", "pending", "published", "unpublished"].includes(lower) ? lower : "draft";
    }

    if (table === "videos") {
      return ["draft", "scheduled", "published", "unpublished", "archived"].includes(lower) ? lower : "draft";
    }

    if (["puja_services", "ashrams", "yatra_packages", "spiritual_places", "events", "gallery_items", "courses", "articles"].includes(table)) {
      return ["draft", "published", "unpublished", "archived"].includes(lower) ? lower : "draft";
    }
  }

  if (column === "profile_status" && table === "pandit_profiles") {
    return ["draft", "pending", "approved", "rejected", "suspended"].includes(lower) ? lower : "pending";
  }

  if (column === "verification_status" && table === "pandit_profiles") {
    return ["pending", "in_review", "verified", "rejected", "expired"].includes(lower) ? lower : "pending";
  }

  if (column === "duration_days") {
    const days = Number(value);
    return Number.isFinite(days) && days > 0 ? Math.floor(days) : 30;
  }

  if (column === "billing_interval") {
    const map: Record<string, string> = {
      month: "monthly",
      monthly: "monthly",
      quarter: "quarterly",
      quarterly: "quarterly",
      year: "yearly",
      annual: "yearly",
      annually: "yearly",
      yearly: "yearly",
      custom: "custom",
    };
    return map[lower] ?? "monthly";
  }

  if (column === "status" && [
    "pandit_subscriptions",
    "temple_subscriptions",
    "ashram_subscriptions",
  ].includes(table)) {
    const map: Record<string, string> = {
      pending: "pending",
      created: "pending",
      initiated: "pending",
      active: "active",
      paid: "active",
      running: "active",
      expired: "expired",
      completed: "expired",
      cancelled: "cancelled",
      canceled: "cancelled",
      paused: "paused",
      payment_failed: "payment_failed",
      failed: "payment_failed",
    };
    return map[lower] ?? "pending";
  }

  if (column === "status" && table === "payment_orders") {
    const map: Record<string, string> = {
      created: "created",
      pending: "created",
      attempted: "attempted",
      paid: "paid",
      captured: "paid",
      failed: "failed",
      cancelled: "cancelled",
      canceled: "cancelled",
      expired: "expired",
    };
    return map[lower] ?? "created";
  }

  if (column === "status" && table === "payment_links") {
    const map: Record<string, string> = {
      created: "created",
      pending: "created",
      active: "active",
      paid: "paid",
      expired: "expired",
      cancelled: "cancelled",
      canceled: "cancelled",
    };
    return map[lower] ?? "created";
  }

  if (column === "audience" && table === "subscription_plans") {
    return (["pandit", "temple", "ashram"] as string[]).includes(lower) ? lower : "pandit";
  }

  if (column === "source_type" && table === "leads") {
    const map: Record<string, string> = {
      web: "website", website: "website", form: "form", whatsapp: "whatsapp", phone: "phone", admin: "admin",
      organic: "organic_search", organic_search: "organic_search", paid: "paid_search", paid_search: "paid_search",
      social: "social", email: "email", referral: "referral", direct: "direct", video: "video", gallery: "gallery",
      seo: "seo_landing", seo_landing: "seo_landing",
    };
    return map[lower] ?? "website";
  }

  if (column === "priority" && table === "leads") {
    return ["low", "normal", "high", "urgent"].includes(lower) ? lower : "normal";
  }

  if (column === "contact_preference" && table === "leads") {
    return ["call", "whatsapp", "email", "any"].includes(lower) ? lower : "any";
  }

  if (column === "lead_temperature" && table === "leads") {
    return ["cold", "warm", "hot"].includes(lower) ? lower : "cold";
  }

  return value;
}

type SecurityIdentityMap = {
  roleIdsBySourceId: Map<number, number>;
  permissionIdsBySourceId: Map<number, number>;
};

const ROLE_CODE_ALIASES: Record<string, string> = {
  user: "visitor",
  member: "visitor",
  devotee: "visitor",
  public: "visitor",
  temple: "temple_manager",
  temple_admin: "temple_manager",
  manager: "temple_manager",
  ashram: "ashram_manager",
  ashram_admin: "ashram_manager",
  ashram_manager: "ashram_manager",
  sales_manager: "sales",
  admin: "super_admin",
  administrator: "super_admin",
  superadmin: "super_admin",
};

function canonicalRoleCode(value: unknown): string {
  const raw = String(value ?? "").trim().toLowerCase();
  return ROLE_CODE_ALIASES[raw] ?? raw;
}

function reconcileSecurityIdentities(source: Database.Database, target: Database.Database): SecurityIdentityMap {
  const roleIdsBySourceId = new Map<number, number>();
  const permissionIdsBySourceId = new Map<number, number>();

  if (tableExists(target, "roles")) {
    const sourceRoles = tableExists(source, "roles")
      ? (source.prepare(`SELECT * FROM roles ORDER BY id`).all() as SqliteRow[])
      : [];

    const insertRole = target.prepare(`
      INSERT OR IGNORE INTO roles
      (code, name, description, public_registration_enabled, approval_required, dashboard_path, is_system, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const findRole = target.prepare(`SELECT id FROM roles WHERE code=? LIMIT 1`);

    for (const row of sourceRoles) {
      const sourceId = Number(row.id ?? 0);
      const sourceCode = canonicalRoleCode(row.code);
      if (!sourceId || !sourceCode) continue;

      const canonical = (CANONICAL_ROLE_CODES as readonly string[]).includes(sourceCode);
      insertRole.run(
        sourceCode,
        String(row.name ?? sourceCode),
        row.description ?? null,
        Number(row.public_registration_enabled ?? (canonical && ["visitor", "pandit", "temple_manager", "ashram_manager"].includes(sourceCode) ? 1 : 0)),
        Number(row.approval_required ?? (["pandit", "temple_manager", "ashram_manager"].includes(sourceCode) ? 1 : 0)),
        row.dashboard_path ?? null,
        Number(row.is_system ?? (canonical ? 1 : 0)),
        Number(row.is_active ?? 1),
      );

      const roleRow = findRole.get(sourceCode) as { id?: number } | undefined;
      if (roleRow?.id) roleIdsBySourceId.set(sourceId, Number(roleRow.id));
    }

    // Guarantee all six canonical business roles even if the legacy DB had none.
    const canonicalSeed = [
      ["visitor", "Visitor", "Regular DivyaDhara visitor/devotee account", 1, 0, "/dashboard"],
      ["pandit", "Pandit", "Pandit/acharya account for listings and lead management", 1, 1, "/pandit/dashboard"],
      ["temple_manager", "Temple Manager", "Temple representative/manager account", 1, 1, "/temple/dashboard"],
      ["ashram_manager", "Ashram Manager", "Ashram representative/manager account", 1, 1, "/ashram/dashboard"],
      ["sales", "Sales", "Sales and onboarding team account; no public self-registration", 0, 0, "/sales/dashboard"],
      ["super_admin", "Super Admin", "Full system administration account; no public self-registration", 0, 0, "/admin"],
    ] as const;

    const upsertRole = target.prepare(`
      INSERT INTO roles
      (code, name, description, public_registration_enabled, approval_required, dashboard_path, is_system, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1, 1)
      ON CONFLICT(code) DO UPDATE SET
        name=excluded.name,
        description=excluded.description,
        public_registration_enabled=excluded.public_registration_enabled,
        approval_required=excluded.approval_required,
        dashboard_path=excluded.dashboard_path,
        is_system=1,
        is_active=1,
        updated_at=CURRENT_TIMESTAMP
    `);
    for (const row of canonicalSeed) upsertRole.run(...row);

    // Public registration is closed to any legacy/unknown role. Known legacy
    // aliases were already mapped above; the remaining active public roles are
    // deactivated so the final registration contract stays deterministic.
    const canonicalPlaceholders = CANONICAL_ROLE_CODES.map(() => "?").join(",");
    target
      .prepare(`
        UPDATE roles
        SET public_registration_enabled=0, is_active=0, updated_at=CURRENT_TIMESTAMP
        WHERE public_registration_enabled=1
          AND code NOT IN (${canonicalPlaceholders})
      `)
      .run(...CANONICAL_ROLE_CODES);

    // Re-map source IDs after alias normalization and canonical seeds.
    for (const row of sourceRoles) {
      const sourceId = Number(row.id ?? 0);
      const sourceCode = canonicalRoleCode(row.code);
      if (!sourceId || !sourceCode) continue;
      const roleRow = findRole.get(sourceCode) as { id?: number } | undefined;
      if (roleRow?.id) roleIdsBySourceId.set(sourceId, Number(roleRow.id));
    }
  }

  if (tableExists(source, "permissions") && tableExists(target, "permissions")) {
    const sourcePermissions = source.prepare(`SELECT * FROM permissions ORDER BY id`).all() as SqliteRow[];
    const insertPermission = target.prepare(`
      INSERT OR IGNORE INTO permissions (code, name, description, module)
      VALUES (?, ?, ?, ?)
    `);
    const findPermission = target.prepare(`SELECT id FROM permissions WHERE code=? LIMIT 1`);

    for (const row of sourcePermissions) {
      const sourceId = Number(row.id ?? 0);
      const code = String(row.code ?? "").trim();
      if (!sourceId || !code) continue;
      insertPermission.run(code, String(row.name ?? code), row.description ?? null, String(row.module ?? "legacy"));
      const permissionRow = findPermission.get(code) as { id?: number } | undefined;
      if (permissionRow?.id) permissionIdsBySourceId.set(sourceId, Number(permissionRow.id));
    }
  }

  if (tableExists(source, "role_permissions") && tableExists(target, "role_permissions")) {
    const rows = source.prepare(`SELECT role_id, permission_id FROM role_permissions ORDER BY role_id, permission_id`).all() as SqliteRow[];
    const insertGrant = target.prepare(`INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`);

    for (const row of rows) {
      const targetRoleId = roleIdsBySourceId.get(Number(row.role_id ?? 0));
      const targetPermissionId = permissionIdsBySourceId.get(Number(row.permission_id ?? 0));
      if (!targetRoleId || !targetPermissionId) continue;
      insertGrant.run(targetRoleId, targetPermissionId);
    }
  }

  return { roleIdsBySourceId, permissionIdsBySourceId };
}

function isUniqueSingleColumn(uniqueIndexes: UniqueIndexInfo[], columnName: string): boolean {
  return uniqueIndexes.some((index) => index.columns.length === 1 && index.columns[0] === columnName);
}

type ColumnMapping = {
  target: TableInfoRow;
  source: string | null;
  fallback: string | null;
  dynamicFallback: boolean;
};

function dynamicFallbackValue(
  tableName: string,
  targetColumn: TableInfoRow,
  sourceRow: SqliteRow,
): string {
  const name = targetColumn.name.toLowerCase();
  const sourceId = Number(sourceRow.id ?? 0) || 0;
  const rawName = String(
    sourceRow.name ??
      sourceRow.title ??
      sourceRow.display_name ??
      sourceRow.slug ??
      tableName,
  );
  const deterministicSuffix =
    sourceId ||
    sha256(JSON.stringify(sourceRow)).slice(0, 12);

  if (name === "code") {
    return `${safeSlug(rawName)}-${deterministicSuffix}`;
  }

  if (name === "slug") {
    return `${safeSlug(rawName)}-${deterministicSuffix}`;
  }

  if (name.endsWith("_number")) {
    const prefix = name
      .replace(/_number$/, "")
      .replace(/[^a-z0-9]+/g, "-")
      .toUpperCase();
    return `${prefix}-${deterministicSuffix}`;
  }

  throw new Error(`Unsupported dynamic fallback column: ${tableName}.${targetColumn.name}`);
}

function materializeSqlDefault(value: unknown): unknown {
  if (value === null || value === undefined) return undefined;

  const raw = String(value).trim();
  if (!raw) return undefined;

  if (/^CURRENT_TIMESTAMP$/i.test(raw)) {
    return new Date().toISOString().slice(0, 19).replace("T", " ");
  }

  if (/^NULL$/i.test(raw)) return null;

  if (/^-?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);

  const quoted = raw.match(/^'(.*)'$/s);
  if (quoted) return quoted[1].replace(/''/g, "'");

  const doubleQuoted = raw.match(/^"(.*)"$/s);
  if (doubleQuoted) return doubleQuoted[1].replace(/""/g, '"');

  return raw;
}

function copyTableData(
  source: Database.Database,
  target: Database.Database,
  tableName: string,
  securityMap: SecurityIdentityMap,
): { copied: number; normalized: number; skipped: number } {
  if (!tableExists(source, tableName) || !tableExists(target, tableName)) {
    return { copied: 0, normalized: 0, skipped: 0 };
  }

  if (["roles", "permissions", "role_permissions"].includes(tableName)) {
    return { copied: 0, normalized: 0, skipped: 0 };
  }

  const sourceInfo = getVisibleTableInfo(source, tableName);
  const targetInfo = getVisibleTableInfo(target, tableName);
  const sourceColumns = new Set(sourceInfo.map((column) => column.name));
  const targetUniqueIndexes = getUniqueIndexes(target, tableName);
  const mappings: ColumnMapping[] = [];

  // Build mapping for every target column which can be sourced or safely defaulted.
  for (const targetColumn of targetInfo) {
    if (targetColumn.pk > 0 && targetColumn.name === "id" && !sourceColumns.has("id")) continue;

    const sourceColumn = resolveSourceColumn(sourceColumns, targetColumn.name);
    if (sourceColumn) {
      mappings.push({ target: targetColumn, source: sourceColumn, fallback: null, dynamicFallback: false });
      continue;
    }

    const hasDefault = targetColumn.dflt_value !== null && targetColumn.dflt_value !== undefined;
    const required = Number(targetColumn.notnull) === 1 && Number(targetColumn.pk) === 0 && !hasDefault;
    if (!required) continue;

    const normalizedName = targetColumn.name.toLowerCase();
    const dynamicFallback =
      normalizedName === "code" ||
      normalizedName === "slug" ||
      normalizedName.endsWith("_number");

    if (dynamicFallback) {
      mappings.push({ target: targetColumn, source: null, fallback: null, dynamicFallback: true });
      continue;
    }

    const fallbackProbe = requiredFallbackExpression(tableName, targetColumn, {});
    if (fallbackProbe === null) {
      if (isUniqueSingleColumn(targetUniqueIndexes, targetColumn.name)) {
        throw new Error(`Cannot safely migrate ${tableName}.${targetColumn.name}: required unique target column has no safe mapping.`);
      }
      throw new Error(`Cannot safely migrate ${tableName}.${targetColumn.name}: required target column has no default or fallback.`);
    }

    mappings.push({ target: targetColumn, source: null, fallback: fallbackProbe, dynamicFallback: false });
  }

  const targetColumns = mappings.map((mapping) => mapping.target.name);
  const insertSql = `
    INSERT INTO ${quoteIdentifier(tableName)}
    (${targetColumns.map(quoteIdentifier).join(", ")})
    VALUES (${mappings
      .map((mapping) =>
        mapping.source || mapping.dynamicFallback
          ? "?"
          : mapping.fallback ?? "NULL",
      )
      .join(", ")})
  `;

  const insert = target.prepare(insertSql);
  const rows = source.prepare(`SELECT * FROM ${quoteIdentifier(tableName)}`).all() as SqliteRow[];

  let copied = 0;
  let normalized = 0;
  let skipped = 0;

  for (const row of rows) {
    const values: unknown[] = [];
    let rowNormalized = false;

    for (const mapping of mappings) {
      if (!mapping.source) {
        if (mapping.dynamicFallback) {
          values.push(dynamicFallbackValue(tableName, mapping.target, row));
        }
        continue;
      }
      let raw = row[mapping.source];

      if (raw === null || raw === undefined) {
        const targetHasDefault =
          mapping.target.dflt_value !== null &&
          mapping.target.dflt_value !== undefined;
        if (targetHasDefault) {
          raw = materializeSqlDefault(mapping.target.dflt_value);
          rowNormalized = true;
        }
      }

      if (tableName === "users" && mapping.target.name === "role_id") {
        const sourceRoleId = Number(raw ?? 0);
        const mappedRoleId = securityMap.roleIdsBySourceId.get(sourceRoleId);
        if (!mappedRoleId && raw !== null && raw !== undefined) {
          throw new Error(`Cannot safely migrate users row ${String(row.id ?? "unknown")}: legacy role_id=${String(raw)} has no reconciled role.`);
        }
        raw = mappedRoleId ?? null;
      }

      const normalizedValue = normalizeEnumValue(tableName, mapping.target.name, raw);
      if (normalizedValue !== raw) rowNormalized = true;
      values.push(normalizedValue);
    }

    try {
      insert.run(...values);
      copied += 1;
      if (rowNormalized) normalized += 1;
    } catch (error) {
      const rowId = String(row.id ?? "unknown");
      const message = getErrorMessage(error);

      if (/UNIQUE constraint failed/i.test(message)) {
        skipped += 1;
        continue;
      }

      throw new Error(`Failed migrating ${tableName} row ${rowId}: ${message}`);
    }
  }

  return { copied, normalized, skipped };
}

function preserveLegacyTables(source: Database.Database, target: Database.Database, targetTables: Set<string>): number {
  let preserved = 0;
  for (const tableName of tableNames(source)) {
    if (targetTables.has(tableName)) continue;
    const sql = getTableSql(source, tableName);
    if (!sql) continue;
    try {
      target.exec(sql);
      preserved += 1;
    } catch (error) {
      throw new Error(`Unable to preserve legacy table ${tableName}: ${getErrorMessage(error)}`);
    }
  }
  return preserved;
}

function copyLegacyTableRows(source: Database.Database, target: Database.Database, targetSchemaTableNames: Set<string>): number {
  let copiedRows = 0;
  for (const tableName of tableNames(source)) {
    if (targetSchemaTableNames.has(tableName) || !tableExists(target, tableName)) continue;

    const sourceColumns = getVisibleTableInfo(source, tableName).map((column) => column.name);
    const targetColumns = getVisibleTableInfo(target, tableName).map((column) => column.name);
    const targetColumnSet = new Set(targetColumns);
    const common = sourceColumns.filter((column) => targetColumnSet.has(column));
    if (common.length === 0) continue;

    const insert = target.prepare(`
      INSERT INTO ${quoteIdentifier(tableName)}
      (${common.map(quoteIdentifier).join(", ")})
      VALUES (${common.map(() => "?").join(", ")})
    `);

    const rows = source.prepare(`SELECT ${common.map(quoteIdentifier).join(", ")} FROM ${quoteIdentifier(tableName)}`).iterate() as IterableIterator<SqliteRow>;
    for (const row of rows) {
      try {
        insert.run(...common.map((column) => row[column]));
        copiedRows += 1;
      } catch (error) {
        if (/UNIQUE constraint failed/i.test(getErrorMessage(error))) continue;
        throw error;
      }
    }
  }
  return copiedRows;
}

function preserveLegacyViews(source: Database.Database, target: Database.Database): number {
  let count = 0;
  for (const viewName of viewNames(source)) {
    if (viewExists(target, viewName)) continue;
    const sql = getViewSql(source, viewName);
    if (!sql) continue;
    try {
      target.exec(sql);
      count += 1;
    } catch {
      // Obsolete legacy views are intentionally skipped if incompatible.
    }
  }
  return count;
}

function preserveLegacyIndexesAndTriggers(
  source: Database.Database,
  target: Database.Database,
  sourceOnlyTables: Set<string>,
): void {
  for (const tableName of sourceOnlyTables) {
    for (const object of getObjectSqls(source, "index", tableName)) {
      if (object.name.startsWith("sqlite_autoindex")) continue;
      try { target.exec(object.sql); } catch { /* best effort */ }
    }
    for (const object of getObjectSqls(source, "trigger", tableName)) {
      try { target.exec(object.sql); } catch { /* best effort */ }
    }
  }
}

function normalizeLookupName(value: unknown): string | null {
  const text = String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return text || null;
}

function normalizeLocationName(value: unknown): string | null {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || null;
}

function ensureLocation(
  database: Database.Database,
  parentId: number | null,
  type: "country" | "state" | "district" | "city" | "area",
  name: string,
): number {
  const normalized = normalizeLookupName(name) ?? safeSlug(name);
  const slug = safeSlug(name);

  const existing = database
    .prepare(`
      SELECT id
      FROM locations
      WHERE parent_id IS ?
        AND (normalized_name=? OR slug=? OR lower(name)=lower(?))
      ORDER BY id
      LIMIT 1
    `)
    .get(parentId, normalized, slug, name) as { id?: number } | undefined;
  if (existing?.id) return Number(existing.id);

  const result = database
    .prepare(`
      INSERT INTO locations (
        parent_id, type, name, slug, normalized_name, canonical_name,
        seo_path, seo_enabled, status, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, NULL, 1, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `)
    .run(parentId, type, name, slug, normalized, name);

  return Number(result.lastInsertRowid);
}

function rebuildLocationAncestry(database: Database.Database): void {
  if (!tableExists(database, "locations")) return;

  const rows = database.prepare(`
    SELECT id, parent_id, type, name, slug
    FROM locations
    ORDER BY id
  `).all() as Array<{
    id: number;
    parent_id: number | null;
    type: string;
    name: string;
    slug: string;
  }>;

  const byId = new Map<number, (typeof rows)[number]>();
  for (const row of rows) byId.set(Number(row.id), row);

  const cache = new Map<number, {
    countryId: number | null;
    stateId: number | null;
    districtId: number | null;
    cityId: number | null;
    path: string;
  }>();

  const resolving = new Set<number>();
  const resolveAncestry = (id: number): {
    countryId: number | null;
    stateId: number | null;
    districtId: number | null;
    cityId: number | null;
    path: string;
  } => {
    const cached = cache.get(id);
    if (cached) return cached;
    if (resolving.has(id)) {
      return { countryId: null, stateId: null, districtId: null, cityId: null, path: safeSlug(byId.get(id)?.name ?? "location") };
    }

    const row = byId.get(id);
    if (!row) return { countryId: null, stateId: null, districtId: null, cityId: null, path: "" };

    resolving.add(id);
    const parent = row.parent_id
      ? resolveAncestry(Number(row.parent_id))
      : { countryId: null, stateId: null, districtId: null, cityId: null, path: "" };

    let countryId = parent.countryId;
    let stateId = parent.stateId;
    let districtId = parent.districtId;
    let cityId = parent.cityId;

    if (row.type === "country") countryId = row.id;
    if (row.type === "state") stateId = row.id;
    if (row.type === "district") districtId = row.id;
    if (row.type === "city") cityId = row.id;

    const path = parent.path ? `${parent.path}/${row.slug}` : row.slug;
    const result = { countryId, stateId, districtId, cityId, path };
    resolving.delete(id);
    cache.set(id, result);
    return result;
  };

  const update = database.prepare(`
    UPDATE locations
    SET country_id=?, state_id=?, district_id=?, city_id=?, seo_path=?,
        normalized_name=COALESCE(NULLIF(normalized_name,''),?),
        canonical_name=COALESCE(NULLIF(canonical_name,''),name),
        updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `);

  for (const row of rows) {
    const a = resolveAncestry(row.id);
    update.run(a.countryId, a.stateId, a.districtId, a.cityId, a.path, normalizeLookupName(row.name), row.id);
  }
}

function findLocation(
  database: Database.Database,
  type: "country" | "state" | "district" | "city" | "area",
  name: string,
  parentId: number | null = null,
): number | null {
  const normalized = normalizeLookupName(name);
  if (!normalized) return null;
  const slug = safeSlug(name);

  const exact = database.prepare(`
    SELECT id
    FROM locations
    WHERE type=? AND parent_id IS ?
      AND (normalized_name=? OR slug=? OR lower(name)=lower(?))
    ORDER BY id
    LIMIT 1
  `).get(type, parentId, normalized, slug, name) as { id?: number } | undefined;
  if (exact?.id) return Number(exact.id);

  if (tableExists(database, "location_aliases")) {
    const alias = database.prepare(`
      SELECT la.location_id AS id
      FROM location_aliases la
      JOIN locations l ON l.id=la.location_id
      WHERE l.type=? AND l.parent_id IS ?
        AND la.normalized_alias=? AND la.is_active=1
      LIMIT 1
    `).get(type, parentId, normalized) as { id?: number } | undefined;
    if (alias?.id) return Number(alias.id);
  }

  return null;
}

function locationFromExistingId(database: Database.Database, id: unknown): number | null {
  const numeric = Number(id ?? 0);
  if (!numeric || !tableExists(database, "locations")) return null;
  const row = database.prepare(`SELECT id FROM locations WHERE id=?`).get(numeric) as { id?: number } | undefined;
  return row?.id ? Number(row.id) : null;
}

function resolveLocationPath(
  database: Database.Database,
  countryName: string | null,
  stateName: string | null,
  districtName: string | null,
  cityName: string | null,
): number | null {
  const countryNameResolved = countryName ?? "India";
  let countryId = findLocation(database, "country", countryNameResolved, null);
  if (!countryId) countryId = ensureLocation(database, null, "country", countryNameResolved);

  let stateId: number | null = null;
  let districtId: number | null = null;
  let cityId: number | null = null;

  if (stateName) {
    stateId = findLocation(database, "state", stateName, countryId);
    if (!stateId) stateId = ensureLocation(database, countryId, "state", stateName);
  }

  if (districtName) {
    districtId = findLocation(database, "district", districtName, stateId);
    if (!districtId && stateId) districtId = ensureLocation(database, stateId, "district", districtName);
  }

  if (cityName) {
    cityId = findLocation(database, "city", cityName, districtId);
    if (!cityId && districtId) cityId = ensureLocation(database, districtId, "city", cityName);

    // Some legacy datasets provide city + state but no district. Preserve the
    // city-level specificity by allowing a city to sit directly under its state.
    if (!cityId && stateId && !districtId) {
      cityId = findLocation(database, "city", cityName, stateId);
      if (!cityId) cityId = ensureLocation(database, stateId, "city", cityName);
    }
  }

  return cityId ?? districtId ?? stateId ?? countryId;
}

function setGeoCachesForEntity(
  database: Database.Database,
  tableName: string,
  id: number,
  locationId: number,
): void {
  const columns = new Set(getVisibleTableInfo(database, tableName).map((column) => column.name));
  const geo = database
    .prepare(`SELECT country_id,state_id,district_id,city_id FROM locations WHERE id=?`)
    .get(locationId) as SqliteRow | undefined;

  const setParts: string[] = [];
  const values: unknown[] = [];

  if (columns.has("location_id")) {
    setParts.push("location_id=?");
    values.push(locationId);
  }
  if (columns.has("country_location_id")) {
    setParts.push("country_location_id=?");
    values.push(geo?.country_id ?? null);
  }
  if (columns.has("state_location_id")) {
    setParts.push("state_location_id=?");
    values.push(geo?.state_id ?? null);
  }
  if (columns.has("district_location_id")) {
    setParts.push("district_location_id=?");
    values.push(geo?.district_id ?? null);
  }
  if (columns.has("city_location_id")) {
    setParts.push("city_location_id=?");
    values.push(geo?.city_id ?? null);
  }
  if (columns.has("updated_at")) setParts.push("updated_at=CURRENT_TIMESTAMP");

  if (!setParts.length) return;
  values.push(id);
  database.prepare(`UPDATE ${quoteIdentifier(tableName)} SET ${setParts.join(", ")} WHERE id=?`).run(...values);
}

function backfillLocations(database: Database.Database): number {
  if (!tableExists(database, "locations")) return 0;

  const before = countRows(database, "locations");

  // Direct geography-bearing catalogues.
  const directEntityTables = [
    "pandit_profiles",
    "temples",
    "ashrams",
    "spiritual_places",
    "events",
    "gallery_items",
    "videos",
    "courses",
    "articles",
    "leads",
    "form_submissions",
  ];

  for (const tableName of directEntityTables) {
    if (!tableExists(database, tableName)) continue;

    const columns = new Set(getVisibleTableInfo(database, tableName).map((column) => column.name));
    if (!columns.has("id")) continue;

    const rows = database.prepare(`SELECT * FROM ${quoteIdentifier(tableName)}`).all() as SqliteRow[];
    for (const row of rows) {
      let resolved = locationFromExistingId(database, columns.has("location_id") ? row.location_id : null);
      if (!resolved) {
        resolved = resolveLocationPath(
          database,
          normalizeLocationName(row.country),
          normalizeLocationName(row.state),
          normalizeLocationName(row.district),
          normalizeLocationName(row.city),
        );
      }
      if (resolved) setGeoCachesForEntity(database, tableName, Number(row.id), resolved);
    }
  }

  // Yatra/Gallery/Video/Course/Article may only have cached location IDs; derive their
  // ancestry from whichever ID survives the old schema.
  for (const tableName of ["yatra_packages", "gallery_items", "videos", "courses", "articles"]) {
    if (!tableExists(database, tableName)) continue;
    const columns = new Set(getVisibleTableInfo(database, tableName).map((column) => column.name));
    if (!columns.has("id")) continue;

    const rows = database.prepare(`SELECT * FROM ${quoteIdentifier(tableName)}`).all() as SqliteRow[];
    for (const row of rows) {
      const resolved =
        locationFromExistingId(database, row.location_id) ??
        locationFromExistingId(database, row.city_location_id) ??
        locationFromExistingId(database, row.district_location_id) ??
        locationFromExistingId(database, row.state_location_id) ??
        locationFromExistingId(database, row.country_location_id);
      if (resolved) setGeoCachesForEntity(database, tableName, Number(row.id), resolved);
    }
  }

  rebuildLocationAncestry(database);
  return Math.max(0, countRows(database, "locations") - before);
}

function addPanditServiceLocationsFromLegacyJson(database: Database.Database): number {
  if (!tableExists(database, "pandit_profiles") || !tableExists(database, "pandit_service_locations")) return 0;

  const rows = database.prepare(`SELECT id,country,state,district,city,service_areas_json FROM pandit_profiles`).all() as SqliteRow[];
  const insert = database.prepare(`
    INSERT OR IGNORE INTO pandit_service_locations
    (pandit_id, location_id, relation_type, is_active, priority)
    VALUES (?, ?, 'service_area', 1, 0)
  `);

  let added = 0;
  for (const row of rows) {
    let parsed: unknown;
    try { parsed = JSON.parse(String(row.service_areas_json ?? "[]")); } catch { parsed = []; }
    if (!Array.isArray(parsed)) continue;

    for (const area of parsed) {
      const name = normalizeLocationName(area);
      if (!name) continue;

      const countryId = findLocation(database, "country", normalizeLocationName(row.country) ?? "India", null);
      const stateId = countryId ? findLocation(database, "state", normalizeLocationName(row.state) ?? "", countryId) : null;
      const districtId = stateId ? findLocation(database, "district", normalizeLocationName(row.district) ?? "", stateId) : null;

      let locationId = districtId ? findLocation(database, "city", name, districtId) : null;
      if (!locationId && stateId) locationId = findLocation(database, "district", name, stateId);
      if (!locationId && countryId) locationId = findLocation(database, "state", name, countryId);
      if (!locationId) {
        locationId =
          findLocation(database, "city", name, null) ??
          findLocation(database, "district", name, null) ??
          findLocation(database, "state", name, null);
      }
      if (!locationId) {
        locationId = resolveLocationPath(
          database,
          normalizeLocationName(row.country),
          normalizeLocationName(row.state),
          normalizeLocationName(row.district),
          name,
        );
      }
      if (!locationId) continue;

      const result = insert.run(row.id, locationId);
      added += Number(result.changes ?? 0);
    }
  }
  return added;
}

function addPujaServiceLocationsFromLegacyData(source: Database.Database, target: Database.Database): number {
  if (!tableExists(source, "puja_services") || !tableExists(target, "puja_services") || !tableExists(target, "puja_service_locations")) return 0;

  const sourceColumns = new Set(getVisibleTableInfo(source, "puja_services").map((column) => column.name));
  const locationColumn = ["location", "location_name", "city", "city_name"].find((candidate) => sourceColumns.has(candidate));
  const hasDefaultLocation = sourceColumns.has("default_location_id");
  if (!locationColumn && !hasDefaultLocation) return 0;

  const selectColumns = [
    "id",
    sourceColumns.has("country") ? "country" : "NULL AS country",
    sourceColumns.has("state") ? "state" : "NULL AS state",
    sourceColumns.has("district") ? "district" : "NULL AS district",
    sourceColumns.has("city") ? "city" : "NULL AS city",
    hasDefaultLocation ? "default_location_id" : "NULL AS default_location_id",
  ];
  if (sourceColumns.has("location")) selectColumns.push("location");
  if (sourceColumns.has("location_name")) selectColumns.push("location_name");

  const rows = source.prepare(`SELECT ${selectColumns.join(", ")} FROM puja_services`).all() as SqliteRow[];
  const insert = target.prepare(`
    INSERT OR IGNORE INTO puja_service_locations
    (puja_service_id, location_id, availability_type, is_primary, is_active, priority)
    VALUES (?, ?, 'service_area', ?, 1, 0)
  `);

  let added = 0;
  for (const row of rows) {
    let locationId = locationFromExistingId(target, row.default_location_id);
    const text = normalizeLocationName(row.location_name) ?? normalizeLocationName(row.location) ?? normalizeLocationName(row.city);
    if (!locationId && text) {
      locationId = resolveLocationPath(
        target,
        normalizeLocationName(row.country),
        normalizeLocationName(row.state),
        normalizeLocationName(row.district),
        text,
      );
    }
    if (!locationId) continue;
    const result = insert.run(row.id, locationId, row.default_location_id ? 1 : 0);
    added += Number(result.changes ?? 0);
  }
  return added;
}

function backfillLocationAliases(database: Database.Database): number {
  if (!tableExists(database, "locations") || !tableExists(database, "location_aliases")) return 0;

  const rows = database.prepare(`SELECT id, aliases_json FROM locations`).all() as Array<{ id: number; aliases_json: string | null }>;
  const insert = database.prepare(`
    INSERT OR IGNORE INTO location_aliases
    (location_id, language, alias, normalized_alias, alias_type, is_active, is_primary)
    VALUES (?, 'en', ?, ?, 'alternate', 1, 0)
  `);

  let added = 0;
  for (const row of rows) {
    let parsed: unknown;
    try { parsed = JSON.parse(String(row.aliases_json ?? "[]")); } catch { parsed = []; }
    if (!Array.isArray(parsed)) continue;

    for (const alias of parsed) {
      const text = normalizeLocationName(alias);
      const normalized = normalizeLookupName(text);
      if (!text || !normalized) continue;
      added += Number(insert.run(row.id, text, normalized).changes ?? 0);
    }
  }
  return added;
}

function normalizeLocationRefs(database: Database.Database, tableName: string, idColumn = "id"): void {
  if (!tableExists(database, tableName)) return;
  const columns = new Set(getVisibleTableInfo(database, tableName).map((column) => column.name));
  if (!columns.has(idColumn)) return;

  const rows = database.prepare(`SELECT * FROM ${quoteIdentifier(tableName)}`).all() as SqliteRow[];
  for (const row of rows) {
    const locationId =
      locationFromExistingId(database, row.location_id) ??
      locationFromExistingId(database, row.city_location_id) ??
      locationFromExistingId(database, row.district_location_id) ??
      locationFromExistingId(database, row.state_location_id) ??
      locationFromExistingId(database, row.country_location_id);
    if (!locationId) continue;
    setGeoCachesForEntity(database, tableName, Number(row[idColumn]), locationId);
  }
}

function ensureCanonicalSubscriptionPlans(database: Database.Database): { upserted: number; deactivated: number } {
  if (!tableExists(database, "subscription_plans")) return { upserted: 0, deactivated: 0 };

  const plans = [
    {
      code: "pandit_basic", audience: "pandit" as CanonicalAudience, name: "Basic",
      description: "Basic Pandit presence with 10 lead credits per month.", price: 199,
      lead: 10, service: 5, area: 2, gallery: 0, video: 0, program: 0,
      listing: 1, featured: 0, priority: 0, verification: 1, analytics: 1, homepage: 0,
      liveAarti: 0, seo: 0, enhancedProfile: 0, whatsapp: 1, visibility: "standard", analyticsLevel: "basic",
      features: ["Up to 5 services", "10 leads/month", "Up to 2 service cities", "Public profile", "WhatsApp enquiry", "Basic analytics", "Verification badge after approval"],
      sort: 1,
    },
    {
      code: "pandit_premium", audience: "pandit" as CanonicalAudience, name: "Premium",
      description: "Premium Pandit growth plan with 30 lead credits per month.", price: 499,
      lead: 30, service: 15, area: 0, gallery: 0, video: 0, program: 0,
      listing: 1, featured: 1, priority: 1, verification: 1, analytics: 1, homepage: 1,
      liveAarti: 0, seo: 1, enhancedProfile: 1, whatsapp: 1, visibility: "higher", analyticsLevel: "advanced",
      features: ["Up to 15 services", "30 leads/month", "Multiple service cities", "Featured listing", "Higher search visibility", "Enhanced SEO", "Advanced analytics", "Priority support", "WhatsApp enquiry", "Verification badge after approval"],
      sort: 2,
    },
    {
      code: "temple_basic", audience: "temple" as CanonicalAudience, name: "Basic",
      description: "Basic Temple presence with 15 enquiry credits per month.", price: 499,
      lead: 15, service: 0, area: 0, gallery: 15, video: 2, program: 0,
      listing: 1, featured: 0, priority: 0, verification: 1, analytics: 1, homepage: 0,
      liveAarti: 0, seo: 0, enhancedProfile: 0, whatsapp: 1, visibility: "standard", analyticsLevel: "basic",
      features: ["Temple profile", "Basic SEO", "15 images", "Up to 2 videos", "15 leads/month", "WhatsApp enquiry", "Basic analytics", "Verification badge after approval"],
      sort: 1,
    },
    {
      code: "temple_premium", audience: "temple" as CanonicalAudience, name: "Premium",
      description: "Premium Temple visibility with 50 enquiry credits per month.", price: 999,
      lead: 50, service: 0, area: 0, gallery: 50, video: 10, program: 0,
      listing: 1, featured: 1, priority: 1, verification: 1, analytics: 1, homepage: 1,
      liveAarti: 1, seo: 1, enhancedProfile: 1, whatsapp: 1, visibility: "higher", analyticsLevel: "advanced",
      features: ["Temple profile", "Enhanced SEO", "50 images", "Up to 10 videos", "50 leads/month", "Live Aarti", "Featured listing", "Homepage promotion", "Advanced analytics", "Priority support", "WhatsApp enquiry", "Verification badge after approval"],
      sort: 2,
    },
    {
      code: "ashram_basic", audience: "ashram" as CanonicalAudience, name: "Basic",
      description: "Basic Ashram presence with 15 enquiry credits per month.", price: 499,
      lead: 15, service: 0, area: 0, gallery: 15, video: 2, program: 3,
      listing: 1, featured: 0, priority: 0, verification: 1, analytics: 1, homepage: 0,
      liveAarti: 0, seo: 0, enhancedProfile: 0, whatsapp: 1, visibility: "standard", analyticsLevel: "basic",
      features: ["Ashram profile", "History & activities", "Up to 3 programs/courses", "15 images", "Up to 2 videos", "15 leads/month", "WhatsApp enquiry", "Basic analytics", "Verification badge after approval"],
      sort: 1,
    },
    {
      code: "ashram_premium", audience: "ashram" as CanonicalAudience, name: "Premium",
      description: "Premium Ashram growth plan with 75 enquiry credits per month.", price: 1499,
      lead: 75, service: 0, area: 0, gallery: 50, video: 10, program: 15,
      listing: 1, featured: 1, priority: 1, verification: 1, analytics: 1, homepage: 1,
      liveAarti: 0, seo: 1, enhancedProfile: 1, whatsapp: 1, visibility: "higher", analyticsLevel: "advanced",
      features: ["Ashram profile", "Enhanced SEO", "Up to 15 programs/courses", "50 images", "Up to 10 videos", "75 leads/month", "Featured listing", "Homepage promotion", "Advanced analytics", "Priority support", "WhatsApp enquiry", "Verification badge after approval"],
      sort: 2,
    },
  ];

  const upsert = database.prepare(`
    INSERT INTO subscription_plans (
      code, audience, name, description, price_amount, currency, billing_interval, duration_days,
      lead_limit, service_limit, service_area_limit, gallery_limit, video_limit, program_limit,
      listing_enabled, featured_listing, priority_support, verification_badge, analytics_access,
      homepage_promotion, live_aarti_enabled, enhanced_seo, enhanced_profile, whatsapp_enquiry,
      search_visibility, analytics_level, plan_features_json, is_active, sort_order, updated_at
    ) VALUES (
      ?,?,?,?,?, 'INR','monthly',30, ?,?,?,?,?, ?,?,?,?,?,?,?,?,?,?,?, ?,?,?, 1, ?, CURRENT_TIMESTAMP
    )
    ON CONFLICT(code) DO UPDATE SET
      audience=excluded.audience,
      name=excluded.name,
      description=excluded.description,
      price_amount=excluded.price_amount,
      currency=excluded.currency,
      billing_interval=excluded.billing_interval,
      duration_days=excluded.duration_days,
      lead_limit=excluded.lead_limit,
      service_limit=excluded.service_limit,
      service_area_limit=excluded.service_area_limit,
      gallery_limit=excluded.gallery_limit,
      video_limit=excluded.video_limit,
      program_limit=excluded.program_limit,
      listing_enabled=excluded.listing_enabled,
      featured_listing=excluded.featured_listing,
      priority_support=excluded.priority_support,
      verification_badge=excluded.verification_badge,
      analytics_access=excluded.analytics_access,
      homepage_promotion=excluded.homepage_promotion,
      live_aarti_enabled=excluded.live_aarti_enabled,
      enhanced_seo=excluded.enhanced_seo,
      enhanced_profile=excluded.enhanced_profile,
      whatsapp_enquiry=excluded.whatsapp_enquiry,
      search_visibility=excluded.search_visibility,
      analytics_level=excluded.analytics_level,
      plan_features_json=excluded.plan_features_json,
      is_active=1,
      sort_order=excluded.sort_order,
      updated_at=CURRENT_TIMESTAMP
  `);

  let upserted = 0;
  for (const plan of plans) {
    const result = upsert.run(
      plan.code, plan.audience, plan.name, plan.description, plan.price,
      plan.lead, plan.service, plan.area, plan.gallery, plan.video, plan.program,
      plan.listing, plan.featured, plan.priority, plan.verification, plan.analytics,
      plan.homepage, plan.liveAarti, plan.seo, plan.enhancedProfile, plan.whatsapp,
      plan.visibility, plan.analyticsLevel, JSON.stringify(plan.features), plan.sort,
    );
    upserted += Number(result.changes ?? 0);
  }

  const canonicalCodes = plans.map((plan) => plan.code);
  const placeholders = canonicalCodes.map(() => "?").join(",");
  const deactivate = database.prepare(`
    UPDATE subscription_plans
    SET is_active=0, updated_at=CURRENT_TIMESTAMP
    WHERE code NOT IN (${placeholders})
      AND is_active <> 0
  `);
  const deactivated = Number(deactivate.run(...canonicalCodes).changes ?? 0);

  return { upserted, deactivated };
}

const CANONICAL_PLAN_CODES = new Set([
  "pandit_basic",
  "pandit_premium",
  "temple_basic",
  "temple_premium",
  "ashram_basic",
  "ashram_premium",
]);

function canonicalPlanCodeFromSourceRow(row: SqliteRow): string | null {
  const rawCode = String(row.code ?? "").trim().toLowerCase();
  if (CANONICAL_PLAN_CODES.has(rawCode)) return rawCode;

  const audience = String(row.audience ?? "").trim().toLowerCase();
  if (!["pandit", "temple", "ashram"].includes(audience)) return null;

  const name = String(row.name ?? row.plan_name ?? "").trim().toLowerCase();
  const description = String(row.description ?? "").trim().toLowerCase();
  const price = Number(row.price_amount ?? row.price ?? row.amount ?? 0);
  const combined = `${name} ${description} ${rawCode}`;

  let tier: "basic" | "premium" | null = null;
  if (/(premium|pro|featured|growth|enterprise|advanced|plus)/i.test(combined)) {
    tier = "premium";
  } else if (/(basic|starter|standard|entry|free|lite)/i.test(combined)) {
    tier = "basic";
  }

  if (!tier) {
    const exactPriceTier: Record<CanonicalAudience, { basic: number; premium: number }> = {
      pandit: { basic: 199, premium: 499 },
      temple: { basic: 499, premium: 999 },
      ashram: { basic: 499, premium: 1499 },
    };
    const audiencePrices = exactPriceTier[audience as CanonicalAudience];
    if (price === audiencePrices.basic) tier = "basic";
    if (price === audiencePrices.premium) tier = "premium";
  }

  return tier ? `${audience}_${tier}` : null;
}

function buildSourcePlanIdMap(
  source: Database.Database,
  target: Database.Database,
): Map<number, number> {
  const mapping = new Map<number, number>();
  if (!tableExists(source, "subscription_plans") || !tableExists(target, "subscription_plans")) {
    return mapping;
  }

  const targetRows = target
    .prepare(`SELECT id, code FROM subscription_plans WHERE is_active=1`)
    .all() as Array<{ id: number; code: string }> ;
  const targetByCode = new Map(targetRows.map((row) => [row.code, Number(row.id)]));

  const sourceRows = source
    .prepare(`SELECT * FROM subscription_plans ORDER BY id`)
    .all() as SqliteRow[];

  for (const row of sourceRows) {
    const sourceId = Number(row.id ?? 0);
    if (!sourceId) continue;

    const code = canonicalPlanCodeFromSourceRow(row);
    const targetId = code ? targetByCode.get(code) : undefined;
    if (targetId) mapping.set(sourceId, targetId);
  }

  return mapping;
}

function repairSubscriptionReferenceSnapshotsFromSource(
  source: Database.Database,
  target: Database.Database,
): void {
  if (!tableExists(source, "subscription_plans")) return;

  const sourcePlans = source
    .prepare(`SELECT * FROM subscription_plans`)
    .all() as SqliteRow[];
  const sourcePlanById = new Map(sourcePlans.map((row) => [Number(row.id), row]));

  const subscriptionTables = [
    "pandit_subscriptions",
    "temple_subscriptions",
    "ashram_subscriptions",
  ];

  for (const tableName of subscriptionTables) {
    if (!tableExists(target, tableName)) continue;

    const columns = new Set(getVisibleTableInfo(target, tableName).map((column) => column.name));
    if (!columns.has("plan_id")) continue;

    const rows = target.prepare(`SELECT * FROM ${quoteIdentifier(tableName)}`).all() as SqliteRow[];

    for (const row of rows) {
      const sourcePlan = sourcePlanById.get(Number(row.plan_id ?? 0));
      if (!sourcePlan) continue;

      const assignments: string[] = [];
      const values: unknown[] = [];
      const entitlementColumns = [
        "lead_limit", "service_limit", "service_area_limit", "gallery_limit",
        "video_limit", "program_limit", "listing_enabled", "featured_listing",
        "priority_support", "verification_badge", "analytics_access",
        "homepage_promotion", "live_aarti_enabled", "enhanced_seo",
        "enhanced_profile", "whatsapp_enquiry", "search_visibility",
        "analytics_level", "price_amount", "currency",
      ];

      for (const column of entitlementColumns) {
        if (!columns.has(column)) continue;
        const current = row[column];
        const missing = current === null || current === undefined || current === "" ||
          (["lead_limit", "service_limit", "service_area_limit", "gallery_limit", "video_limit", "program_limit", "price_amount"].includes(column) && Number(current) === 0);
        if (!missing || sourcePlan[column] === undefined) continue;
        assignments.push(`${quoteIdentifier(column)}=?`);
        values.push(sourcePlan[column]);
      }

      if (columns.has("plan_snapshot_json")) {
        const snapshot = String(row.plan_snapshot_json ?? "{}");
        if (!snapshot || snapshot === "{}") {
          assignments.push("plan_snapshot_json=?");
          values.push(JSON.stringify(sourcePlan));
        }
      }

      if (assignments.length > 0) {
        values.push(row.id);
        target.prepare(`UPDATE ${quoteIdentifier(tableName)} SET ${assignments.join(", ")}, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...values);
      }
    }
  }
}

function rewirePlanReferences(
  source: Database.Database,
  target: Database.Database,
): number {
  const mapping = buildSourcePlanIdMap(source, target);
  let rewired = 0;

  const references: Array<{ table: string; nullable: boolean }> = [
    { table: "pandit_subscriptions", nullable: false },
    { table: "temple_subscriptions", nullable: false },
    { table: "ashram_subscriptions", nullable: false },
    { table: "payment_orders", nullable: true },
    { table: "payments", nullable: true },
    { table: "payment_links", nullable: true },
  ];

  for (const { table, nullable } of references) {
    if (!tableExists(target, table)) continue;
    const columns = new Set(getVisibleTableInfo(target, table).map((column) => column.name));
    if (!columns.has("plan_id")) continue;

    const rows = target.prepare(`SELECT id, plan_id FROM ${quoteIdentifier(table)} WHERE plan_id IS NOT NULL`).all() as Array<{ id: number; plan_id: number }>;
    const update = target.prepare(`UPDATE ${quoteIdentifier(table)} SET plan_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`);
    const clear = target.prepare(`UPDATE ${quoteIdentifier(table)} SET plan_id=NULL, updated_at=CURRENT_TIMESTAMP WHERE id=?`);

    for (const row of rows) {
      const mapped = mapping.get(Number(row.plan_id));
      if (mapped) {
        if (Number(row.plan_id) !== mapped) {
          update.run(mapped, row.id);
          rewired += 1;
        }
        continue;
      }

      if (nullable) {
        clear.run(row.id);
        rewired += 1;
        continue;
      }

      throw new Error(
        `Unable to reconcile ${table} row ${String(row.id)}: legacy plan_id=${String(row.plan_id)} has no safe canonical plan mapping.`,
      );
    }
  }

  return rewired;
}

function repairSubscriptionExpiryDates(database: Database.Database): number {
  let repaired = 0;

  const tables = [
    "pandit_subscriptions",
    "temple_subscriptions",
    "ashram_subscriptions",
  ];

  for (const tableName of tables) {
    if (!tableExists(database, tableName)) continue;

    const columns = new Set(getVisibleTableInfo(database, tableName).map((column) => column.name));
    if (!columns.has("status") || !columns.has("expires_at")) continue;

    const rows = database.prepare(`SELECT id, status, starts_at, expires_at, created_at, duration_days FROM ${quoteIdentifier(tableName)} WHERE status='active'`).all() as SqliteRow[];

    for (const row of rows) {
      if (row.expires_at) continue;
      const start = String(row.starts_at ?? row.created_at ?? "").trim();
      if (!start) {
        throw new Error(`${tableName} active subscription ${String(row.id)} has no starts_at/created_at from which an expiry can be derived.`);
      }

      const parsed = new Date(start.replace(" ", "T") + (/[zZ]|[+-]\d{2}:?\d{2}$/.test(start) ? "" : "Z"));
      if (Number.isNaN(parsed.getTime())) {
        throw new Error(`${tableName} active subscription ${String(row.id)} has invalid starts_at value: ${start}`);
      }

      const durationDays = Math.max(1, Number(row.duration_days ?? 30) || 30);
      parsed.setUTCDate(parsed.getUTCDate() + durationDays);
      database.prepare(`UPDATE ${quoteIdentifier(tableName)} SET expires_at=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(parsed.toISOString(), row.id);
      repaired += 1;
    }
  }

  return repaired;
}

function repairSubscriptionReferenceSnapshots(database: Database.Database): void {
  const subscriptionTables = ["pandit_subscriptions", "temple_subscriptions", "ashram_subscriptions"];

  for (const tableName of subscriptionTables) {
    if (!tableExists(database, tableName)) continue;

    const rows = database.prepare(`SELECT * FROM ${quoteIdentifier(tableName)}`).all() as SqliteRow[];
    const updateColumns = new Set(getVisibleTableInfo(database, tableName).map((column) => column.name));
    if (!updateColumns.has("plan_id")) continue;

    for (const row of rows) {
      const planId = Number(row.plan_id ?? 0);
      if (!planId) continue;
      const plan = database.prepare(`SELECT * FROM subscription_plans WHERE id=?`).get(planId) as SqliteRow | undefined;
      if (!plan) continue;

      const setParts: string[] = [];
      const values: unknown[] = [];

      const map: Record<string, string> = {
        lead_limit: "lead_limit",
        service_limit: "service_limit",
        service_area_limit: "service_area_limit",
        gallery_limit: "gallery_limit",
        video_limit: "video_limit",
        program_limit: "program_limit",
        listing_enabled: "listing_enabled",
        featured_listing: "featured_listing",
        priority_support: "priority_support",
        verification_badge: "verification_badge",
        analytics_access: "analytics_access",
        homepage_promotion: "homepage_promotion",
        live_aarti_enabled: "live_aarti_enabled",
        enhanced_seo: "enhanced_seo",
        enhanced_profile: "enhanced_profile",
        whatsapp_enquiry: "whatsapp_enquiry",
        search_visibility: "search_visibility",
        analytics_level: "analytics_level",
        price_amount: "price_amount",
        currency: "currency",
      };

      for (const [targetColumn, planColumn] of Object.entries(map)) {
        if (!updateColumns.has(targetColumn) || !(planColumn in plan)) continue;
        // Keep historical paid subscriptions stable by ONLY filling zero/default snapshots.
        // Never overwrite non-zero entitlement values from a successfully purchased plan.
        const current = row[targetColumn];
        const missing = current === null || current === undefined || current === "" ||
          (["lead_limit", "service_limit", "service_area_limit", "gallery_limit", "video_limit", "program_limit", "price_amount"].includes(targetColumn) && Number(current) === 0);
        if (!missing) continue;
        setParts.push(`${quoteIdentifier(targetColumn)}=?`);
        values.push(plan[planColumn]);
      }

      if (updateColumns.has("plan_snapshot_json")) {
        const snapshot = String(row.plan_snapshot_json ?? "{}");
        if (!snapshot || snapshot === "{}") {
          setParts.push("plan_snapshot_json=?");
          values.push(JSON.stringify(plan));
        }
      }

      if (!setParts.length) continue;
      values.push(row.id);
      database.prepare(`UPDATE ${quoteIdentifier(tableName)} SET ${setParts.join(", ")}, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(...values);
    }
  }
}

function repairTypedLeadSubscriptionReferences(database: Database.Database): void {
  if (!tableExists(database, "lead_assignments")) return;

  const columns = new Set(getVisibleTableInfo(database, "lead_assignments").map((column) => column.name));
  if (!columns.has("subscription_id")) return;

  const rows = database.prepare(`SELECT * FROM lead_assignments`).all() as SqliteRow[];
  for (const row of rows) {
    const legacy = Number(row.subscription_id ?? 0);
    if (!legacy) continue;
    if (columns.has("pandit_subscription_id") && !row.pandit_subscription_id) {
      const exists = tableExists(database, "pandit_subscriptions")
        ? database.prepare(`SELECT 1 AS ok FROM pandit_subscriptions WHERE id=?`).get(legacy) as { ok?: number } | undefined
        : undefined;
      if (exists?.ok) {
        database.prepare(`UPDATE lead_assignments SET pandit_subscription_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`).run(legacy, row.id);
      }
    }
  }
}

function backfillSeoLocationReferences(database: Database.Database): { entries: number; keywords: number } {
  let entries = 0;
  let keywords = 0;

  if (tableExists(database, "seo_entries")) {
    const rows = database.prepare(`SELECT id,path,country_id,state_id,district_id,city_id,area_id FROM seo_entries`).all() as SqliteRow[];
    const update = database.prepare(`
      UPDATE seo_entries
      SET country_id=?,state_id=?,district_id=?,city_id=?,area_id=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `);

    for (const row of rows) {
      const locationId =
        locationFromExistingId(database, row.city_id) ??
        locationFromExistingId(database, row.district_id) ??
        locationFromExistingId(database, row.state_id) ??
        locationFromExistingId(database, row.country_id);
      if (!locationId) continue;

      const geo = database.prepare(`SELECT country_id,state_id,district_id,city_id FROM locations WHERE id=?`).get(locationId) as SqliteRow | undefined;
      const areaId = locationFromExistingId(database, row.area_id);
      update.run(geo?.country_id ?? null, geo?.state_id ?? null, geo?.district_id ?? null, geo?.city_id ?? null, areaId, row.id);
      entries += 1;
    }
  }

  if (tableExists(database, "seo_keywords")) {
    const rows = database.prepare(`SELECT id,country_id,state_id,district_id,city_id,area_id FROM seo_keywords`).all() as SqliteRow[];
    const update = database.prepare(`
      UPDATE seo_keywords
      SET country_id=?,state_id=?,district_id=?,city_id=?,area_id=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `);

    for (const row of rows) {
      const locationId =
        locationFromExistingId(database, row.city_id) ??
        locationFromExistingId(database, row.district_id) ??
        locationFromExistingId(database, row.state_id) ??
        locationFromExistingId(database, row.country_id);
      if (!locationId) continue;

      const geo = database.prepare(`SELECT country_id,state_id,district_id,city_id FROM locations WHERE id=?`).get(locationId) as SqliteRow | undefined;
      const areaId = locationFromExistingId(database, row.area_id);
      update.run(geo?.country_id ?? null, geo?.state_id ?? null, geo?.district_id ?? null, geo?.city_id ?? null, areaId, row.id);
      keywords += 1;
    }
  }

  return { entries, keywords };
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function renderTemplate(template: string | null | undefined, values: Record<string, string>): string {
  return String(template ?? "").replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key: string) => values[key] ?? "");
}

function locationNames(database: Database.Database, id: number): Record<string, string> {
  const row = database.prepare(`
    SELECT
      l.name,l.type,
      c.name AS country_name,
      st.name AS state_name,
      d.name AS district_name,
      ci.name AS city_name,
      l.slug,
      c.slug AS country_slug,
      st.slug AS state_slug,
      d.slug AS district_slug,
      ci.slug AS city_slug
    FROM locations l
    LEFT JOIN locations c ON c.id=l.country_id
    LEFT JOIN locations st ON st.id=l.state_id
    LEFT JOIN locations d ON d.id=l.district_id
    LEFT JOIN locations ci ON ci.id=l.city_id
    WHERE l.id=?
    LIMIT 1
  `).get(id) as SqliteRow | undefined;

  if (!row) return {};
  return {
    name: String(row.name ?? ""),
    type: String(row.type ?? ""),
    country_name: String(row.country_name ?? ""),
    state_name: String(row.state_name ?? ""),
    district_name: String(row.district_name ?? ""),
    city_name: String(row.city_name ?? ""),
    country_slug: String(row.country_slug ?? ""),
    state_slug: String(row.state_slug ?? ""),
    district_slug: String(row.district_slug ?? ""),
    city_slug: String(row.city_slug ?? ""),
  };
}

function entitySeoConfigs(): Array<{
  table: string;
  templateKey: string;
  pathPrefix: string;
  entityType: string;
  where: string;
  nameColumn: string;
}> {
  return [
    { table: "temples", templateKey: "temple-entity", pathPrefix: "/temples/", entityType: "temple", where: "status='published'", nameColumn: "name" },
    { table: "pandit_profiles", templateKey: "pandit-entity", pathPrefix: "/pandits/", entityType: "pandit", where: "profile_status='approved' AND listing_active=1", nameColumn: "display_name" },
    { table: "puja_services", templateKey: "puja-service-entity", pathPrefix: "/services/", entityType: "puja_service", where: "status='published'", nameColumn: "name" },
    { table: "ashrams", templateKey: "ashram-entity", pathPrefix: "/ashrams/", entityType: "ashram", where: "status='published' AND listing_active=1", nameColumn: "name" },
    { table: "yatra_packages", templateKey: "yatra-entity", pathPrefix: "/yatras/", entityType: "yatra", where: "status='published'", nameColumn: "name" },
    { table: "spiritual_places", templateKey: "place-entity", pathPrefix: "/places/", entityType: "spiritual_place", where: "status='published'", nameColumn: "name" },
    { table: "events", templateKey: "event-entity", pathPrefix: "/events/", entityType: "event", where: "status='published'", nameColumn: "title" },
    { table: "gallery_items", templateKey: "gallery-entity", pathPrefix: "/gallery/", entityType: "gallery", where: "status='published'", nameColumn: "title" },
    { table: "videos", templateKey: "video-entity", pathPrefix: "/videos/", entityType: "video", where: "status='published'", nameColumn: "title" },
    { table: "courses", templateKey: "course-entity", pathPrefix: "/courses/", entityType: "course", where: "status='published'", nameColumn: "title" },
    { table: "articles", templateKey: "article-entity", pathPrefix: "/articles/", entityType: "article", where: "status='published'", nameColumn: "title" },
  ];
}

function ensureEntitySeoEntries(database: Database.Database): number {
  if (!tableExists(database, "seo_entries") || !tableExists(database, "seo_templates")) return 0;

  const upsert = database.prepare(`
    INSERT INTO seo_entries (
      path,page_type,entity_type,entity_id,country_id,state_id,district_id,city_id,
      location_level,seo_title,meta_description,h1,intro_content,body_content,
      faq_json,breadcrumb_json,canonical_url,robots,schema_json,schema_type,is_indexable,
      quality_score,content_hash,sitemap_priority,sitemap_changefreq,lastmod_at,published_at,status,updated_at
    ) VALUES (
      ?,?,?,?,?,?,?,?,NULL,?,?,?,?,?,?,?,?,'index,follow',?,?,1,90,?,0.8,'weekly',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,'published',CURRENT_TIMESTAMP
    )
    ON CONFLICT(path) DO UPDATE SET
      page_type=excluded.page_type,entity_type=excluded.entity_type,entity_id=excluded.entity_id,
      country_id=excluded.country_id,state_id=excluded.state_id,district_id=excluded.district_id,
      city_id=excluded.city_id,seo_title=excluded.seo_title,meta_description=excluded.meta_description,
      h1=excluded.h1,intro_content=excluded.intro_content,body_content=excluded.body_content,
      faq_json=excluded.faq_json,breadcrumb_json=excluded.breadcrumb_json,canonical_url=excluded.canonical_url,
      robots=excluded.robots,schema_json=excluded.schema_json,schema_type=excluded.schema_type,
      is_indexable=excluded.is_indexable,quality_score=excluded.quality_score,content_hash=excluded.content_hash,
      sitemap_priority=excluded.sitemap_priority,sitemap_changefreq=excluded.sitemap_changefreq,
      lastmod_at=excluded.lastmod_at,published_at=excluded.published_at,status=excluded.status,
      updated_at=CURRENT_TIMESTAMP
  `);

  let changed = 0;

  for (const config of entitySeoConfigs()) {
    if (!tableExists(database, config.table)) continue;

    const columns = new Set(getVisibleTableInfo(database, config.table).map((column) => column.name));
    if (!columns.has("id") || !columns.has("slug") || !columns.has(config.nameColumn)) continue;

    const locationColumn = columns.has("location_id")
      ? "location_id"
      : columns.has("default_location_id")
        ? "default_location_id"
        : null;

    const selectLocation = locationColumn ? `${quoteIdentifier(locationColumn)} AS location_id` : "NULL AS location_id";
    const rows = database.prepare(`
      SELECT id,slug,${quoteIdentifier(config.nameColumn)} AS entity_name,${selectLocation}
      FROM ${quoteIdentifier(config.table)}
      WHERE ${config.where}
    `).all() as SqliteRow[];

    const template = database.prepare(`SELECT * FROM seo_templates WHERE template_key=? LIMIT 1`).get(config.templateKey) as SqliteRow | undefined;
    if (!template) continue;

    for (const row of rows) {
      const entitySlug = safeSlug(String(row.slug ?? row.entity_name));
      const path = `${config.pathPrefix}${entitySlug}`;
      const locationId = locationFromExistingId(database, row.location_id);
      const names = locationId ? locationNames(database, locationId) : {};
      const values = { name: String(row.entity_name ?? ""), canonical_url: path, ...names };
      const title = renderTemplate(String(template.title_template ?? ""), values);
      const description = renderTemplate(String(template.meta_template ?? ""), values);
      const h1 = renderTemplate(String(template.h1_template ?? ""), values);
      const intro = renderTemplate(String(template.intro_template ?? ""), values);
      const faq = renderTemplate(String(template.faq_template_json ?? "[]"), values);
      const schema = renderTemplate(String(template.schema_template_json ?? "{}"), values);
      const breadcrumbs = renderTemplate(String(template.breadcrumb_template_json ?? "[]"), values);
      const contentHash = sha256(JSON.stringify({ path, title, description, h1, intro, id: row.id }));
      const geo = locationId
        ? database.prepare(`SELECT country_id,state_id,district_id,city_id FROM locations WHERE id=?`).get(locationId) as SqliteRow | undefined
        : undefined;

      const result = upsert.run(
        path,
        String(template.page_type ?? config.entityType),
        config.entityType,
        row.id,
        geo?.country_id ?? null,
        geo?.state_id ?? null,
        geo?.district_id ?? null,
        geo?.city_id ?? null,
        title,
        description,
        h1,
        intro,
        intro,
        faq,
        breadcrumbs,
        path,
        schema,
        String(template.catalog_type ?? config.entityType),
        contentHash,
      );
      changed += Number(result.changes ?? 0);
    }
  }

  return changed;
}

function listingCountForLocation(database: Database.Database, catalogType: string, locationId: number, locationLevel: string): number {
  switch (catalogType) {
    case "temple": {
      const row = database.prepare(`
        SELECT COUNT(DISTINCT t.id) AS count
        FROM temples t
        WHERE t.status='published'
          AND (t.location_id=? OR t.country_location_id=? OR t.state_location_id=? OR t.district_location_id=? OR t.city_location_id=?)
      `).get(locationId, locationId, locationId, locationId, locationId) as { count?: number } | undefined;
      return Number(row?.count ?? 0);
    }
    case "pandit": {
      const row = database.prepare(`
        SELECT COUNT(DISTINCT p.id) AS count
        FROM pandit_profiles p
        LEFT JOIN pandit_service_locations psl ON psl.pandit_id=p.id AND psl.is_active=1
        LEFT JOIN locations sl ON sl.id=psl.location_id
        WHERE p.profile_status='approved' AND p.listing_active=1
          AND (
            p.location_id=? OR p.country_location_id=? OR p.state_location_id=? OR p.district_location_id=? OR p.city_location_id=?
            OR sl.id=? OR sl.country_id=? OR sl.state_id=? OR sl.district_id=? OR sl.city_id=?
          )
      `).get(
        locationId, locationId, locationId, locationId, locationId,
        locationId, locationId, locationId, locationId, locationId,
      ) as { count?: number } | undefined;
      return Number(row?.count ?? 0);
    }
    case "puja_service": {
      const national = locationLevel === "country" ? "ps.availability_scope IN ('national','online') OR" : "";
      const row = database.prepare(`
        SELECT COUNT(DISTINCT ps.id) AS count
        FROM puja_services ps
        LEFT JOIN puja_service_locations psl ON psl.puja_service_id=ps.id AND psl.is_active=1
        LEFT JOIN locations dl ON dl.id=ps.default_location_id
        LEFT JOIN locations sl ON sl.id=psl.location_id
        WHERE ps.status='published' AND (
          ${national}
          ps.default_location_id=? OR psl.location_id=?
          OR dl.country_id=? OR dl.state_id=? OR dl.district_id=? OR dl.city_id=?
          OR sl.country_id=? OR sl.state_id=? OR sl.district_id=? OR sl.city_id=?
        )
      `).get(
        locationId, locationId,
        locationId, locationId, locationId, locationId,
        locationId, locationId, locationId, locationId,
      ) as { count?: number } | undefined;
      return Number(row?.count ?? 0);
    }
    case "ashram": {
      const row = database.prepare(`
        SELECT COUNT(DISTINCT a.id) AS count
        FROM ashrams a
        WHERE a.status='published' AND a.listing_active=1
          AND (a.location_id=? OR a.country_location_id=? OR a.state_location_id=? OR a.district_location_id=? OR a.city_location_id=?)
      `).get(locationId, locationId, locationId, locationId, locationId) as { count?: number } | undefined;
      return Number(row?.count ?? 0);
    }
    case "yatra":
    case "spiritual_place":
    case "event":
    case "gallery":
    case "video":
    case "course":
    case "article": {
      const tableMap: Record<string, string> = {
        yatra: "yatra_packages", spiritual_place: "spiritual_places", event: "events", gallery: "gallery_items",
        video: "videos", course: "courses", article: "articles",
      };
      const table = tableMap[catalogType];
      if (!tableExists(database, table)) return 0;
      const alias = catalogType === "spiritual_place" ? "sp" : catalogType === "yatra" ? "y" : catalogType.charAt(0);
      const row = database.prepare(`
        SELECT COUNT(DISTINCT ${alias}.id) AS count
        FROM ${quoteIdentifier(table)} ${alias}
        WHERE ${alias}.status='published'
          AND (${alias}.location_id=? OR ${alias}.country_location_id=? OR ${alias}.state_location_id=? OR ${alias}.district_location_id=? OR ${alias}.city_location_id=?)
      `).get(locationId, locationId, locationId, locationId, locationId) as { count?: number } | undefined;
      return Number(row?.count ?? 0);
    }
    default:
      return 0;
  }
}

function seoMinimumForLocation(database: Database.Database, catalogType: string, locationLevel: string, fallback: number): number {
  if (!tableExists(database, "seo_listing_controls")) return fallback;
  const map: Record<string, string> = {
    country: "min_country_listings",
    state: "min_state_listings",
    district: "min_district_listings",
    city: "min_city_listings",
  };
  const column = map[locationLevel];
  if (!column) return fallback;

  const row = database.prepare(`
    SELECT ${quoteIdentifier(column)} AS minimum
    FROM seo_listing_controls
    WHERE catalog_type=?
    LIMIT 1
  `).get(catalogType) as { minimum?: number } | undefined;

  const minimum = Number(row?.minimum ?? fallback);
  return Number.isFinite(minimum) && minimum >= 0 ? minimum : fallback;
}

function buildLocationPath(database: Database.Database, locationId: number): string {
  const row = database.prepare(`SELECT seo_path FROM locations WHERE id=?`).get(locationId) as { seo_path?: string } | undefined;
  return String(row?.seo_path ?? "");
}

function ensureSeoLocationPages(database: Database.Database): number {
  if (!tableExists(database, "seo_location_pages") || !tableExists(database, "seo_templates") || !tableExists(database, "locations")) return 0;

  const catalogTypes = [
    "temple", "pandit", "puja_service", "ashram",
    "spiritual_place", "event", "course", "yatra",
  ];
  const levels = ["country", "state", "district", "city"] as const;
  const templatePrefix: Record<string, string> = {
    temple: "temple-listing",
    pandit: "pandit-listing",
    puja_service: "puja-listing",
    ashram: "ashram-listing",
    spiritual_place: "spiritual-place-listing",
    event: "event-listing",
    course: "course-listing",
    yatra: "yatra-listing",
  };

  const allLocations = database.prepare(`
    SELECT id,type,status,seo_enabled,seo_path
    FROM locations
    WHERE type IN ('country','state','district','city') AND status='active'
  `).all() as Array<{ id: number; type: string; status: string; seo_enabled: number; seo_path: string | null }>;

  const seoEntryUpsert = database.prepare(`
    INSERT INTO seo_entries (
      path,page_type,entity_type,country_id,state_id,district_id,city_id,area_id,location_level,
      seo_title,meta_description,h1,intro_content,body_content,faq_json,breadcrumb_json,canonical_url,
      robots,schema_json,schema_type,is_indexable,noindex_reason,quality_score,content_hash,
      sitemap_priority,sitemap_changefreq,lastmod_at,published_at,status,updated_at
    ) VALUES (
      ?,'location_listing',?,?,?,?,?,NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?, ?,?, ?, 'weekly', ?, ?, ?, CURRENT_TIMESTAMP
    )
    ON CONFLICT(path) DO UPDATE SET
      entity_type=excluded.entity_type,country_id=excluded.country_id,state_id=excluded.state_id,
      district_id=excluded.district_id,city_id=excluded.city_id,location_level=excluded.location_level,
      seo_title=excluded.seo_title,meta_description=excluded.meta_description,h1=excluded.h1,
      intro_content=excluded.intro_content,body_content=excluded.body_content,faq_json=excluded.faq_json,
      breadcrumb_json=excluded.breadcrumb_json,canonical_url=excluded.canonical_url,robots=excluded.robots,
      schema_json=excluded.schema_json,schema_type=excluded.schema_type,is_indexable=excluded.is_indexable,
      noindex_reason=excluded.noindex_reason,quality_score=excluded.quality_score,content_hash=excluded.content_hash,
      sitemap_priority=excluded.sitemap_priority,sitemap_changefreq=excluded.sitemap_changefreq,
      lastmod_at=excluded.lastmod_at,published_at=excluded.published_at,status=excluded.status,updated_at=CURRENT_TIMESTAMP
  `);

  const pageUpsert = database.prepare(`
    INSERT INTO seo_location_pages (
      seo_entry_id,template_id,location_id,location_level,catalog_type,page_kind,entity_type,entity_id,
      page_key,path,url_pattern,canonical_path,primary_keyword,keyword_cluster_json,search_intent_json,
      generated_title,generated_description,generated_h1,generated_intro,generated_faq_json,generated_schema_json,
      generated_breadcrumb_json,generated_body,listing_count,minimum_listings_to_index,noindex_reason,
      quality_score,content_hash,generation_version,sitemap_priority,sitemap_changefreq,lastmod_at,published_at,
      is_indexable,status,priority,last_generated_at
    ) VALUES (
      ?,?,?,?,?,'listing',NULL,NULL,?,?,?,?,?,'[]','[]',?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,'weekly',CURRENT_TIMESTAMP,
      CASE WHEN ?=1 THEN CURRENT_TIMESTAMP ELSE NULL END,?,?,0,CURRENT_TIMESTAMP
    )
    ON CONFLICT(path) DO UPDATE SET
      template_id=excluded.template_id,location_id=excluded.location_id,location_level=excluded.location_level,
      catalog_type=excluded.catalog_type,page_key=excluded.page_key,canonical_path=excluded.canonical_path,
      generated_title=excluded.generated_title,generated_description=excluded.generated_description,
      generated_h1=excluded.generated_h1,generated_intro=excluded.generated_intro,generated_faq_json=excluded.generated_faq_json,
      generated_schema_json=excluded.generated_schema_json,generated_breadcrumb_json=excluded.generated_breadcrumb_json,
      generated_body=excluded.generated_body,listing_count=excluded.listing_count,
      minimum_listings_to_index=excluded.minimum_listings_to_index,noindex_reason=excluded.noindex_reason,
      quality_score=excluded.quality_score,content_hash=excluded.content_hash,generation_version=excluded.generation_version,
      sitemap_priority=excluded.sitemap_priority,sitemap_changefreq=excluded.sitemap_changefreq,lastmod_at=excluded.lastmod_at,
      published_at=excluded.published_at,is_indexable=excluded.is_indexable,status=excluded.status,
      last_generated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
  `);

  let changed = 0;

  for (const location of allLocations) {
    if (!location.seo_enabled) continue;
    if (!levels.includes(location.type as typeof levels[number])) continue;

    const names = locationNames(database, location.id);
    const locationPath = buildLocationPath(database, location.id);
    if (!locationPath) continue;

    for (const catalog of catalogTypes) {
      const prefix = templatePrefix[catalog];
      const template = location.type === "city" && catalog !== "temple" && catalog !== "pandit" && catalog !== "puja_service" && catalog !== "ashram"
        ? database.prepare(`
            SELECT * FROM seo_templates
            WHERE template_key=? AND location_level='city'
            ORDER BY id LIMIT 1
          `).get(`${prefix}-listing-city`) as SqliteRow | undefined
        : database.prepare(`
            SELECT * FROM seo_templates
            WHERE catalog_type=? AND location_level=? AND template_key=?
            ORDER BY id LIMIT 1
          `).get(catalog, location.type, `${prefix}-${location.type}`) as SqliteRow | undefined;

      if (!template) continue;

      const count = listingCountForLocation(database, catalog, location.id, location.type);
      const minimum = seoMinimumForLocation(database, catalog, location.type, Number(template.min_listings_to_index ?? 3));
      const indexable = count >= minimum ? 1 : 0;
      const status = indexable ? "published" : "draft";
      const noindexReason = indexable ? null : `Thin location page: ${count} ${catalog} listing(s), minimum required ${minimum}.`;
      const path = renderTemplate(String(template.slug_pattern ?? ""), { ...names, location_path: locationPath });
      if (!path) continue;

      const existingPage = database.prepare(`SELECT id FROM seo_location_pages WHERE path=? LIMIT 1`).get(path) as { id?: number } | undefined;
      if (count === 0 && !existingPage?.id) continue;

      const values = { ...names, location_path: locationPath };
      const title = renderTemplate(String(template.title_template ?? ""), values);
      const description = renderTemplate(String(template.meta_template ?? ""), values);
      const h1 = renderTemplate(String(template.h1_template ?? ""), values);
      const intro = renderTemplate(String(template.intro_template ?? ""), values);
      const faq = renderTemplate(String(template.faq_template_json ?? "[]"), values);
      const schema = renderTemplate(String(template.schema_template_json ?? "{}"), values);
      const breadcrumbs = renderTemplate(String(template.breadcrumb_template_json ?? "[]"), values);
      const contentHash = sha256(JSON.stringify({ path, title, description, h1, intro, count }));
      const quality = Math.min(100, Math.max(0, 50 + Math.min(count, 50)));
      const pageKey = `${catalog}:${locationPath}`;
      const geo = database.prepare(`SELECT country_id,state_id,district_id,city_id FROM locations WHERE id=?`).get(location.id) as SqliteRow | undefined;

      try {
        const seoResult = seoEntryUpsert.run(
          path,
          catalog,
          geo?.country_id ?? null,
          geo?.state_id ?? null,
          geo?.district_id ?? null,
          geo?.city_id ?? null,
          location.type,
          title,
          description,
          h1,
          intro,
          intro,
          faq,
          breadcrumbs,
          path,
          indexable ? "index,follow" : "noindex,follow",
          schema,
          catalog,
          indexable,
          noindexReason,
          quality,
          contentHash,
          Math.min(1, Math.max(0.3, 0.5 + count / 1000)),
          indexable ? new Date().toISOString() : null,
          indexable ? new Date().toISOString() : null,
          status,
        );
        changed += Number(seoResult.changes ?? 0);
      } catch (error) {
        throw new Error(`SEO entry upsert failed for ${path}: ${getErrorMessage(error)}`);
      }

      const seoEntry = database.prepare(`SELECT id FROM seo_entries WHERE path=? LIMIT 1`).get(path) as { id?: number } | undefined;
      const seoEntryId = seoEntry?.id ? Number(seoEntry.id) : null;

      try {
        const pageResult = pageUpsert.run(
          seoEntryId,
          template.id,
          location.id,
          location.type,
          catalog,
          pageKey,
          path,
          path,
          path,
          names.city_name || names.name,
          title,
          description,
          h1,
          intro,
          faq,
          schema,
          breadcrumbs,
          intro,
          count,
          minimum,
          noindexReason,
          quality,
          contentHash,
          Math.min(1, Math.max(0.3, 0.5 + count / 1000)),
          indexable,
          indexable,
          status,
        );
        changed += Number(pageResult.changes ?? 0);
      } catch (error) {
        throw new Error(`SEO location page upsert failed for ${path}: ${getErrorMessage(error)}`);
      }
    }
  }

  return changed;
}

function countLocationLinkedEntities(database: Database.Database): number {
  const tables = [
    "pandit_profiles", "temples", "ashrams", "yatra_packages", "spiritual_places",
    "events", "gallery_items", "videos", "courses", "articles",
  ];
  let total = 0;
  for (const tableName of tables) {
    if (!tableExists(database, tableName)) continue;
    const columns = new Set(getVisibleTableInfo(database, tableName).map((column) => column.name));
    if (!columns.has("location_id")) continue;
    const row = database.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(tableName)} WHERE location_id IS NOT NULL`).get() as { count?: number } | undefined;
    total += Number(row?.count ?? 0);
  }
  return total;
}

const REQUIRED_RUNTIME_INDEXES: Record<string, string[]> = {
  subscription_plan_prices: ["idx_subscription_plan_prices_plan"],
  pandit_subscriptions: ["idx_one_active_subscription_per_pandit"],
  temple_subscriptions: ["idx_one_active_subscription_per_temple"],
  ashram_subscriptions: ["idx_one_active_subscription_per_ashram"],
  payment_orders: ["idx_payment_orders_provider_order"],
  payments: ["idx_payments_provider_payment_unique"],
};

const REQUIRED_RUNTIME_UNIQUE_INDEXES: Array<{
  table: string;
  columns: string[];
  label: string;
}> = [
  { table: "payment_orders", columns: ["provider_order_id"], label: "payment_orders.provider_order_id" },
  { table: "payment_orders", columns: ["order_number"], label: "payment_orders.order_number" },
  { table: "payments", columns: ["provider", "provider_payment_id"], label: "payments.(provider, provider_payment_id)" },
  { table: "payments", columns: ["idempotency_key"], label: "payments.idempotency_key" },
  { table: "payment_webhook_events", columns: ["provider", "provider_event_id"], label: "payment_webhook_events.(provider, provider_event_id)" },
];

function verifyRequiredRuntimeIndexes(database: Database.Database): void {
  for (const [tableName, indexNames] of Object.entries(REQUIRED_RUNTIME_INDEXES)) {
    const indexes = database.pragma(`index_list(${quoteIdentifier(tableName)})`) as Array<{ name: string; unique: number }>;
    const existing = new Set(indexes.map((index) => index.name));
    const missing = indexNames.filter((name) => !existing.has(name));
    if (missing.length > 0) {
      throw new Error(`Required runtime index(es) missing on ${tableName}: ${missing.join(", ")}`);
    }
  }

  for (const requirement of REQUIRED_RUNTIME_UNIQUE_INDEXES) {
    const indexes = database.pragma(`index_list(${quoteIdentifier(requirement.table)})`) as Array<{ name: string; unique: number }>;
    const found = indexes.some((index) => {
      if (Number(index.unique) !== 1) return false;
      const columns = database.pragma(`index_info(${quoteIdentifier(index.name)})`) as Array<{ seqno: number; name: string | null }>;
      const ordered = columns.sort((a, b) => a.seqno - b.seqno).map((column) => column.name);
      return ordered.length === requirement.columns.length && ordered.every((column, i) => column === requirement.columns[i]);
    });
    if (!found) throw new Error(`Required unique index/constraint missing for ${requirement.label}.`);
  }
}

function verifyAnonymousVisitorArchitecture(database: Database.Database): void {
  for (const [tableName, columnName] of [["web_visitors", "user_id"], ["web_sessions", "user_id"]] as const) {
    const meta = getVisibleTableInfo(database, tableName).find((column) => column.name === columnName);
    if (!meta || Number(meta.notnull) === 1) {
      throw new Error(`${tableName}.${columnName} must remain nullable for anonymous visitor tracking.`);
    }
  }

  const orphan = database.prepare(`
    SELECT COUNT(*) AS count
    FROM web_sessions s
    LEFT JOIN web_visitors v ON v.id=s.visitor_id
    WHERE s.visitor_id IS NOT NULL AND v.id IS NULL
  `).get() as { count?: number } | undefined;
  if (Number(orphan?.count ?? 0) > 0) {
    throw new Error(`web_sessions contains ${Number(orphan?.count ?? 0)} orphan visitor reference(s).`);
  }
}

function verifySubscriptionArchitecture(database: Database.Database): void {
  const invalid = database.prepare(`
    SELECT SUM(invalid_count) AS count FROM (
      SELECT COUNT(*) AS invalid_count FROM pandit_subscriptions WHERE status='active' AND expires_at IS NULL
      UNION ALL
      SELECT COUNT(*) FROM temple_subscriptions WHERE status='active' AND expires_at IS NULL
      UNION ALL
      SELECT COUNT(*) FROM ashram_subscriptions WHERE status='active' AND expires_at IS NULL
    )
  `).get() as { count?: number } | undefined;
  if (Number(invalid?.count ?? 0) > 0) {
    throw new Error(`Active subscription(s) without expires_at detected: ${Number(invalid?.count ?? 0)}.`);
  }
}

function verifyPaymentArchitecture(database: Database.Database): void {
  const duplicateIdempotency = database.prepare(`
    SELECT idempotency_key FROM payments
    WHERE idempotency_key IS NOT NULL AND TRIM(idempotency_key)<>''
    GROUP BY idempotency_key HAVING COUNT(*)>1 LIMIT 1
  `).get() as { idempotency_key?: string } | undefined;
  if (duplicateIdempotency) {
    throw new Error(`Duplicate payment idempotency_key detected: ${String(duplicateIdempotency.idempotency_key)}.`);
  }

  const checks: Array<[string, string, string[]]> = [
    ["payment_orders", "status", ["created", "attempted", "paid", "failed", "cancelled", "expired"]],
    ["payments", "status", ["created", "pending", "authorized", "paid", "captured", "failed", "refunded", "partially_refunded", "cancelled"]],
    ["payment_links", "status", ["created", "active", "paid", "expired", "cancelled"]],
    ["payment_webhook_events", "status", ["received", "processed", "ignored", "failed"]],
  ];

  for (const [tableName, columnName, allowed] of checks) {
    const placeholders = allowed.map(() => "?").join(",");
    const row = database.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(tableName)} WHERE ${quoteIdentifier(columnName)} NOT IN (${placeholders})`).get(...allowed) as { count?: number } | undefined;
    if (Number(row?.count ?? 0) > 0) throw new Error(`${tableName} contains unsupported ${columnName} values.`);
  }
}


function ensurePhase1PlanPriceVariants(database: Database.Database): number {
  if (!tableExists(database, "subscription_plan_prices") || !tableExists(database, "subscription_plans")) return 0;

  // Only the six canonical MONTHLY prices are authoritative today.
  // Do not invent quarterly/yearly prices. Existing monthly rows are updated
  // to the canonical plan price so stale legacy amounts cannot survive.
  const result = database.prepare(`
    INSERT INTO subscription_plan_prices (
      plan_id, billing_interval, duration_days, price_amount, currency,
      provider, razorpay_plan_id, is_active, sort_order, metadata_json,
      created_at, updated_at
    )
    SELECT
      id, 'monthly', 30, price_amount, currency,
      'razorpay', razorpay_plan_id, is_active, 1, '{}',
      CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM subscription_plans
    WHERE code IN ('pandit_basic','pandit_premium','temple_basic','temple_premium','ashram_basic','ashram_premium')
    ON CONFLICT(plan_id, billing_interval) DO UPDATE SET
      duration_days = excluded.duration_days,
      price_amount = excluded.price_amount,
      currency = excluded.currency,
      provider = excluded.provider,
      razorpay_plan_id = COALESCE(excluded.razorpay_plan_id, subscription_plan_prices.razorpay_plan_id),
      is_active = excluded.is_active,
      sort_order = excluded.sort_order,
      updated_at = CURRENT_TIMESTAMP
  `).run();

  return Number(result.changes ?? 0);
}

function deactivateUnsupportedPlanPriceVariants(database: Database.Database): number {
  if (!tableExists(database, "subscription_plan_prices")) return 0;

  // Only the six canonical monthly offers are commercial checkout variants.
  // Legacy quarterly/yearly/custom rows are retained for historical audit but
  // made inactive because no annual/non-monthly pricing has been supplied.
  const result = database.prepare(`
    UPDATE subscription_plan_prices
    SET is_active=0, updated_at=CURRENT_TIMESTAMP
    WHERE is_active<>0
      AND (
        billing_interval <> 'monthly'
        OR plan_id NOT IN (
          SELECT id FROM subscription_plans
          WHERE code IN ('pandit_basic','pandit_premium','temple_basic','temple_premium','ashram_basic','ashram_premium')
            AND is_active=1
        )
      )
  `).run();

  return Number(result.changes ?? 0);
}

function normalizeBillingInterval(value: unknown): "monthly" | "quarterly" | "yearly" | "custom" {
  const raw = String(value ?? "").trim().toLowerCase();
  if (["quarter", "quarterly"].includes(raw)) return "quarterly";
  if (["year", "annual", "annually", "yearly"].includes(raw)) return "yearly";
  if (raw === "custom") return "custom";
  return "monthly";
}

function buildSourcePlanPriceIdMap(
  source: Database.Database,
  target: Database.Database,
): Map<number, number | null> {
  const mapping = new Map<number, number | null>();
  if (!tableExists(source, "subscription_plan_prices") || !tableExists(target, "subscription_plan_prices")) {
    return mapping;
  }

  const planMap = buildSourcePlanIdMap(source, target);
  const targetPrices = target.prepare(`
    SELECT id, plan_id, billing_interval
    FROM subscription_plan_prices
    WHERE is_active=1
  `).all() as Array<{ id: number; plan_id: number; billing_interval: string }>;
  const targetByKey = new Map(
    targetPrices.map((row) => [
      `${Number(row.plan_id)}:${normalizeBillingInterval(row.billing_interval)}`,
      Number(row.id),
    ]),
  );

  const sourceRows = source.prepare(`
    SELECT id, plan_id, billing_interval
    FROM subscription_plan_prices
    ORDER BY id
  `).all() as Array<{ id: number; plan_id: number; billing_interval: string | null }>;

  for (const row of sourceRows) {
    const sourceId = Number(row.id ?? 0);
    const targetPlanId = planMap.get(Number(row.plan_id ?? 0));
    if (!sourceId) continue;
    if (!targetPlanId) {
      mapping.set(sourceId, null);
      continue;
    }

    const interval = normalizeBillingInterval(row.billing_interval);
    mapping.set(sourceId, targetByKey.get(`${targetPlanId}:${interval}`) ?? null);
  }

  return mapping;
}

function rewireSubscriptionPlanPriceReferences(
  source: Database.Database,
  target: Database.Database,
): number {
  if (!tableExists(target, "subscription_plan_prices")) return 0;

  const mapping = buildSourcePlanPriceIdMap(source, target);
  let changed = 0;

  const tables = [
    "pandit_subscriptions",
    "temple_subscriptions",
    "ashram_subscriptions",
    "payment_orders",
    "payments",
    "payment_links",
  ];

  for (const tableName of tables) {
    if (!tableExists(target, tableName)) continue;
    const columns = new Set(getVisibleTableInfo(target, tableName).map((column) => column.name));
    if (!columns.has("subscription_plan_price_id")) continue;

    const rows = target
      .prepare(`SELECT id, subscription_plan_price_id FROM ${quoteIdentifier(tableName)} WHERE subscription_plan_price_id IS NOT NULL`)
      .all() as Array<{ id: number; subscription_plan_price_id: number }>;

    const update = target.prepare(`
      UPDATE ${quoteIdentifier(tableName)}
      SET subscription_plan_price_id=?, updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `);

    for (const row of rows) {
      const oldPriceId = Number(row.subscription_plan_price_id ?? 0);
      const mapped = mapping.get(oldPriceId);

      if (mapped === undefined) {
        // A non-null reference copied from the source must point to a source
        // price row. If it does not, it is safer to clear this nullable link
        // than leave a dangling FK that blocks the final verification.
        update.run(null, row.id);
        changed += 1;
        continue;
      }

      if (mapped === null) {
        update.run(null, row.id);
        changed += 1;
        continue;
      }

      if (mapped !== oldPriceId) {
        update.run(mapped, row.id);
        changed += 1;
      }
    }
  }

  return changed;
}

function backfillSubscriptionPlanPriceLinks(database: Database.Database): number {
  if (!tableExists(database, "subscription_plan_prices")) return 0;
  let changed = 0;

  // Subscription records retain their historical billing_interval. A price
  // link is filled only when an exact target interval exists. Since the
  // canonical catalogue currently exposes monthly prices only, legacy
  // quarterly/yearly subscriptions remain unlinked rather than being silently
  // converted to monthly pricing.
  for (const tableName of ["pandit_subscriptions", "temple_subscriptions", "ashram_subscriptions"]) {
    if (!tableExists(database, tableName)) continue;
    const columns = new Set(getVisibleTableInfo(database, tableName).map((column) => column.name));
    if (!columns.has("subscription_plan_price_id") || !columns.has("plan_id")) continue;

    const rows = database.prepare(`
      SELECT id, plan_id, billing_interval, duration_days, subscription_plan_price_id
      FROM ${quoteIdentifier(tableName)}
      WHERE subscription_plan_price_id IS NULL
        AND plan_id IS NOT NULL
    `).all() as SqliteRow[];

    for (const row of rows) {
      const interval = normalizeBillingInterval(row.billing_interval);
      const price = database.prepare(`
        SELECT id, duration_days
        FROM subscription_plan_prices
        WHERE plan_id=? AND billing_interval=? AND is_active=1
        ORDER BY id
        LIMIT 1
      `).get(Number(row.plan_id), interval) as { id?: number; duration_days?: number } | undefined;

      if (!price?.id) continue;

      const updates = ["subscription_plan_price_id=?"];
      const values: unknown[] = [Number(price.id)];
      if (columns.has("duration_days") && Number(row.duration_days ?? 0) <= 0) {
        updates.push("duration_days=?");
        values.push(Number(price.duration_days ?? 30));
      }
      updates.push("updated_at=CURRENT_TIMESTAMP");
      values.push(Number(row.id));

      database.prepare(`UPDATE ${quoteIdentifier(tableName)} SET ${updates.join(", ")} WHERE id=?`).run(...values);
      changed += 1;
    }
  }

  // Payment ledger tables do not store billing_interval, so their plan is
  // linked to the active monthly canonical price.
  for (const tableName of ["payment_orders", "payments", "payment_links"]) {
    if (!tableExists(database, tableName)) continue;
    const columns = new Set(getVisibleTableInfo(database, tableName).map((column) => column.name));
    if (!columns.has("subscription_plan_price_id") || !columns.has("plan_id")) continue;

    const result = database.prepare(`
      UPDATE ${quoteIdentifier(tableName)}
      SET subscription_plan_price_id = (
        SELECT spp.id
        FROM subscription_plan_prices spp
        WHERE spp.plan_id=${quoteIdentifier(tableName)}.plan_id
          AND spp.billing_interval='monthly'
          AND spp.is_active=1
        LIMIT 1
      ),
      updated_at=CURRENT_TIMESTAMP
      WHERE subscription_plan_price_id IS NULL
        AND plan_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM subscription_plan_prices spp2
          WHERE spp2.plan_id=${quoteIdentifier(tableName)}.plan_id
            AND spp2.billing_interval='monthly'
            AND spp2.is_active=1
        )
    `).run();
    changed += Number(result.changes ?? 0);
  }

  return changed;
}

function linkLeadsToUsers(database: Database.Database): number {
  if (!tableExists(database, "leads") || !tableExists(database, "web_visitors")) return 0;
  const result = database.prepare(`
    UPDATE leads
    SET user_id = (
      SELECT user_id
      FROM web_visitors
      WHERE web_visitors.id = leads.visitor_id
    ),
    updated_at = CURRENT_TIMESTAMP
    WHERE user_id IS NULL
      AND visitor_id IS NOT NULL
      AND visitor_id IN (SELECT id FROM web_visitors WHERE user_id IS NOT NULL)
  `).run();
  return Number(result.changes ?? 0);
}

function verifyPhase1Architecture(database: Database.Database): void {
  const requiredTables = [
    "auth_identities",
    "subscription_plan_prices",
    "lead_capture_sessions",
    "lead_capture_signals",
    "ai_conversations",
    "ai_messages",
    "ai_recommendations",
  ];
  const missing = requiredTables.filter((name) => !tableExists(database, name));
  if (missing.length) throw new Error(`Phase 1 database architecture is incomplete. Missing table(s): ${missing.join(", ")}.`);

  const identityColumns = new Set(getVisibleTableInfo(database, "auth_identities").map((column) => column.name));
  for (const column of [
    "provider",
    "identity_type",
    "provider_subject",
    "user_id",
    "visitor_id",
    "phone_e164",
    "status",
    "verified_at",
  ] as const) {
    if (!identityColumns.has(column)) {
      throw new Error(`Phase 1 database architecture is incomplete. auth_identities.${column} is missing.`);
    }
  }

  const identityUnique = getUniqueIndexes(database, "auth_identities");
  const hasProviderSubjectUnique = identityUnique.some((index) =>
    index.columns.length === 2 &&
    index.columns[0] === "provider" &&
    index.columns[1] === "provider_subject"
  );
  if (!hasProviderSubjectUnique) {
    throw new Error("auth_identities must uniquely identify each provider subject.");
  }

  const leadColumns = new Set(getVisibleTableInfo(database, "leads").map((column) => column.name));
  for (const column of ["user_id", "visitor_id", "session_id", "source_submission_id", "status"] as const) {
    if (!leadColumns.has(column)) {
      throw new Error(`Phase 1 database architecture is incomplete. leads.${column} is missing.`);
    }
  }

  const captureColumns = new Set(getVisibleTableInfo(database, "lead_capture_sessions").map((column) => column.name));
  for (const column of [
    "capture_key",
    "capture_surface",
    "module",
    "entity_type",
    "entity_id",
    "visitor_id",
    "session_id",
    "page_view_id",
    "user_id",
    "auth_identity_id",
    "verification_provider",
    "verification_status",
    "status",
    "lead_id",
  ] as const) {
    if (!captureColumns.has(column)) {
      throw new Error(`Phase 1 database architecture is incomplete. lead_capture_sessions.${column} is missing.`);
    }
  }

  const formColumns = new Set(getVisibleTableInfo(database, "form_definitions").map((column) => column.name));
  for (const column of ["capture_mode", "requires_phone_verification", "creates_lead"] as const) {
    if (!formColumns.has(column)) throw new Error(`Phase 1 database architecture is incomplete. form_definitions.${column} is missing.`);
  }

  const submissionColumns = new Set(getVisibleTableInfo(database, "form_submissions").map((column) => column.name));
  if (!submissionColumns.has("capture_session_id") || !submissionColumns.has("user_id") || !submissionColumns.has("visitor_id") || !submissionColumns.has("lead_id")) {
    throw new Error("Phase 1 database architecture is incomplete. form_submissions capture linkage is missing.");
  }

  const expectedMonthlyPrices: Record<string, number> = {
    pandit_basic: 199,
    pandit_premium: 499,
    temple_basic: 499,
    temple_premium: 999,
    ashram_basic: 499,
    ashram_premium: 1499,
  };

  const priceRows = database.prepare(`
    SELECT sp.code, spp.price_amount, spp.currency, spp.duration_days, spp.is_active
    FROM subscription_plans sp
    LEFT JOIN subscription_plan_prices spp
      ON spp.plan_id=sp.id
     AND spp.billing_interval='monthly'
    WHERE sp.code IN ('pandit_basic','pandit_premium','temple_basic','temple_premium','ashram_basic','ashram_premium')
  `).all() as SqliteRow[];

  for (const [code, expectedPrice] of Object.entries(expectedMonthlyPrices)) {
    const row = priceRows.find((item) => String(item.code) === code && Number(item.is_active ?? 0) === 1);
    if (!row) throw new Error(`Active monthly subscription price variant missing for ${code}.`);
    if (Number(row.price_amount) !== expectedPrice || String(row.currency) !== 'INR' || Number(row.duration_days) !== 30) {
      throw new Error(`Monthly subscription price mismatch for ${code}. Expected INR ${expectedPrice}/30 days, received INR ${String(row.price_amount)}/${String(row.duration_days)} days.`);
    }
  }

  const captureForms = [
    "temple_detail_gate","pandit_detail_gate","puja_detail_gate","ashram_detail_gate",
    "yatra_detail_gate","spiritual_place_detail_gate","event_detail_gate","course_detail_gate","kundli_capture",
  ];
  const placeholders = captureForms.map(() => "?").join(",");
  const rows = database.prepare(`SELECT form_key,capture_mode,requires_phone_verification,creates_lead,is_active FROM form_definitions WHERE form_key IN (${placeholders})`).all(...captureForms) as SqliteRow[];
  const byKey = new Map(rows.map((row) => [String(row.form_key), row]));
  for (const key of captureForms) {
    const row = byKey.get(key);
    if (
      !row ||
      String(row.capture_mode) !== "detail_gate" ||
      Number(row.requires_phone_verification) !== 1 ||
      Number(row.creates_lead) !== 1 ||
      Number(row.is_active) !== 1
    ) {
      throw new Error(`Required lead capture form is missing or misconfigured: ${key}.`);
    }
  }

  const plans = database.prepare(`
    SELECT sp.code
    FROM subscription_plans sp
    WHERE sp.is_active=1
      AND EXISTS (
        SELECT 1 FROM subscription_plan_prices spp
        WHERE spp.plan_id=sp.id AND spp.billing_interval='monthly' AND spp.is_active=1
      )
  `).all() as Array<{code:string}>;
  const expectedPlans = ["pandit_basic","pandit_premium","temple_basic","temple_premium","ashram_basic","ashram_premium"];
  const planSet = new Set(plans.map((row) => row.code));
  const missingPlanPrices = expectedPlans.filter((code) => !planSet.has(code));
  if (missingPlanPrices.length) throw new Error(`Monthly price variant missing for canonical plan(s): ${missingPlanPrices.join(", ")}.`);
}

function verifySchemaContracts(database: Database.Database): void {
  const configured = schemaObjectContracts();
  const missingTables = [...configured.tables, "schema_migrations"].filter((name) => !tableExists(database, name));
  const missingViews = configured.views.filter((name) => !viewExists(database, name));
  if (missingTables.length > 0) throw new Error(`Required schema table(s) are missing: ${[...new Set(missingTables)].join(", ")}`);
  if (missingViews.length > 0) throw new Error(`Required schema view(s) are missing: ${missingViews.join(", ")}`);
}

function verifyMigrationVersion(database: Database.Database): void {
  const version = Number(database.pragma("user_version", { simple: true }) ?? 0);
  if (version < MIGRATION_VERSION) {
    throw new Error(`SQLite user_version ${version} is below required version ${MIGRATION_VERSION}.`);
  }
}

function verifyCanonicalPlans(database: Database.Database): void {
  const expected = [
    { code: "pandit_basic", audience: "pandit", name: "Basic", price_amount: 199, lead_limit: 10, service_limit: 5, service_area_limit: 2, gallery_limit: 0, video_limit: 0, program_limit: 0, listing_enabled: 1, featured_listing: 0, priority_support: 0, verification_badge: 1, analytics_access: 1, homepage_promotion: 0, live_aarti_enabled: 0, enhanced_seo: 0, enhanced_profile: 0, whatsapp_enquiry: 1, search_visibility: "standard", analytics_level: "basic" },
    { code: "pandit_premium", audience: "pandit", name: "Premium", price_amount: 499, lead_limit: 30, service_limit: 15, service_area_limit: 0, gallery_limit: 0, video_limit: 0, program_limit: 0, listing_enabled: 1, featured_listing: 1, priority_support: 1, verification_badge: 1, analytics_access: 1, homepage_promotion: 1, live_aarti_enabled: 0, enhanced_seo: 1, enhanced_profile: 1, whatsapp_enquiry: 1, search_visibility: "higher", analytics_level: "advanced" },
    { code: "temple_basic", audience: "temple", name: "Basic", price_amount: 499, lead_limit: 15, service_limit: 0, service_area_limit: 0, gallery_limit: 15, video_limit: 2, program_limit: 0, listing_enabled: 1, featured_listing: 0, priority_support: 0, verification_badge: 1, analytics_access: 1, homepage_promotion: 0, live_aarti_enabled: 0, enhanced_seo: 0, enhanced_profile: 0, whatsapp_enquiry: 1, search_visibility: "standard", analytics_level: "basic" },
    { code: "temple_premium", audience: "temple", name: "Premium", price_amount: 999, lead_limit: 50, service_limit: 0, service_area_limit: 0, gallery_limit: 50, video_limit: 10, program_limit: 0, listing_enabled: 1, featured_listing: 1, priority_support: 1, verification_badge: 1, analytics_access: 1, homepage_promotion: 1, live_aarti_enabled: 1, enhanced_seo: 1, enhanced_profile: 1, whatsapp_enquiry: 1, search_visibility: "higher", analytics_level: "advanced" },
    { code: "ashram_basic", audience: "ashram", name: "Basic", price_amount: 499, lead_limit: 15, service_limit: 0, service_area_limit: 0, gallery_limit: 15, video_limit: 2, program_limit: 3, listing_enabled: 1, featured_listing: 0, priority_support: 0, verification_badge: 1, analytics_access: 1, homepage_promotion: 0, live_aarti_enabled: 0, enhanced_seo: 0, enhanced_profile: 0, whatsapp_enquiry: 1, search_visibility: "standard", analytics_level: "basic" },
    { code: "ashram_premium", audience: "ashram", name: "Premium", price_amount: 1499, lead_limit: 75, service_limit: 0, service_area_limit: 0, gallery_limit: 50, video_limit: 10, program_limit: 15, listing_enabled: 1, featured_listing: 1, priority_support: 1, verification_badge: 1, analytics_access: 1, homepage_promotion: 1, live_aarti_enabled: 0, enhanced_seo: 1, enhanced_profile: 1, whatsapp_enquiry: 1, search_visibility: "higher", analytics_level: "advanced" },
  ] as const;

  const rows = database.prepare(`SELECT code,audience,name,price_amount,billing_interval,duration_days,currency,lead_limit,service_limit,service_area_limit,gallery_limit,video_limit,program_limit,listing_enabled,featured_listing,priority_support,verification_badge,analytics_access,homepage_promotion,live_aarti_enabled,enhanced_seo,enhanced_profile,whatsapp_enquiry,search_visibility,analytics_level,is_active FROM subscription_plans WHERE is_active=1`).all() as SqliteRow[];
  const map = new Map(rows.map((row) => [String(row.code), row]));

  if (rows.length !== expected.length) {
    throw new Error(`Expected exactly ${expected.length} active commercial plans, found ${rows.length}.`);
  }

  const fields: readonly string[] = [
    "audience", "name", "price_amount", "billing_interval", "duration_days", "currency",
    "lead_limit", "service_limit", "service_area_limit", "gallery_limit", "video_limit",
    "program_limit", "listing_enabled", "featured_listing", "priority_support",
    "verification_badge", "analytics_access", "homepage_promotion", "live_aarti_enabled",
    "enhanced_seo", "enhanced_profile", "whatsapp_enquiry", "search_visibility", "analytics_level",
  ];

  for (const item of expected) {
    const row = map.get(item.code);
    if (!row) throw new Error(`Canonical subscription plan missing: ${item.code}`);

    const wanted: Record<string, unknown> = {
      audience: item.audience, name: item.name, price_amount: item.price_amount,
      billing_interval: "monthly", duration_days: 30, currency: "INR",
      lead_limit: item.lead_limit, service_limit: item.service_limit, service_area_limit: item.service_area_limit,
      gallery_limit: item.gallery_limit, video_limit: item.video_limit, program_limit: item.program_limit,
      listing_enabled: item.listing_enabled, featured_listing: item.featured_listing, priority_support: item.priority_support,
      verification_badge: item.verification_badge, analytics_access: item.analytics_access, homepage_promotion: item.homepage_promotion,
      live_aarti_enabled: item.live_aarti_enabled, enhanced_seo: item.enhanced_seo, enhanced_profile: item.enhanced_profile,
      whatsapp_enquiry: item.whatsapp_enquiry, search_visibility: item.search_visibility, analytics_level: item.analytics_level,
    };

    for (const field of fields) {
      const actual = ["price_amount","duration_days","lead_limit","service_limit","service_area_limit","gallery_limit","video_limit","program_limit","listing_enabled","featured_listing","priority_support","verification_badge","analytics_access","homepage_promotion","live_aarti_enabled","enhanced_seo","enhanced_profile","whatsapp_enquiry"].includes(field) ? Number(row[field]) : String(row[field]);
      if (actual !== wanted[field]) {
        throw new Error(`Canonical subscription plan verification failed for ${item.code}.${field}. Expected ${String(wanted[field])}, received ${String(row[field])}.`);
      }
    }
  }
}

function verifyCanonicalRoles(database: Database.Database): void {
  const rows = database.prepare(`SELECT code,public_registration_enabled,approval_required,dashboard_path,is_system,is_active FROM roles`).all() as SqliteRow[];
  const map = new Map(rows.map((row) => [String(row.code), row]));
  const expectations: Record<string, [number,number,string,number,number]> = {
    visitor: [1,0,"/dashboard",1,1],
    pandit: [1,1,"/pandit/dashboard",1,1],
    temple_manager: [1,1,"/temple/dashboard",1,1],
    ashram_manager: [1,1,"/ashram/dashboard",1,1],
    sales: [0,0,"/sales/dashboard",1,1],
    super_admin: [0,0,"/admin",1,1],
  };
  for (const code of CANONICAL_ROLE_CODES) {
    const row = map.get(code);
    if (!row) throw new Error(`Canonical role missing: ${code}`);
    const [registration,approval,dashboard,isSystem,isActive] = expectations[code];
    if (Number(row.public_registration_enabled)!==registration || Number(row.approval_required)!==approval || String(row.dashboard_path)!==dashboard || Number(row.is_system)!==isSystem || Number(row.is_active)!==isActive) {
      throw new Error(`Canonical role configuration mismatch: ${code}`);
    }
  }

  const publicRoles = database.prepare(`SELECT code FROM roles WHERE public_registration_enabled=1 AND is_active=1 ORDER BY id`).all() as Array<{code:string}>;
  if (publicRoles.map((row)=>row.code).join(",") !== "visitor,pandit,temple_manager,ashram_manager") {
    throw new Error(`Unexpected public registration role set: ${publicRoles.map((row)=>row.code).join(",")}`);
  }

  const internalRoles = database.prepare(`SELECT code FROM roles WHERE public_registration_enabled=0 AND is_active=1 AND code IN ('sales','super_admin') ORDER BY id`).all() as Array<{code:string}>;
  if (internalRoles.map((row)=>row.code).join(",") !== "sales,super_admin") {
    throw new Error(`Sales and Super Admin must remain internal-only. Received: ${internalRoles.map((row)=>row.code).join(",")}`);
  }
}

function ensureCanonicalRolePermissionGrants(database: Database.Database): void {
  if (!tableExists(database, "roles") || !tableExists(database, "permissions") || !tableExists(database, "role_permissions")) {
    throw new Error("RBAC tables are missing; cannot reconcile canonical role permissions.");
  }

  const requiredPermissions: Array<[string, string, string, string]> = [
    ["auth.view_profile", "View Profile", "View the authenticated profile", "auth"],
    ["auth.edit_profile", "Edit Profile", "Edit the authenticated profile", "auth"],
    ["ashram.view", "View Ashrams", "View Ashram information", "ashram"],
    ["ashram.manage_assigned", "Manage Assigned Ashrams", "Edit assigned Ashram information", "ashram"],
    ["ashram.view_leads", "View Ashram Leads", "View leads related to assigned Ashrams", "ashram"],
    ["ashram.manage_programs", "Manage Ashram Programs", "Manage programs associated with assigned Ashrams", "ashram"],
    ["ashram.manage_subscription", "Manage Ashram Subscription", "View and purchase Ashram subscription", "ashram"],
    ["sales.view_ashrams", "View Ashrams for Sales", "View Ashram records for onboarding and sales", "sales"],
    ["sales.manage_ashram_subscriptions", "Manage Ashram Subscriptions", "Manage Ashram subscription onboarding", "sales"],
    ["admin.manage_ashram_managers", "Manage Ashram Managers", "Assign and manage Ashram Managers", "admin"],
    ["admin.manage_ashrams", "Manage Ashrams", "Create and manage Ashram records", "admin"],
  ];

  const insertPermission = database.prepare(`
    INSERT OR IGNORE INTO permissions (code, name, description, module)
    VALUES (?, ?, ?, ?)
  `);

  for (const permission of requiredPermissions) {
    insertPermission.run(...permission);
  }

  const insertGrant = database.prepare(`
    INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r
    JOIN permissions p ON p.code=?
    WHERE r.code=?
  `);

  const grants: Array<[string, string]> = [
    ["auth.view_profile", "ashram_manager"],
    ["auth.edit_profile", "ashram_manager"],
    ["ashram.view", "ashram_manager"],
    ["ashram.manage_assigned", "ashram_manager"],
    ["ashram.view_leads", "ashram_manager"],
    ["ashram.manage_programs", "ashram_manager"],
    ["ashram.manage_subscription", "ashram_manager"],
    ["ashram.view", "sales"],
    ["sales.view_ashrams", "sales"],
    ["sales.manage_ashram_subscriptions", "sales"],
  ];

  for (const [permissionCode, roleCode] of grants) {
    insertGrant.run(permissionCode, roleCode);
  }

  // Super Admin intentionally receives the complete permission catalogue.
  database.exec(`
    INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.code='super_admin';
  `);

  // These settings are part of the runtime contract, so legacy databases are
  // repaired here instead of being rejected later by startup verification.
  ensureCanonicalRegistrationSettings(database);
}

function ensureCanonicalRegistrationSettings(database: Database.Database): void {
  if (!tableExists(database, "settings")) {
    throw new Error("settings table is missing; cannot reconcile registration policy.");
  }

  const upsert = database.prepare(`
    INSERT INTO settings (setting_key, setting_value, setting_type, description, is_public, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(setting_key) DO UPDATE SET
      setting_value=excluded.setting_value,
      setting_type=excluded.setting_type,
      description=excluded.description,
      is_public=excluded.is_public,
      updated_at=CURRENT_TIMESTAMP
  `);

  upsert.run(
    "public_registration_roles",
    JSON.stringify(["visitor", "pandit", "temple_manager", "ashram_manager"]),
    "json",
    "Roles permitted to self-register through public forms.",
    0,
  );

  upsert.run(
    "ashram_manager_registration_requires_approval",
    "true",
    "boolean",
    "Ashram Manager self-registration requires administrative approval.",
    0,
  );
}

function verifyAshramManagerArchitecture(database: Database.Database): void {
  const requiredTables = ["ashram_manager_profiles", "ashram_manager_assignments"] as const;
  const missingTables = requiredTables.filter((tableName) => !tableExists(database, tableName));
  if (missingTables.length > 0) {
    throw new Error(`Ashram Manager architecture is incomplete. Missing table(s): ${missingTables.join(", ")}.`);
  }

  const profileColumns = new Set(getVisibleTableInfo(database, "ashram_manager_profiles").map((column) => column.name));
  for (const column of ["user_id", "designation", "organization_name", "verification_status"] as const) {
    if (!profileColumns.has(column)) {
      throw new Error(`Ashram Manager architecture is incomplete. ashram_manager_profiles.${column} is missing.`);
    }
  }

  const assignmentColumns = new Set(getVisibleTableInfo(database, "ashram_manager_assignments").map((column) => column.name));
  for (const column of ["ashram_id", "manager_user_id", "assigned_by", "status", "assigned_at", "revoked_at"] as const) {
    if (!assignmentColumns.has(column)) {
      throw new Error(`Ashram Manager architecture is incomplete. ashram_manager_assignments.${column} is missing.`);
    }
  }

  const profileUnique = getUniqueIndexes(database, "ashram_manager_profiles");
  if (!isUniqueSingleColumn(profileUnique, "user_id")) {
    throw new Error("ashram_manager_profiles.user_id must be unique so one account has one manager profile.");
  }

  const assignmentUnique = getUniqueIndexes(database, "ashram_manager_assignments");
  const hasAssignmentPair = assignmentUnique.some((index) =>
    index.columns.length === 2 &&
    index.columns[0] === "ashram_id" &&
    index.columns[1] === "manager_user_id"
  );
  if (!hasAssignmentPair) {
    throw new Error("ashram_manager_assignments must prevent duplicate Ashram/Manager mappings.");
  }

  const invalidProfileUsers = database.prepare(`
    SELECT COUNT(*) AS count
    FROM ashram_manager_profiles amp
    JOIN users u ON u.id=amp.user_id
    JOIN roles r ON r.id=u.role_id
    WHERE r.code <> 'ashram_manager'
  `).get() as { count?: number } | undefined;
  if (Number(invalidProfileUsers?.count ?? 0) > 0) {
    throw new Error(`Found ${Number(invalidProfileUsers?.count ?? 0)} Ashram Manager profile(s) linked to a non-ashram_manager user.`);
  }

  const invalidAssignments = database.prepare(`
    SELECT COUNT(*) AS count
    FROM ashram_manager_assignments ama
    LEFT JOIN ashrams a ON a.id=ama.ashram_id
    LEFT JOIN users u ON u.id=ama.manager_user_id
    LEFT JOIN roles r ON r.id=u.role_id
    WHERE a.id IS NULL OR u.id IS NULL OR r.code <> 'ashram_manager'
  `).get() as { count?: number } | undefined;
  if (Number(invalidAssignments?.count ?? 0) > 0) {
    throw new Error(`Found ${Number(invalidAssignments?.count ?? 0)} invalid Ashram Manager assignment(s).`);
  }

  const requiredPermissionCodes = [
    "ashram.view",
    "ashram.manage_assigned",
    "ashram.view_leads",
    "ashram.manage_programs",
    "ashram.manage_subscription",
    "admin.manage_ashram_managers",
  ];
  const placeholders = requiredPermissionCodes.map(() => "?").join(",");
  const permissionRows = database.prepare(`SELECT code FROM permissions WHERE code IN (${placeholders})`).all(...requiredPermissionCodes) as Array<{code:string}>;
  const permissionSet = new Set(permissionRows.map((row) => row.code));
  const missingPermissions = requiredPermissionCodes.filter((code) => !permissionSet.has(code));
  if (missingPermissions.length > 0) {
    throw new Error(`Ashram Manager RBAC permission(s) missing: ${missingPermissions.join(", ")}.`);
  }

  const ashramGrantRows = database.prepare(`
    SELECT p.code
    FROM role_permissions rp
    JOIN roles r ON r.id=rp.role_id
    JOIN permissions p ON p.id=rp.permission_id
    WHERE r.code='ashram_manager'
  `).all() as Array<{code:string}>;
  const ashramGrantSet = new Set(ashramGrantRows.map((row) => row.code));
  const requiredAshramGrants = [
    "ashram.view",
    "ashram.manage_assigned",
    "ashram.view_leads",
    "ashram.manage_programs",
    "ashram.manage_subscription",
  ];
  const missingAshramGrants = requiredAshramGrants.filter((code) => !ashramGrantSet.has(code));
  if (missingAshramGrants.length > 0) {
    throw new Error(`Ashram Manager role permission grant(s) missing: ${missingAshramGrants.join(", ")}.`);
  }

  const salesCanViewAshram = database.prepare(`
    SELECT 1 AS ok
    FROM role_permissions rp
    JOIN roles r ON r.id=rp.role_id
    JOIN permissions p ON p.id=rp.permission_id
    WHERE r.code='sales' AND p.code='ashram.view'
    LIMIT 1
  `).get() as {ok?:number}|undefined;
  if (!salesCanViewAshram?.ok) {
    throw new Error("Sales role must retain ashram.view permission for Ashram onboarding.");
  }

  const registrationSetting = database.prepare(`
    SELECT setting_value
    FROM settings
    WHERE setting_key='public_registration_roles'
    LIMIT 1
  `).get() as {setting_value?:string}|undefined;
  let publicRegistrationRoles: unknown;
  try { publicRegistrationRoles = JSON.parse(String(registrationSetting?.setting_value ?? "[]")); }
  catch { throw new Error("settings.public_registration_roles contains invalid JSON."); }
  if (!Array.isArray(publicRegistrationRoles) || !publicRegistrationRoles.includes("ashram_manager")) {
    throw new Error("public_registration_roles must include ashram_manager.");
  }

  const approvalSetting = database.prepare(`
    SELECT setting_value
    FROM settings
    WHERE setting_key='ashram_manager_registration_requires_approval'
    LIMIT 1
  `).get() as {setting_value?:string}|undefined;
  if (String(approvalSetting?.setting_value ?? "").toLowerCase() !== "true") {
    throw new Error("Ashram Manager registration approval policy must remain enabled.");
  }
}

function verifyDatabase(database: Database.Database): void {
  database.pragma("foreign_keys = ON");

  const integrity = database.prepare("PRAGMA integrity_check").get() as { integrity_check?: string } | undefined;
  if (integrity?.integrity_check !== "ok") {
    throw new Error(`SQLite integrity_check failed: ${String(integrity?.integrity_check ?? "unknown error")}`);
  }

  const foreignKeyErrors = database.pragma("foreign_key_check") as Array<unknown>;
  if (foreignKeyErrors.length > 0) {
    const preview = foreignKeyErrors.slice(0, 10).map((entry) => JSON.stringify(entry)).join("; ");
    throw new Error(`SQLite foreign_key_check failed with ${foreignKeyErrors.length} violation(s): ${preview}`);
  }

  verifySchemaContracts(database);
  verifyCanonicalRoles(database);
  verifyAshramManagerArchitecture(database);
  verifyCanonicalPlans(database);
  verifyAnonymousVisitorArchitecture(database);
  verifySubscriptionArchitecture(database);
  verifyPaymentArchitecture(database);
  verifyPhase1Architecture(database);
  verifyRequiredRuntimeIndexes(database);

  ensureMigrationTable(database);
  if (!migrationAlreadyApplied(database)) throw new Error(`Migration marker ${MIGRATION_KEY} was not recorded.`);
  verifyMigrationVersion(database);

  const marker = database.prepare(`SELECT migration_key,version FROM schema_migrations WHERE migration_key=? LIMIT 1`).get(MIGRATION_KEY) as {migration_key?:string;version?:number}|undefined;
  if (!marker || Number(marker.version)!==MIGRATION_VERSION) throw new Error(`Migration marker/version mismatch for ${MIGRATION_KEY}.`);
}

function suspendTargetTriggers(database: Database.Database): string[] {
  const triggerObjects = getObjectSqls(database, "trigger");
  const sqls: string[] = [];

  for (const trigger of triggerObjects) {
    database.exec(`DROP TRIGGER IF EXISTS ${quoteIdentifier(trigger.name)}`);
    sqls.push(trigger.sql);
  }

  return sqls;
}

function runMigration(): void {
  console.log("\nDivyaDhara SQLite Master Migration — FINAL v4");
  console.log("-----------------------------------------");
  console.log(`Database : ${DATABASE_FILE}`);
  console.log(`Schema   : ${SCHEMA_FILE}`);
  console.log(`Backup   : ${NO_BACKUP ? "DISABLED (--no-backup)" : BACKUP_DIR}`);
  console.log(`Force    : ${FORCE ? "YES" : "NO"}`);

  ensureDirectory(DATABASE_DIR);
  if (!existsSync(SCHEMA_FILE)) throw new Error(`Cannot continue. schema.sql is missing: ${SCHEMA_FILE}`);

  // New database: create, seed, verify.
  if (isNewOrEmptyDatabase(DATABASE_FILE)) {
    console.log("\nNo existing SQLite database found. Creating fresh database from final schema.sql...");

    const database = new Database(DATABASE_FILE);
    let freshSucceeded = false;
    try {
      configureDatabase(database, { foreignKeys: false });
      const tables = initializeFreshDatabase(database);
      ensureMigrationTable(database);
      ensureCanonicalSubscriptionPlans(database);
      ensureCanonicalRolePermissionGrants(database);
      ensurePhase1PlanPriceVariants(database);
      deactivateUnsupportedPlanPriceVariants(database);
      backfillSubscriptionPlanPriceLinks(database);
      linkLeadsToUsers(database);
      verifyCanonicalRoles(database);
      recordMigration(database, "Initial database created from the final DivyaDhara master schema with six canonical roles including Ashram Manager.");
      verifyDatabase(database);
      freshSucceeded = true;
      console.log(`Fresh database created with ${tables} application table(s).`);
    } finally {
      if (database.open) database.close();
      if (!freshSucceeded) {
        cleanupSQLiteSidecars(DATABASE_FILE);
        try { rmSync(DATABASE_FILE, { force: true }); } catch { /* best effort */ }
      }
    }
    console.log("Migration completed successfully.\n");
    return;
  }

  const source = new Database(DATABASE_FILE);
  let target: Database.Database | null = null;
  const temporaryPath = tempDatabasePath();
  let backupPath: string | null = null;

  const stats: MigrationStats = {
    tablesCreatedFromSchema: 0,
    sourceTables: 0,
    copiedTables: 0,
    copiedRows: 0,
    normalizedRows: 0,
    skippedRows: 0,
    legacyTablesPreserved: 0,
    locationRowsAdded: 0,
    locationAliasRowsAdded: 0,
    entitiesLinkedToLocations: 0,
    serviceLocationRowsAdded: 0,
    seoEntriesLinked: 0,
    seoKeywordsLinked: 0,
    seoLocationPagesChanged: 0,
    entitySeoEntriesChanged: 0,
    canonicalPlansUpserted: 0,
    legacyPlansDeactivated: 0,
    planReferencesRewired: 0,
    subscriptionExpiryRowsRepaired: 0,
    subscriptionPlanPriceRowsSeeded: 0,
    subscriptionPlanPriceReferencesRewired: 0,
    leadsLinkedToUsers: 0,
    backupsCreated: null,
  };

  try {
    configureDatabase(source, { foreignKeys: true });
    const checkpoint = source.pragma("wal_checkpoint(TRUNCATE)") as unknown;
    console.log(`\nWAL checkpoint completed: ${JSON.stringify(checkpoint)}`);

    if (!NO_BACKUP) {
      backupPath = createBackup(DATABASE_FILE);
      stats.backupsCreated = backupPath;
      console.log(`Backup created: ${backupPath}`);
    }

    if (!FORCE && migrationAlreadyApplied(source)) {
      try {
        verifyDatabase(source);
        console.log("\nThe final DivyaDhara SQLite architecture is already applied and verified.");
        console.log("No migration performed. Use --force only for an intentional rebuild.\n");
        return;
      } catch (verificationError) {
        console.log("\nMigration marker exists, but the live database failed final verification.");
        console.log(`Reconciliation rebuild will run: ${getErrorMessage(verificationError)}`);
        source.pragma("foreign_keys = OFF");
      }
    }

    source.exec("BEGIN IMMEDIATE TRANSACTION");
    stats.sourceTables = tableNames(source).length;

    cleanupSQLiteSidecars(temporaryPath);
    target = new Database(temporaryPath);
    configureDatabase(target, { foreignKeys: false });

    stats.tablesCreatedFromSchema = initializeFreshDatabase(target);
    const suspendedTargetTriggers = suspendTargetTriggers(target);
    console.log(`  Suspended ${suspendedTargetTriggers.length} target trigger(s) during legacy copy.`);
    const targetSchemaTables = new Set(tableNames(target));
    const sourceTables = tableNames(source);

    console.log(`Existing database tables : ${stats.sourceTables}`);
    console.log(`Target schema tables     : ${stats.tablesCreatedFromSchema}`);

    const securityIdentityMap = reconcileSecurityIdentities(source, target);

    stats.legacyTablesPreserved = preserveLegacyTables(source, target, targetSchemaTables);

    for (const tableName of sourceTables) {
      if (!targetSchemaTables.has(tableName)) continue;
      if (tableName === "schema_migrations") continue;
      if (["roles", "permissions", "role_permissions"].includes(tableName)) {
        console.log(`  ${tableName}: reconciled by stable code identity`);
        continue;
      }
      if (tableName === "subscription_plans") {
        console.log("  subscription_plans: rebuilt from canonical six-plan catalogue; historical refs will be remapped");
        continue;
      }

      const sourceCount = countRows(source, tableName);
      target.exec(`DELETE FROM ${quoteIdentifier(tableName)}`);

      const result = copyTableData(source, target, tableName, securityIdentityMap);
      stats.copiedTables += 1;
      stats.copiedRows += result.copied;
      stats.normalizedRows += result.normalized;
      stats.skippedRows += result.skipped;

      console.log(
        `  ${tableName}: ${sourceCount} -> ${result.copied}` +
        (result.normalized ? ` normalized=${result.normalized}` : "") +
        (result.skipped ? ` skipped=${result.skipped}` : ""),
      );
    }

    stats.copiedRows += copyLegacyTableRows(source, target, targetSchemaTables);

    // Re-execute the final schema to restore all INSERT OR IGNORE seeds/triggers/indexes.
    target.exec(readMigrationSchema());
    ensureCanonicalRolePermissionGrants(target);

    // Final business identities.
    // The target schema already contains the canonical six-plan catalogue. Do not
    // copy legacy plan rows because the final schema intentionally permits only
    // one Basic and one Premium plan per audience. Preserve historical commercial
    // terms in subscription snapshots and remap every old plan reference.
    repairSubscriptionReferenceSnapshotsFromSource(source, target);

    const planStats = ensureCanonicalSubscriptionPlans(target);
    stats.canonicalPlansUpserted = planStats.upserted;
    stats.legacyPlansDeactivated = planStats.deactivated;

    stats.subscriptionPlanPriceRowsSeeded = ensurePhase1PlanPriceVariants(target);
    deactivateUnsupportedPlanPriceVariants(target);
    stats.planReferencesRewired = rewirePlanReferences(source, target);

    // First fill missing price links from the canonical plan. Then remap any
    // copied legacy price IDs. This ordering prevents a legacy quarterly/yearly
    // reference that must be cleared from being immediately recreated as a
    // monthly link.
    backfillSubscriptionPlanPriceLinks(target);
    stats.subscriptionPlanPriceReferencesRewired = rewireSubscriptionPlanPriceReferences(source, target);
    stats.leadsLinkedToUsers = linkLeadsToUsers(target);

    // Fill any remaining missing entitlement columns from the now-canonical plan.
    repairSubscriptionReferenceSnapshots(target);
    repairTypedLeadSubscriptionReferences(target);
    stats.subscriptionExpiryRowsRepaired = repairSubscriptionExpiryDates(target);

    const legacyOnlySet = new Set(sourceTables.filter((tableName) => !targetSchemaTables.has(tableName)));
    preserveLegacyIndexesAndTriggers(source, target, legacyOnlySet);
    preserveLegacyViews(source, target);

    // Geography and SEO are still performed with FK checks disabled because
    // some legacy rows intentionally require reconciliation during the rebuild.
    stats.locationRowsAdded = backfillLocations(target);
    rebuildLocationAncestry(target);
    stats.locationAliasRowsAdded = backfillLocationAliases(target);

    stats.serviceLocationRowsAdded += addPanditServiceLocationsFromLegacyJson(target);
    stats.serviceLocationRowsAdded += addPujaServiceLocationsFromLegacyData(source, target);

    normalizeLocationRefs(target, "yatra_packages");
    normalizeLocationRefs(target, "gallery_items");
    normalizeLocationRefs(target, "videos");
    normalizeLocationRefs(target, "courses");
    normalizeLocationRefs(target, "articles");

    rebuildLocationAncestry(target);
    const seoRefs = backfillSeoLocationReferences(target);
    stats.seoEntriesLinked = seoRefs.entries;
    stats.seoKeywordsLinked = seoRefs.keywords;

    stats.entitySeoEntriesChanged = ensureEntitySeoEntries(target);
    stats.seoLocationPagesChanged = ensureSeoLocationPages(target);
    stats.entitiesLinkedToLocations = countLocationLinkedEntities(target);

    // Final gate: enable FK enforcement before writing the migration marker or
    // validating the completed target. No database is swapped before this gate passes.
    target.pragma("foreign_keys = ON");

    recordMigration(
      target,
      "Final rebuild of DivyaDhara SQLite database from schema.sql with canonical six-role RBAC including Ashram Manager, six active subscription plans, anonymous analytics preservation, location/SEO backfill, Firebase/lead-capture foundations, and legacy compatibility.",
    );

    verifyDatabase(target);

    target.pragma("wal_checkpoint(TRUNCATE)");

    source.exec("COMMIT");
    source.close();

    target.close();
    target = null;

    const oldPath = resolve(DATABASE_DIR, `.divyadhara-old-${process.pid}-${nowForFilename()}.sqlite`);
    cleanupSQLiteSidecars(oldPath);
    cleanupSQLiteSidecars(DATABASE_FILE);
    cleanupSQLiteSidecars(temporaryPath);

    if (!existsSync(temporaryPath)) throw new Error(`Temporary migrated database disappeared: ${temporaryPath}`);

    fs.renameSync(DATABASE_FILE, oldPath);
    try {
      fs.renameSync(temporaryPath, DATABASE_FILE);
    } catch (swapError) {
      try {
        if (!existsSync(DATABASE_FILE) && existsSync(oldPath)) fs.renameSync(oldPath, DATABASE_FILE);
      } catch {
        // Durable backup remains available.
      }
      throw new Error(`Final database swap failed: ${getErrorMessage(swapError)}`);
    }

    cleanupSQLiteSidecars(oldPath);
    if (existsSync(oldPath)) rmSync(oldPath, { force: true });

    console.log("\nMigration completed successfully.");
    console.log(`New database                 : ${DATABASE_FILE}`);
    console.log(`Copied tables                : ${stats.copiedTables}`);
    console.log(`Copied rows                  : ${stats.copiedRows}`);
    console.log(`Normalized rows              : ${stats.normalizedRows}`);
    console.log(`Skipped duplicates           : ${stats.skippedRows}`);
    console.log(`Locations added              : ${stats.locationRowsAdded}`);
    console.log(`Location aliases added      : ${stats.locationAliasRowsAdded}`);
    console.log(`Entities linked to locations : ${stats.entitiesLinkedToLocations}`);
    console.log(`Service location rows        : ${stats.serviceLocationRowsAdded}`);
    console.log(`SEO entries linked           : ${stats.seoEntriesLinked}`);
    console.log(`SEO keywords linked          : ${stats.seoKeywordsLinked}`);
    console.log(`SEO location pages changed   : ${stats.seoLocationPagesChanged}`);
    console.log(`Entity SEO entries changed   : ${stats.entitySeoEntriesChanged}`);
    console.log(`Canonical plans upserted     : ${stats.canonicalPlansUpserted}`);
    console.log(`Legacy plans deactivated     : ${stats.legacyPlansDeactivated}`);
    console.log(`Plan references rewired      : ${stats.planReferencesRewired}`);
    console.log(`Price references rewired     : ${stats.subscriptionPlanPriceReferencesRewired}`);
    console.log(`Subscription expiries fixed  : ${stats.subscriptionExpiryRowsRepaired}`);
    if (backupPath) console.log(`Backup                       : ${backupPath}`);
    console.log("\nPost-migration checks:");
    console.log("  1. npx tsc --noEmit -p tsconfig.node.json");
    console.log("  2. npm run build");
    console.log("  3. start backend and verify /api/auth/me");
    console.log("  4. verify Admin → subscription plans shows six active plans");
    console.log("  5. verify anonymous visitor/session/page/event rows are retained");
    console.log("");
  } catch (error) {
    if (source.open) {
      try { source.exec("ROLLBACK"); } catch { /* ignore */ }
    }

    console.error("\nMigration FAILED.");
    console.error(getErrorMessage(error));
    if (backupPath) console.error(`Original backup remains at: ${backupPath}`);
    throw error;
  } finally {
    if (target?.open) {
      try { target.close(); } catch { /* ignore */ }
    }
    if (source.open) {
      try { source.close(); } catch { /* ignore */ }
    }

    if (existsSync(temporaryPath)) {
      try { rmSync(temporaryPath, { force: true }); } catch { /* best effort */ }
    }
    cleanupSQLiteSidecars(temporaryPath);
  }
}

try {
  runMigration();
} catch {
  process.exitCode = 1;
}
