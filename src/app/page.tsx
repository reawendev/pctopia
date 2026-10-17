"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Logo } from "@/components/Logo";
import { DEFAULT_LOGO } from "@/lib/game/config";

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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 flex items-center gap-3">
        <Logo spec={DEFAULT_LOGO} size={44} />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">PCTopia</h1>
          <p className="text-sm text-mute">Bilgisayar imparatorluğu simülasyonu</p>
        </div>
      </div>

      <p className="mb-6 text-sm leading-relaxed text-mute">
        Kendi şirketini kur. İkinci el bir ofis bilgisayarıyla başla, ekipmanını büyüt ve sektörün en değerli şirketi olmak
        için diğer oyuncularla yarış.
      </p>

      <form onSubmit={submit} className="card space-y-4 p-5">
        <div className="grid grid-cols-2 gap-1 rounded-md bg-ink p-1 text-sm">
          {(["login", "signup"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded py-2 font-medium ${mode === m ? "bg-raised text-white" : "text-mute"}`}
            >
              {m === "login" ? "Giriş" : "Kayıt ol"}
            </button>
          ))}
        </div>

        <div>
          <label className="label" htmlFor="email">E-posta</label>
          <input id="email" className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="pw">Şifre</label>
          <input id="pw" className="input" type="password" required minLength={6} autoComplete={mode === "login" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>

        {error && <p className="text-sm text-loss">{error}</p>}
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
  if (/already registered/i.test(msg)) return "Bu e-posta zaten kayıtlı.";
  if (/at least 6/i.test(msg)) return "Şifre en az 6 karakter olmalı.";
  if (/not confirmed/i.test(msg)) return "E-postanı henüz doğrulamadın.";
  return msg;
}
