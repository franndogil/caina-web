import { supabase, getUserSession } from './auth.js';

// --- Elementos del DOM ---
const variantsList = document.getElementById('variants-list');
const filterInput = document.getElementById('filter-text');

let allVariantsData = [];

// --- Cargar variantes ---
async function loadAllVariants() {
    variantsList.innerHTML =
        '<tr><td colspan="3">Cargando variantes...</td></tr>';

    try {
        const { data: variants, error } = await supabase
            .from('variante')
            .select(`
                id_variante,
                stock,
                producto:id_producto(nombre),
                material:id_material(
                    id_material,
                    nombre_material
                ),
                tamanio:id_tamanio(
                    id_tamanio,
                    valor,
                    unidad
                )
            `);

        if (error) throw error;

        if (!variants.length) {
            variantsList.innerHTML =
                '<tr><td colspan="3">No hay variantes disponibles.</td></tr>';
            return;
        }

        const pricePromises = variants.map(async (variant) => {
            const { data } = await supabase
                .from('precio')
                .select(`
                    valor,
                    precio_usa_material!inner(id_material),
                    precio_usa_tamanio!inner(id_tamanio)
                `)
                .eq(
                    'precio_usa_material.id_material',
                    variant.material.id_material
                )
                .eq(
                    'precio_usa_tamanio.id_tamanio',
                    variant.tamanio.id_tamanio
                )
                .limit(1)
                .single();

            return data?.valor || null;
        });

        const priceResults = await Promise.all(pricePromises);

        allVariantsData = variants.map((variant, index) => ({
            ...variant,
            calculated_price: priceResults[index]
        }));

        renderTable(allVariantsData);

    } catch (error) {
        variantsList.innerHTML = `
            <tr>
                <td colspan="3">
                    Error al cargar variantes
                </td>
            </tr>
        `;

        console.error(error);
    }
}

// --- Render tabla ---
function renderTable(data) {
    variantsList.innerHTML = '';

    if (!data.length) {
        variantsList.innerHTML =
            '<tr><td colspan="3">No hay resultados.</td></tr>';
        return;
    }

    data.forEach(variant => {
        const row = document.createElement('tr');

        const productName = variant.producto.nombre;
        const materialName = variant.material.nombre_material;
        const sizeName = variant.tamanio.unidad
            ? `${variant.tamanio.valor} ${variant.tamanio.unidad}`
            : variant.tamanio.valor;

        const price =
            typeof variant.calculated_price === 'number'
                ? `$${variant.calculated_price.toFixed(2)}`
                : 'Sin regla';

        row.innerHTML = `
            <td>${productName}</td>
            <td>${materialName} / ${sizeName}</td>
            <td>${price}</td>
        `;

        variantsList.appendChild(row);
    });
}

// --- Actualizar stock ---
async function handleSaveStock(variantId) {
    const button = variantsList.querySelector(
        `.save-stock-btn[data-variant-id="${variantId}"]`
    );

    const input = variantsList.querySelector(
        `.stock-input[data-variant-id="${variantId}"]`
    );

    button.disabled = true;
    button.textContent = '...';

    const { error } = await supabase
        .from('variante')
        .update({
            stock: input.value
        })
        .eq('id_variante', variantId);

    if (error) {
        alert(`Error: ${error.message}`);
    }

    button.disabled = false;
    button.textContent = 'Guardar Stock';
}

// --- Filtrar ---
function handleFilter() {
    const search = filterInput.value.toLowerCase();

    const filtered = allVariantsData.filter(variant => {
        return (
            variant.producto.nombre
                .toLowerCase()
                .includes(search) ||
            variant.material.nombre_material
                .toLowerCase()
                .includes(search)
        );
    });

    renderTable(filtered);
}

// --- Inicio ---
(async () => {
    const session = await getUserSession();

    if (!session) {
        window.location.href = 'login.html';
        return;
    }

    await loadAllVariants();

    filterInput.addEventListener(
        'input',
        handleFilter
    );

    variantsList.addEventListener('click', (event) => {
        if (
            event.target.classList.contains(
                'save-stock-btn'
            )
        ) {
            handleSaveStock(
                event.target.dataset.variantId
            );
        }
    });
})();