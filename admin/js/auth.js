// admin/js/auth.js

// Importamos el inicializador de Supabase y nuestras claves del archivo de configuración
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// 1. Inicializamos el cliente de Supabase
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 2. Obtenemos los elementos del formulario del HTML
const loginForm = document.getElementById('login-form');
const errorMessage = document.getElementById('error-message');

// 3. Añadimos un "escuchador" para cuando el usuario envíe el formulario
if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault(); // Evitamos que la página se recargue

        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        errorMessage.textContent = ''; // Limpiamos errores anteriores

        // 4. Intentamos iniciar sesión con Supabase Auth
        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            // Si Supabase devuelve un error, lo mostramos
            console.error('Error de autenticación:', error.message);
            errorMessage.textContent = 'El email o la contraseña son incorrectos.';
        } else {
            // Si el login es exitoso, redirigimos al panel
            console.log('Login exitoso!', data);
            window.location.href = 'panel.html'; // Redirige a la página del panel
        }
    });
}

// --- Funciones que usaremos más tarde en el panel ---

/**
 * Revisa si hay una sesión de usuario activa.
 * @returns {Promise<object|null>} La sesión del usuario o null.
 */
export async function getUserSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data.session;
}

/**
 * Cierra la sesión del usuario y lo redirige al login.
 */
export async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
        console.error('Error al cerrar sesión:', error);
    } else {
        window.location.href = 'login.html';
    }
}

// Monitorear cambios de autenticación y redirigir si la sesión expira
// (solo en páginas del panel, no en login.html)
if (!window.location.pathname.includes('login.html')) {
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'SIGNED_OUT' || !session) {
            window.location.href = 'login.html';
        }
    });
}

// Logout automático por inactividad (30 minutos)
let inactivityTimer;
const INACTIVITY_TIME = 30 * 60 * 1000; // 30 minutos

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        logout();
    }, INACTIVITY_TIME);
}

document.addEventListener('click', resetInactivityTimer);
document.addEventListener('keydown', resetInactivityTimer);
document.addEventListener('mousemove', resetInactivityTimer);

resetInactivityTimer();

// Exportamos supabase para poder usarlo en otros archivos si es necesario
export { supabase };