(function () {

// =========================
// SUPABASE
// =========================

if (!window.supabaseClient) {
  window.supabaseClient = window.supabase.createClient(
    "https://dncakzpoldnjrqxgeqlg.supabase.co",
    "sb_publishable_iSkXpqNoMz95fBZ3fgPr0Q_9Mb-RyoF"
  );
}

const supabase = window.supabaseClient;

let stickers   = [];
let materiales = [];
let medidas    = [];
let precios    = [];

let sel = {
  sticker:          null,
  materialId:       null,
  medidaId:         null,
  cantidadUnidades: 1,
};

let sortBy = "nombre";

// =========================
// DATA
// =========================

async function cargarTodo() {
  const [s, mat, med, pre] = await Promise.all([
    supabase.from("stickers").select("*").eq("activo", true),
    supabase.from("materiales").select("*").order("id"),
    supabase.from("medidas").select("*").order("lado"),
    supabase.from("precios").select("*").order("cantidad"),
  ]);

  if (s.error || mat.error || med.error || pre.error) {
    console.error("Error cargando data:", { s, mat, med, pre });
  }

  stickers   = s.data   || [];
  materiales = mat.data || [];
  medidas    = med.data || [];
  precios    = pre.data || [];

  console.log("[catalogo] cargado:", {
    stickers:   stickers.length,
    materiales: materiales.length,
    medidas:    medidas.length,
    precios:    precios.length,
  });

  if (!materiales.length || !medidas.length || !precios.length) {
    console.warn(
      "[catalogo] Tabla(s) vacía(s). Si tenés filas en Supabase pero acá llega 0, " +
      "es RLS bloqueando el SELECT. Agregá policy 'SELECT for anon' en las tablas afectadas."
    );
  }

  // exponer tablas para carrito.js
  window.preciosDB  = precios;
  window.medidasDB  = medidas;

  renderStickers();

  // re-renderizar carrito ahora que tenemos precios
  if (window.renderCarrito) window.renderCarrito();
}

// =========================
// GRID DE STICKERS
// =========================

const SORTS = [
  { key: "nombre",   label: "A–Z" },
  { key: "categoria", label: "Categoría" },
  { key: "nuevo",    label: "Nuevo" },
];

function stickersSorted() {
  return [...stickers].sort((a, b) => {
    if (sortBy === "nombre")    return a.nombre.localeCompare(b.nombre, "es");
    if (sortBy === "categoria") return (a.categoria ?? "").localeCompare(b.categoria ?? "", "es") || a.nombre.localeCompare(b.nombre, "es");
    if (sortBy === "nuevo")     return new Date(b.created_at) - new Date(a.created_at);
    return 0;
  });
}

function stickerGrid(items, offset = 0) {
  return `
    <div class="stickers-grid">
      ${items.map((s, i) => `
        <button class="sticker-btn" style="animation-delay:${(offset + i) * 40}ms" onclick="abrirSticker(${s.id})">
          ${imagenOPlaceholder(s.imagen_url, s.nombre, "sticker-thumb")}
          <span class="sticker-name">${escapar(s.nombre)}</span>
        </button>
      `).join("")}
    </div>
  `;
}

function renderStickers() {
  const cont = document.getElementById("productos");
  if (!cont) return;

  if (!stickers.length) {
    cont.innerHTML = `<p class="sec-sub" style="grid-column:1/-1;text-align:center;">No hay stickers disponibles</p>`;
    return;
  }

  const sorted = stickersSorted();
  let contenido;
  if (sortBy === "categoria") {
    const grupos = sorted.reduce((acc, s) => {
      const cat = s.categoria || "Otros";
      (acc[cat] = acc[cat] || []).push(s);
      return acc;
    }, {});

    let offset = 0;
    contenido = Object.entries(grupos).map(([cat, items]) => {
      const html = `
        <div class="categoria-grupo">
          <h4 class="categoria-titulo">${escapar(cat)}</h4>
          ${stickerGrid(items, offset)}
        </div>
      `;
      offset += items.length;
      return html;
    }).join("");
  } else {
    contenido = stickerGrid(sorted);
  }

  cont.innerHTML = `
    <div class="card">
      <div class="card-name">Stickers</div>
      <p class="card-desc">Tocá un diseño para elegir material, tamaño y cantidad.</p>

      <div class="sort-row">
        ${SORTS.map(s => `
          <button class="sort-chip ${sortBy === s.key ? "sort-chip--active" : ""}"
                  onclick="setSortBy('${s.key}')">
            ${s.label}
          </button>
        `).join("")}
      </div>

      ${contenido}
    </div>
  `;
}

function setSortBy(key) {
  if (sortBy === key) return;
  sortBy = key;
  const cont = document.getElementById("productos");
  if (!cont) { renderStickers(); return; }

  cont.classList.add("grid-saliendo");
  setTimeout(() => {
    renderStickers();
    cont.classList.remove("grid-saliendo");
  }, 160);
}

function imagenOPlaceholder(url, alt, cls) {
  if (url) return `<img src="${url}" alt="${escapar(alt)}" class="${cls}">`;
  return `<div class="${cls} ${cls}--ph">🎨</div>`;
}

function escapar(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// =========================
// MODAL SELECTOR
// =========================

function abrirSticker(stickerId) {
  const sticker = stickers.find(s => s.id === stickerId);
  if (!sticker) return;

  sel = {
    sticker,
    materialId:       materiales[0]?.id ?? null,
    medidaId:         medidas[0]?.id ?? null,
    cantidadUnidades: 1,
  };

  renderModal();
  document.getElementById("sticker-modal").style.display = "flex";
  document.body.style.overflow = "hidden";
}

function cerrarSticker() {
  document.getElementById("sticker-modal").style.display = "none";
  document.body.style.overflow = "";
}

function renderModal() {
  const body = document.getElementById("sticker-modal-body");
  if (!body || !sel.sticker) return;

  const preview = precioPreview();

  const faltantes = [];
  if (!materiales.length) faltantes.push("materiales");
  if (!medidas.length)    faltantes.push("medidas");
  if (!precios.length)    faltantes.push("precios");

  body.innerHTML = `
    <button class="sticker-modal-close" onclick="cerrarSticker()" aria-label="Cerrar">×</button>

    <div class="sel-header">
      ${imagenOPlaceholder(sel.sticker.imagen_url, sel.sticker.nombre, "sel-img")}
      <h3 class="sel-title">${escapar(sel.sticker.nombre)}</h3>
    </div>

    ${faltantes.length ? `
      <div class="sel-warn">
        No se cargó: <strong>${faltantes.join(", ")}</strong>.<br>
        Revisá las RLS policies en Supabase (SELECT para <em>anon</em>).
      </div>
    ` : ""}

    <div class="sel-group">
      <p class="sel-label">Material</p>
      <div class="chip-row">
        ${materiales.map(m => `
          <button class="chip ${sel.materialId === m.id ? "chip--active" : ""}"
                  onclick="setMaterial(${m.id})">
            ${escapar(m.nombre)}
          </button>
        `).join("") || `<span class="chip-empty">sin opciones</span>`}
      </div>
    </div>

    <div class="sel-group">
      <p class="sel-label">Tamaño</p>
      <div class="chip-row">
        ${medidas.map(m => `
          <button class="chip ${sel.medidaId === m.id ? "chip--active" : ""}"
                  onclick="setMedida(${m.id})">
            ${escapar(m.nombre)}
          </button>
        `).join("") || `<span class="chip-empty">sin opciones</span>`}
      </div>
    </div>

    <div class="sel-group">
      <p class="sel-label">Cantidad</p>
      <div class="sel-counter">
        <button class="counter-btn" onclick="decCantidad()">−</button>
        <span class="counter-val">${sel.cantidadUnidades}</span>
        <button class="counter-btn" onclick="incCantidad()">+</button>
      </div>
      ${preview ? `<p class="counter-hint">Con tu pedido (${preview.totalConEste}u total) → tramo ${preview.tramo}u</p>` : ""}
    </div>

    <div class="sel-precio">
      <div class="sel-precio-detalle">
        <span class="sel-precio-lbl">Precio</span>
        ${preview ? `<span class="sel-precio-unit">$${format(Math.round(preview.precioUnit))}/u</span>` : ""}
      </div>
      <span class="sel-precio-val">
        ${preview ? "$" + format(Math.round(preview.subtotal)) : "—"}
      </span>
    </div>

    <button class="sel-confirm" onclick="confirmarSticker()" ${!preview ? "disabled" : ""}>
      Agregar al pedido
    </button>
  `;
}

// Calcula preview de precio para el modal
// Toma en cuenta unidades ya en carrito para determinar el tramo correcto
function precioPreview() {
  if (!sel.medidaId || !precios.length) return null;

  const cartTotal  = window.getTotalCarritoUnidades?.() || 0;
  const totalConEste = cartTotal + sel.cantidadUnidades;

  const materialTipo = materiales.find(m => m.id === sel.materialId)?.tipo ?? null;

  const tiers = precios
    .filter(p => p.medida_id === sel.medidaId && (!materialTipo || p.tipo === materialTipo))
    .sort((a, b) => a.cantidad - b.cantidad);

  if (!tiers.length) return null;

  const tier = [...tiers].reverse().find(t => t.cantidad <= totalConEste) || tiers[0];
  const precioUnit = tier.precio / tier.cantidad;

  return {
    precioUnit,
    subtotal:     precioUnit * sel.cantidadUnidades,
    tramo:        tier.cantidad,
    totalConEste,
  };
}

function setMaterial(id) { sel.materialId = id; renderModal(); }
function setMedida(id)   { sel.medidaId   = id; renderModal(); }

function incCantidad() {
  sel.cantidadUnidades++;
  renderModal();
}

function decCantidad() {
  if (sel.cantidadUnidades > 1) {
    sel.cantidadUnidades--;
    renderModal();
  }
}

function confirmarSticker() {
  const preview = precioPreview();
  if (!preview) return;

  const matObj       = materiales.find(m => m.id === sel.materialId);
  const material     = matObj?.nombre ?? "";
  const materialTipo = matObj?.tipo   ?? "";
  const medida       = medidas.find(m => m.id === sel.medidaId)?.nombre ?? "";

  agregar(
    sel.sticker.nombre,
    material,
    medida,
    sel.medidaId,
    sel.cantidadUnidades,
    "Stickers",
    materialTipo
  );

  cerrarSticker();
}

// re-renderizar el modal si está abierto (cuando el carrito cambia, cambia el tramo)
function renderModalIfOpen() {
  const modal = document.getElementById("sticker-modal");
  if (modal?.style.display === "flex") renderModal();
}

// =========================
// MODAL IMAGEN (zoom)
// =========================

function abrirImagen(src) {
  const modal = document.getElementById("modal-img");
  const img   = document.getElementById("modal-contenido");
  if (!modal || !img) return;
  img.src = src;
  modal.style.display = "flex";
}

function cerrarImagen() {
  const modal = document.getElementById("modal-img");
  if (modal) modal.style.display = "none";
}

// =========================
// EXPOSICIÓN GLOBAL
// =========================

window.setSortBy       = setSortBy;
window.abrirSticker    = abrirSticker;
window.cerrarSticker   = cerrarSticker;
window.setMaterial     = setMaterial;
window.setMedida       = setMedida;
window.incCantidad     = incCantidad;
window.decCantidad     = decCantidad;
window.confirmarSticker = confirmarSticker;
window.renderModalIfOpen = renderModalIfOpen;
window.abrirImagen     = abrirImagen;
window.cerrarImagen    = cerrarImagen;

// =========================
// INIT
// =========================

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", cargarTodo);
} else {
  cargarTodo();
}

document.addEventListener("click", (e) => {
  if (e.target.id === "modal-img")    cerrarImagen();
  if (e.target.id === "sticker-modal") cerrarSticker();
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (document.getElementById("sticker-modal")?.style.display === "flex") cerrarSticker();
  if (document.getElementById("modal-img")?.style.display === "flex")    cerrarImagen();
});

})();
