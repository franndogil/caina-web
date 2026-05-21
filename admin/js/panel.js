import { getUserSession, logout } from './auth.js';
import { initTypes } from './modules/types.js';
import { initMaterials } from './modules/materials.js';
import { initSizes } from './modules/sizes.js';
import { initProducts } from './modules/products.js';
import { initPrices } from './modules/prices.js';
import { initCategories } from './modules/categories.js'; // <-- NUEVA IMPORTACIÓN

(async () => {
    // 1. Proteger la página
    const session = await getUserSession();
    if (!session) {
        window.location.href = 'login.html';
        return;
    }

    // 2. Mostrar el contenido del panel (ahora que sabemos que el usuario está autenticado)
    document.getElementById('auth-check').style.display = 'none';
    document.getElementById('admin-nav').style.display = '';
    document.getElementById('admin-wrapper').style.display = '';

    // 3. Inicializar todos los módulos en paralelo
    try {
        await Promise.all([
            initProducts(),
            initTypes(),
            initMaterials(),
            initSizes(),
            initPrices(),
            initCategories()
        ]);
        console.log("Panel de Administración inicializado con éxito.");
    } catch (error) {
        console.error("Error durante la inicialización de un módulo:", error);
    }
})();

// Asignar el evento al botón de logout
document.getElementById('logout-button').addEventListener('click', () => logout());