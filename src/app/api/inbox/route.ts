import { companyNetWorth, isMissingTable, loadCompany } from "@/lib/server/company";
import { offerView, syncOffers, type OfferRow } from "@/lib/server/offers";
import { db, handle, HttpError, requireUser } from "@/lib/server/supabase";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type MsgRow = { id: string; from_company: string; to_company: string; subject: string; body: string; created_at: string; read_at: string | null };

export const GET = handle(async (req) => {
  const user = await requireUser(req);
  const state = await loadCompany(user.id);
  if (!state) throw new HttpError(404, "Önce şirket kurmalısın");
  const { company, owned, holdings } = state;

  const { changed, ready } = await syncOffers(company, owned, companyNetWorth(company.cash, owned, holdings));
  if (!ready) {
    return { ready: false, offers: [], inbox: [], sent: [], unread: { offers: 0, messages: 0 }, changed: false };
  }

  const [offers, inbox, sent] = await Promise.all([
    db().from("company_offers").select("*").eq("company_id", company.id).order("created_at", { ascending: false }).limit(30),
    db().from("messages").select("*").eq("to_company", company.id).order("created_at", { ascending: false }).limit(50),
    db().from("messages").select("*").eq("from_company", company.id).order("created_at", { ascending: false }).limit(30),
  ]);
  if (offers.error) throw new HttpError(500, offers.error.message);
  const msgErr = inbox.error || sent.error;
  if (msgErr && !isMissingTable(msgErr)) throw new HttpError(500, msgErr.message);

  const msgs = [...((inbox.data ?? []) as MsgRow[]), ...((sent.data ?? []) as MsgRow[])];
  const ids = Array.from(new Set(msgs.flatMap((m) => [m.from_company, m.to_company])));
  const people = new Map<string, { name: string; founderName: string; logo: unknown; logoUrl: string | null }>();
  if (ids.length) {
    const { data } = await db().from("companies").select("*").in("id", ids);
    for (const c of data ?? []) people.set(c.id, { name: c.name, founderName: c.founder_name, logo: c.logo, logoUrl: c.logo_url ?? null });
  }
  const gone = { name: "Kapanmış şirket", founderName: "", logo: null, logoUrl: null };
  const msgView = (m: MsgRow) => ({
    id: m.id,
    from: { id: m.from_company, ...(people.get(m.from_company) ?? gone) },
    to: { id: m.to_company, ...(people.get(m.to_company) ?? gone) },
    subject: m.subject,
    body: m.body,
    createdAt: m.created_at,
    read: !!m.read_at,
  });

  const offerList = ((offers.data ?? []) as OfferRow[]).map(offerView);
  const inboxList = ((inbox.data ?? []) as MsgRow[]).map(msgView);

  return {
    ready: true,
    changed,
    offers: offerList,
    inbox: inboxList,
    sent: ((sent.data ?? []) as MsgRow[]).map(msgView),
    unread: {
      offers: offerList.filter((o) => !o.read && o.status !== "declined").length,
      messages: inboxList.filter((m) => !m.read).length,
    },
  };
});
