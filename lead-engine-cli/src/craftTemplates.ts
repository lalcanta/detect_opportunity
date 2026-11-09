import { execSync } from "node:child_process";
import * as fs from "node:fs";

interface LeadData {
  id: string;
  company_name: string;
  activity: string | null;
  city: string | null;
  phone: string | null;
  email: string | null;
  website_url: string | null;
  google_rating: number | null;
  google_reviews_count: number | null;
}

// 1. L'Artisan Compagnon (Couverture & Toiture - Pamiers)
function getDemoArtisanCompagnon(l: LeadData): string {
  const phone = l.phone || "0630210859";
  const cleanPhone = phone.replace(/\s+/g, "");
  return `<!DOCTYPE html>
<html lang="fr" class="scroll-smooth">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>L'Artisan Compagnon — Couverture, Toiture & Rénovation à Pamiers</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Cinzel:wght@600;700;800&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    body { font-family: 'Plus Jakarta Sans', sans-serif; }
    .font-serif-title { font-family: 'Cinzel', serif; }
  </style>
</head>
<body class="bg-[#FAF9F5] text-stone-900 antialiased selection:bg-amber-800 selection:text-white pb-24">

  <!-- Top Bar d'urgence & réassurance -->
  <header class="bg-[#1C1F26] text-stone-200 text-xs py-2.5 px-4 border-b border-stone-800">
    <div class="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <span class="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
        <span class="font-medium text-stone-300">Intervention d'urgence fuite toiture sous 2h sur <strong>Pamiers et Ariège (09)</strong></span>
      </div>
      <div class="flex items-center gap-4 text-stone-400">
        <span class="flex items-center gap-1"><i data-lucide="shield-check" class="w-3.5 h-3.5 text-amber-500"></i> Garantie Décennale 10 ans</span>
        <span class="hidden sm:inline-block">•</span>
        <span class="hidden sm:flex items-center gap-1"><i data-lucide="star" class="w-3.5 h-3.5 fill-amber-400 text-amber-400"></i> 4.8/5 Avis Google Vérifiés</span>
      </div>
    </div>
  </header>

  <!-- Navigation -->
  <nav class="bg-white/95 backdrop-blur-md sticky top-0 z-40 border-b border-stone-200/80 shadow-sm">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-11 h-11 rounded-xl bg-[#8A2B14] text-white flex items-center justify-center font-serif-title font-extrabold text-xl shadow-md">
          AC
        </div>
        <div>
          <span class="font-serif-title font-bold text-stone-900 text-lg sm:text-xl tracking-tight block">L'ARTISAN COMPAGNON</span>
          <span class="text-[11px] font-semibold text-[#8A2B14] uppercase tracking-wider block">Maître Couvreur • Zinguerie d'Art • Pamiers</span>
        </div>
      </div>
      <div class="hidden md:flex items-center gap-8 text-sm font-semibold text-stone-700">
        <a href="#prestations" class="hover:text-[#8A2B14] transition-colors">Prestations</a>
        <a href="#avant-apres" class="hover:text-[#8A2B14] transition-colors">Avant / Après</a>
        <a href="#garanties" class="hover:text-[#8A2B14] transition-colors">Garanties</a>
        <a href="#avis" class="hover:text-[#8A2B14] transition-colors">Témoignages</a>
      </div>
      <a href="tel:${cleanPhone}" class="hidden sm:inline-flex items-center gap-2 bg-[#8A2B14] hover:bg-[#6D200D] text-white font-bold px-5 py-3 rounded-xl shadow-lg transition-all active:scale-95 text-xs sm:text-sm">
        <i data-lucide="phone-call" class="w-4 h-4"></i>
        <span>${phone}</span>
      </a>
    </div>
  </nav>

  <!-- Hero Section -->
  <section class="relative overflow-hidden py-16 sm:py-24 bg-gradient-to-b from-[#FAF9F5] via-stone-100 to-[#FAF9F5]">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-12 gap-12 items-center">
      <div class="lg:col-span-7 space-y-6">
        <div class="inline-flex items-center gap-2 bg-amber-900/10 border border-amber-800/20 text-[#8A2B14] px-3.5 py-1.5 rounded-full text-xs font-bold tracking-wide uppercase">
          <i data-lucide="hammer" class="w-3.5 h-3.5"></i> Fierté du Geste Artisanal • Pamiers
        </div>
        <h1 class="text-3xl sm:text-5xl lg:text-6xl font-serif-title font-bold text-stone-900 leading-[1.15]">
          Votre toiture protégée pour les <span class="text-[#8A2B14] underline decoration-amber-400 decoration-4">30 prochaines années</span>.
        </h1>
        <p class="text-base sm:text-lg text-stone-600 leading-relaxed max-w-xl">
          Rénovation complète de toiture en tuiles romanes, zinguerie sur-mesure, démoussage hydrofuge et réfection d'étanchéité. Devis transparent gratuit en 24h.
        </p>

        <div class="flex flex-col sm:flex-row gap-4 pt-2">
          <a href="tel:${cleanPhone}" class="inline-flex items-center justify-center gap-3 bg-[#8A2B14] hover:bg-[#70210C] text-white font-bold px-7 py-4 rounded-xl shadow-xl hover:shadow-2xl transition-all active:scale-95 text-base">
            <i data-lucide="phone" class="w-5 h-5"></i>
            <span>Appel Direct : ${phone}</span>
          </a>
          <a href="#devis-express" class="inline-flex items-center justify-center gap-2 bg-white hover:bg-stone-50 text-stone-800 font-bold px-6 py-4 rounded-xl border border-stone-300 shadow-sm transition-all text-base">
            <i data-lucide="calculator" class="w-5 h-5 text-amber-700"></i>
            <span>Demande de Devis Gratuit</span>
          </a>
        </div>

        <!-- Réassurance immédiate -->
        <div class="pt-6 border-t border-stone-200/80 grid grid-cols-3 gap-4 text-center">
          <div>
            <span class="block text-2xl sm:text-3xl font-extrabold text-[#8A2B14]">10 Ans</span>
            <span class="text-xs text-stone-500 font-medium">Garantie Décennale</span>
          </div>
          <div>
            <span class="block text-2xl sm:text-3xl font-extrabold text-stone-900">+450</span>
            <span class="text-xs text-stone-500 font-medium">Toitures Réalisées</span>
          </div>
          <div>
            <span class="block text-2xl sm:text-3xl font-extrabold text-amber-600">4.8 / 5</span>
            <span class="text-xs text-stone-500 font-medium">Satisfaction Clients</span>
          </div>
        </div>
      </div>

      <!-- Comparateur Avant / Après interactif -->
      <div class="lg:col-span-5" id="avant-apres">
        <div class="bg-white p-3 rounded-3xl shadow-2xl border border-stone-200 space-y-3">
          <div class="flex items-center justify-between px-2 pt-1">
            <span class="text-xs font-bold text-stone-900 uppercase tracking-wide flex items-center gap-1.5">
              <i data-lucide="sliders-horizontal" class="w-4 h-4 text-[#8A2B14]"></i> Glissez pour comparer
            </span>
            <span class="text-[11px] font-semibold bg-amber-50 text-amber-800 px-2 py-0.5 rounded-md border border-amber-200">Chantier Rénovation Pamiers</span>
          </div>

          <div class="relative w-full h-80 sm:h-96 rounded-2xl overflow-hidden select-none" id="comp-box">
            <!-- Après -->
            <img src="https://images.unsplash.com/photo-1590381105924-c72589b9ef3f?auto=format&fit=crop&w=800&q=80" alt="Toiture neuve après rénovation" class="absolute inset-0 w-full h-full object-cover">
            <div class="absolute top-3 right-3 bg-emerald-600 text-white text-[11px] font-bold px-3 py-1 rounded-full shadow-lg">
              APRÈS RÉNOVATION
            </div>

            <!-- Avant -->
            <div id="before-layer" class="absolute inset-0 overflow-hidden w-1/2 border-r-4 border-white shadow-2xl">
              <img src="https://images.unsplash.com/photo-1541976590-713941681591?auto=format&fit=crop&w=800&q=80" alt="Toiture abîmée avant travaux" class="absolute inset-0 w-full h-full object-cover max-w-none" style="width: 200%;">
              <div class="absolute top-3 left-3 bg-[#8A2B14] text-white text-[11px] font-bold px-3 py-1 rounded-full shadow-lg">
                AVANT TRAVAUX
              </div>
            </div>

            <input type="range" min="0" max="100" value="50" class="absolute inset-0 w-full h-full opacity-0 cursor-ew-resize z-20" oninput="document.getElementById('before-layer').style.width = this.value + '%'">
          </div>
          <p class="text-center text-xs text-stone-500 italic pb-1">Tuiles romanes neuves, faîtage ventilé et gouttières alu sans soudure.</p>
        </div>
      </div>
    </div>
  </section>

  <!-- Prestations phares -->
  <section id="prestations" class="py-16 bg-white border-y border-stone-200">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 space-y-12">
      <div class="text-center max-w-2xl mx-auto space-y-3">
        <h2 class="text-xs font-extrabold uppercase tracking-widest text-[#8A2B14]">Savoir-faire Artisanal</h2>
        <h3 class="text-3xl sm:text-4xl font-serif-title font-bold text-stone-900">Nos Chantiers de Référence en Ariège</h3>
        <p class="text-stone-600 text-sm">Chaque intervention respecte les normes DTU en vigueur et s'accompagne d'une assurance décennale certifiée.</p>
      </div>

      <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
        <div class="bg-[#FAF9F5] p-6 rounded-2xl border border-stone-200/90 hover:shadow-xl transition-all space-y-4">
          <div class="w-12 h-12 rounded-xl bg-amber-900/10 text-[#8A2B14] flex items-center justify-center">
            <i data-lucide="home" class="w-6 h-6"></i>
          </div>
          <h4 class="text-lg font-bold text-stone-900 font-serif-title">Rénovation Complète de Toiture</h4>
          <p class="text-stone-600 text-xs sm:text-sm leading-relaxed">Dépose des tuiles anciennes, contrôle du chevronnage, pose d'écran sous-toiture HPV respirant et liteaunage neuf.</p>
          <ul class="text-xs text-stone-500 space-y-1.5 pt-2 border-t border-stone-200">
            <li class="flex items-center gap-1.5"><i data-lucide="check" class="w-3.5 h-3.5 text-emerald-600"></i> Tuiles canal, romanes, plates</li>
            <li class="flex items-center gap-1.5"><i data-lucide="check" class="w-3.5 h-3.5 text-emerald-600"></i> Faîtage à sec ventilé</li>
          </ul>
        </div>

        <div class="bg-[#FAF9F5] p-6 rounded-2xl border border-stone-200/90 hover:shadow-xl transition-all space-y-4">
          <div class="w-12 h-12 rounded-xl bg-amber-900/10 text-[#8A2B14] flex items-center justify-center">
            <i data-lucide="layers" class="w-6 h-6"></i>
          </div>
          <h4 class="text-lg font-bold text-stone-900 font-serif-title">Zinguerie & Évacuation Pluviale</h4>
          <p class="text-stone-600 text-xs sm:text-sm leading-relaxed">Façonnage sur-mesure d'abergements de cheminée, noues en zinc, habillage de rives et pose de gouttières sans raccord.</p>
          <ul class="text-xs text-stone-500 space-y-1.5 pt-2 border-t border-stone-200">
            <li class="flex items-center gap-1.5"><i data-lucide="check" class="w-3.5 h-3.5 text-emerald-600"></i> Zinc naturel, quartz & cuivre</li>
            <li class="flex items-center gap-1.5"><i data-lucide="check" class="w-3.5 h-3.5 text-emerald-600"></i> Étanchéité zéro infiltration garantie</li>
          </ul>
        </div>

        <div class="bg-[#FAF9F5] p-6 rounded-2xl border border-stone-200/90 hover:shadow-xl transition-all space-y-4">
          <div class="w-12 h-12 rounded-xl bg-amber-900/10 text-[#8A2B14] flex items-center justify-center">
            <i data-lucide="sparkles" class="w-6 h-6"></i>
          </div>
          <h4 class="text-lg font-bold text-stone-900 font-serif-title">Nettoyage & Traitement Hydrofuge</h4>
          <p class="text-stone-600 text-xs sm:text-sm leading-relaxed">Démoussage basse pression sans altérer la porosité de la tuile, suivi d'une application d'hydrofuge incolore ou teinté.</p>
          <ul class="text-xs text-stone-500 space-y-1.5 pt-2 border-t border-stone-200">
            <li class="flex items-center gap-1.5"><i data-lucide="check" class="w-3.5 h-3.5 text-emerald-600"></i> Protection anti-mousse 5 ans</li>
            <li class="flex items-center gap-1.5"><i data-lucide="check" class="w-3.5 h-3.5 text-emerald-600"></i> Redonne l'éclat neuf d'origine</li>
          </ul>
        </div>
      </div>
    </div>
  </section>

  <!-- Témoignages Google vérifiés -->
  <section id="avis" class="py-16 bg-[#FAF9F5]">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 space-y-8">
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 class="text-2xl sm:text-3xl font-serif-title font-bold text-stone-900">Avis Clients Pamiers & Environs</h3>
          <p class="text-stone-600 text-xs sm:text-sm">Retours certifiés de propriétaires ayant fait confiance à L'Artisan Compagnon.</p>
        </div>
        <div class="flex items-center gap-2 bg-white px-4 py-2 rounded-xl border border-stone-200 shadow-sm">
          <div class="flex text-amber-500"><i data-lucide="star" class="w-4 h-4 fill-amber-400"></i><i data-lucide="star" class="w-4 h-4 fill-amber-400"></i><i data-lucide="star" class="w-4 h-4 fill-amber-400"></i><i data-lucide="star" class="w-4 h-4 fill-amber-400"></i><i data-lucide="star" class="w-4 h-4 fill-amber-400"></i></div>
          <span class="text-xs font-bold text-stone-800">4.8 / 5 sur Google</span>
        </div>
      </div>

      <div class="grid md:grid-cols-3 gap-6">
        <div class="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-3">
          <div class="flex text-amber-400"><i data-lucide="star" class="w-4 h-4 fill-current"></i><i data-lucide="star" class="w-4 h-4 fill-current"></i><i data-lucide="star" class="w-4 h-4 fill-current"></i><i data-lucide="star" class="w-4 h-4 fill-current"></i><i data-lucide="star" class="w-4 h-4 fill-current"></i></div>
          <p class="text-stone-700 text-xs sm:text-sm italic">« Intervention rapide suite à un coup de vent qui avait déplacé plusieurs tuiles faîtières. Devis respecté au centime près et chantier impeccable. »</p>
          <div class="pt-2 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
            <span class="font-bold text-stone-800">Jean-Pierre M.</span>
            <span>Pamiers (09100)</span>
          </div>
        </div>

        <div class="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-3">
          <div class="flex text-amber-400"><i data-lucide="star" class="w-4 h-4 fill-current"></i><i data-lucide="star" class="w-4 h-4 fill-current"></i><i data-lucide="star" class="w-4 h-4 fill-current"></i><i data-lucide="star" class="w-4 h-4 fill-current"></i><i data-lucide="star" class="w-4 h-4 fill-current"></i></div>
          <p class="text-stone-700 text-xs sm:text-sm italic">« Rénovation intégrale de toiture sur notre maison de village. Un artisan consciencieux, discret, ponctuel et amoureux de son métier. Je recommande les yeux fermés. »</p>
          <div class="pt-2 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
            <span class="font-bold text-stone-800">Sandrine L.</span>
            <span>Varilhes (09120)</span>
          </div>
        </div>

        <div class="bg-white p-6 rounded-2xl border border-stone-200 shadow-sm space-y-3">
          <div class="flex text-amber-400"><i data-lucide="star" class="w-4 h-4 fill-current"></i><i data-lucide="star" class="w-4 h-4 fill-current"></i><i data-lucide="star" class="w-4 h-4 fill-current"></i><i data-lucide="star" class="w-4 h-4 fill-current"></i><i data-lucide="star" class="w-4 h-4 fill-current"></i></div>
          <p class="text-stone-700 text-xs sm:text-sm italic">« Remplacement complet des gouttières en zinc et traitement hydrofuge. La maison a retrouvé son allure d'origine. Équipe très pro. »</p>
          <div class="pt-2 border-t border-stone-100 flex items-center justify-between text-xs text-stone-500">
            <span class="font-bold text-stone-800">Marc V.</span>
            <span>Saverdun (09700)</span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Sticky Bottom Bar Mobile -->
  <aside aria-label="Contact direct" class="fixed bottom-0 inset-x-0 z-50 sm:hidden bg-stone-900/95 backdrop-blur-md border-t border-stone-800 p-3 shadow-2xl">
    <div class="flex items-center gap-2">
      <a href="tel:${cleanPhone}" class="flex-1 flex items-center justify-center gap-2 bg-[#8A2B14] active:bg-[#6D200D] text-white py-3 rounded-xl font-bold text-sm shadow-md transition-transform active:scale-95">
        <i data-lucide="phone-call" class="w-4 h-4"></i>
        <span>Appeler (${phone})</span>
      </a>
      <a href="https://wa.me/33${cleanPhone.replace(/^0/, '')}" class="w-12 h-12 flex items-center justify-center bg-[#25D366] text-white rounded-xl shadow-md active:scale-95" title="WhatsApp">
        <i data-lucide="message-circle" class="w-5 h-5"></i>
      </a>
    </div>
  </aside>

  <script>lucide.createIcons();</script>
</body>
</html>`;
}

// 2. Le 7ème Artisan - Cédric PRATS (Production Vidéo - Pamiers)
function getDemoCedricPrats(l: LeadData): string {
  const phone = l.phone || "0674628983";
  const cleanPhone = phone.replace(/\s+/g, "");
  return `<!DOCTYPE html>
<html lang="fr" class="scroll-smooth bg-[#0A0D14] text-zinc-100">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Le 7ème Artisan — Production Vidéo, Drone & Cinéma d'Entreprise à Pamiers</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,600;0,700;1,600&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    body { font-family: 'Space Grotesk', sans-serif; }
    .font-cinema { font-family: 'Playfair Display', serif; }
  </style>
</head>
<body class="antialiased selection:bg-amber-500 selection:text-black pb-24">

  <!-- Header Cinéma -->
  <header class="border-b border-zinc-800/80 bg-[#0A0D14]/90 backdrop-blur-xl sticky top-0 z-40">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-600 to-amber-400 text-black flex items-center justify-center font-bold text-lg shadow-lg shadow-amber-500/20">
          7
        </div>
        <div>
          <span class="font-bold text-white text-lg tracking-tight block">LE 7ÈME ARTISAN</span>
          <span class="text-[10px] font-mono text-amber-400 uppercase tracking-widest block">Cédric PRATS • Studio Vidéo & Drone 4K</span>
        </div>
      </div>
      <div class="hidden md:flex items-center gap-8 text-xs font-mono uppercase tracking-wider text-zinc-400">
        <a href="#showreel" class="hover:text-amber-400 transition-colors">Showreel</a>
        <a href="#expertises" class="hover:text-amber-400 transition-colors">Expertises</a>
        <a href="#materiel" class="hover:text-amber-400 transition-colors">Matériel</a>
        <a href="#contact" class="hover:text-amber-400 transition-colors">Discuter Projet</a>
      </div>
      <a href="tel:${cleanPhone}" class="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold px-5 py-2.5 rounded-xl shadow-lg shadow-amber-500/20 text-xs transition-all active:scale-95">
        <i data-lucide="video" class="w-4 h-4"></i>
        <span>${phone}</span>
      </a>
    </div>
  </header>

  <!-- Hero Section Immersive -->
  <section class="relative overflow-hidden py-20 sm:py-28 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(217,119,6,0.15),rgba(255,255,255,0))]">
    <div class="max-w-5xl mx-auto px-4 sm:px-6 text-center space-y-8">
      <div class="inline-flex items-center gap-2 bg-zinc-900 border border-zinc-700/80 px-4 py-1.5 rounded-full text-xs font-mono text-amber-400 shadow-inner">
        <span class="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
        <span>REC • Télépilote Drone Certifié DGAC • Ariège & Occitanie</span>
      </div>

      <h1 class="text-4xl sm:text-6xl lg:text-7xl font-cinema font-bold text-white tracking-tight leading-[1.1]">
        Donnez à votre savoir-faire l'envergure d'un <span class="italic text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-amber-400 to-amber-600">film de cinéma</span>.
      </h1>

      <p class="text-base sm:text-lg text-zinc-400 max-w-2xl mx-auto font-light leading-relaxed">
        Films d'entreprise haute intensité, valorisation du geste artisanal, captation aérienne par drone 4K et vidéos percutantes pour vos réseaux sociaux.
      </p>

      <div class="flex flex-wrap items-center justify-center gap-4 pt-4">
        <a href="#showreel" class="inline-flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-7 py-3.5 rounded-xl shadow-xl shadow-amber-500/25 transition-all text-sm active:scale-95">
          <i data-lucide="play-circle" class="w-5 h-5"></i>
          <span>Visionner le Showreel</span>
        </a>
        <a href="tel:${cleanPhone}" class="inline-flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white font-medium px-6 py-3.5 rounded-xl border border-zinc-700 transition-all text-sm">
          <i data-lucide="phone" class="w-4 h-4 text-amber-400"></i>
          <span>Échanger sur votre projet</span>
        </a>
      </div>
    </div>
  </section>

  <!-- Showreel Frame Interactif -->
  <section id="showreel" class="py-12 px-4 max-w-5xl mx-auto">
    <div class="relative rounded-3xl overflow-hidden border border-zinc-800 shadow-2xl bg-zinc-950 group">
      <div class="aspect-video relative overflow-hidden flex items-center justify-center">
        <img src="https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=1200&q=80" alt="Capture caméra cinéma" class="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-700">
        <div class="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
        
        <div class="relative z-10 text-center space-y-4">
          <div class="w-20 h-20 rounded-full bg-amber-500 text-black flex items-center justify-center mx-auto shadow-2xl shadow-amber-500/50 group-hover:scale-110 transition-transform cursor-pointer">
            <i data-lucide="play" class="w-8 h-8 fill-current ml-1"></i>
          </div>
          <span class="block text-xs font-mono uppercase tracking-widest text-amber-400">Showreel 2026 • 4K UHD 60fps</span>
        </div>
      </div>
      <div class="p-6 bg-zinc-900/90 border-t border-zinc-800 flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-zinc-400">
        <span>📍 Tournage sur site • Ariège (Pamiers, Foix, Mirepoix)</span>
        <span class="text-amber-400">Sony FX3 Cinema Line • DJI Mavic 3 Cine</span>
      </div>
    </div>
  </section>

  <!-- 3 Formats Clés -->
  <section id="expertises" class="py-16 max-w-6xl mx-auto px-4 sm:px-6 space-y-12">
    <div class="text-center space-y-2">
      <span class="text-xs font-mono uppercase text-amber-400 tracking-widest">Formats d'Impact</span>
      <h2 class="text-3xl font-cinema font-bold text-white">Une Réalisation Sur-Mesure Selon vos Objectifs</h2>
    </div>

    <div class="grid md:grid-cols-3 gap-6">
      <div class="bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800 space-y-4 hover:border-amber-500/50 transition-colors">
        <div class="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
          <i data-lucide="briefcase" class="w-5 h-5"></i>
        </div>
        <h3 class="text-lg font-bold text-white">Film de Marque & Entreprise</h3>
        <p class="text-zinc-400 text-xs sm:text-sm leading-relaxed">Racontez votre histoire, vos valeurs et sublimez vos ateliers pour asseoir votre autorité et séduire vos futurs clients.</p>
        <span class="text-[11px] font-mono text-amber-400 block pt-2">Durée : 2 à 3 min • Étalonnage cinéma</span>
      </div>

      <div class="bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800 space-y-4 hover:border-amber-500/50 transition-colors">
        <div class="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
          <i data-lucide="compass" class="w-5 h-5"></i>
        </div>
        <h3 class="text-lg font-bold text-white">Captation Aérienne par Drone</h3>
        <p class="text-zinc-400 text-xs sm:text-sm leading-relaxed">Des plans vertigineux pour valoriser vos chantiers d'envergure, domaines viticoles ou bâtiments industriels.</p>
        <span class="text-[11px] font-mono text-amber-400 block pt-2">Télépilote agréé DGAC • Assurance pro</span>
      </div>

      <div class="bg-zinc-900/60 p-6 rounded-2xl border border-zinc-800 space-y-4 hover:border-amber-500/50 transition-colors">
        <div class="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
          <i data-lucide="smartphone" class="w-5 h-5"></i>
        </div>
        <h3 class="text-lg font-bold text-white">Packs Réseaux Sociaux (Reels / TikTok)</h3>
        <p class="text-zinc-400 text-xs sm:text-sm leading-relaxed">Captations courtes au format vertical 9:16 avec rythme calibré pour générer de l'engagement et des leads qualifiés.</p>
        <span class="text-[11px] font-mono text-amber-400 block pt-2">Pack 5 à 10 vidéos courtes montées</span>
      </div>
    </div>
  </section>

  <!-- Sticky Mobile Bar -->
  <aside aria-label="Contact rapide" class="fixed bottom-0 inset-x-0 z-50 sm:hidden bg-black/95 backdrop-blur-md border-t border-zinc-800 p-3 shadow-2xl">
    <div class="flex items-center gap-2">
      <a href="tel:${cleanPhone}" class="flex-1 flex items-center justify-center gap-2 bg-amber-500 text-black py-3 rounded-xl font-bold text-sm shadow-md active:scale-95">
        <i data-lucide="phone" class="w-4 h-4"></i>
        <span>Contacter Cédric PRATS</span>
      </a>
      <a href="https://wa.me/33${cleanPhone.replace(/^0/, '')}" class="w-12 h-12 flex items-center justify-center bg-[#25D366] text-white rounded-xl shadow-md active:scale-95" title="WhatsApp">
        <i data-lucide="message-circle" class="w-5 h-5"></i>
      </a>
    </div>
  </aside>

  <script>lucide.createIcons();</script>
</body>
</html>`;
}

// 3. Boulangerie Lavigne (La Tour-du-Crieu)
function getDemoBoulangerieLavigne(l: LeadData): string {
  const phone = l.phone || "0561670728";
  const cleanPhone = phone.replace(/\s+/g, "");
  return `<!DOCTYPE html>
<html lang="fr" class="scroll-smooth bg-[#FDFBF7] text-stone-900">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Boulangerie Lavigne — Pains de Tradition & Pâtisserie Fine à La Tour-du-Crieu</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,600;0,9..144,700;1,9..144,500&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    body { font-family: 'Plus Jakarta Sans', sans-serif; }
    .font-bakery { font-family: 'Fraunces', serif; }
  </style>
</head>
<body class="antialiased selection:bg-amber-300 selection:text-amber-950 pb-24">

  <!-- Bandeau Dynamique d'Ouverture -->
  <div class="bg-[#B45309] text-amber-100 text-xs py-2 px-4 text-center font-medium border-b border-amber-800">
    <div class="max-w-4xl mx-auto flex items-center justify-center gap-2">
      <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
      <span>Fournil ouvert aujourd'hui dès <strong>6h30 à La Tour-du-Crieu</strong> • Pains chauds et viennoiseries du matin</span>
    </div>
  </div>

  <!-- Header -->
  <header class="bg-white/95 backdrop-blur-md sticky top-0 z-40 border-b border-amber-900/10 shadow-sm">
    <div class="max-w-5xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-11 h-11 rounded-full bg-amber-100 border border-amber-300 text-amber-900 flex items-center justify-center font-bakery font-bold text-xl">
          L
        </div>
        <div>
          <span class="font-bakery font-bold text-amber-950 text-xl tracking-tight block">BOULANGERIE LAVIGNE</span>
          <span class="text-[11px] font-semibold text-amber-700 uppercase tracking-widest block">Artisan Boulanger • Fait Maison • La Tour-du-Crieu</span>
        </div>
      </div>
      <a href="tel:${cleanPhone}" class="inline-flex items-center gap-2 bg-[#B45309] hover:bg-[#92400E] text-white font-bold px-4 py-2.5 rounded-full text-xs shadow-md transition-all active:scale-95">
        <i data-lucide="phone" class="w-4 h-4"></i>
        <span>${phone}</span>
      </a>
    </div>
  </header>

  <!-- Hero Section Chaleureuse -->
  <section class="py-16 sm:py-24 bg-gradient-to-b from-[#FAF5EE] to-[#FDFBF7]">
    <div class="max-w-5xl mx-auto px-4 sm:px-6 grid md:grid-cols-2 gap-10 items-center">
      <div class="space-y-6">
        <span class="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-amber-800 bg-amber-100/70 border border-amber-200 px-3 py-1 rounded-full">
          🌾 Farines Régionales & Levain Naturel
        </span>
        <h1 class="text-4xl sm:text-5xl font-bakery font-bold text-amber-950 leading-tight">
          Le croustillant du <span class="italic text-[#B45309]">vrai pain</span> pétri et cuit sur place chaque matin.
        </h1>
        <p class="text-stone-700 text-sm sm:text-base leading-relaxed">
          Baguette de tradition française à la croûte dorée et mie alvéolée, viennoiseries pur beurre et gâteaux de fête confectionnés dans notre atelier de La Tour-du-Crieu.
        </p>
        <div class="flex flex-wrap gap-3 pt-2">
          <a href="tel:${cleanPhone}" class="inline-flex items-center gap-2 bg-[#B45309] hover:bg-[#92400E] text-white font-bold px-6 py-3.5 rounded-full text-sm shadow-lg shadow-amber-900/10 active:scale-95 transition-transform">
            <i data-lucide="shopping-bag" class="w-4 h-4"></i>
            <span>Commander par Téléphone</span>
          </a>
          <a href="#horaires" class="inline-flex items-center gap-1.5 bg-white border border-stone-300 text-stone-800 font-bold px-5 py-3.5 rounded-full text-sm hover:bg-stone-50">
            <i data-lucide="clock" class="w-4 h-4 text-amber-700"></i>
            <span>Horaires & Accès</span>
          </a>
        </div>
      </div>

      <div class="relative">
        <div class="rounded-3xl overflow-hidden shadow-2xl border-4 border-white rotate-1 hover:rotate-0 transition-transform duration-300">
          <img src="https://images.unsplash.com/photo-1509440159596-0249088772ff?auto=format&fit=crop&w=800&q=80" alt="Pain artisanal au levain" class="w-full h-80 sm:h-96 object-cover">
        </div>
        <div class="absolute -bottom-4 -left-4 bg-white p-4 rounded-2xl shadow-xl border border-amber-100 flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-800 font-bold">
            🥖
          </div>
          <div>
            <span class="block text-xs font-bold text-stone-900">100% Farine Française</span>
            <span class="text-[11px] text-stone-500">Sans additifs ni conservateurs</span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Spécialités Phares -->
  <section class="py-16 max-w-5xl mx-auto px-4 sm:px-6 space-y-8">
    <div class="text-center space-y-2">
      <span class="text-xs font-bold uppercase tracking-widest text-[#B45309]">Notre Vitrine</span>
      <h2 class="text-3xl font-bakery font-bold text-amber-950">Les Incontournables de la Maison</h2>
    </div>

    <div class="grid sm:grid-cols-3 gap-6">
      <div class="bg-white p-6 rounded-2xl border border-amber-900/10 shadow-sm space-y-3">
        <span class="text-3xl">🥖</span>
        <h3 class="font-bakery font-bold text-lg text-amber-950">La Tradition Lavigne</h3>
        <p class="text-stone-600 text-xs sm:text-sm">Longue fermentation sur levain liquide, arômes de noisette et conservation prolongée.</p>
      </div>

      <div class="bg-white p-6 rounded-2xl border border-amber-900/10 shadow-sm space-y-3">
        <span class="text-3xl">🥐</span>
        <h3 class="font-bakery font-bold text-lg text-amber-950">Croissant Pur Beurre Charentes</h3>
        <p class="text-stone-600 text-xs sm:text-sm">Feuilletage doré, croustillant incomparable et cœur fondant au beurre AOP.</p>
      </div>

      <div class="bg-white p-6 rounded-2xl border border-amber-900/10 shadow-sm space-y-3">
        <span class="text-3xl">🎂</span>
        <h3 class="font-bakery font-bold text-lg text-amber-950">Tartes de Saison & Événements</h3>
        <p class="text-stone-600 text-xs sm:text-sm">Pâtisseries fraîches du week-end et gâteaux personnalisés pour vos repas de famille.</p>
      </div>
    </div>
  </section>

  <!-- Sticky Mobile Bar -->
  <aside aria-label="Contact rapide" class="fixed bottom-0 inset-x-0 z-50 sm:hidden bg-white/95 backdrop-blur-md border-t border-amber-200 p-3 shadow-2xl">
    <div class="flex items-center gap-2">
      <a href="tel:${cleanPhone}" class="flex-1 flex items-center justify-center gap-2 bg-[#B45309] text-white py-3 rounded-xl font-bold text-sm shadow-md active:scale-95">
        <i data-lucide="phone-call" class="w-4 h-4"></i>
        <span>Appeler le Fournil</span>
      </a>
    </div>
  </aside>

  <script>lucide.createIcons();</script>
</body>
</html>`;
}

// 4. Terres de Fenêtre - Menuiserie du Sedour (Pamiers)
function getDemoMenuiserieSedour(l: LeadData): string {
  const phone = l.phone || "0561641072";
  const cleanPhone = phone.replace(/\s+/g, "");
  return `<!DOCTYPE html>
<html lang="fr" class="scroll-smooth bg-[#F8FAFC] text-slate-900">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Menuiserie du Sedour — Terres de Fenêtre à Pamiers • Menuiseries PVC, Alu & Bois</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>body { font-family: 'Plus Jakarta Sans', sans-serif; }</style>
</head>
<body class="antialiased selection:bg-sky-500 selection:text-white pb-24">

  <!-- Header -->
  <header class="bg-white/95 backdrop-blur-md sticky top-0 z-40 border-b border-slate-200 shadow-sm">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-sky-700 text-white flex items-center justify-center font-bold text-lg">
          MS
        </div>
        <div>
          <span class="font-extrabold text-slate-900 text-lg tracking-tight block">MENUISERIE DU SEDOUR</span>
          <span class="text-[10px] font-bold text-sky-700 uppercase tracking-wider block">Partenaire Terres de Fenêtre • Pamiers</span>
        </div>
      </div>
      <a href="tel:${cleanPhone}" class="inline-flex items-center gap-2 bg-sky-700 hover:bg-sky-800 text-white font-bold px-5 py-2.5 rounded-xl shadow-md text-xs sm:text-sm active:scale-95 transition-transform">
        <i data-lucide="phone-call" class="w-4 h-4"></i>
        <span>${phone}</span>
      </a>
    </div>
  </header>

  <!-- Hero Section -->
  <section class="py-16 sm:py-24 bg-gradient-to-b from-white to-slate-50 border-b border-slate-200">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 grid lg:grid-cols-12 gap-12 items-center">
      <div class="lg:col-span-7 space-y-6">
        <div class="inline-flex items-center gap-2 bg-sky-50 border border-sky-200 text-sky-800 px-3.5 py-1.5 rounded-full text-xs font-bold">
          <i data-lucide="award" class="w-3.5 h-3.5 text-sky-600"></i> Fabrication Française • Pose Certifiée RGE Qualibat
        </div>
        <h1 class="text-3xl sm:text-5xl font-extrabold text-slate-900 leading-tight">
          Lumière, isolation et confort thermique pour votre <span class="text-sky-700">habitat en Ariège</span>.
        </h1>
        <p class="text-slate-600 text-sm sm:text-base leading-relaxed">
          Fenêtres et baies coulissantes haute performance thermique, volets roulants motorisés, portes d'entrée sécurisées et vérandas sur-mesure. Éligible aux aides MaPrimeRénov'.
        </p>

        <div class="flex flex-col sm:flex-row gap-4 pt-2">
          <a href="tel:${cleanPhone}" class="inline-flex items-center justify-center gap-2 bg-sky-700 hover:bg-sky-800 text-white font-bold px-7 py-3.5 rounded-xl shadow-lg active:scale-95 transition-transform text-sm">
            <i data-lucide="phone" class="w-4 h-4"></i>
            <span>Conseiller au ${phone}</span>
          </a>
          <a href="#configurateur" class="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-slate-800 font-bold px-6 py-3.5 rounded-xl border border-slate-300 text-sm">
            <i data-lucide="settings" class="w-4 h-4 text-sky-700"></i>
            <span>Estimer mon Projet</span>
          </a>
        </div>
      </div>

      <div class="lg:col-span-5">
        <div class="bg-white p-6 rounded-3xl shadow-xl border border-slate-200 space-y-4">
          <img src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80" alt="Baie vitrée moderne" class="rounded-2xl h-64 w-full object-cover shadow-sm">
          <div class="grid grid-cols-2 gap-3 text-center text-xs">
            <div class="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span class="block font-bold text-slate-900 text-base">Jusqu'à -30%</span>
              <span class="text-slate-500">de déperdition thermique</span>
            </div>
            <div class="p-3 bg-slate-50 rounded-xl border border-slate-100">
              <span class="block font-bold text-sky-700 text-base">Garantie 20 ans</span>
              <span class="text-slate-500">Terres de Fenêtre</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Sticky Mobile Bar -->
  <aside aria-label="Contact direct" class="fixed bottom-0 inset-x-0 z-50 sm:hidden bg-white/95 backdrop-blur-md border-t border-slate-200 p-3 shadow-2xl">
    <div class="flex items-center gap-2">
      <a href="tel:${cleanPhone}" class="flex-1 flex items-center justify-center gap-2 bg-sky-700 active:bg-sky-800 text-white py-3 rounded-xl font-bold text-sm shadow-md active:scale-95">
        <i data-lucide="phone-call" class="w-4 h-4"></i>
        <span>Contacter la Menuiserie</span>
      </a>
    </div>
  </aside>

  <script>lucide.createIcons();</script>
</body>
</html>`;
}

// 5. Couteaux Tisseyre (Coutellerie d'Art - La Bastide-sur-l'Hers)
function getDemoCouteauxTisseyre(l: LeadData): string {
  const phone = l.phone || "0689358619";
  const cleanPhone = phone.replace(/\s+/g, "");
  return `<!DOCTYPE html>
<html lang="fr" class="scroll-smooth bg-[#0E1015] text-stone-100">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Couteaux Tisseyre — Coutellerie d'Art • Meilleur Ouvrier de France (MOF)</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700;800;900&family=Plus+Jakarta+Sans:wght@300;400;500;600&display=swap" rel="stylesheet">
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    body { font-family: 'Plus Jakarta Sans', sans-serif; }
    .font-luxury { font-family: 'Cinzel', serif; }
  </style>
</head>
<body class="antialiased selection:bg-[#C5A059] selection:text-black pb-24">

  <!-- Header -->
  <header class="bg-[#0E1015]/90 backdrop-blur-xl sticky top-0 z-40 border-b border-stone-800">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full border border-[#C5A059] text-[#C5A059] flex items-center justify-center font-luxury font-bold text-sm">
          T
        </div>
        <div>
          <span class="font-luxury font-bold text-stone-100 text-lg tracking-wider block">COUTEAUX TISSEYRE</span>
          <span class="text-[10px] font-mono text-[#C5A059] uppercase tracking-widest block">Meilleur Ouvrier de France • Forgé en Ariège</span>
        </div>
      </div>
      <a href="tel:${cleanPhone}" class="inline-flex items-center gap-2 border border-[#C5A059] text-[#C5A059] hover:bg-[#C5A059] hover:text-black font-luxury text-xs px-5 py-2.5 rounded-full transition-all active:scale-95">
        <i data-lucide="phone" class="w-3.5 h-3.5"></i>
        <span>${phone}</span>
      </a>
    </div>
  </header>

  <!-- Hero Section Haute Couture -->
  <section class="py-20 sm:py-28 text-center max-w-4xl mx-auto px-4 space-y-8">
    <div class="inline-flex items-center gap-2 border border-[#C5A059]/40 bg-[#C5A059]/10 text-[#C5A059] px-4 py-1.5 rounded-full text-xs font-mono tracking-widest uppercase">
      🏅 Pièces Uniques Forgées Main • Millésimées
    </div>

    <h1 class="text-4xl sm:text-6xl font-luxury font-bold text-white tracking-wider leading-tight">
      L'excellence de l'acier forgé et du bois précieux.
    </h1>

    <p class="text-stone-400 text-sm sm:text-base max-w-xl mx-auto font-light leading-relaxed">
      Couteaux de collection, pliants d'art et couteaux de table d'exception façonnés dans notre atelier des Pyrénées ariégeoises.
    </p>

    <div class="flex justify-center gap-4 pt-4">
      <a href="tel:${cleanPhone}" class="bg-[#C5A059] hover:bg-[#B38F48] text-black font-luxury font-bold text-xs uppercase tracking-widest px-8 py-4 rounded-full shadow-xl shadow-[#C5A059]/20 transition-all active:scale-95">
        Contacter l'Atelier
      </a>
    </div>
  </section>

  <!-- Sticky Mobile Bar -->
  <aside aria-label="Contact rapide" class="fixed bottom-0 inset-x-0 z-50 sm:hidden bg-stone-950/95 backdrop-blur-md border-t border-stone-800 p-3 shadow-2xl">
    <div class="flex items-center gap-2">
      <a href="tel:${cleanPhone}" class="flex-1 flex items-center justify-center gap-2 bg-[#C5A059] text-black py-3 rounded-xl font-bold text-sm shadow-md active:scale-95">
        <i data-lucide="phone-call" class="w-4 h-4"></i>
        <span>Appeler l'Atelier (${phone})</span>
      </a>
    </div>
  </aside>

  <script>lucide.createIcons();</script>
</body>
</html>`;
}

// Générateur automatique selon l'activité
export function generateCraftHtmlForLead(l: LeadData): string {
  const act = (l.activity || "").toLowerCase();
  const name = (l.company_name || "").toLowerCase();

  if (name.includes("7ème artisan") || name.includes("prats") || act.includes("vidéo")) {
    return getDemoCedricPrats(l);
  }
  if (name.includes("compagnon") || act.includes("couverture") || act.includes("toiture")) {
    return getDemoArtisanCompagnon(l);
  }
  if (name.includes("lavigne") || (act.includes("boulangerie") && !name.includes("bouche"))) {
    return getDemoBoulangerieLavigne(l);
  }
  if (name.includes("bouche") || act.includes("boulangerie")) {
    return getDemoBoulangerieLavigne(l);
  }
  if (name.includes("sedour") || name.includes("fenêtre") || act.includes("menuiserie")) {
    return getDemoMenuiserieSedour(l);
  }
  if (name.includes("tisseyre") || act.includes("coutellerie")) {
    return getDemoCouteauxTisseyre(l);
  }
  // Fallback haute facture artisanale
  return getDemoArtisanCompagnon(l);
}
