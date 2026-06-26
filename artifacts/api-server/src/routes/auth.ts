import { Router, type IRouter, type Request, type Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { signToken, requireAuth } from "../middlewares/auth";
import { createHash, randomBytes } from "node:crypto";
import { authService } from "../services/auth-service";
import { deviceManager } from "../services/device-manager";

const router: IRouter = Router();

// ── Password Hashing ───────────────────────────────────────────────────────

function hashPassword(pw: string): string {
  return createHash("sha256").update(pw).digest("hex");
}

function verifyPassword(pw: string, hash: string): boolean {
  return hashPassword(pw) === hash;
}

/** Safely extract a string value from request headers (Express 5 types) */
function getHeader(req: Request, name: string): string {
  const val = req.headers[name];
  if (Array.isArray(val)) return val[0] ?? "";
  return val ?? "";
}

/** Safely get IP address from request */
function getClientIp(req: Request): string {
  const ip: unknown = req.ip;
  if (Array.isArray(ip)) return String(ip[0] ?? "unknown");
  return String(ip ?? req.socket.remoteAddress ?? "unknown");
}

/** Safely get host from request */
function getHost(req: Request): string {
  const host: unknown = req.get("host");
  if (Array.isArray(host)) return String(host[0] ?? "localhost");
  return String(host ?? "localhost");
}

/** Safely extract a string param from req.params */
function getParam(req: Request, name: string): string {
  const val: unknown = req.params[name];
  if (Array.isArray(val)) return String(val[0] ?? "");
  return String(val ?? "");
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATION ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/auth/login
router.post("/auth/login", async (req, res) => {
  const { username, password } = req.body as { username: string; password: string };
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password required" });
  }

  try {
    const users = await db.select().from(usersTable).where(eq(usersTable.username, username));
    const user = users[0];
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const authUser = { id: user.id, username: user.username, role: user.role, tier: user.tier };
    const tokens = authService.generateTokens(authUser);

    // Register device
    const userAgentStr = getHeader(req, "user-agent");
    const deviceName = userAgentStr.slice(0, 100);
    const deviceInfo = deviceManager.registerDevice({
      userId: user.id,
      userAgent: userAgentStr,
      ipAddress: getClientIp(req),
      deviceName,
    });

    // Create session
    await authService.createSession(
      authUser,
      tokens,
      deviceName,
      getClientIp(req),
    );

    // Sign a proper JWT token with HMAC-SHA256
    const token = signToken(user);

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        tier: user.tier,
        createdAt: user.createdAt.toISOString(),
      },
      token,
      refreshToken: tokens.refreshToken,
      expiresIn: tokens.expiresIn,
      device: deviceInfo,
      providers: authService.getOAuth2Providers().map((p) => ({
        name: p.name,
        authorizationUrl: p.authorizationUrl,
        enabled: p.enabled,
      })),
    });
  } catch (err) {
    logger.error({ err }, "Login error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/refresh
router.post("/auth/refresh", async (req, res) => {
  const { refreshToken } = req.body as { refreshToken: string };
  if (!refreshToken) {
    return res.status(400).json({ error: "Refresh token required" });
  }

  try {
    const tokens = await authService.refreshAccessToken(
      refreshToken,
      getHeader(req, "user-agent").slice(0, 100),
      String(getClientIp(req)),
    );

    if (!tokens) {
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    return res.json(tokens);
  } catch (err) {
    logger.error({ err }, "Token refresh error");
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/auth/logout
router.post("/auth/logout", requireAuth, (req: Request, res: Response) => {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (refreshToken) {
    authService.revokeRefreshToken(refreshToken);
  }
  res.json({ message: "Logged out successfully" });
});

// POST /api/auth/logout/all — revoke all sessions
router.post("/auth/logout/all", requireAuth, (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const count = authService.revokeAllUserSessions(req.user.userId);
  deviceManager.revokeAllUserDevices(req.user.userId);
  return res.json({ message: `Logged out of ${count} session(s)` });
});

// POST /api/auth/logout/device/:deviceId — revoke specific device
router.post("/auth/logout/device/:deviceId", requireAuth, (req: Request, res: Response) => {
  const device = deviceManager.getDevice(getParam(req, "deviceId"));
  if (!device) return res.status(404).json({ error: "Device not found" });
  if (req.user && device.userId !== req.user.userId) {
    return res.status(403).json({ error: "Device does not belong to current user" });
  }
  deviceManager.revokeDevice(getParam(req, "deviceId"));
  return res.json({ message: "Device revoked" });
});

// GET /api/auth/me — protected by JWT middleware
router.get("/auth/me", requireAuth, async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const [user] = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      role: usersTable.role,
      tier: usersTable.tier,
      createdAt: usersTable.createdAt,
    })
    .from(usersTable)
    .where(eq(usersTable.id, req.user.userId));

  if (!user) {
    return res.status(401).json({ error: "User not found" });
  }

  // Get OAuth2 providers
  const providers = authService.getOAuth2Providers();

  return res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    tier: user.tier,
    createdAt: user.createdAt.toISOString(),
    oauthProviders: providers.map((p) => ({
      name: p.name,
      enabled: p.enabled,
    })),
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// MFA ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

// In-memory TOTP secrets store (replace with DB in production)
const mfaSecrets = new Map<number, { secret: string; enabled: boolean; backupCodes: string[] }>();

// POST /api/auth/mfa/setup — generate TOTP secret and QR code URL
router.post("/auth/mfa/setup", requireAuth, (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  const secret = randomBytes(20).toString("hex");
  const backupCodes = Array.from({ length: 8 }, () => randomBytes(6).toString("hex"));

  mfaSecrets.set(req.user.userId, { secret, enabled: false, backupCodes });

  const otpauthUrl = `otpauth://totp/V8:${req.user.username}?secret=${secret}&issuer=V8%20Platform&algorithm=SHA1&digits=6&period=30`;

  return res.json({
    secret,
    otpauthUrl,
    backupCodes,
    qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(otpauthUrl)}`,
  });
});

// POST /api/auth/mfa/verify — verify and enable MFA
router.post("/auth/mfa/verify", requireAuth, (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const { code } = req.body as { code: string };

  const mfaEntry = mfaSecrets.get(req.user.userId);
  if (!mfaEntry) return res.status(400).json({ error: "MFA not setup. Call /auth/mfa/setup first." });

  if (verifyTotp(code, mfaEntry.secret)) {
    mfaEntry.enabled = true;
    return res.json({ message: "MFA enabled successfully" });
  }

  // Check backup codes
  const codeIndex = mfaEntry.backupCodes.indexOf(code);
  if (codeIndex >= 0) {
    mfaEntry.backupCodes.splice(codeIndex, 1);
    mfaEntry.enabled = true;
    return res.json({ message: "MFA enabled with backup code", backupCodesRemaining: mfaEntry.backupCodes.length });
  }

  return res.status(400).json({ error: "Invalid verification code" });
});

// POST /api/auth/mfa/disable — disable MFA
router.post("/auth/mfa/disable", requireAuth, (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const mfaEntry = mfaSecrets.get(req.user.userId);
  if (!mfaEntry) return res.status(400).json({ error: "MFA not configured" });
  mfaEntry.enabled = false;
  mfaSecrets.delete(req.user.userId);
  return res.json({ message: "MFA disabled" });
});

// GET /api/auth/mfa/status
router.get("/auth/mfa/status", requireAuth, (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const mfaEntry = mfaSecrets.get(req.user.userId);
  return res.json({
    enabled: mfaEntry?.enabled ?? false,
    hasBackupCodes: (mfaEntry?.backupCodes.length ?? 0) > 0,
    backupCodesRemaining: mfaEntry?.backupCodes.length ?? 0,
  });
});

// POST /api/auth/mfa/backup-codes — regenerate backup codes
router.post("/auth/mfa/backup-codes", requireAuth, (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const mfaEntry = mfaSecrets.get(req.user.userId);
  if (!mfaEntry) return res.status(400).json({ error: "MFA not configured" });
  mfaEntry.backupCodes = Array.from({ length: 8 }, () => randomBytes(6).toString("hex"));
  return res.json({ backupCodes: mfaEntry.backupCodes });
});

// ═══════════════════════════════════════════════════════════════════════════
// SESSION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/auth/sessions — list all active sessions
router.get("/auth/sessions", requireAuth, (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const sessions = authService.getUserSessions(req.user.userId);
  return res.json({ count: sessions.length, sessions });
});

// DELETE /api/auth/sessions/:sessionId — revoke a session
router.delete("/auth/sessions/:sessionId", requireAuth, (req: Request, res: Response) => {
  const revoked = authService.revokeSession(getParam(req, "sessionId"));
  if (!revoked) return res.status(404).json({ error: "Session not found" });
  return res.json({ message: "Session revoked" });
});

// ═══════════════════════════════════════════════════════════════════════════
// DEVICE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/auth/devices — list all devices
router.get("/auth/devices", requireAuth, (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  const devices = deviceManager.getUserDevices(req.user.userId);
  return res.json({ count: devices.length, devices });
});

// GET /api/auth/devices/:deviceId — device details
router.get("/auth/devices/:deviceId", requireAuth, (req: Request, res: Response) => {
  const deviceId = getParam(req, "deviceId");
  const device = deviceManager.getDevice(deviceId);
  if (!device) return res.status(404).json({ error: "Device not found" });
  if (req.user && device.userId !== req.user.userId) {
    return res.status(403).json({ error: "Device does not belong to current user" });
  }
  const activity = deviceManager.getDeviceActivity(deviceId);
  return res.json({ ...device, activity });
});

// POST /api/auth/devices/:deviceId/trust
router.post("/auth/devices/:deviceId/trust", requireAuth, (req: Request, res: Response) => {
  const deviceId = getParam(req, "deviceId");
  const device = deviceManager.getDevice(deviceId);
  if (!device) return res.status(404).json({ error: "Device not found" });
  if (req.user && device.userId !== req.user.userId) {
    return res.status(403).json({ error: "Device does not belong to current user" });
  }
  deviceManager.trustDevice(deviceId);
  return res.json({ message: "Device trusted" });
});

// POST /api/auth/devices/:deviceId/untrust
router.post("/auth/devices/:deviceId/untrust", requireAuth, (req: Request, res: Response) => {
  const deviceId = getParam(req, "deviceId");
  const device = deviceManager.getDevice(deviceId);
  if (!device) return res.status(404).json({ error: "Device not found" });
  if (req.user && device.userId !== req.user.userId) {
    return res.status(403).json({ error: "Device does not belong to current user" });
  }
  deviceManager.untrustDevice(deviceId);
  return res.json({ message: "Device untrusted" });
});

// DELETE /api/auth/devices/:deviceId — revoke device
router.delete("/auth/devices/:deviceId", requireAuth, (req: Request, res: Response) => {
  const deviceId = getParam(req, "deviceId");
  const device = deviceManager.getDevice(deviceId);
  if (!device) return res.status(404).json({ error: "Device not found" });
  if (req.user && device.userId !== req.user.userId) {
    return res.status(403).json({ error: "Device does not belong to current user" });
  }
  deviceManager.revokeDevice(deviceId);
  return res.json({ message: "Device revoked" });
});

// ═══════════════════════════════════════════════════════════════════════════
// OAUTH2 ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════

// GET /api/auth/oauth/providers — list configured OAuth2 providers
router.get("/auth/oauth/providers", (_req: Request, res: Response) => {
  const providers = authService.getOAuth2Providers();
  return res.json({
    count: providers.length,
    providers: providers.map((p) => ({
      name: p.name,
      authorizationUrl: p.authorizationUrl,
      enabled: p.enabled,
    })),
  });
});

// POST /api/auth/oauth/:provider/callback — OAuth2 callback handler
router.post("/auth/oauth/:provider/callback", async (req: Request, res: Response) => {
  const provider = getParam(req, "provider");
  const { code } = req.body as { code: string };

  if (!code) {
    return res.status(400).json({ error: "Authorization code required" });
  }

  const providers = authService.getOAuth2Providers();
  const providerConfig = providers.find((p) => p.name === provider);
  if (!providerConfig) {
    return res.status(400).json({ error: `Unknown OAuth provider: ${provider}` });
  }

  try {
    // Exchange authorization code for access token
    const tokenResponse = await fetch(providerConfig.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify({
        client_id: providerConfig.clientId,
        client_secret: providerConfig.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${String(req.protocol)}://${getHost(req)}/auth/oauth/${provider}/callback`,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!tokenResponse.ok) {
      logger.error({ provider, status: tokenResponse.status }, "OAuth2 token exchange failed");
      return res.status(502).json({ error: "Failed to exchange authorization code" });
    }

    const tokenData = await tokenResponse.json() as { access_token?: string };

    // Get user info
    const userInfoResponse = await fetch(providerConfig.userInfoUrl, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      signal: AbortSignal.timeout(10_000),
    });

    if (!userInfoResponse.ok) {
      return res.status(502).json({ error: "Failed to get user info from provider" });
    }

    const userInfo = await userInfoResponse.json() as Record<string, unknown>;

    // Extract email/username from provider response
    const email = (userInfo.email ?? userInfo.login ?? userInfo.preferred_username ?? "") as string;
    const displayName = (userInfo.name ?? userInfo.login ?? userInfo.given_name ?? email) as string;

    // Find or create user by OAuth email
    const [existingUser] = await db.select().from(usersTable).where(eq(usersTable.username, email));
    let userId: number;

    if (existingUser) {
      userId = existingUser.id;
    } else {
      // Create new user from OAuth
      const randomPw = randomBytes(32).toString("hex");
      const hashedPw = hashPassword(randomPw);
      const [newUser] = await db.insert(usersTable).values({
        username: email,
        passwordHash: hashedPw,
        role: "operator",
        tier: "Node_01",
      }).returning({ id: usersTable.id });
      userId = newUser.id;
    }

    const [user] = await db
      .select({ id: usersTable.id, username: usersTable.username, role: usersTable.role, tier: usersTable.tier })
      .from(usersTable)
      .where(eq(usersTable.id, userId));

    if (!user) throw new Error("User creation failed");

    const token = signToken(user);

    return res.json({
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        tier: user.tier,
      },
      token,
      provider,
    });
  } catch (err) {
    logger.error({ err, provider }, "OAuth2 callback error");
    return res.status(500).json({ error: "OAuth2 authentication failed" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// PASSWORD MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

// POST /api/auth/change-password
router.post("/auth/change-password", requireAuth, async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });

  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current and new password required" });
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.userId));
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) {
    return res.status(401).json({ error: "Current password is incorrect" });
  }

  // Validate password policy
  const policy = authService.validatePassword(newPassword);
  if (!policy.valid) {
    return res.status(400).json({ error: policy.errors.join("; ") });
  }

  const newHash = hashPassword(newPassword);
  await db.update(usersTable).set({ passwordHash: newHash }).where(eq(usersTable.id, req.user.userId));

  // Revoke all other sessions except current
  authService.revokeAllUserSessions(req.user.userId);

  return res.json({ message: "Password changed successfully. Please log in again." });
});

// ═══════════════════════════════════════════════════════════════════════════
// MFA TOTP verification helper
// ═══════════════════════════════════════════════════════════════════════════

function verifyTotp(code: string, secret: string): boolean {
  // Simple TOTP verification using the same algorithm
  // In production, use speakeasy or otplib library
  try {
    const time = Math.floor(Date.now() / 30000);
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeBigInt64BE(BigInt(time), 0);

    const hmac = createHash("sha1").update(secret + timeBuffer.toString("hex")).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binary = ((hmac[offset] & 0x7f) << 24)
      | ((hmac[offset + 1] & 0xff) << 16)
      | ((hmac[offset + 2] & 0xff) << 8)
      | (hmac[offset + 3] & 0xff);
    const otp = String(binary % 1000000).padStart(6, "0");

    return code === otp;
  } catch {
    return false;
  }
}

export function hashPasswordExport(pw: string): string {
  return hashPassword(pw);
}

export default router;
