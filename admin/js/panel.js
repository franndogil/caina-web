import { getUserSession, logout } from './auth.js';
import { initTypes } from './modules/types.js';
import { initMaterials } from './modules/materials.js';
import { initSizes } from './modules/sizes.js';
import { initProducts } from './modules/products.js';
import { initPrices } from './modules/prices.js';
import { initCategories } from './modules/categories.js';

const initialized = new Set();

const moduleMap = {
    catalogo:   initProducts,
    tipos:      initTypes,
    materiales: initMaterials,
    tamanios:   initSizes,
    categorias: initCategories,
    precios:    initPrices,
};

async function showSection(name) {
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));

    document.getElementById(`section-${name}`)?.classList.add('active');
    document.querySelector(`.sidebar-item[data-section="${name}"]`)?.classList.add('active');

    if (!initialized.has(name) && moduleMap[name]) {
        initialized.add(name);
        try {
            await moduleMap[name]();
        } catch (err) {
            console.error(`Error al inicializar sección "${name}":`, err);
        }
    }
}

(async () => {
    const session = await getUserSession();
    if (!session) {
        window.location.href = 'login.html';
        return;
    }

    document.getElementById('auth-check').style.display = 'none';
    document.getElementById('admin-nav').style.display = '';
    document.getElementById('admin-layout').style.display = '';

    await showSection('catalogo');

    document.querySelectorAll('.sidebar-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            e.preventDefault();
            await showSection(item.dataset.section);
        });
    });
})();

document.getElementById('logout-button').addEventListener('click', () => logout());
