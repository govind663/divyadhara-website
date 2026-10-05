import "dotenv/config";

import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";

import { closeDatabase, db } from "../db/database.ts";

/*
|--------------------------------------------------------------------------
| DivyaDhara Sales Account Bootstrap
|--------------------------------------------------------------------------
|
| Creates or synchronizes one internal Sales account.
|
| Required environment variables:
|   SALES_NAME
|   SALES_EMAIL
|   SALES_PASSWORD
|
| Optional:
|   SALES_PHONE
|
| The script is intentionally idempotent:
| - Same Sales email => account is synchronized.
| - Email belonging to another role => hard failure.
| - Existing sessions for the Sales account are invalidated after a sync.
| - Passwords are never printed.
| - The complete required Sales permission set is reconciled before the
|   account is created/updated.
|
|--------------------------------------------------------------------------
*/

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;
const NAME_MAX_LENGTH = 150;
const PHONE_MAX_LENGTH = 30;

const SALT_BYTES = 16;
const KEY_LENGTH = 64;

const SCRYPT_OPTIONS = {
  N: 16_384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
};

type RoleRow = {
  id: number;
  code: string;
  is_active: number;
  is_system: number;
  public_registration_enabled: number;
};

type UserRow = {
  id: number;
  name: string;
  email: string;
  status: string;
  role: string;
};

type ProcessResult = {
  operation: "created" | "synchronized";
  userId: number;
};

const REQUIRED_SALES_PERMISSIONS: Array<{
  code: string;
  name: string;
  description: string;
  module: string;
}> = [
  ["auth.view_profile", "View Profile", "View own authenticated profile", "auth"],
  ["auth.edit_profile", "Edit Profile", "Edit own authenticated profile", "auth"],
  ["pandit.view_listing", "View Pandits", "View Pandit listing information", "pandit"],
  ["sales.view_leads", "View Sales Leads", "View sales lead pipeline", "sales"],
  ["sales.manage_leads", "Manage Sales Leads", "Manage sales lead pipeline", "sales"],
  ["sales.view_pandits", "View Pandits", "View Pandit onboarding information", "sales"],
  ["sales.manage_followups", "Manage Follow Ups", "Manage sales follow-up activities", "sales"],
  ["sales.view_ashrams", "View Ashrams", "View Ashram onboarding information", "sales"],
  ["sales.manage_ashram_subscriptions", "Manage Ashram Subscriptions", "Assist with Ashram plan onboarding and subscription management", "sales"],
  ["sales.view_subscriptions", "View Subscriptions", "View commercial subscription status for assigned accounts", "sales"],
  ["ashram.view", "View Ashrams", "View Ashram information", "ashram"],
  ["temple.view", "View Temples", "View temple information", "temple"],
].map(([code, name, description, module]) => ({ code, name, description, module }));

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (value === undefined || value.trim() === "") {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized.slice(0, PHONE_MAX_LENGTH) : null;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateCredentials(credentials: {
  name: string;
  email: string;
  password: string;
  phone: string | null;
}): void {
  if (credentials.name.length < 2) {
    throw new Error("SALES_NAME must contain at least 2 characters.");
  }
  if (credentials.name.length > NAME_MAX_LENGTH) {
    throw new Error(`SALES_NAME cannot exceed ${NAME_MAX_LENGTH} characters.`);
  }
  if (!isValidEmail(credentials.email)) {
    throw new Error("SALES_EMAIL is not a valid email address.");
  }
  if (
    credentials.password.length < MIN_PASSWORD_LENGTH ||
    credentials.password.length > MAX_PASSWORD_LENGTH
  ) {
    throw new Error(
      `SALES_PASSWORD must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH} characters.`,
    );
  }
}

function deriveKey(
  password: string,
  salt: Buffer,
  keyLength: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      keyLength,
      SCRYPT_OPTIONS,
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        if (!Buffer.isBuffer(derivedKey)) {
          reject(new Error("Password derivation failed."));
          return;
        }
        resolve(derivedKey);
      },
    );
  });
}

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derivedKey = await deriveKey(password, salt, KEY_LENGTH);
  return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

function isValidStoredHash(passwordHash: string): boolean {
  return /^[0-9a-f]{32}:[0-9a-f]{128}$/.test(passwordHash);
}

async function verifyPasswordHash(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  if (!isValidStoredHash(passwordHash)) return false;

  const [saltHex, keyHex] = passwordHash.split(":");
  const salt = Buffer.from(saltHex, "hex");
  const expectedKey = Buffer.from(keyHex, "hex");

  if (salt.length !== SALT_BYTES || expectedKey.length !== KEY_LENGTH) {
    return false;
  }

  const derivedKey = await deriveKey(password, salt, KEY_LENGTH);
  return (
    derivedKey.length === expectedKey.length &&
    timingSafeEqual(derivedKey, expectedKey)
  );
}

function tableExists(tableName: string): boolean {
  const row = db
    .prepare(
      `
      SELECT 1 AS ok
      FROM sqlite_master
      WHERE type='table' AND name=?
      LIMIT 1
      `,
    )
    .get(tableName) as { ok?: number } | undefined;
  return Boolean(row?.ok);
}

function getSalesRole(): RoleRow {
  const role = db
    .prepare(
      `
      SELECT
        id,
        code,
        is_active,
        is_system,
        public_registration_enabled
      FROM roles
      WHERE code='sales'
      LIMIT 1
      `,
    )
    .get() as RoleRow | undefined;

  if (!role) {
    throw new Error(
      'Database role "sales" was not found. Run: npx tsx server/db/migrate.ts',
    );
  }
  if (role.code !== "sales") throw new Error("Invalid Sales role configuration.");
  if (Number(role.is_active) !== 1) {
    throw new Error('Database role "sales" is inactive.');
  }
  if (Number(role.is_system) !== 1) {
    throw new Error('Database role "sales" is not marked as a system role.');
  }
  if (Number(role.public_registration_enabled) !== 0) {
    throw new Error("Sales role must remain internal-only and cannot be public registration.");
  }

  return role;
}

function ensureSalesPermissions(roleId: number): void {
  if (!tableExists("permissions") || !tableExists("role_permissions")) {
    throw new Error("RBAC tables are missing. Run: npx tsx server/db/migrate.ts");
  }

  const insertPermission = db.prepare(`
    INSERT OR IGNORE INTO permissions (code, name, description, module)
    VALUES (?, ?, ?, ?)
  `);

  const findPermission = db.prepare(`
    SELECT id
    FROM permissions
    WHERE code=?
    LIMIT 1
  `);

  const grantPermission = db.prepare(`
    INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
    VALUES (?, ?)
  `);

  for (const permission of REQUIRED_SALES_PERMISSIONS) {
    insertPermission.run(
      permission.code,
      permission.name,
      permission.description,
      permission.module,
    );

    const row = findPermission.get(permission.code) as { id?: number } | undefined;
    if (!row?.id) {
      throw new Error(`Unable to resolve Sales permission: ${permission.code}`);
    }

    grantPermission.run(roleId, Number(row.id));
  }
}

function verifySalesPermissions(roleId: number): void {
  const rows = db
    .prepare(`
      SELECT p.code
      FROM role_permissions rp
      JOIN permissions p ON p.id=rp.permission_id
      WHERE rp.role_id=?
    `)
    .all(roleId) as Array<{ code: string }>;

  const granted = new Set(rows.map((row) => row.code));
  const missing = REQUIRED_SALES_PERMISSIONS
    .map((permission) => permission.code)
    .filter((code) => !granted.has(code));

  if (missing.length > 0) {
    throw new Error(
      `Sales role is missing required permission(s): ${missing.join(", ")}.`,
    );
  }
}

function findUserByEmail(email: string): UserRow | undefined {
  return db
    .prepare(`
      SELECT
        u.id,
        u.name,
        u.email,
        u.status,
        r.code AS role
      FROM users u
      JOIN roles r ON r.id=u.role_id
      WHERE LOWER(u.email)=LOWER(?)
      LIMIT 1
    `)
    .get(email) as UserRow | undefined;
}

function createAuditLog(params: {
  userId: number;
  action: string;
  entityId: number;
  operation: "created" | "synchronized";
  sessionsInvalidated: boolean;
}): void {
  if (!tableExists("audit_logs")) {
    throw new Error("audit_logs table is missing. Run: npx tsx server/db/migrate.ts");
  }

  db.prepare(`
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
    )
    VALUES (?, NULL, 'system', ?, 'user', ?, NULL, ?, NULL, ?, CURRENT_TIMESTAMP)
  `).run(
    params.userId,
    params.action,
    params.entityId,
    JSON.stringify({
      role: "sales",
      status: "active",
      source: "create-sales.ts",
      operation: params.operation,
      sessionsInvalidated: params.sessionsInvalidated,
    }),
    "CLI:create-sales",
  );
}

function getEnvironmentCredentials(): {
  name: string;
  email: string;
  password: string;
  phone: string | null;
} {
  return {
    name: normalizeName(getRequiredEnv("SALES_NAME")),
    email: normalizeEmail(getRequiredEnv("SALES_EMAIL")),
    password: getRequiredEnv("SALES_PASSWORD"),
    phone: normalizePhone(process.env.SALES_PHONE),
  };
}

async function createOrSyncSales(): Promise<void> {
  console.log("");
  console.log("==============================================");
  console.log("          DIVYADHARA SALES SETUP");
  console.log("==============================================");
  console.log("Database : SQLite");
  console.log("Role     : sales");
  console.log("Status   : active");
  console.log("==============================================");
  console.log("");

  const role = getSalesRole();
  const credentials = getEnvironmentCredentials();
  validateCredentials(credentials);

  console.log("Ensuring Sales RBAC permissions...");
  db.transaction(() => ensureSalesPermissions(role.id))();
  verifySalesPermissions(role.id);

  const existingUser = findUserByEmail(credentials.email);

  console.log("Creating secure password hash...");
  const passwordHash = await hashPassword(credentials.password);

  const result = db.transaction((): ProcessResult => {
    if (!existingUser) {
      const inserted = db
        .prepare(`
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
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, 'active', NULL, NULL, 'India', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `)
        .run(
          role.id,
          credentials.name,
          credentials.email,
          credentials.phone,
          passwordHash,
        );

      const userId = Number(inserted.lastInsertRowid);

      createAuditLog({
        userId,
        action: "system.sales_bootstrap",
        entityId: userId,
        operation: "created",
        sessionsInvalidated: false,
      });

      return { operation: "created", userId };
    }

    if (existingUser.role !== "sales") {
      throw new Error(
        `The email "${existingUser.email}" is already registered with role "${existingUser.role}". Use a different email for the Sales account.`,
      );
    }

    db.prepare(`
      UPDATE users
      SET
        role_id=?,
        name=?,
        phone=?,
        password_hash=?,
        email_verified_at=COALESCE(email_verified_at, CURRENT_TIMESTAMP),
        status='active',
        country=COALESCE(country, 'India'),
        updated_at=CURRENT_TIMESTAMP
      WHERE id=?
    `).run(
      role.id,
      credentials.name,
      credentials.phone,
      passwordHash,
      existingUser.id,
    );

    if (tableExists("sessions")) {
      db.prepare(`DELETE FROM sessions WHERE user_id=?`).run(existingUser.id);
    }

    createAuditLog({
      userId: existingUser.id,
      action: "system.sales_bootstrap_sync",
      entityId: existingUser.id,
      operation: "synchronized",
      sessionsInvalidated: tableExists("sessions"),
    });

    return { operation: "synchronized", userId: existingUser.id };
  })();

  const finalUser = db
    .prepare(`
      SELECT
        u.id,
        u.name,
        u.email,
        u.status,
        u.password_hash,
        r.code AS role
      FROM users u
      JOIN roles r ON r.id=u.role_id
      WHERE u.id=?
      LIMIT 1
    `)
    .get(result.userId) as (UserRow & { password_hash: string }) | undefined;

  if (!finalUser) throw new Error("Sales account was processed but could not be verified.");
  if (finalUser.role !== "sales") throw new Error('Final account does not have the "sales" role.');
  if (finalUser.status !== "active") throw new Error('Final Sales account is not "active".');
  if (normalizeEmail(finalUser.email) !== credentials.email) {
    throw new Error("Final Sales email does not match the requested account email.");
  }
  if (!isValidStoredHash(finalUser.password_hash)) {
    throw new Error("Final Sales password hash has an invalid format.");
  }

  const passwordVerified = await verifyPasswordHash(
    credentials.password,
    finalUser.password_hash,
  );
  if (!passwordVerified) {
    throw new Error("Final Sales password hash verification failed.");
  }

  verifySalesPermissions(role.id);

  console.log("");
  console.log("==============================================");
  console.log(
    result.operation === "created"
      ? "           SALES CREATED"
      : "       SALES SYNCHRONIZED",
  );
  console.log("==============================================");
  console.log(`User ID : ${finalUser.id}`);
  console.log(`Name    : ${finalUser.name}`);
  console.log(`Email   : ${finalUser.email}`);
  console.log(`Role    : ${finalUser.role}`);
  console.log(`Status  : ${finalUser.status}`);
  console.log("RBAC OK : yes");
  console.log("Hash OK : yes");
  console.log("Password: hidden");
  console.log("==============================================");
  console.log("");
  console.log("Use the normal DivyaDhara /login page to sign in.");
  console.log("");
}

async function main(): Promise<void> {
  try {
    await createOrSyncSales();
    process.exitCode = 0;
  } catch (error) {
    console.error("");
    console.error("Sales setup failed:");
    console.error(error instanceof Error ? error.message : String(error));
    console.error("");
    process.exitCode = 1;
  } finally {
    closeDatabase();
  }
}

void main();
