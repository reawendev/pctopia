// Gizli operasyonlar — YALNIZCA SUNUCU.

import { formatMoney } from "../game/economy";
import { STAFF, type Role } from "../game/finance";
import { CAUGHT_REP, HITS_PER_TARGET, OP_BY_ID, OP_WINDOW_HOURS, opCost, OPS, OPS_PER_WINDOW, type Op, type OpId } from "../game/ops";
import { TECH_BY_ID, TECHS } from "../game/research";
import { isMissingTable, logEvent } from "./company";
import { addEffect } from "./effects";
import { equityBoard } from "./equity";
import { postAbout } from "./social";
import { db, HttpError } from "./supabase";
import { invalidateMarket } from "./workshop";

const NEED = "Gizli operasyonlar için veritabanında 011_halka_arz_operasyon.sql çalıştırılmalı";

// Yalnızca testler için: "1,0;0,1" → sırayla (başarı, yakalanma) zarları
let rollIndex = 0;
function roll(op: Op): { success: boolean; caught: boolean } {
  const fixed = process.env.OPS_TEST_ROLLS;
  if (fixed) {
    const seq = fixed.split(";");
    const [s, c] = seq[rollIndex++ % seq.length].split(",");
    return { success: s === "1", caught: c === "1" };
  }
  return { success: Math.random() < op.p, caught: Math.random() < op.caught };
}

const windowStart = () => new Date(Date.now() - OP_WINDOW_HOURS * 3_600_000).toISOString();

type Pre = { ok: boolean; reason?: string };

/** Operasyonun önkoşulu (hedefte ilan, Ar-Ge, ihale teklifi, çalışan var mı). */
async function precondition(op: OpId, attacker: string, target: string): Promise<Pre & { pick?: any }> {
  switch (op) {
    case "reviews": {
      const { data } = await db().from("pc_models").select("id").eq("company_id", target).eq("listed", true).gt("stock", 0).limit(1);
      return data?.length ? { ok: true } : { ok: false, reason: "Rakibin satışta ürünü yok" };
    }
    case "spy": {
      const { data, error } = await db().from("research").select("company_id, tech_id, done_at").in("company_id", [attacker, target]);
      if (error) return { ok: false, reason: isMissingTable(error) ? "Ar-Ge henüz etkin değil" : error.message };
      const now = Date.now();
      const mine = new Set((data ?? []).filter((r) => r.company_id === attacker).map((r) => r.tech_id));
      const theirs = (data ?? []).filter((r) => r.company_id === target && new Date(r.done_at).getTime() <= now && !mine.has(r.tech_id));
      const best = theirs.map((r) => TECH_BY_ID[r.tech_id]).filter(Boolean).sort((a, b) => b.cost - a.cost)[0];
      return best ? { ok: true, pick: best } : { ok: false, reason: "Rakibin sende olmayan tamamlanmış bir Ar-Ge projesi yok" };
    }
    case "tender": {
      const { data, error } = await db().from("tender_bids").select("tender_id, unit_price").eq("company_id", target).eq("status", "pending");
      if (error) return { ok: false, reason: isMissingTable(error) ? "İhaleler henüz etkin değil" : error.message };
      if (!data?.length) return { ok: false, reason: "Rakibin açık bir ihalede teklifi yok" };
      const ids = data.map((d) => d.tender_id);
      const { data: ts } = await db().from("tenders").select("id, buyer, title, closes_at, status").in("id", ids);
      const open = (ts ?? []).filter((t) => t.status === "open" && new Date(t.closes_at).getTime() > Date.now());
      const bid = data.find((d) => open.some((t) => t.id === d.tender_id));
      return bid ? { ok: true, pick: { ...bid, tender: open.find((t) => t.id === bid.tender_id) } } : { ok: false, reason: "Rakibin açık bir ihalede teklifi yok" };
    }
    case "poach": {
      const { data } = await db().from("employees").select("role").eq("company_id", target);
      return data?.length ? { ok: true, pick: data[Math.floor(Math.random() * data.length)].role } : { ok: false, reason: "Rakibin çalışanı yok" };
    }
    default:
      return { ok: true };
  }
}

/** Hedef profili için operasyon listesi: bedel, olasılıklar, uygunluk. */
export async function opsView(attacker: string, target: string) {
  const { error: tErr } = await db().from("ops_log").select("id").limit(1);
  if (tErr) {
    if (isMissingTable(tErr)) return { ready: false as const };
    throw new HttpError(500, tErr.message);
  }
  const { rows } = await equityBoard();
  const t = rows.get(target);
  if (!t) throw new HttpError(404, "Şirket bulunamadı");
  const since = windowStart();
  const [{ count: mine }, { data: same }, { count: hits }] = await Promise.all([
    db().from("ops_log").select("id", { count: "exact", head: true }).eq("attacker", attacker).gte("created_at", since),
    db().from("ops_log").select("created_at").eq("attacker", attacker).eq("target", target).gte("created_at", since).order("created_at", { ascending: false }).limit(1),
    db().from("ops_log").select("id", { count: "exact", head: true }).eq("target", target).eq("success", true).gte("created_at", since),
  ]);
  let block: string | null = null;
  if ((mine ?? 0) >= OPS_PER_WINDOW) block = `${OP_WINDOW_HOURS} saatte en fazla ${OPS_PER_WINDOW} operasyon yürütebilirsin`;
  else if (same?.length) block = `Bu şirkete ${OP_WINDOW_HOURS} saatte bir operasyon düzenleyebilirsin`;
  else if ((hits ?? 0) >= HITS_PER_TARGET) block = "Hedef tetikte: son saatlerde çok saldırı aldı";
  const ops = [];
  for (const op of OPS) {
    const pre = await precondition(op.id, attacker, target);
    ops.push({ ...op, cost: opCost(op, t.value), available: pre.ok && !block, reason: block ?? pre.reason ?? null });
  }
  const nextAt = same?.[0] ? new Date(new Date(same[0].created_at).getTime() + OP_WINDOW_HOURS * 3_600_000).toISOString() : null;
  return { ready: true as const, ops, block, nextAt };
}

export async function runOp(attacker: { id: string; name: string; staff: Role[] }, targetId: string, opId: string) {
  const op = OP_BY_ID[opId];
  if (!op) throw new HttpError(400, "Operasyon geçersiz");
  if (targetId === attacker.id) throw new HttpError(400, "Kendi şirketine operasyon düzenleyemezsin");
  const v = await opsView(attacker.id, targetId);
  if (!v.ready) throw new HttpError(503, NEED);
  const row = v.ops.find((o) => o.id === op.id)!;
  if (!row.available) throw new HttpError(v.block ? 429 : 400, row.reason ?? "Bu operasyon şu an yapılamaz");
  const pre = await precondition(op.id, attacker.id, targetId);
  const { rows } = await equityBoard();
  const t = rows.get(targetId)!;

  const { data: paid, error: payErr } = await db().rpc("spend_cash", { p_company: attacker.id, p_amount: row.cost });
  if (payErr) throw new HttpError(payErr.message.includes("spend_cash") ? 503 : 500, payErr.message.includes("spend_cash") ? NEED : payErr.message);
  if (!paid) throw new HttpError(400, `Bu operasyon için kasada ${formatMoney(row.cost)} olmalı`);

  const { success, caught } = roll(op);
  let message = "";
  let detail: Record<string, unknown> = {};

  if (success) {
    switch (op.id) {
      case "smear":
        await postAbout(t.id, "smear", { company: t.name, founder: t.founderName });
        await addEffect(t.id, "demand", -0.15, 6, "Karalama kampanyası: PC talebi 6 saat %15 düştü", "operasyon");
        await logEvent(t.id, "crisis", "Hakkında karalama haberleri dolaşıyor. Kaynağı belli değil.");
        message = `Dosya basına ulaştı: ${t.name} hakkında olumsuz haber çıktı.`;
        break;
      case "reviews":
        await postAbout(t.id, "fake_reviews", { company: t.name });
        await addEffect(t.id, "demand", -0.3, 4, "Sahte yorum dalgası: PC talebi 4 saat %30 düştü", "operasyon");
        await logEvent(t.id, "crisis", "Ürünlerine bir anda yüzlerce olumsuz yorum geldi.");
        message = `${t.name} ürünlerine kötü yorum yağıyor.`;
        break;
      case "spy": {
        const tech = pre.pick as (typeof TECHS)[number];
        const now = new Date().toISOString();
        await db().from("research").insert({ company_id: attacker.id, tech_id: tech.id, started_at: now, done_at: now, cost: 0, announced: true });
        await logEvent(t.id, "crisis", "Ar-Ge sunucularına yetkisiz erişim tespit edildi.");
        await logEvent(attacker.id, "research", `Casusluk: “${tech.name}” dosyaları ele geçirildi ve uygulandı.`);
        detail = { tech: tech.name };
        message = `“${tech.name}” dosyaları ele geçirildi, artık senin.${tech.patent ? " Patent başkasındaysa süresi bitince kullanabilirsin." : ""}`;
        break;
      }
      case "tender": {
        const b = pre.pick;
        detail = { tenderId: b.tender_id, buyer: b.tender.buyer, unitPrice: Number(b.unit_price) };
        await logEvent(attacker.id, "tender", `İstihbarat: ${t.name}, ${b.tender.buyer} ihalesine birim ${formatMoney(Number(b.unit_price))} teklif vermiş.`);
        message = `${t.name}, ${b.tender.buyer} ihalesine birim ${formatMoney(Number(b.unit_price))} teklif vermiş.`;
        break;
      }
      case "poach": {
        const role = pre.pick as Role;
        await db().from("employees").delete().eq("company_id", t.id).eq("role", role);
        await logEvent(t.id, "crisis", `${STAFF[role]?.name ?? "Bir çalışanın"} istifa etti. Rakip bir şirkete geçtiği konuşuluyor.`);
        detail = { role };
        message = `${t.name} şirketinin ${STAFF[role]?.name.toLocaleLowerCase("tr") ?? "çalışanı"} istifa etti.`;
        break;
      }
    }
    if (op.id === "smear" || op.id === "reviews") invalidateMarket();
  } else {
    message = "Operasyon sonuç vermedi.";
  }

  if (caught) {
    const pr = attacker.staff.includes("pr");
    const rep = -(pr ? Math.trunc(CAUGHT_REP / 2) : CAUGHT_REP);
    await db().rpc("adjust_reputation", { p_company: attacker.id, p_delta: rep });
    await postAbout(attacker.id, "op_caught", { company: attacker.name, target: t.name });
    await logEvent(t.id, "crisis", `Hukuk ekibin, ${attacker.name} şirketinin sana karşı “${op.name}” düzenlediğini ortaya çıkardı.`);
    message += ` Ama yakalandın: haber oldu, itibarın ${-rep} düştü.`;
  }

  await db().from("ops_log").insert({ attacker: attacker.id, target: t.id, kind: op.id, cost: row.cost, success, caught, detail });
  await logEvent(attacker.id, "ops", `Gizli operasyon (${t.name}): ${op.name}. ${success ? "Başarılı" : "Başarısız"}${caught ? ", yakalandı" : ""}. Bedel ${formatMoney(row.cost)}.`, -row.cost);
  return { success, caught, message: message.trim(), detail };
}
