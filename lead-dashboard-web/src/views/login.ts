import { esc, icon, layout } from "./layout";

export function loginPage(error?: string, prefillEmail?: string): string {
  return layout(
    "Connexion",
    `<main class="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 selection:bg-indigo-500 selection:text-white font-sans">
  <div class="w-full max-w-sm space-y-6">
    <div class="text-center space-y-2">
      <div class="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-md shadow-indigo-500/20 mb-1">
        ${icon("zap", "w-5 h-5 text-white")}
      </div>
      <h1 class="text-xl font-bold tracking-tight text-white">LeadEngine Enterprise</h1>
      <p class="text-xs text-zinc-400">Accès privé sur liste blanche (Whitelist) uniquement</p>
    </div>

    <div class="bg-zinc-900/90 border border-zinc-800 rounded-2xl shadow-2xl p-6 space-y-5 backdrop-blur">
      ${error ? `<div class="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium">${esc(error)}</div>` : ""}

      <!-- Option 1 : Connexion Google OAuth avec vérification Whitelist -->
      <div class="space-y-2">
        <a href="/auth/google/login" class="w-full bg-white hover:bg-zinc-100 text-zinc-950 rounded-xl py-2.5 px-4 font-semibold text-xs tracking-wide shadow transition-all duration-150 flex items-center justify-center gap-2.5">
          <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"/>
            <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"/>
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"/>
          </svg>
          <span>Continuer avec Google</span>
        </a>
      </div>

      <div class="relative flex items-center py-1">
        <div class="flex-grow border-t border-zinc-800"></div>
        <span class="flex-shrink mx-3 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">ou par email autorisé</span>
        <div class="flex-grow border-t border-zinc-800"></div>
      </div>

      <!-- Option 2 : Email + Mot de passe (Whitelist) -->
      <form method="post" action="/login" class="space-y-3.5">
        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-zinc-300 block">Adresse email</label>
          <input name="email" type="email" required value="${esc(prefillEmail || "")}" placeholder="loic.alcantara@gmail.com" class="w-full bg-zinc-950/80 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all">
        </div>

        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-zinc-300 block">Mot de passe</label>
          <input name="password" type="password" placeholder="Votre mot de passe (ou laissez vide à la 1re connexion)" class="w-full bg-zinc-950/80 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all">
          <p class="text-[10px] text-zinc-500">Première connexion ? Entrez votre email autorisé : si vous n'avez pas encore défini de mot de passe, vous serez redirigé vers sa création.</p>
        </div>

        <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl py-2.5 font-semibold text-xs tracking-wide shadow transition-all duration-150 inline-flex items-center justify-center gap-1.5">
          <span>Se connecter</span>
          ${icon("external", "w-3 h-3 text-indigo-200")}
        </button>
      </form>

      <div class="pt-2 border-t border-zinc-800/80 text-center">
        <span class="text-[10px] text-zinc-500 font-mono">Accès restreint aux adresses invitées · Zéro inscription publique</span>
      </div>
    </div>
  </div>
</main>`,
  );
}

export function inviteAcceptPage(opts: {
  inviteCode: string;
  userName: string;
  email: string;
  role: string;
  error?: string;
}): string {
  return layout(
    "Activer mon accès",
    `<main class="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-4 selection:bg-indigo-500 selection:text-white font-sans">
  <div class="w-full max-w-sm space-y-6">
    <div class="text-center space-y-2">
      <div class="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-700 shadow-md shadow-emerald-500/20 mb-1">
        ${icon("check-circle", "w-5 h-5 text-white")}
      </div>
      <h1 class="text-xl font-bold tracking-tight text-white">Bienvenue, ${esc(opts.userName)}</h1>
      <p class="text-xs text-zinc-400">Activez votre compte <span class="text-white font-semibold">${esc(opts.email)}</span> (${esc(opts.role)})</p>
    </div>

    <div class="bg-zinc-900/90 border border-zinc-800 rounded-2xl shadow-2xl p-6 space-y-5 backdrop-blur">
      ${opts.error ? `<div class="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs font-medium">${esc(opts.error)}</div>` : ""}

      <div class="space-y-2">
        <a href="/auth/google/login" class="w-full bg-white hover:bg-zinc-100 text-zinc-950 rounded-xl py-2.5 px-4 font-semibold text-xs tracking-wide shadow transition-all duration-150 flex items-center justify-center gap-2.5">
          <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"/>
            <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24z"/>
            <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14z"/>
            <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96z"/>
          </svg>
          <span>Activer directement avec Google</span>
        </a>
      </div>

      <div class="relative flex items-center py-1">
        <div class="flex-grow border-t border-zinc-800"></div>
        <span class="flex-shrink mx-3 text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">ou choisir un mot de passe</span>
        <div class="flex-grow border-t border-zinc-800"></div>
      </div>

      <form method="post" action="/invite/${encodeURIComponent(opts.inviteCode)}" class="space-y-3.5">
        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-zinc-300 block">Adresse email autorisée</label>
          <input type="email" disabled value="${esc(opts.email)}" class="w-full bg-zinc-950/50 border border-zinc-800 rounded-xl px-3.5 py-2 text-xs text-zinc-400 cursor-not-allowed">
        </div>

        <div class="space-y-1.5">
          <label class="text-xs font-semibold text-zinc-300 block">Choisissez votre mot de passe (min. 6 caractères)</label>
          <input name="password" type="password" required minlength="6" autofocus placeholder="••••••••" class="w-full bg-zinc-950/80 border border-zinc-700 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all">
        </div>

        <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl py-2.5 font-semibold text-xs tracking-wide shadow transition-all duration-150 inline-flex items-center justify-center gap-1.5">
          <span>Enregistrer mon mot de passe & Accéder</span>
          ${icon("check", "w-3.5 h-3.5 text-white")}
        </button>
      </form>
    </div>
  </div>
</main>`,
  );
}
