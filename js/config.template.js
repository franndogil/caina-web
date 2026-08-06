// js/config.template.js
// INSTRUCCIONES:
// 1. Copia este archivo a js/config.js
// 2. Reemplaza los valores con tus claves de Supabase
// 3. js/config.js está en .gitignore, así que nunca se subirá a GitHub

window.SUPABASE_CONFIG = {
  url: 'https://tu-url.supabase.co', // Reemplaza con tu URL de Supabase
  anonKey: 'tu-anon-key-aqui', // Reemplaza con tu anon key

  // Miniaturas del catálogo (imágenes "thumb_*" en el bucket productos).
  // Dejar en false hasta correr admin/thumbs.html: si se piden thumbs que no
  // existen, cada imagen hace un 404 + reintento y se ve un cuadro roto.
  thumbs: false,

  // Pedido mínimo por tipo de producto. El mínimo se cuenta sumando todas las
  // unidades de ese tipo que haya en el carrito, así que se pueden combinar
  // diseños distintos para llegar. Los tipos que no figuran acá no tienen
  // mínimo. `idTipo` y `nombre` salen de la tabla `tipo`.
  minimosPorTipo: [
    // { idTipo: 24, nombre: 'Stickers', minimo: 10 }
  ]
};
