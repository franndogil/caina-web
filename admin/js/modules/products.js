import { supabase } from '../auth.js';

const productsList = document.getElementById('products-list');
const loadingMessage = document.getElementById('loading-message');

export async function initProducts() {
    // Hacemos las funciones de acción globales para los `onclick`
    window.editProduct = (id) => window.location.href = `form-producto.html?id=${id}`;
    window.deleteProduct = async (id) => {
        if (confirm(`¿Eliminar producto ID ${id}?`)) {
            // Obtener paths de imágenes antes de borrar el producto
            const { data: imagenes } = await supabase
                .from('imagen_producto')
                .select('path_imagen')
                .eq('id_producto', id);

            const { error } = await supabase.from('producto').delete().eq('id_producto', id);
            if (error) { alert(`Error eliminando producto: ${error.message}`); return; }

            // Borrar archivos del bucket después de confirmar que el producto se eliminó
            if (imagenes && imagenes.length > 0) {
                const paths = imagenes.map(img => img.path_imagen);
                const { error: storageError } = await supabase.storage.from('productos').remove(paths);
                if (storageError) console.error('Error eliminando imágenes del storage:', storageError);
            }

            alert('Producto eliminado.');
            await loadProducts();
        }
    };

    await loadProducts();
}

async function loadProducts() {
    loadingMessage.textContent = 'Cargando productos...';
    loadingMessage.style.display = 'block';

    const { data: products, error } = await supabase.from('producto').select(`id_producto, nombre, tipo (nombre_tipo)`);
    if (error) {
        loadingMessage.textContent = `Error: ${error.message}`;
        console.error('Error cargando productos:', error);
        return;
    }
    
    productsList.innerHTML = '';
    if (products.length === 0) {
        loadingMessage.textContent = 'No hay productos para mostrar.';
    } else {
        loadingMessage.style.display = 'none';
        products.forEach(product => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${product.id_producto}</td>
                <td>${product.nombre}</td>
                <td>${product.tipo ? product.tipo.nombre_tipo : 'N/A'}</td>
                <td>
                    <button onclick="editProduct(${product.id_producto})">Editar</button>
                    <button onclick="deleteProduct(${product.id_producto})">Eliminar</button>
                </td>
            `;
            productsList.appendChild(row);
        });
    }
}