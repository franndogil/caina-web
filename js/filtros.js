(function () {
'use strict';

// ── Singleton data cache compartido entre todas las instancias ─────────────
let _datos   = null;
let _promesa = null;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function clonar(f) {
  return { cats: new Set(f.cats), tipos: new Set(f.tipos), mats: new Set(f.mats), tams: new Set(f.tams) };
}

async function esperarSupabase() {
  return new Promise(r => {
    if (window.supabaseClient) return r(window.supabaseClient);
    const t = setInterval(() => { if (window.supabaseClient) { clearInterval(t); r(window.supabaseClient); } }, 30);
    setTimeout(() => { clearInterval(t); r(null); }, 5000);
  });
}

async function cargarDatos() {
  if (_datos)   return _datos;
  if (_promesa) return _promesa;

  _promesa = (async () => {
    const db = await esperarSupabase();
    if (!db) return null;

    const [prods, vars, mats, tams, imgs, cats, catRels, tipoMat, tipoTam] = await Promise.all([
      db.from('producto').select('*, tipo(id_tipo, nombre_tipo)'),
      db.from('variante').select('id_variante, id_producto, id_material, id_tamanio'),
      db.from('material').select('id_material, nombre_material'),
      db.from('tamanio').select('id_tamanio, valor, unidad'),
      db.from('imagen_producto').select('id_producto, path_imagen, orden').order('orden'),
      db.from('categoria').select('id_categoria, nombre_categoria'),
      db.from('producto_pertenece_categoria').select('id_producto, id_categoria'),
      db.from('tipo_material').select('id_tipo, id_material'),
      db.from('tipo_tamanio').select('id_tipo, id_tamanio'),
    ]);

    const imgMap = {};
    (imgs.data || []).forEach(img => {
      if (!imgMap[img.id_producto])
        imgMap[img.id_producto] = db.storage.from('productos').getPublicUrl(img.path_imagen).data.publicUrl;
    });

    const catPorProd = {};
    (catRels.data || []).forEach(r => {
      (catPorProd[r.id_producto] ??= []).push(r.id_categoria);
    });

    _datos = {
      productos:   prods.data   || [],
      variantes:   vars.data    || [],
      materiales:  mats.data    || [],
      tamanios:    tams.data    || [],
      categorias:  cats.data    || [],
      tipoMaterial: tipoMat.data || [],
      tipoTamanio:  tipoTam.data || [],
      catPorProd,
      imgMap,
    };
    return _datos;
  })();

  return _promesa;
}

// ─────────────────────────────────────────────────────────────────────────────
class SidebarFiltros {
  constructor(cid, opts = {}) {
    this.cid       = cid;
    this.novedades = opts.novedades || false;
    this.onFiltrar = opts.onFiltrar || null;   // modo externo (pedido.html)
    this.datos     = null;
    this._open     = false;
    this.f = { cats: new Set(), tipos: new Set(), mats: new Set(), tams: new Set() };
  }

  async init() {
    const el = document.getElementById(this.cid);
    if (!el) return;
    el.innerHTML = '<p class="sf-loading">Cargando…</p>';
    this.datos = await cargarDatos();
    if (!this.datos) {
      el.innerHTML = '<p class="sf-loading sf-error">No se pudo conectar.</p>';
      return;
    }
    this._render();
  }

  // ── helpers de datos ─────────────────────────────────────────────────────

  _base() {
    return this.datos.productos.filter(p => !this.novedades || p.esNovedad);
  }

  _filtrar(f) {
    const fs = f || this.f;
    return this._base().filter(p => {
      if (fs.cats.size && !(this.datos.catPorProd[p.id_producto] || []).some(c => fs.cats.has(c))) return false;
      if (fs.tipos.size && !fs.tipos.has(p.tipo?.id_tipo)) return false;
      if (fs.mats.size || fs.tams.size) {
        return this.datos.variantes.some(v =>
          v.id_producto === p.id_producto &&
          (!fs.mats.size || fs.mats.has(v.id_material)) &&
          (!fs.tams.size  || fs.tams.has(v.id_tamanio))
        );
      }
      return true;
    });
  }

  _count(grupo, id) {
    const f = clonar(this.f);
    f[grupo].has(id) ? f[grupo].delete(id) : f[grupo].add(id);
    return this._filtrar(f).length;
  }

  _listaCats() {
    const usados = new Set(this._base().flatMap(p => this.datos.catPorProd[p.id_producto] || []));
    return this.datos.categorias
      .filter(c => usados.has(c.id_categoria))
      .sort((a, b) => a.nombre_categoria.localeCompare(b.nombre_categoria, 'es'));
  }

  _listaTipos() {
    const map = {};
    this._base().forEach(p => { if (p.tipo) map[p.tipo.id_tipo] = p.tipo.nombre_tipo; });
    return Object.entries(map)
      .map(([id, nombre]) => ({ id: +id, nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  }

  // Usa tipo_material para los materiales disponibles del tipo seleccionado
  _listaMats() {
    if (!this.f.tipos.size) return [];
    const matIds = new Set(
      this.datos.tipoMaterial
        .filter(tm => this.f.tipos.has(tm.id_tipo))
        .map(tm => tm.id_material)
    );
    return this.datos.materiales.filter(m => matIds.has(m.id_material));
  }

  // Usa tipo_tamanio para los tamaños disponibles del tipo seleccionado
  _listaTams() {
    if (!this.f.tipos.size) return [];
    const tamIds = new Set(
      this.datos.tipoTamanio
        .filter(tt => this.f.tipos.has(tt.id_tipo))
        .map(tt => tt.id_tamanio)
    );
    return this.datos.tamanios.filter(t => tamIds.has(t.id_tamanio));
  }

  // ── HTML helpers ─────────────────────────────────────────────────────────

  _htmlGrupo(titulo, grupo, items, labelFn, idFn, placeholder) {
    const filas = items.length
      ? items.map(item => {
          const id  = idFn(item);
          const lbl = esc(labelFn(item));
          const act = this.f[grupo].has(id);
          const cnt = this._count(grupo, id);
          return `<label class="sf-check${act ? ' sf-check--act' : ''}">
            <input type="checkbox" data-g="${grupo}" data-id="${id}"${act ? ' checked' : ''}>
            <span class="sf-check-lbl">${lbl}</span>
            <span class="sf-check-cnt">(${cnt})</span>
          </label>`;
        }).join('')
      : `<span class="sf-placeholder">${placeholder || ''}</span>`;
    return `<div class="sf-grupo">
      <p class="sf-grupo-ttl">${titulo}</p>
      ${filas}
    </div>`;
  }

  _htmlSidebar() {
    const activos = this.f.cats.size + this.f.tipos.size + this.f.mats.size + this.f.tams.size;
    const tipoSel = this.f.tipos.size > 0;
    return `<aside class="sf-sidebar">
      <div class="sf-sidebar-head">
        <span class="sf-sidebar-ttl">Filtrar por</span>
        <div class="sf-sidebar-acciones">
          ${activos ? `<button class="sf-btn-limpiar" data-act="limpiar">Limpiar (${activos})</button>` : ''}
          <button class="sf-cerrar" data-act="cerrar" aria-label="Cerrar filtros">✕</button>
        </div>
      </div>
      ${this._htmlGrupo('Categoría', 'cats',  this._listaCats(),  c => c.nombre_categoria, c => c.id_categoria)}
      ${this._htmlGrupo('Tipo',      'tipos', this._listaTipos(), t => t.nombre,           t => t.id)}
      ${this._htmlGrupo('Material',  'mats',  tipoSel ? this._listaMats() : [], m => m.nombre_material, m => m.id_material, 'Seleccioná un tipo primero')}
      ${this._htmlGrupo('Tamaño',    'tams',  tipoSel ? this._listaTams() : [], t => t.unidad ? `${t.valor} ${t.unidad}` : t.valor, t => t.id_tamanio, 'Seleccioná un tipo primero')}
    </aside>`;
  }

  _htmlGrid() {
    const prods  = this._filtrar();
    const titulo = this.novedades ? 'Novedades' : 'Productos';
    const desc   = this.novedades
      ? 'Los últimos diseños del catálogo.'
      : 'Tocá un diseño para elegir material, tamaño y cantidad.';

    if (!prods.length) {
      return `<div class="card">
        <div class="card-name">${titulo}</div>
        <p class="card-desc">No hay productos con esa combinación.</p>
        <button class="sf-btn-limpiar" data-act="limpiar" style="margin-top:.75rem">Limpiar filtros</button>
      </div>`;
    }
    return `<div class="card">
      <div class="card-name">${titulo}</div>
      <p class="card-desc">${desc}</p>
      <div class="stickers-grid">
        ${prods.map((p, i) => {
          const img  = this.datos.imgMap[p.id_producto];
          const imgH = img
            ? `<img class="sticker-thumb" src="${esc(img)}" alt="${esc(p.nombre)}" loading="lazy">`
            : `<div class="sticker-thumb sticker-thumb--ph">🎨</div>`;
          return `<button class="sticker-btn" style="animation-delay:${i * 40}ms"
                  onclick="abrirProducto(${p.id_producto})">
            ${imgH}
            <span class="sticker-name">${esc(p.nombre)}</span>
          </button>`;
        }).join('')}
      </div>
    </div>`;
  }

  _btnFiltrar() {
    const activos = this.f.cats.size + this.f.tipos.size + this.f.mats.size + this.f.tams.size;
    return `<button class="sf-mobile-btn" data-act="drawer">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
        <line x1="3" y1="6"  x2="21" y2="6"/>
        <line x1="3" y1="12" x2="21" y2="12"/>
        <line x1="3" y1="18" x2="21" y2="18"/>
      </svg>
      Filtrar${activos ? ` <span class="sf-badge">${activos}</span>` : ''}
    </button>`;
  }

  // ── render ────────────────────────────────────────────────────────────────

  _render() {
    const el = document.getElementById(this.cid);
    if (!el) return;

    if (this.onFiltrar) {
      // Modo externo: solo sidebar, el grid lo maneja catalogo.js
      el.innerHTML = `
        ${this._btnFiltrar()}
        <div class="sf-drawer-wrap${this._open ? ' sf-open' : ''}">
          <div class="sf-overlay" data-act="cerrar"></div>
          ${this._htmlSidebar()}
        </div>`;
      this._bind(el, el.querySelector('.sf-drawer-wrap'));
      this.onFiltrar(this.f);
      return;
    }

    el.innerHTML = `
      ${this._btnFiltrar()}
      <div class="sf-layout${this._open ? ' sf-open' : ''}">
        <div class="sf-overlay" data-act="cerrar"></div>
        ${this._htmlSidebar()}
        <div class="sf-content">${this._htmlGrid()}</div>
      </div>`;
    this._bind(el, el.querySelector('.sf-layout'));
  }

  _bind(root, wrap) {
    root.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const g  = cb.dataset.g;
        const id = +cb.dataset.id;
        this.f[g].has(id) ? this.f[g].delete(id) : this.f[g].add(id);
        // cascade: si se vacían todos los tipos, limpiar materiales y tamaños
        if (g === 'tipos' && !this.f.tipos.size) { this.f.mats.clear(); this.f.tams.clear(); }
        this._render();
      });
    });

    root.querySelectorAll('[data-act="limpiar"]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.f = { cats: new Set(), tipos: new Set(), mats: new Set(), tams: new Set() };
        this._open = false;
        this._render();
      });
    });

    const drawer = root.querySelector('[data-act="drawer"]');
    if (drawer) drawer.addEventListener('click', () => { this._open = true; this._render(); });

    root.querySelectorAll('[data-act="cerrar"]').forEach(btn => {
      btn.addEventListener('click', () => { this._open = false; this._render(); });
    });
  }
}

window.SidebarFiltros = SidebarFiltros;
window.FiltrosGrid    = SidebarFiltros; // backward compat para index.html

})();
