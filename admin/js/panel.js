import { getUserSession, logout } from './auth.js';
import { initTypes } from './modules/types.js';
import { initMaterials } from './modules/materials.js';
import { initSizes } from './modules/sizes.js';
import { initProducts } from './modules/products.js';
import { initPrices } from './modules/prices.js';
import { initCategories } from './modules/categories.js'; // <-- NUEVA IMPORTACIÓN

(async () => {
    // 1. Proteger la página
    if (!await getUserSession()) {
        window.location.href = 'login.html';
        return;
    }

    // 2. Inicializar todos los módulos en paralelo
    try {
        await Promise.all([
            initProducts(),
            initTypes(),
            initMaterials(),
            initSizes(),
            initPrices(),
            initCategories() // <-- NUEVA LLAMADA
        ]);
        console.log("Panel de Administración inicializado con éxito.");
    } catch (error) {
        console.error("Error durante la inicialización de un módulo:", error);
    }
})();

// Asignar el evento al botón de logout
document.getElementById('logout-button').addEventListener('click', () => logout());