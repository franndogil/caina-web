import { supabase } from '../auth.js';

const sizesList = document.getElementById('sizes-list');
const addSizeForm = document.getElementById('add-size-form');
const newSizeValueInput = document.getElementById('new-size-value');
const newSizeUnitInput = document.getElementById('new-size-unit');

export async function initSizes() {
    await loadSizes();
    addSizeForm.addEventListener('submit', handleCreate);
    sizesList.addEventListener('click', handleListClick);
}

async function loadSizes() {
    const { data: sizes, error } = await supabase
        .from('tamanio')
        .select('*');

    if (error) {
        console.error('Error cargando tamaños:', error);
        return;
    }

    sizes.sort((a, b) => {
        // Primero por unidad
        if (a.unidad !== b.unidad) {
            return a.unidad.localeCompare(b.unidad);
        }

        function getValue(valor) {
            valor = valor.trim();

            // Si tiene formato "ancho x alto"
            if (valor.includes('x')) {
                const [ancho, alto] = valor
                    .split('x')
                    .map(n => parseFloat(n.trim()));

                return ancho * alto;
            }

            // Si es un número normal
            return parseFloat(valor);
        }

        return getValue(a.valor) - getValue(b.valor);
    });

    sizesList.innerHTML = '';

    sizes.forEach(size => {
        const li = document.createElement('li');
        li.dataset.id = size.id_tamanio;

        li.innerHTML = `
            <span class="text">
                <strong>Valor:</strong> ${size.valor} | 
                <strong>Unidad:</strong> ${size.unidad || 'N/A'}
            </span>
            <div class="actions">
                <button class="edit-btn">Modificar</button>
                <button class="delete-btn">Eliminar</button>
            </div>
        `;

        sizesList.appendChild(li);
    });
}

async function handleCreate(e) {
    e.preventDefault();
    const valor = newSizeValueInput.value.trim();
    const unidad = newSizeUnitInput.value.trim();
    if (!valor) { alert("El valor es obligatorio."); return; }

    const { error } = await supabase.from('tamanio').insert([{ valor, unidad }]);
    if (error) { alert(`Error creando tamaño: ${error.message}`); }
    else {
        newSizeValueInput.value = '';
        newSizeUnitInput.value = '';
        await loadSizes();
    }
}

function handleListClick(event) {
    const target = event.target;
    const li = target.closest('li');
    if (!li) return;
    const id = li.dataset.id;

    if (target.classList.contains('delete-btn')) { deleteSize(id); }
    if (target.classList.contains('edit-btn')) {
        const text = li.querySelector('.text').innerText;
        const currentValor = text.split('|')[0].replace('Valor:', '').trim();
        const currentUnidad = text.split('|')[1].replace('Unidad:', '').trim();
        
        li.innerHTML = `
            <input type="text" value="${currentValor}" placeholder="Valor" class="edit-valor">
            <input type="text" value="${currentUnidad === 'N/A' ? '' : currentUnidad}" placeholder="Unidad" class="edit-unidad">
            <div class="actions">
                <button class="save-btn">Guardar</button>
                <button class="cancel-btn">Cancelar</button>
            </div>
        `;
    }
    if (target.classList.contains('save-btn')) {
        const valor = li.querySelector('.edit-valor').value.trim();
        const unidad = li.querySelector('.edit-unidad').value.trim();
        if (valor) { updateSize(id, valor, unidad); }
    }
    if (target.classList.contains('cancel-btn')) { loadSizes(); }
}

async function deleteSize(id) {
    if (confirm(`¿Eliminar tamaño ID ${id}?`)) {
        const { error } = await supabase.from('tamanio').delete().eq('id_tamanio', id);
        if (error) { alert(`Error al eliminar: ${error.message}`); }
        else { await loadSizes(); }
    }
}

async function updateSize(id, valor, unidad) {
    const { error } = await supabase.from('tamanio').update({ valor, unidad }).eq('id_tamanio', id);
    if (error) { alert(`Error al actualizar: ${error.message}`); }
    else { await loadSizes(); }
}