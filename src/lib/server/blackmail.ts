// Sırlar, dosyalar ve şantaj — YALNIZCA SUNUCU.
//
// Para, hisse ve ihale hareketleri 015_sirlar_santaj.sql içindeki kilitli fonksiyonlarda yapılır.
// Burada zarlar atılır, sonuçların itibar, haber, günlük ve bildirim tarafı uygulanır.

import {
  ANSWER_HOURS, BAN_HOURS, BLACKMAIL_WINDOW_HOURS, BLACKMAILS_PER_WINDOW, CAUGHT_REP, caughtFine, COPY_COOLDOWN_HOURS, COPY_KEEP,
  DEMAND_LABEL, dossierValue, exposure, fillSecret, freshness, MAX_GREED, maxShareTransfer, MIN_DEMAND, PROTECT_HOURS, reportCatchChance,
  SECRET_KINDS, SECRET_LIFE_HOURS, sendCatchChance, SERIAL_HOURS, SEVERITY, type DemandKind, type SecretKind, type Severity,
} from "../game/blackmail";
import { formatMoney } from "../game/economy";
import { isMissingTable, logEvent } from "./company";
import { addEffect } from "./effects";
import { equityBoard, invalidateEquity } from "./equity";
import { isOnline, sendToUser, type PushPayload } from "./push";
import { postAbout } from "./social";
import { db, HttpError } from "./supabase";
import { invalidateMarket } from "./workshop";

const NEED = "Şantaj için veritabanında 015_sirlar_santaj.sql çalıştırılmalı";

type SecretRow = { id: number; company_id: string; kind: string; severity: Severity; summary: string; headline: string; created_at: string; expires_at: string; exposed_at: string | null };
type DossierRow = { id: number; holder: string; secret_id: number; obtained_at: string; status: "active" | "pledged" | "used" | "burned"; cooldown_until: string | null };
type BlackmailRow = {
  id: string;
  blackmailer: string;
  target: string;
  dossier_id: number | null;
  secret_id: number | null;
  severity: Severity;
  summary: string;
  demand_kind: DemandKind;
  amount: number;
  shares: number;
  tender_id: string | null;
  tender_label: string | null;
  note: string | null;
  fair: number;
  status: "open" | "paid" | "refused" | "reported" | "countered" | "expired" | "caught";
  caught: boolean;
  revealed: boolean;
  counter_tried: boolean;
  outcome: any;
  created_at: string;
  expires_at: string;
  resolved_at: string | null;
  read_at: string | null;
};

// Yalnızca testler için: "1" her zarı tutturur, "0" hiçbirini
function roll(p: number): boolean {
  const fixed = process.env.BLACKMAIL_TEST_ROLLS;
  if (fixed === "1") return true;
  if (fixed === "0") return false;
  return Math.random() < p;
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

// ---------------------------------------------------------------------------
// Sır ve dosya
// ---------------------------------------------------------------------------

/** Şirketin bir kirli işini kayda geçirir. Göç yoksa sessizce geçer. */
export async function recordSecret(companyId: string, kind: SecretKind, vars: { company: string; target?: string }): Promise<void> {
  const k = SECRET_KINDS[kind];
  const now = Date.now();
  const { error } = await db()
    .from("secrets")
    .insert({
      company_id: companyId,
      kind,
      severity: k.severity,
      summary: fillSecret(k.summary, vars),
      headline: fillSecret(k.headline, vars),
      expires_at: new Date(now + SECRET_LIFE_HOURS * 3_600_000).toISOString(),
    });
  if (error && !isMissingTable(error)) console.error("recordSecret", error.message);
}

/** Hedefin, elinde olmayan taze bir sırrının dosyasını ele geçirir. Yoksa null. */
export async function grabDossier(holder: string, target: string): Promise<SecretRow | null> {
  const { data: secrets, error } = await db()
    .from("secrets")
    .select("*")
    .eq("company_id", target)
    .is("exposed_at", null)
    .gt("expires_at", new Date().toISOString());
  if (error) {
    if (isMissingTable(error)) return null;
    throw new HttpError(500, error.message);
  }
  if (!secrets?.length) return null;
  const { data: have } = await db().from("dossiers").select("secret_id").eq("holder", holder).in("secret_id", secrets.map((s) => s.id));
  const known = new Set((have ?? []).map((d) => d.secret_id));
  const fresh = (secrets as SecretRow[]).filter((s) => !known.has(s.id));
  if (!fresh.length) return null;
  // Ağır ve taze sırlar daha kolay bulunur
  const weight = (s: SecretRow) => s.severity * (0.5 + freshness(new Date(s.created_at).getTime(), Date.now()));
  const total = fresh.reduce((a, s) => a + weight(s), 0);
  let r = Math.random() * total;
  const pick = fresh.find((s) => (r -= weight(s)) <= 0) ?? fresh[fresh.length - 1];
  const { error: insErr } = await db().from("dossiers").insert({ holder, secret_id: pick.id });
  if (insErr) {
    if (/duplicate|unique/i.test(insErr.message)) return null;
    throw new HttpError(500, insErr.message);
  }
  return pick;
}

// ---------------------------------------------------------------------------
// Yardımcılar
// ---------------------------------------------------------------------------

async function names(ids: string[]): Promise<Map<string, { name: string; founderName: string; ownerId: string; logo: unknown; logoUrl: string | null }>> {
  const out = new Map();
  const uniq = Array.from(new Set(ids.filter(Boolean)));
  if (!uniq.length) return out;
  const { data } = await db().from("companies").select("id, name, founder_name, owner_id, logo, logo_url").in("id", uniq);
  for (const c of data ?? []) out.set(c.id, { name: c.name, founderName: c.founder_name, ownerId: c.owner_id, logo: c.logo, logoUrl: c.logo_url ?? null });
  return out;
}

/** İtibar değişimi; olumsuzsa PR uzmanı yarıya indirir. Uygulanan değeri döndürür. */
async function adjustRep(companyId: string, delta: number): Promise<number> {
  let d = delta;
  if (d < 0) {
    const { data: pr } = await db().from("employees").select("role").eq("company_id", companyId).eq("role", "pr");
    if (pr?.length) d = Math.trunc(d / 2);
  }
  if (d !== 0) await db().rpc("adjust_reputation", { p_company: companyId, p_delta: d });
  return d;
}

/** Oyuncu oyunda değilse telefonuna bildirim gönderir. */
async function ping(ownerId: string | undefined, payload: PushPayload) {
  if (!ownerId) return;
  try {
    if (!(await isOnline(ownerId))) await sendToUser(ownerId, payload);
  } catch (e: any) {
    console.error("blackmail push", e?.message);
  }
}

/** Sır açığa çıktı: itibar, talep düşüşü, haber. */
async function expose(companyId: string, companyName: string, secret: SecretRow | null, b: BlackmailRow, selfReported: boolean) {
  const fx = exposure(b.severity, selfReported);
  const rep = await adjustRep(companyId, fx.rep);
  await addEffect(companyId, "demand", fx.demand, fx.hours, `Skandal: PC talebi ${fx.hours} saat %${Math.round(-fx.demand * 100)} düştü`, "skandal");
  invalidateMarket();
  if (selfReported) await postAbout(companyId, "scandal_self", { company: companyName, summary: b.summary.toLocaleLowerCase("tr") });
  else await postAbout(companyId, "scandal", { headline: secret?.headline ?? `${companyName} hakkında bir dosya basına sızdı: ${b.summary.toLocaleLowerCase("tr")}.` });
  return { rep, demand: fx.demand, hours: fx.hours };
}

/** Elindeki kullanılabilir ya da bir şantajda bekleyen dosyalar, sırlarıyla birlikte. */
async function heldDossiers(holder: string): Promise<(DossierRow & { secrets: SecretRow })[]> {
  const { data: ds, error } = await db().from("dossiers").select("*").eq("holder", holder).in("status", ["active", "pledged"]).order("obtained_at", { ascending: false }).limit(40);
  if (error) {
    if (isMissingTable(error)) return [];
    throw new HttpError(500, error.message);
  }
  if (!ds?.length) return [];
  const { data: ss, error: e2 } = await db().from("secrets").select("*").in("id", ds.map((d) => d.secret_id));
  if (e2) throw new HttpError(500, e2.message);
  const by = new Map((ss ?? []).map((x) => [x.id, x as SecretRow]));
  return (ds as DossierRow[]).filter((d) => by.has(d.secret_id)).map((d) => ({ ...d, secrets: by.get(d.secret_id)! }));
}

async function loadSecret(id: number | null): Promise<SecretRow | null> {
  if (!id) return null;
  const { data } = await db().from("secrets").select("*").eq("id", id).maybeSingle();
  return (data as SecretRow) ?? null;
}

function demandText(b: Pick<BlackmailRow, "demand_kind" | "amount" | "shares" | "tender_label">): string {
  if (b.demand_kind === "cash") return formatMoney(Number(b.amount));
  if (b.demand_kind === "shares") return `${b.shares} kurucu hissesi`;
  return `${b.tender_label ?? "ihale"} ihalesinden çekilmen`;
}

/** Talebin para karşılığı (açgözlülük ölçüsü). */
function demandWorth(kind: DemandKind, amount: number, shares: number, sharePrice: number, bond: number): number {
  if (kind === "cash") return amount;
  if (kind === "shares") return Math.round(shares * sharePrice);
  return bond * 4; // teminat toplamın %5'i; kâr payı ~%20 → teminat × 4
}

// ---------------------------------------------------------------------------
// Görünümler
// ---------------------------------------------------------------------------

/** Profil sayfası: bu şirkete ait elindeki dosyalar ve şantaj seçenekleri. */
export async function targetView(meId: string, targetId: string) {
  const { error: tErr } = await db().from("blackmails").select("id").limit(1);
  if (tErr) {
    if (isMissingTable(tErr)) return { ready: false as const };
    throw new HttpError(500, tErr.message);
  }
  if (meId === targetId) throw new HttpError(400, "Kendi şirketin");
  const { rows } = await equityBoard();
  const t = rows.get(targetId);
  if (!t) throw new HttpError(404, "Şirket bulunamadı");
  const now = Date.now();

  const dossiers = (await heldDossiers(meId))
    .filter((d) => d.secrets.company_id === targetId)
    .filter((d) => !d.secrets.exposed_at && new Date(d.secrets.expires_at).getTime() > now)
    .map((d) => {
      const s = d.secrets;
      const fresh = freshness(new Date(s.created_at).getTime(), now);
      const cooldown = d.cooldown_until && new Date(d.cooldown_until).getTime() > now ? d.cooldown_until : null;
      return {
        id: d.id,
        severity: s.severity,
        severityLabel: SEVERITY[s.severity].label,
        summary: s.summary,
        freshness: fresh,
        value: dossierValue(s.severity, t.value, fresh),
        expiresAt: s.expires_at,
        status: d.status,
        cooldownUntil: cooldown,
      };
    })
    .sort((a, b) => b.value - a.value);

  // Sınırlar
  const [{ data: bans }, { count: sent }, { data: serial }] = await Promise.all([
    db().from("blackmails").select("resolved_at, created_at").eq("blackmailer", meId).eq("caught", true).gte("created_at", hoursAgo(BAN_HOURS + 24)),
    db().from("blackmails").select("id", { count: "exact", head: true }).eq("blackmailer", meId).gte("created_at", hoursAgo(BLACKMAIL_WINDOW_HOURS)),
    db().from("blackmails").select("id").eq("blackmailer", meId).eq("target", targetId).gte("created_at", hoursAgo(SERIAL_HOURS)).limit(1),
  ]);
  const banUntil = (bans ?? [])
    .map((b) => new Date(b.resolved_at ?? b.created_at).getTime() + BAN_HOURS * 3_600_000)
    .filter((x) => x > now)
    .sort((a, b) => b - a)[0];
  const protectedUntil = new Date(t.createdAt).getTime() + PROTECT_HOURS * 3_600_000;
  let block: string | null = null;
  if (banUntil) block = "Şantaj yaparken yakalandın; bir süre kimse zarfını ciddiye almaz";
  else if ((sent ?? 0) >= BLACKMAILS_PER_WINDOW) block = `${BLACKMAIL_WINDOW_HOURS} saatte en fazla ${BLACKMAILS_PER_WINDOW} zarf gönderebilirsin`;
  else if (protectedUntil > now) block = "Yeni kurulan şirketler ilk iki gün şantajdan korunur";

  // İhale talebi yalnızca istihbaratla: rakibin hangi ihaleye girdiğini "İhale zarfını ele geçir" ile öğrenmiş olmalısın
  const { data: intel } = await db().from("ops_log").select("detail").eq("attacker", meId).eq("target", targetId).eq("kind", "tender").eq("success", true).gte("created_at", hoursAgo(12));
  const tenderIds = Array.from(new Set((intel ?? []).map((i: any) => i.detail?.tenderId).filter(Boolean)));
  let tenders: { id: string; label: string; bond: number; worth: number }[] = [];
  if (tenderIds.length) {
    const [{ data: ts }, { data: bids }] = await Promise.all([
      db().from("tenders").select("id, buyer, closes_at, status").in("id", tenderIds),
      db().from("tender_bids").select("tender_id, bond").eq("company_id", targetId).eq("status", "pending").in("tender_id", tenderIds),
    ]);
    tenders = (ts ?? [])
      .filter((x) => x.status === "open" && new Date(x.closes_at).getTime() > now)
      .map((x) => {
        const bid = (bids ?? []).find((b) => b.tender_id === x.id);
        return bid ? { id: x.id, label: x.buyer as string, bond: Number(bid.bond), worth: demandWorth("tender", 0, 0, 0, Number(bid.bond)) } : null;
      })
      .filter(Boolean) as any;
  }

  return {
    ready: true as const,
    dossiers,
    block,
    serial: !!serial?.length,
    sharePrice: t.price,
    maxShares: maxShareTransfer(t.founder, t.total),
    tenders,
    rules: { maxGreed: MAX_GREED, minDemand: MIN_DEMAND, answerHours: ANSWER_HOURS },
  };
}

type Party = { id: string; name: string; founderName: string; logo: unknown; logoUrl: string | null } | null;

function outcomeText(b: BlackmailRow, side: "in" | "out", other: string | null): string {
  const who = other ?? "Şantajcı";
  switch (b.status) {
    case "open":
      return "Yanıt bekliyor";
    case "paid":
      return side === "in" ? "Ödedin. Dosya şimdilik basına ulaşmadı." : `Ödendi: ${demandText(b)}.${b.outcome?.copy ? " Dosyanın bir kopyası hâlâ sende." : ""}`;
    case "refused":
      return side === "in" ? "Reddettin. Dosya basına sızdı." : "Reddetti. Dosyayı basına sızdırdın.";
    case "expired":
      if (b.outcome?.void) return "Sır başka yoldan açığa çıktı; tehdit boşa düştü.";
      return side === "in" ? "Yanıtsız kaldı. Dosya basına sızdı." : "Yanıt gelmedi. Dosya basına sızdı.";
    case "reported":
      if (side === "in") return b.caught ? `İhbar ettin. Şantajcı yakalandı: ${who}.` : "İhbar ettin. Sırrı kendin açıkladın, şantajcı bulunamadı.";
      return b.caught ? `İhbar edildin ve yakalandın. ${formatMoney(Number(b.outcome?.fine ?? 0))} ceza kesildi.` : "İhbar edildin ama iz sürülemedi. Sır yine de açığa çıktı.";
    case "countered":
      return side === "in" ? `Karşı tehditle püskürttün. Zarfın sahibi: ${who}.` : "Elinde senin de dosyan olduğunu gösterdi. İki taraf geri çekildi, dosyan yandı.";
    case "caught":
      return side === "in" ? `Şantaj girişimi engellendi. ${who} zarfı gönderirken yakalandı.` : `Zarfı gönderirken yakalandın. ${formatMoney(Number(b.outcome?.fine ?? 0))} ceza kesildi.`;
  }
}

/** Posta sekmesi: gelen tehditler, gönderdiğin zarflar ve elindeki dosyalar. */
export async function blackmailInbox(meId: string) {
  const { data: incoming, error } = await db().from("blackmails").select("*").eq("target", meId).order("created_at", { ascending: false }).limit(15);
  if (error) {
    if (isMissingTable(error)) return { ready: false as const };
    throw new HttpError(500, error.message);
  }
  const [{ data: outgoing }, ds, { count: myDossierCount }] = await Promise.all([
    db().from("blackmails").select("*").eq("blackmailer", meId).order("created_at", { ascending: false }).limit(15),
    heldDossiers(meId),
    db().from("dossiers").select("id", { count: "exact", head: true }).eq("holder", meId).eq("status", "active"),
  ]);
  const ins = (incoming ?? []) as BlackmailRow[];
  const outs = (outgoing ?? []) as BlackmailRow[];
  const now = Date.now();
  const dossierRows = ds.filter((d) => !d.secrets.exposed_at && new Date(d.secrets.expires_at).getTime() > now);
  const who = await names([...ins.filter((b) => b.revealed).map((b) => b.blackmailer), ...outs.map((b) => b.target), ...dossierRows.map((d) => d.secrets.company_id)]);
  const { rows } = await equityBoard();
  const party = (id: string): Party => {
    const c = who.get(id);
    return c ? { id, name: c.name, founderName: c.founderName, logo: c.logo, logoUrl: c.logoUrl } : null;
  };

  const view = (b: BlackmailRow, side: "in" | "out") => {
    const other = side === "in" ? (b.revealed ? party(b.blackmailer) : null) : party(b.target);
    return {
      id: b.id,
      side,
      other,
      severity: b.severity,
      severityLabel: SEVERITY[b.severity].label,
      summary: b.summary,
      demandKind: b.demand_kind,
      demandLabel: DEMAND_LABEL[b.demand_kind],
      demand: demandText(b),
      amount: Number(b.amount),
      shares: b.shares,
      note: b.note,
      status: b.status,
      outcome: outcomeText(b, side, other?.name ?? null),
      counterTried: b.counter_tried,
      createdAt: b.created_at,
      expiresAt: b.expires_at,
      resolvedAt: b.resolved_at,
      read: !!b.read_at,
      exposure: exposure(b.severity, false),
      exposureSelf: exposure(b.severity, true),
    };
  };

  return {
    ready: true as const,
    incoming: ins.filter((b) => b.status !== "caught" || b.revealed).map((b) => view(b, "in")),
    outgoing: outs.map((b) => view(b, "out")),
    dossiers: dossierRows.map((d) => {
      const s = d.secrets;
      const fresh = freshness(new Date(s.created_at).getTime(), now);
      return {
        id: d.id,
        target: party(s.company_id),
        severity: s.severity,
        severityLabel: SEVERITY[s.severity].label,
        summary: s.summary,
        freshness: fresh,
        value: dossierValue(s.severity, rows.get(s.company_id)?.value ?? 0, fresh),
        expiresAt: s.expires_at,
        status: d.status,
        cooldownUntil: d.cooldown_until && new Date(d.cooldown_until).getTime() > now ? d.cooldown_until : null,
      };
    }),
    canCounter: (myDossierCount ?? 0) > 0,
    open: ins.filter((b) => b.status === "open").length,
  };
}

/** Okunmamış/yanıt bekleyen tehdit sayısı (Posta rozeti). */
export async function openThreats(meId: string): Promise<number> {
  const { count, error } = await db().from("blackmails").select("id", { count: "exact", head: true }).eq("target", meId).eq("status", "open");
  if (error) return 0;
  return count ?? 0;
}

// ---------------------------------------------------------------------------
// Gönder
// ---------------------------------------------------------------------------

export async function sendBlackmail(
  me: { id: string; name: string },
  targetId: string,
  input: { dossierId: number; kind: string; amount?: number; shares?: number; tenderId?: string; note?: string }
) {
  const v = await targetView(me.id, targetId);
  if (!v.ready) throw new HttpError(503, NEED);
  if (v.block) throw new HttpError(429, v.block);
  const d = v.dossiers.find((x) => x.id === Number(input.dossierId));
  if (!d) throw new HttpError(404, "Bu şirkete ait böyle bir dosyan yok");
  if (d.status !== "active" || d.cooldownUntil) throw new HttpError(409, "Bu dosya şu an kullanılamaz");

  const kind = input.kind as DemandKind;
  if (!["cash", "shares", "tender"].includes(kind)) throw new HttpError(400, "Talep geçersiz");
  const amount = kind === "cash" ? Math.round(Number(input.amount) / 100) * 100 : 0;
  const shares = kind === "shares" ? Math.floor(Number(input.shares)) : 0;
  const tender = kind === "tender" ? v.tenders.find((t) => t.id === String(input.tenderId ?? "")) : undefined;
  if (kind === "cash" && !(amount >= MIN_DEMAND)) throw new HttpError(400, `En az ${formatMoney(MIN_DEMAND)} isteyebilirsin`);
  if (kind === "shares" && !(shares >= 1 && shares <= v.maxShares)) {
    throw new HttpError(400, v.maxShares ? `En fazla ${v.maxShares} hisse isteyebilirsin (kurucu %51'in altına inemez)` : "Kurucunun devredebileceği hissesi yok");
  }
  if (kind === "tender" && !tender) throw new HttpError(400, "Rakibin girdiği bir ihaleyi önce istihbaratla öğrenmelisin");
  const note = String(input.note ?? "").trim().slice(0, 280) || null;

  const worth = demandWorth(kind, amount, shares, v.sharePrice, tender?.bond ?? 0);
  if (worth > d.value * MAX_GREED) throw new HttpError(400, `Bu dosya için en fazla ${formatMoney(d.value * MAX_GREED)} değerinde bir şey isteyebilirsin`);

  const chance = sendCatchChance(d.severity, worth, d.value, v.serial);
  const caught = roll(chance);
  const fine = caughtFine(d.value);
  const { data: r, error } = await db().rpc("blackmail_send", {
    p_blackmailer: me.id,
    p_target: targetId,
    p_dossier: d.id,
    p_kind: kind,
    p_amount: amount,
    p_shares: shares,
    p_tender: tender?.id ?? null,
    p_tender_label: tender?.label ?? null,
    p_note: note,
    p_fair: d.value,
    p_answer_hours: ANSWER_HOURS,
    p_window_hours: BLACKMAIL_WINDOW_HOURS,
    p_per_window: BLACKMAILS_PER_WINDOW,
    p_protect_hours: PROTECT_HOURS,
    p_ban_hours: BAN_HOURS,
    p_caught: caught,
    p_fine: fine,
  });
  if (error) {
    const m = error.message;
    if (/Hedef meşgul/.test(m)) throw new HttpError(409, "Bu şirketin masasında zaten açık bir tehdit var; sıranı bekle");
    if (/Şantaj sınırı/.test(m)) throw new HttpError(429, `${BLACKMAIL_WINDOW_HOURS} saatte en fazla ${BLACKMAILS_PER_WINDOW} zarf gönderebilirsin`);
    if (/Şantaj yasağı/.test(m)) throw new HttpError(429, "Şantaj yaparken yakalandın; bir süre bekle");
    if (/Yeni şirket/.test(m)) throw new HttpError(409, "Yeni kurulan şirketler ilk iki gün şantajdan korunur");
    if (/Kontrol payı/.test(m)) throw new HttpError(400, "Kurucu %51'in altına inemez");
    if (/İhale teklifi yok/.test(m)) throw new HttpError(409, "Rakibin o ihaledeki teklifi artık yok");
    if (/Dosya bayat/.test(m)) throw new HttpError(409, "Bu dosyanın değeri kalmadı");
    if (/Dosya/.test(m)) throw new HttpError(409, "Bu dosya şu an kullanılamaz");
    if (/blackmail_send/.test(m)) throw new HttpError(503, NEED);
    throw new HttpError(500, m);
  }

  const people = await names([me.id, targetId]);
  const targetName = people.get(targetId)?.name ?? "Rakip";
  if (r.caught) {
    const rep = await adjustRep(me.id, -CAUGHT_REP);
    await postAbout(me.id, "blackmail_caught", { company: me.name, target: targetName });
    await logEvent(me.id, "ops", `Şantaj (${targetName}): zarf yolda ele geçirildi, yakalandın. Ceza ${formatMoney(Number(r.fine))}, itibar ${rep}.`, -Number(r.fine));
    await logEvent(targetId, "crisis", `${me.name} şirketi sana şantaj yapmaya çalışırken yakalandı. Zarf sana ulaşmadı.`);
    await ping(people.get(targetId)?.ownerId, { title: "Şantajcın yakalandı", body: `${me.name} sana şantaj yapmaya çalışırken yakalandı.`, url: "/oyun?sekme=posta", tag: "santaj" });
    return { caught: true, message: `Zarf yolda ele geçirildi. Yakalandın: ${formatMoney(Number(r.fine))} ceza, itibar ${rep}, haber oldu.` };
  }

  await logEvent(me.id, "ops", `İsimsiz bir zarf ${targetName} şirketine ulaştı. Talep: ${demandText({ demand_kind: kind, amount, shares, tender_label: tender?.label ?? null })}.`);
  await logEvent(targetId, "crisis", "Masana isimsiz bir zarf bırakıldı. İçinde senin hakkında bir dosya var.");
  await ping(people.get(targetId)?.ownerId, {
    title: "İsimsiz bir zarf geldi",
    body: `Biri hakkında bir dosya tuttuğunu söylüyor. ${ANSWER_HOURS} saatin var.`,
    url: "/oyun?sekme=posta",
    tag: "santaj",
  });
  return { caught: false, message: `Zarf ulaştı. ${targetName} ${ANSWER_HOURS} saat içinde yanıt vermezse dosya basına sızar.` };
}

// ---------------------------------------------------------------------------
// Yanıt
// ---------------------------------------------------------------------------

type Action = "pay" | "refuse" | "report" | "counter" | "expire";

async function applyResolution(b: BlackmailRow, action: Action, r: any) {
  const people = await names([b.blackmailer, b.target]);
  const bl = people.get(b.blackmailer);
  const tg = people.get(b.target);
  const blName = bl?.name ?? "Şantajcı";
  const tgName = tg?.name ?? "Hedef";
  const what = demandText(b);

  if (r.status === "paid") {
    if (b.demand_kind === "cash") {
      await logEvent(b.target, "crisis", `İsimsiz zarfın sahibine ${what} ödendi. Dosya şimdilik basına ulaşmadı.`, -Number(b.amount));
      await logEvent(b.blackmailer, "ops", `${tgName} zarfa karşılık ödedi: ${what}.`, Number(b.amount));
    } else if (b.demand_kind === "shares") {
      invalidateEquity();
      await logEvent(b.target, "crisis", `İsimsiz zarfın sahibine ${what} devredildi.`);
      await logEvent(b.blackmailer, "ops", `${tgName} zarfa karşılık ${b.shares} hissesini sana devretti.`);
    } else {
      await logEvent(b.target, "tender", `${b.tender_label} ihalesindeki teklifin, isimsiz zarfın talebiyle geri çekildi. Teminat iade edildi.`);
      await logEvent(b.blackmailer, "ops", `${tgName}, ${b.tender_label} ihalesinden çekildi.`);
    }
    if (r.copy) await logEvent(b.blackmailer, "ops", "Dosyanın bir kopyasını sakladın. Bir gün sonra yeniden işe yarayabilir.");
    // Kirli iş: şantaj yapan da şantaja açık hale gelir
    await recordSecret(b.blackmailer, "blackmail", { company: blName, target: tgName });
    await ping(bl?.ownerId, { title: "Zarfın karşılık buldu", body: `${tgName} ödedi: ${what}.`, url: "/oyun?sekme=posta", tag: "santaj-sonuc" });
    return `Ödendi. Dosya şimdilik kimsenin eline geçmedi.`;
  }

  if (r.status === "countered") {
    await postAbout(null, "blackmail_standoff", {});
    await logEvent(b.target, "crisis", `Karşı dosyan işe yaradı: zarfın sahibi ${blName}. İki taraf da geri çekildi.`);
    await logEvent(b.blackmailer, "ops", `${tgName} elinde senin de dosyan olduğunu gösterdi. Tehdit geri çekildi, dosyan yandı.`);
    await ping(bl?.ownerId, { title: "Karşı tehdit", body: `${tgName} elinde senin de dosyan olduğunu gösterdi. İki taraf geri çekildi.`, url: "/oyun?sekme=posta", tag: "santaj-sonuc" });
    return `Zarfın sahibi ${blName} çıktı. Elindeki dosyayı gösterdin; ikiniz de geri çekildiniz.`;
  }

  // refuse / expire / report: sır açığa çıktı
  const secret = await loadSecret(b.secret_id);
  const self = r.status === "report";
  const fx = await expose(b.target, tgName, secret, b, self);
  const effectText = `itibar ${fx.rep}, PC talebi ${fx.hours} saat %${Math.round(-fx.demand * 100)} düştü`;

  if (r.status === "report") {
    if (r.caught) {
      const rep = await adjustRep(b.blackmailer, -CAUGHT_REP);
      await postAbout(b.blackmailer, "blackmail_caught", { company: blName, target: tgName });
      await logEvent(b.blackmailer, "ops", `${tgName} seni ihbar etti ve yakalandın. Ceza ${formatMoney(Number(r.fine))}, itibar ${rep}. Bir gün şantaj yapamazsın.`, -Number(r.fine));
      await logEvent(b.target, "crisis", `Şantajı ihbar ettin ve dosyayı kendin açıkladın (${effectText}). Şantajcı yakalandı: ${blName}.`);
    } else {
      await postAbout(null, "blackmail_unknown", { target: tgName });
      await recordSecret(b.blackmailer, "blackmail", { company: blName, target: tgName });
      await logEvent(b.blackmailer, "ops", `${tgName} zarfı ihbar etti ama iz sürülemedi. Dosya kendi eliyle açıklandı.`);
      await logEvent(b.target, "crisis", `Şantajı ihbar ettin ve dosyayı kendin açıkladın (${effectText}). Şantajcı bulunamadı.`);
    }
    await ping(bl?.ownerId, { title: r.caught ? "Yakalandın" : "Zarfın ihbar edildi", body: r.caught ? `${tgName} seni ihbar etti.` : `${tgName} zarfı ihbar etti ama iz sürülemedi.`, url: "/oyun?sekme=posta", tag: "santaj-sonuc" });
    return r.caught ? `İhbar ettin. Şantajcı yakalandı: ${blName}. Sırrı kendin açıkladığın için etkisi hafif (${effectText}).` : `İhbar ettin ama şantajcı bulunamadı. Sırrı kendin açıkladığın için etkisi hafif (${effectText}).`;
  }

  // ret ya da süre doldu
  await recordSecret(b.blackmailer, "blackmail", { company: blName, target: tgName });
  const expired = r.status === "expire";
  await logEvent(b.target, "crisis", `${expired ? "İsimsiz zarfa yanıt vermedin" : "Şantajı reddettin"}; dosya basına sızdı (${effectText}).`);
  await logEvent(b.blackmailer, "ops", `${tgName} ${expired ? "yanıt vermedi" : "ödemeyi reddetti"}. Dosyayı basına sızdırdın.`);
  await ping(bl?.ownerId, { title: expired ? "Süre doldu" : "Şantaj reddedildi", body: `${tgName} ${expired ? "yanıt vermedi" : "ödemedi"}; dosya basına sızdı.`, url: "/oyun?sekme=posta", tag: "santaj-sonuc" });
  if (expired) await ping(tg?.ownerId, { title: "Dosya basına sızdı", body: "İsimsiz zarfa yanıt vermedin. Hakkındaki dosya gazetede.", url: "/oyun?sekme=gundem", tag: "santaj" });
  return `Reddettin. Dosya basına sızdı (${effectText}).`;
}

export async function resolveBlackmail(meId: string, id: string, action: string) {
  if (!["pay", "refuse", "report", "counter"].includes(action)) throw new HttpError(400, "İşlem geçersiz");
  const { data, error } = await db().from("blackmails").select("*").eq("id", id).eq("target", meId).maybeSingle();
  if (error) {
    if (isMissingTable(error)) throw new HttpError(503, NEED);
    throw new HttpError(500, error.message);
  }
  if (!data) throw new HttpError(404, "Tehdit bulunamadı");
  const b = data as BlackmailRow;
  if (b.status !== "open") throw new HttpError(409, "Bu tehdit artık sonuçlandı");

  let copy = false;
  let caught = false;
  if (action === "pay") copy = roll(COPY_KEEP);
  if (action === "report") {
    const { data: serial } = await db().from("blackmails").select("id").eq("blackmailer", b.blackmailer).eq("target", meId).neq("id", b.id).gte("created_at", hoursAgo(SERIAL_HOURS)).limit(1);
    caught = roll(reportCatchChance(!!serial?.length));
  }
  const { data: r, error: rErr } = await db().rpc("blackmail_resolve", {
    p_id: b.id,
    p_actor: meId,
    p_action: action,
    p_copy: copy,
    p_caught: caught,
    p_fine: caughtFine(Number(b.fair)),
    p_cooldown_hours: COPY_COOLDOWN_HOURS,
  });
  if (rErr) {
    const m = rErr.message;
    if (/Yetersiz nakit/.test(m)) throw new HttpError(400, `Ödemek için kasada ${formatMoney(Number(b.amount))} olmalı`);
    if (/Kontrol payı/.test(m)) throw new HttpError(400, "Bu kadar hisse devredersen kontrolü kaybedersin (%51 sınırı)");
    if (/İhale kapandı|İhale teklifi yok/.test(m)) throw new HttpError(409, "O ihaledeki teklifin artık yok; talep yerine getirilemez");
    if (/Süre doldu/.test(m)) throw new HttpError(409, "Süre doldu");
    if (/Zaten denendi/.test(m)) throw new HttpError(409, "Karşı tehdidi zaten denedin");
    throw new HttpError(500, m);
  }
  if (!r) throw new HttpError(409, "Bu tehdit artık sonuçlandı");
  if (r.status === "open") {
    // Karşı tehdit tutmadı
    return { message: "Elindeki dosyaların hiçbiri bu zarfın sahibine ait değil. Karşı tehdit işe yaramadı." };
  }
  await db().from("blackmails").update({ read_at: new Date().toISOString() }).eq("id", b.id);
  return { message: await applyResolution(b, action as Action, r) };
}

/** Süresi dolan tehditleri sonuçlandırır (ret sayılır). Kısa aralıkla sınırlı; her istekte çağrılabilir. */
let lastSweep = 0;
export async function sweepBlackmails(): Promise<boolean> {
  const now = Date.now();
  if (now - lastSweep < 20_000) return false;
  lastSweep = now;
  const { data, error } = await db().from("blackmails").select("*").eq("status", "open").lte("expires_at", new Date(now).toISOString()).limit(10);
  if (error) return false;
  let changed = false;
  for (const b of (data ?? []) as BlackmailRow[]) {
    const { data: r, error: e } = await db().rpc("blackmail_resolve", { p_id: b.id, p_actor: null, p_action: "expire", p_copy: false, p_caught: false, p_fine: 0, p_cooldown_hours: COPY_COOLDOWN_HOURS });
    if (e || !r) continue;
    changed = true;
    await applyResolution(b, "expire", r).catch((x) => console.error("blackmail expire", x?.message));
  }
  return changed;
}

/** Tehditleri okundu işaretle. */
export async function markThreatsRead(meId: string) {
  await db().from("blackmails").update({ read_at: new Date().toISOString() }).eq("target", meId).is("read_at", null);
}
