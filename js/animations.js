/* ══════════════════════════════════════════════════════════════════════
   CAINA · Motor de animaciones
   ----------------------------------------------------------------------
   - Revela elementos al entrar en el viewport (IntersectionObserver).
   - Escalona las grillas que se renderizan por JS (stickers, novedades).
   - Barra de progreso de scroll, nav con sombra y parallax del hero.

   Los estilos viven en css/animations.css, todos bajo html.anim.
   Este archivo marca window.__anim para desactivar el fallback inline
   que quita esa clase si el script nunca llega a cargar.
   ══════════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  window.__anim = true;

  var root = document.documentElement;

  // Sin soporte de IntersectionObserver: mejor apagar todo que dejar
  // contenido invisible.
  if (!("IntersectionObserver" in window)) {
    root.classList.remove("anim");
    return;
  }

  var sinMovimiento = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Debe reflejar la lista de css/animations.css § 1
  var SELECTOR_REVEAL = [
    "[data-reveal]",
    ".sec-header",
    ".gallery-intro",
    ".page-header",
    ".novedades-header",
    ".pill",
    ".g-item",
    ".cta-final > *",
    ".btn-producto",
    ".about-block",
    ".value-card",
    ".info-card",
    ".contact-card",
    ".step",
    ".faq-item",
    ".policy-block",
    ".detail-row",
    ".divider-title",
    ".info-note",
    ".cta-note",
    ".cta-box",
    ".novedades-cta",
    ".categoria-grupo",
    ".resumen"
  ].join(",");

  var PASO_STAGGER  = 70;   // ms entre hermanos
  var CICLO_STAGGER = 6;    // a partir del 6º el retraso vuelve a empezar
  var DUR_REVEAL    = 900;  // ms; después de esto se limpia --d

  // ── Scroll reveal ────────────────────────────────────────────────────

  var observador = new IntersectionObserver(function (entradas) {
    entradas.forEach(function (entrada) {
      if (!entrada.isIntersecting) return;
      var el = entrada.target;
      observador.unobserve(el);
      el.classList.add("is-visible");

      // El retraso del escalonado sólo sirve para la entrada: si queda
      // puesto, los hover del elemento también arrancarían tarde.
      var d = parseInt(el.style.getPropertyValue("--d"), 10) || 0;
      setTimeout(function () { el.style.removeProperty("--d"); }, d + DUR_REVEAL);
    });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.06 });

  var contadores = new WeakMap();

  function preparar(el) {
    if (el.dataset.animOn) return;
    el.dataset.animOn = "1";

    if (sinMovimiento) {
      el.classList.add("is-visible");
      return;
    }

    // Escalonado por grupo de hermanos: cada contenedor lleva su índice.
    var padre = el.parentElement || document.body;
    var i = contadores.get(padre) || 0;
    contadores.set(padre, i + 1);
    if (i > 0) {
      el.style.setProperty("--d", ((i % CICLO_STAGGER) * PASO_STAGGER) + "ms");
    }

    observador.observe(el);
  }

  function prepararDentro(nodo) {
    if (nodo.nodeType !== 1) return;
    if (nodo.matches(SELECTOR_REVEAL)) preparar(nodo);
    nodo.querySelectorAll(SELECTOR_REVEAL).forEach(preparar);
  }

  // ── Escalonado de las grillas dinámicas ──────────────────────────────
  // catalogo.js ya setea animation-delay inline en sus botones; sólo
  // completamos los que llegan sin retraso propio.

  var SELECTOR_ITEM = ".sticker-btn, .novedad-card";
  var pendientes = [];
  var tandaAgendada = false;

  function encolarItem(el) {
    if (el.style.animationDelay) return;
    pendientes.push(el);
    if (tandaAgendada) return;
    tandaAgendada = true;
    requestAnimationFrame(function () {
      pendientes.forEach(function (item, i) {
        item.style.animationDelay = Math.min(i, 24) * 35 + "ms";
      });
      pendientes = [];
      tandaAgendada = false;
    });
  }

  function itemsDentro(nodo) {
    if (nodo.nodeType !== 1) return;
    if (nodo.matches(SELECTOR_ITEM)) encolarItem(nodo);
    nodo.querySelectorAll(SELECTOR_ITEM).forEach(encolarItem);
  }

  // ── Contenido inyectado después de la carga ──────────────────────────
  // El nav, el catálogo y las novedades se renderizan por JS, así que hay
  // que enganchar lo que aparezca más tarde.

  new MutationObserver(function (mutaciones) {
    mutaciones.forEach(function (m) {
      m.addedNodes.forEach(function (nodo) {
        if (!sinMovimiento) itemsDentro(nodo);
        prepararDentro(nodo);
      });
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  // ── Barra de progreso + nav + parallax del hero ──────────────────────

  var barra   = null;
  var nav     = null;
  var hero    = null;
  var heroCnt = null;
  var enCola  = false;

  function alScrollear() {
    if (enCola) return;
    enCola = true;
    requestAnimationFrame(function () {
      enCola = false;
      var y = window.scrollY || document.documentElement.scrollTop;

      if (barra) {
        var total = document.documentElement.scrollHeight - window.innerHeight;
        barra.style.transform = "scaleX(" + (total > 0 ? Math.min(y / total, 1) : 0) + ")";
      }

      if (!nav) nav = document.getElementById("main-nav");
      if (nav) nav.classList.toggle("nav-scrolled", y > 20);

      if (heroCnt && hero) {
        var alto = hero.offsetHeight || 1;
        var t = Math.min(y / alto, 1);
        heroCnt.style.transform = "translateY(" + (t * alto * 0.3) + "px)";
        heroCnt.style.opacity = String(1 - t * 0.9);
      }
    });
  }

  function iniciar() {
    document.querySelectorAll(SELECTOR_REVEAL).forEach(preparar);

    if (sinMovimiento) return;

    document.querySelectorAll(SELECTOR_ITEM).forEach(encolarItem);

    barra = document.createElement("span");
    var wrap = document.createElement("div");
    wrap.className = "scroll-progress";
    wrap.setAttribute("aria-hidden", "true");
    wrap.appendChild(barra);
    document.body.appendChild(wrap);

    hero    = document.querySelector(".hero-video");
    heroCnt = document.querySelector(".hero-video-content");

    window.addEventListener("scroll", alScrollear, { passive: true });
    window.addEventListener("resize", alScrollear, { passive: true });
    alScrollear();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciar);
  } else {
    iniciar();
  }
})();
