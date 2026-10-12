interface MixerRow {
  id: number;
  vehicleNumber: string;
  driverName: string;
  tareWeightKg: number;
  tareWeighedAt: string;
  createdAt: string;
  updatedAt: string;
}

interface OperationRow {
  id: number;
  operationDate: string;
  mixerId: number | null;
  vehicleNumber: string;
  driverName: string;
  customerName: string;
  grossWeightKg: number;
  tareWeightKg: number;
  concreteWeightKg: number;
  createdAt: string;
  updatedAt: string;
}

interface D1Result<T> {
  results?: T[];
  meta?: { changes?: number; last_row_id?: number };
}

interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<D1Result<T>>;
  run(): Promise<D1Result<unknown>>;
}

interface D1Database {
  prepare(query: string): D1Statement;
}

interface Env {
  DB: D1Database;
  APP_BASE_PATH?: string;
  ADMIN_USERNAME?: string;
  ADMIN_PASSWORD?: string;
}

interface PagesContext {
  request: Request;
  env: Env;
  next: () => Promise<Response>;
}

const json = (body: unknown, status = 200): Response =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });

const badRequest = (message: string) => json({ error: message }, 400);
const notFound = (message: string) => json({ error: message }, 404);
const conflict = (message: string) => json({ error: message }, 409);
const serverError = (message: string) => json({ error: message }, 500);

const SESSION_COOKIE = "ghad_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_LOCK_SECONDS = 15 * 60;

interface AuthSessionRow {
  expiresAt: number;
}

interface LoginAttemptRow {
  firstAttemptAt: number;
  failureCount: number;
  lockedUntil: number;
}

function normalizeBasePath(value = ""): string {
  const trimmed = value.trim().replace(/^\/+|\/+$/g, "");
  return trimmed ? `/${trimmed}` : "";
}

function adminCredentials(env: Env): { username: string; password: string } | null {
  const username = env.ADMIN_USERNAME?.trim();
  const password = env.ADMIN_PASSWORD;
  if (!username || !password || Array.from(password).length < 14) return null;
  return { username, password };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function constantTimeTextEqual(left: string, right: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [leftDigest, rightDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(left)),
    crypto.subtle.digest("SHA-256", encoder.encode(right)),
  ]);
  const a = new Uint8Array(leftDigest);
  const b = new Uint8Array(rightDigest);
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

function cookieValue(request: Request, name: string): string | null {
  const prefix = `${name}=`;
  const item = (request.headers.get("cookie") ?? "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return item ? item.slice(prefix.length) : null;
}

function cookiePath(basePath: string): string {
  return basePath ? `${basePath}/` : "/";
}

function setSessionCookie(response: Response, token: string, basePath: string): Response {
  response.headers.set(
    "set-cookie",
    `${SESSION_COOKIE}=${token}; Path=${cookiePath(basePath)}; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; Secure; SameSite=Strict`,
  );
  return response;
}

function clearSessionCookie(response: Response, basePath: string): Response {
  response.headers.set(
    "set-cookie",
    `${SESSION_COOKIE}=; Path=${cookiePath(basePath)}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Strict`,
  );
  return response;
}

async function sessionTokenHash(request: Request): Promise<string | null> {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return sha256Hex(token);
}

async function hasActiveSession(db: D1Database, request: Request): Promise<boolean> {
  const tokenHash = await sessionTokenHash(request);
  if (!tokenHash) return false;
  const session = await db
    .prepare("SELECT expires_at AS expiresAt FROM auth_sessions WHERE token_hash = ?")
    .bind(tokenHash)
    .first<AuthSessionRow>();
  if (!session) return false;
  if (session.expiresAt > Math.floor(Date.now() / 1000)) return true;
  await db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(tokenHash).run();
  return false;
}

async function loginClientHash(request: Request): Promise<string> {
  const ipAddress = request.headers.get("cf-connecting-ip")?.trim() || "unknown";
  return sha256Hex(ipAddress);
}

async function activeLoginLockSeconds(
  db: D1Database,
  clientHash: string,
  now: number,
): Promise<number> {
  const row = await db
    .prepare("SELECT locked_until AS lockedUntil FROM auth_login_attempts WHERE client_hash = ?")
    .bind(clientHash)
    .first<Pick<LoginAttemptRow, "lockedUntil">>();
  return row && row.lockedUntil > now ? row.lockedUntil - now : 0;
}

async function recordLoginFailure(
  db: D1Database,
  clientHash: string,
  now: number,
): Promise<number> {
  const current = await db
    .prepare(
      `SELECT first_attempt_at AS firstAttemptAt,
              failure_count AS failureCount,
              locked_until AS lockedUntil
       FROM auth_login_attempts WHERE client_hash = ?`,
    )
    .bind(clientHash)
    .first<LoginAttemptRow>();
  const windowExpired = !current || now - current.firstAttemptAt >= LOGIN_LOCK_SECONDS;
  const previousLockExpired = current?.lockedUntil ? current.lockedUntil <= now : false;
  const resetWindow = windowExpired || previousLockExpired;
  const firstAttemptAt = resetWindow ? now : current.firstAttemptAt;
  const failureCount = resetWindow ? 1 : current.failureCount + 1;
  const lockedUntil = failureCount >= LOGIN_FAILURE_LIMIT ? now + LOGIN_LOCK_SECONDS : 0;

  await db
    .prepare(
      `INSERT INTO auth_login_attempts
         (client_hash, first_attempt_at, failure_count, locked_until)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(client_hash) DO UPDATE SET
         first_attempt_at = excluded.first_attempt_at,
         failure_count = excluded.failure_count,
         locked_until = excluded.locked_until`,
    )
    .bind(clientHash, firstAttemptAt, failureCount, lockedUntil)
    .run();
  return Math.max(0, lockedUntil - now);
}

async function handleAuth(
  context: PagesContext,
  pathname: string,
  basePath: string,
): Promise<Response> {
  const { request, env } = context;
  const method = request.method.toUpperCase();
  const db = env.DB;

  if (pathname === "/api/auth/logout" && method === "POST") {
    const tokenHash = await sessionTokenHash(request);
    if (tokenHash) {
      await db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(tokenHash).run();
    }
    return clearSessionCookie(json({ authenticated: false }), basePath);
  }

  const credentials = adminCredentials(env);
  if (!credentials) {
    return json(
      { error: "إعداد الدخول غير مكتمل. أضف ADMIN_USERNAME وحدد كلمة مرور لا تقل عن 14 حرفًا في ADMIN_PASSWORD ضمن إعدادات Cloudflare Pages." },
      503,
    );
  }

  if (pathname === "/api/auth/session" && method === "GET") {
    return (await hasActiveSession(db, request))
      ? json({ authenticated: true })
      : json({ authenticated: false }, 401);
  }

  if (pathname === "/api/auth/login" && method === "POST") {
    const clientHash = await loginClientHash(request);
    const now = Math.floor(Date.now() / 1000);
    const lockedSeconds = await activeLoginLockSeconds(db, clientHash, now);
    if (lockedSeconds > 0) {
      const response = json({ error: "محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا." }, 429);
      response.headers.set("retry-after", String(lockedSeconds));
      return response;
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest("بيانات تسجيل الدخول غير صالحة.");
    }
    if (!body || typeof body !== "object") return badRequest("بيانات تسجيل الدخول غير صالحة.");
    const input = body as Record<string, unknown>;
    const username = asText(input.username, 120);
    const password =
      typeof input.password === "string" && input.password.length > 0 && input.password.length <= 256
        ? input.password
        : null;
    if (!username || !password) return badRequest("أدخل اسم المستخدم وكلمة المرور.");

    const [usernameMatches, passwordMatches] = await Promise.all([
      constantTimeTextEqual(username, credentials.username),
      constantTimeTextEqual(password, credentials.password),
    ]);
    if (!usernameMatches || !passwordMatches) {
      const retrySeconds = await recordLoginFailure(db, clientHash, now);
      const response = json(
        { error: retrySeconds > 0 ? "محاولات كثيرة. انتظر 15 دقيقة ثم حاول مجددًا." : "اسم المستخدم أو كلمة المرور غير صحيحة." },
        retrySeconds > 0 ? 429 : 401,
      );
      if (retrySeconds > 0) response.headers.set("retry-after", String(retrySeconds));
      return response;
    }

    await db.prepare("DELETE FROM auth_login_attempts WHERE client_hash = ?").bind(clientHash).run();
    await db.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").bind(now).run();
    const randomBytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Array.from(randomBytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    const tokenHash = await sha256Hex(token);
    const expiresAt = now + SESSION_TTL_SECONDS;
    await db
      .prepare("INSERT INTO auth_sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)")
      .bind(tokenHash, new Date(now * 1000).toISOString(), expiresAt)
      .run();

    return setSessionCookie(json({ authenticated: true }), token, basePath);
  }

  return notFound("المسار المطلوب غير موجود.");
}

function asNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function asText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= maxLength ? text : null;
}

function isDateOnly(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function now(): string {
  return new Date().toISOString();
}

function jordanToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Amman",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

async function parseBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return null;
    }
    return value as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function getMixer(db: D1Database, id: number): Promise<MixerRow | null> {
  return db
    .prepare(
      `SELECT id, vehicle_number AS vehicleNumber, driver_name AS driverName,
              tare_weight_kg AS tareWeightKg, tare_weighed_at AS tareWeighedAt,
              created_at AS createdAt, updated_at AS updatedAt
       FROM mixers WHERE id = ?`,
    )
    .bind(id)
    .first<MixerRow>();
}

async function getOperation(
  db: D1Database,
  id: number,
): Promise<OperationRow | null> {
  return db
    .prepare(
      `SELECT id, operation_date AS operationDate, mixer_id AS mixerId,
              vehicle_number AS vehicleNumber, driver_name AS driverName,
              customer_name AS customerName, gross_weight_kg AS grossWeightKg,
              tare_weight_kg AS tareWeightKg, concrete_weight_kg AS concreteWeightKg,
              created_at AS createdAt, updated_at AS updatedAt
       FROM operations WHERE id = ?`,
    )
    .bind(id)
    .first<OperationRow>();
}

async function createMixer(
  db: D1Database,
  request: Request,
): Promise<Response> {
  const body = await parseBody(request);
  if (!body) return badRequest("تعذر قراءة بيانات الآلية.");
  const vehicleNumber = asText(body.vehicleNumber, 30);
  const driverName = asText(body.driverName, 100);
  const tareWeightKg = asNumber(body.tareWeightKg);
  const tareWeighedAt = body.tareWeighedAt;
  if (
    !vehicleNumber ||
    !driverName ||
    tareWeightKg === null ||
    tareWeightKg <= 0 ||
    !isDateOnly(tareWeighedAt)
  ) {
    return badRequest("تحقق من رقم الآلية واسم السائق والوزن وتاريخ التوزين.");
  }

  const timestamp = now();
  try {
    const result = await db
      .prepare(
        `INSERT INTO mixers
          (vehicle_number, driver_name, tare_weight_kg, tare_weighed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(vehicleNumber, driverName, tareWeightKg, tareWeighedAt, timestamp, timestamp)
      .run();
    const mixer = await getMixer(db, Number(result.meta?.last_row_id));
    return mixer ? json(mixer, 201) : serverError("تعذرت قراءة الآلية بعد حفظها.");
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) {
      return conflict("رقم الآلية مسجل مسبقًا.");
    }
    throw error;
  }
}

async function updateMixer(
  db: D1Database,
  request: Request,
  id: number,
): Promise<Response> {
  const body = await parseBody(request);
  if (!body) return badRequest("تعذر قراءة بيانات الآلية.");
  const vehicleNumber = asText(body.vehicleNumber, 30);
  const driverName = asText(body.driverName, 100);
  if (!vehicleNumber || !driverName) {
    return badRequest("رقم الآلية واسم السائق مطلوبان.");
  }
  try {
    const result = await db
      .prepare(
        "UPDATE mixers SET vehicle_number = ?, driver_name = ?, updated_at = ? WHERE id = ?",
      )
      .bind(vehicleNumber, driverName, now(), id)
      .run();
    if (!result.meta?.changes) return notFound("الآلية غير موجودة.");
    const mixer = await getMixer(db, id);
    return mixer ? json(mixer) : notFound("الآلية غير موجودة.");
  } catch (error) {
    if (String(error).toLowerCase().includes("unique")) {
      return conflict("رقم الآلية مسجل مسبقًا.");
    }
    throw error;
  }
}

async function updateTare(
  db: D1Database,
  request: Request,
  id: number,
): Promise<Response> {
  const body = await parseBody(request);
  if (!body) return badRequest("تعذر قراءة بيانات الوزن.");
  const tareWeightKg = asNumber(body.tareWeightKg);
  if (
    tareWeightKg === null ||
    tareWeightKg <= 0 ||
    !isDateOnly(body.tareWeighedAt)
  ) {
    return badRequest("أدخل وزنًا فارغًا صحيحًا وتاريخ التوزين.");
  }
  const result = await db
    .prepare(
      "UPDATE mixers SET tare_weight_kg = ?, tare_weighed_at = ?, updated_at = ? WHERE id = ?",
    )
    .bind(tareWeightKg, body.tareWeighedAt, now(), id)
    .run();
  if (!result.meta?.changes) return notFound("الآلية غير موجودة.");
  const mixer = await getMixer(db, id);
  return mixer ? json(mixer) : notFound("الآلية غير موجودة.");
}

async function listOperations(
  db: D1Database,
  url: URL,
): Promise<Response> {
  const filters: Array<[string, string, string]> = [];
  const exactTextFilters = [
    ["customerName", "customer_name"],
    ["vehicleNumber", "vehicle_number"],
    ["driverName", "driver_name"],
  ] as const;
  for (const [key, column] of exactTextFilters) {
    const value = url.searchParams.get(key)?.trim();
    if (value) {
      if (value.length > 150) return badRequest("قيمة الفلتر أطول من المسموح.");
      filters.push([`${column} LIKE ? COLLATE NOCASE`, `%${value}%`, key]);
    }
  }

  const dateFrom = url.searchParams.get("dateFrom");
  const dateTo = url.searchParams.get("dateTo");
  if (dateFrom) {
    if (!isDateOnly(dateFrom)) return badRequest("تاريخ البداية غير صحيح.");
    filters.push(["operation_date >= ?", dateFrom, "dateFrom"]);
  }
  if (dateTo) {
    if (!isDateOnly(dateTo)) return badRequest("تاريخ النهاية غير صحيح.");
    filters.push(["operation_date <= ?", dateTo, "dateTo"]);
  }

  const mixerIdValue = url.searchParams.get("mixerId");
  if (mixerIdValue) {
    const mixerId = Number(mixerIdValue);
    if (!Number.isSafeInteger(mixerId) || mixerId <= 0) {
      return badRequest("رقم الآلية المحدد غير صحيح.");
    }
    filters.push(["mixer_id = ?", String(mixerId), "mixerId"]);
  }

  const ranges = [
    ["grossMinKg", "gross_weight_kg", ">="],
    ["grossMaxKg", "gross_weight_kg", "<="],
    ["tareMinKg", "tare_weight_kg", ">="],
    ["tareMaxKg", "tare_weight_kg", "<="],
    ["concreteMinKg", "concrete_weight_kg", ">="],
    ["concreteMaxKg", "concrete_weight_kg", "<="],
  ] as const;
  const values: unknown[] = [];
  const clauses: string[] = [];
  for (const [key, column, operator] of ranges) {
    const raw = url.searchParams.get(key);
    if (raw === null || raw === "") continue;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      return badRequest("أحد فلاتر الوزن غير صحيح.");
    }
    clauses.push(`${column} ${operator} ?`);
    values.push(value);
  }

  for (const [sql, value] of filters) {
    clauses.push(sql);
    values.push(value);
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = await db
    .prepare(
      `SELECT id, operation_date AS operationDate, mixer_id AS mixerId,
              vehicle_number AS vehicleNumber, driver_name AS driverName,
              customer_name AS customerName, gross_weight_kg AS grossWeightKg,
              tare_weight_kg AS tareWeightKg, concrete_weight_kg AS concreteWeightKg,
              created_at AS createdAt, updated_at AS updatedAt
       FROM operations ${where}
       ORDER BY operation_date DESC, id DESC`,
    )
    .bind(...values)
    .all<OperationRow>();
  return json(rows.results ?? []);
}

async function createOperation(
  db: D1Database,
  request: Request,
): Promise<Response> {
  const body = await parseBody(request);
  if (!body) return badRequest("تعذر قراءة بيانات العملية.");
  const operationDate = body.operationDate;
  const mixerId = asNumber(body.mixerId);
  const customerName = asText(body.customerName, 150);
  const grossWeightKg = asNumber(body.grossWeightKg);
  if (
    !isDateOnly(operationDate) ||
    mixerId === null ||
    !Number.isSafeInteger(mixerId) ||
    mixerId <= 0 ||
    !customerName ||
    grossWeightKg === null ||
    grossWeightKg <= 0
  ) {
    return badRequest("تحقق من تاريخ العملية والآلية والعميل والوزن القائم.");
  }
  const mixer = await getMixer(db, mixerId);
  if (!mixer) return notFound("الآلية المختارة غير موجودة.");
  const concreteWeightKg = grossWeightKg - mixer.tareWeightKg;
  if (concreteWeightKg <= 0) {
    return badRequest("الوزن القائم يجب أن يكون أكبر من الوزن الفارغ.");
  }
  const timestamp = now();
  const result = await db
    .prepare(
      `INSERT INTO operations
        (operation_date, mixer_id, vehicle_number, driver_name, customer_name,
         gross_weight_kg, tare_weight_kg, concrete_weight_kg, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      operationDate,
      mixer.id,
      mixer.vehicleNumber,
      mixer.driverName,
      customerName,
      grossWeightKg,
      mixer.tareWeightKg,
      concreteWeightKg,
      timestamp,
      timestamp,
    )
    .run();
  const operation = await getOperation(db, Number(result.meta?.last_row_id));
  return operation
    ? json(operation, 201)
    : serverError("تعذرت قراءة العملية بعد حفظها.");
}

async function updateOperation(
  db: D1Database,
  request: Request,
  id: number,
): Promise<Response> {
  const body = await parseBody(request);
  if (!body) return badRequest("تعذر قراءة بيانات العملية.");
  const operationDate = body.operationDate;
  const mixerId = asNumber(body.mixerId);
  const customerName = asText(body.customerName, 150);
  const grossWeightKg = asNumber(body.grossWeightKg);
  if (
    !isDateOnly(operationDate) ||
    mixerId === null ||
    !Number.isSafeInteger(mixerId) ||
    mixerId <= 0 ||
    !customerName ||
    grossWeightKg === null ||
    grossWeightKg <= 0
  ) {
    return badRequest("تحقق من تاريخ العملية والآلية والعميل والوزن القائم.");
  }
  const existing = await getOperation(db, id);
  if (!existing) return notFound("العملية غير موجودة.");
  const mixer = await getMixer(db, mixerId);
  if (!mixer) return notFound("الآلية المختارة غير موجودة.");
  const sameMixer = existing.mixerId === mixer.id;
  const tareWeightKg = sameMixer ? existing.tareWeightKg : mixer.tareWeightKg;
  const concreteWeightKg = grossWeightKg - tareWeightKg;
  if (concreteWeightKg <= 0) {
    return badRequest("الوزن القائم يجب أن يكون أكبر من الوزن الفارغ.");
  }
  const result = await db
    .prepare(
      `UPDATE operations
       SET operation_date = ?, mixer_id = ?, vehicle_number = ?, driver_name = ?,
           customer_name = ?, gross_weight_kg = ?, tare_weight_kg = ?,
           concrete_weight_kg = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(
      operationDate,
      mixer.id,
      sameMixer ? existing.vehicleNumber : mixer.vehicleNumber,
      sameMixer ? existing.driverName : mixer.driverName,
      customerName,
      grossWeightKg,
      tareWeightKg,
      concreteWeightKg,
      now(),
      id,
    )
    .run();
  if (!result.meta?.changes) return notFound("العملية غير موجودة.");
  const operation = await getOperation(db, id);
  return operation ? json(operation) : notFound("العملية غير موجودة.");
}

async function summary(db: D1Database): Promise<Response> {
  const today = jordanToday();
  const [operationTotals, mixerTotals] = await Promise.all([
    db
      .prepare(
        `SELECT COUNT(*) AS totalOperationsCount,
                COALESCE(SUM(concrete_weight_kg), 0) AS totalConcreteKg,
                COALESCE(SUM(CASE WHEN operation_date = ? THEN 1 ELSE 0 END), 0) AS todayOperationsCount,
                COALESCE(SUM(CASE WHEN operation_date = ? THEN concrete_weight_kg ELSE 0 END), 0) AS todayConcreteKg
         FROM operations`,
      )
      .bind(today, today)
      .first<Record<string, number>>(),
    db
      .prepare(
        `SELECT COUNT(*) AS mixerCount,
                COALESCE(SUM(CASE WHEN julianday(?) - julianday(tare_weighed_at) > 30
                                      AND julianday(?) - julianday(tare_weighed_at) < 90
                                  THEN 1 ELSE 0 END), 0) AS dueSoonTareCount,
                COALESCE(SUM(CASE WHEN julianday(?) - julianday(tare_weighed_at) >= 90
                                  THEN 1 ELSE 0 END), 0) AS overdueTareCount
         FROM mixers`,
      )
      .bind(today, today, today)
      .first<Record<string, number>>(),
  ]);
  return json({
    todayOperationsCount: Number(operationTotals?.todayOperationsCount ?? 0),
    todayConcreteKg: Number(operationTotals?.todayConcreteKg ?? 0),
    totalOperationsCount: Number(operationTotals?.totalOperationsCount ?? 0),
    totalConcreteKg: Number(operationTotals?.totalConcreteKg ?? 0),
    mixerCount: Number(mixerTotals?.mixerCount ?? 0),
    dueSoonTareCount: Number(mixerTotals?.dueSoonTareCount ?? 0),
    overdueTareCount: Number(mixerTotals?.overdueTareCount ?? 0),
  });
}

async function handleApi(context: PagesContext, pathname: string): Promise<Response> {
  const { request, env } = context;
  const db = env.DB;
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if (pathname === "/api/healthz" && method === "GET") {
    return json({ status: "ok" });
  }
  if (pathname === "/api/summary" && method === "GET") return summary(db);

  if (pathname === "/api/mixers" && method === "GET") {
    const rows = await db
      .prepare(
        `SELECT id, vehicle_number AS vehicleNumber, driver_name AS driverName,
                tare_weight_kg AS tareWeightKg, tare_weighed_at AS tareWeighedAt,
                created_at AS createdAt, updated_at AS updatedAt
         FROM mixers ORDER BY vehicle_number COLLATE NOCASE`,
      )
      .all<MixerRow>();
    return json(rows.results ?? []);
  }
  if (pathname === "/api/mixers" && method === "POST") {
    return createMixer(db, request);
  }

  const tareMatch = pathname.match(/^\/api\/mixers\/(\d+)\/tare$/);
  if (tareMatch && method === "POST") {
    return updateTare(db, request, Number(tareMatch[1]));
  }
  const mixerMatch = pathname.match(/^\/api\/mixers\/(\d+)$/);
  if (mixerMatch) {
    const id = Number(mixerMatch[1]);
    if (method === "PATCH") return updateMixer(db, request, id);
    if (method === "DELETE") {
      const result = await db.prepare("DELETE FROM mixers WHERE id = ?").bind(id).run();
      return result.meta?.changes ? json(null, 204) : notFound("الآلية غير موجودة.");
    }
  }

  if (pathname === "/api/operations" && method === "GET") {
    return listOperations(db, url);
  }
  if (pathname === "/api/operations" && method === "POST") {
    return createOperation(db, request);
  }
  const operationMatch = pathname.match(/^\/api\/operations\/(\d+)$/);
  if (operationMatch) {
    const id = Number(operationMatch[1]);
    if (method === "PATCH") return updateOperation(db, request, id);
    if (method === "DELETE") {
      const result = await db
        .prepare("DELETE FROM operations WHERE id = ?")
        .bind(id)
        .run();
      return result.meta?.changes ? json(null, 204) : notFound("العملية غير موجودة.");
    }
  }
  return notFound("المسار المطلوب غير موجود.");
}

export async function onRequest(context: PagesContext): Promise<Response> {
  const basePath = normalizeBasePath(context.env.APP_BASE_PATH);
  let pathname = new URL(context.request.url).pathname;
  if (basePath && (pathname === basePath || pathname.startsWith(`${basePath}/`))) {
    pathname = pathname.slice(basePath.length) || "/";
  }
  if (pathname !== "/api" && !pathname.startsWith("/api/")) {
    return context.next();
  }
  try {
    const method = context.request.method.toUpperCase();
    if (pathname === "/api/healthz" && method === "GET") {
      return json({ status: "ok" });
    }
    if (pathname.startsWith("/api/auth/")) {
      return await handleAuth(context, pathname, basePath);
    }
    if (!(await hasActiveSession(context.env.DB, context.request))) {
      return json({ error: "يلزم تسجيل الدخول للوصول إلى البيانات." }, 401);
    }
    return await handleApi(context, pathname);
  } catch (error) {
    const message = String(error);
    if (message.toLowerCase().includes("unique")) {
      return conflict("رقم الآلية مسجل مسبقًا.");
    }
    return serverError("حدث خطأ أثناء تنفيذ العملية. حاول مرة أخرى.");
  }
}
