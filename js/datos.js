// =============================================================================
// CAPA DE DATOS COMPARTIDA
// -----------------------------------------------------------------------------
// Antes catalogo.js y filtros.js pedían el mismo dataset por separado, así que
// cada página hacía el doble de requests. Acá se carga una sola vez y ambos
// consumen la misma promesa.
//
// Se divide en dos tramos:
//   Datos.base()      → lo necesario para pintar la grilla y el sidebar.
//   Datos.variantes() → las ~3900 variantes, fuera del camino crítico.
//
// Debe incluirse después de config.js y del SDK de Supabase, y antes de
// catalogo.js y filtros.js.
// =============================================================================

window.Datos = (function () {
'use strict';

// =========================
// CLIENTE
// =========================

function cliente() {
  if (!window.supabaseClient) {
    const config = window.SUPABASE_CONFIG;
    if (!config || !config.url || !config.anonKey) {
      console.error('SUPABASE_CONFIG no está configurado. Cargá js/config.js primero.');
      return null;
    }
    window.supabaseClient = window.supabase.createClient(config.url, config.anonKey);
  }
  return window.supabaseClient;
}

// =========================
// IMÁGENES
// =========================

// Las miniaturas se suben junto a la original con el prefijo "thumb_"
// (ver admin/js/form-producto.js).
function pathThumb(path) {
  const i = path.lastIndexOf('/');
  return i === -1 ? `thumb_${path}` : `${path.slice(0, i + 1)}thumb_${path.slice(i + 1)}`;
}

// Mientras SUPABASE_CONFIG.thumbs esté en false, thumbUrl === publicUrl: pedir
// una miniatura inexistente cuesta un 404 + reintento y muestra el cuadro roto.
// Se activa después de generarlas con admin/thumbs.html.
function urlsDeImagen(db, path) {
  const pub = p => db.storage.from('productos').getPublicUrl(p).data.publicUrl;
  const publicUrl = pub(path);
  const usarThumbs = window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.thumbs;
  return { publicUrl, thumbUrl: usarThumbs ? pub(pathThumb(path)) : publicUrl };
}

// =========================
// DATOS BASE
// =========================

let _base = null;

function base() {
  if (_base) return _base;

  _base = (async () => {
    const db = cliente();
    if (!db) return null;

    const [prods, mats, tams, pres, imgs, cats, catRels, tipoMat, tipoTam] = await Promise.all([
      db.from('producto').select('id_producto, nombre, descripcion, esNovedad, tipo(id_tipo, nombre_tipo)'),
      db.from('material').select('id_material, nombre_material'),
      db.from('tamanio').select('id_tamanio, valor, unidad'),
      db.from('precio').select(`
        id_precio, valor,
        precio_usa_tipo(id_tipo),
        precio_usa_material(id_material),
        precio_usa_tamanio(id_tamanio)
      `),
      db.from('imagen_producto').select('id_producto, path_imagen, orden').order('orden').limit(5000),
      db.from('categoria').select('id_categoria, nombre_categoria'),
      db.from('producto_pertenece_categoria').select('id_producto, id_categoria').limit(5000),
      db.from('tipo_material').select('id_tipo, id_material'),
      db.from('tipo_tamanio').select('id_tipo, id_tamanio'),
    ]);

    // id_producto → [{ path_imagen, orden, publicUrl, thumbUrl }]  (galería del modal)
    // id_producto → thumbUrl de la primera                          (miniatura del grid)
    const imagenesPorProducto = {};
    const imgMap = {};
    (imgs.data || []).forEach(img => {
      const urls = urlsDeImagen(db, img.path_imagen);
      (imagenesPorProducto[img.id_producto] ??= []).push({ ...img, ...urls });
      if (!(img.id_producto in imgMap)) imgMap[img.id_producto] = urls;
    });

    const catPorProd = {};
    (catRels.data || []).forEach(r => {
      (catPorProd[r.id_producto] ??= []).push(r.id_categoria);
    });

    return {
      productos:    prods.data   || [],
      materiales:   mats.data    || [],
      tamanios:     tams.data    || [],
      precios:      pres.data    || [],
      categorias:   cats.data    || [],
      tipoMaterial: tipoMat.data || [],
      tipoTamanio:  tipoTam.data || [],
      imagenesPorProducto,
      imgMap,
      catPorProd,
    };
  })();

  return _base;
}

// =========================
// VARIANTES (fuera del camino crítico)
// =========================

// id_producto → { mats:Set, tams:Set, pares:Set<"idMat|idTam"> }
// Null hasta que termina la carga en segundo plano.
let _indice   = null;
let _variantes = null;

function indice() { return _indice; }

function variantes() {
  if (_variantes) return _variantes;

  _variantes = (async () => {
    const db = cliente();
    if (!db) return null;

    const PAGE = 1000;
    const pagina = (i, opts) => db
      .from('variante')
      .select('id_producto, id_material, id_tamanio', opts)
      .range(i * PAGE, i * PAGE + PAGE - 1);

    // La primera página ya trae el total en Content-Range, así que el resto
    // sale en paralelo sin un HEAD previo ni encadenar de a una.
    const primera = await pagina(0, { count: 'exact' });
    const restantes = Math.max(0, Math.ceil((primera.count || 0) / PAGE) - 1);
    const respuestas = [primera].concat(
      await Promise.all(Array.from({ length: restantes }, (_, i) => pagina(i + 1)))
    );

    const idx = new Map();
    respuestas.forEach(r => (r.data || []).forEach(v => {
      let e = idx.get(v.id_producto);
      if (!e) idx.set(v.id_producto, (e = { mats: new Set(), tams: new Set(), pares: new Set() }));
      e.mats.add(v.id_material);
      e.tams.add(v.id_tamanio);
      e.pares.add(`${v.id_material}|${v.id_tamanio}`);
    }));

    _indice = idx;
    return idx;
  })();

  return _variantes;
}

// ¿El producto tiene alguna variante que cumpla los filtros de material y tamaño?
// Con ambos filtros activos exige una variante que cumpla los dos a la vez
// (mismo criterio que el escaneo lineal que reemplaza).
function match(id_producto, mats, tams) {
  if (!_indice) return true;            // todavía cargando: no filtramos de más
  const e = _indice.get(id_producto);
  if (!e) return false;

  if (mats.size && tams.size) {
    for (const m of mats) for (const t of tams) if (e.pares.has(`${m}|${t}`)) return true;
    return false;
  }
  if (mats.size) { for (const m of mats) if (e.mats.has(m)) return true; return false; }
  if (tams.size) { for (const t of tams) if (e.tams.has(t)) return true; return false; }
  return true;
}

return { cliente, base, variantes, indice, match, pathThumb };

})();
