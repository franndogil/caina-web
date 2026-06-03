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
let variantes              = []; // todas las variantes, cargadas con paginación
let materiales             = [];
let tamanios               = [];
let precios                = [];
let todasCategorias        = [];
let imagenesPorProducto    = {};
let categoriasPorProducto  = {};
const variantesCache       = {}; // { id_producto: [...variantes] }

let sel = {
  producto:   null,
  materialId: null,
  tamanioId:  null,
  cantidad:   1,
  imgIndex:   0,
};

let sortBy = "nombre";

const PAGE_SIZE  = 20;
let visibleCount = PAGE_SIZE;

// =========================
// DATA
// =========================

async function cargarTodo() {
  const [prods, mats, tams, pres, imgs, cats, catRels] = await Promise.all([
    supabase.from("producto").select("*, tipo(id_tipo, nombre_tipo)"),
    supabase.from("material").select("*"),
    supabase.from("tamanio").select("*"),
    supabase.from("precio").select(`
      id_precio, valor,
      precio_usa_tipo(id_tipo),
      precio_usa_material(id_material),
      precio_usa_tamanio(id_tamanio)
    `),
    supabase.from("imagen_producto").select("*").order("orden").limit(5000),
    supabase.from("categoria").select("id_categoria, nombre_categoria"),
    supabase.from("producto_pertenece_categoria").select("id_producto, id_categoria").limit(5000),
  ]);

  // Cargar variantes con paginación para superar el límite de 1000 filas de Supabase
  variantes = [];
  let varFrom = 0;
  while (true) {
    const { data: varPage } = await supabase
      .from("variante")
      .select("id_variante, id_producto, id_material, id_tamanio")
      .range(varFrom, varFrom + 999);
    if (!varPage || varPage.length === 0) break;
    variantes = variantes.concat(varPage);
    if (varPage.length < 1000) break;
    varFrom += 1000;
  }

  productos       = prods.data || [];
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

async function getVariantesProducto(id_producto) {
  if (variantesCache[id_producto]) return variantesCache[id_producto];
  const { data } = await supabase.from("variante").select("*").eq("id_producto", id_producto);
  variantesCache[id_producto] = data || [];
  return variantesCache[id_producto];
}

function getTamaniosDeProductoYMaterial(id_material, vars) {
  const ids = [...new Set(
    vars.filter(v => v.id_material === id_material).map(v => v.id_tamanio)
  )];
  return tamanios
    .filter(t => ids.includes(t.id_tamanio))
    .sort((a, b) => {
      if (a.unidad !== b.unidad) return a.unidad.localeCompare(b.unidad);
      return parseFloat(a.valor) - parseFloat(b.valor);
    });
}

function getMaterialesDeProducto(vars) {
  const ids = [...new Set(vars.map(v => v.id_material))];
  return materiales.filter(m => ids.includes(m.id_material));
}

function getPrecio(id_tipo, id_material, id_tamanio) {
  const tieneTipo     = p => p.precio_usa_tipo?.some(tp => tp.id_tipo === id_tipo);
  const tieneMat      = p => p.precio_usa_material?.some(m => m.id_material === id_material);
  const tieneTam      = p => p.precio_usa_tamanio?.some(t => t.id_tamanio === id_tamanio);
  const sinTipo       = p => !p.precio_usa_tipo     || p.precio_usa_tipo.length     === 0;
  const sinMat        = p => !p.precio_usa_material || p.precio_usa_material.length === 0;
  const sinTam        = p => !p.precio_usa_tamanio  || p.precio_usa_tamanio.length  === 0;

  // Orden de especificidad descendente
  const intentos = [
    p => tieneTipo(p) && tieneMat(p) && tieneTam(p),   // tipo + material + tamaño
    p => tieneTipo(p) && tieneMat(p) && sinTam(p),      // tipo + material
    p => tieneTipo(p) && sinMat(p)   && tieneTam(p),    // tipo + tamaño
    p => sinTipo(p)   && tieneMat(p) && tieneTam(p),    // material + tamaño
    p => tieneTipo(p) && sinMat(p)   && sinTam(p),      // solo tipo
    p => sinTipo(p)   && tieneMat(p) && sinTam(p),      // solo material
    p => sinTipo(p)   && sinMat(p)   && tieneTam(p),    // solo tamaño
  ];

  for (const fn of intentos) {
    const match = precios.find(fn);
    if (match) return match;
  }
  return null;
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

// ── Estado del sidebar de filtros (pedido.html) ──────────────────────────
let filtrosSidebar = { cats: new Set(), tipos: new Set(), mats: new Set(), tams: new Set() };

window.actualizarFiltrosSidebar = function (f) {
  filtrosSidebar = f;
  if (filtroActivo?.type === 'tipo'      && !f.tipos.has(filtroActivo.value)) filtroActivo = null;
  if (filtroActivo?.type === 'categoria' && !f.cats.has(filtroActivo.value))  filtroActivo = null;
  if (productos.length) { visibleCount = PAGE_SIZE; renderProductos(); }
};

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
  let base = [...productos];

  // Filtro desde URL (tipo o categoría)
  if (filtroActivo) {
    if (filtroActivo.type === "tipo") {
      base = base.filter(p => p.tipo?.id_tipo === filtroActivo.value);
    } else if (filtroActivo.type === "categoria") {
      base = base.filter(p =>
        (categoriasPorProducto[p.id_producto] || []).includes(filtroActivo.value)
      );
    }
  }

  // Filtros del sidebar (AND sobre lo anterior)
  const fs = filtrosSidebar;
  if (fs.cats.size) {
    base = base.filter(p =>
      (categoriasPorProducto[p.id_producto] || []).some(c => fs.cats.has(c))
    );
  }
  if (fs.tipos.size) {
    base = base.filter(p => fs.tipos.has(p.tipo?.id_tipo));
  }
  if (fs.mats.size || fs.tams.size) {
    base = base.filter(p =>
      variantes.some(v =>
        v.id_producto === p.id_producto &&
        (!fs.mats.size || fs.mats.has(v.id_material)) &&
        (!fs.tams.size  || fs.tams.has(v.id_tamanio))
      )
    );
  }

  return base;
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
  // solo renderizar en pedido.html (el contenedor es un <div>, no la <section> del index)
  if (!cont || cont.tagName === 'SECTION') return;

  if (!productos.length) {
    cont.innerHTML = `<p class="sec-sub" style="grid-column:1/-1;text-align:center;">No hay productos disponibles</p>`;
    return;
  }

  const sorted = productosSorted();
  const shown  = sorted.slice(0, visibleCount);
  const hayMas = sorted.length > visibleCount;

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

  if (filtrosSidebar.tipos.size > 1 || sortBy === "tipo") {
    const grupos = shown.reduce((acc, p) => {
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
      const items = shown.filter(p =>
        (categoriasPorProducto[p.id_producto] || []).includes(cat.id_categoria)
      );
      if (items.length) grupos.push({ nombre: cat.nombre_categoria, items });
    });

    const sinCat = shown.filter(p => !(categoriasPorProducto[p.id_producto]?.length > 0));
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
    shown.forEach(p => {
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
    shown.forEach(p => {
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
    contenido = productoGrid(shown);
  }

  const tituloCard = filtroActivo ? escapar(filtroActivo.nombre) : "Productos";
  const subCard    = filtroActivo
    ? `${sorted.length} producto${sorted.length !== 1 ? "s" : ""} encontrado${sorted.length !== 1 ? "s" : ""}`
    : "Tocá un diseño para elegir material, tamaño y cantidad.";
  const verTodos   = filtroActivo
    ? `<a href="/pedido.html" class="sort-chip" style="text-decoration:none;display:inline-flex">← Ver todos</a>`
    : "";

  const masBtn = hayMas
    ? `<div class="sf-mas-wrap">
        <button class="sf-btn-mas" onclick="cargarMas()">Cargar más (${sorted.length - visibleCount} restantes)</button>
      </div>`
    : '';

  cont.innerHTML = `
    <div class="card">
      <div class="card-name">${tituloCard}</div>
      <p class="card-desc">${subCard}</p>
      ${contenido}
      ${masBtn}
    </div>
  `;
}

function productoGrid(items, offset = 0) {
  return `
    <div class="stickers-grid">
      ${items.map((p, i) => {
        const imgs  = imagenesPorProducto[p.id_producto] || [];
        const thumb = imgs[0]?.publicUrl;
        const imgInner = thumb
          ? `<img class="sticker-thumb" src="${escapar(thumb)}" alt="${escapar(p.nombre)}" loading="lazy">`
          : `<div class="sticker-thumb sticker-thumb--ph">🎨</div>`;
        const imgHtml = `<div class="sticker-img-wrap">${imgInner}</div>`;
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
  visibleCount = PAGE_SIZE;
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

async function abrirProducto(id_producto) {
  const producto = productos.find(p => p.id_producto === id_producto);
  if (!producto) return;

  // Mostrar modal con loading mientras se traen las variantes
  sel = { producto, materialId: null, tamanioId: null, cantidad: 1, imgIndex: 0, vars: [] };
  document.getElementById("sticker-modal").style.display = "flex";
  document.body.style.overflow = "hidden";
  const body = document.getElementById("sticker-modal-body");
  if (body) body.innerHTML = '<p style="text-align:center;padding:2rem;color:var(--muted)">Cargando…</p>';

  const vars  = await getVariantesProducto(id_producto);
  const mats  = getMaterialesDeProducto(vars);
  const matId = mats[0]?.id_material ?? null;
  const tams  = matId ? getTamaniosDeProductoYMaterial(matId, vars) : [];
  const tamId = tams[0]?.id_tamanio ?? null;

  sel = { producto, materialId: matId, tamanioId: tamId, cantidad: 1, imgIndex: 0, vars };
  renderModal();
}

function cerrarSticker() {
  document.getElementById("sticker-modal").style.display = "none";
  document.body.style.overflow = "";
}

function renderModal() {
  const body = document.getElementById("sticker-modal-body");
  if (!body || !sel.producto) return;

  const { id_producto, nombre, tipo, descripcion } = sel.producto;
  const imgs  = imagenesPorProducto[id_producto] || [];
  const mats  = getMaterialesDeProducto(sel.vars || []);
  const tams  = sel.materialId ? getTamaniosDeProductoYMaterial(sel.materialId, sel.vars || []) : [];

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

    <h3 class="sel-title" style="text-align:center;margin-bottom:${descripcion ? ".6rem" : "1.2rem"};">${escapar(nombre)}</h3>
    ${descripcion ? `<p class="sel-desc">${escapar(descripcion)}</p>` : ""}

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
  const tams = getTamaniosDeProductoYMaterial(id, sel.vars || []);
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

window.cargarMas = function () {
  const cont = document.getElementById("productos");
  if (!cont) return;

  // Vista agrupada o sort alternativo: re-render completo
  if (filtrosSidebar.tipos.size > 1 || sortBy !== "nombre") {
    visibleCount += PAGE_SIZE;
    renderProductos();
    return;
  }

  const prevCount = visibleCount;
  visibleCount += PAGE_SIZE;

  const sorted = productosSorted();
  const nuevos = sorted.slice(prevCount, visibleCount);
  const hayMas = sorted.length > visibleCount;

  const grid = cont.querySelector('.stickers-grid');
  if (!grid) { renderProductos(); return; }

  nuevos.forEach((p, i) => {
    const imgs     = imagenesPorProducto[p.id_producto] || [];
    const thumb    = imgs[0]?.publicUrl;
    const imgInner = thumb
      ? `<img class="sticker-thumb" src="${escapar(thumb)}" alt="${escapar(p.nombre)}" loading="lazy">`
      : `<div class="sticker-thumb sticker-thumb--ph">🎨</div>`;
    const btn = document.createElement('button');
    btn.className = 'sticker-btn sticker-btn--new';
    btn.style.animationDelay = `${i * 20}ms`;
    btn.setAttribute('onclick', `abrirProducto(${p.id_producto})`);
    btn.innerHTML = `<div class="sticker-img-wrap">${imgInner}</div><span class="sticker-name">${escapar(p.nombre)}</span>`;
    grid.appendChild(btn);
  });

  const btnWrap = cont.querySelector('.sf-mas-wrap');
  if (!hayMas) {
    btnWrap?.remove();
  } else if (btnWrap) {
    const btn = btnWrap.querySelector('.sf-btn-mas');
    if (btn) btn.textContent = `Cargar más (${sorted.length - visibleCount} restantes)`;
  }
};
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
