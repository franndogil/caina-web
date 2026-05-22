(function () {
'use strict';

// ── datos compartidos entre instancias ──────────────────────────────────────
let _datos = null;
let _cargando = null;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

async function esperarSupabase() {
  return new Promise(resolve => {
    if (window.supabaseClient) return resolve(window.supabaseClient);
    const t = setInterval(() => {
      if (window.supabaseClient) { clearInterval(t); resolve(window.supabaseClient); }
    }, 30);
    setTimeout(() => { clearInterval(t); resolve(null); }, 5000);
  });
}

async function cargarDatosGlobales() {
  if (_datos) return _datos;
  if (_cargando) return _cargando;

  _cargando = (async () => {
    const db = await esperarSupabase();
    if (!db) return null;

    const [prods, vars, mats, tams, imgs] = await Promise.all([
      db.from('producto').select('*, tipo(id_tipo, nombre_tipo)'),
      db.from('variante').select('id_variante, id_producto, id_material, id_tamanio'),
      db.from('material').select('id_material, nombre_material'),
      db.from('tamanio').select('id_tamanio, valor, unidad'),
      db.from('imagen_producto').select('id_producto, path_imagen, orden').order('orden'),
    ]);

    // mapa id_producto → primera imagen pública
    const imgs_map = {};
    (imgs.data || []).forEach(img => {
      if (imgs_map[img.id_producto]) return;
      const { data: { publicUrl } } = db.storage.from('productos').getPublicUrl(img.path_imagen);
      imgs_map[img.id_producto] = publicUrl;
    });

    _datos = {
      productos:  prods.data || [],
      variantes:  vars.data  || [],
      materiales: mats.data  || [],
      tamanios:   tams.data  || [],
      imagenes:   imgs_map,
    };
    return _datos;
  })();

  return _cargando;
}

// ── componente de filtros ────────────────────────────────────────────────────
class FiltrosGrid {
  constructor(contenedorId, opts = {}) {
    this.id        = contenedorId;
    this.novedades = opts.novedades || false; // solo productos con esNovedad=true
    this.tipoSel   = null;
    this.matSel    = null;
    this.tamSel    = null;
    this.datos     = null;
  }

  async init() {
    const el = document.getElementById(this.id);
    if (!el) return;
    el.innerHTML = '<p class="filtros-loading">Cargando…</p>';

    this.datos = await cargarDatosGlobales();
    if (!this.datos) {
      el.innerHTML = '<p class="filtros-loading">No se pudo conectar.</p>';
      return;
    }
    this.render();
  }

  // ── filtrado en cascada ──────────────────────────────────────────────────

  _productos() {
    return this.datos.productos.filter(p => !this.novedades || p.esNovedad);
  }

  _tipos() {
    const map = {};
    this._productos().forEach(p => {
      if (p.tipo) map[p.tipo.id_tipo] = p.tipo.nombre_tipo;
    });
    return Object.entries(map)
      .map(([id, nombre]) => ({ id: +id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  _materiales() {
    const prods = this.tipoSel
      ? this._productos().filter(p => p.tipo?.id_tipo === this.tipoSel)
      : this._productos();
    const ids = new Set(
      this.datos.variantes
        .filter(v => prods.some(p => p.id_producto === v.id_producto))
        .map(v => v.id_material)
    );
    return this.datos.materiales.filter(m => ids.has(m.id_material));
  }

  _tamanios() {
    const prods = this.tipoSel
      ? this._productos().filter(p => p.tipo?.id_tipo === this.tipoSel)
      : this._productos();
    const ids = new Set(
      this.datos.variantes
        .filter(v =>
          prods.some(p => p.id_producto === v.id_producto) &&
          (!this.matSel || v.id_material === this.matSel)
        )
        .map(v => v.id_tamanio)
    );
    return this.datos.tamanios.filter(t => ids.has(t.id_tamanio));
  }

  _productosFiltrados() {
    return this._productos().filter(p => {
      if (this.tipoSel && p.tipo?.id_tipo !== this.tipoSel) return false;
      if (this.matSel || this.tamSel) {
        return this.datos.variantes.some(v =>
          v.id_producto === p.id_producto &&
          (!this.matSel || v.id_material === this.matSel) &&
          (!this.tamSel || v.id_tamanio === this.tamSel)
        );
      }
      return true;
    });
  }

  // ── render ───────────────────────────────────────────────────────────────

  render() {
    const el = document.getElementById(this.id);
    if (!el) return;

    const tipos     = this._tipos();
    const mats      = this._materiales();
    const tams      = this._tamanios();
    const productos = this._productosFiltrados();

    const chip = (label, dataRow, dataId, activo) =>
      `<button class="filtro-chip${activo ? ' filtro-chip--activo' : ''}" data-row="${dataRow}" data-id="${dataId}">${esc(label)}</button>`;

    // fila tipos
    const filaTipos = `
      <div class="filtros-fila" data-row="tipo">
        ${chip('Todos', 'tipo', '', !this.tipoSel)}
        ${tipos.map(t => chip(t.nombre, 'tipo', t.id, this.tipoSel === t.id)).join('')}
      </div>`;

    // fila materiales (solo si hay más de uno)
    const filaMat = mats.length > 1 ? `
      <div class="filtros-fila filtros-fila--sub" data-row="material">
        <span class="filtros-sublabel">Material</span>
        ${chip('Todos', 'material', '', !this.matSel)}
        ${mats.map(m => chip(m.nombre_material, 'material', m.id_material, this.matSel === m.id_material)).join('')}
      </div>` : '';

    // fila tamaños (solo si hay más de uno)
    const filaTam = tams.length > 1 ? `
      <div class="filtros-fila filtros-fila--sub" data-row="tamanio">
        <span class="filtros-sublabel">Tamaño</span>
        ${chip('Todos', 'tamanio', '', !this.tamSel)}
        ${tams.map(t => chip(t.unidad ? `${t.valor} ${t.unidad}` : t.valor, 'tamanio', t.id_tamanio, this.tamSel === t.id_tamanio)).join('')}
      </div>` : '';

    // grid de cards
    const cards = productos.map(p => {
      const img = this.datos.imagenes[p.id_producto];
      const imgHtml = img
        ? `<img src="${esc(img)}" alt="${esc(p.nombre)}" loading="lazy">`
        : `<div class="novedad-img-ph">🎨</div>`;
      return `
        <button class="novedad-card" onclick="abrirProducto(${p.id_producto})">
          <div class="novedad-img-wrap">${imgHtml}</div>
          <div class="novedad-info">
            <span class="novedad-nombre">${esc(p.nombre)}</span>
            <span class="novedad-tipo">${esc(p.tipo?.nombre_tipo || '')}</span>
          </div>
        </button>`;
    }).join('');

    const empty = productos.length === 0
      ? `<p class="filtros-empty">No hay productos con esa combinación.</p>`
      : '';

    el.innerHTML = `
      <div class="filtros-wrap">
        ${filaTipos}${filaMat}${filaTam}
      </div>
      <div class="filtros-grid">${cards}${empty}</div>`;

    // eventos por delegación
    el.querySelectorAll('.filtro-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.dataset.row;
        const val = btn.dataset.id ? +btn.dataset.id : null;
        if (row === 'tipo')     { this.tipoSel = val; this.matSel = null; this.tamSel = null; }
        if (row === 'material') { this.matSel  = val; this.tamSel = null; }
        if (row === 'tamanio')  { this.tamSel  = val; }
        this.render();
      });
    });
  }
}

window.FiltrosGrid = FiltrosGrid;
})();
