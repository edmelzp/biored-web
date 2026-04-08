// auth.js - Autenticación y gestión de roles en Biored

// Configuración de Supabase (cambiar por tus credenciales)
const SUPABASE_URL = 'https://tvsxrxvfeosngxadudvq.supabase.co';   // REEMPLAZAR
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2c3hyeHZmZW9zbmd4YWR1ZHZxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MTMwMzgsImV4cCI6MjA5MTE4OTAzOH0.INt0Dw-YmiqLKXpRasZsZolnBhfNjkg3q5j33snZuvY';                // REEMPLAZAR

// Inicializar cliente de Supabase
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Elementos del DOM (se llenarán al cargar)
let emailInput, passwordInput, nombreInput, loginBtn, registerBtn, logoutBtn, messageDiv;

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
    // Asignar elementos según la página actual
    emailInput = document.getElementById('email');
    passwordInput = document.getElementById('password');
    nombreInput = document.getElementById('nombre');
    loginBtn = document.getElementById('loginBtn');
    registerBtn = document.getElementById('registerBtn');
    logoutBtn = document.getElementById('logoutBtn');
    messageDiv = document.getElementById('message');

    // Event listeners
    if (loginBtn) loginBtn.addEventListener('click', handleLogin);
    if (registerBtn) registerBtn.addEventListener('click', handleRegister);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    // Verificar sesión actual en todas las páginas
    checkSession();
});

// Mostrar mensajes al usuario
function showMessage(text, isError = true) {
    if (!messageDiv) return;
    messageDiv.textContent = text;
    messageDiv.className = isError ? 'alert alert-error' : 'alert alert-success';
    messageDiv.style.display = 'block';
    setTimeout(() => {
        messageDiv.style.display = 'none';
    }, 4000);
}

// Registrar nuevo usuario (por defecto rol 'externo')
async function handleRegister() {
    const email = emailInput?.value.trim();
    const password = passwordInput?.value;
    const nombre = nombreInput?.value.trim();

    if (!email || !password || !nombre) {
        showMessage('Completa todos los campos (email, contraseña, nombre)');
        return;
    }
    if (password.length < 6) {
        showMessage('La contraseña debe tener al menos 6 caracteres');
        return;
    }

    try {
        // 1. Registrar en Supabase Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { nombre, rol: 'externo' } }
        });
        if (authError) throw authError;

        // 2. Insertar en tabla 'usuarios' con rol 'externo'
        const { error: insertError } = await supabase
            .from('usuarios')
            .insert([{ id: authData.user.id, email, nombre, rol: 'externo' }]);
        if (insertError) throw insertError;

        showMessage('Registro exitoso. Revisa tu correo para confirmar (si está habilitado) o inicia sesión.', false);
        // Limpiar campos
        if (emailInput) emailInput.value = '';
        if (passwordInput) passwordInput.value = '';
        if (nombreInput) nombreInput.value = '';
    } catch (error) {
        console.error(error);
        showMessage('Error al registrar: ' + error.message);
    }
}

// Iniciar sesión
async function handleLogin() {
    const email = emailInput?.value.trim();
    const password = passwordInput?.value;

    if (!email || !password) {
        showMessage('Ingresa email y contraseña');
        return;
    }

    try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

        showMessage('Sesión iniciada correctamente', false);
        // Redirigir según el rol
        await redirectByRole(data.user.id);
    } catch (error) {
        console.error(error);
        showMessage('Error al iniciar sesión: ' + error.message);
    }
}

// Cerrar sesión
async function handleLogout() {
    await supabase.auth.signOut();
    window.location.href = 'index.html';
}

// Verificar sesión activa y redirigir si ya está logueado (para login.html)
async function checkSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
        // Si está en login.html y ya tiene sesión, redirigir según rol
        if (window.location.pathname.includes('login.html')) {
            await redirectByRole(session.user.id);
        }
        // Si está en otras páginas, podemos mostrar el nombre del usuario
        const userNombre = session.user.user_metadata?.nombre || session.user.email;
        const userSpan = document.getElementById('userName');
        if (userSpan) userSpan.textContent = userNombre;
    }
}

// Redirigir según el rol del usuario (consulta a tabla 'usuarios')
async function redirectByRole(userId) {
    try {
        const { data, error } = await supabase
            .from('usuarios')
            .select('rol')
            .eq('id', userId)
            .single();
        if (error) throw error;

        const rol = data.rol;
        if (rol === 'admin') {
            window.location.href = 'admin.html';
        } else if (rol === 'interno') {
            window.location.href = 'dashboard.html';
        } else {
            window.location.href = 'catalogo.html';
        }
    } catch (error) {
        console.error(error);
        // Si hay error, redirigir a catálogo por defecto
        window.location.href = 'catalogo.html';
    }
}

// Función para convertir un externo en interno (se llamará tras completar test vocacional)
async function convertirEnInterno(userId, areaInicio, faseActual = 'F', edad, zona, intereses) {
    try {
        // 1. Actualizar rol en tabla 'usuarios'
        const { error: updateError } = await supabase
            .from('usuarios')
            .update({ rol: 'interno' })
            .eq('id', userId);
        if (updateError) throw updateError;

        // 2. Insertar en tabla 'miembros'
        const { error: insertError } = await supabase
            .from('miembros')
            .insert([{
                id: userId,
                edad: edad || null,
                zona: zona || null,
                intereses: intereses || null,
                area_inicio: areaInicio,
                fase_actual: faseActual,
                fecha_ingreso: new Date().toISOString().split('T')[0]
            }]);
        if (insertError) throw insertError;

        // 3. Crear registro inicial en 'competencias'
        const { error: compError } = await supabase
            .from('competencias')
            .insert([{
                usuario_id: userId,
                area: areaInicio,
                fase: faseActual,
                fecha_inicio_fase: new Date().toISOString().split('T')[0]
            }]);
        if (compError) throw compError;

        return { success: true };
    } catch (error) {
        console.error(error);
        return { success: false, error: error.message };
    }
}

// Exportar funciones si se usa módulos (opcional)
// window.bioredAuth = { convertirEnInterno };
