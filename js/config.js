window.SUPABASE_CONFIG = {
  url: 'https://wuhqymfqxfakldkhgbpu.supabase.co',
  anonKey: 'sb_publishable_Gb4_el-sVpwuKKgJRZYxgQ_basmDYpB',

  // Miniaturas del catálogo (imágenes "thumb_*" en el bucket productos).
  // Poner en true recién después de correr admin/thumbs.html.
  thumbs: false,

  // Pedido mínimo por tipo de producto. El mínimo se cuenta sumando todas las
  // unidades de ese tipo que haya en el carrito, así que se pueden combinar
  // diseños distintos para llegar. Los tipos que no figuran acá no tienen
  // mínimo (vasos, planchas, packs: se venden de a uno).
  //
  // `nombre` tiene que coincidir con el nombre_tipo de la base: es el fallback
  // para los carritos que quedaron guardados antes de esta versión, que no
  // registraban el id del tipo.
  minimosPorTipo: [
    { idTipo: 24, nombre: 'Stickers', minimo: 10 }
  ]
};
