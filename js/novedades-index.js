(function () {

const supabase = window.supabaseClient;

async function cargarNovedades() {
  if (!supabase) return;

  const [prods, imgs] = await Promise.all([
    supabase.from("producto").select("*, tipo(id_tipo, nombre_tipo)").eq("esNovedad", true).order("id_producto", { ascending: false }).limit(6),
    supabase.from("imagen_producto").select("*").order("orden"),
  ]);

  const productos = prods.data || [];
  const imagenesPorProducto = {};

  (imgs.data || []).forEach(img => {
    const { data: { publicUrl } } = supabase.storage.from("productos").getPublicUrl(img.path_imagen);
    if (!imagenesPorProducto[img.id_producto]) imagenesPorProducto[img.id_producto] = [];
    imagenesPorProducto[img.id_producto].push({ ...img, publicUrl });
  });

  const container = document.getElementById("novedades-grid");
  if (!container) return;

  if (!productos.length) {
    container.innerHTML = '<p style="grid-column:1/-1;text-align:center;color:var(--muted);padding:2rem 0;">No hay novedades todavía</p>';
    return;
  }

  const cards = productos.map(p => {
    const imgs = imagenesPorProducto[p.id_producto] || [];
    const thumb = imgs[0]?.publicUrl;
    const imgHtml = thumb
      ? `<img src="${escapar(thumb)}" alt="${escapar(p.nombre)}">`
      : `<div class="novedad-img-ph">🎨</div>`;

    return `
      <button class="novedad-card" onclick="abrirProducto(${p.id_producto})">
        <div class="novedad-img-wrap">
          ${imgHtml}
          <span class="novedad-badge">Nuevo</span>
        </div>
        <div class="novedad-info">
          <span class="novedad-nombre">${escapar(p.nombre)}</span>
          <span class="novedad-tipo">${escapar(p.tipo?.nombre_tipo || "Producto")}</span>
        </div>
      </button>
    `;
  }).join("");

  container.innerHTML = cards;
}

function escapar(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", cargarNovedades);
} else {
  cargarNovedades();
}

})();
