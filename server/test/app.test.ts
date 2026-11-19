import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app.js";
import { loadConfig } from "../src/config.js";
import { PiApiError, verifyAccessToken, type FetchLike } from "../src/pi/client.js";

const cfg = (env: Record<string, string> = {}) => loadConfig({ ...env } as NodeJS.ProcessEnv);

describe("config", () => {
  it("valeurs par défaut : testnet, port 3000", () => {
    const c = cfg();
    expect(c.PI_NETWORK).toBe("testnet");
    expect(c.PORT).toBe(3000);
  });
  it("refuse un réseau inconnu sans afficher la valeur", () => {
    expect(() => cfg({ PI_NETWORK: "secret-valeur" })).toThrow("PI_NETWORK");
    expect(() => cfg({ PI_NETWORK: "secret-valeur" })).not.toThrow(/secret-valeur/);
  });
});

describe("routes publiques", () => {
  it("/health : version et réseau", async () => {
    const app = createApp({ config: cfg({ RENDER_GIT_COMMIT: "abcdef1234567" }) });
    const r = await request(app).get("/health");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ ok: true, app: "FacturePro", network: "testnet", commit: "abcdef1" });
  });
  it("/validation-key.txt sert la clé en texte brut, 404 si absente", async () => {
    const withKey = createApp({ config: cfg({ PI_VALIDATION_KEY: "abc123" }) });
    const ok = await request(withKey).get("/validation-key.txt");
    expect(ok.status).toBe(200);
    expect(ok.headers["content-type"]).toMatch(/text\/plain/);
    expect(ok.text).toBe("abc123");
    const without = createApp({ config: cfg() });
    expect((await request(without).get("/validation-key.txt")).status).toBe(404);
  });
  it("en-têtes de sécurité : CSP autorisant uniquement le SDK Pi", async () => {
    const r = await request(createApp({ config: cfg() })).get("/health");
    expect(r.headers["content-security-policy"]).toContain("https://sdk.minepi.com");
    expect(r.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("POST /api/auth/pi", () => {
  it("renvoie l'identité vérifiée par Pi, pas celle du navigateur", async () => {
    const verifyToken = vi.fn().mockResolvedValue({ uid: "uid-pi", username: "alice", scopes: ["username"] });
    const app = createApp({ config: cfg(), verifyToken });
    const r = await request(app).post("/api/auth/pi").send({ accessToken: "token-assez-long" });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ uid: "uid-pi", username: "alice", scopes: ["username"] });
    expect(verifyToken).toHaveBeenCalledWith("token-assez-long");
  });
  it("refuse un uid envoyé par le navigateur (corps strict)", async () => {
    const app = createApp({ config: cfg(), verifyToken: vi.fn() });
    const r = await request(app).post("/api/auth/pi").send({ accessToken: "token-assez-long", uid: "pirate" });
    expect(r.status).toBe(400);
  });
  it("401 si Pi rejette le jeton, 502 si Pi est indisponible", async () => {
    const bad = createApp({ config: cfg(), verifyToken: vi.fn().mockRejectedValue(new PiApiError(401, "x")) });
    expect((await request(bad).post("/api/auth/pi").send({ accessToken: "token-assez-long" })).status).toBe(401);
    const down = createApp({ config: cfg(), verifyToken: vi.fn().mockRejectedValue(new Error("réseau")) });
    expect((await request(down).post("/api/auth/pi").send({ accessToken: "token-assez-long" })).status).toBe(502);
  });
});

describe("client Pi", () => {
  it("appelle GET /v2/me avec Bearer et lit uid, pseudo, scopes", async () => {
    const f = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ uid: "u1", username: "bob", credentials: { scopes: ["username", "payments"] } }),
    });
    const u = await verifyAccessToken("tok", f as unknown as FetchLike);
    expect(u).toEqual({ uid: "u1", username: "bob", scopes: ["username", "payments"] });
    expect(f.mock.calls[0]![0]).toBe("https://api.minepi.com/v2/me");
    expect(f.mock.calls[0]![1].headers.Authorization).toBe("Bearer tok");
  });
  it("lève PiApiError 401 et ne journalise pas le jeton", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) });
    await expect(verifyAccessToken("tok-secret", f as unknown as FetchLike)).rejects.toMatchObject({ status: 401 });
    expect(JSON.stringify(spy.mock.calls)).not.toContain("tok-secret");
    spy.mockRestore();
  });
  it("refuse une réponse sans uid", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    await expect(verifyAccessToken("tok", f as unknown as FetchLike)).rejects.toMatchObject({ status: 502 });
  });
});
