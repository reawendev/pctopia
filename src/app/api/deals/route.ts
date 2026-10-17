import { DEAL_LABEL, DEAL_TTL_HOURS, MAX_REVSHARE_TOTAL, type DealKind, type LoanTerms, type RevshareTerms, type WholesaleTerms } from "@/lib/game/finance";
import { formatMoney } from "@/lib/game/economy";
import { isMissingTable, loadCompany, loadJournal, logEvent, view } from "@/lib/server/company";
import type { DealRow } from "@/lib/server/finance";
import { postAbout } from "@/lib/server/social";
import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";
import { invalidateMarket } from "@/lib/server/workshop";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const NEED = "Anlaşmalar için veritabanında 007_finans.sql çalıştırılmalı";
const KINDS: DealKind[] = ["wholesale", "loan", "revshare"];

function describe(kind: DealKind, t: any): string {
  if (kind === "wholesale") return `${t.qty} adet “${t.modelName}”, adedi ${formatMoney(t.unitPrice)} (toplam ${formatMoney(t.qty * t.unitPrice)})`;
  if (kind === "loan") return `${formatMoney(t.amount)} borç, ${t.days} gün vade, %${t.interestPct} faiz (geri ödeme ${formatMoney(Math.ceil(t.amount * (1 + t.interestPct / 100)))})`;
  return `${formatMoney(t.payment)} karşılığında ${t.days} gün boyunca gelirin %${t.sharePct} payı`;
}

async function snapshot(userId: string, extra: Record<string, unknown> = {}) {
  const state = await loadCompany(userId);
  if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
  const id = state.company.id;
  const [inc, out] = await Promise.all([
    db().from("deals").select("*").eq("to_company", id).order("created_at", { ascending: false }).limit(30),
    db().from("deals").select("*").eq("from_company", id).order("created_at", { ascending: false }).limit(30),
  ]);
  if (inc.error) {
    if (isMissingTable(inc.error)) return { ready: false, ...extra };
    throw new HttpError(500, inc.error.message);
  }
  const rows = [...((inc.data ?? []) as DealRow[]), ...((out.data ?? []) as DealRow[])];
  const ids = Array.from(new Set(rows.flatMap((d) => [d.from_company, d.to_company])));
  const names = new Map<string, any>();
  if (ids.length) {
    const { data } = await db().from("companies").select("*").in("id", ids);
    for (const c of data ?? []) names.set(c.id, { id: c.id, name: c.name, founderName: c.founder_name, logo: c.logo, logoUrl: c.logo_url ?? null });
  }
  const gone = { name: "Kapanmış şirket", founderName: "", logo: null, logoUrl: null };
  const v = (d: DealRow) => ({
    id: d.id,
    kind: d.kind,
    kindLabel: DEAL_LABEL[d.kind],
    summary: describe(d.kind, d.terms),
    terms: d.terms,
    note: d.note,
    status: d.status,
    from: names.get(d.from_company) ?? { id: d.from_company, ...gone },
    to: names.get(d.to_company) ?? { id: d.to_company, ...gone },
    createdAt: d.created_at,
    expiresAt: d.expires_at,
    endsAt: d.ends_at,
    result: d.result,
  });
  const { data: models } = await db().from("pc_models").select("id, name, stock, price, parts").eq("company_id", id);
  return {
    ready: true,
    incoming: ((inc.data ?? []) as DealRow[]).map(v),
    outgoing: ((out.data ?? []) as DealRow[]).map(v),
    myModels: (models ?? []).map((m) => ({ id: m.id, name: m.name, stock: m.stock, price: Number(m.price) })),
    pending: ((inc.data ?? []) as DealRow[]).filter((d) => d.status === "pending" && new Date(d.expires_at).getTime() > Date.now()).length,
    ...extra,
  };
}

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  return snapshot(user.id);
});

const int = (x: unknown) => Math.trunc(Number(x));

export const POST = handle(async (req) => {
  const user = await requireUser(req);
  const body = await req.json().catch(() => ({}));
  const state = await loadCompany(user.id);
  if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
  const me = state.company;
  let message = "";

  if (body.action === "propose") {
    const kind = body.kind as DealKind;
    if (!KINDS.includes(kind)) throw new HttpError(400, "Anlaşma türü geçersiz");
    const to = String(body.toCompanyId ?? "");
    if (!to || to === me.id) throw new HttpError(400, "Karşı taraf geçersiz");
    const { data: target } = await db().from("companies").select("id, name").eq("id", to).maybeSingle();
    if (!target) throw new HttpError(404, "Karşı şirket bulunamadı");
    const note = String(body.note ?? "").trim().slice(0, 300) || null;
    const t = body.terms ?? {};
    let terms: WholesaleTerms | LoanTerms | RevshareTerms;

    if (kind === "wholesale") {
      const { data: m } = await db().from("pc_models").select("*").eq("id", String(t.modelId ?? "")).eq("company_id", me.id).maybeSingle();
      if (!m) throw new HttpError(404, "Model bulunamadı");
      const qty = int(t.qty), unitPrice = int(t.unitPrice);
      if (!(qty >= 1 && qty <= 200)) throw new HttpError(400, "Adet 1-200 arası olmalı");
      if (qty > m.stock) throw new HttpError(400, `Depoda yalnızca ${m.stock} adet var`);
      if (!(unitPrice >= 1)) throw new HttpError(400, "Birim fiyat geçersiz");
      terms = { modelId: m.id, modelName: m.name, parts: m.parts, qty, unitPrice };
    } else if (kind === "loan") {
      const amount = int(t.amount), interestPct = int(t.interestPct), days = int(t.days);
      if (!(amount >= 100)) throw new HttpError(400, "Borç en az $100 olmalı");
      if (!(interestPct >= 0 && interestPct <= 100)) throw new HttpError(400, "Faiz %0-100 arası olmalı");
      if (!(days >= 1 && days <= 7)) throw new HttpError(400, "Vade 1-7 gün olmalı");
      if (Number(me.cash) < amount) throw new HttpError(400, "Kasanda bu kadar nakit yok");
      terms = { amount, interestPct, days };
    } else {
      const payment = int(t.payment), sharePct = int(t.sharePct), days = int(t.days);
      if (!(payment >= 100)) throw new HttpError(400, "Ödeme en az $100 olmalı");
      if (!(sharePct >= 1 && sharePct <= 25)) throw new HttpError(400, "Pay %1-25 arası olmalı");
      if (!(days >= 1 && days <= 7)) throw new HttpError(400, "Süre 1-7 gün olmalı");
      if (Number(me.cash) < payment) throw new HttpError(400, "Kasanda bu kadar nakit yok");
      terms = { payment, sharePct, days };
    }

    const { count } = await db().from("deals").select("id", { count: "exact", head: true }).eq("from_company", me.id).eq("status", "pending");
    if ((count ?? 0) >= 10) throw new HttpError(429, "Yanıt bekleyen en fazla 10 teklifin olabilir");
    const { error } = await db().from("deals").insert({
      kind,
      from_company: me.id,
      to_company: to,
      terms,
      note,
      expires_at: new Date(Date.now() + DEAL_TTL_HOURS * 3_600_000).toISOString(),
    });
    if (error) {
      if (isMissingTable(error)) throw new HttpError(503, NEED);
      throw new HttpError(500, error.message);
    }
    // Karşı tarafa posta ile haber ver
    await db().from("messages").insert({
      from_company: me.id,
      to_company: to,
      subject: `Anlaşma teklifi: ${DEAL_LABEL[kind]}`,
      body: `${describe(kind, terms)}.${note ? `\n\n${note}` : ""}\n\nTeklifi Finans > Anlaşmalar bölümünden kabul edebilir ya da reddedebilirsin. ${DEAL_TTL_HOURS} saat geçerli.`,
    });
    message = `Teklif ${target.name} şirketine gönderildi.`;
  } else {
    const id = String(body.dealId ?? "");
    const { data: d, error } = await db().from("deals").select("*").eq("id", id).maybeSingle();
    if (error) throw new HttpError(500, error.message);
    if (!d) throw new HttpError(404, "Anlaşma bulunamadı");
    const deal = d as DealRow;

    if (body.action === "cancel") {
      if (deal.from_company !== me.id) throw new HttpError(403, "Yalnızca kendi teklifini geri çekebilirsin");
      await db().from("deals").update({ status: "cancelled" }).eq("id", id).eq("status", "pending");
      message = "Teklif geri çekildi.";
    } else if (body.action === "decline") {
      if (deal.to_company !== me.id) throw new HttpError(403, "Bu teklif sana yapılmadı");
      await db().from("deals").update({ status: "declined" }).eq("id", id).eq("status", "pending");
      await logEvent(deal.from_company, "deal", `${me.name}, ${DEAL_LABEL[deal.kind].toLocaleLowerCase("tr")} teklifini reddetti.`);
      message = "Teklif reddedildi.";
    } else if (body.action === "accept") {
      if (deal.to_company !== me.id) throw new HttpError(403, "Bu teklif sana yapılmadı");
      if (deal.status !== "pending" || new Date(deal.expires_at).getTime() <= Date.now()) throw new HttpError(409, "Bu teklif artık geçerli değil");
      const { data: other } = await db().from("companies").select("name").eq("id", deal.from_company).maybeSingle();
      const otherName = other?.name ?? "Karşı taraf";
      const t = deal.terms;
      const endsAt = new Date(Date.now() + (t.days ?? 0) * 86_400_000).toISOString();
      let rpc;
      if (deal.kind === "wholesale") {
        const cloneName = `${t.modelName} (bayi)`.slice(0, 30);
        rpc = await db().rpc("deal_accept_wholesale", {
          p_deal: id, p_buyer: me.id, p_seller: deal.from_company, p_model: t.modelId, p_qty: t.qty, p_total: t.qty * t.unitPrice,
          p_clone_name: cloneName, p_parts: t.parts, p_clone_price: t.unitPrice,
        });
        invalidateMarket();
      } else {
        if (deal.kind === "revshare") {
          const { data: act } = await db().from("deals").select("terms").eq("to_company", me.id).eq("kind", "revshare").eq("status", "active");
          const used = (act ?? []).reduce((s, r) => s + Number(r.terms.sharePct), 0);
          if ((used + t.sharePct) / 100 > MAX_REVSHARE_TOTAL) throw new HttpError(400, `Gelirinin en fazla %${MAX_REVSHARE_TOTAL * 100} kadarını ortaklara bağlayabilirsin (şu an %${used})`);
        }
        rpc = await db().rpc("deal_accept_transfer", {
          p_deal: id, p_payer: deal.from_company, p_payee: me.id, p_amount: deal.kind === "loan" ? t.amount : t.payment, p_ends_at: endsAt,
        });
      }
      if (rpc.error) {
        const m = rpc.error.message;
        if (/Yetersiz nakit/.test(m)) throw new HttpError(400, deal.kind === "wholesale" ? "Kasanda yeterli nakit yok" : "Teklif sahibinin kasasında artık yeterli nakit yok");
        if (/stoğu|model sınırı|deposu/.test(m)) throw new HttpError(400, m);
        throw new HttpError(500, m);
      }
      if (!rpc.data) throw new HttpError(409, "Bu teklif artık geçerli değil");
      const summary = describe(deal.kind, t);
      await logEvent(me.id, "deal", `${otherName} ile anlaşma: ${summary}.`);
      await logEvent(deal.from_company, "deal", `${me.name} teklifini kabul etti: ${summary}.`);
      await postAbout(me.id, "deal_signed", { company: me.name, partner: otherName, kind: DEAL_LABEL[deal.kind].toLocaleLowerCase("tr") });
      message = "Anlaşma imzalandı.";
    } else throw new HttpError(400, "Bilinmeyen işlem");
  }

  const fresh = (await loadCompany(user.id))!;
  return snapshot(user.id, { message, journal: await loadJournal(fresh.company.id), state: view(fresh.company, fresh.owned, fresh.holdings) });
});
