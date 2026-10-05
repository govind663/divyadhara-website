import Database from "better-sqlite3";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import {
  dirname,
  isAbsolute,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";

/*
|--------------------------------------------------------------------------
| DivyaDhara SQLite Database Connection
|--------------------------------------------------------------------------
|
| ROLE OF THIS FILE
|--------------------------------------------------------------------------
|
| database.ts is the runtime database connection and verification layer.
|
| It deliberately does NOT contain the rebuild/legacy migration engine.
| Existing databases must be upgraded explicitly with:
|
|   npx tsx server/db/migrate.ts
|
| This separation keeps application startup deterministic and prevents a
| normal server restart from silently rebuilding the production database.
|
| Responsibilities here:
|   1. Resolve the canonical SQLite path.
|   2. Create the schema only for a genuinely new/empty database.
|   3. Open the database with the required SQLite pragmas.
|   4. Verify the final business architecture before serving requests.
|   5. Verify the six system roles and six commercial subscription plans.
|   6. Verify the complete subscription/payment ledger architecture.
|   7. Verify anonymous visitor analytics can exist without a user account.
|   8. Verify critical uniqueness/index invariants used for idempotency.
|   9. Expose one shared better-sqlite3 connection for the backend.
|
| Migration responsibilities live in migrate.ts.
| Content synchronisation responsibilities live in seed-content.ts.
|
| IMPORTANT:
|   - Existing DBs are NEVER silently migrated here.
|   - A fresh DB is created from schema.sql and then fully verified before
|     being returned to the application.
|   - Verification failure is fail-closed: the API does not start on a
|     database that does not match the expected commercial architecture.
|
|--------------------------------------------------------------------------
*/

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "../..");

const DEFAULT_DATABASE_FILE = resolve(
  PROJECT_ROOT,
  "data",
  "divyadhara.sqlite",
);

const SCHEMA_FILE = resolve(__dirname, "schema.sql");

const DATABASE_SCHEMA_VERSION = 4;
const DATABASE_MIGRATION_KEY = "2026-10-03-phase2-role-alignment-v4";

const REQUIRED_ROLE_CODES = [
  "visitor",
  "pandit",
  "temple_manager",
  "ashram_manager",
  "sales",
  "super_admin",
] as const;

const REQUIRED_ACTIVE_PLAN_CODES = [
  "pandit_basic",
  "pandit_premium",
  "temple_basic",
  "temple_premium",
  "ashram_basic",
  "ashram_premium",
] as const;

type PlanExpectation = {
  code: string;
  audience: "pandit" | "temple" | "ashram";
  name: "Basic" | "Premium";
  price_amount: number;
  lead_limit: number;
  service_limit: number;
  service_area_limit: number;
  gallery_limit: number;
  video_limit: number;
  program_limit: number;
  listing_enabled: number;
  featured_listing: number;
  priority_support: number;
  verification_badge: number;
  analytics_access: number;
  homepage_promotion: number;
  live_aarti_enabled: number;
  enhanced_seo: number;
  enhanced_profile: number;
  whatsapp_enquiry: number;
  search_visibility: "standard" | "higher";
  analytics_level: "none" | "basic" | "advanced";
};

const FINAL_PLAN_EXPECTATIONS: PlanExpectation[] = [
  {
    code: "pandit_basic",
    audience: "pandit",
    name: "Basic",
    price_amount: 199,
    lead_limit: 10,
    service_limit: 5,
    service_area_limit: 2,
    gallery_limit: 0,
    video_limit: 0,
    program_limit: 0,
    listing_enabled: 1,
    featured_listing: 0,
    priority_support: 0,
    verification_badge: 1,
    analytics_access: 1,
    homepage_promotion: 0,
    live_aarti_enabled: 0,
    enhanced_seo: 0,
    enhanced_profile: 0,
    whatsapp_enquiry: 1,
    search_visibility: "standard",
    analytics_level: "basic",
  },
  {
    code: "pandit_premium",
    audience: "pandit",
    name: "Premium",
    price_amount: 499,
    lead_limit: 30,
    service_limit: 15,
    service_area_limit: 0,
    gallery_limit: 0,
    video_limit: 0,
    program_limit: 0,
    listing_enabled: 1,
    featured_listing: 1,
    priority_support: 1,
    verification_badge: 1,
    analytics_access: 1,
    homepage_promotion: 1,
    live_aarti_enabled: 0,
    enhanced_seo: 1,
    enhanced_profile: 1,
    whatsapp_enquiry: 1,
    search_visibility: "higher",
    analytics_level: "advanced",
  },
  {
    code: "temple_basic",
    audience: "temple",
    name: "Basic",
    price_amount: 499,
    lead_limit: 15,
    service_limit: 0,
    service_area_limit: 0,
    gallery_limit: 15,
    video_limit: 2,
    program_limit: 0,
    listing_enabled: 1,
    featured_listing: 0,
    priority_support: 0,
    verification_badge: 1,
    analytics_access: 1,
    homepage_promotion: 0,
    live_aarti_enabled: 0,
    enhanced_seo: 0,
    enhanced_profile: 0,
    whatsapp_enquiry: 1,
    search_visibility: "standard",
    analytics_level: "basic",
  },
  {
    code: "temple_premium",
    audience: "temple",
    name: "Premium",
    price_amount: 999,
    lead_limit: 50,
    service_limit: 0,
    service_area_limit: 0,
    gallery_limit: 50,
    video_limit: 10,
    program_limit: 0,
    listing_enabled: 1,
    featured_listing: 1,
    priority_support: 1,
    verification_badge: 1,
    analytics_access: 1,
    homepage_promotion: 1,
    live_aarti_enabled: 1,
    enhanced_seo: 1,
    enhanced_profile: 1,
    whatsapp_enquiry: 1,
    search_visibility: "higher",
    analytics_level: "advanced",
  },
  {
    code: "ashram_basic",
    audience: "ashram",
    name: "Basic",
    price_amount: 499,
    lead_limit: 15,
    service_limit: 0,
    service_area_limit: 0,
    gallery_limit: 15,
    video_limit: 2,
    program_limit: 3,
    listing_enabled: 1,
    featured_listing: 0,
    priority_support: 0,
    verification_badge: 1,
    analytics_access: 1,
    homepage_promotion: 0,
    live_aarti_enabled: 0,
    enhanced_seo: 0,
    enhanced_profile: 0,
    whatsapp_enquiry: 1,
    search_visibility: "standard",
    analytics_level: "basic",
  },
  {
    code: "ashram_premium",
    audience: "ashram",
    name: "Premium",
    price_amount: 1499,
    lead_limit: 75,
    service_limit: 0,
    service_area_limit: 0,
    gallery_limit: 50,
    video_limit: 10,
    program_limit: 15,
    listing_enabled: 1,
    featured_listing: 1,
    priority_support: 1,
    verification_badge: 1,
    analytics_access: 1,
    homepage_promotion: 1,
    live_aarti_enabled: 0,
    enhanced_seo: 1,
    enhanced_profile: 1,
    whatsapp_enquiry: 1,
    search_visibility: "higher",
    analytics_level: "advanced",
  },
];

/*
|--------------------------------------------------------------------------
| Path helpers
|--------------------------------------------------------------------------
*/

function resolveDatabasePath(): string {
  const configuredPath = process.env.DIVYADHARA_DB_PATH?.trim();

  if (!configuredPath) {
    return DEFAULT_DATABASE_FILE;
  }

  return isAbsolute(configuredPath)
    ? resolve(configuredPath)
    : resolve(process.cwd(), configuredPath);
}

export const databasePath = resolveDatabasePath();
export const databaseDirectory = dirname(databasePath);
export const schemaPath = SCHEMA_FILE;

function ensureDatabaseDirectory(): void {
  if (!existsSync(databaseDirectory)) {
    mkdirSync(databaseDirectory, { recursive: true });
  }
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function readSchema(): string {
  if (!existsSync(SCHEMA_FILE)) {
    throw new Error(`SQLite schema file not found: ${SCHEMA_FILE}`);
  }

  const schema = readFileSync(SCHEMA_FILE, "utf8").trim();

  if (!schema) {
    throw new Error(`SQLite schema file is empty: ${SCHEMA_FILE}`);
  }

  return schema;
}

/*
|--------------------------------------------------------------------------
| SQLite configuration
|--------------------------------------------------------------------------
*/

function configureDatabase(database: Database.Database): void {
  database.pragma("busy_timeout = 5000");
  database.pragma("journal_mode = WAL");
  database.pragma("synchronous = NORMAL");
  database.pragma("temp_store = MEMORY");
  database.pragma("recursive_triggers = ON");
  database.pragma("foreign_keys = ON");
}

/*
|--------------------------------------------------------------------------
| Schema bootstrap
|--------------------------------------------------------------------------
|
| Only genuinely new/empty databases are bootstrapped here. A non-empty
| database must be upgraded explicitly by migrate.ts.
|--------------------------------------------------------------------------
*/

function isNewOrEmptyDatabase(filePath: string): boolean {
  if (!existsSync(filePath)) {
    return true;
  }

  try {
    return statSync(filePath).size === 0;
  } catch {
    return false;
  }
}

function tableExists(database: Database.Database, tableName: string): boolean {
  const row = database
    .prepare(
      `
      SELECT 1 AS present
      FROM sqlite_master
      WHERE type = 'table'
        AND name = ?
      LIMIT 1
      `,
    )
    .get(tableName) as { present?: number } | undefined;

  return Boolean(row?.present);
}

function viewExists(database: Database.Database, viewName: string): boolean {
  const row = database
    .prepare(
      `
      SELECT 1 AS present
      FROM sqlite_master
      WHERE type = 'view'
        AND name = ?
      LIMIT 1
      `,
    )
    .get(viewName) as { present?: number } | undefined;

  return Boolean(row?.present);
}

function getTableColumns(
  database: Database.Database,
  tableName: string,
): Set<string> {
  if (!tableExists(database, tableName)) {
    return new Set();
  }

  const rows = database.pragma(`table_info(${quoteIdentifier(tableName)})`) as Array<{
    name: string;
  }>;

  return new Set(rows.map((row) => row.name));
}

function getIndexes(
  database: Database.Database,
  tableName: string,
): Set<string> {
  if (!tableExists(database, tableName)) {
    return new Set();
  }

  const rows = database.pragma(`index_list(${quoteIdentifier(tableName)})`) as Array<{
    name: string;
  }>;

  return new Set(rows.map((row) => row.name));
}


function ensureCanonicalSubscriptionPlanPriceVariants(database: Database.Database): void {
  if (!tableExists(database, "subscription_plans") || !tableExists(database, "subscription_plan_prices")) {
    throw new Error(
      "Fresh database schema is missing subscription plan tables. Check server/db/schema.sql before starting the API.",
    );
  }

  const findPlan = database.prepare(`
    SELECT id, code, price_amount, currency, billing_interval, duration_days, is_active
    FROM subscription_plans
    WHERE code = ?
    LIMIT 1
  `);

  const insertPrice = database.prepare(`
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
      metadata_json
    ) VALUES (?, 'monthly', 30, ?, 'INR', 'razorpay', NULL, 1, ?, ?)
    ON CONFLICT(plan_id, billing_interval) DO UPDATE SET
      duration_days = excluded.duration_days,
      price_amount = excluded.price_amount,
      currency = excluded.currency,
      provider = excluded.provider,
      is_active = excluded.is_active,
      sort_order = excluded.sort_order,
      metadata_json = excluded.metadata_json,
      updated_at = CURRENT_TIMESTAMP
  `);

  const seedPriceVariants = database.transaction(() => {
    for (const expected of FINAL_PLAN_EXPECTATIONS) {
      const plan = findPlan.get(expected.code) as {
        id?: number;
        code?: string;
        price_amount?: number;
        currency?: string;
        billing_interval?: string;
        duration_days?: number;
        is_active?: number;
      } | undefined;

      if (!plan?.id) {
        throw new Error(`Cannot seed subscription_plan_prices: plan ${expected.code} is missing.`);
      }

      if (Number(plan.is_active) !== 1) {
        throw new Error(`Cannot seed subscription_plan_prices: plan ${expected.code} is inactive.`);
      }

      if (
        Number(plan.price_amount) !== expected.price_amount ||
        String(plan.currency) !== "INR" ||
        String(plan.billing_interval) !== "monthly" ||
        Number(plan.duration_days) !== 30
      ) {
        throw new Error(
          `Subscription plan ${expected.code} does not match the canonical monthly INR/30-day contract. Run: npx tsx server/db/migrate.ts`,
        );
      }

      insertPrice.run(
        Number(plan.id),
        expected.price_amount,
        expected.name === "Premium" ? 2 : 1,
        JSON.stringify({ source: "canonical_phase2_v4" }),
      );
    }
  });

  seedPriceVariants();
}

function bootstrapFreshDatabase(database: Database.Database): void {
  const schema = readSchema();
  database.exec(schema);

  ensureCanonicalSubscriptionPlanPriceVariants(database);

  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      migration_key TEXT NOT NULL UNIQUE,
      version INTEGER NOT NULL,
      description TEXT,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  database
    .prepare(
      `
      INSERT OR IGNORE INTO schema_migrations (
        migration_key,
        version,
        description
      )
      VALUES (?, ?, ?)
      `,
    )
    .run(
      DATABASE_MIGRATION_KEY,
      DATABASE_SCHEMA_VERSION,
      "Fresh database created from the final DivyaDhara business architecture.",
    );

  database.pragma(`user_version = ${DATABASE_SCHEMA_VERSION}`);
}

/*
|--------------------------------------------------------------------------
| Verification catalogues
|--------------------------------------------------------------------------
*/

const REQUIRED_TABLES = [
  /* RBAC / auth */
  "roles",
  "permissions",
  "role_permissions",
  "users",
  "visitor_profiles",
  "sessions",
  "password_reset_tokens",
  "verification_tokens",
  "auth_identities",
  "notifications",

  /* Locations */
  "locations",
  "location_aliases",

  /* Pandits */
  "pandit_profiles",
  "pandit_service_offerings",
  "pandit_verification_documents",
  "pandit_subscriptions",
  "subscription_plan_prices",

  /* Temples + manager */
  "temples",
  "temple_manager_profiles",
  "temple_manager_assignments",

  /* Ashrams + manager */
  "ashram_manager_profiles",
  "ashram_manager_assignments",
  "temple_categories",
  "temple_category_map",
  "temple_history",
  "temple_significance",
  "temple_divine_attractions",
  "temple_scriptural_connections",
  "temple_pilgrim_experience",
  "temple_bhagavata_connections",
  "temple_darshan_timings",
  "temple_aarti",
  "temple_festivals",
  "temple_facilities",
  "temple_how_to_reach",
  "temple_committee",
  "temple_faqs",
  "temple_nearby_places",
  "temple_sources",
  "temple_live_aarti",
  "temple_seo_keywords",
  "temple_subscriptions",

  /* Puja + catalogues */
  "puja_services",
  "temple_puja_services",
  "ashrams",
  "ashram_programs",
  "ashram_courses",
  "ashram_subscriptions",
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
  "content_sync_registry",

  /* Forms / requests / CRM */
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

  /* Commercial / payments */
  "subscription_plans",
  "subscription_events",
  "payment_orders",
  "payments",
  "payment_links",
  "payment_webhook_events",

  /* Engagement */
  "saved_temples",
  "saved_places",
  "site_searches",
  "ai_conversations",
  "ai_messages",
  "ai_recommendations",

  /* Site content */
  "homepage_content",
  "homepage_sections",
  "homepage_stats",
  "settings",
  "audit_logs",

  /* Anonymous + registered visitor analytics */
  "web_visitors",
  "web_sessions",
  "web_page_views",
  "web_events",
  "analytics_goals",
  "analytics_daily_page_stats",
  "analytics_daily_site_stats",
  "web_conversions",

  /* SEO */
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
];

const REQUIRED_VIEWS = [
  "catalogue_location_index",
];

const REQUIRED_COLUMNS: Record<string, string[]> = {
  roles: [
    "code",
    "public_registration_enabled",
    "approval_required",
    "dashboard_path",
    "is_system",
    "is_active",
  ],

  users: [
    "role_id",
    "name",
    "email",
    "password_hash",
    "status",
  ],

  ashram_manager_profiles: [
    "user_id",
    "designation",
    "organization_name",
    "verification_status",
  ],

  ashram_manager_assignments: [
    "ashram_id",
    "manager_user_id",
    "assigned_by",
    "status",
    "assigned_at",
    "revoked_at",
  ],

  auth_identities: [
    "provider",
    "identity_type",
    "provider_subject",
    "status",
  ],

  subscription_plan_prices: [
    "plan_id",
    "billing_interval",
    "duration_days",
    "price_amount",
    "currency",
    "provider",
    "razorpay_plan_id",
    "is_active",
  ],

  subscription_plans: [
    "code",
    "audience",
    "name",
    "price_amount",
    "currency",
    "billing_interval",
    "duration_days",
    "lead_limit",
    "service_limit",
    "service_area_limit",
    "gallery_limit",
    "video_limit",
    "program_limit",
    "listing_enabled",
    "featured_listing",
    "priority_support",
    "verification_badge",
    "analytics_access",
    "homepage_promotion",
    "live_aarti_enabled",
    "enhanced_seo",
    "enhanced_profile",
    "whatsapp_enquiry",
    "search_visibility",
    "analytics_level",
    "plan_features_json",
    "razorpay_plan_id",
    "is_active",
  ],

  pandit_subscriptions: [
    "pandit_id",
    "plan_id",
    "subscription_plan_price_id",
    "billing_interval",
    "duration_days",
    "status",
    "starts_at",
    "expires_at",
    "lead_limit",
    "leads_used",
    "price_amount",
    "currency",
    "service_limit",
    "service_area_limit",
    "gallery_limit",
    "video_limit",
    "program_limit",
    "auto_renew",
    "listing_enabled",
    "featured_listing",
    "priority_support",
    "verification_badge",
    "analytics_access",
    "homepage_promotion",
    "live_aarti_enabled",
    "enhanced_seo",
    "enhanced_profile",
    "whatsapp_enquiry",
    "search_visibility",
    "analytics_level",
    "plan_snapshot_json",
    "payment_order_id",
    "payment_id",
  ],

  temple_subscriptions: [
    "temple_id",
    "manager_user_id",
    "plan_id",
    "subscription_plan_price_id",
    "billing_interval",
    "duration_days",
    "status",
    "starts_at",
    "expires_at",
    "lead_limit",
    "leads_used",
    "price_amount",
    "currency",
    "service_limit",
    "service_area_limit",
    "gallery_limit",
    "video_limit",
    "program_limit",
    "auto_renew",
    "listing_enabled",
    "featured_listing",
    "priority_support",
    "verification_badge",
    "analytics_access",
    "homepage_promotion",
    "live_aarti_enabled",
    "enhanced_seo",
    "enhanced_profile",
    "whatsapp_enquiry",
    "search_visibility",
    "analytics_level",
    "plan_snapshot_json",
    "payment_order_id",
    "payment_id",
  ],

  ashram_subscriptions: [
    "ashram_id",
    "manager_user_id",
    "plan_id",
    "subscription_plan_price_id",
    "billing_interval",
    "duration_days",
    "status",
    "starts_at",
    "expires_at",
    "lead_limit",
    "leads_used",
    "price_amount",
    "currency",
    "service_limit",
    "service_area_limit",
    "gallery_limit",
    "video_limit",
    "program_limit",
    "auto_renew",
    "listing_enabled",
    "featured_listing",
    "priority_support",
    "verification_badge",
    "analytics_access",
    "homepage_promotion",
    "live_aarti_enabled",
    "enhanced_seo",
    "enhanced_profile",
    "whatsapp_enquiry",
    "search_visibility",
    "analytics_level",
    "plan_snapshot_json",
    "payment_order_id",
    "payment_id",
  ],

  form_definitions: [
    "form_key",
    "capture_mode",
    "requires_phone_verification",
    "creates_lead",
  ],

  form_submissions: [
    "form_key",
    "capture_session_id",
    "user_id",
    "visitor_id",
    "lead_id",
  ],

  subscription_events: [
    "subscription_type",
    "subscription_id",
    "payment_order_id",
    "payment_id",
    "user_id",
    "event_type",
    "old_status",
    "new_status",
    "old_expires_at",
    "new_expires_at",
    "notes",
    "metadata_json",
  ],

  payment_orders: [
    "order_number",
    "user_id",
    "plan_id",
    "subscription_plan_price_id",
    "pandit_subscription_id",
    "temple_subscription_id",
    "ashram_subscription_id",
    "booking_id",
    "purpose",
    "amount",
    "amount_paise",
    "currency",
    "provider",
    "provider_order_id",
    "status",
    "receipt",
    "notes_json",
    "metadata_json",
    "expires_at",
  ],

  payments: [
    "payment_number",
    "pandit_id",
    "temple_id",
    "ashram_id",
    "pandit_subscription_id",
    "temple_subscription_id",
    "ashram_subscription_id",
    "subscription_id",
    "plan_id",
    "subscription_plan_price_id",
    "booking_id",
    "payment_order_id",
    "purpose",
    "entity_type",
    "entity_id",
    "amount",
    "amount_paise",
    "currency",
    "provider",
    "provider_order_id",
    "provider_payment_id",
    "provider_signature",
    "idempotency_key",
    "status",
    "payment_method",
    "paid_at",
    "failed_at",
    "failure_reason",
    "refund_amount_paise",
    "refunded_at",
    "receipt",
    "checkout_payload_json",
    "metadata_json",
  ],

  payment_links: [
    "link_number",
    "user_id",
    "plan_id",
    "subscription_plan_price_id",
    "pandit_subscription_id",
    "temple_subscription_id",
    "ashram_subscription_id",
    "purpose",
    "amount",
    "amount_paise",
    "currency",
    "provider",
    "provider_link_id",
    "provider_link_url",
    "status",
    "short_url",
    "expire_by",
    "metadata_json",
  ],

  payment_webhook_events: [
    "provider",
    "provider_event_id",
    "event_type",
    "signature",
    "payload_json",
    "payload_hash",
    "status",
    "processed_at",
    "error_message",
    "received_at",
  ],

  leads: [
    "user_id",
    "visitor_id",
    "session_id",
    "source_submission_id",
    "status",
  ],

  lead_capture_sessions: [
    "capture_key",
    "capture_surface",
    "module",
    "verification_provider",
    "verification_status",
    "status",
    "lead_id",
  ],

  lead_capture_signals: [
    "lead_id",
    "capture_session_id",
    "ai_conversation_id",
    "signal_type",
    "signal_key",
    "confidence",
  ],

  lead_assignments: [
    "lead_id",
    "pandit_id",
    "assigned_to_user_id",
    "subscription_id",
    "pandit_subscription_id",
    "temple_subscription_id",
    "ashram_subscription_id",
    "lead_credit_used",
    "credit_consumed_at",
  ],

  web_visitors: [
    "visitor_key",
    "user_id",
    "visitor_type",
    "tracking_status",
    "first_seen_at",
    "last_seen_at",
    "last_activity_at",
    "analytics_consent",
  ],

  web_sessions: [
    "session_key",
    "visitor_id",
    "user_id",
    "request_id",
    "started_at",
    "last_activity_at",
  ],

  web_page_views: [
    "visitor_id",
    "session_id",
    "user_id",
    "path",
    "entered_at",
  ],

  web_events: [
    "visitor_id",
    "session_id",
    "page_view_id",
    "user_id",
    "request_id",
    "event_name",
    "occurred_at",
  ],

  web_conversions: [
    "session_id",
    "visitor_id",
  ],

  ai_conversations: [
    "conversation_key",
    "role_context",
    "status",
    "lead_score",
    "primary_entity_type",
    "primary_entity_id",
  ],

  ai_messages: [
    "conversation_id",
    "sequence_no",
    "sender_type",
    "content_type",
    "message_text",
  ],

  ai_recommendations: [
    "conversation_id",
    "recommendation_type",
    "entity_type",
    "entity_id",
    "confidence",
    "status",
  ],

  seo_location_pages: [
    "location_id",
    "location_level",
    "entity_type",
    "path",
    "status",
    "is_indexable",
  ],

  content_sync_registry: [
    "content_type",
    "source_file",
    "source_key",
    "sync_status",
    "last_synced_at",
  ],
};

const REQUIRED_INDEXES: Record<string, string[]> = {
  ashram_manager_profiles: [
    "idx_ashram_manager_profiles_user",
    "idx_ashram_manager_profiles_status",
  ],
  ashram_manager_assignments: [
    "idx_ashram_manager_assignments_ashram",
    "idx_ashram_manager_assignments_manager",
    "idx_ashram_manager_assignments_assigned_by",
  ],
  subscription_plan_prices: ["idx_subscription_plan_prices_plan"],
  lead_capture_sessions: ["idx_lead_capture_sessions_status"],
  ai_messages: ["idx_ai_messages_conversation"],
  pandit_subscriptions: ["idx_one_active_subscription_per_pandit"],
  temple_subscriptions: ["idx_one_active_subscription_per_temple"],
  ashram_subscriptions: ["idx_one_active_subscription_per_ashram"],
  payment_orders: ["idx_payment_orders_provider_order"],
  payments: ["idx_payments_provider_payment_unique"],
};

const REQUIRED_UNIQUE_INDEX_COLUMNS: Array<{
  tableName: string;
  columns: string[];
  label: string;
}> = [
  {
    tableName: "auth_identities",
    columns: ["provider", "provider_subject"],
    label: "auth_identities.(provider, provider_subject)",
  },
  {
    tableName: "ashram_manager_profiles",
    columns: ["user_id"],
    label: "ashram_manager_profiles.user_id",
  },
  {
    tableName: "ashram_manager_assignments",
    columns: ["ashram_id", "manager_user_id"],
    label: "ashram_manager_assignments.(ashram_id, manager_user_id)",
  },
  {
    tableName: "payment_orders",
    columns: ["provider_order_id"],
    label: "payment_orders.provider_order_id",
  },
  {
    tableName: "payment_orders",
    columns: ["order_number"],
    label: "payment_orders.order_number",
  },
  {
    tableName: "payments",
    columns: ["provider", "provider_payment_id"],
    label: "payments.(provider, provider_payment_id)",
  },
  {
    tableName: "payments",
    columns: ["idempotency_key"],
    label: "payments.idempotency_key",
  },
  {
    tableName: "payment_webhook_events",
    columns: ["provider", "provider_event_id"],
    label: "payment_webhook_events.(provider, provider_event_id)",
  },
];

const REQUIRED_ROLE_PERMISSIONS: Record<string, string[]> = {
  ashram_manager: [
    "auth.view_profile",
    "auth.edit_profile",
    "ashram.view",
    "ashram.manage_assigned",
    "ashram.view_leads",
    "ashram.manage_programs",
    "ashram.manage_subscription",
  ],
  sales: [
    "sales.view_ashrams",
    "sales.manage_ashram_subscriptions",
  ],
  super_admin: [
    "admin.manage_ashram_managers",
    "admin.manage_ashrams",
  ],
};


/*
|--------------------------------------------------------------------------
| Verification helpers
|--------------------------------------------------------------------------
*/

function verifyRequiredTables(database: Database.Database): void {
  const statement = database.prepare(`
    SELECT 1 AS present
    FROM sqlite_master
    WHERE type = 'table'
      AND name = ?
    LIMIT 1
  `);

  const missing = REQUIRED_TABLES.filter((tableName) => !statement.get(tableName));

  if (missing.length > 0) {
    throw new Error(
      `SQLite final architecture is incomplete. Missing table(s): ${missing.join(", ")}. Run: npx tsx server/db/migrate.ts`,
    );
  }
}

function verifyRequiredViews(database: Database.Database): void {
  const missing = REQUIRED_VIEWS.filter((viewName) => !viewExists(database, viewName));

  if (missing.length > 0) {
    throw new Error(
      `SQLite final architecture is incomplete. Missing view(s): ${missing.join(", ")}. Run: npx tsx server/db/migrate.ts`,
    );
  }
}

function verifyRequiredColumns(database: Database.Database): void {
  for (const [tableName, columns] of Object.entries(REQUIRED_COLUMNS)) {
    const existing = getTableColumns(database, tableName);
    const missing = columns.filter((columnName) => !existing.has(columnName));

    if (missing.length > 0) {
      throw new Error(
        `SQLite final architecture is incomplete. Missing column(s) in ${tableName}: ${missing.join(", ")}. Run: npx tsx server/db/migrate.ts`,
      );
    }
  }
}

function verifyRequiredIndexes(database: Database.Database): void {
  for (const [tableName, indexes] of Object.entries(REQUIRED_INDEXES)) {
    const existing = getIndexes(database, tableName);
    const missing = indexes.filter((indexName) => !existing.has(indexName));

    if (missing.length > 0) {
      throw new Error(
        `SQLite final architecture is incomplete. Missing index(es) on ${tableName}: ${missing.join(", ")}. Run: npx tsx server/db/migrate.ts`,
      );
    }
  }
}

function verifyRequiredUniqueIndexes(database: Database.Database): void {
  for (const requirement of REQUIRED_UNIQUE_INDEX_COLUMNS) {
    const indexes = database.pragma(
      `index_list(${quoteIdentifier(requirement.tableName)})`,
    ) as Array<{
      name: string;
      unique: number;
    }>;

    const expectedColumns = requirement.columns;
    const found = indexes.some((index) => {
      if (Number(index.unique) !== 1) {
        return false;
      }

      const columns = database.pragma(
        `index_info(${quoteIdentifier(index.name)})`,
      ) as Array<{ seqno: number; name: string | null }>;

      const orderedColumns = columns
        .sort((a, b) => a.seqno - b.seqno)
        .map((column) => column.name);

      return (
        orderedColumns.length === expectedColumns.length &&
        orderedColumns.every((column, position) => column === expectedColumns[position])
      );
    });

    if (!found) {
      throw new Error(
        `SQLite final architecture is incomplete. Required unique constraint/index missing for ${requirement.label}. Run: npx tsx server/db/migrate.ts`,
      );
    }
  }
}

function verifyRoles(database: Database.Database): void {
  const rows = database
    .prepare(
      `
      SELECT
        code,
        public_registration_enabled,
        approval_required,
        dashboard_path,
        is_system,
        is_active
      FROM roles
      WHERE code IN (${REQUIRED_ROLE_CODES.map(() => "?").join(", ")})
      `,
    )
    .all(...REQUIRED_ROLE_CODES) as Array<{
    code: string;
    public_registration_enabled: number;
    approval_required: number;
    dashboard_path: string | null;
    is_system: number;
    is_active: number;
  }>;

  const byCode = new Map(rows.map((row) => [row.code, row]));
  const missing = REQUIRED_ROLE_CODES.filter((code) => !byCode.has(code));

  if (missing.length > 0) {
    throw new Error(
      `Required role(s) missing: ${missing.join(", ")}. Run: npx tsx server/db/migrate.ts`,
    );
  }

  const publicRoleSet = database
    .prepare(`
      SELECT code
      FROM roles
      WHERE public_registration_enabled = 1
        AND is_active = 1
      ORDER BY id
    `)
    .all() as Array<{ code: string }>;

  const actualPublicRoleSet = publicRoleSet.map((row) => row.code).join(",");
  const expectedPublicRoleSet = "visitor,pandit,temple_manager,ashram_manager";

  if (actualPublicRoleSet !== expectedPublicRoleSet) {
    throw new Error(
      `Unexpected public registration role set. Expected ${expectedPublicRoleSet}, received ${actualPublicRoleSet}. Run: npx tsx server/db/migrate.ts`,
    );
  }

  const internalRoles = database
    .prepare(`
      SELECT code
      FROM roles
      WHERE public_registration_enabled = 0
        AND is_active = 1
        AND code IN ('sales', 'super_admin')
      ORDER BY id
    `)
    .all() as Array<{ code: string }>;

  if (internalRoles.map((row) => row.code).join(",") !== "sales,super_admin") {
    throw new Error(
      "Sales and Super Admin must remain internal-only accounts. Run: npx tsx server/db/migrate.ts",
    );
  }

  const expected: Record<string, Omit<(typeof rows)[number], "code">> = {
    visitor: {
      public_registration_enabled: 1,
      approval_required: 0,
      dashboard_path: "/dashboard",
      is_system: 1,
      is_active: 1,
    },
    pandit: {
      public_registration_enabled: 1,
      approval_required: 1,
      dashboard_path: "/pandit/dashboard",
      is_system: 1,
      is_active: 1,
    },
    temple_manager: {
      public_registration_enabled: 1,
      approval_required: 1,
      dashboard_path: "/temple/dashboard",
      is_system: 1,
      is_active: 1,
    },
    ashram_manager: {
      public_registration_enabled: 1,
      approval_required: 1,
      dashboard_path: "/ashram/dashboard",
      is_system: 1,
      is_active: 1,
    },
    sales: {
      public_registration_enabled: 0,
      approval_required: 0,
      dashboard_path: "/sales/dashboard",
      is_system: 1,
      is_active: 1,
    },
    super_admin: {
      public_registration_enabled: 0,
      approval_required: 0,
      dashboard_path: "/admin",
      is_system: 1,
      is_active: 1,
    },
  };

  for (const code of REQUIRED_ROLE_CODES) {
    const row = byCode.get(code)!;
    const expectation = expected[code];

    for (const key of Object.keys(expectation) as Array<keyof typeof expectation>) {
      if (row[key] !== expectation[key]) {
        throw new Error(
          `Role configuration mismatch for ${code}.${String(key)}. Expected ${String(expectation[key])}, received ${String(row[key])}. Run: npx tsx server/db/migrate.ts`,
        );
      }
    }
  }
}

function verifyAshramManagerArchitecture(database: Database.Database): void {
  const invalidProfiles = database
    .prepare(`
      SELECT COUNT(*) AS count
      FROM ashram_manager_profiles
      WHERE verification_status NOT IN ('pending', 'verified', 'rejected', 'suspended')
    `)
    .get() as { count?: number } | undefined;

  if (Number(invalidProfiles?.count ?? 0) > 0) {
    throw new Error(
      "ashram_manager_profiles contains an unsupported verification_status value. Resolve data before starting the API.",
    );
  }

  const invalidAssignments = database
    .prepare(`
      SELECT COUNT(*) AS count
      FROM ashram_manager_assignments
      WHERE status NOT IN ('active', 'inactive', 'revoked')
    `)
    .get() as { count?: number } | undefined;

  if (Number(invalidAssignments?.count ?? 0) > 0) {
    throw new Error(
      "ashram_manager_assignments contains an unsupported status value. Resolve data before starting the API.",
    );
  }

  const orphanAssignments = database
    .prepare(`
      SELECT COUNT(*) AS count
      FROM ashram_manager_assignments AS a
      LEFT JOIN ashrams AS h ON h.id = a.ashram_id
      LEFT JOIN users AS u ON u.id = a.manager_user_id
      WHERE h.id IS NULL OR u.id IS NULL
    `)
    .get() as { count?: number } | undefined;

  if (Number(orphanAssignments?.count ?? 0) > 0) {
    throw new Error(
      `ashram_manager_assignments contains ${Number(orphanAssignments?.count ?? 0)} orphan reference(s). Resolve data before starting the API.`,
    );
  }

  const invalidAssignmentManagers = database
    .prepare(`
      SELECT COUNT(*) AS count
      FROM ashram_manager_assignments AS a
      JOIN users AS u ON u.id = a.manager_user_id
      JOIN roles AS r ON r.id = u.role_id
      WHERE r.code <> 'ashram_manager'
    `)
    .get() as { count?: number } | undefined;

  if (Number(invalidAssignmentManagers?.count ?? 0) > 0) {
    throw new Error(
      "One or more ashram_manager_assignments rows are linked to a user without the ashram_manager role.",
    );
  }

  const invalidSubscriptionManagers = database
    .prepare(`
      SELECT COUNT(*) AS count
      FROM ashram_subscriptions AS s
      JOIN users AS u ON u.id = s.manager_user_id
      JOIN roles AS r ON r.id = u.role_id
      WHERE r.code <> 'ashram_manager'
    `)
    .get() as { count?: number } | undefined;

  if (Number(invalidSubscriptionManagers?.count ?? 0) > 0) {
    throw new Error(
      "One or more ashram_subscriptions rows are linked to a user without the ashram_manager role.",
    );
  }

  const rolePermissionRows = database
    .prepare(`
      SELECT
        r.code AS role_code,
        p.code AS permission_code
      FROM role_permissions AS rp
      JOIN roles AS r ON r.id = rp.role_id
      JOIN permissions AS p ON p.id = rp.permission_id
      WHERE r.code IN ('ashram_manager', 'sales', 'super_admin')
    `)
    .all() as Array<{ role_code: string; permission_code: string }>;

  const permissionsByRole = new Map<string, Set<string>>();
  for (const row of rolePermissionRows) {
    const set = permissionsByRole.get(row.role_code) ?? new Set<string>();
    set.add(row.permission_code);
    permissionsByRole.set(row.role_code, set);
  }

  for (const [roleCode, requiredPermissions] of Object.entries(REQUIRED_ROLE_PERMISSIONS)) {
    const granted = permissionsByRole.get(roleCode) ?? new Set<string>();
    const missing = requiredPermissions.filter((permission) => !granted.has(permission));

    if (missing.length > 0) {
      throw new Error(
        `Required permission(s) missing for ${roleCode}: ${missing.join(", ")}. Run: npx tsx server/db/migrate.ts`,
      );
    }
  }

  const managerRole = database
    .prepare(`SELECT id FROM roles WHERE code = 'ashram_manager' LIMIT 1`)
    .get() as { id?: number } | undefined;

  if (!managerRole?.id) {
    throw new Error(
      "Ashram Manager role is missing. Run: npx tsx server/db/migrate.ts",
    );
  }

  const invalidManagerUsers = database
    .prepare(`
      SELECT COUNT(*) AS count
      FROM ashram_manager_profiles AS p
      JOIN users AS u ON u.id = p.user_id
      WHERE u.role_id <> ?
    `)
    .get(managerRole.id) as { count?: number } | undefined;

  if (Number(invalidManagerUsers?.count ?? 0) > 0) {
    throw new Error(
      "One or more ashram_manager_profiles rows are linked to a user without the ashram_manager role.",
    );
  }
}

function verifyRegistrationConfiguration(database: Database.Database): void {
  const row = database
    .prepare(`
      SELECT setting_value, setting_type
      FROM settings
      WHERE setting_key = 'public_registration_roles'
      LIMIT 1
    `)
    .get() as { setting_value?: string; setting_type?: string } | undefined;

  if (!row) {
    throw new Error(
      "public_registration_roles setting is missing. Run: npx tsx server/db/migrate.ts",
    );
  }

  if (row.setting_type !== "json") {
    throw new Error(
      `public_registration_roles must have setting_type=json; received ${String(row.setting_type)}. Run: npx tsx server/db/migrate.ts`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(row.setting_value ?? ""));
  } catch {
    throw new Error(
      "public_registration_roles contains invalid JSON. Run: npx tsx server/db/migrate.ts",
    );
  }

  if (!Array.isArray(parsed) || !parsed.every((value) => typeof value === "string")) {
    throw new Error(
      "public_registration_roles must be a JSON array of role codes. Run: npx tsx server/db/migrate.ts",
    );
  }

  const actual = parsed as string[];
  const expected = ["visitor", "pandit", "temple_manager", "ashram_manager"];

  if (actual.join(",") !== expected.join(",")) {
    throw new Error(
      `Unexpected public registration role setting. Expected ${expected.join(",")}, received ${actual.join(",")}. Run: npx tsx server/db/migrate.ts`,
    );
  }
}

function verifyJsonArray(value: unknown, context: string): void {
  if (typeof value !== "string") {
    throw new Error(`${context} must be stored as JSON text.`);
  }

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      throw new Error("not an array");
    }
  } catch {
    throw new Error(`${context} contains invalid JSON array data. Run: npx tsx server/db/migrate.ts`);
  }
}

function verifySubscriptionPlans(database: Database.Database): void {
  const rows = database
    .prepare(
      `
      SELECT
        code,
        audience,
        name,
        price_amount,
        lead_limit,
        service_limit,
        service_area_limit,
        gallery_limit,
        video_limit,
        program_limit,
        listing_enabled,
        featured_listing,
        priority_support,
        verification_badge,
        analytics_access,
        homepage_promotion,
        live_aarti_enabled,
        enhanced_seo,
        enhanced_profile,
        whatsapp_enquiry,
        search_visibility,
        analytics_level,
        billing_interval,
        duration_days,
        currency,
        plan_features_json,
        razorpay_plan_id,
        sort_order,
        is_active
      FROM subscription_plans
      WHERE is_active = 1
      `,
    )
    .all() as Array<Record<string, unknown>>;

  const byCode = new Map(rows.map((row) => [String(row.code), row]));
  const missing = REQUIRED_ACTIVE_PLAN_CODES.filter((code) => !byCode.has(code));

  if (missing.length > 0) {
    throw new Error(
      `Required active subscription plan(s) missing: ${missing.join(", ")}. Run: npx tsx server/db/migrate.ts`,
    );
  }

  const duplicateActive = database
    .prepare(`
      SELECT audience, name, COUNT(*) AS count
      FROM subscription_plans
      WHERE is_active = 1
      GROUP BY audience, name
      HAVING COUNT(*) > 1
    `)
    .all() as Array<{ audience: string; name: string; count: number }>;

  if (duplicateActive.length > 0) {
    throw new Error(
      `Duplicate active subscription plan names detected: ${duplicateActive
        .map((row) => `${row.audience}:${row.name}`)
        .join(", ")}`,
    );
  }

  for (const expected of FINAL_PLAN_EXPECTATIONS) {
    const row = byCode.get(expected.code);

    if (!row) {
      throw new Error(`Expected plan ${expected.code} is not active.`);
    }

    const fields: Array<keyof PlanExpectation> = [
      "audience",
      "name",
      "price_amount",
      "lead_limit",
      "service_limit",
      "service_area_limit",
      "gallery_limit",
      "video_limit",
      "program_limit",
      "listing_enabled",
      "featured_listing",
      "priority_support",
      "verification_badge",
      "analytics_access",
      "homepage_promotion",
      "live_aarti_enabled",
      "enhanced_seo",
      "enhanced_profile",
      "whatsapp_enquiry",
      "search_visibility",
      "analytics_level",
    ];

    for (const field of fields) {
      if (row[field] !== expected[field]) {
        throw new Error(
          `Subscription plan mismatch for ${expected.code}.${String(field)}. Expected ${String(expected[field])}, received ${String(row[field])}. Run: npx tsx server/db/migrate.ts`,
        );
      }
    }

    if (
      row.billing_interval !== "monthly" ||
      row.duration_days !== 30 ||
      row.currency !== "INR"
    ) {
      throw new Error(
        `Subscription plan ${expected.code} must be monthly INR/30-day billing. Run: npx tsx server/db/migrate.ts`,
      );
    }

    verifyJsonArray(row.plan_features_json, `subscription_plans.${expected.code}.plan_features_json`);

    if (Number(row.sort_order) !== (expected.name === "Premium" ? 2 : 1)) {
      throw new Error(
        `Subscription plan ${expected.code}.sort_order is invalid. Expected ${expected.name === "Premium" ? 2 : 1}, received ${String(row.sort_order)}. Run: npx tsx server/db/migrate.ts`,
      );
    }

    if (row.razorpay_plan_id !== null && typeof row.razorpay_plan_id !== "string") {
      throw new Error(
        `Subscription plan ${expected.code}.razorpay_plan_id must be NULL or text. Run: npx tsx server/db/migrate.ts`,
      );
    }
  }

  const activeCount = database
    .prepare(`SELECT COUNT(*) AS count FROM subscription_plans WHERE is_active = 1`)
    .get() as { count?: number } | undefined;

  if (Number(activeCount?.count ?? 0) !== REQUIRED_ACTIVE_PLAN_CODES.length) {
    throw new Error(
      `Expected exactly ${REQUIRED_ACTIVE_PLAN_CODES.length} active commercial subscription plans, found ${Number(activeCount?.count ?? 0)}. Run: npx tsx server/db/migrate.ts`,
    );
  }
}

function verifyPaymentArchitecture(database: Database.Database): void {
  const duplicateIdempotency = database
    .prepare(`
      SELECT idempotency_key, COUNT(*) AS count
      FROM payments
      WHERE idempotency_key IS NOT NULL
        AND TRIM(idempotency_key) <> ''
      GROUP BY idempotency_key
      HAVING COUNT(*) > 1
      LIMIT 1
    `)
    .get() as { idempotency_key?: string; count?: number } | undefined;

  if (duplicateIdempotency) {
    throw new Error(
      `Payment ledger contains duplicate idempotency_key: ${String(duplicateIdempotency.idempotency_key)}. Resolve duplicates before starting the API.`,
    );
  }

  const paymentOrderStatuses = database
    .prepare(`
      SELECT COUNT(*) AS invalid_count
      FROM payment_orders
      WHERE status NOT IN ('created', 'attempted', 'paid', 'failed', 'cancelled', 'expired')
    `)
    .get() as { invalid_count?: number } | undefined;

  if (Number(paymentOrderStatuses?.invalid_count ?? 0) > 0) {
    throw new Error(
      "payment_orders contains an unsupported status value. Run the appropriate migration before starting the API.",
    );
  }

  const paymentStatuses = database
    .prepare(`
      SELECT COUNT(*) AS invalid_count
      FROM payments
      WHERE status NOT IN ('created', 'pending', 'authorized', 'paid', 'captured', 'failed', 'refunded', 'partially_refunded', 'cancelled')
    `)
    .get() as { invalid_count?: number } | undefined;

  if (Number(paymentStatuses?.invalid_count ?? 0) > 0) {
    throw new Error(
      "payments contains an unsupported status value. Run the appropriate migration before starting the API.",
    );
  }

  const paymentLinkStatuses = database
    .prepare(`
      SELECT COUNT(*) AS invalid_count
      FROM payment_links
      WHERE status NOT IN ('created', 'active', 'paid', 'expired', 'cancelled')
    `)
    .get() as { invalid_count?: number } | undefined;

  if (Number(paymentLinkStatuses?.invalid_count ?? 0) > 0) {
    throw new Error(
      "payment_links contains an unsupported status value. Run the appropriate migration before starting the API.",
    );
  }

  const webhookStatuses = database
    .prepare(`
      SELECT COUNT(*) AS invalid_count
      FROM payment_webhook_events
      WHERE status NOT IN ('received', 'processed', 'ignored', 'failed')
    `)
    .get() as { invalid_count?: number } | undefined;

  if (Number(webhookStatuses?.invalid_count ?? 0) > 0) {
    throw new Error(
      "payment_webhook_events contains an unsupported status value. Run the appropriate migration before starting the API.",
    );
  }
}

function verifySubscriptionArchitecture(database: Database.Database): void {
  const activeStatusErrors = database
    .prepare(`
      SELECT 'pandit' AS audience, COUNT(*) AS invalid_count
      FROM pandit_subscriptions
      WHERE status = 'active' AND expires_at IS NULL
      UNION ALL
      SELECT 'temple', COUNT(*)
      FROM temple_subscriptions
      WHERE status = 'active' AND expires_at IS NULL
      UNION ALL
      SELECT 'ashram', COUNT(*)
      FROM ashram_subscriptions
      WHERE status = 'active' AND expires_at IS NULL
    `)
    .all() as Array<{ audience: string; invalid_count: number }>;

  const invalid = activeStatusErrors.filter((row) => Number(row.invalid_count) > 0);

  if (invalid.length > 0) {
    throw new Error(
      `Active subscription(s) without expires_at detected: ${invalid
        .map((row) => `${row.audience}=${row.invalid_count}`)
        .join(", ")}. Resolve data before starting the API.`,
    );
  }
}

function verifyAnonymousVisitorTracking(database: Database.Database): void {
  const visitorsColumns = getTableColumns(database, "web_visitors");
  const sessionsColumns = getTableColumns(database, "web_sessions");

  const requiredVisitorFields = [
    "visitor_key",
    "user_id",
    "visitor_type",
    "tracking_status",
    "analytics_consent",
  ];
  const requiredSessionFields = [
    "session_key",
    "visitor_id",
    "user_id",
    "request_id",
  ];

  const missingVisitors = requiredVisitorFields.filter((field) => !visitorsColumns.has(field));
  const missingSessions = requiredSessionFields.filter((field) => !sessionsColumns.has(field));

  if (missingVisitors.length > 0 || missingSessions.length > 0) {
    throw new Error(
      `Anonymous visitor tracking architecture is incomplete. Missing visitor fields: ${missingVisitors.join(", ") || "none"}; session fields: ${missingSessions.join(", ") || "none"}. Run: npx tsx server/db/migrate.ts`,
    );
  }

  const visitorInfo = database
    .prepare(`PRAGMA table_info(web_visitors)`)
    .all() as Array<{ name: string; notnull: number }>;

  const userIdColumn = visitorInfo.find((column) => column.name === "user_id");

  if (userIdColumn?.notnull === 1) {
    throw new Error(
      "web_visitors.user_id must remain nullable so an unregistered visitor can be tracked.",
    );
  }

  const sessionInfo = database
    .prepare(`PRAGMA table_info(web_sessions)`)
    .all() as Array<{ name: string; notnull: number }>;

  const sessionUserIdColumn = sessionInfo.find(
    (column) => column.name === "user_id",
  );

  if (sessionUserIdColumn?.notnull === 1) {
    throw new Error(
      "web_sessions.user_id must remain nullable so anonymous sessions can be recorded.",
    );
  }

  const orphanSessions = database
    .prepare(`
      SELECT COUNT(*) AS count
      FROM web_sessions AS s
      LEFT JOIN web_visitors AS v ON v.id = s.visitor_id
      WHERE s.visitor_id IS NOT NULL
        AND v.id IS NULL
    `)
    .get() as { count?: number } | undefined;

  if (Number(orphanSessions?.count ?? 0) > 0) {
    throw new Error(
      `web_sessions contains ${Number(orphanSessions?.count ?? 0)} orphan visitor reference(s). Resolve data before starting the API.`,
    );
  }
}

function verifyMigrationMarker(database: Database.Database): void {
  if (!tableExists(database, "schema_migrations")) {
    throw new Error(
      "schema_migrations is missing. The database must be upgraded with server/db/migrate.ts before the server starts.",
    );
  }

  const row = database
    .prepare(`
      SELECT migration_key, version, applied_at
      FROM schema_migrations
      ORDER BY version DESC, id DESC
      LIMIT 1
    `)
    .get() as {
    migration_key?: string;
    version?: number;
    applied_at?: string;
  } | undefined;

  if (!row) {
    throw new Error(
      "schema_migrations contains no migration record. Run: npx tsx server/db/migrate.ts",
    );
  }

  if (Number(row.version ?? 0) < DATABASE_SCHEMA_VERSION) {
    throw new Error(
      `Database migration version ${Number(row.version ?? 0)} is below the final business architecture version ${DATABASE_SCHEMA_VERSION}. Run: npx tsx server/db/migrate.ts`,
    );
  }

  if (Number(row.version) === DATABASE_SCHEMA_VERSION && row.migration_key !== DATABASE_MIGRATION_KEY) {
    throw new Error(
      `Database migration marker mismatch for version ${DATABASE_SCHEMA_VERSION}. Expected ${DATABASE_MIGRATION_KEY}, received ${String(row.migration_key)}. Run: npx tsx server/db/migrate.ts`,
    );
  }

  const pragmaVersion = Number(database.pragma("user_version", { simple: true }) ?? 0);

  if (pragmaVersion < DATABASE_SCHEMA_VERSION) {
    throw new Error(
      `SQLite PRAGMA user_version ${pragmaVersion} is below ${DATABASE_SCHEMA_VERSION}. Run: npx tsx server/db/migrate.ts`,
    );
  }
}



function verifyAuthIdentityArchitecture(database: Database.Database): void {
  const rows = database
    .prepare(`
      SELECT provider, identity_type, provider_subject, status
      FROM auth_identities
    `)
    .all() as Array<{
      provider: string;
      identity_type: string;
      provider_subject: string;
      status: string;
    }>;

  for (const row of rows) {
    if (!String(row.provider ?? "").trim() || !String(row.provider_subject ?? "").trim()) {
      throw new Error("auth_identities contains an empty provider/provider_subject identity.");
    }

    if (!["phone", "email", "other"].includes(row.identity_type)) {
      throw new Error("auth_identities contains an unsupported identity_type value.");
    }

    if (!["pending", "verified", "revoked"].includes(row.status)) {
      throw new Error("auth_identities contains an unsupported status value.");
    }
  }

  const duplicate = database
    .prepare(`
      SELECT provider, provider_subject, COUNT(*) AS count
      FROM auth_identities
      GROUP BY provider, provider_subject
      HAVING COUNT(*) > 1
      LIMIT 1
    `)
    .get() as { provider?: string; provider_subject?: string; count?: number } | undefined;

  if (duplicate) {
    throw new Error(
      `auth_identities contains duplicate provider identity ${String(duplicate.provider)}:${String(duplicate.provider_subject)}.`,
    );
  }
}

function verifyPhase1Architecture(database: Database.Database): void {
  const captureForms = [
    "temple_detail_gate",
    "pandit_detail_gate",
    "puja_detail_gate",
    "ashram_detail_gate",
    "yatra_detail_gate",
    "spiritual_place_detail_gate",
    "event_detail_gate",
    "course_detail_gate",
    "kundli_capture",
  ];

  const placeholders = captureForms.map(() => "?").join(",");
  const rows = database
    .prepare(`
      SELECT
        form_key,
        capture_mode,
        requires_phone_verification,
        creates_lead,
        is_active
      FROM form_definitions
      WHERE form_key IN (${placeholders})
    `)
    .all(...captureForms) as Array<{
    form_key: string;
    capture_mode: string;
    requires_phone_verification: number;
    creates_lead: number;
    is_active: number;
  }>;

  const map = new Map(rows.map((row) => [row.form_key, row]));

  for (const key of captureForms) {
    const row = map.get(key);
    if (
      !row ||
      row.capture_mode !== "detail_gate" ||
      Number(row.requires_phone_verification) !== 1 ||
      Number(row.creates_lead) !== 1 ||
      Number(row.is_active) !== 1
    ) {
      throw new Error(
        `Required Phase 1 lead-capture form is missing or misconfigured: ${key}. Run: npx tsx server/db/migrate.ts`,
      );
    }
  }

  const captureSessionColumns = getTableColumns(database, "lead_capture_sessions");
  const requiredCaptureSessionColumns = [
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
  ];
  const missingCaptureColumns = requiredCaptureSessionColumns.filter(
    (column) => !captureSessionColumns.has(column),
  );
  if (missingCaptureColumns.length > 0) {
    throw new Error(
      `Phase 1 database architecture is incomplete. lead_capture_sessions is missing: ${missingCaptureColumns.join(", ")}. Run: npx tsx server/db/migrate.ts`,
    );
  }

  const submissionColumns = getTableColumns(database, "form_submissions");
  const requiredSubmissionColumns = [
    "form_key",
    "capture_session_id",
    "user_id",
    "visitor_id",
    "lead_id",
  ];
  const missingSubmissionColumns = requiredSubmissionColumns.filter(
    (column) => !submissionColumns.has(column),
  );
  if (missingSubmissionColumns.length > 0) {
    throw new Error(
      `Phase 1 database architecture is incomplete. form_submissions is missing: ${missingSubmissionColumns.join(", ")}. Run: npx tsx server/db/migrate.ts`,
    );
  }

  const canonicalPriceRows = database
    .prepare(`
      SELECT
        sp.code,
        sp.price_amount AS plan_price,
        sp.currency AS plan_currency,
        sp.billing_interval AS plan_interval,
        sp.duration_days AS plan_duration,
        spp.price_amount AS variant_price,
        spp.currency AS variant_currency,
        spp.billing_interval AS variant_interval,
        spp.duration_days AS variant_duration,
        spp.is_active AS variant_active
      FROM subscription_plans sp
      JOIN subscription_plan_prices spp
        ON spp.plan_id = sp.id
       AND spp.billing_interval = 'monthly'
       AND spp.is_active = 1
      WHERE sp.is_active = 1
        AND sp.code IN (${REQUIRED_ACTIVE_PLAN_CODES.map(() => "?").join(",")})
    `)
    .all(...REQUIRED_ACTIVE_PLAN_CODES) as Array<Record<string, unknown>>;

  const byCode = new Map(canonicalPriceRows.map((row) => [String(row.code), row]));

  for (const expected of FINAL_PLAN_EXPECTATIONS) {
    const row = byCode.get(expected.code);
    if (!row) {
      throw new Error(
        `Monthly subscription price variant missing for ${expected.code}. Run: npx tsx server/db/migrate.ts`,
      );
    }

    if (
      Number(row.plan_price) !== expected.price_amount ||
      Number(row.variant_price) !== expected.price_amount ||
      String(row.plan_currency) !== "INR" ||
      String(row.variant_currency) !== "INR" ||
      String(row.plan_interval) !== "monthly" ||
      String(row.variant_interval) !== "monthly" ||
      Number(row.plan_duration) !== 30 ||
      Number(row.variant_duration) !== 30 ||
      Number(row.variant_active) !== 1
    ) {
      throw new Error(
        `Monthly subscription price mismatch for ${expected.code}. Run: npx tsx server/db/migrate.ts`,
      );
    }
  }
}

function verifyFinalArchitecture(database: Database.Database): void {
  verifyRequiredTables(database);
  verifyRequiredViews(database);
  verifyRequiredColumns(database);
  verifyRequiredIndexes(database);
  verifyRequiredUniqueIndexes(database);
  verifyRoles(database);
  verifyAshramManagerArchitecture(database);
  verifyRegistrationConfiguration(database);
  verifySubscriptionPlans(database);
  verifySubscriptionArchitecture(database);
  verifyPaymentArchitecture(database);
  verifyAnonymousVisitorTracking(database);
  verifyAuthIdentityArchitecture(database);
  verifyPhase1Architecture(database);
  verifyMigrationMarker(database);
  verifyIntegrity(database);
  verifyForeignKeys(database);
}

function verifyIntegrity(database: Database.Database): void {
  const row = database
    .prepare("PRAGMA integrity_check")
    .get() as { integrity_check?: string } | undefined;

  if (row?.integrity_check !== "ok") {
    throw new Error(
      `SQLite integrity_check failed: ${String(row?.integrity_check ?? "unknown error")}`,
    );
  }
}

function verifyForeignKeys(database: Database.Database): void {
  database.pragma("foreign_keys = ON");

  const errors = database.pragma("foreign_key_check") as Array<unknown>;

  if (errors.length > 0) {
    const preview = errors
      .slice(0, 10)
      .map((entry) => JSON.stringify(entry))
      .join("; ");

    throw new Error(
      `SQLite foreign-key check failed with ${errors.length} violation(s): ${preview}`,
    );
  }
}

/*
|--------------------------------------------------------------------------
| Initialization
|--------------------------------------------------------------------------
*/

function initializeDatabase(): Database.Database {
  ensureDatabaseDirectory();

  const shouldBootstrap = isNewOrEmptyDatabase(databasePath);
  const database = new Database(databasePath);

  try {
    /*
     * Configure the connection before any application SQL executes.
     */
    configureDatabase(database);

    if (shouldBootstrap) {
      console.log(
        "[DivyaDhara DB] Creating new SQLite database from schema.sql...",
      );

      bootstrapFreshDatabase(database);

      /*
       * Fresh databases must pass the same complete verification gate as
       * existing production databases. This catches accidental schema.sql
       * drift immediately instead of after deployment.
       */
      verifyFinalArchitecture(database);
      return database;
    }

    /*
     * Existing DBs are never silently migrated here. This is deliberate.
     */
    if (!tableExists(database, "users")) {
      throw new Error(
        "SQLite database exists but does not contain the expected application schema. Run: npx tsx server/db/migrate.ts",
      );
    }

    verifyFinalArchitecture(database);

    return database;
  } catch (error) {
    if (database.open) {
      try {
        database.close();
      } catch {
        // Ignore cleanup errors during failed initialization.
      }
    }

    throw error;
  }
}

/*
|--------------------------------------------------------------------------
| Shared connection
|--------------------------------------------------------------------------
*/

export const db = initializeDatabase();

/*
|--------------------------------------------------------------------------
| Connection helpers
|--------------------------------------------------------------------------
*/

export function isDatabaseConnected(): boolean {
  if (!db.open) {
    return false;
  }

  try {
    db.prepare("SELECT 1").get();
    return true;
  } catch {
    return false;
  }
}

export function getDatabaseStats(): {
  connected: boolean;
  file: string;
  sizeBytes: number;
  tableCount: number;
  viewCount: number;
  migrationVersion: number;
  activePlans: number;
} {
  if (!db.open) {
    return {
      connected: false,
      file: databasePath,
      sizeBytes: 0,
      tableCount: 0,
      viewCount: 0,
      migrationVersion: 0,
      activePlans: 0,
    };
  }

  try {
    const tableRow = db
      .prepare(`
        SELECT COUNT(*) AS count
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
      `)
      .get() as { count?: number } | undefined;

    const viewRow = db
      .prepare(`
        SELECT COUNT(*) AS count
        FROM sqlite_master
        WHERE type = 'view'
          AND name NOT LIKE 'sqlite_%'
      `)
      .get() as { count?: number } | undefined;

    const migrationRow = tableExists(db, "schema_migrations")
      ? (db
          .prepare(`
            SELECT COALESCE(MAX(version), 0) AS version
            FROM schema_migrations
          `)
          .get() as { version?: number } | undefined)
      : undefined;

    const activePlanRow = tableExists(db, "subscription_plans")
      ? (db
          .prepare(`
            SELECT COUNT(*) AS count
            FROM subscription_plans
            WHERE is_active = 1
          `)
          .get() as { count?: number } | undefined)
      : undefined;

    let sizeBytes = 0;
    try {
      sizeBytes = statSync(databasePath).size;
    } catch {
      // File may disappear during an external operational action.
    }

    return {
      connected: true,
      file: databasePath,
      sizeBytes,
      tableCount: Number(tableRow?.count ?? 0),
      viewCount: Number(viewRow?.count ?? 0),
      migrationVersion: Number(migrationRow?.version ?? 0),
      activePlans: Number(activePlanRow?.count ?? 0),
    };
  } catch {
    return {
      connected: false,
      file: databasePath,
      sizeBytes: 0,
      tableCount: 0,
      viewCount: 0,
      migrationVersion: 0,
      activePlans: 0,
    };
  }
}

export function closeDatabase(): void {
  if (!db.open) {
    return;
  }

  try {
    db.close();
  } catch (error) {
    console.error("Failed to close SQLite database:", error);
  }
}

/*
|--------------------------------------------------------------------------
| Default export
|--------------------------------------------------------------------------
*/

export default db;
