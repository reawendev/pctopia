"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { DEFAULT_LOGO } from "@/lib/game/config";
import { formatCompactMoney } from "@/lib/game/economy";
import { STAGES } from "@/lib/game/stages";

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    try {
      supabaseBrowser()
        .auth.getSession()
        .then(({ data }) => {
          if (data.session) router.replace("/oyun");
        });
    } catch (e: any) {
      setError(e.message);
    }
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const sb = supabaseBrowser();
      if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        if (!data.session) {
          setNotice("Kayıt alındı. E-postana gelen doğrulama bağlantısına tıkla, sonra giriş yap.");
          setMode("login");
          return;
        }
      } else {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      router.replace("/oyun");
    } catch (err: any) {
      setError(translate(err.message));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid min-h-screen max-w-5xl items-center gap-10 px-5 py-10 lg:grid-cols-[1fr_380px] lg:gap-16">
      <section>
        <div className="mb-10 flex items-center gap-3">
          <Logo spec={DEFAULT_LOGO} size={36} />
          <span className="font-serif text-xl font-semibold">PCTopia</span>
        </div>

        <h1 className="heading max-w-xl text-4xl leading-[1.1] sm:text-5xl">Bir garajda, ikinci el bir bilgisayarla başla.</h1>
        <p className="mt-5 max-w-lg text-lg leading-relaxed text-mute">
          Şirketini kur, donanım parkını büyüt, borsada yatırım yap. Arkadaşlarınla aynı piyasada, sektörün zirvesi için yarış.
        </p>

        <ol className="mt-10 hidden max-w-md sm:block" aria-label="Kariyer basamakları">
          {STAGES.map((s, i) => (
            <li key={s.level} className="flex items-baseline gap-4 border-l border-line py-1.5 pl-5" style={{ opacity: 1 - i * 0.1 }}>
              <span className={`font-serif ${i === 0 ? "text-amber" : "text-white"}`}>{s.title}</span>
              <span className="num text-sm text-mute">{s.from === 0 ? "başlangıç" : `${formatCompactMoney(s.from)} net değer`}</span>
            </li>
          ))}
        </ol>
      </section>

      <form onSubmit={submit} className="card space-y-4 p-6">
        <div className="grid grid-cols-2 border-b border-line text-sm">
          {(["login", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`-mb-px border-b-2 pb-2.5 font-medium ${mode === m ? "border-amber text-white" : "border-transparent text-mute"}`}
            >
              {m === "login" ? "Giriş yap" : "Yeni hesap"}
            </button>
          ))}
        </div>

        <div>
          <label className="label" htmlFor="email">E-posta</label>
          <input id="email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="pw">Şifre</label>
          <input
            id="pw"
            className="input"
            type="password"
            required
            minLength={6}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p className="text-sm text-loss" role="alert">{error}</p>}
        {notice && <p className="text-sm text-gain">{notice}</p>}

        <button className="btn btn-primary w-full" disabled={busy}>
          {busy ? "Bekle…" : mode === "login" ? "Giriş yap" : "Hesap oluştur"}
        </button>
      </form>
    </main>
  );
}

function translate(msg: string) {
  if (/invalid login/i.test(msg)) return "E-posta veya şifre hatalı.";
  if (/already registered/i.test(msg)) return "Bu e-posta zaten kayıtlı. Giriş yap sekmesini kullan.";
  if (/at least 6/i.test(msg)) return "Şifre en az 6 karakter olmalı.";
  if (/not confirmed/i.test(msg)) return "E-postanı henüz doğrulamadın.";
  return msg;
}
