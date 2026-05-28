import { supabase } from '../auth.js';
import { showToast } from '../toast.js';

const categoriesList = document.getElementById('categories-list');
const addCategoryForm = document.getElementById('add-category-form');
const newCategoryNameInput = document.getElementById('new-category-name');

export async function initCategories() {
    await loadCategories();
    addCategoryForm.addEventListener('submit', handleCreate);
    categoriesList.addEventListener('click', handleListClick);
}

async function loadCategories() {
    const { data: categories, error } = await supabase.from('categoria').select('*').order('id_categoria');
    if (error) { console.error('Error cargando categorías:', error); return; }

    categoriesList.innerHTML = '';
    categories.forEach(category => {
        const li = document.createElement('li');
        li.dataset.id = category.id_categoria;
        li.dataset.nombre = category.nombre_categoria;
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

function isDuplicateName(name, excludeId = null) {
    const norm = s => s.trim().toLowerCase();
    for (const li of categoriesList.querySelectorAll('li[data-id]')) {
        if (excludeId && li.dataset.id === String(excludeId)) continue;
        if (norm(li.dataset.nombre) === norm(name)) return true;
    }
    return false;
}

async function handleCreate(e) {
    e.preventDefault();
    const nombre = newCategoryNameInput.value.trim();
    if (!nombre) return;

    if (isDuplicateName(nombre)) {
        showToast(`Ya existe una categoría llamada "${nombre}".`);
        return;
    }

    const { error } = await supabase.from('categoria').insert([{ nombre_categoria: nombre }]);
    if (error) { alert(`Error creando categoría: ${error.message}`); }
    else {
        newCategoryNameInput.value = '';
        await loadCategories();
        showToast(`Categoría "${nombre}" agregada`);
    }
}

function handleListClick(event) {
    const target = event.target;
    const li = target.closest('li');
    if (!li) return;
    const id = li.dataset.id;
    const nombre = li.dataset.nombre;

    if (target.classList.contains('delete-btn')) { deleteCategory(id, nombre); }
    if (target.classList.contains('edit-btn')) {
        li.innerHTML = `
            <input type="text" value="${nombre}" class="edit-input">
            <div class="actions">
                <button class="save-btn">Guardar</button>
                <button class="cancel-btn">Cancelar</button>
            </div>
        `;
    }
    if (target.classList.contains('save-btn')) {
        const newName = li.querySelector('.edit-input').value.trim();
        if (newName) {
            if (isDuplicateName(newName, id)) {
                showToast(`Ya existe una categoría llamada "${newName}".`);
            } else {
                updateCategory(id, newName);
            }
        }
    }
    if (target.classList.contains('cancel-btn')) { loadCategories(); }
}

async function deleteCategory(id, nombre) {
    if (confirm(`¿Eliminar la categoría "${nombre}"?`)) {
        const { error } = await supabase.from('categoria').delete().eq('id_categoria', id);
        if (error) { alert(`Error al eliminar: ${error.message}\n(Asegurate de que no esté asignada a ningún producto)`); }
        else {
            await loadCategories();
            showToast(`Categoría "${nombre}" eliminada`);
        }
    }
}

async function updateCategory(id, newName) {
    const { error } = await supabase.from('categoria').update({ nombre_categoria: newName }).eq('id_categoria', id);
    if (error) { alert(`Error al actualizar: ${error.message}`); }
    else {
        await loadCategories();
        showToast(`Categoría "${newName}" actualizada`);
    }
}
