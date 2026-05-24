(function () {
  "use strict";

  var config = window.SUPABASE_CONFIG || {};
  var SUPABASE_URL = config.url || "";
  var SUPABASE_KEY = config.anonKey || "";

  // ── SVG helpers ──────────────────────────────────────────────────
  var CHEVRON_SM = '<svg width="12" height="12" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M1 1l4 4 4-4"/></svg>';
  var CHEVRON_DD = '<svg class="nav-dd-chevron" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M1 1l4 4 4-4"/></svg>';

  // ── Nav HTML ─────────────────────────────────────────────────────
  function buildHTML() {
    return `
<nav id="main-nav" aria-label="Navegación principal">
  <a href="/index.html" class="nav-logo">CAINA</a>

  <ul class="nav-links">
    <li>
      <a href="/novedades.html" class="nav-badge-new">Novedades</a>
    </li>
    <li>
      <a href="/pedido.html">Armá tu pedido</a>
    </li>
    <li class="nav-has-dd">
      <button class="nav-dd-trigger" type="button">Productos ${CHEVRON_DD}</button>
      <div class="nav-dd-panel" id="dd-tipos">
        <span class="nav-dd-loading">Cargando…</span>
      </div>
    </li>
    <li class="nav-has-dd">
      <button class="nav-dd-trigger" type="button">Categorías ${CHEVRON_DD}</button>
      <div class="nav-dd-panel" id="dd-cats">
        <span class="nav-dd-loading">Cargando…</span>
      </div>
    </li>
    <li class="nav-has-dd">
      <button class="nav-dd-trigger" type="button">Contacto ${CHEVRON_DD}</button>
      <div class="nav-dd-panel">
        <a href="/nosotros.html">Quiénes somos</a>
        <a href="/contacto.html">Contacto</a>
      </div>
    </li>
    <li class="nav-has-dd">
      <button class="nav-dd-trigger" type="button">Ayuda ${CHEVRON_DD}</button>
      <div class="nav-dd-panel">
        <a href="/faq.html">Preguntas frecuentes</a>
        <a href="/como-comprar.html">Cómo comprar</a>
        <a href="/envio.html">Formas de envío</a>
        <a href="/politicas-cambio.html">Políticas de cambio</a>
      </div>
    </li>
  </ul>

  <div class="nav-right">
    <a href="https://www.instagram.com/caina.stickers/" target="_blank" rel="noopener" class="nav-ig" aria-label="Instagram de CAINA">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/>
      </svg>
      Instagram
    </a>
    <a href="https://wa.me/5491138454766" target="_blank" rel="noopener" class="nav-wa">
      <img src="/assets/icons/whatsapp_white.png" alt="" width="15" height="15">
      WhatsApp
    </a>
    <button class="nav-burger" id="nav-burger" type="button" aria-label="Abrir menú" aria-expanded="false">
      <span></span><span></span><span></span>
    </button>
  </div>
</nav>

<div class="nav-mobile" id="nav-mobile" aria-hidden="true">
  <a href="/novedades.html" class="nav-mobile-item" style="color:var(--lime)">✦ Novedades</a>
  <a href="/pedido.html" class="nav-mobile-item">Armá tu pedido</a>

  <div>
    <button class="nav-mobile-dd-trigger" type="button" onclick="cainaNavToggle(this)">
      Productos ${CHEVRON_SM}
    </button>
    <div class="nav-mobile-dd-items" id="mob-dd-tipos"></div>
  </div>

  <div>
    <button class="nav-mobile-dd-trigger" type="button" onclick="cainaNavToggle(this)">
      Categorías ${CHEVRON_SM}
    </button>
    <div class="nav-mobile-dd-items" id="mob-dd-cats"></div>
  </div>

  <div>
    <button class="nav-mobile-dd-trigger" type="button" onclick="cainaNavToggle(this)">
      Contacto ${CHEVRON_SM}
    </button>
    <div class="nav-mobile-dd-items">
      <a href="/nosotros.html">Quiénes somos</a>
      <a href="/contacto.html">Contacto</a>
    </div>
  </div>

  <div>
    <button class="nav-mobile-dd-trigger" type="button" onclick="cainaNavToggle(this)">
      Ayuda ${CHEVRON_SM}
    </button>
    <div class="nav-mobile-dd-items">
      <a href="/faq.html">Preguntas frecuentes</a>
      <a href="/como-comprar.html">Cómo comprar</a>
      <a href="/envio.html">Formas de envío</a>
      <a href="/politicas-cambio.html">Políticas de cambio</a>
    </div>
  </div>

  <a href="https://wa.me/5491138454766" target="_blank" rel="noopener" class="nav-mobile-wa">
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
      <path d="M12 0C5.373 0 0 5.373 0 12c0 2.127.558 4.123 1.532 5.855L.057 23.5l5.798-1.452A11.954 11.954 0 0 0 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.818 9.818 0 0 1-5.027-1.38l-.36-.214-3.44.862.924-3.367-.235-.374A9.817 9.817 0 0 1 2.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
    </svg>
    Escribinos al WhatsApp
  </a>
</div>`;
  }

  // ── Inject nav into #nav-root ────────────────────────────────────
  function inject() {
    var root = document.getElementById("nav-root");
    if (!root) return;
    root.innerHTML = buildHTML();

    var burger = document.getElementById("nav-burger");
    var mobile = document.getElementById("nav-mobile");
    if (burger && mobile) {
      burger.addEventListener("click", function () {
        var open = mobile.classList.toggle("open");
        burger.setAttribute("aria-expanded", open);
        mobile.setAttribute("aria-hidden", !open);
      });
    }

    // Close mobile menu when any link inside it is clicked
    if (mobile) {
      mobile.querySelectorAll("a").forEach(function (a) {
        a.addEventListener("click", function () {
          mobile.classList.remove("open");
          if (burger) burger.setAttribute("aria-expanded", "false");
          mobile.setAttribute("aria-hidden", "true");
        });
      });
    }
  }

  // ── Mobile accordion ─────────────────────────────────────────────
  window.cainaNavToggle = function (btn) {
    var panel = btn.nextElementSibling;
    var open = panel.classList.toggle("open");
    btn.classList.toggle("open", open);
  };

  // ── HTML escaping ────────────────────────────────────────────────
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  // ── Fill a dropdown (desktop + mobile) ──────────────────────────
  function fillDropdown(desktopId, mobileId, items, idKey, nameKey, param) {
    var desk = document.getElementById(desktopId);
    var mob  = document.getElementById(mobileId);

    if (!items || !items.length) {
      if (desk) desk.innerHTML = '<span class="nav-dd-loading">Sin datos</span>';
      return;
    }

    var links = items.map(function (item) {
      return '<a href="/pedido.html?' + param + '=' + item[idKey] + '">' + esc(item[nameKey]) + '</a>';
    }).join("");

    if (desk) desk.innerHTML = links;
    if (mob)  mob.innerHTML  = links;
  }

  // ── Fetch tipos & categorias from Supabase ───────────────────────
  async function fetchData() {
    if (!window.supabase) return;

    if (!window.supabaseClient) {
      window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    var db = window.supabaseClient;

    var results = await Promise.all([
      db.from("tipo").select("id_tipo, nombre_tipo").order("nombre_tipo"),
      db.from("categoria").select("id_categoria, nombre_categoria").order("nombre_categoria"),
    ]);

    fillDropdown("dd-tipos", "mob-dd-tipos", results[0].data, "id_tipo",      "nombre_tipo",      "tipo");
    fillDropdown("dd-cats",  "mob-dd-cats",  results[1].data, "id_categoria", "nombre_categoria", "categoria");

    // "Ver todos" al final de la lista de tipos
    var ddTipos   = document.getElementById("dd-tipos");
    var mobTipos  = document.getElementById("mob-dd-tipos");
    var separador = '<div style="height:1px;background:rgba(255,255,255,.08);margin:.3rem .4rem;"></div>';
    var verTodos  = '<a href="/pedido.html">Ver todos los productos</a>';
    if (ddTipos)  ddTipos.innerHTML  += separador + verTodos;
    if (mobTipos) mobTipos.innerHTML += verTodos;
  }

  // ── Init ─────────────────────────────────────────────────────────
  function init() {
    inject();
    fetchData().catch(function () {});
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
