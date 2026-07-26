(function () {
'use strict';

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function clonar(f) {
  return { cats: new Set(f.cats), tipos: new Set(f.tipos), mats: new Set(f.mats), tams: new Set(f.tams) };
}

// El dataset y el índice de variantes viven en js/datos.js, compartidos con
// catalogo.js: cada página los pide una sola vez.
const cargarDatos     = () => window.Datos.base();
const variantesListas = () => window.Datos.variantes();

// <img> de miniatura: intenta la versión chica y cae a la original si el
// producto todavía no tiene thumb generado.
function htmlThumb(urls, alt) {
  if (!urls) return `<div class="sticker-thumb sticker-thumb--ph">🎨</div>`;
  return `<img class="sticker-thumb" src="${esc(urls.thumbUrl)}" alt="${esc(alt)}" loading="lazy"
               data-full="${esc(urls.publicUrl)}"
               onerror="this.onerror=null;this.src=this.dataset.full">`;
}

const PAGE_SIZE = 20;

// ─────────────────────────────────────────────────────────────────────────────
class SidebarFiltros {
  constructor(cid, opts = {}) {
    this.cid       = cid;
    this.novedades = opts.novedades || false;
    this.onFiltrar = opts.onFiltrar || null;   // modo externo (pedido.html)
    this.datos     = null;
    this._open     = false;
    this._visible  = PAGE_SIZE;
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
    this._leerURL();
    this._render();
    variantesListas();   // en segundo plano, para que esté listo al filtrar
  }

  _leerURL() {
    const params = new URLSearchParams(window.location.search);
    const tipoId = params.get('tipo')      ? parseInt(params.get('tipo'))      : null;
    const catId  = params.get('categoria') ? parseInt(params.get('categoria')) : null;
    if (tipoId !== null && !isNaN(tipoId)) this.f.tipos.add(tipoId);
    if (catId  !== null && !isNaN(catId))  this.f.cats.add(catId);
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
        return window.Datos.match(p.id_producto, fs.mats, fs.tams);
      }
      return true;
    });
  }

  _count(grupo, id) {
    const f = clonar(this.f);
    f[grupo] = new Set([id]);
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
    return this.datos.materiales
      .filter(m => matIds.has(m.id_material))
      .sort((a, b) => a.nombre_material.localeCompare(b.nombre_material, 'es'));
  }

  // Usa tipo_tamanio para los tamaños disponibles del tipo seleccionado
  _listaTams() {
    if (!this.f.tipos.size) return [];
    const tamIds = new Set(
      this.datos.tipoTamanio
        .filter(tt => this.f.tipos.has(tt.id_tipo))
        .map(tt => tt.id_tamanio)
    );
    return this.datos.tamanios
      .filter(t => tamIds.has(t.id_tamanio))
      .sort((a, b) => {
        if ((a.unidad || '') !== (b.unidad || '')) return (a.unidad || '').localeCompare(b.unidad || '');
        return parseFloat(a.valor) - parseFloat(b.valor);
      });
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
    const prods  = this._filtrar().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
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

    const shown  = prods.slice(0, this._visible);
    const hayMas = prods.length > this._visible;

    let gridContent;
    if (this.f.tipos.size > 1) {
      const grupos = {};
      shown.forEach(p => {
        const nombre = p.tipo?.nombre_tipo ?? 'Sin tipo';
        (grupos[nombre] = grupos[nombre] || []).push(p);
      });
      let offset = 0;
      gridContent = Object.entries(grupos).map(([nombre, items]) => {
        const filas = items.map((p, i) => {
          const imgH = htmlThumb(this.datos.imgMap[p.id_producto], p.nombre);
          return `<button class="sticker-btn" style="animation-delay:${(offset + i) * 40}ms"
                  onclick="abrirProducto(${p.id_producto})">
            ${imgH}
            <span class="sticker-name">${esc(p.nombre)}</span>
          </button>`;
        }).join('');
        offset += items.length;
        return `<div class="categoria-grupo">
          <h4 class="categoria-titulo">${esc(nombre)}</h4>
          <div class="stickers-grid">${filas}</div>
        </div>`;
      }).join('');
    } else {
      gridContent = `<div class="stickers-grid">
        ${shown.map((p, i) => {
          const imgH = htmlThumb(this.datos.imgMap[p.id_producto], p.nombre);
          return `<button class="sticker-btn" style="animation-delay:${i * 40}ms"
                  onclick="abrirProducto(${p.id_producto})">
            ${imgH}
            <span class="sticker-name">${esc(p.nombre)}</span>
          </button>`;
        }).join('')}
      </div>`;
    }

    const masBtn = hayMas
      ? `<div class="sf-mas-wrap">
          <button class="sf-btn-mas" data-act="mas">Cargar más (${prods.length - this._visible} restantes)</button>
        </div>`
      : '';

    return `<div class="card">
      <div class="card-name">${titulo}</div>
      <p class="card-desc">${desc}</p>
      ${gridContent}
      ${masBtn}
    </div>`;
  }

  _btnFiltrar() {
    const activos = this.f.cats.size + this.f.tipos.size + this.f.mats.size + this.f.tams.size;
    return `<div class="sf-mobile-row">
      <button class="sf-mobile-btn" data-act="drawer">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
          <line x1="3" y1="6"  x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
        Filtrar${activos ? ` <span class="sf-badge">${activos}</span>` : ''}
      </button>
      ${activos ? `<button class="sf-mobile-limpiar" data-act="limpiar">Limpiar</button>` : ''}
    </div>`;
  }

  // ── append-only para "Cargar más" ─────────────────────────────────────────

  _appendMas(root) {
    // Vista agrupada (múltiples tipos): re-render completo
    if (this.f.tipos.size > 1) {
      this._visible += PAGE_SIZE;
      this._render();
      return;
    }

    const prevVisible = this._visible;
    this._visible += PAGE_SIZE;

    const prods  = this._filtrar().sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    const nuevos = prods.slice(prevVisible, this._visible);
    const hayMas = prods.length > this._visible;

    const grid = root.querySelector('.stickers-grid');
    if (!grid) { this._render(); return; }

    nuevos.forEach((p, i) => {
      const imgH = htmlThumb(this.datos.imgMap[p.id_producto], p.nombre);
      const btn = document.createElement('button');
      btn.className = 'sticker-btn sticker-btn--new';
      btn.style.animationDelay = `${i * 20}ms`;
      btn.setAttribute('onclick', `abrirProducto(${p.id_producto})`);
      btn.innerHTML = `${imgH}<span class="sticker-name">${esc(p.nombre)}</span>`;
      grid.appendChild(btn);
    });

    const btnWrap = root.querySelector('.sf-mas-wrap');
    if (!hayMas) {
      btnWrap?.remove();
    } else if (btnWrap) {
      const btn = btnWrap.querySelector('.sf-btn-mas');
      if (btn) btn.textContent = `Cargar más (${prods.length - this._visible} restantes)`;
    }
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
      cb.addEventListener('change', async () => {
        const g  = cb.dataset.g;
        const id = +cb.dataset.id;
        this.f[g].has(id) ? this.f[g].delete(id) : this.f[g].add(id);
        // cascade: si se vacían todos los tipos, limpiar materiales y tamaños
        if (g === 'tipos' && !this.f.tipos.size) { this.f.mats.clear(); this.f.tams.clear(); }
        this._visible = PAGE_SIZE;
        // Filtrar por material o tamaño necesita el índice de variantes.
        if (this.f.mats.size || this.f.tams.size) await variantesListas();
        this._render();
      });
    });

    root.querySelectorAll('[data-act="limpiar"]').forEach(btn => {
      btn.addEventListener('click', () => {
        this.f = { cats: new Set(), tipos: new Set(), mats: new Set(), tams: new Set() };
        this._open = false;
        this._visible = PAGE_SIZE;
        this._render();
      });
    });

    root.querySelectorAll('[data-act="mas"]').forEach(btn => {
      btn.addEventListener('click', () => { this._appendMas(root); });
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
