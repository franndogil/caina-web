(function () {

// =========================
// SUPABASE — admin DB
// =========================

if (!window.supabaseClient) {
  window.supabaseClient = window.supabase.createClient(
    "https://wuhqymfqxfakldkhgbpu.supabase.co",
    "sb_publishable_DCspRV_g8Z6El-xTdEakTw_tv8s5tyk"
  );
}

const supabase = window.supabaseClient;

let productos  = [];
let variantes  = [];
let materiales = [];
let tamanios   = [];
let precios    = [];

let sel = {
  producto:   null,
  materialId: null,
  tamanioId:  null,
  cantidad:   1,
};

let sortBy = "nombre";

// =========================
// DATA
// =========================

async function cargarTodo() {
  const [prods, vars, mats, tams, pres] = await Promise.all([
    supabase.from("producto").select("*, tipo(id_tipo, nombre_tipo)"),
    supabase.from("variante").select("*"),
    supabase.from("material").select("*"),
    supabase.from("tamanio").select("*"),
    supabase.from("precio").select(`
      id_precio, valor,
      precio_usa_tipo(id_tipo),
      precio_usa_material(id_material),
      precio_usa_tamanio(id_tamanio)
    `),
  ]);

  if (prods.error || vars.error || mats.error || tams.error || pres.error) {
    console.error("[catalogo] Error cargando data:", { prods, vars, mats, tams, pres });
  }

  productos  = prods.data || [];
  variantes  = vars.data  || [];
  materiales = mats.data  || [];
  tamanios   = tams.data  || [];
  precios    = pres.data  || [];

  console.log("[catalogo] cargado:", {
    productos:  productos.length,
    variantes:  variantes.length,
    materiales: materiales.length,
    tamanios:   tamanios.length,
    precios:    precios.length,
  });

  renderProductos();
  if (window.renderCarrito) window.renderCarrito();
}

// =========================
// HELPERS DE VARIANTES
// =========================

// Materiales disponibles para un producto
function getMaterialesDeProducto(id_producto) {
  const ids = [...new Set(
    variantes.filter(v => v.id_producto === id_producto).map(v => v.id_material)
  )];
  return materiales.filter(m => ids.includes(m.id_material));
}

// Tamaños disponibles para un producto + material
function getTamaniosDeProductoYMaterial(id_producto, id_material) {
  const ids = [...new Set(
    variantes
      .filter(v => v.id_producto === id_producto && v.id_material === id_material)
      .map(v => v.id_tamanio)
  )];
  // ordenar: primero por unidad, luego por valor numérico
  return tamanios
    .filter(t => ids.includes(t.id_tamanio))
    .sort((a, b) => {
      if (a.unidad !== b.unidad) return a.unidad.localeCompare(b.unidad);
      return parseFloat(a.valor) - parseFloat(b.valor);
    });
}

// Precio para material + tamaño (intenta match exacto, luego fallbacks)
function getPrecio(id_tipo, id_material, id_tamanio) {
  // 1. tipo + material + tamaño
  let match = precios.find(p =>
    p.precio_usa_tamanio?.some(t => t.id_tamanio === id_tamanio) &&
    p.precio_usa_material?.some(m => m.id_material === id_material) &&
    p.precio_usa_tipo?.some(tp => tp.id_tipo === id_tipo)
  );
  if (match) return match;

  // 2. material + tamaño
  match = precios.find(p =>
    p.precio_usa_tamanio?.some(t => t.id_tamanio === id_tamanio) &&
    p.precio_usa_material?.some(m => m.id_material === id_material)
  );
  if (match) return match;

  // 3. solo tamaño
  return precios.find(p =>
    p.precio_usa_tamanio?.some(t => t.id_tamanio === id_tamanio)
  ) ?? null;
}

// =========================
// GRID DE PRODUCTOS
// =========================

const SORTS = [
  { key: "nombre",    label: "A–Z" },
  { key: "tipo",      label: "Tipo" },
];

function productosSorted() {
  return [...productos].sort((a, b) => {
    if (sortBy === "tipo") {
      const ta = a.tipo?.nombre_tipo ?? "";
      const tb = b.tipo?.nombre_tipo ?? "";
      return ta.localeCompare(tb, "es") || a.nombre.localeCompare(b.nombre, "es");
    }
    return a.nombre.localeCompare(b.nombre, "es");
  });
}

function renderProductos() {
  const cont = document.getElementById("productos");
  if (!cont) return;

  if (!productos.length) {
    cont.innerHTML = `<p class="sec-sub" style="grid-column:1/-1;text-align:center;">No hay productos disponibles</p>`;
    return;
  }

  const sorted = productosSorted();
  let contenido;

  if (sortBy === "tipo") {
    const grupos = sorted.reduce((acc, p) => {
      const cat = p.tipo?.nombre_tipo ?? "Sin tipo";
      (acc[cat] = acc[cat] || []).push(p);
      return acc;
    }, {});

    let offset = 0;
    contenido = Object.entries(grupos).map(([cat, items]) => {
      const html = `
        <div class="categoria-grupo">
          <h4 class="categoria-titulo">${escapar(cat)}</h4>
          ${productoGrid(items, offset)}
        </div>
      `;
      offset += items.length;
      return html;
    }).join("");
  } else {
    contenido = productoGrid(sorted);
  }

  cont.innerHTML = `
    <div class="card">
      <div class="card-name">Productos</div>
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

function productoGrid(items, offset = 0) {
  return `
    <div class="stickers-grid">
      ${items.map((p, i) => `
        <button class="sticker-btn" style="animation-delay:${(offset + i) * 40}ms"
                onclick="abrirProducto(${p.id_producto})">
          <div class="sticker-thumb sticker-thumb--ph">🎨</div>
          <span class="sticker-name">${escapar(p.nombre)}</span>
        </button>
      `).join("")}
    </div>
  `;
}

function setSortBy(key) {
  if (sortBy === key) return;
  sortBy = key;
  const cont = document.getElementById("productos");
  if (!cont) { renderProductos(); return; }
  cont.classList.add("grid-saliendo");
  setTimeout(() => {
    renderProductos();
    cont.classList.remove("grid-saliendo");
  }, 160);
}

function escapar(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// =========================
// MODAL SELECTOR
// =========================

function abrirProducto(id_producto) {
  const producto = productos.find(p => p.id_producto === id_producto);
  if (!producto) return;

  const mats    = getMaterialesDeProducto(id_producto);
  const matId   = mats[0]?.id_material ?? null;
  const tams    = matId ? getTamaniosDeProductoYMaterial(id_producto, matId) : [];
  const tamId   = tams[0]?.id_tamanio ?? null;

  sel = { producto, materialId: matId, tamanioId: tamId, cantidad: 1 };

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
  if (!body || !sel.producto) return;

  const { id_producto, nombre, tipo } = sel.producto;

  const mats     = getMaterialesDeProducto(id_producto);
  const tams     = sel.materialId
    ? getTamaniosDeProductoYMaterial(id_producto, sel.materialId)
    : [];

  const precioObj = (sel.materialId && sel.tamanioId)
    ? getPrecio(tipo?.id_tipo ?? null, sel.materialId, sel.tamanioId)
    : null;

  const precioUnit = precioObj?.valor ?? null;
  const subtotal   = precioUnit != null ? Math.round(precioUnit * sel.cantidad) : null;
  const canAdd     = precioObj != null;

  const fmt = n => n.toLocaleString("es-AR");

  body.innerHTML = `
    <button class="sticker-modal-close" onclick="cerrarSticker()" aria-label="Cerrar">×</button>

    <div class="sel-header">
      <div class="sel-img sel-img--ph">🎨</div>
      <h3 class="sel-title">${escapar(nombre)}</h3>
    </div>

    <div class="sel-group">
      <p class="sel-label">Material</p>
      <div class="chip-row">
        ${mats.length
          ? mats.map(m => `
              <button class="chip ${sel.materialId === m.id_material ? "chip--active" : ""}"
                      onclick="setMaterial(${m.id_material})">
                ${escapar(m.nombre_material)}
              </button>
            `).join("")
          : `<span class="chip-empty">sin opciones</span>`}
      </div>
    </div>

    <div class="sel-group">
      <p class="sel-label">Tamaño</p>
      <div class="chip-row">
        ${tams.length
          ? tams.map(t => `
              <button class="chip ${sel.tamanioId === t.id_tamanio ? "chip--active" : ""}"
                      onclick="setTamanio(${t.id_tamanio})">
                ${escapar(t.valor)} ${escapar(t.unidad)}
              </button>
            `).join("")
          : `<span class="chip-empty">Elegí un material primero</span>`}
      </div>
    </div>

    <div class="sel-group">
      <p class="sel-label">Cantidad</p>
      <div class="sel-counter">
        <button class="counter-btn" onclick="decCantidad()">−</button>
        <span class="counter-val">${sel.cantidad}</span>
        <button class="counter-btn" onclick="incCantidad()">+</button>
      </div>
    </div>

    <div class="sel-precio">
      <div class="sel-precio-detalle">
        <span class="sel-precio-lbl">Precio</span>
        ${precioUnit != null ? `<span class="sel-precio-unit">$${fmt(Math.round(precioUnit))}/u</span>` : ""}
      </div>
      <span class="sel-precio-val">
        ${subtotal != null ? "$" + fmt(subtotal) : "—"}
      </span>
    </div>

    <button class="sel-confirm" onclick="confirmarProducto()" ${canAdd ? "" : "disabled"}>
      Agregar al pedido
    </button>
  `;
}

function setMaterial(id) {
  sel.materialId = id;
  // Si el tamaño actual no existe para este material, resetear al primero
  const tams = getTamaniosDeProductoYMaterial(sel.producto.id_producto, id);
  if (!tams.find(t => t.id_tamanio === sel.tamanioId)) {
    sel.tamanioId = tams[0]?.id_tamanio ?? null;
  }
  renderModal();
}

function setTamanio(id) {
  sel.tamanioId = id;
  renderModal();
}

function incCantidad() { sel.cantidad++; renderModal(); }
function decCantidad() {
  if (sel.cantidad > 1) { sel.cantidad--; renderModal(); }
}

function confirmarProducto() {
  if (!sel.materialId || !sel.tamanioId) return;

  const mat       = materiales.find(m => m.id_material === sel.materialId);
  const tam       = tamanios.find(t => t.id_tamanio === sel.tamanioId);
  const precioObj = getPrecio(sel.producto.tipo?.id_tipo ?? null, sel.materialId, sel.tamanioId);

  if (!precioObj) return;

  const tamLabel = `${tam?.valor ?? ""} ${tam?.unidad ?? ""}`.trim();

  agregar(
    sel.producto.nombre,
    mat?.nombre_material ?? "",
    tamLabel,
    sel.tamanioId,
    sel.cantidad,
    sel.producto.tipo?.nombre_tipo ?? "Producto",
    sel.materialId,
    precioObj.valor
  );

  cerrarSticker();
}

function renderModalIfOpen() {
  const modal = document.getElementById("sticker-modal");
  if (modal?.style.display === "flex") renderModal();
}

// =========================
// MODAL IMAGEN (zoom — para productos con imagen)
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

window.setSortBy         = setSortBy;
window.abrirProducto     = abrirProducto;
window.cerrarSticker     = cerrarSticker;
window.setMaterial       = setMaterial;
window.setTamanio        = setTamanio;
window.incCantidad       = incCantidad;
window.decCantidad       = decCantidad;
window.confirmarProducto = confirmarProducto;
window.renderModalIfOpen = renderModalIfOpen;
window.abrirImagen       = abrirImagen;
window.cerrarImagen      = cerrarImagen;

// =========================
// INIT
// =========================

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", cargarTodo);
} else {
  cargarTodo();
}

document.addEventListener("click", (e) => {
  if (e.target.id === "sticker-modal") cerrarSticker();
  if (e.target.id === "modal-img")     cerrarImagen();
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (document.getElementById("sticker-modal")?.style.display === "flex") cerrarSticker();
  if (document.getElementById("modal-img")?.style.display === "flex")    cerrarImagen();
});

})();
