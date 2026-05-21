(function () {

// =========================
// SUPABASE
// =========================

if (!window.supabaseClient) {
  const config = window.SUPABASE_CONFIG;
  if (!config || !config.url || !config.anonKey) {
    console.error('SUPABASE_CONFIG no está configurado. Carga js/config.js primero.');
  }
  window.supabaseClient = window.supabase.createClient(
    config.url,
    config.anonKey
  );
}

const supabase = window.supabaseClient;

let productos              = [];
let variantes              = [];
let materiales             = [];
let tamanios               = [];
let precios                = [];
let todasCategorias        = [];
let imagenesPorProducto    = {};
let categoriasPorProducto  = {}; // { id_producto: [id_categoria, ...] }

let sel = {
  producto:   null,
  materialId: null,
  tamanioId:  null,
  cantidad:   1,
  imgIndex:   0,
};

let sortBy = "nombre";

// =========================
// DATA
// =========================

async function cargarTodo() {
  const [prods, vars, mats, tams, pres, imgs, cats, catRels] = await Promise.all([
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
    supabase.from("imagen_producto").select("*").order("orden"),
    supabase.from("categoria").select("id_categoria, nombre_categoria"),
    supabase.from("producto_pertenece_categoria").select("id_producto, id_categoria"),
  ]);

  productos       = prods.data || [];
  variantes       = vars.data  || [];
  materiales      = mats.data  || [];
  tamanios        = tams.data  || [];
  precios         = pres.data  || [];
  todasCategorias = cats.data  || [];

  // Construir mapa id_producto → imágenes con URL pública
  imagenesPorProducto = {};
  (imgs.data || []).forEach(img => {
    const { data: { publicUrl } } = supabase.storage.from("productos").getPublicUrl(img.path_imagen);
    if (!imagenesPorProducto[img.id_producto]) imagenesPorProducto[img.id_producto] = [];
    imagenesPorProducto[img.id_producto].push({ ...img, publicUrl });
  });

  // Construir mapa id_producto → [id_categoria, ...]
  categoriasPorProducto = {};
  (catRels.data || []).forEach(r => {
    if (!categoriasPorProducto[r.id_producto]) categoriasPorProducto[r.id_producto] = [];
    categoriasPorProducto[r.id_producto].push(r.id_categoria);
  });

  aplicarFiltroDesdeURL();
  renderProductos();
  if (window.renderCarrito) window.renderCarrito();

  const productoParam = new URLSearchParams(window.location.search).get('producto');
  if (productoParam) {
    const id = parseInt(productoParam);
    if (!isNaN(id)) abrirProducto(id);
  }
}

// =========================
// HELPERS DE VARIANTES
// =========================

// Solo tamaños que tienen precio definido para la combinación tipo+material+tamaño
function getTamaniosDeProductoYMaterial(id_producto, id_material, id_tipo) {
  const ids = [...new Set(
    variantes
      .filter(v => v.id_producto === id_producto && v.id_material === id_material)
      .map(v => v.id_tamanio)
  )];
  return tamanios
    .filter(t => ids.includes(t.id_tamanio) && getPrecio(id_tipo ?? null, id_material, t.id_tamanio) !== null)
    .sort((a, b) => {
      if (a.unidad !== b.unidad) return a.unidad.localeCompare(b.unidad);
      return parseFloat(a.valor) - parseFloat(b.valor);
    });
}

// Solo materiales que tienen al menos un tamaño con precio
function getMaterialesDeProducto(id_producto, id_tipo) {
  const ids = [...new Set(
    variantes.filter(v => v.id_producto === id_producto).map(v => v.id_material)
  )];
  return materiales.filter(m =>
    ids.includes(m.id_material) &&
    getTamaniosDeProductoYMaterial(id_producto, m.id_material, id_tipo).length > 0
  );
}

function getPrecio(id_tipo, id_material, id_tamanio) {
  // Exact match: tipo + material + tamaño
  let match = precios.find(p =>
    p.precio_usa_tamanio?.some(t => t.id_tamanio === id_tamanio) &&
    p.precio_usa_material?.some(m => m.id_material === id_material) &&
    p.precio_usa_tipo?.some(tp => tp.id_tipo === id_tipo)
  );
  if (match) return match;

  // Material + tamaño, sin restricción de tipo (precio genérico para todos los tipos)
  match = precios.find(p =>
    p.precio_usa_tamanio?.some(t => t.id_tamanio === id_tamanio) &&
    p.precio_usa_material?.some(m => m.id_material === id_material) &&
    (!p.precio_usa_tipo || p.precio_usa_tipo.length === 0)
  );
  if (match) return match;

  // Solo tamaño, sin restricción de material ni tipo (precio verdaderamente genérico)
  return precios.find(p =>
    p.precio_usa_tamanio?.some(t => t.id_tamanio === id_tamanio) &&
    (!p.precio_usa_material || p.precio_usa_material.length === 0) &&
    (!p.precio_usa_tipo || p.precio_usa_tipo.length === 0)
  ) ?? null;
}

// =========================
// GRID DE PRODUCTOS
// =========================

const SORTS = [
  { key: "nombre",    label: "A - Z" },
  { key: "tipo",      label: "Producto" },
  { key: "categoria", label: "Categoría" },
  { key: "tamanio",   label: "Tamaños" },
  { key: "material",  label: "Material" },
];

// =========================
// FILTRADO POR URL
// =========================

let filtroActivo = null; // { type: "tipo"|"categoria", value: Number, nombre: String }

function aplicarFiltroDesdeURL() {
  const params = new URLSearchParams(window.location.search);
  const tipoId = params.get("tipo")      ? parseInt(params.get("tipo"))      : null;
  const catId  = params.get("categoria") ? parseInt(params.get("categoria")) : null;

  if (tipoId !== null) {
    const tipo = productos.find(p => p.tipo?.id_tipo === tipoId)?.tipo;
    filtroActivo = tipo ? { type: "tipo", value: tipoId, nombre: tipo.nombre_tipo } : null;
  } else if (catId !== null) {
    const cat = todasCategorias.find(c => c.id_categoria === catId);
    filtroActivo = cat ? { type: "categoria", value: catId, nombre: cat.nombre_categoria } : null;
  } else {
    filtroActivo = null;
  }

  if (filtroActivo) {
    document.title = `CAINA | ${filtroActivo.nombre}`;
  }
}

function productosBase() {
  if (!filtroActivo) return [...productos];
  if (filtroActivo.type === "tipo") {
    return productos.filter(p => p.tipo?.id_tipo === filtroActivo.value);
  }
  if (filtroActivo.type === "categoria") {
    return productos.filter(p =>
      (categoriasPorProducto[p.id_producto] || []).includes(filtroActivo.value)
    );
  }
  return [...productos];
}

function productosSorted() {
  return productosBase().sort((a, b) => {
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

  if (!sorted.length && filtroActivo) {
    cont.innerHTML = `
      <div class="card">
        <div class="card-name">${escapar(filtroActivo.nombre)}</div>
        <p class="card-desc" style="color:var(--muted)">No hay productos disponibles en esta categoría todavía.</p>
        <a href="/pedido.html" class="sort-chip" style="text-decoration:none;display:inline-flex;margin-top:.5rem">← Ver todos los productos</a>
      </div>
    `;
    return;
  }

  let contenido;

  if (sortBy === "tipo") {
    const grupos = sorted.reduce((acc, p) => {
      const nombre = p.tipo?.nombre_tipo ?? "Sin tipo";
      (acc[nombre] = acc[nombre] || []).push(p);
      return acc;
    }, {});

    let offset = 0;
    contenido = Object.entries(grupos).map(([nombre, items]) => {
      const html = `
        <div class="categoria-grupo">
          <h4 class="categoria-titulo">${escapar(nombre)}</h4>
          ${productoGrid(items, offset)}
        </div>
      `;
      offset += items.length;
      return html;
    }).join("");

  } else if (sortBy === "categoria") {
    const catsOrdenadas = [...todasCategorias].sort((a, b) =>
      a.nombre_categoria.localeCompare(b.nombre_categoria, "es")
    );

    const grupos = [];
    catsOrdenadas.forEach(cat => {
      const items = sorted.filter(p =>
        (categoriasPorProducto[p.id_producto] || []).includes(cat.id_categoria)
      );
      if (items.length) grupos.push({ nombre: cat.nombre_categoria, items });
    });

    const sinCat = sorted.filter(p => !(categoriasPorProducto[p.id_producto]?.length > 0));
    if (sinCat.length) grupos.push({ nombre: "Sin categoría", items: sinCat });

    let offset = 0;
    contenido = grupos.map(({ nombre, items }) => {
      const html = `
        <div class="categoria-grupo">
          <h4 class="categoria-titulo">${escapar(nombre)}</h4>
          ${productoGrid(items, offset)}
        </div>
      `;
      offset += items.length;
      return html;
    }).join("");

  } else if (sortBy === "tamanio") {
    const tamGrupos = {};
    sorted.forEach(p => {
      const ids = [...new Set(
        variantes.filter(v => v.id_producto === p.id_producto).map(v => v.id_tamanio)
      )];
      ids.forEach(tid => {
        if (!tamGrupos[tid]) tamGrupos[tid] = [];
        tamGrupos[tid].push(p);
      });
    });

    const tamsUsados = tamanios
      .filter(t => tamGrupos[t.id_tamanio])
      .sort((a, b) => {
        if ((a.unidad || "") !== (b.unidad || "")) return (a.unidad || "").localeCompare(b.unidad || "");
        return parseFloat(a.valor) - parseFloat(b.valor);
      });

    let offset = 0;
    contenido = tamsUsados.map(t => {
      const items = tamGrupos[t.id_tamanio];
      const label = t.unidad ? `${t.valor} ${t.unidad}` : t.valor;
      const html = `
        <div class="categoria-grupo">
          <h4 class="categoria-titulo">${escapar(label)}</h4>
          ${productoGrid(items, offset)}
        </div>
      `;
      offset += items.length;
      return html;
    }).join("");

  } else if (sortBy === "material") {
    const matGrupos = {};
    sorted.forEach(p => {
      const ids = [...new Set(
        variantes.filter(v => v.id_producto === p.id_producto).map(v => v.id_material)
      )];
      ids.forEach(mid => {
        if (!matGrupos[mid]) matGrupos[mid] = [];
        matGrupos[mid].push(p);
      });
    });

    const matsUsados = materiales
      .filter(m => matGrupos[m.id_material])
      .sort((a, b) => a.nombre_material.localeCompare(b.nombre_material, "es"));

    let offset = 0;
    contenido = matsUsados.map(m => {
      const items = matGrupos[m.id_material];
      const html = `
        <div class="categoria-grupo">
          <h4 class="categoria-titulo">${escapar(m.nombre_material)}</h4>
          ${productoGrid(items, offset)}
        </div>
      `;
      offset += items.length;
      return html;
    }).join("");

  } else {
    contenido = productoGrid(sorted);
  }

  const tituloCard = filtroActivo ? escapar(filtroActivo.nombre) : "Productos";
  const subCard    = filtroActivo
    ? `${sorted.length} producto${sorted.length !== 1 ? "s" : ""} encontrado${sorted.length !== 1 ? "s" : ""}`
    : "Tocá un diseño para elegir material, tamaño y cantidad.";
  const verTodos   = filtroActivo
    ? `<a href="/pedido.html" class="sort-chip" style="text-decoration:none;display:inline-flex">← Ver todos</a>`
    : "";

  cont.innerHTML = `
    <div class="card">
      <div class="card-name">${tituloCard}</div>
      <p class="card-desc">${subCard}</p>
      <div class="sort-row">
        ${verTodos}
        ${SORTS.filter(s => {
          if (s.key === "tipo"      && filtroActivo?.type === "tipo")      return false;
          if (s.key === "categoria" && filtroActivo?.type === "categoria") return false;
          return true;
        }).map(s => `
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
      ${items.map((p, i) => {
        const imgs  = imagenesPorProducto[p.id_producto] || [];
        const thumb = imgs[0]?.publicUrl;
        const imgHtml = thumb
          ? `<img class="sticker-thumb" src="${escapar(thumb)}" alt="${escapar(p.nombre)}" loading="lazy">`
          : `<div class="sticker-thumb sticker-thumb--ph">🎨</div>`;
        return `
          <button class="sticker-btn" style="animation-delay:${(offset + i) * 40}ms"
                  onclick="abrirProducto(${p.id_producto})">
            ${imgHtml}
            <span class="sticker-name">${escapar(p.nombre)}</span>
          </button>
        `;
      }).join("")}
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

  const id_tipo = producto.tipo?.id_tipo ?? null;
  const mats    = getMaterialesDeProducto(id_producto, id_tipo);
  const matId   = mats[0]?.id_material ?? null;
  const tams    = matId ? getTamaniosDeProductoYMaterial(id_producto, matId, id_tipo) : [];
  const tamId   = tams[0]?.id_tamanio ?? null;

  sel = { producto, materialId: matId, tamanioId: tamId, cantidad: 1, imgIndex: 0 };

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
  const id_tipo = tipo?.id_tipo ?? null;
  const imgs  = imagenesPorProducto[id_producto] || [];
  const mats  = getMaterialesDeProducto(id_producto, id_tipo);
  const tams  = sel.materialId ? getTamaniosDeProductoYMaterial(id_producto, sel.materialId, id_tipo) : [];

  const precioObj  = (sel.materialId && sel.tamanioId)
    ? getPrecio(tipo?.id_tipo ?? null, sel.materialId, sel.tamanioId)
    : null;
  const precioUnit = precioObj?.valor ?? null;
  const subtotal   = precioUnit != null ? Math.round(precioUnit * sel.cantidad) : null;
  const canAdd     = precioObj != null;
  const fmt        = n => n.toLocaleString("es-AR");

  // Galería
  const currentImg = imgs[sel.imgIndex];
  const galleryHtml = imgs.length > 0 ? `
    <div class="sel-gallery">
      <div class="sel-gallery-wrap" id="gallery-wrap">
        <img class="sel-gallery-img" src="${escapar(currentImg.publicUrl)}" alt="${escapar(nombre)}">
        ${imgs.length > 1 ? `
          <button class="gallery-arrow gallery-prev" onclick="prevImg()" ${sel.imgIndex === 0 ? "disabled" : ""}>&#8249;</button>
          <button class="gallery-arrow gallery-next" onclick="nextImg()" ${sel.imgIndex === imgs.length - 1 ? "disabled" : ""}>&#8250;</button>
        ` : ""}
      </div>
      ${imgs.length > 1 ? `
        <div class="gallery-dots">
          ${imgs.map((_, i) => `
            <button class="gallery-dot ${i === sel.imgIndex ? "gallery-dot--active" : ""}"
                    onclick="goToImg(${i})"></button>
          `).join("")}
        </div>
      ` : ""}
    </div>
  ` : `<div class="sel-gallery-ph">🎨</div>`;

  body.innerHTML = `
    ${galleryHtml}

    <h3 class="sel-title" style="text-align:center;margin-bottom:1.2rem;">${escapar(nombre)}</h3>

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
                ${escapar(t.valor)} ${escapar(t.unidad ?? "")}
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

  // Touch swipe para móvil
  if (imgs.length > 1) {
    const wrap = document.getElementById("gallery-wrap");
    let touchStartX = 0;
    wrap.addEventListener("touchstart", e => { touchStartX = e.touches[0].clientX; }, { passive: true });
    wrap.addEventListener("touchend", e => {
      const diff = touchStartX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 45) diff > 0 ? nextImg() : prevImg();
    });
  }
}

// Navegación de galería
function prevImg() {
  if (sel.imgIndex > 0) { sel.imgIndex--; renderModal(); }
}
function nextImg() {
  const imgs = imagenesPorProducto[sel.producto?.id_producto] || [];
  if (sel.imgIndex < imgs.length - 1) { sel.imgIndex++; renderModal(); }
}
function goToImg(i) {
  sel.imgIndex = i;
  renderModal();
}

function setMaterial(id) {
  sel.materialId = id;
  const id_tipo = sel.producto.tipo?.id_tipo ?? null;
  const tams    = getTamaniosDeProductoYMaterial(sel.producto.id_producto, id, id_tipo);
  if (!tams.find(t => t.id_tamanio === sel.tamanioId)) {
    sel.tamanioId = tams[0]?.id_tamanio ?? null;
  }
  renderModal();
}

function setTamanio(id) { sel.tamanioId = id; renderModal(); }
function incCantidad()   { sel.cantidad++;               renderModal(); }
function decCantidad()   { if (sel.cantidad > 1) { sel.cantidad--; renderModal(); } }

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
window.prevImg           = prevImg;
window.nextImg           = nextImg;
window.goToImg           = goToImg;

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
  if (document.getElementById("modal-img")?.style.display    === "flex") cerrarImagen();
});

})();
