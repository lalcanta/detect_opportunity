/*
 * Onglet admin « Quotas & Coûts » : consommation du compte Cloudflare face aux plafonds du forfait gratuit.
 * Données : GET /api/admin/cloudflare-usage (mise en cache 10 min côté serveur ; « Actualiser » force la lecture).
 */
(function () {
  "use strict";

  var root = document.getElementById("cf-usage");
  if (!root) return;

  var PERIOD = { day: "aujourd'hui (UTC)", month: "ce mois-ci", stored: "stocké" };
  var LIMIT_SUFFIX = { day: "par jour", month: "par mois", stored: "" };
  var STATUS = [
    { min: 100, label: "Plafond atteint", color: "#e11d48", text: "text-rose-700", bg: "bg-rose-50 border-rose-200", icon: "!" },
    { min: 80, label: "Proche du plafond", color: "#d97706", text: "text-amber-800", bg: "bg-amber-50 border-amber-200", icon: "!" },
    { min: 0, label: "Large marge", color: "#059669", text: "text-emerald-700", bg: "", icon: "✓" },
  ];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(n) {
    return Math.round(n).toLocaleString("fr-FR");
  }
  function bytes(n) {
    if (n >= 1024 * 1024 * 1024) return (n / 1024 / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 2 }) + " Go";
    if (n >= 1024 * 1024) return (n / 1024 / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) + " Mo";
    if (n >= 1024) return (n / 1024).toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " Ko";
    return num(n) + " o";
  }
  function fmt(m, v) {
    return m.unit === "bytes" ? bytes(v) : num(v);
  }
  function pct(m) {
    return m.limit > 0 ? (m.value / m.limit) * 100 : 0;
  }
  function pctLabel(p) {
    if (p > 0 && p < 0.1) return "< 0,1 %";
    return p.toLocaleString("fr-FR", { maximumFractionDigits: p < 10 ? 1 : 0 }) + " %";
  }
  function statusOf(p) {
    for (var i = 0; i < STATUS.length; i++) if (p >= STATUS[i].min) return STATUS[i];
    return STATUS[STATUS.length - 1];
  }
  function dayLabel(d) {
    var parts = d.split("-");
    return parts[2] + "/" + parts[1];
  }
  function timeLabel(iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }

  /** Barres des 30 derniers jours, sans axe : l'échelle est le pic de la période, rappelé en légende. */
  function spark(m) {
    var h = m.history || [];
    if (!h.length) return "";
    var W = 240, H = 44, gap = 2;
    var max = 0;
    h.forEach(function (p) { if (p.value > max) max = p.value; });
    var bw = Math.max(2, (W - gap * (h.length - 1)) / h.length);
    var bars = h.map(function (p, i) {
      var bh = max > 0 ? Math.max(p.value > 0 ? 2 : 0, (p.value / max) * (H - 2)) : 0;
      var x = i * (bw + gap);
      var last = i === h.length - 1;
      var tip = dayLabel(p.date) + " : " + fmt(m, p.value) + (m.period === "month" ? " (cumul du mois)" : "");
      return (
        '<g class="cfu-bar" data-tip="' + esc(tip) + '">' +
        '<rect x="' + x + '" y="0" width="' + (bw + gap) + '" height="' + H + '" fill="transparent"/>' +
        (bh > 0 ? '<rect x="' + x + '" y="' + (H - bh) + '" width="' + bw + '" height="' + bh + '" rx="' + Math.min(2, bw / 2) + '" fill="' + (last ? "#4f46e5" : "#c7d2fe") + '"/>' : "") +
        "</g>"
      );
    }).join("");
    var peak = h.reduce(function (a, p) { return p.value > a.value ? p : a; }, h[0]);
    return (
      '<svg viewBox="0 0 ' + W + " " + H + '" class="w-full h-11 block" preserveAspectRatio="none" role="img" aria-label="' + esc(m.service + " " + m.label + " sur 30 jours, pic " + fmt(m, peak.value)) + '">' +
      '<line x1="0" y1="' + (H - 0.5) + '" x2="' + W + '" y2="' + (H - 0.5) + '" stroke="#e4e4e7"/>' + bars + "</svg>" +
      '<div class="flex justify-between text-[10px] text-zinc-400 mt-1"><span>' + dayLabel(h[0].date) + "</span><span>" +
      (m.period === "month" ? "cumul du mois" : "pic " + fmt(m, peak.value) + " le " + dayLabel(peak.date)) + "</span><span>" + dayLabel(h[h.length - 1].date) + "</span></div>"
    );
  }

  function card(m) {
    var p = pct(m);
    var st = statusOf(p);
    var width = Math.min(100, p);
    return (
      '<div class="rounded-xl border ' + (st.bg || "border-zinc-200") + ' p-4 flex flex-col gap-3">' +
      '<div class="flex items-start justify-between gap-2"><div class="min-w-0"><div class="text-[11px] font-semibold text-zinc-500">' + esc(m.service) + '</div><div class="text-sm font-bold text-zinc-900">' + esc(m.label) + "</div></div>" +
      '<span class="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold ' + st.text + '"><span aria-hidden="true">' + st.icon + "</span>" + st.label + "</span></div>" +
      '<div><div class="flex items-baseline justify-between gap-2"><span class="text-xl font-bold text-zinc-900 tabular-nums">' + fmt(m, m.value) + '</span><span class="text-[11px] text-zinc-500 tabular-nums text-right">sur ' + fmt(m, m.limit) + " " + LIMIT_SUFFIX[m.period] + "</span></div>" +
      '<div class="mt-2 h-2 rounded-full bg-zinc-100 overflow-hidden" role="meter" aria-valuemin="0" aria-valuemax="' + m.limit + '" aria-valuenow="' + m.value + '" aria-label="' + esc(m.service + " " + m.label) + '">' +
      '<div class="h-full rounded-full" style="width:' + (width > 0 && width < 1 ? 1 : width) + "%;background:" + st.color + '"></div></div>' +
      '<div class="flex justify-between text-[11px] mt-1"><span class="text-zinc-500">' + PERIOD[m.period] + '</span><span class="font-semibold text-zinc-700 tabular-nums">' + pctLabel(p) + "</span></div></div>" +
      '<div class="cfu-spark relative">' + spark(m) + "</div>" +
      (m.note ? '<p class="text-[11px] text-zinc-500 leading-snug">' + esc(m.note) + "</p>" : "") +
      "</div>"
    );
  }

  function table(title, head, rows) {
    if (!rows.length) return "";
    return (
      '<div class="min-w-0"><h4 class="text-xs font-bold text-zinc-900 mb-2">' + esc(title) + '</h4><div class="overflow-x-auto"><table class="w-full text-xs"><thead><tr class="text-left text-zinc-500">' +
      head.map(function (h, i) { return '<th class="font-semibold py-1 ' + (i ? "text-right" : "") + '">' + esc(h) + "</th>"; }).join("") +
      "</tr></thead><tbody>" +
      rows.map(function (r) { return '<tr class="border-t border-zinc-100">' + r.map(function (c, i) { return '<td class="py-1.5 ' + (i ? "text-right tabular-nums" : "font-mono text-[11px] break-all") + '">' + esc(c) + "</td>"; }).join("") + "</tr>"; }).join("") +
      "</tbody></table></div></div>"
    );
  }

  function header(data, busy) {
    var plan = data.plan === "paid" ? "Forfait payant détecté : plafonds indicatifs" : data.plan === "free" ? "Forfait gratuit" : "Forfait non vérifié : plafonds du forfait gratuit";
    return (
      '<div class="flex flex-wrap items-start justify-between gap-3 mb-4"><div><h3 class="text-base font-bold text-zinc-900">Cloudflare</h3>' +
      '<p class="text-xs text-zinc-500">' + esc(plan) + (data.fetchedAt ? " · relevé à " + timeLabel(data.fetchedAt) : "") + " · remise à zéro des quotas journaliers à minuit UTC</p></div>" +
      '<button type="button" data-cfu-refresh class="text-xs font-semibold border border-zinc-200 hover:bg-zinc-50 text-zinc-800 rounded-lg px-3 py-1.5"' + (busy ? " disabled" : "") + ">" + (busy ? "Actualisation…" : "Actualiser") + "</button></div>"
    );
  }

  function render(data, busy) {
    if (!data.configured) {
      root.innerHTML =
        '<h3 class="text-base font-bold text-zinc-900 mb-1">Cloudflare</h3>' +
        '<p class="text-sm text-zinc-600 mb-3">Pour suivre ici les requêtes, D1, Workers AI, R2 et les builds Pages, ajoutez un jeton d\'API en lecture seule.</p>' +
        '<ol class="text-xs text-zinc-700 space-y-1.5 list-decimal pl-4">' +
        "<li>Tableau de bord Cloudflare → My Profile → API Tokens → Create Token → Custom token, avec en lecture : <b>Account Analytics</b>, <b>D1</b>, <b>Cloudflare Pages</b>, <b>Workers R2 Storage</b> (et <b>Billing</b> pour détecter le forfait).</li>" +
        '<li>Dans <span class="font-mono">lead-dashboard-web</span> : <span class="font-mono">npx wrangler pages secret put CF_API_TOKEN</span>, puis <span class="font-mono">CF_ACCOUNT_ID</span> (identifiant du compte).</li>' +
        "</ol>";
      return;
    }
    if (data.error) {
      root.innerHTML = header(data, busy) + '<p class="text-sm text-rose-700">' + esc(data.error) + "</p>";
      return;
    }
    var metrics = data.metrics || [];
    var hot = metrics.filter(function (m) { return pct(m) >= 80; });
    var alert = hot.length
      ? '<div class="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900" role="alert"><b>Attention :</b> ' +
        hot.map(function (m) { return esc(m.service + " · " + m.label.toLowerCase() + " à " + pctLabel(pct(m))); }).join(" ; ") + ".</div>"
      : '<div class="mb-4 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-xs text-emerald-900">Tous les services sont sous 80 % de leur plafond.</div>';
    var models = (data.aiModelsToday || []).map(function (r) { return [r.model.replace(/^@cf\//, ""), num(r.neurons), num(r.calls)]; });
    var buckets = (data.r2Buckets || []).map(function (b) { return [b.name, bytes(b.bytes), num(b.objects)]; });
    root.innerHTML =
      header(data, busy) +
      alert +
      '<div class="grid sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">' + metrics.map(card).join("") + "</div>" +
      ((models.length || buckets.length) ? '<div class="grid md:grid-cols-2 gap-6 mt-5 pt-4 border-t border-zinc-100">' + table("Workers AI aujourd'hui, par modèle", ["Modèle", "Neurones", "Appels"], models) + table("Buckets R2", ["Bucket", "Taille", "Objets"], buckets) + "</div>" : "") +
      (data.partialErrors ? '<p class="mt-3 text-[11px] text-zinc-500">Données partielles : ' + esc(data.partialErrors.join(" ; ")) + "</p>" : "") +
      '<div class="cfu-tip" hidden></div>';
  }

  var last = null;
  function load(refresh) {
    if (last) render(last, true);
    fetch("/api/admin/cloudflare-usage" + (refresh ? "?refresh=1" : ""))
      .then(function (r) { return r.json(); })
      .then(function (data) { last = data; render(data, false); })
      .catch(function () {
        root.innerHTML = '<p class="text-sm text-rose-700">Consommation Cloudflare indisponible : le dashboard ne répond pas.</p>';
      });
  }

  root.addEventListener("click", function (e) {
    if (e.target.closest("[data-cfu-refresh]")) load(true);
  });

  // Info-bulle des barres : date et valeur du jour survolé.
  root.addEventListener("mousemove", function (e) {
    var tip = root.querySelector(".cfu-tip");
    if (!tip) return;
    var bar = e.target.closest && e.target.closest(".cfu-bar");
    if (!bar) {
      tip.hidden = true;
      return;
    }
    var box = root.getBoundingClientRect();
    tip.textContent = bar.getAttribute("data-tip");
    tip.hidden = false;
    var x = e.clientX - box.left + 12;
    if (x + tip.offsetWidth > box.width) x = e.clientX - box.left - tip.offsetWidth - 12;
    tip.style.left = x + "px";
    tip.style.top = e.clientY - box.top - 34 + "px";
  });
  root.addEventListener("mouseleave", function () {
    var tip = root.querySelector(".cfu-tip");
    if (tip) tip.hidden = true;
  });

  var style = document.createElement("style");
  style.textContent =
    "#cf-usage{position:relative}" +
    ".cfu-tip{position:absolute;z-index:5;pointer-events:none;background:#18181b;color:#fff;font-size:11px;font-weight:600;padding:4px 8px;border-radius:6px;white-space:nowrap}" +
    ".cfu-bar:hover rect:last-child{fill:#4338ca}";
  document.head.appendChild(style);

  load(false);
})();
