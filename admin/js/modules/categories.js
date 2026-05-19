import { supabase } from '../auth.js';

// Elementos del DOM para este módulo
const categoriesList = document.getElementById('categories-list');
const addCategoryForm = document.getElementById('add-category-form');
const newCategoryNameInput = document.getElementById('new-category-name');

// Función de inicialización que se exporta
export async function initCategories() {
    await loadCategories();
    addCategoryForm.addEventListener('submit', handleCreate);
    categoriesList.addEventListener('click', handleListClick);
}

// Carga y muestra todas las categorías
async function loadCategories() {
    const { data: categories, error } = await supabase.from('categoria').select('*').order('id_categoria');
    if (error) { console.error('Error cargando categorías:', error); return; }

    categoriesList.innerHTML = '';
    categories.forEach(category => {
        const li = document.createElement('li');
        li.dataset.id = category.id_categoria;
        li.innerHTML = `
            <span class="name">${category.nombre_categoria}</span>
            <div class="actions">
                <button class="edit-btn">Modificar</button>
                <button class="delete-btn">Eliminar</button>
            </div>
        `;
        categoriesList.appendChild(li);
    });
}

// Maneja el envío del formulario para crear una nueva categoría
async function handleCreate(e) {
    e.preventDefault();
    const nombre = newCategoryNameInput.value.trim();
    if (!nombre) return;

    const { error } = await supabase.from('categoria').insert([{ nombre_categoria: nombre }]);
    if (error) { alert(`Error creando categoría: ${error.message}`); }
    else {
        newCategoryNameInput.value = '';
        await loadCategories();
    }
}

// Maneja los clics en los botones de la lista (Modificar, Eliminar, Guardar, Cancelar)
function handleListClick(event) {
    const target = event.target;
    const li = target.closest('li');
    if (!li) return;
    const id = li.dataset.id;

    if (target.classList.contains('delete-btn')) { deleteCategory(id); }
    if (target.classList.contains('edit-btn')) {
        const currentName = li.querySelector('.name').textContent;
        li.innerHTML = `
            <input type="text" value="${currentName}" class="edit-input">
            <div class="actions">
                <button class="save-btn">Guardar</button>
                <button class="cancel-btn">Cancelar</button>
            </div>
        `;
    }
    if (target.classList.contains('save-btn')) {
        const newName = li.querySelector('.edit-input').value.trim();
        if (newName) { updateCategory(id, newName); }
    }
    if (target.classList.contains('cancel-btn')) { loadCategories(); }
}

// Elimina una categoría por su ID
async function deleteCategory(id) {
    if (confirm(`¿Eliminar categoría ID ${id}?`)) {
        const { error } = await supabase.from('categoria').delete().eq('id_categoria', id);
        if (error) { alert(`Error al eliminar: ${error.message}\n(Asegúrate de que no esté asignada a ningún producto)`); }
        else { await loadCategories(); }
    }
}

// Actualiza una categoría por su ID
async function updateCategory(id, newName) {
    const { error } = await supabase.from('categoria').update({ nombre_categoria: newName }).eq('id_categoria', id);
    if (error) { alert(`Error al actualizar: ${error.message}`); }
    else { await loadCategories(); }
}