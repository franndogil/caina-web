import { supabase } from '../auth.js';

// 1. Obtenemos los elementos del DOM que este módulo necesita
const typesList = document.getElementById('types-list');
const addTypeForm = document.getElementById('add-type-form');
const newTypeNameInput = document.getElementById('new-type-name');

// 2. La función PÚBLICA que el orquestador llamará
export async function initTypes() {
    // Cuando el módulo se inicie, queremos...
    
    // ...cargar la lista de tipos por primera vez.
    await loadTypes();

    // ...y escuchar cuando el usuario quiera añadir un nuevo tipo.
    addTypeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nombreTipo = newTypeNameInput.value.trim();

        if (nombreTipo) {
            await createType(nombreTipo);
        }
    });

    // ...y escuchar los clics en los botones de "modificar" y "eliminar".
    // (Usaremos delegación de eventos para esto, es más eficiente).
    typesList.addEventListener('click', handleListClick);
}


// --- A PARTIR DE AQUÍ, SON LAS FUNCIONES "PRIVADAS" DEL MÓDULO ---
// (No se exportan, solo se usan dentro de este archivo)

// Función para LEER (Read) los tipos de la BBDD y pintarlos en la lista
async function loadTypes() {
    // Aquí irá la lógica para hacer el SELECT y generar el HTML
    const { data: tipos, error } = await supabase.from('tipo').select('*').order('id_tipo');
    if(error) {console.error('Error al cargar los tipos:', error); return; }

    typesList.innerHTML = ''; // Limpiamos la lista antes de llenarla
    tipos.forEach(tipo => {
        const li = document.createElement('li');
        li.dataset.id = tipo.id_tipo; // Guardamos el ID en un atributo data
        li.innerHTML = `
            <span class="type-name">${tipo.nombre_tipo}</span>
            <div class="actions">
                <button class="edit-btn">Modificar</button>
                <button class="delete-btn">Eliminar</button>
            </div>
        `;
        typesList.appendChild(li);
    })
}

// Función para CREAR (Create) un nuevo tipo
async function createType(nombre) {
    // Aquí irá la lógica del INSERT
    const { error } = await supabase.from('tipo').insert({ nombre_tipo: nombre });
    if (error){
        alert('Error al crear el tipo: ' + error.message);
    } else{
        newTypeNameInput.value = ''; // Limpiamos el input
        await loadTypes(); // Recargamos la lista para mostrar el nuevo tipo
    }
}

async function deleteType(id) {
    if (confirm(`¿Estás seguro de que quieres eliminar el tipo ID ${id}?`)) {
        const { error } = await supabase.from('tipo').delete().eq('id_tipo', id);
        
        if (error) {
            alert(`Error al eliminar: ${error.message}`);
        } else {
            await loadTypes();
        }
    }
}

async function updateType(id, nuevoNombre) {
    const { error } = await supabase
        .from('tipo')
        .update({ nombre_tipo: nuevoNombre })
        .eq('id_tipo', id);

    if (error) {
        alert(`Error al actualizar: ${error.message}`);
    } else {
        await loadTypes(); // Refrescamos para ver el cambio
    }
}

// Función que maneja los clics en la lista
function handleListClick(event) {
    const target = event.target;
    const li = target.closest('li'); // Busca el <li> padre más cercano
    if (!li) return; // Si no hay <li>, no hacemos nada

    const id = li.dataset.id;

    // Si el botón pulsado tiene la clase 'delete-btn'
    if (target.classList.contains('delete-btn')) {
        deleteType(id);
    }

    // Si el botón pulsado tiene la clase 'edit-btn'
    if (target.classList.contains('edit-btn')) {
        // Aquí empieza la lógica de "modificar"
        const span = li.querySelector('.type-name');
        const currentName = span.textContent;
        
        // Reemplazamos el texto por un input y dos botones nuevos
        li.innerHTML = `
            <input type="text" value="${currentName}" class="edit-input">
            <div class="actions">
                <button class="save-btn">Guardar</button>
                <button class="cancel-btn">Cancelar</button>
            </div>
        `;
    }

    // Si el botón pulsado es el de "Guardar"
    if (target.classList.contains('save-btn')) {
        const input = li.querySelector('.edit-input');
        const newName = input.value.trim();
        if (newName) {
            updateType(id, newName);
        }
    }

    // Si el botón pulsado es el de "Cancelar"
    if (target.classList.contains('cancel-btn')) {
        loadTypes(); // La forma más fácil de cancelar es simplemente recargar la lista
    }
}