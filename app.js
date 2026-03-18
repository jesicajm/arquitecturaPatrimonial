// Firebase Configuration
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut 
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { 
    getFirestore, 
    doc, 
    setDoc, 
    getDoc, 
    collection, 
    query, 
    where, 
    getDocs, 
    addDoc, 
    updateDoc, 
    deleteDoc,
    serverTimestamp,
    orderBy
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';


// Firebase config - REPLACE WITH YOUR CREDENTIALS
const firebaseConfig = {
    apiKey: "AIzaSyBbWULwBVDnXRzi6JatNHHgmyDmosvJkmM",
    authDomain: "abba-patrimonial.firebaseapp.com",
    projectId: "abba-patrimonial",
    storageBucket: "abba-patrimonial.firebasestorage.app",
    messagingSenderId: "859343080854",
    appId: "1:859343080854:web:4ad29260e5783519cfe1b7",
    measurementId: "G-HSXKGFS7EQ"
} 

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// exchangeRates: referencia de ratios relativos al USD para monedas
// que NO son COP/USD/EUR. Se usan solo para la distribución de concentración
// por moneda en el dashboard (conversión aproximada a USD para comparar pesos).
// No se usan para conversiones a COP — esas las hace el asesor manualmente.
const exchangeRates = {
    USD: 1,
    GBP: 1.27,
    MXN: 0.059, BRL: 0.20, ARS: 0.0011, CLP: 0.0011, PEN: 0.27
    // COP y EUR se omiten: COP no necesita ratio y EUR lo ingresa el asesor
};

// Global State

let currentUser = null;

// ========================================
// CONFIGURACIÓN DE SUBTIPOS Y LIQUIDEZ
// ========================================
const configuracionActivosActualizada = {
    'Inmueble': {
        subtipos: [
            { value: 'Casa o apartamento donde vivo', label: 'Casa o apartamento donde vivo', liquidez: 'Ilíquida' },
            { value: 'Casa o apartamento arrendado', label: 'Casa o apartamento arrendado', liquidez: 'Ilíquida' },
            { value: 'Local bodega u oficina comercial', label: 'Local, bodega u oficina comercial', liquidez: 'Ilíquida' },
            { value: 'Lote o terreno', label: 'Lote o terreno', liquidez: 'Ilíquida' }
        ]
    },
    'Financiero': {
        subtipos: [
            { value: 'Cuenta bancaria corriente o ahorros', label: 'Cuenta bancaria (corriente o ahorros)', liquidez: 'Alta' },
            { value: 'Cuenta de alto rendimiento', label: 'Cuenta de alto rendimiento (Pibank, Lulo Bank, Nubank)', liquidez: 'Alta' },
            { value: 'Efectivo en caja', label: 'Efectivo en caja', liquidez: 'Alta' },
            { value: 'Fondo de liquidez o Fiducia', label: 'Fondo de liquidez o Fiducia', liquidez: 'Alta' },
            { value: 'CDT', label: 'CDT (Certificado de Depósito a Término)', liquidez: 'Baja' },
            { value: 'Acciones en bolsa', label: 'Acciones en bolsa', liquidez: 'Media' },
            { value: 'ETF o fondo de inversión internacional', label: 'ETF o fondo de inversión internacional', liquidez: 'Media' },
            { value: 'Fondo de inversión colectiva FIC', label: 'Fondo de inversión colectiva (FIC)', liquidez: 'Media' },
            { value: 'Bonos o títulos de deuda', label: 'Bonos o títulos de deuda', liquidez: 'Media' },
            { value: 'Skandia Multifund', label: 'Seguro con ahorro - Fondo voluntario pensiones (Skandia Multifund)', liquidez: 'Baja' },
            { value: 'Seguro de pensión con ahorro', label: 'Seguro de pensión con ahorro', liquidez: 'Ilíquida' },
            { value: 'REIT', label: 'REIT (fondo inmobiliario cotizado)', liquidez: 'Media' },
            { value: 'Cartera gestionada por terceros', label: 'Cartera gestionada por terceros (family office, wealth manager, fiduciaria)', liquidez: 'Media' }
        ]
    },
    'Empresarial': {
        subtipos: [
            { value: 'Mi empresa o negocio', label: 'Mi empresa o negocio', liquidez: 'Ilíquida' },
            { value: 'Sociedad con socios', label: 'Sociedad con socios (SAS, Ltda, etc.)', liquidez: 'Ilíquida' },
            { value: 'Acciones en empresa privada', label: 'Acciones en empresa privada (no cotiza en bolsa)', liquidez: 'Ilíquida' }
        ]
    },
    'Alternativo': {
        subtipos: [
            { value: 'Oro físico', label: 'Oro físico (monedas o lingotes)', liquidez: 'Ilíquida' },
            { value: 'Criptomonedas', label: 'Criptomonedas (Bitcoin, Ethereum, etc.)', liquidez: 'Baja' },
            { value: 'Obras de arte joyas o coleccionables', label: 'Obras de arte, joyas o coleccionables', liquidez: 'Ilíquida' },
            { value: 'Vehículo de trabajo', label: 'Vehículo de trabajo (Uber, carga, taxi)', liquidez: 'Ilíquida' },
            { value: 'Regalías derechos o patentes', label: 'Regalías, derechos de autor o patentes', liquidez: 'Ilíquida' }
        ]
    },
    'Uso Personal': {
        subtipos: [
            { value: 'Carro moto o vehículo personal', label: 'Carro, moto o vehículo personal', liquidez: 'Ilíquida' },
            { value: 'Casa o apartamento donde vivo', label: 'Casa o apartamento donde vivo', liquidez: 'Ilíquida' },
            { value: 'Joyas relojes u objetos de valor', label: 'Joyas, relojes u objetos de valor personal', liquidez: 'Ilíquida' }
        ]
    }
};

// ═══════════════════════════════════════════════════════════
// TIPOS DE CAMBIO — fuente única de verdad, sin valores fijos
// El asesor los ingresa manualmente en el mapa patrimonial.
// La TRM se persiste en Firestore dentro del documento del cliente:
//   clients/{clientId}.trm = { USD, EUR, fechaActualizacion }
// ═══════════════════════════════════════════════════════════
//
// trmState — fuente única de verdad en memoria.
// 0 = no ingresado → convertirACOP devuelve NaN.
//
const trmState = {
    USD: 0,
    EUR: 0,
    fechaActualizacion: '', // igual a fechaAnalisis del cliente
};

// Alias de compatibilidad para código legacy.
const tiposCambio = trmState;

// ─── Conversión centralizada ──────────────────────────────
// Devuelve el valor en COP, o NaN si falta la TRM.
function convertirACOP(monto, moneda) {
    if (!monto) return 0;
    const m = moneda || 'COP';
    if (m === 'COP') return monto;
    if (m === 'USD') {
        if (!trmState.USD) return NaN;
        return monto * trmState.USD;
    }
    if (m === 'EUR') {
        if (!trmState.EUR) return NaN;
        return monto * trmState.EUR;
    }
    return NaN;
}

// ─── Convertir fecha ISO (YYYY-MM-DD) a DD/MM/YYYY ────────
function formatearFechaAnalisis(isoDate) {
    if (!isoDate) return '';
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(isoDate)) return isoDate;
    const parts = isoDate.split('-');
    if (parts.length !== 3) return isoDate;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// ─── Cargar TRM desde Firestore al abrir un cliente ───────
async function cargarTRMdesdeFirestore(clientId) {
    try {
        const snap = await getDoc(doc(db, 'clients', clientId));
        if (!snap.exists()) return;
        const data = snap.data();
        const trm = data.trm || {};

        trmState.USD = parseFloat(trm.USD) || 0;
        trmState.EUR = parseFloat(trm.EUR) || 0;
        trmState.fechaActualizacion =
            trm.fechaActualizacion ||
            formatearFechaAnalisis(data.analysisDate) ||
            '';

        const inputUSD = document.getElementById('trm-usd');
        const inputEUR = document.getElementById('trm-eur');
        if (inputUSD) inputUSD.value = trmState.USD || '';
        if (inputEUR) inputEUR.value = trmState.EUR || '';
    } catch (e) {
        console.error('Error cargando TRM:', e);
    }
}

// ─── Guardar TRM en Firestore ─────────────────────────────
async function guardarTRMenFirestore() {
    if (!selectedClientId) return;
    const fechaAnalisis = formatearFechaAnalisis(
        selectedClientData?.analysisDate || ''
    );
    trmState.fechaActualizacion = fechaAnalisis || trmState.fechaActualizacion;
    try {
        await updateDoc(doc(db, 'clients', selectedClientId), {
            trm: {
                USD: trmState.USD,
                EUR: trmState.EUR,
                fechaActualizacion: trmState.fechaActualizacion,
            }
        });
    } catch (e) {
        console.error('Error guardando TRM:', e);
    }
}

// ─── Detectar qué monedas extranjeras están en uso ────────
async function detectarMonedasEnUso() {
    if (!selectedClientId) return new Set();
    try {
        const snap = await getDocs(
            query(collection(db, 'assets'), where('clientId', '==', selectedClientId))
        );
        const monedas = new Set();
        snap.forEach(d => {
            const m = d.data().currency;
            if (m && m !== 'COP') monedas.add(m);
        });
        return monedas;
    } catch { return new Set(); }
}

// ─── Mostrar / ocultar sección de tipos de cambio ─────────
async function actualizarSeccionTRM() {
    const monedas = await detectarMonedasEnUso();
    const seccion = document.getElementById('trm-section');
    if (!seccion) return;

    const tieneExtranjerasSoportadas =
        monedas.has('USD') || monedas.has('EUR');

    if (!tieneExtranjerasSoportadas) {
        seccion.style.display = 'none';
        return;
    }

    seccion.style.display = 'block';

    const rowUSD = document.getElementById('trm-row-usd');
    if (rowUSD) rowUSD.style.display = monedas.has('USD') ? 'flex' : 'none';

    const rowEUR = document.getElementById('trm-row-eur');
    if (rowEUR) rowEUR.style.display = monedas.has('EUR') ? 'flex' : 'none';

    // Sincronizar inputs con el estado en memoria (ya cargado desde Firestore)
    const inputUSD = document.getElementById('trm-usd');
    const inputEUR = document.getElementById('trm-eur');
    if (inputUSD) inputUSD.value = trmState.USD || '';
    if (inputEUR) inputEUR.value = trmState.EUR || '';

    renderPieTRM();
}

// ─── Renderizar el pie de TRM en tabla + dashboard ────────
function renderPieTRM() {
    const fmt = n => new Intl.NumberFormat('es-CO').format(n);
    const fecha = trmState.fechaActualizacion || '';

    const partes = [];
    if (trmState.USD) partes.push(`1 USD = $${fmt(trmState.USD)} COP`);
    if (trmState.EUR) partes.push(`1 EUR = $${fmt(trmState.EUR)} COP`);

    let texto;
    if (partes.length) {
        texto = partes.join(' | ');
        if (fecha) texto += ` · Última actualización: ${fecha}`;
    } else {
        texto = 'TRM no ingresada — los valores en USD no se pueden calcular';
    }

    const pieTablaTRM = document.getElementById('trm-pie-tabla');
    if (pieTablaTRM) pieTablaTRM.textContent = texto;

    const pieDashTRM = document.getElementById('trm-pie-dashboard');
    if (pieDashTRM) pieDashTRM.textContent = texto;
}

// ─── Listeners de los inputs de TRM ───────────────────────
function initTRMListeners() {
    const inputUSD = document.getElementById('trm-usd');
    const inputEUR = document.getElementById('trm-eur');

    // Debounce: espera 800 ms desde la última pulsación para no escribir
    // a Firestore en cada tecla.
    let trmSaveTimer = null;
    const scheduleFirestoreSave = () => {
        clearTimeout(trmSaveTimer);
        trmSaveTimer = setTimeout(() => guardarTRMenFirestore(), 800);
    };

    const onTRMInput = () => {
        trmState.USD = parseFloat(inputUSD?.value) || 0;
        trmState.EUR = parseFloat(inputEUR?.value) || 0;

        renderPieTRM();
        calcularValoresCOP();

        if (selectedClientId) {
            loadAssetsTable();
            if (activeSectionIs('dashboard')) loadDashboardData();
        }

        scheduleFirestoreSave();
    };

    const onTRMBlur = () => {
        clearTimeout(trmSaveTimer);
        trmState.USD = parseFloat(inputUSD?.value) || 0;
        trmState.EUR = parseFloat(inputEUR?.value) || 0;
        guardarTRMenFirestore();
    };

    inputUSD?.addEventListener('input',  onTRMInput);
    inputEUR?.addEventListener('input',  onTRMInput);
    inputUSD?.addEventListener('change', onTRMBlur);
    inputEUR?.addEventListener('change', onTRMBlur);
}

// ─── Inicialización de TRM al cargar el DOM ───────────────
document.addEventListener('DOMContentLoaded', () => {
    initTRMListeners();
});
function actualizarSubtiposActivos(categoria, valorActual = '', liquidezActual = '') {
    const selectSubtipo = document.getElementById('asset-subtype');
    const selectLiquidez = document.getElementById('asset-liquidity');
    const hint = document.getElementById('liquidity-auto-hint');
    
    if (!selectSubtipo) return;
    
    selectSubtipo.innerHTML = '<option value="">Seleccionar subtipo</option>';
    
    if (categoria && configuracionActivosActualizada[categoria]) {
        configuracionActivosActualizada[categoria].subtipos.forEach(subtipo => {
            const option = document.createElement('option');
            option.value = subtipo.value;
            option.textContent = subtipo.label;
            option.dataset.liquidez = subtipo.liquidez;
            
            if (subtipo.value === valorActual) {
                option.selected = true;
                if (!liquidezActual && selectLiquidez) {
                    selectLiquidez.value = subtipo.liquidez;
                }
            }
            
            selectSubtipo.appendChild(option);
        });
    } else {
        selectSubtipo.innerHTML = '<option value="">Seleccionar tipo primero</option>';
    }
    
    if (hint) hint.style.display = 'none';
}


// Función para calcular valores en COP en tiempo real (modal de activo)
function calcularValoresCOP() {
    const moneda = document.getElementById('asset-currency')?.value;
    const valorOriginal = parseFloat(document.getElementById('asset-value')?.value) || 0;
    const pasivo = parseFloat(document.getElementById('asset-liability')?.value) || 0;

    const valorCOPInput = document.getElementById('asset-value-cop');
    const netWorthInput = document.getElementById('asset-net-worth-cop');

    if (valorOriginal <= 0) {
        if (valorCOPInput) valorCOPInput.value = '';
        if (netWorthInput) netWorthInput.value = '';
        return;
    }

    const valorCOP  = convertirACOP(valorOriginal, moneda);
    const pasivoCOP = convertirACOP(pasivo, moneda);

    const fmt = (n) => new Intl.NumberFormat('es-CO', {
        style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(n);

    if (isNaN(valorCOP)) {
        // TRM no ingresada para esta moneda
        if (valorCOPInput) { valorCOPInput.value = 'Ingresa el tipo de cambio'; valorCOPInput.style.color = '#dc2626'; }
        if (netWorthInput) { netWorthInput.value = 'Ingresa el tipo de cambio'; netWorthInput.style.color = '#dc2626'; }
    } else {
        const patrimonioNetoCOP = valorCOP - (isNaN(pasivoCOP) ? 0 : pasivoCOP);
        if (valorCOPInput) { valorCOPInput.value = fmt(valorCOP); valorCOPInput.style.color = ''; }
        if (netWorthInput) { netWorthInput.value = fmt(patrimonioNetoCOP); netWorthInput.style.color = ''; }
    }
}



// ========================================
// CÁLCULO DE PERFIL DE RIESGO
// ========================================

function calcularPerfilRiesgo() {
    // Obtener respuestas
    const q1 = document.querySelector('input[name="risk-q1"]:checked');
    const q2 = document.querySelector('input[name="risk-q2"]:checked');
    const q3 = document.querySelector('input[name="risk-q3"]:checked');
    const q4 = document.querySelector('input[name="risk-q4"]:checked');
    const q5 = document.querySelector('input[name="risk-q5"]:checked');
    
    // Validar que todas estén respondidas
    if (!q1 || !q2 || !q3 || !q4 || !q5) {
        const resultDiv = document.getElementById('risk-profile-result');
        if (resultDiv) {
            resultDiv.style.display = 'none';
        }
        return;
    }
    
    // Calcular puntaje total (5-15)
    const puntaje = parseInt(q1.value) + parseInt(q2.value) + parseInt(q3.value) + 
                    parseInt(q4.value) + parseInt(q5.value);
    
    // Determinar perfil según puntaje
    let perfil, colorClass;
    if (puntaje >= 5 && puntaje <= 8) {
        perfil = 'CONSERVADOR';
        colorClass = 'profile-conservador';
    } else if (puntaje >= 9 && puntaje <= 11) {
        perfil = 'MODERADO';
        colorClass = 'profile-moderado';
    } else if (puntaje >= 12 && puntaje <= 15) {
        perfil = 'AGRESIVO';
        colorClass = 'profile-agresivo';
    }
    
    // Calcular horizonte de inversión
    const edad = parseInt(document.getElementById('client-age')?.value) || 0;
    const horizontePorEdad = edad < 40 ? 'Largo (>15 años)' : 
                            edad <= 55 ? 'Medio (5-15 años)' : 
                            'Corto (<5 años)';
    
    // Horizonte declarado (respuesta P1)
    const horizonteDeclarado = q1.value === '1' ? 'Corto (<2 años)' :
                              q1.value === '2' ? 'Medio (2-5 años)' :
                              'Largo (>5 años)';
    
    // Usar el más conservador
    let horizonteFinal;
    if (horizontePorEdad.includes('Corto') || horizonteDeclarado.includes('Corto')) {
        horizonteFinal = 'Corto';
    } else if (horizontePorEdad.includes('Medio') || horizonteDeclarado.includes('Medio')) {
        horizonteFinal = 'Medio';
    } else {
        horizonteFinal = 'Largo';
    }
    
    // Mostrar resultado
    const resultDiv = document.getElementById('risk-profile-result');
    const profileName = document.getElementById('risk-profile-name');
    const profileScore = document.getElementById('risk-profile-score');
    const horizonDiv = document.getElementById('investment-horizon');
    
    if (resultDiv && profileName && profileScore && horizonDiv) {
        resultDiv.style.display = 'block';
        resultDiv.className = colorClass;
        profileName.textContent = perfil;
        profileScore.textContent = puntaje + ' / 15 pts';
        // Determinar texto con años
        let horizonteTexto;
        if (horizonteFinal === 'Corto') {
            horizonteTexto = 'Corto plazo (menos de 5 años)';
        } else if (horizonteFinal === 'Medio') {
            horizonteTexto = 'Medio plazo (entre 5 y 15 años)';
        } else {
            horizonteTexto = 'Largo plazo (más de 15 años)';
        }
        
        horizonDiv.textContent = horizonteTexto;
        
        // Guardar en campos ocultos para el guardado
        document.getElementById('client-risk-profile-calculated').value = perfil;
        document.getElementById('client-risk-score').value = puntaje;
        document.getElementById('client-investment-horizon').value = horizonteFinal;
    }
}

// Event listeners para el cuestionario de riesgo
document.addEventListener('DOMContentLoaded', () => {
    const riskInputs = document.querySelectorAll('input[name^="risk-q"]');
    riskInputs.forEach(input => {
        input.addEventListener('change', calcularPerfilRiesgo);
    });
    const ageInput = document.getElementById('client-age');
    if (ageInput) ageInput.addEventListener('input', calcularPerfilRiesgo);
});

// ========================================
// INICIALIZACIÓN DE EVENT LISTENERS — FORMULARIO DE ACTIVOS
// ========================================
document.addEventListener('DOMContentLoaded', () => {

    // Cambio de Tipo → actualizar subtipos y visibilidad de sector
    const assetCategorySelect = document.getElementById('asset-category');
    if (assetCategorySelect) {
        assetCategorySelect.addEventListener('change', (e) => {
            const categoria = e.target.value;
            actualizarSubtiposActivos(categoria);
            // Sector: visibilidad depende de categoría + subtipo
            // Al cambiar categoría el subtipo se resetea → ocultar sector hasta que elijan subtipo
            // Para Empresarial se muestra siempre; para Financiero depende del subtipo
            toggleSectorSection(categoria, '');
            // Mostrar campo de rol empresarial solo cuando categoría = Empresarial
            const rolGroup = document.getElementById('rol-empresarial-group');
            if (rolGroup) {
                rolGroup.style.display = categoria === 'Empresarial' ? 'block' : 'none';
                // Limpiar selección si se cambia a otra categoría
                if (categoria !== 'Empresarial') {
                    document.querySelectorAll('input[name="rol-empresarial"]')
                        .forEach(r => r.checked = false);
                }
            }
            // Ocultar y limpiar cartera-group al cambiar de categoría
            const carteraGroupCat = document.getElementById('cartera-group');
            if (carteraGroupCat) {
                carteraGroupCat.style.display = 'none';
                ['asset-gestor-entidad','asset-monto-accesible','asset-plazo-liquidacion']
                    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
            }
            // Ocultar adquisición (el subtipo se reseteará al cambiar categoría)
            toggleAdquisicionGroup('');
            // Ocultar seguro pensión
            toggleSeguroPensionGroup('');
        });
    }

    // Cambio de Subtipo → asignar liquidez automática + mostrar/ocultar cartera-group
    const assetSubtypeSelect = document.getElementById('asset-subtype');
    if (assetSubtypeSelect) {
        assetSubtypeSelect.addEventListener('change', (e) => {
            const selectedOption = e.target.options[e.target.selectedIndex];
            const liquidezPorDefecto = selectedOption?.dataset?.liquidez;
            if (liquidezPorDefecto) {
                const selectLiquidez = document.getElementById('asset-liquidity');
                if (selectLiquidez) {
                    selectLiquidez.value = liquidezPorDefecto;
                    const hint = document.getElementById('liquidity-auto-hint');
                    if (hint) {
                        hint.textContent = `✓ Liquidez asignada automáticamente: ${liquidezPorDefecto}. Puedes ajustarla.`;
                        hint.style.display = 'block';
                    }
                }
            }
            // Cartera gestionada por terceros — campos extra
            const carteraGroup = document.getElementById('cartera-group');
            if (carteraGroup) {
                const esCartera = e.target.value === 'Cartera gestionada por terceros';
                carteraGroup.style.display = esCartera ? 'block' : 'none';
                if (!esCartera) {
                    ['asset-gestor-entidad','asset-monto-accesible','asset-plazo-liquidacion']
                        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
                }
            }
            // Adquisición — visible solo para subtipos financieros seleccionados
            toggleAdquisicionGroup(e.target.value);
            // Seguro de pensión con ahorro — campos específicos
            toggleSeguroPensionGroup(e.target.value);
            // Sector — visibilidad y valor por defecto según subtipo
            const catVal = document.getElementById('asset-category')?.value || '';
            toggleSectorSection(catVal, e.target.value);
            asignarSectorPorDefecto(e.target.value);
        });
    }

    // Valor / Moneda / Pasivo → recalcular COP en tiempo real + CAGR
    ['asset-currency', 'asset-value', 'asset-liability'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(id === 'asset-currency' ? 'change' : 'input', () => {
            calcularValoresCOP();
            _renderCAGR();
        });
    });

    // Adquisición — recalcular CAGR al cambiar valor o fecha
    ['asset-valor-adquisicion', 'asset-fecha-adquisicion'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener(id === 'asset-fecha-adquisicion' ? 'change' : 'input', _renderCAGR);
    });

    // Seguro pensión — recalcular info al cambiar fecha de vencimiento
    document.getElementById('sp-fecha-vencimiento')?.addEventListener('change', _renderSpInfo);

    // Seguro pensión — toggle ITP valor
    document.querySelectorAll('input[name="sp-incluye-itp"]').forEach(r => {
        r.addEventListener('change', () => {
            const itpGrp = document.getElementById('sp-itp-valor-group');
            if (itpGrp) itpGrp.style.display = r.value === 'si' ? 'block' : 'none';
            if (r.value === 'no') {
                const v = document.getElementById('sp-valor-itp');
                if (v) v.value = '';
            }
        });
    });

    // Toggle genera ingreso pasivo
    document.querySelectorAll('input[name="generates-income"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            const group = document.getElementById('monthly-income-group');
            if (group) {
                group.style.display = e.target.value === 'true' ? 'block' : 'none';
                if (e.target.value === 'false') {
                    const inc = document.getElementById('asset-monthly-income');
                    if (inc) inc.value = '0';
                }
            }
        });
    });
});


let currentUserData = null;
let selectedClientId = null;
let selectedClientData = null;
let assetChart = null;
let deleteCallback = null;

// DOM Elements
const loadingScreen = document.getElementById('loading-screen');
const loginScreen = document.getElementById('login-screen');
const mainApp = document.getElementById('main-app');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const loginToggle = document.getElementById('login-toggle');
const registerToggle = document.getElementById('register-toggle');
const logoutBtn = document.getElementById('logout-btn');
const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
const sidebar = document.getElementById('sidebar');
const advisorNav = document.getElementById('advisor-nav');
const clientNav = document.getElementById('client-nav');
const backToClientsBtn = document.getElementById('back-to-clients-btn');
const clientBadge = document.getElementById('client-badge');

// Load logo images
function loadLogoImages() {
    const logoImg = 'logo-abba.png'; // Ruta relativa al index.html
    document.getElementById('logo-img').src = logoImg;
    document.getElementById('login-logo-img').src = logoImg;
    document.getElementById('sidebar-logo-img').src = logoImg;
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    loadLogoImages();
    
    if (firebaseConfig.apiKey === "YOUR_API_KEY") {
        console.warn("⚠️ Firebase no configurado");
        setTimeout(() => {
            loadingScreen.style.display = 'none';
            loginScreen.style.display = 'flex';
        }, 1500);
    }
});

// Auth State Observer
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        await loadUserData();
        showMainApp();
    } else {
        currentUser = null;
        currentUserData = null;
        showLoginScreen();
    }
});

function showLoginScreen() {
    loadingScreen.style.display = 'none';
    loginScreen.style.display = 'flex';
    mainApp.style.display = 'none';
}

function showMainApp() {
    loadingScreen.style.display = 'none';
    loginScreen.style.display = 'none';
    mainApp.style.display = 'flex';
    showClientsView();
}

// Show/Hide Views
function showClientsView() {
    advisorNav.style.display = 'flex';
    clientNav.style.display = 'none';
    clientBadge.style.display = 'none';
    selectedClientId = null;
    selectedClientData = null;
    
    // Show clients section
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.getElementById('clientes-section').classList.add('active');
    
    // Update nav
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector('[data-section="clientes"]').classList.add('active');
    
    updateHeaderTitle('clientes');
    loadClientsData();
}

async function showClientView(clientId, clientData) {
    selectedClientId = clientId;
    selectedClientData = clientData;

    // Resetear TRM en memoria antes de cargar la del nuevo cliente
    trmState.USD = 0;
    trmState.EUR = 0;
    trmState.fechaActualizacion = '';

    advisorNav.style.display = 'none';
    clientNav.style.display = 'flex';
    clientBadge.style.display = 'block';
    document.getElementById('selected-client-name').textContent = clientData.nombreCliente || clientData.name || '';

    // Cargar TRM persistida de este cliente ANTES de renderizar
    await cargarTRMdesdeFirestore(clientId);

    // Show dashboard
    document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
    document.getElementById('dashboard-section').classList.add('active');

    // Update nav
    document.querySelectorAll('#client-nav .nav-item').forEach(n => n.classList.remove('active'));
    document.querySelector('#client-nav [data-section="dashboard"]').classList.add('active');

    updateHeaderTitle('dashboard');
    initializeDashboard();
}

backToClientsBtn?.addEventListener('click', showClientsView);

// Toggle Forms
registerToggle?.addEventListener('click', () => {
    loginForm.style.display = 'none';
    registerForm.style.display = 'flex';
});

loginToggle?.addEventListener('click', () => {
    registerForm.style.display = 'none';
    loginForm.style.display = 'flex';
});

// Login
loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const loginBtn = document.getElementById('login-btn');
    
    try {
        loginBtn.disabled = true;
        loginBtn.innerHTML = '<span>Iniciando sesión...</span>';
        await signInWithEmailAndPassword(auth, email, password);
        showToast('Inicio de sesión exitoso', 'success');
    } catch (error) {
        console.error('Error:', error);
        showToast(getErrorMessage(error.code), 'error');
    } finally {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<span>Iniciar Sesión</span>';
    }
});

// Register
registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const confirmPassword = document.getElementById('reg-password-confirm').value;
    const registerBtn = document.getElementById('register-btn');
    
    if (password !== confirmPassword) {
        showToast('Las contraseñas no coinciden', 'error');
        return;
    }
    
    try {
        registerBtn.disabled = true;
        registerBtn.innerHTML = '<span>Creando cuenta...</span>';
        
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        
        await setDoc(doc(db, 'users', userCredential.user.uid), {
            name: name,
            email: email,
            role: 'advisor',
            createdAt: serverTimestamp()
        });
        
        showToast('Cuenta creada exitosamente', 'success');
    } catch (error) {
        console.error('Error:', error);
        showToast(getErrorMessage(error.code), 'error');
    } finally {
        registerBtn.disabled = false;
        registerBtn.innerHTML = '<span>Crear Cuenta</span>';
    }
});

// Logout
logoutBtn?.addEventListener('click', async () => {
    try {
        await signOut(auth);
        showToast('Sesión cerrada exitosamente', 'success');
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cerrar sesión', 'error');
    }
});

// Load User Data
async function loadUserData() {
    try {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
            currentUserData = userDoc.data();
            updateUserProfile();
        }
    } catch (error) {
        console.error('Error loading user:', error);
    }
}

function updateUserProfile() {
    const userName = document.getElementById('user-name');
    const userInitials = document.getElementById('user-initials');
    
    if (currentUserData && currentUserData.name) {
        userName.textContent = currentUserData.name;
        const initials = currentUserData.name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
        userInitials.textContent = initials;
    }
}

// ============ CLIENTS MANAGEMENT ============

async function loadClientsData() {
    try {
        const clientsQuery = query(
            collection(db, 'clients'),
            where('advisorId', '==', currentUser.uid),
            orderBy('createdAt', 'desc')
        );
        const snapshot = await getDocs(clientsQuery);
        
        const clients = [];
        let totalAUM = 0;
        let activeCount = 0;
        let totalAlerts = 0;
        
        for (const docSnap of snapshot.docs) {
            const client = { id: docSnap.id, ...docSnap.data() };
            clients.push(client);
            
            if (client.status === 'active') activeCount++;
            
            // Calculate AUM
            const assetsQuery = query(collection(db, 'assets'), where('clientId', '==', docSnap.id));
            const assetsSnap = await getDocs(assetsQuery);
            let clientAUM = 0;
            assetsSnap.forEach(assetDoc => {
                const asset = assetDoc.data();
                if (asset.category !== 'Pasivos') {
                    clientAUM += convertToUSD(asset.value, asset.currency || 'USD');
                }
            });
            client.aum = clientAUM;
            totalAUM += clientAUM;
            
            // Count alerts
            const vulnQuery = query(collection(db, 'vulnerabilities'), where('clientId', '==', docSnap.id));
            const vulnSnap = await getDocs(vulnQuery);
            vulnSnap.forEach(v => {
                const vuln = v.data();
                if (vuln.impact === 'CRÍTICO' || vuln.impact === 'ALTO') totalAlerts++;
            });
        }
        
        // Update stats
        document.getElementById('total-clients').textContent = clients.length;
        document.getElementById('total-aum').textContent = formatCurrency(totalAUM, 'USD');
        document.getElementById('active-clients').textContent = activeCount;
        document.getElementById('total-alerts').textContent = totalAlerts;
        
        // Render clients grid
        renderClientsGrid(clients);
        
    } catch (error) {
        console.error('Error loading clients:', error);
    }
}

function renderClientsGrid(clients) {
    const grid = document.getElementById('clients-grid');
    
    if (clients.length === 0) {
        grid.innerHTML = `
            <div class="empty-clients">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                    <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
                <p>No tiene clientes registrados</p>
                <button class="btn-primary" onclick="document.getElementById('add-client-btn').click()">Agregar Primer Cliente</button>
            </div>
        `;
        return;
    }
    
    grid.innerHTML = clients.map(client => createClientCard(client)).join('');
}

function createClientCard(client) {
    const _clientDisplayName = client.nombreCliente || client.name || 'Sin nombre';
    const initials = _clientDisplayName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
    const statusClass = client.status === 'active' ? 'active' : 'inactive';
    const statusText = client.status === 'active' ? 'Activo' : 'Inactivo';
    
    return `
        <div class="client-card" onclick="selectClient('${client.id}')">
            <div class="client-card-header">
                <div style="display: flex; align-items: center; flex: 1; min-width: 0;">
                    <div class="client-avatar">${initials}</div>
                    <div class="client-info">
                        <div class="client-name">${_clientDisplayName}</div>
                        <div class="client-email">${client.email || 'Sin email'}</div>
                    </div>
                </div>
                <span class="client-status-badge ${statusClass}">${statusText}</span>
            </div>
            <div class="client-card-body">
                <div class="client-metric">
                    <span class="client-metric-label">Patrimonio:</span>
                    <span class="client-metric-value">${formatCurrency(client.aum || 0, 'USD')}</span>
                </div>
                <div class="client-metric">
                    <span class="client-metric-label">Perfil:</span>
                    <span class="client-metric-value">${client.riskProfile || 'No definido'}</span>
                </div>
                ${client.phone ? `
                <div class="client-metric">
                    <span class="client-metric-label">Teléfono:</span>
                    <span class="client-metric-value">${client.phone}</span>
                </div>
                ` : ''}
            </div>
            <div class="client-card-actions">
                <button class="btn-card-action primary" onclick="event.stopPropagation(); selectClient('${client.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                        <rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                    </svg>
                    Ver Dashboard
                </button>
                <button class="btn-card-action" onclick="event.stopPropagation(); editClient('${client.id}')">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                    Editar
                </button>
            </div>
        </div>
    `;
}

window.selectClient = async function(clientId) {
    const clientDoc = await getDoc(doc(db, 'clients', clientId));
    if (clientDoc.exists()) {
        showClientView(clientId, clientDoc.data());
    }
};

window.editClient = async function(clientId) {
    const clientDoc = await getDoc(doc(db, 'clients', clientId));
    if (clientDoc.exists()) {
        const client = clientDoc.data();

        // ── Identificación ──────────────────────────────────────────────
        document.getElementById('client-id').value = clientId;
        // Scope write to #client-form to avoid hitting the duplicate id in #client-info-form
        const _editForm = document.getElementById('client-form');
        const _setFormVal = (id, val) => {
            const el = _editForm ? _editForm.querySelector('#' + id) : document.getElementById(id);
            if (el) el.value = val ?? '';
        };
        _setFormVal('client-name', client.nombreCliente || client.name || '');

        // ── Datos básicos (todos los campos que el save lee) ────────────
        _setFormVal('client-age',                  client.age || '');
        _setFormVal('client-marital-status',       client.maritalStatus || '');
        _setFormVal('client-country',              client.country || 'Colombia');
        _setFormVal('client-monthly-expenses',     client.monthlyExpenses || '');
        _setFormVal('client-monthly-active-income',client.monthlyActiveIncome || '');
        _setFormVal('client-analysis-date',        client.analysisDate || client.fechaAnalisis || '');
        _setFormVal('client-education-costs',      client.educationCosts || 0);
        _setFormVal('client-liberal-profession',   client.liberalProfession || '');
        _setFormVal('client-notes',                client.notes || '');
        _setFormVal('client-email',                client.email || '');
        _setFormVal('client-phone',                client.phone || '');

        // ── Tipo de ingresos activos ────────────────────────────────────
        document.querySelectorAll('input[name="tipo-ingresos-activos"]').forEach(r => r.checked = false);
        if (client.tipoIngresosActivos) {
            const tipoR = document.querySelector(`input[name="tipo-ingresos-activos"][value="${client.tipoIngresosActivos}"]`);
            if (tipoR) tipoR.checked = true;
        }

        // ── Visibilidad educación (depende de dependientes) ─────────────
        _setFormVal('client-dependents', client.dependents || 0);
        toggleEducationCostsVisibility();

        // ── Perfil de riesgo calculado (campos ocultos) ─────────────────
        _setFormVal('client-risk-profile-calculated', client.riskProfile || '');
        _setFormVal('client-risk-score',              client.riskScore || '');
        _setFormVal('client-investment-horizon',      client.investmentHorizon || '');

        // ── Repoblar cuestionario de riesgo ────────────────────────────
        // Primero limpiar, luego marcar el guardado
        document.querySelectorAll('input[name^="risk-q"]').forEach(r => r.checked = false);
        const riskQs = {
            'risk-q1': client.riskQ1,
            'risk-q2': client.riskQ2,
            'risk-q3': client.riskQ3,
            'risk-q4': client.riskQ4,
            'risk-q5': client.riskQ5,
        };
        Object.entries(riskQs).forEach(([name, val]) => {
            if (val) {
                const r = document.querySelector(`input[name="${name}"][value="${val}"]`);
                if (r) r.checked = true;
            }
        });

        // ── Mostrar resultado del perfil de riesgo si está calculado ────
        const riskResult = document.getElementById('risk-profile-result');
        if (riskResult && client.riskProfile) {
            const profileName  = document.getElementById('risk-profile-name');
            const profileScore = document.getElementById('risk-profile-score');
            const horizonDiv   = document.getElementById('investment-horizon');
            if (profileName)  profileName.textContent  = client.riskProfile;
            if (profileScore) profileScore.textContent = (client.riskScore || '') + (client.riskScore ? ' / 15 pts' : '');
            if (horizonDiv) {
                const h = client.investmentHorizon || '';
                horizonDiv.textContent = h === 'Corto' ? 'Corto plazo (menos de 5 años)'
                    : h === 'Medio' ? 'Medio plazo (entre 5 y 15 años)'
                    : h === 'Largo' ? 'Largo plazo (más de 15 años)' : '';
            }
            riskResult.style.display = 'block';
            const cls = client.riskProfile === 'CONSERVADOR' ? 'profile-conservador'
                      : client.riskProfile === 'MODERADO'    ? 'profile-moderado'
                      : client.riskProfile === 'AGRESIVO'    ? 'profile-agresivo' : '';
            if (cls) riskResult.className = cls;
        } else if (riskResult) {
            riskResult.style.display = 'none';
        }

        // ── Abrir modal ─────────────────────────────────────────────────
        document.getElementById('client-modal-title').textContent = 'Editar Cliente';
        document.getElementById('save-client-btn').textContent = 'Actualizar Cliente';
        document.getElementById('client-modal').classList.add('active');

        // ── Cargar objetivos (requiere activos para viabilidad) ─────────
        try {
            const activosSnap = await getDocs(
                query(collection(db, 'assets'),
                    where('clientId', '==', clientId),
                    where('advisorId', '==', currentUser.uid))
            );
            const activos = activosSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            objInicializar(client, activos, client.objetivosCliente || {});
        } catch(e) {
            console.error('Error cargando activos para objetivos:', e);
            objInicializar(client, [], client.objetivosCliente || {});
        }
    }
};

// Client Modal
const addClientBtn = document.getElementById('add-client-btn');
const clientModal = document.getElementById('client-modal');
const closeClientModal = document.getElementById('close-client-modal');
const cancelClientModal = document.getElementById('cancel-client-modal');
const clientForm = document.getElementById('client-form');

addClientBtn?.addEventListener('click', () => {
    clientForm.reset();
    document.getElementById('client-id').value = '';
    
    // Resetear campos ocultos (con verificación null)
    const riskProfileCalc = document.getElementById('client-risk-profile-calculated');
    const riskScore = document.getElementById('client-risk-score');
    const investHorizon = document.getElementById('client-investment-horizon');
    
    if (riskProfileCalc) riskProfileCalc.value = '';
    if (riskScore) riskScore.value = '';
    if (investHorizon) investHorizon.value = '';
    
    // Ocultar resultado del perfil (con verificación null)
    const resultDiv = document.getElementById('risk-profile-result');
    if (resultDiv) {
        resultDiv.style.display = 'none';
    }
    
    // Setear fecha actual por defecto
    const today = new Date().toISOString().split('T')[0];
    const analysisDate = document.getElementById('client-analysis-date');
    if (analysisDate) {
        analysisDate.value = today;
    }
    
    // País por defecto
    const country = document.getElementById('client-country');
    if (country) {
        country.value = 'Colombia';
    }
    
    // Limpiar tipo de ingresos (form.reset() lo hace, pero explícito)
    document.querySelectorAll('input[name="tipo-ingresos-activos"]').forEach(r => r.checked = false);
    document.getElementById('client-modal-title').textContent = 'Agregar Cliente';
    document.getElementById('save-client-btn').textContent = 'Guardar Cliente';
    clientModal.classList.add('active');
    toggleEducationCostsVisibility();

    // Limpiar sección de objetivos para nuevo cliente
    _objDatosCorto   = [];
    _objDatosMediano = [];
    window._objActivosCached = [];
    _objRenderLista('corto');
    _objRenderLista('mediano');
    _objRenderLargo('');
    const btnC = document.getElementById('obj-add-corto');
    const btnM = document.getElementById('obj-add-mediano');
    if (btnC) { btnC.onclick = null; btnC.addEventListener('click', () => _objAddCard('corto')); }
    if (btnM) { btnM.onclick = null; btnM.addEventListener('click', () => _objAddCard('mediano')); }
});

closeClientModal?.addEventListener('click', () => clientModal.classList.remove('active'));
cancelClientModal?.addEventListener('click', () => clientModal.classList.remove('active'));
clientModal?.addEventListener('click', (e) => {
    if (e.target === clientModal) clientModal.classList.remove('active');
});

// Mostrar/ocultar gastos de educación según número de dependientes
function toggleEducationCostsVisibility() {
    const deps = parseInt(document.getElementById('client-dependents')?.value) || 0;
    const row  = document.getElementById('education-costs-row');
    if (row) row.style.display = deps > 0 ? '' : 'none';
    // Si se oculta, limpiar el valor para no incluirlo en cálculos
    if (deps === 0) {
        const el = document.getElementById('client-education-costs');
        if (el) el.value = 0;
    }
}
document.getElementById('client-dependents')?.addEventListener('input', toggleEducationCostsVisibility);

clientForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const clientId = document.getElementById('client-id').value;
    
    // Recopilar TODOS los campos del nuevo formulario
    // Scope a #client-form para evitar colisión con id duplicado client-name
    // que también existe en #client-info-form (Mapa Patrimonial)
    const _cf = document.getElementById('client-form');
    const _cfGet = (id) => (_cf?.querySelector('#' + id) ?? document.getElementById(id));

    const clientData = {
        advisorId: currentUser.uid,
        
        // Datos básicos
        nombreCliente: _cfGet('client-name')?.value || '',
        name:          _cfGet('client-name')?.value || '',  // alias para compatibilidad
        age: parseInt(_cfGet('client-age')?.value) || 0,
        maritalStatus: _cfGet('client-marital-status')?.value || '',
        dependents: parseInt(_cfGet('client-dependents')?.value) || 0,
        country: _cfGet('client-country')?.value || 'Colombia',
        monthlyExpenses: parseFloat(_cfGet('client-monthly-expenses')?.value) || 0,
        monthlyActiveIncome: parseFloat(_cfGet('client-monthly-active-income')?.value) || 0,
        tipoIngresosActivos: (_cf ?? document).querySelector('input[name="tipo-ingresos-activos"]:checked')?.value || '',
        analysisDate:  _cfGet('client-analysis-date')?.value || '',
        fechaAnalisis: _cfGet('client-analysis-date')?.value || '',
        educationCosts: parseFloat(_cfGet('client-education-costs')?.value) || 0,
        gastosEducacionHijos: parseFloat(_cfGet('client-education-costs')?.value) || 0,
        liberalProfession: _cfGet('client-liberal-profession')?.value || '',
        
        // Perfil de riesgo calculado
        riskProfile: _cfGet('client-risk-profile-calculated')?.value || '',
        riskScore: parseInt(_cfGet('client-risk-score')?.value) || 0,
        investmentHorizon: _cfGet('client-investment-horizon')?.value || '',
        
        // Respuestas del cuestionario
        riskQ1: parseInt((_cf ?? document).querySelector('input[name="risk-q1"]:checked')?.value) || 0,
        riskQ2: parseInt((_cf ?? document).querySelector('input[name="risk-q2"]:checked')?.value) || 0,
        riskQ3: parseInt((_cf ?? document).querySelector('input[name="risk-q3"]:checked')?.value) || 0,
        riskQ4: parseInt((_cf ?? document).querySelector('input[name="risk-q4"]:checked')?.value) || 0,
        riskQ5: parseInt((_cf ?? document).querySelector('input[name="risk-q5"]:checked')?.value) || 0,
        
        // Objetivos del cliente
        objetivosCliente: objLeerDOM(),

        // Información de contacto
        email: _cfGet('client-email')?.value || '',
        phone: _cfGet('client-phone')?.value || '',
        notes: _cfGet('client-notes')?.value || '',
        
        // Metadata
        status: 'active',
        updatedAt: serverTimestamp()
    };

    // Si hay TRM activa en memoria, actualizar su fecha de actualización
    const nuevaFechaAnalisis = formatearFechaAnalisis(
        _cfGet('client-analysis-date')?.value || ''
    );
    if (trmState.USD || trmState.EUR) {
        trmState.fechaActualizacion = nuevaFechaAnalisis;
        clientData.trm = {
            USD: trmState.USD,
            EUR: trmState.EUR,
            fechaActualizacion: nuevaFechaAnalisis,
        };
    }

    try {
        if (clientId) {
            await updateDoc(doc(db, 'clients', clientId), clientData);
            showToast('Cliente actualizado exitosamente', 'success');
        } else {
            clientData.createdAt    = serverTimestamp();
            clientData.fechaCreacion = new Date().toISOString().split('T')[0];
            await addDoc(collection(db, 'clients'), clientData);
            showToast('Cliente agregado exitosamente', 'success');
        }

        clientModal.classList.remove('active');
        // Actualizar selectedClientData con los datos recién guardados
        // para que guardarTRMenFirestore() use la fecha correcta
        if (clientId && clientId === selectedClientId) {
            selectedClientData = { ...selectedClientData, ...clientData };
        }
        renderPieTRM();
        loadClientsData();
    } catch (error) {
        console.error('Error saving client:', error);
        showToast('Error al guardar cliente', 'error');
    }
});

// Client search and filter
document.getElementById('client-search')?.addEventListener('input', filterClients);
document.getElementById('client-filter')?.addEventListener('change', filterClients);

function filterClients() {
    const searchTerm = document.getElementById('client-search')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('client-filter')?.value || 'all';
    
    const cards = document.querySelectorAll('.client-card');
    cards.forEach(card => {
        const name = card.querySelector('.client-name')?.textContent.toLowerCase() || '';
        const email = card.querySelector('.client-email')?.textContent.toLowerCase() || '';
        const status = card.querySelector('.client-status-badge')?.classList.contains('active') ? 'active' : 'inactive';
        
        const matchesSearch = name.includes(searchTerm) || email.includes(searchTerm);
        const matchesStatus = statusFilter === 'all' || status === statusFilter;
        
        card.style.display = matchesSearch && matchesStatus ? 'block' : 'none';
    });
}

// Continue with existing functions but adapted for multi-tenant...
// (Dashboard, Assets, Capas, etc. - all now scoped to selectedClientId)


// Navigation (adapted for client context)
const navItems = document.querySelectorAll('.nav-item');
navItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const section = item.dataset.section;
        
        if (section === 'clientes') {
            showClientsView();
            return;
        }
        
        if (!selectedClientId) return;
        
        document.querySelectorAll('#client-nav .nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        
        document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
        const activeSection = document.getElementById(`${section}-section`);
        if (activeSection) activeSection.classList.add('active');
        
        updateHeaderTitle(section);
        sidebar.classList.remove('active');
        
        // Load section data
        if (section === 'dashboard') loadDashboardData();
        if (section === 'patrimonio') loadAssetsTable();
        if (section === 'capas') initializeCapasSection();
    });
});

function updateHeaderTitle(section) {
    const titles = {
        'clientes': { title: 'Mis Clientes', subtitle: 'Gestión y monitoreo de clientes' },
        'dashboard': { title: 'Dashboard', subtitle: 'Visión general del cliente' },
        'patrimonio': { title: 'Mapa Patrimonial', subtitle: 'Inventario completo de activos' },
        'capas': { title: 'Evaluación 4 Capas', subtitle: 'Protección, Liquidez, Crecimiento y Diversificación' },
        'vulnerabilidades': { title: 'Vulnerabilidades', subtitle: 'Gestión de riesgos' },
        'arquitectura': { title: 'Arquitectura Ideal', subtitle: 'Estructura patrimonial objetivo' },
        'implementacion': { title: 'Plan Implementación', subtitle: 'Hoja de ruta por fases' },
        'instrumentos': { title: 'Instrumentos', subtitle: 'Recomendaciones estratégicas' },
        'documentos': { title: 'Documentos', subtitle: 'Plan formal' }
    };
    
    const sectionTitle = document.getElementById('section-title');
    const sectionSubtitle = document.getElementById('section-subtitle');
    
    if (titles[section]) {
        sectionTitle.textContent = titles[section].title;
        sectionSubtitle.textContent = titles[section].subtitle;
    }
}

mobileMenuToggle?.addEventListener('click', () => {
    sidebar.classList.toggle('active');
});

// ============ DASHBOARD (Client-specific) ============

// Chart instances (dashboard)
let dbChartTipo   = null;
let dbChartMoneda = null;

/**
 * Devuelve true solo si la sección `name` es la que está visible en pantalla.
 * Se usa para evitar que funciones de datos pinten los indicadores del Dashboard
 * cuando el asesor está en otra sección (Mapa Patrimonial, Capas, etc.).
 */
function activeSectionIs(name) {
    const section = document.getElementById(`${name}-section`);
    return section ? section.classList.contains('active') : false;
}

async function initializeDashboard() {
    if (!selectedClientId) return;
    await loadDashboardData();
}

// ─────────────────────────────────────────────────────
// Función principal que lee activos + perfil cliente
// y actualiza los 6 bloques en tiempo real
// ─────────────────────────────────────────────────────
async function loadDashboardData() {
    if (!selectedClientId) return;

    // ── GUARDA: solo renderizar si el Dashboard está visible ──
    if (!activeSectionIs('dashboard')) return;

    try {
        // ── 1. CARGAR ACTIVOS ────────────────────────────
        const assetsQuery = query(
            collection(db, 'assets'),
            where('clientId',  '==', selectedClientId),
            where('advisorId', '==', currentUser.uid)
        );
        const assetsSnapshot = await getDocs(assetsQuery);
        const activos = [];
        assetsSnapshot.forEach(d => activos.push({ id: d.id, ...d.data() }));

        // ── 2. LEER GASTOS MENSUALES DEL CLIENTE ─────────
        // selectedClientData viene del objeto guardado al hacer click en el cliente
        // monthlyExpenses está en COP (como lo graba el form del cliente)
        const gastosMensualesCOP = parseFloat(selectedClientData?.monthlyExpenses) || 0;

        // ── 3. CALCULAR MÉTRICAS ─────────────────────────
        const metricas = calcularMetricasDashboard(activos, gastosMensualesCOP);
        // Portafolio productivo (regla del 4%) — se pasa a renderBloque6_IF
        metricas.portafolioProductivoCOP = calcularValorPortafolioProductivoCOP(activos);

        // ── 4. RENDERIZAR ────────────────────────────────
        renderBloque1_Patrimonio(metricas);
        renderBloque2_Ingresos(metricas, gastosMensualesCOP);
        renderBloque3_Liquidez(metricas, gastosMensualesCOP);
        renderBloque4_TipoActivo(metricas);
        renderBloque5_Moneda(metricas);
        renderBloque6_IF(metricas, gastosMensualesCOP);
        // Bloques 7-10: concentraciones extra
        const _concData = renderBloque7_Geo(activos, selectedClientData || {});
        renderBloque8_Negocio(_concData);
        renderBloque9_IngresosDep(_concData);
        renderBloque10_Sector(_concData);
        renderResumenConcentraciones(_concData);

        // Log de diagnóstico
        console.log('📊 Dashboard actualizado:', {
            patrimonioCOP: metricas.patrimonioCOP,
            ingresosPasivos: metricas.totalIngresosPasivos,
            mesesLiquidez: metricas.mesesLiquidez,
            totalActivos: activos.length
        });

    } catch (err) {
        console.error('Error loadDashboardData:', err);
    }
}


// ── Portafolio productivo — activos que generan retiros bajo la regla del 4% ──
// Función global reutilizable: todos los módulos deben llamarla.
// Si cambia la definición de "productivo", cambia aquí y aplica en toda la herramienta.
const SUBTIPOS_NO_PRODUCTIVOS_IF = new Set([
    'Cuenta bancaria corriente o ahorros',
    'Efectivo en caja',
    'Fondo de liquidez o Fiducia',
    'Seguro de pensión con ahorro',   // capital ilíquido hasta vencimiento
    // 'Cuenta de alto rendimiento' SÍ cuenta — retirable sin penalidad
]);

function calcularPortafolioProductivo(activos) {
    return activos.filter(a => {
        const cat = a.category || '';
        const sub = a.subtype  || '';
        // Excluir categoría Uso Personal — no genera valor patrimonial
        if (cat === 'Uso Personal') return false;
        // Excluir subtipos no productivos (liquidez pura + seguros pensión)
        if (SUBTIPOS_NO_PRODUCTIVOS_IF.has(sub)) return false;
        // Excluir residencia principal
        if (sub === 'Casa o apartamento donde vivo') return false;
        // Incluir: Financiero (de inversión), Inmueble productivo, Alternativo productivo,
        // Empresarial, o cualquier activo que genere ingreso pasivo
        return (
            cat === 'Financiero' ||
            (cat === 'Inmueble'    && sub !== 'Casa o apartamento donde vivo') ||
            (cat === 'Alternativo' && (a.generatesIncome || false)) ||
            cat === 'Empresarial' ||
            (a.generatesIncome || false)
        );
    });
}

function calcularValorPortafolioProductivoCOP(activos) {
    return calcularPortafolioProductivo(activos).reduce((sum, a) => {
        const vCOP = convertirACOP(parseFloat(a.value) || 0, a.currency || 'COP');
        const pCOP = convertirACOP(parseFloat(a.liability) || 0, a.currency || 'COP');
        if (isNaN(vCOP)) return sum;
        return sum + (vCOP - (isNaN(pCOP) ? 0 : pCOP));
    }, 0);
}

// ─────────────────────────────────────────────────────
// Motor de cálculos del dashboard
// ─────────────────────────────────────────────────────
function calcularMetricasDashboard(activos, gastosMensualesCOP) {
    // aUSD: convierte a USD para distribución por moneda
    const aUSD = (monto, moneda) => {
        if (!monto) return 0;
        const m = moneda || 'COP';
        if (m === 'USD') return monto;
        if (m === 'COP') return trmState.USD ? monto / trmState.USD : 0;
        if (m === 'EUR') return (trmState.EUR && trmState.USD)
            ? (monto * trmState.EUR) / trmState.USD : 0;
        return 0;
    };

    let activosBrutosCOP = 0;
    let pasivosTotalCOP  = 0;
    let totalIngresosPasivos = 0;
    let activosAltaLiquidezCOP = 0;

    const porTipo   = {};
    const porMoneda = {};
    let activosIncompletos = 0;

    activos.forEach(asset => {
        const valor    = parseFloat(asset.value)    || 0;
        const pasivo   = parseFloat(asset.liability) || 0;
        const moneda   = asset.currency || 'COP';
        const categoria = asset.category || 'Sin categoría';
        const liquidez = asset.liquidity || '';

        const valorCOP  = convertirACOP(valor,  moneda);
        const pasivoCOP = convertirACOP(pasivo, moneda);

        // Si la TRM no está ingresada, omitir del cálculo COP
        if (isNaN(valorCOP)) {
            activosIncompletos++;
            // Aún contamos la moneda para la distribución de concentración
            const valorEnUSD = aUSD(valor, moneda);
            if (!porMoneda[moneda]) porMoneda[moneda] = 0;
            porMoneda[moneda] += valorEnUSD;
            return;
        }

        const netoCOP = valorCOP - (isNaN(pasivoCOP) ? 0 : pasivoCOP);

        activosBrutosCOP += valorCOP;
        pasivosTotalCOP  += isNaN(pasivoCOP) ? 0 : pasivoCOP;

        if (asset.generatesIncome && asset.monthlyIncome) {
            totalIngresosPasivos += parseFloat(asset.monthlyIncome) || 0;
        }

        if (liquidez === 'Alta') activosAltaLiquidezCOP += netoCOP;

        if (!porTipo[categoria]) porTipo[categoria] = 0;
        porTipo[categoria] += netoCOP;

        const valorEnUSD = aUSD(valor, moneda);
        if (!porMoneda[moneda]) porMoneda[moneda] = 0;
        porMoneda[moneda] += valorEnUSD;
    });

    const patrimonioCOP = activosBrutosCOP - pasivosTotalCOP;
    const patrimonioUSD = trmState.USD ? patrimonioCOP / trmState.USD : 0;

    const mesesLiquidez = gastosMensualesCOP > 0
        ? activosAltaLiquidezCOP / gastosMensualesCOP
        : 0;

    const distribucionTipo = Object.entries(porTipo)
        .filter(([, v]) => v > 0)
        .map(([tipo, valor]) => ({
            tipo,
            valor,
            pct: patrimonioCOP > 0 ? (valor / patrimonioCOP) * 100 : 0
        }))
        .sort((a, b) => b.pct - a.pct);

    const totalValorUSD = Object.values(porMoneda).reduce((s, v) => s + v, 0);
    const distribucionMoneda = Object.entries(porMoneda)
        .filter(([, v]) => v > 0)
        .map(([moneda, valorUSD]) => ({
            moneda,
            valorUSD,
            pct: totalValorUSD > 0 ? (valorUSD / totalValorUSD) * 100 : 0
        }))
        .sort((a, b) => b.pct - a.pct);

    const ret = {
        patrimonioCOP,
        patrimonioUSD,
        activosBrutosCOP,
        pasivosTotalCOP,
        totalIngresosPasivos,
        activosAltaLiquidezCOP,
        mesesLiquidez,
        distribucionTipo,
        distribucionMoneda,
        activosIncompletos   // cuántos activos se omitieron por falta de TRM
    };
    return ret;
}

// ─────────────────────────────────────────────────────
// Formateadores locales
// ─────────────────────────────────────────────────────
const fmtCOP = (n) => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP',
    minimumFractionDigits: 0, maximumFractionDigits: 0
}).format(n || 0);

const fmtUSD = (n) => new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    minimumFractionDigits: 0, maximumFractionDigits: 0
}).format(n || 0);

function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}
function setWidth(id, pct) {
    const el = document.getElementById(id);
    if (el) el.style.width = Math.min(Math.max(pct, 0), 100) + '%';
}
function setClass(id, cls) {
    const el = document.getElementById(id);
    if (el) el.className = cls;
}

// ─────────────────────────────────────────────────────
// Helper: aplica clase de semáforo a la tarjeta del dashboard
// ─────────────────────────────────────────────────────
function setCardSemaphore(cardId, tipo) {
    const el = document.getElementById(cardId);
    if (!el) return;
    el.classList.remove('card-success', 'card-warning', 'card-danger', 'card-neutral');
    if (tipo) el.classList.add(tipo);
}

// ─────────────────────────────────────────────────────
// BLOQUE 1 — Patrimonio
// ─────────────────────────────────────────────────────
function renderBloque1_Patrimonio(m) {
    setCardSemaphore('db-bloque-patrimonio', 'card-neutral');
    setText('db-patrimonio-cop', fmtCOP(m.patrimonioCOP));
    // Solo mostrar equivalencia en USD si hay TRM ingresada
    setText('db-patrimonio-usd',
        trmState.USD
            ? '≈ ' + fmtUSD(m.patrimonioUSD) + ' USD'
            : 'TRM no ingresada'
    );
    setText('db-activos-brutos', fmtCOP(m.activosBrutosCOP));
    setText('db-pasivos-total',  fmtCOP(m.pasivosTotalCOP));
    renderPieTRM();
}

// ─────────────────────────────────────────────────────
// BLOQUE 2 — Ingresos Pasivos
// ─────────────────────────────────────────────────────
function renderBloque2_Ingresos(m, gastosMensualesCOP) {
    const ip = m.totalIngresosPasivos;
    const pct = gastosMensualesCOP > 0 ? (ip / gastosMensualesCOP) * 100 : 0;

    // Card semaphore
    if (pct >= 40)      setCardSemaphore('db-bloque-ingresos', 'card-success');
    else if (pct >= 20) setCardSemaphore('db-bloque-ingresos', 'card-warning');
    else                setCardSemaphore('db-bloque-ingresos', 'card-danger');

    setText('db-ingresos-valor', fmtCOP(ip) + ' / mes');
    setText('db-ingresos-pct',   pct.toFixed(1) + '%');
    setText('db-ingresos-caption',
        gastosMensualesCOP > 0
            ? pct.toFixed(1) + '% de los gastos mensuales cubiertos'
            : 'Ingresa los gastos mensuales en el perfil del cliente'
    );

    // Semáforo
    let semClass = 'db-semaforo';
    if (pct >= 40)       semClass += ' db-semaforo--verde';
    else if (pct >= 20)  semClass += ' db-semaforo--amarillo';
    else                 semClass += ' db-semaforo--rojo';
    setClass('db-semaforo-ingresos', semClass);

    // Barra de progreso (capped a 100 para la barra, pero pct puede superar 100)
    setWidth('db-ingresos-bar', pct);
    const fillEl = document.getElementById('db-ingresos-bar');
    if (fillEl) {
        fillEl.className = 'db-progress-fill ' + (
            pct >= 40 ? 'db-fill--green' :
            pct >= 20 ? 'db-fill--yellow' : 'db-fill--red'
        );
    }

    // Metas de ingresos pasivos
    if (gastosMensualesCOP > 0) {
        const meta5  = gastosMensualesCOP * 0.40;
        const meta10 = gastosMensualesCOP * 0.70;
        const meta15 = gastosMensualesCOP * 1.00;
        setText('db-meta-5',  fmtCOP(meta5));
        setText('db-meta-10', fmtCOP(meta10));
        setText('db-meta-15', fmtCOP(meta15));
        setText('db-meta-5-pct',  'Avance: ' + Math.min((ip / meta5  * 100), 100).toFixed(0) + '%');
        setText('db-meta-10-pct', 'Avance: ' + Math.min((ip / meta10 * 100), 100).toFixed(0) + '%');
        setText('db-meta-15-pct', 'Avance: ' + Math.min((ip / meta15 * 100), 100).toFixed(0) + '%');
    } else {
        ['db-meta-5','db-meta-10','db-meta-15'].forEach(id => setText(id, '—'));
        ['db-meta-5-pct','db-meta-10-pct','db-meta-15-pct'].forEach(id => setText(id, ''));
    }
}

// ─────────────────────────────────────────────────────
// BLOQUE 3 — Liquidez
// ─────────────────────────────────────────────────────
function renderBloque3_Liquidez(m, gastosMensualesCOP) {
    const meses = m.mesesLiquidez;
    const tipoIng = (selectedClientData?.tipoIngresosActivos || '').toLowerCase();
    const metaMeses = tipoIng === 'empleado' ? 6 : 9;

    setText('db-liquidez-meses',  meses > 0 ? meses.toFixed(1) + ' meses' : '0 meses');
    setText('db-activos-alta',    fmtCOP(m.activosAltaLiquidezCOP));
    setText('db-liquidez-meta-label', 'Meta: ' + metaMeses + ' meses (' + (tipoIng === 'empleado' ? 'empleado' : 'empresario') + ')');
    setText('db-gap-meta-label', 'Gap hacia meta (' + metaMeses + ' meses):');

    // Estado semáforo — usa meta dinámica
    let estado = '', semClass = 'db-semaforo', cardClass;
    if (meses >= metaMeses) { estado = '● Óptimo ≥' + metaMeses + ' meses'; semClass += ' db-semaforo--verde'; cardClass = 'card-success'; }
    else if (meses >= 3)    { estado = '⚠️ Por debajo de la meta'; semClass += ' db-semaforo--amarillo'; cardClass = 'card-warning'; }
    else                    { estado = '🔴 Insuficiente'; semClass += ' db-semaforo--rojo'; cardClass = 'card-danger'; }

    setText('db-liquidez-estado', estado);
    setClass('db-semaforo-liquidez', semClass);
    setCardSemaphore('db-bloque-liquidez', cardClass);

    // Barra (metaMeses = 100%)
    const pctBarra = Math.min((meses / metaMeses) * 100, 100);
    setWidth('db-liquidez-bar', pctBarra);
    const fillEl = document.getElementById('db-liquidez-bar');
    if (fillEl) {
        fillEl.className = 'db-progress-fill ' + (
            meses >= metaMeses ? 'db-fill--green' :
            meses >= 3 ? 'db-fill--yellow' : 'db-fill--red'
        );
    }

    // Gap
    if (gastosMensualesCOP > 0) {
        const metaCOP = gastosMensualesCOP * metaMeses;
        const gap     = metaCOP - m.activosAltaLiquidezCOP;
        const gapEl   = document.getElementById('db-liquidez-gap');
        if (gapEl) {
            gapEl.textContent = (gap > 0 ? '−' : '+') + fmtCOP(Math.abs(gap));
            gapEl.className   = 'db-gap-val' + (gap > 0 ? ' db-gap-val--negativo' : '');
        }
    } else {
        setText('db-liquidez-gap', '—');
    }
}

// ─────────────────────────────────────────────────────
// BLOQUE 4 — Concentración por Tipo
// ─────────────────────────────────────────────────────
const COLORES_TIPO = {
    'Inmueble':      '#4a90d9',
    'Financiero':    '#34d399',
    'Empresarial':   '#f0c040',
    'Alternativo':   '#f87171',
    'Uso Personal':  '#a78bfa',
};
const COLORES_FALLBACK = ['#4a90d9','#34d399','#f0c040','#f87171','#a78bfa','#fb923c','#38bdf8'];

function renderBloque4_TipoActivo(m) {
    const dist = m.distribucionTipo;
    const hasData = dist.length > 0;

    // Destruir chart anterior
    if (dbChartTipo) { dbChartTipo.destroy(); dbChartTipo = null; }

    const ctx = document.getElementById('db-chart-tipo');
    if (!ctx) return;

    const labels = hasData ? dist.map(d => d.tipo) : ['Sin datos'];
    const data   = hasData ? dist.map(d => d.pct)  : [100];
    const colors = hasData
        ? dist.map((d, i) => COLORES_TIPO[d.tipo] || COLORES_FALLBACK[i % COLORES_FALLBACK.length])
        : ['#edf0f4'];

    dbChartTipo = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#ffffff',
                    titleColor: '#1e2a3a',
                    bodyColor: '#5e6b7f',
                    borderColor: '#e8ecf1',
                    borderWidth: 1,
                    callbacks: {
                        label: ctx => ` ${ctx.label}: ${ctx.parsed.toFixed(1)}%`
                    }
                }
            }
        }
    });

    // Leyenda
    const legend = document.getElementById('db-legend-tipo');
    if (legend) {
        legend.innerHTML = hasData
            ? dist.map((d, i) => `
                <div class="db-legend-item">
                    <span class="db-legend-dot" style="background:${colors[i]}"></span>
                    <span>${d.tipo}</span>
                    <span class="db-legend-pct">${d.pct.toFixed(1)}%</span>
                </div>`).join('')
            : '<p class="db-legend-empty">Sin activos registrados</p>';
    }

    // Alerta si algún tipo > 70%
    const alertEl  = document.getElementById('db-alert-tipo');
    const alertMsg = document.getElementById('db-alert-tipo-msg');
    const critico  = dist.find(d => d.pct > 70);
    setCardSemaphore('db-bloque-tipo', critico ? 'card-danger' : 'card-success');
    if (alertEl && alertMsg) {
        if (critico) {
            alertMsg.textContent = `Concentración crítica: ${critico.pct.toFixed(1)}% en ${critico.tipo}. Supera el umbral del 70% — se recomienda diversificar.`;
            alertEl.style.display = 'flex';
        } else {
            alertEl.style.display = 'none';
        }
    }
}

// ─────────────────────────────────────────────────────
// BLOQUE 5 — Concentración por Moneda
// ─────────────────────────────────────────────────────
const COLORES_MONEDA = {
    'COP': '#4a90d9',
    'USD': '#34d399',
    'EUR': '#f0c040',
    'GBP': '#a78bfa',
    'MXN': '#fb923c',
    'BRL': '#38bdf8',
};

function renderBloque5_Moneda(m) {
    const dist = m.distribucionMoneda;
    const hasData = dist.length > 0;

    if (dbChartMoneda) { dbChartMoneda.destroy(); dbChartMoneda = null; }

    const ctx = document.getElementById('db-chart-moneda');
    if (!ctx) return;

    const labels = hasData ? dist.map(d => d.moneda) : ['Sin datos'];
    const data   = hasData ? dist.map(d => d.pct)    : [100];
    const colors = hasData
        ? dist.map((d, i) => COLORES_MONEDA[d.moneda] || COLORES_FALLBACK[i % COLORES_FALLBACK.length])
        : ['#edf0f4'];

    dbChartMoneda = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#ffffff',
                    titleColor: '#1e2a3a',
                    bodyColor: '#5e6b7f',
                    borderColor: '#e8ecf1',
                    borderWidth: 1,
                    callbacks: {
                        label: ctx => ` ${ctx.label}: ${ctx.parsed.toFixed(1)}%`
                    }
                }
            }
        }
    });

    // Leyenda
    const legend = document.getElementById('db-legend-moneda');
    if (legend) {
        legend.innerHTML = hasData
            ? dist.map((d, i) => `
                <div class="db-legend-item">
                    <span class="db-legend-dot" style="background:${colors[i]}"></span>
                    <span>${d.moneda}</span>
                    <span class="db-legend-pct">${d.pct.toFixed(1)}%</span>
                </div>`).join('')
            : '<p class="db-legend-empty">Sin activos registrados</p>';
    }

    // Alerta si alguna moneda > 80%
    const alertEl  = document.getElementById('db-alert-moneda');
    const alertMsg = document.getElementById('db-alert-moneda-msg');
    const critico  = dist.find(d => d.pct > 80);
    setCardSemaphore('db-bloque-moneda', critico ? 'card-danger' : 'card-success');
    if (alertEl && alertMsg) {
        if (critico) {
            alertMsg.textContent = `Exposición cambiaria crítica: ${critico.pct.toFixed(1)}% en ${critico.moneda}. Supera el umbral del 80% — considerar diversificación de monedas.`;
            alertEl.style.display = 'flex';
        } else {
            alertEl.style.display = 'none';
        }
    }
}

// ─────────────────────────────────────────────────────
// BLOQUE 6 — Independencia Financiera
// ─────────────────────────────────────────────────────
function renderBloque6_IF(m, gastosMensualesCOP) {
    // Número Mágico = gastos × 12 / 0.04 = gastos × 300 (regla del 4%)
    const numeroMagico     = gastosMensualesCOP * 300;
    const portafolioProd   = m.portafolioProductivoCOP || 0;
    const patrimonioTotal  = m.patrimonioCOP || 0;

    const pct = numeroMagico > 0
        ? Math.min((portafolioProd / numeroMagico) * 100, 999)
        : 0;

    // Retiro mensual sostenible
    const retiroSostenible = portafolioProd * 0.04 / 12;
    const gapMensual       = Math.max(0, gastosMensualesCOP - retiroSostenible);
    const diferenciaNoProd = patrimonioTotal - portafolioProd;

    // Card semaphore
    let cardClass, semLabel, semClass = 'db-semaforo';
    if (retiroSostenible >= gastosMensualesCOP && gastosMensualesCOP > 0) {
        cardClass = 'card-success'; semLabel = '✅ Independencia financiera alcanzada'; semClass += ' db-semaforo--verde';
    } else if (retiroSostenible >= gastosMensualesCOP * 0.70 && gastosMensualesCOP > 0) {
        cardClass = 'card-warning'; semLabel = '⚠️ Cerca de la independencia financiera'; semClass += ' db-semaforo--amarillo';
    } else {
        cardClass = 'card-danger';
        semLabel = gastosMensualesCOP > 0 ? '🔴 Gap: −' + fmtCOP(gapMensual) + ' COP/mes' : '';
        semClass += ' db-semaforo--rojo';
    }
    setCardSemaphore('db-bloque-if', cardClass);
    setClass('db-semaforo-if', semClass);
    setText('db-semaforo-if-label', semLabel);

    setText('db-numero-magico', numeroMagico > 0 ? fmtCOP(numeroMagico) : 'Ingresa gastos mensuales');
    setText('db-if-pct', pct.toFixed(1) + '%');
    setWidth('db-if-bar', Math.min(pct, 100));

    // Caption: portafolio productivo / número mágico
    setText('db-if-caption',
        numeroMagico > 0
            ? fmtCOP(portafolioProd) + ' de ' + fmtCOP(numeroMagico) + ' (portafolio productivo)'
            : 'Completa el perfil del cliente'
    );

    // Color de la barra según avance
    const barEl = document.getElementById('db-if-bar');
    if (barEl) {
        barEl.className = 'db-progress-fill ' + (
            pct >= 100 ? 'db-fill--green' :
            pct >= 50  ? 'db-fill--gold'  : 'db-fill--red'
        );
    }

    // ── Detalle extendido ──────────────────────────────────────────
    const detalleEl = document.getElementById('db-if-detalle');
    if (detalleEl && gastosMensualesCOP > 0) {
        detalleEl.innerHTML =
            '<div class="db-if-row"><span>Portafolio productivo</span>'
            + '<strong>' + fmtCOP(portafolioProd) + '</strong></div>'
            + '<div class="db-if-sub">Activos que generan retiros bajo la regla del 4%'
            + ' — excluye residencia, vehículos y seguros de pensión</div>'
            + '<div class="db-if-row" style="margin-top:6px"><span>Retiro mensual sostenible hoy</span>'
            + '<strong>' + fmtCOP(retiroSostenible) + '/mes</strong></div>'
            + '<div class="db-if-row"><span>Gastos mensuales</span>'
            + '<strong>' + fmtCOP(gastosMensualesCOP) + '/mes</strong></div>'
            + (gapMensual > 0
                ? '<div class="db-if-row db-if-gap"><span>Gap mensual</span>'
                  + '<strong>' + fmtCOP(gapMensual) + '/mes</strong></div>'
                : '<div class="db-if-row"><span>Excedente mensual</span>'
                  + '<strong style="color:var(--db-success,#0d7a4f)">' + fmtCOP(retiroSostenible - gastosMensualesCOP) + '/mes ✅</strong></div>')
            + '<div class="db-if-divider"></div>'
        detalleEl.style.display = 'block';
    } else if (detalleEl) {
        detalleEl.style.display = 'none';
    }
}

function convertToUSD(value, currency) {
    return value * (exchangeRates[currency] || 1);
}

// updateCapasScores — kept for capas section compatibility
function updateCapasScores(capasData) {
    const layers = [
        { num: 1, key: 'proteccion' },
        { num: 2, key: 'liquidez' },
        { num: 3, key: 'crecimiento' },
        { num: 4, key: 'diversificacion' }
    ];
    layers.forEach(layer => {
        const score = capasData[layer.key] || 0;
        const layerItem = document.querySelector(`.layer-item[data-layer="${layer.num}"]`);
        if (layerItem) {
            const scoreCircle = layerItem.querySelector('.score-circle');
            const scoreValue  = layerItem.querySelector('.score-value');
            if (scoreCircle) scoreCircle.dataset.score = score;
            if (scoreValue)  scoreValue.textContent = score;
        }
    });
}


// ============ ASSETS MANAGEMENT (Client-specific) ============

const addAssetBtn = document.getElementById('add-asset-btn');
const assetModal = document.getElementById('asset-modal');
const assetForm = document.getElementById('asset-form');
const assetModalTitle = document.getElementById('asset-modal-title');
const saveAssetBtn = document.getElementById('save-asset-btn');

const PAISES_LISTA = [
    'Colombia','Estados Unidos','Panamá','España','México','Reino Unido',
    'Islas Caimán','Islas Vírgenes Británicas','Isle of Man','Luxemburgo',
    'Suiza','Canadá','Brasil','Argentina','Chile','Peru','Uruguay',
    'Portugal','Francia','Alemania','Dubai (UAE)','Singapur',
];

// Helper: leer el valor canónico del campo País del formulario
function readAssetLocation() {
    const sel = document.getElementById('asset-location');
    if (!sel) return '';
    if (sel.value === 'Otro') {
        return document.getElementById('asset-location-otro')?.value?.trim() || 'Otro';
    }
    return sel.value;
}

// Helper: poblar el campo País del formulario con un valor guardado
function setAssetLocation(val) {
    const sel = document.getElementById('asset-location');
    const otroGroup = document.getElementById('asset-location-otro-group');
    const otroInput = document.getElementById('asset-location-otro');
    if (!sel) return;
    if (!val) {
        sel.value = '';
        if (otroGroup) otroGroup.style.display = 'none';
        if (otroInput) otroInput.value = '';
        return;
    }
    if (PAISES_LISTA.includes(val)) {
        sel.value = val;
        if (otroGroup) otroGroup.style.display = 'none';
        if (otroInput) otroInput.value = '';
    } else {
        // Valor no reconocido → migrar a "Otro" + texto libre
        sel.value = 'Otro';
        if (otroGroup) otroGroup.style.display = 'block';
        if (otroInput) otroInput.value = val;
    }
}

// ── Adquisición — subtipos elegibles ──────────────────────────────────────

// ── Sector selector — subtipos con sector relevante ──────────────────────
const SUBTIPOS_CON_SECTOR = new Set([
    'Acciones en bolsa',
    'ETF o fondo de inversión internacional',
    'Fondo de inversión colectiva FIC',
    'Bonos o títulos de deuda',
    'REIT',
    'Skandia Multifund',
    'Cartera gestionada por terceros',
]);

const SECTOR_POR_DEFECTO = {
    'ETF o fondo de inversión internacional': 'Global / Diversificado',
    'REIT':                                   'Real Estate / Inmobiliario',
    'Skandia Multifund':                      'Global / Diversificado',
};

// Opciones válidas para migración de datos legados
const SECTORES_VALIDOS = new Set([
    'Global / Diversificado',
    'Tecnología',
    'Salud y Farmacéutico',
    'Energía y Recursos Naturales',
    'Financiero y Bancario',
    'Consumo y Retail',
    'Industrial y Manufactura',
    'Real Estate / Inmobiliario',
    'Materias Primas',
    'Infraestructura',
    'Otro',
]);

// Función reutilizable: mostrar/ocultar sector-section según categoría y subtipo
function toggleSectorSection(categoria, subtype) {
    const sectorSection = document.getElementById('sector-section');
    if (!sectorSection) return;
    const mostrar = (categoria === 'Empresarial')
        || (categoria === 'Financiero' && SUBTIPOS_CON_SECTOR.has(subtype));
    sectorSection.style.display = mostrar ? 'block' : 'none';
    if (!mostrar) {
        const sel = document.getElementById('asset-sector');
        if (sel) sel.value = '';
    }
}

// Función: asignar sector por defecto al cambiar subtipo
function asignarSectorPorDefecto(subtype) {
    const sel = document.getElementById('asset-sector');
    if (!sel) return;
    const defVal = SECTOR_POR_DEFECTO[subtype];
    if (defVal) sel.value = defVal;
}

// Función: normalizar sector legado (texto libre) a opción del select
function normalizarSectorLegado(sectorGuardado) {
    if (!sectorGuardado) return '';
    if (SECTORES_VALIDOS.has(sectorGuardado)) return sectorGuardado;
    // Intentar mapeo por palabras clave
    const s = sectorGuardado.toLowerCase();
    if (s.includes('tecnolog')) return 'Tecnología';
    if (s.includes('salud') || s.includes('farmac')) return 'Salud y Farmacéutico';
    if (s.includes('energ') || s.includes('petrol') || s.includes('recurso')) return 'Energía y Recursos Naturales';
    if (s.includes('financiero') || s.includes('banco') || s.includes('bancario')) return 'Financiero y Bancario';
    if (s.includes('consumo') || s.includes('retail')) return 'Consumo y Retail';
    if (s.includes('industrial') || s.includes('manufactur')) return 'Industrial y Manufactura';
    if (s.includes('inmob') || s.includes('real estate') || s.includes('reit')) return 'Real Estate / Inmobiliario';
    if (s.includes('materia') || s.includes('comodit') || s.includes('minero')) return 'Materias Primas';
    if (s.includes('infraestruc')) return 'Infraestructura';
    if (s.includes('global') || s.includes('diversif') || s.includes('etf')) return 'Global / Diversificado';
    return 'Otro';  // fallback para cualquier texto libre no reconocido
}

const SUBTIPOS_ADQUISICION = new Set([
    'Acciones en bolsa',
    'ETF o fondo de inversión internacional',
    'Fondo de inversión colectiva FIC',
    'Bonos o títulos de deuda',
    'REIT',
    'Skandia Multifund',
    'Cartera gestionada por terceros',
]);

// Mostrar/ocultar y limpiar el grupo de adquisición según subtipo seleccionado
function toggleAdquisicionGroup(subtype) {
    const grupo   = document.getElementById('adquisicion-group');
    if (!grupo) return;
    const visible = SUBTIPOS_ADQUISICION.has(subtype);
    grupo.style.display = visible ? 'block' : 'none';
    if (!visible) {
        const va = document.getElementById('asset-valor-adquisicion');
        const fa = document.getElementById('asset-fecha-adquisicion');
        if (va) va.value = '';
        if (fa) fa.value = '';
        _renderCAGR();   // ocultar resultado/hint
    }
}

// Calcular y renderizar el bloque CAGR
function _renderCAGR() {
    const resDom  = document.getElementById('adquisicion-resultado');
    const hintDom = document.getElementById('adquisicion-hint');
    if (!resDom || !hintDom) return;

    const grupo = document.getElementById('adquisicion-group');
    if (!grupo || grupo.style.display === 'none') {
        resDom.style.display  = 'none';
        hintDom.style.display = 'none';
        return;
    }

    // Valor actual en COP — leer desde value+currency para evitar parsear texto formateado
    const valorRaw  = parseFloat(document.getElementById('asset-value')?.value) || 0;
    const moneda    = document.getElementById('asset-currency')?.value || 'COP';
    const valorActualCOP = valorRaw > 0 ? (convertirACOP(valorRaw, moneda) || 0) : 0;

    const valorAdqRaw = document.getElementById('asset-valor-adquisicion')?.value?.trim();
    const fechaAdqRaw = document.getElementById('asset-fecha-adquisicion')?.value;   // yyyy-mm-dd

    const tieneValor = valorAdqRaw !== '' && valorAdqRaw != null && !isNaN(parseFloat(valorAdqRaw));
    const tieneFecha = fechaAdqRaw !== '' && fechaAdqRaw != null;

    const MSG_DEFAULT = 'Ingresa valor y fecha de adquisición para calcular el retorno anualizado';

    // Si falta alguno de los dos → hint (si al menos uno está ingresado)
    if (!tieneValor || !tieneFecha) {
        resDom.style.display  = 'none';
        if (tieneValor || tieneFecha) {
            hintDom.textContent   = MSG_DEFAULT;
            hintDom.style.display = 'block';
        } else {
            hintDom.style.display = 'none';
        }
        return;
    }

    const valorAdqCOP = parseFloat(valorAdqRaw);
    if (valorAdqCOP <= 0 || valorActualCOP <= 0 || isNaN(valorActualCOP)) {
        resDom.style.display  = 'none';
        hintDom.style.display = 'none';
        return;
    }

    // Fecha de análisis del cliente (guardada como yyyy-mm-dd)
    const fechaAnlRaw = selectedClientData?.analysisDate || '';
    const fechaAdq = new Date(fechaAdqRaw + 'T00:00:00');
    const fechaAnl = /^\d{4}-\d{2}-\d{2}$/.test(fechaAnlRaw)
        ? new Date(fechaAnlRaw + 'T00:00:00')
        : new Date();

    const diffMs = fechaAnl - fechaAdq;
    if (diffMs <= 0) {
        resDom.style.display  = 'none';
        hintDom.textContent   = 'La fecha de adquisición debe ser anterior a la fecha de análisis';
        hintDom.style.display = 'block';
        return;
    }

    const anios        = diffMs / (365.25 * 24 * 3600 * 1000);
    const cagr         = Math.pow(valorActualCOP / valorAdqCOP, 1 / anios) - 1;
    const retornoTotal = (valorActualCOP / valorAdqCOP) - 1;

    const aniosEnt  = Math.floor(anios);
    const mesesRest = Math.round((anios - aniosEnt) * 12);
    const tiempoStr = aniosEnt + ' año' + (aniosEnt !== 1 ? 's' : '')
                    + (mesesRest > 0 ? ' ' + mesesRest + ' mes' + (mesesRest !== 1 ? 'es' : '') : '');

    const fmtPct = (v) => (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
    const clsMain = cagr >= 0 ? 'adq-row adq-main' : 'adq-row adq-main adq-neg';
    const clsTot  = retornoTotal >= 0 ? 'adq-row' : 'adq-row adq-neg';

    resDom.innerHTML = `
        <div class="${clsMain}">
            <span>Retorno anualizado (CAGR)</span>
            <strong>${fmtPct(cagr)} EA</strong>
        </div>
        <div class="adq-row">
            <span>Tiempo transcurrido</span>
            <strong style="color:#e2e8f0">${tiempoStr}</strong>
        </div>
        <div class="${clsTot}">
            <span>Retorno total</span>
            <strong>${fmtPct(retornoTotal)}</strong>
        </div>`;
    resDom.style.display  = 'block';
    hintDom.style.display = 'none';
}


// ── Seguro de pensión con ahorro — mostrar/ocultar grupo ──────────────────
const SUBTIPO_SEGURO_PENSION = 'Seguro de pensión con ahorro';

function toggleSeguroPensionGroup(subtype) {
    const grp = document.getElementById('seguro-pension-group');
    if (!grp) return;
    const visible = subtype === SUBTIPO_SEGURO_PENSION;
    grp.style.display = visible ? 'block' : 'none';
    if (!visible) {
        ['sp-entidad','sp-prima-mensual','sp-objetivo-ahorro',
         'sp-valor-asegurado','sp-valor-itp','sp-fecha-vencimiento']
            .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
        const itpNo = document.getElementById('sp-itp-no');
        if (itpNo) itpNo.checked = true;
        const itpGrp = document.getElementById('sp-itp-valor-group');
        if (itpGrp) itpGrp.style.display = 'none';
        const info = document.getElementById('sp-vence-info');
        if (info) { info.style.display = 'none'; info.textContent = ''; }
        const alin = document.getElementById('sp-alineacion');
        if (alin) { alin.style.display = 'none'; alin.textContent = ''; }
    } else {
        _renderSpInfo();
    }
}

function _renderSpInfo() {
    const fechaVencEl = document.getElementById('sp-fecha-vencimiento');
    const fechaVenc   = fechaVencEl?.value || '';
    const infoEl  = document.getElementById('sp-vence-info');
    const alinEl  = document.getElementById('sp-alineacion');
    if (!infoEl || !alinEl) return;

    if (!fechaVenc) {
        infoEl.style.display  = 'none';
        alinEl.style.display  = 'none';
        return;
    }

    const fechaAnlRaw = selectedClientData?.analysisDate || '';
    const fechaAnl = /^\d{4}-\d{2}-\d{2}$/.test(fechaAnlRaw)
        ? new Date(fechaAnlRaw + 'T00:00:00') : new Date();
    const fVenc = new Date(fechaVenc + 'T00:00:00');

    const aniosAlVenc = (fVenc - fechaAnl) / (365.25 * 24 * 3600 * 1000);
    const anioVencStr = fVenc.getFullYear();
    infoEl.textContent = 'Vence en ' + aniosAlVenc.toFixed(1) + ' años (' + anioVencStr + ')';
    infoEl.style.display = 'block';

    // Alineación con meta de independencia financiera
    const objLP = selectedClientData?.objetivosCliente?.largoPlayzo;
    if (objLP?.fechaObjetivo) {
        const fMeta = new Date(objLP.fechaObjetivo + 'T00:00:00');
        const difAnios = (fVenc - fMeta) / (365.25 * 24 * 3600 * 1000);
        let cls, msg;
        if (Math.abs(difAnios) <= 2) {
            cls = 'sp-alin-ok';
            msg = '✅ Alineado con la meta de independencia financiera';
        } else if (fVenc <= fMeta) {
            const a = Math.abs(difAnios).toFixed(1);
            cls = 'sp-alin-info';
            msg = '✅ Vence ' + a + ' años antes de la meta — capital disponible para reinvertir';
        } else {
            const a = difAnios.toFixed(1);
            cls = 'sp-alin-warn';
            msg = '⚠️ Vence ' + a + ' años después de la meta de independencia financiera';
        }
        alinEl.className = 'sp-alineacion ' + cls;
        alinEl.textContent = msg;
        alinEl.style.display = 'block';
    } else {
        alinEl.style.display = 'none';
    }
}

addAssetBtn?.addEventListener('click', () => {
    if (!selectedClientId) {
        showToast('Seleccione un cliente primero', 'error');
        return;
    }
    
    assetModal.classList.add('active');
    assetForm.reset();
    document.getElementById('asset-id').value = '';

    // Resetear selector de país y campo Otro
    setAssetLocation('');
    
    // Resetear subtipos
    document.getElementById('asset-subtype').innerHTML = '<option value="">Seleccionar tipo primero</option>';
    
    // Resetear toggle ingreso pasivo → No
    const generatesIncomeNo = document.getElementById('generates-income-no');
    if (generatesIncomeNo) generatesIncomeNo.checked = true;
    const monthlyIncomeGroup = document.getElementById('monthly-income-group');
    if (monthlyIncomeGroup) monthlyIncomeGroup.style.display = 'none';
    
    // Ocultar sector y limpiar select
    const sectorSection = document.getElementById('sector-section');
    if (sectorSection) sectorSection.style.display = 'none';
    const sectorSelReset = document.getElementById('asset-sector');
    if (sectorSelReset) sectorSelReset.value = '';
    
    // Ocultar hint de liquidez
    const hint = document.getElementById('liquidity-auto-hint');
    if (hint) hint.style.display = 'none';
    
    // Limpiar campos calculados
    const valorCOP = document.getElementById('asset-value-cop');
    const netWorth = document.getElementById('asset-net-worth-cop');
    if (valorCOP) valorCOP.value = '';
    if (netWorth) netWorth.value = '';

    // Limpiar campo cual
    const cual = document.getElementById('asset-which');
    if (cual) cual.value = '';

    // Ocultar seguro deudor y resetear a "No"
    const svdGroup = document.getElementById('seguro-deudor-group');
    if (svdGroup) svdGroup.style.display = 'none';
    const svdNo = document.getElementById('svd-no');
    if (svdNo) svdNo.checked = true;

    // Ocultar y limpiar rol empresarial
    const rolGroup = document.getElementById('rol-empresarial-group');
    if (rolGroup) rolGroup.style.display = 'none';
    document.querySelectorAll('input[name="rol-empresarial"]')
        .forEach(r => r.checked = false);

    // Ocultar y limpiar cartera gestionada
    const carteraGroupReset = document.getElementById('cartera-group');
    if (carteraGroupReset) carteraGroupReset.style.display = 'none';
    ['asset-gestor-entidad','asset-monto-accesible','asset-plazo-liquidacion']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });

    // Ocultar y limpiar adquisición
    toggleAdquisicionGroup('');

    // Ocultar y limpiar seguro pensión
    toggleSeguroPensionGroup('');

    assetModalTitle.textContent = 'Agregar Activo';
    saveAssetBtn.textContent = 'Guardar Activo';
});

// Mostrar/ocultar sección financiera según categoría


document.getElementById('close-asset-modal')?.addEventListener('click', () => assetModal.classList.remove('active'));
document.getElementById('cancel-asset-modal')?.addEventListener('click', () => assetModal.classList.remove('active'));

// Mostrar/ocultar campo "Otro" en el selector de país
document.getElementById('asset-location')?.addEventListener('change', function() {
    const otroGroup = document.getElementById('asset-location-otro-group');
    if (!otroGroup) return;
    otroGroup.style.display = this.value === 'Otro' ? 'block' : 'none';
    if (this.value !== 'Otro') {
        const otroInput = document.getElementById('asset-location-otro');
        if (otroInput) otroInput.value = '';
    }
});
assetModal?.addEventListener('click', (e) => {
    if (e.target === assetModal) assetModal.classList.remove('active');
});

// Mostrar/ocultar campo seguro deudor según si hay pasivo
document.getElementById('asset-liability')?.addEventListener('input', function() {
    const svdGroup = document.getElementById('seguro-deudor-group');
    if (!svdGroup) return;
    const val = parseFloat(this.value) || 0;
    svdGroup.style.display = val > 0 ? 'block' : 'none';
    if (val === 0) {
        const svdNo = document.getElementById('svd-no');
        if (svdNo) svdNo.checked = true;
    }
});

assetForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedClientId) return;
    
    const assetId = document.getElementById('asset-id').value;
    const generatesIncomeRadio = document.querySelector('input[name="generates-income"]:checked');
    const generatesIncome = generatesIncomeRadio ? generatesIncomeRadio.value === 'true' : false;
    
    const assetData = {
        clientId: selectedClientId,
        advisorId: currentUser.uid,
        
        // Identificación
        description: document.getElementById('asset-description').value,
        category: document.getElementById('asset-category').value,
        subtype: document.getElementById('asset-subtype').value,
        which: document.getElementById('asset-which')?.value || '',
        
        // Valoración
        value: parseFloat(document.getElementById('asset-value').value),
        currency: document.getElementById('asset-currency').value,
        liability: parseFloat(document.getElementById('asset-liability').value) || 0,
        liabilityRate: parseFloat(document.getElementById('asset-liability-rate')?.value) || 0,
        
        // Ubicación y protección
        location: readAssetLocation(),
        city: document.getElementById('asset-city')?.value || '',
        legalStructure: document.getElementById('asset-legal-structure').value,
        
        // Liquidez
        liquidity: document.getElementById('asset-liquidity').value,
        expectedReturn: parseFloat(document.getElementById('asset-expected-return')?.value) || 0,
        
        // Ingresos pasivos
        generatesIncome: generatesIncome,
        monthlyIncome: generatesIncome ? parseFloat(document.getElementById('asset-monthly-income').value) || 0 : 0,
        
        // Seguro vida deudor (solo relevante si hay pasivo)
        seguroVidaDeudor: (parseFloat(document.getElementById('asset-liability').value) || 0) > 0
            ? (document.querySelector('input[name="seguro-vida-deudor"]:checked')?.value || 'no')
            : 'no',
        
        // Sector
        sector: document.getElementById('asset-sector')?.value || '',
        ticker: document.getElementById('asset-ticker')?.value || '',

        // Rol empresarial (solo relevante para categoría Empresarial)
        rolEmpresarial: document.querySelector('input[name="rol-empresarial"]:checked')?.value || '',
        
        // Cartera gestionada por terceros
        gestorEntidad:        document.getElementById('asset-gestor-entidad')?.value || '',
        montoAccesible:       parseFloat(document.getElementById('asset-monto-accesible')?.value) || null,
        plazoLiquidacionDias: parseInt(document.getElementById('asset-plazo-liquidacion')?.value)  || null,

        // Adquisición (campos opcionales)
        valorAdquisicionCOP: parseFloat(document.getElementById('asset-valor-adquisicion')?.value) || null,
        fechaAdquisicion:    document.getElementById('asset-fecha-adquisicion')?.value || '',

        // Seguro de pensión con ahorro (campos específicos)
        entidadAseguradora:   document.getElementById('sp-entidad')?.value || '',
        objetivoAhorro:       parseFloat(document.getElementById('sp-objetivo-ahorro')?.value) || null,
        valorAseguradoActual: parseFloat(document.getElementById('sp-valor-asegurado')?.value) || null,
        incluyeITP:           document.querySelector('input[name="sp-incluye-itp"]:checked')?.value === 'si',
        valorAseguradoITP:    parseFloat(document.getElementById('sp-valor-itp')?.value) || null,
        fechaVencimiento:     document.getElementById('sp-fecha-vencimiento')?.value || '',
        primaMensual:         parseFloat(document.getElementById('sp-prima-mensual')?.value) || null,

        // Notas
        observations: document.getElementById('asset-observations')?.value || '',
        
        // Timestamp
        updatedAt: serverTimestamp()
    };

    
    try {
        saveAssetBtn.disabled = true;
        saveAssetBtn.textContent = 'Guardando...';
        
        if (assetId) {
            await updateDoc(doc(db, 'assets', assetId), assetData);
            showToast('Activo actualizado exitosamente', 'success');
        } else {
            assetData.createdAt = serverTimestamp();
            await addDoc(collection(db, 'assets'), assetData);
            showToast('Activo agregado exitosamente', 'success');
        }
        
        assetModal.classList.remove('active');
        loadAssetsTable();
        loadDashboardData();
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al guardar activo', 'error');
    } finally {
        saveAssetBtn.disabled = false;
        saveAssetBtn.textContent = assetId ? 'Actualizar Activo' : 'Guardar Activo';
    }
});

async function loadAssetsTable() {
    if (!selectedClientId) return;
    
    const tbody = document.getElementById('assets-tbody');
    if (!tbody) return;
    
    try {
        const assetsQuery = query(collection(db, 'assets'), where('clientId', '==', selectedClientId));
        const snapshot = await getDocs(assetsQuery);
        
        tbody.innerHTML = '';
        
        if (snapshot.empty) {
            tbody.innerHTML = `
                <tr class="empty-state">
                    <td colspan="8">
                        <div class="empty-message">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                            </svg>
                            <p>No hay activos registrados</p>
                            <button class="btn-secondary" onclick="document.getElementById('add-asset-btn').click()">Agregar Primer Activo</button>
                        </div>
                    </td>
                </tr>
            `;
            const tfoot = document.getElementById('assets-tfoot');
            if (tfoot) tfoot.style.display = 'none';
            return;
        }

        // Recopilar activos y calcular totales
        const assets = [];
        snapshot.forEach(docSnap => assets.push({ id: docSnap.id, ...docSnap.data() }));

        // ── Activar sección de tipos de cambio si hay monedas foráneas ──
        // (no await — se ejecuta en paralelo al renderizado)
        actualizarSeccionTRM();

        const fmtCOP_local = (n) => new Intl.NumberFormat('es-CO', {
            style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 0
        }).format(n);
        const fmtUSD_local = (n) => new Intl.NumberFormat('en-US', {
            style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0
        }).format(n);

        const liquidezBadge = (liq) => {
            const map = {
                'Alta': 'badge-green',
                'Media': 'badge-yellow',
                'Baja': 'badge-orange',
                'Ilíquida': 'badge-red'
            };
            return `<span class="badge ${map[liq] || 'badge-gray'}">${liq || '—'}</span>`;
        };

        let totalPatrimonioCOP = 0;
        let totalPatrimonioUSD = 0;
        let totalIngresosPasivos = 0;
        let totalActivosAlta = 0;
        let totalPatrimonioGeneradores = 0;
        let hayTRMFaltante = false;

        assets.forEach(asset => {
            const valorCOP  = convertirACOP(asset.value    || 0, asset.currency);
            const pasivoCOP = convertirACOP(asset.liability || 0, asset.currency);
            const trmFalta  = isNaN(valorCOP);

            let netoCOP = 0;
            if (!trmFalta) {
                netoCOP = valorCOP - (isNaN(pasivoCOP) ? 0 : pasivoCOP);
                totalPatrimonioCOP += netoCOP;
                const netoUSD = trmState.USD ? netoCOP / trmState.USD : 0;
                totalPatrimonioUSD += netoUSD;
                if (asset.liquidity === 'Alta') totalActivosAlta += netoCOP;
                if (asset.generatesIncome) totalPatrimonioGeneradores += netoCOP;
            } else {
                hayTRMFaltante = true;
            }

            const ingreso = asset.generatesIncome ? (asset.monthlyIncome || 0) : 0;
            totalIngresosPasivos += ingreso;

            const subtipo = asset.subtype || '';
            const cual = asset.which ? `<span class="asset-which">${asset.which}</span>` : '';
            const subtipoDisplay = subtipo ? `${subtipo}${cual ? '<br>' + cual : ''}` : (cual || '—');

            // Columna "Patrimonio neto COP": aviso si falta TRM
            const netoCOPCell = trmFalta
                ? `<span style="color:#dc2626;font-size:1rem;">⚠ Ingresa el tipo de cambio</span>`
                : `<span class="${netoCOP < 0 ? 'text-red' : ''}">${fmtCOP_local(netoCOP)}</span>`;

            // Cambio 5: para Seguro de pensión con ahorro, mostrar objetivo de ahorro con nota
            const esSeguroPension = asset.subtype === SUBTIPO_SEGURO_PENSION;
            const valorCeldaOriginal = esSeguroPension && asset.objetivoAhorro
                ? `<span>${fmtCOP_local(asset.objetivoAhorro)}</span><br><small style="color:#8892a4;font-size:1rem">Objetivo al vencimiento — ${asset.fechaVencimiento ? asset.fechaVencimiento.split('-')[0] : '—'}</small>`
                : formatCurrency(asset.value, asset.currency || 'COP');

            const row = document.createElement('tr');
            row.innerHTML = `
                <td><span class="badge badge-tipo badge-${(asset.category||'').toLowerCase().replace(' ','-')}">${asset.category || '—'}</span></td>
                <td class="td-subtipo">${subtipoDisplay}</td>
                <td>${asset.description || '—'}</td>
                <td>${valorCeldaOriginal}</td>
                <td>${netoCOPCell}</td>
                <td>${liquidezBadge(asset.liquidity)}</td>
                <td>${ingreso > 0 ? fmtCOP_local(ingreso) : '—'}</td>
                <td class="td-actions">
                    <button class="btn-icon" onclick="editAsset('${asset.id}')" title="Editar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                    </button>
                    <button class="btn-icon btn-icon-danger" onclick="deleteAsset('${asset.id}')" title="Eliminar">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                    </button>
                </td>
            `;
            tbody.appendChild(row);
        });

        // Actualizar fila de totales
        const tfoot = document.getElementById('assets-tfoot');
        if (tfoot) {
            tfoot.style.display = '';

            const gastosMensuales = selectedClientData?.monthlyExpenses || 0;
            const mesesLiquidez = gastosMensuales > 0
                ? (totalActivosAlta / gastosMensuales).toFixed(1)
                : '—';
            const pctGeneradores = totalPatrimonioCOP > 0
                ? ((totalPatrimonioGeneradores / totalPatrimonioCOP) * 100).toFixed(1)
                : 0;
            const metaGeneradores = parseFloat(pctGeneradores) >= 40;

            document.getElementById('total-patrimonio-cop').innerHTML =
                `<strong>${fmtCOP_local(totalPatrimonioCOP)}</strong>` +
                (hayTRMFaltante ? ' <span style="color:#dc2626;font-size:1rem;">⚠ activos sin TRM excluidos</span>' : '');
            document.getElementById('total-liquidez-meses').innerHTML =
                `<strong>${mesesLiquidez} meses</strong>`;
            document.getElementById('total-ingresos-pasivos').innerHTML =
                `<strong>${fmtCOP_local(totalIngresosPasivos)}/mes</strong>`;
            document.getElementById('total-patrimonio-usd').innerHTML =
                `<strong>≈ ${fmtUSD_local(totalPatrimonioUSD)}</strong>`;
            document.getElementById('total-pct-generadores').innerHTML =
                `<strong class="${metaGeneradores ? 'text-green' : 'text-red'}">${pctGeneradores}% generadores ${metaGeneradores ? '✓' : '⚠ meta: >40%'}</strong>`;

            // Pie de TRM
            renderPieTRM();
        }

    } catch (error) {
        console.error('Error loading assets:', error);
    }
}

window.editAsset = async function(assetId) {
    try {
        const assetDoc = await getDoc(doc(db, 'assets', assetId));
        if (assetDoc.exists()) {
            const asset = assetDoc.data();
            
            document.getElementById('asset-id').value = assetId;
            
            // Identificación
            document.getElementById('asset-description').value = asset.description || '';
            document.getElementById('asset-category').value = asset.category || '';
            document.getElementById('asset-which').value = asset.which || '';
            
            // Subtipos dinámicos (pasa liquidez para no sobreescribirla)
            actualizarSubtiposActivos(asset.category || '', asset.subtype || '', asset.liquidity || '');
            document.getElementById('asset-subtype').value = asset.subtype || '';
            
            // Valoración
            document.getElementById('asset-value').value = asset.value || 0;
            document.getElementById('asset-currency').value = asset.currency || 'COP';
            document.getElementById('asset-liability').value = asset.liability || 0;
            if (document.getElementById('asset-liability-rate'))
                document.getElementById('asset-liability-rate').value = asset.liabilityRate || 0;

            // Recalcular campos COP
            calcularValoresCOP();
            
            // Ubicación y protección
            setAssetLocation(asset.location || '');
            if (document.getElementById('asset-city'))
                document.getElementById('asset-city').value = asset.city || '';
            document.getElementById('asset-legal-structure').value = asset.legalStructure || 'Propiedad Directa';
            
            // Liquidez
            document.getElementById('asset-liquidity').value = asset.liquidity || 'Media';
            if (document.getElementById('asset-expected-return'))
                document.getElementById('asset-expected-return').value = asset.expectedReturn || 0;
            
            // Toggle ingreso pasivo
            const generatesIncome = asset.generatesIncome || false;
            const radioYes = document.getElementById('generates-income-yes');
            const radioNo = document.getElementById('generates-income-no');
            const incomeGroup = document.getElementById('monthly-income-group');
            if (generatesIncome) {
                if (radioYes) radioYes.checked = true;
                if (incomeGroup) incomeGroup.style.display = 'block';
                document.getElementById('asset-monthly-income').value = asset.monthlyIncome || 0;
            } else {
                if (radioNo) radioNo.checked = true;
                if (incomeGroup) incomeGroup.style.display = 'none';
            }
            
            // Sector (visible para Financiero con subtipos relevantes y Empresarial)
            toggleSectorSection(asset.category || '', asset.subtype || '');
            const sectorSel = document.getElementById('asset-sector');
            if (sectorSel) {
                // Migración: si el valor guardado es texto libre no reconocido → normalizar a opción
                sectorSel.value = normalizarSectorLegado(asset.sector || '');
            }
            if (document.getElementById('asset-ticker'))
                document.getElementById('asset-ticker').value = asset.ticker || '';

            // Rol empresarial (visible y poblado solo si categoría = Empresarial)
            const rolGroup = document.getElementById('rol-empresarial-group');
            if (rolGroup) {
                const esEmpresarial = asset.category === 'Empresarial';
                rolGroup.style.display = esEmpresarial ? 'block' : 'none';
                if (esEmpresarial && asset.rolEmpresarial) {
                    const rolRadio = document.querySelector(
                        `input[name="rol-empresarial"][value="${asset.rolEmpresarial}"]`
                    );
                    if (rolRadio) rolRadio.checked = true;
                } else {
                    document.querySelectorAll('input[name="rol-empresarial"]')
                        .forEach(r => r.checked = false);
                }
            }
            
            // Cartera gestionada — mostrar y poblar si aplica
            const esCarteraEdit = asset.subtype === 'Cartera gestionada por terceros';
            const carteraGroupEdit = document.getElementById('cartera-group');
            if (carteraGroupEdit) {
                carteraGroupEdit.style.display = esCarteraEdit ? 'block' : 'none';
                if (esCarteraEdit) {
                    const g = document.getElementById('asset-gestor-entidad');
                    const m = document.getElementById('asset-monto-accesible');
                    const p = document.getElementById('asset-plazo-liquidacion');
                    if (g) g.value = asset.gestorEntidad || '';
                    if (m) m.value = asset.montoAccesible != null ? asset.montoAccesible : '';
                    if (p) p.value = asset.plazoLiquidacionDias != null ? asset.plazoLiquidacionDias : '';
                }
            }

            // Adquisición — mostrar y poblar si aplica
            toggleAdquisicionGroup(asset.subtype || '');

            // Seguro de pensión con ahorro — mostrar y poblar si aplica
            toggleSeguroPensionGroup(asset.subtype || '');
            if (asset.subtype === SUBTIPO_SEGURO_PENSION) {
                const _sp = (id, val) => { const e = document.getElementById(id); if (e) e.value = val ?? ''; };
                _sp('sp-entidad',           asset.entidadAseguradora || '');
                _sp('sp-objetivo-ahorro',   asset.objetivoAhorro != null ? asset.objetivoAhorro : '');
                _sp('sp-valor-asegurado',   asset.valorAseguradoActual != null ? asset.valorAseguradoActual : '');
                _sp('sp-valor-itp',         asset.valorAseguradoITP != null ? asset.valorAseguradoITP : '');
                _sp('sp-fecha-vencimiento', asset.fechaVencimiento || '');
                _sp('sp-prima-mensual',     asset.primaMensual != null ? asset.primaMensual : '');
                const itpVal = asset.incluyeITP ? 'si' : 'no';
                const itpRadio = document.querySelector('input[name="sp-incluye-itp"][value="' + itpVal + '"]');
                if (itpRadio) itpRadio.checked = true;
                const itpGrp = document.getElementById('sp-itp-valor-group');
                if (itpGrp) itpGrp.style.display = asset.incluyeITP ? 'block' : 'none';
                _renderSpInfo();
            }
            const vaEl = document.getElementById('asset-valor-adquisicion');
            const faEl = document.getElementById('asset-fecha-adquisicion');
            if (vaEl) vaEl.value = asset.valorAdquisicionCOP != null ? asset.valorAdquisicionCOP : '';
            if (faEl) faEl.value = asset.fechaAdquisicion || '';
            _renderCAGR();

            // Ocultar hint de liquidez al editar
            const hint = document.getElementById('liquidity-auto-hint');
            if (hint) hint.style.display = 'none';
            
            // Notas
            if (document.getElementById('asset-observations'))
                document.getElementById('asset-observations').value = asset.observations || '';

            // Seguro vida deudor — mostrar solo si hay pasivo
            const svdGroup = document.getElementById('seguro-deudor-group');
            if (svdGroup) {
                const pasivo = parseFloat(asset.liability) || 0;
                svdGroup.style.display = pasivo > 0 ? 'block' : 'none';
                const svdVal = asset.seguroVidaDeudor || 'no';
                const svdRadio = document.querySelector(`input[name="seguro-vida-deudor"][value="${svdVal}"]`);
                if (svdRadio) svdRadio.checked = true;
            }
            
            assetModalTitle.textContent = 'Editar Activo';
            saveAssetBtn.textContent = 'Actualizar Activo';
            assetModal.classList.add('active');
        }
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al cargar activo', 'error');
    }
};

// Delete Modal
const deleteModal = document.getElementById('delete-modal');
document.getElementById('close-delete-modal')?.addEventListener('click', () => {
    deleteModal.classList.remove('active');
    deleteCallback = null;
});
document.getElementById('cancel-delete')?.addEventListener('click', () => {
    deleteModal.classList.remove('active');
    deleteCallback = null;
});
document.getElementById('confirm-delete')?.addEventListener('click', async () => {
    if (deleteCallback) {
        await deleteCallback();
        deleteModal.classList.remove('active');
        deleteCallback = null;
    }
});
deleteModal?.addEventListener('click', (e) => {
    if (e.target === deleteModal) {
        deleteModal.classList.remove('active');
        deleteCallback = null;
    }
});

window.deleteAsset = async function(assetId) {
    deleteCallback = async () => {
        try {
            await deleteDoc(doc(db, 'assets', assetId));
            showToast('Activo eliminado', 'success');
            loadAssetsTable();
            loadDashboardData();
        } catch (error) {
            console.error('Error:', error);
            showToast('Error al eliminar', 'error');
        }
    };
    deleteModal.classList.add('active');
};

// Client Info Form
const clientInfoForm = document.getElementById('client-info-form');
clientInfoForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedClientId) return;
    
    const data = {
        name: document.getElementById('client-name').value,
        elaborationDate: document.getElementById('elaboration-date').value,
        updatedAt: serverTimestamp()
    };
    
    try {
        await setDoc(doc(db, 'patrimonio', selectedClientId), data, { merge: true });
        showToast('Información guardada', 'success');
    } catch (error) {
        console.error('Error:', error);
        showToast('Error al guardar', 'error');
    }
});

// ═══════════════════════════════════════════════════════════════════════
//  EVALUACIÓN 4 CAPAS — motor completo
//  Persistencia: clients/{clientId}.evaluacion4capas en Firestore
// ═══════════════════════════════════════════════════════════════════════

// ── Semáforo ─────────────────────────────────────────────────────────
function c4Semaforo(score) {
    if (score >= 9.0) return { cls: 'excelente',  label: 'EXCELENTE' };
    if (score >= 7.5) return { cls: 'muybueno',   label: 'MUY BUENO' };
    if (score >= 6.0) return { cls: 'aceptable',  label: 'ACEPTABLE' };
    if (score >= 4.0) return { cls: 'deficiente', label: 'DEFICIENTE' };
    return                    { cls: 'critico',   label: 'CRÍTICO' };
}

// ── Formateo COP local ────────────────────────────────────────────────
const c4cop = n => new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP',
    minimumFractionDigits: 0, maximumFractionDigits: 0
}).format(n || 0);

// ── Leer activos del cliente desde Firestore ──────────────────────────
async function c4GetActivos() {
    if (!selectedClientId) return [];
    const snap = await getDocs(query(
        collection(db, 'assets'),
        where('clientId', '==', selectedClientId)
    ));
    const list = [];
    snap.forEach(d => list.push({ id: d.id, ...d.data() }));
    return list;
}


// ── Calcular métricas automáticas desde activos ───────────────────────
// ── Función reutilizable: ingresos pasivos que sobreviven al cliente ──────
// Usada tanto por C1 (seguro de vida) como por C2 (seguro de invalidez).
// Recibe el array de activos y devuelve la suma mensual en COP de los
// ingresos pasivos cuyos subtipos se heredan / sobreviven al fallecimiento.
function calcularIngresosPasivosSobrevivientes(activos) {
    const SUBTIPOS_SOBREVIVEN = new Set([
        'Casa o apartamento arrendado',
        'Local bodega u oficina comercial',
        'Acciones en bolsa',
        'ETF o fondo de inversión internacional',
        'Fondo de inversión colectiva FIC',
        'Bonos o títulos de deuda',
        'REIT',
        'CDT',
        'Cuenta de alto rendimiento',
    ]);
    let total = 0;
    (activos || []).forEach(a => {
        if (a.generatesIncome && (parseFloat(a.monthlyIncome) || 0) > 0) {
            const sub = a.subtype || '';
            if (SUBTIPOS_SOBREVIVEN.has(sub)) {
                total += parseFloat(a.monthlyIncome) || 0;
            }
        }
    });
    return total;
}

function c4Metricas(activos, gastosMes) {
    let altaLiqCOP = 0;
    let patriCOP   = 0;
    let pasivosTotalCOP = 0;
    const tipos   = new Set();
    const monedas = new Set();
    const paises  = new Set();
    let inmuRenta = 0;

    // Capa 2: listas detalladas
    let ingPasivoTotalCOP = 0;   // TODOS los ingresos pasivos (mensual)
    let liquidezMediaCOP  = 0;   // activos media liq estratégicos
    const activosAltaLiq  = [];  // { name, subtype, neto, currency }
    const activosSemiLiq  = [];  // { name, subtype, neto, montoAccesible, plazoLiqDias }

    // Para Capa 1
    const activosEmpresariales = [];
    const inmueblesArrendados  = [];
    const vehiculosTrabajo     = [];
    const activosConEstructura = [];

    // Capa 3 — Crecimiento
    const segurosConPension = [];
    const SUBTIPOS_LIQUIDEZ_C3 = new Set([
        'Cuenta bancaria corriente o ahorros',
        'Cuenta de alto rendimiento',
        'Efectivo en caja',
        'Fondo de liquidez o Fiducia',
    ]);
    const SUBTIPOS_RESIDENCIA_C3 = new Set([
        'Casa o apartamento donde vivo',
    ]);
    const activosInversion  = [];   // Financiero inv. + Inmuebles productivos + Alternativos productivos
    let   valorIntlCOP      = 0;    // activos internacionales (no Colombia)
    let   valorRiesgoAlto   = 0;    // pctRiesgoAlto numerador
    const inmueblesRentaC3  = [];   // inmuebles productivos detallados
    const RIESGO_ALTO_SUBS  = new Set([
        'Acciones en bolsa', 'ETF o fondo de inversión internacional',
        'REIT', 'Cartera gestionada por terceros',
        'Mi empresa o negocio', 'Sociedad con socios',
        'Acciones en empresa privada',
    ]);

    // C1: ingresos pasivos que SÍ sobreviven al cliente
    // La lista canónica de subtipos vive en calcularIngresosPasivosSobrevivientes().
    // Aquí la replicamos solo para clasificar el detalle de UI (etiquetas ✅/❌/⚠️).
    const SUBTIPOS_SOBREVIVEN = new Set([
        'Casa o apartamento arrendado',
        'Local bodega u oficina comercial',
        'Acciones en bolsa',
        'ETF o fondo de inversión internacional',
        'Fondo de inversión colectiva FIC',
        'Bonos o títulos de deuda',
        'REIT',
        'CDT',
        'Cuenta de alto rendimiento',
    ]);
    // Subtipos que NO sobreviven (o son inciertos — se muestran pero no se suman)
    const SUBTIPOS_NO_SOBREVIVEN = new Set([
        'Mi empresa o negocio',
        'Sociedad con socios',
        'Acciones en empresa privada',
        'Seguro de pensión con ahorro',
    ]);
    // Subtipos inciertos → el asesor decide manualmente
    const SUBTIPOS_INCIERTOS = new Set([
        'Regalías derechos o patentes',
    ]);

    // C1: listas para UI
    const ingPasivosDetalle = [];   // todos los que generan ingreso
    // La suma canónica de sobrevivientes la calcula la función reutilizable
    // (se usa también en C2). Se rellena al final del forEach.
    let   ingPasivosSobrevCOP = 0;  // se asignará tras el forEach

    // C1: pasivos cubiertos / no cubiertos
    const pasivosIncluidos  = [];   // se suman a la cobertura requerida
    const pasivosExcluidos  = [];   // no se suman (seguro deudor o categoría)
    let   pasivosNoCubCOP   = 0;

    // C1: detectar Seguro de pensión con ahorro
    let tieneSkandiaCP = false;

    // Categorías cuyos pasivos se extinguen con la muerte
    const CATS_PASIVO_SE_EXTINGUE = new Set(['Financiero', 'Uso Personal']);

    activos.forEach(a => {
        const val  = parseFloat(a.value)    || 0;
        const pas  = parseFloat(a.liability) || 0;
        const mon  = a.currency || 'COP';
        const vCOP = convertirACOP(val,  mon);
        const pCOP = convertirACOP(pas,  mon);
        if (isNaN(vCOP)) return;
        const neto = vCOP - (isNaN(pCOP) ? 0 : pCOP);
        patriCOP        += neto;
        pasivosTotalCOP += isNaN(pCOP) ? 0 : pCOP;
        if (a.liquidity === 'Alta') altaLiqCOP += neto;
        if (a.category) tipos.add(a.category);

        // Capa 2: ingresos pasivos TOTALES
        if (a.generatesIncome && (parseFloat(a.monthlyIncome) || 0) > 0) {
            ingPasivoTotalCOP += parseFloat(a.monthlyIncome) || 0;
        }

        // Capa 2: activos Alta liquidez (excluir Uso Personal)
        if (a.liquidity === 'Alta' && a.category !== 'Uso Personal') {
            activosAltaLiq.push({
                name:     a.description || a.subtype || 'Activo',
                subtype:  a.subtype || '',
                neto,
            });
        }

        // Capa 2: activos semilíquidos estratégicos
        // Media liquidez, excluir Uso Personal, excluir Carro/moto/vehículo personal
        if (a.liquidity === 'Media'
            && a.category !== 'Uso Personal'
            && a.subtype  !== 'Carro moto o vehículo personal') {
            const esCartera = a.subtype === 'Cartera gestionada por terceros';
            const montoAcc  = esCartera && a.montoAccesible != null
                                ? parseFloat(a.montoAccesible) || 0
                                : neto;
            liquidezMediaCOP += montoAcc;
            activosSemiLiq.push({
                name:          a.description || a.subtype || 'Activo',
                subtype:       a.subtype || '',
                neto,
                montoAccesible: esCartera ? (parseFloat(a.montoAccesible) || null) : null,
                plazoLiqDias:  a.plazoLiquidacionDias || null,
            });
        }
        monedas.add(mon);
        if (a.location && a.location.trim()) paises.add(a.location.trim());
        if (a.category === 'Inmueble' && a.generatesIncome) inmuRenta++;

        // ── Capa 3: activos de inversión (Financiero + Inmuebles prod. + Alternativos prod.) ──
        const _esFinancieroInv   = a.category === 'Financiero' && !SUBTIPOS_LIQUIDEZ_C3.has(a.subtype)
                                   && a.subtype !== SUBTIPO_SEGURO_PENSION;  // excluir — no flujo retirable
        const _esInmuebleProd    = a.category === 'Inmueble'   && !SUBTIPOS_RESIDENCIA_C3.has(a.subtype)
                                   && a.generatesIncome && (parseFloat(a.monthlyIncome) || 0) > 0;
        const _esAlternativoProd = a.category === 'Alternativo' && a.generatesIncome
                                   && (parseFloat(a.monthlyIncome) || 0) > 0;
        if (_esFinancieroInv || _esInmuebleProd || _esAlternativoProd) {
            activosInversion.push({
                id:                  a.id || '',
                name:                a.description || a.subtype || 'Activo',
                category:            a.category || '',
                subtype:             a.subtype || '',
                location:            a.location || '',
                neto,
                valorAdquisicionCOP: parseFloat(a.valorAdquisicionCOP) || null,
                fechaAdquisicion:    a.fechaAdquisicion || '',
                generatesIncome:     a.generatesIncome || false,
                monthlyIncome:       parseFloat(a.monthlyIncome) || 0,
            });
            if ((a.location || '').trim() !== 'Colombia' && (a.location || '').trim() !== '') {
                valorIntlCOP += neto;
            }
            if (RIESGO_ALTO_SUBS.has(a.subtype)) valorRiesgoAlto += neto;
        }
        // Capa 3: % riesgo alto en TODA la cartera (incluye empresarial)
        if (a.category === 'Empresarial') valorRiesgoAlto += neto;

        // Capa 3: inmuebles productivos
        if (a.category === 'Inmueble'
            && (a.subtype === 'Casa o apartamento arrendado'
                || a.subtype === 'Local bodega u oficina comercial')
            && a.generatesIncome
            && (parseFloat(a.monthlyIncome) || 0) > 0) {
            const rentaMes = parseFloat(a.monthlyIncome) || 0;
            inmueblesRentaC3.push({
                name:      a.description || a.subtype || 'Inmueble',
                neto,
                rentaMes,
                capRate:   neto > 0 ? (rentaMes * 12 / neto) * 100 : 0,
            });
        }

        // Skandia CP
        // Seguro de pensión con ahorro
        if (a.subtype === SUBTIPO_SEGURO_PENSION) {
            tieneSkandiaCP = true;
            segurosConPension.push({
                name:                a.description || a.subtype || 'Seguro',
                objetivoAhorro:      parseFloat(a.objetivoAhorro) || 0,
                fechaVencimiento:    a.fechaVencimiento || '',
                valorAseguradoActual:parseFloat(a.valorAseguradoActual) || 0,
                incluyeITP:          a.incluyeITP || false,
                valorAseguradoITP:   parseFloat(a.valorAseguradoITP) || 0,
                neto,
            });
        }

        // RC: activosEmpresariales
        if (a.category === 'Empresarial') {
            activosEmpresariales.push({
                id:             a.id || '',
                name:           a.description || a.subtype || 'Empresa',
                vCOP,
                neto,
                rolEmpresarial: a.rolEmpresarial || '',
            });
        }
        // RC: inmuebles arrendados
        const sub = a.subtype || '';
        if (a.category === 'Inmueble' &&
            (sub === 'Casa o apartamento arrendado' || sub === 'Local bodega u oficina comercial')) {
            inmueblesArrendados.push({ name: a.description || sub, vCOP, neto });
        }
        // RC: vehículos de trabajo
        if (sub === 'Vehículo de trabajo') {
            vehiculosTrabajo.push({ name: a.description || 'Vehículo de trabajo', vCOP, neto });
        }
        // Estructuras de protección
        const leg = a.legalStructure || '';
        if (leg && leg !== 'Propiedad Directa' && neto > 0) {
            activosConEstructura.push({ name: a.description || 'Activo', leg, country: a.country || '—', neto });
        }

        // ── C1: Ingresos pasivos sobrevivientes ──
        if (a.generatesIncome && (parseFloat(a.monthlyIncome) || 0) > 0) {
            const ingMensCOP = parseFloat(a.monthlyIncome) || 0;
            const sobrevive  = SUBTIPOS_SOBREVIVEN.has(sub);
            const incierto   = SUBTIPOS_INCIERTOS.has(sub);
            const noSobrevive= SUBTIPOS_NO_SOBREVIVEN.has(sub) || (!sobrevive && !incierto);
            ingPasivosDetalle.push({
                name:       a.description || sub || 'Activo',
                subtype:    sub,
                ingMensCOP,
                sobrevive,
                incierto,
                noSobrevive,
            });
            if (sobrevive) ingPasivosSobrevCOP += ingMensCOP;
        }

        // ── C1: Pasivos cubiertos/no cubiertos ──
        if ((isNaN(pCOP) ? 0 : pCOP) > 0) {
            const tieneSegDeudor = (a.seguroVidaDeudor === 'si');
            const seExtingue     = CATS_PASIVO_SE_EXTINGUE.has(a.category);
            const nombre = a.description || sub || 'Pasivo';
            if (tieneSegDeudor) {
                pasivosExcluidos.push({ nombre, pCOP: isNaN(pCOP)?0:pCOP, razon: 'tiene seguro deudor' });
            } else if (seExtingue) {
                pasivosExcluidos.push({ nombre, pCOP: isNaN(pCOP)?0:pCOP, razon: 'se extingue con la muerte' });
            } else {
                // Incluir: Empresarial, Inmueble sin seguro, Alternativo
                pasivosIncluidos.push({ nombre, pCOP: isNaN(pCOP)?0:pCOP });
                pasivosNoCubCOP += (isNaN(pCOP) ? 0 : pCOP);
            }
        }
    });

    const mesesLiq     = gastosMes > 0 ? altaLiqCOP / gastosMes : 0;
    const pctLiq       = patriCOP  > 0 ? (altaLiqCOP / patriCOP) * 100 : 0;
    // Solo estructuras reales de protección (no Sociedad Comercial, no Propiedad Directa)
    const ESTRUC_REALES_PROT = new Set(['Trust','Fideicomiso','Fundación','Holding','LLC']);
    const patriProtCOP = activosConEstructura
        .filter(x => ESTRUC_REALES_PROT.has(x.leg))
        .reduce((s, x) => s + x.neto, 0);
    const pctProtegido = patriCOP > 0 ? (patriProtCOP / patriCOP) * 100 : 0;

    const ret = {
        mesesLiq, pctLiq, patriCOP, altaLiqCOP, pasivosTotalCOP,
        tipos, monedas, paises, inmuRenta,
        activosEmpresariales, inmueblesArrendados, vehiculosTrabajo,
        activosConEstructura, pctProtegido,
        // C1 enriquecido
        ingPasivosDetalle, ingPasivosSobrevCOP,
        pasivosIncluidos, pasivosExcluidos, pasivosNoCubCOP,
        tieneSkandiaCP,
        // Capa 2
        ingPasivoTotalCOP, liquidezMediaCOP, activosAltaLiq, activosSemiLiq,
        // Capa 3
        activosInversion, valorIntlCOP, valorRiesgoAlto, inmueblesRentaC3,
        segurosConPension,
    };
    ret.portafolioProductivoCOP = calcularValorPortafolioProductivoCOP(activos);
    return ret;
}

// ── Motor de puntaje ──────────────────────────────────────────────────
function c4Score(capa, resp, met, gastosMes, clientData) {
    let pts = 0;

    if (capa === 'proteccion') {
        // C1: Seguro de vida — usa los nuevos campos
        const cobTrad      = parseFloat(resp.cobVidaTrad) || 0;
        const cobSkandiaCP = parseFloat(resp.sumAseguradaSkandiaCP) || 0;
        const actVida      = cobTrad + cobSkandiaCP;
        // Para el score necesitamos la cobertura requerida; usamos los ajustes si existen
        const reqVida = c1ReqVida(met, gastosMes, clientData,
            resp.ingPasivosAjuste, resp.pasivosNoCubAjuste);
        if (actVida >= reqVida && actVida > 0)  pts += 3;
        else if (actVida > 0)                   pts += 1.5;

        // C2: Seguro de invalidez
        const actInv = parseFloat(resp.cobInvalidez) || 0;
        const reqInv = c1ReqInvalidez(gastosMes, clientData, met);
        if (actInv >= reqInv && actInv > 0)        pts += 2;
        else if (actInv > 0)                       pts += 1;

        // C3: RC — puntaje proporcional a RC adecuadas (max 2 pts)
        // Los items noAplica (ej: socio sin cargo) no cuentan en el denominador
        const rcItems = c1BuildRCItems(met, gastosMes, clientData);
        const rcItemsAplicables = rcItems.filter(item => !item.noAplica);
        if (rcItemsAplicables.length > 0) {
            let adecuadas = 0;
            rcItemsAplicables.forEach((item, i) => {
                const actual = parseFloat((resp.rc || {})[`rc_${i}`]) || 0;
                if (actual >= item.recomendada && actual > 0) adecuadas++;
            });
            pts += parseFloat(((adecuadas / rcItemsAplicables.length) * 2).toFixed(2));
        } else if (rcItems.length > 0) {
            // Todos son noAplica — RC está cubierta por estructura (2 pts completos)
            pts += 2;
        }

        // C4: Estructuras de protección patrimonial
        // Sociedad Comercial NO cuenta — es forma jurídica operativa, no vehículo de protección
        const ESTRUC_FUERTE = ['Trust', 'Fideicomiso', 'Fundación'];
        const ESTRUC_MEDIA  = ['Holding', 'LLC'];
        const tieneTrustFid = met.activosConEstructura.some(a => ESTRUC_FUERTE.includes(a.leg));
        const tieneHolding  = met.activosConEstructura.some(a => ESTRUC_MEDIA.includes(a.leg));
        if (tieneTrustFid)   pts += 2;
        else if (tieneHolding) pts += 1;

        // C5: Separación patrimonio — puntaje calculado desde respuestas detalladas por activo
        // Solo aplica si hay activos con rol representante_legal o propietario_natural
        pts += c5ScoreFromGuardado(resp.separacionPatrimonial, met);

        // C6: Planificación sucesoria — score normalizado 0-5 pts
        const c6norm = c6ScoreFromResp(resp.planificacionSucesoria, met, clientData);
        pts += c6norm;
        console.log('[Capa1] scores individuales:', {
            C1_vida: parseFloat((resp.cobVidaTrad||0)) > 0 ? 'evaluado' : 'sin datos',
            C4_estructuras: met.activosConEstructura.filter(a=>['Trust','Fideicomiso','Fundación','Holding','LLC'].includes(a.leg)).length + ' activos protegidos',
            C6_sucesoria: c6norm,
            total_pts_acumulado: pts
        });
    }

    if (capa === 'liquidez') {
        const tipoIngS     = (clientData?.tipoIngresosActivos || '').toLowerCase();
        const metaMS       = tipoIngS === 'empleado' ? 6 : 9;
        const defMensual   = Math.max(0, gastosMes - (met.ingPasivoTotalCOP || 0));
        const liqAlta      = met.altaLiqCOP || 0;
        const liqMedia     = met.liquidezMediaCOP || 0;
        const patriTotal   = met.patriCOP || 0;
        let   bruto        = 0;

        // C1 — Fondo de emergencia (3pts)
        if (defMensual > 0) {
            const mesesCub = liqAlta / defMensual;
            if (mesesCub >= metaMS) bruto += 3;
            else if (mesesCub >= 3) bruto += 2;
        } else if (liqAlta > 0) {
            bruto += 3;
        }

        // C2 — Reserva de oportunidad (2pts)
        const excedente = Math.max(0, liqAlta - defMensual * metaMS);
        if (defMensual > 0) {
            const mesesExc = excedente / defMensual;
            if (mesesExc >= 3)      bruto += 2;
            else if (mesesExc >= 1) bruto += 1;
        } else if (excedente > 0) {
            bruto += 2;
        }

        // C3 — Activos semilíquidos estratégicos (3pts)
        if (defMensual > 0 && liqMedia > 0) {
            const mesesSemi = liqMedia / defMensual;
            if (mesesSemi >= 12)     bruto += 3;
            else if (mesesSemi >= 6) bruto += 2;
            else if (mesesSemi >= 3) bruto += 1;
        } else if (liqMedia > 0) {
            bruto += 3;
        }

        // C4 — % liquidez sobre patrimonio (1pt)
        const pctLiq2 = patriTotal > 0 ? (liqAlta / patriTotal) * 100 : 0;
        if (pctLiq2 >= 10 && pctLiq2 <= 15)                                        bruto += 1;
        else if ((pctLiq2 >= 5 && pctLiq2 < 10)||(pctLiq2 > 15 && pctLiq2 <= 20)) bruto += 0.5;

        // Normalizar: máx bruto = 9 → escalar a 10
        pts = parseFloat(((bruto / 9) * 10).toFixed(1));
    }

    if (capa === 'crecimiento') {
        // C1 — Portafolio de inversión (3pts)
        const patriC3  = met.patriCOP || 0;
        const actInv   = met.activosInversion || [];
        const valPort  = actInv.reduce((s, a) => s + a.neto, 0);
        const pctPort  = patriC3 > 0 ? valPort / patriC3 * 100 : 0;
        const tiposInv = new Set(actInv.map(a => a.category)).size;  // tipos = categorías
        const paisesInv= new Set(actInv.filter(a => a.location).map(a => a.location)).size;
        let ptA = 0;
        if (pctPort >= 30)       ptA = 1;
        else if (pctPort >= 15)  ptA = 0.5;
        let ptB = 0;
        if (tiposInv >= 3 && paisesInv >= 2)       ptB = 1;
        else if (tiposInv >= 2 || paisesInv >= 2)  ptB = 0.5;
        const perfil   = (clientData?.riskProfile || '').toUpperCase();
        const horizonte= (clientData?.investmentHorizon || '');
        const pctRiesgo= patriC3 > 0 ? (met.valorRiesgoAlto || 0) / patriC3 * 100 : 0;
        let alineado = false;
        if (perfil === 'CONSERVADOR' && pctRiesgo < 20) alineado = true;
        else if (perfil === 'MODERADO' && pctRiesgo >= 20 && pctRiesgo <= 50) alineado = true;
        else if (perfil === 'AGRESIVO' && pctRiesgo > 50) alineado = true;
        if (horizonte === 'Corto' && pctRiesgo > 30) alineado = false;
        const ptC = alineado ? 1 : 0;
        pts += ptA + ptB + ptC;

        // C2 — Exposición internacional (2pts)
        const valIntl  = met.valorIntlCOP || 0;
        const pctIntl  = patriC3 > 0 ? valIntl / patriC3 * 100 : 0;
        if (pctIntl >= 20)       pts += 2;
        else if (pctIntl >= 10)  pts += 1;

        // C3 — Inmuebles productivos (2pts)
        const inmuR    = met.inmueblesRentaC3 || [];
        const sumInmu  = inmuR.reduce((s, i) => s + i.neto, 0);
        const capPond  = sumInmu > 0
            ? inmuR.reduce((s, i) => s + i.rentaMes * 12 / sumInmu * 100 * (i.neto / sumInmu), 0) * sumInmu / sumInmu
            : 0;
        const capRatePond = sumInmu > 0
            ? inmuR.reduce((s, i) => s + (i.rentaMes * 12 / i.neto * 100) * (i.neto / sumInmu), 0)
            : 0;
        if (inmuR.length >= 2 && capRatePond >= 5)       pts += 2;
        else if (inmuR.length >= 1 && capRatePond >= 4)  pts += 1;
        else if (inmuR.length >= 1 && capRatePond < 4)   pts += 0.5;

        // C4 — Negocios escalables (2pts) — input del asesor
        const empAplic = (met.activosEmpresariales || []).filter(e =>
            e.rolEmpresarial === 'representante_legal' || e.rolEmpresarial === 'propietario_natural'
        );
        const negRespMap = resp.negociosEscalables || {};
        if (empAplic.length > 0) {
            const valMap = { alto: 1, medio: 0.5, bajo: 0 };
            let sumScore = 0, sumVal = 0;
            empAplic.forEach(e => {
                const r = negRespMap[e.id] || {};
                const sc = (valMap[r.modeloIngresos] || 0) * 0.40
                    + (valMap[r.estructuraOperativa] || 0) * 0.30
                    + (valMap[r.potencialCrecimiento] || 0) * 0.20
                    + (valMap[r.diversificacionClientes] || 0) * 0.10;
                sumScore += sc * e.neto;
                sumVal   += e.neto;
            });
            const scEsc = sumVal > 0 ? sumScore / sumVal : 0;
            pts += parseFloat((scEsc * 2).toFixed(2));
        }

        // C5 — Retorno del portafolio (1pt)
        const fechaAnlRaw = clientData?.analysisDate || '';
        const fechaAnl = /^\d{4}-\d{2}-\d{2}$/.test(fechaAnlRaw)
            ? new Date(fechaAnlRaw + 'T00:00:00') : new Date();
        const activosConCAGR = actInv.filter(a =>
            a.valorAdquisicionCOP > 0 && a.fechaAdquisicion
            && a.subtype !== SUBTIPO_SEGURO_PENSION
        );
        let cagrPond = null;
        if (activosConCAGR.length > 0) {
            let sumW = 0, sumV = 0;
            activosConCAGR.forEach(a => {
                const fa   = new Date(a.fechaAdquisicion + 'T00:00:00');
                const diff = fechaAnl - fa;
                if (diff <= 0) return;
                const anios = diff / (365.25 * 24 * 3600 * 1000);
                if (anios < 0.1) return;
                const cagr = Math.pow(a.neto / a.valorAdquisicionCOP, 1 / anios) - 1;
                sumW += cagr * a.neto;
                sumV += a.neto;
            });
            if (sumV > 0) cagrPond = sumW / sumV;
        }
        const pctConCAGR = actInv.length > 0
            ? activosConCAGR.length / actInv.length * 100 : 0;
        let tasaEvaluar = null;
        if (pctConCAGR >= 50 && cagrPond !== null) {
            tasaEvaluar = cagrPond * 100;
        } else if (resp.retornoEstimadoAsesor != null && resp.retornoEstimadoAsesor !== '') {
            tasaEvaluar = parseFloat(resp.retornoEstimadoAsesor) || null;
        }
        if (tasaEvaluar !== null) {
            if (tasaEvaluar > 10)        pts += 1;
            else if (tasaEvaluar >= 8)   pts += 0.75;
            else if (tasaEvaluar >= 5)   pts += 0.5;
        }

        // C6 — Alineación con objetivos (1pt)
        pts += c3ScoreC6(clientData, met, gastosMes);

        // Normalizar sobre 10 (max bruto = 11)
        return parseFloat(Math.min(10, (pts / 11) * 10).toFixed(1));
    }

    if (capa === 'diversificacion') {
        // Capa 4 completamente automática — delegamos a c4dScores
        // resp no se usa, todo viene del mapa de activos via met
        // Para que funcione necesitamos los activos raw; los pasamos en met._activos (si disponibles)
        // Si no disponibles, usamos la lógica legacy basada en met.tipos/monedas/paises
        if (met._activos && clientData) {
            const d4 = c4dCalcularMetricas(met._activos, gastosMes, clientData);
            const s4 = c4dScores(d4);
            pts = s4.final;  // ya normalizado sobre 10
        } else {
            // Fallback legacy
            const nt = met.tipos.size;
            if (nt >= 4)      pts += 2;
            else if (nt >= 2) pts += 1;
            const nm = met.monedas.size;
            if (nm >= 3)      pts += 2;
            else if (nm >= 2) pts += 1;
            const np = met.paises.size;
            if (np >= 3)      pts += 2;
            else if (np >= 2) pts += 1;
        }
    }

    return Math.min(parseFloat(pts.toFixed(1)), 10);
}

// ── Helpers de cálculo Capa 1 ─────────────────────────────────────────

// Calcula el ingreso mensual a reemplazar según los ingresos pasivos que sobreviven
// y el ajuste manual del asesor (ingPasivosAjuste)
function c1IngresoReemplazar(gastosMes, met, ingPasivosAjuste) {
    const sobrev = (ingPasivosAjuste !== null && ingPasivosAjuste !== undefined && ingPasivosAjuste !== '')
        ? (parseFloat(ingPasivosAjuste) || 0)
        : (met.ingPasivosSobrevCOP || 0);
    return Math.max(0, gastosMes - sobrev);
}

// Calcula la cobertura requerida total
function c1ReqVida(met, gastosMes, cd, ingPasivosAjuste, pasivosNoCubAjuste) {
    const ingresoAReemplazar = c1IngresoReemplazar(gastosMes, met, ingPasivosAjuste);
    const pasivosNoCub = (pasivosNoCubAjuste !== null && pasivosNoCubAjuste !== undefined && pasivosNoCubAjuste !== '')
        ? (parseFloat(pasivosNoCubAjuste) || 0)
        : (met.pasivosNoCubCOP || 0);
    const educacion = parseFloat(cd?.educationCosts) || 0;
    return (ingresoAReemplazar * 12 * 10) + pasivosNoCub + educacion;
}

function c1ReqInvalidez(gastosMes, cd, met) {
    const edad       = parseInt(cd?.age) || 40;
    const aniosProd  = Math.max(0, 65 - edad);
    const ingActivo  = parseFloat(cd?.monthlyActiveIncome) || 0;
    // Usar ingresos pasivos que SÍ sobreviven (misma lógica que C1 seguro de vida)
    const ingPasivosSobrev = parseFloat(met?.ingPasivosSobrevCOP) || 0;
    const aReemplazar = Math.max(0, ingActivo - ingPasivosSobrev);
    return aReemplazar * 12 * aniosProd;
}

function c1BuildRCItems(met, gastosMes, cd) {
    const items = [];

    (met.activosEmpresariales || []).forEach(a => {
        const rol = a.rolEmpresarial || '';

        if (rol === 'socio') {
            // Responsabilidad limitada al aporte — no genera RC automática
            // Se registra como informativo pero sin cobertura recomendada
            items.push({
                label:       `Empresa — ${a.name}`,
                sublabel:    'Socio sin cargo directivo — responsabilidad limitada al aporte',
                recomendada: 0,
                tipo:        'empresa_socio',
                noAplica:    true,
            });
        } else if (rol === 'representante_legal' || rol === 'junta_directiva') {
            // Exposición por decisiones de gestión → D&O
            const rolLabel = rol === 'representante_legal'
                ? 'Representante Legal / Gerente'
                : 'Miembro de Junta Directiva';
            items.push({
                label:       `D&O — ${a.name}`,
                sublabel:    `${rolLabel} — exposición por decisiones de gestión`,
                recomendada: a.vCOP * 0.30,
                tipo:        'empresa_do',
                noAplica:    false,
            });
        } else if (rol === 'propietario_natural') {
            // Exposición ilimitada → RC Empresarial general
            items.push({
                label:       `RC Empresarial — ${a.name}`,
                sublabel:    'Propietario único / Persona Natural — exposición ilimitada con patrimonio personal',
                recomendada: a.vCOP * 0.50,
                tipo:        'empresa_rc',
                noAplica:    false,
            });
        } else {
            // Sin rol definido — usar lógica anterior (0.5× como conservador)
            items.push({
                label:       `Por empresa — ${a.name}`,
                sublabel:    'Rol no definido — complete el campo de rol para mayor precisión',
                recomendada: a.vCOP * 0.50,
                tipo:        'empresa',
                noAplica:    false,
            });
        }
    });

    (met.inmueblesArrendados  || []).forEach(a =>
        items.push({ label: `Por inmueble arrendado — ${a.name}`, sublabel: '', recomendada: a.vCOP * 0.2, tipo: 'inmueble', noAplica: false }));
    (met.vehiculosTrabajo     || []).forEach(a =>
        items.push({ label: `Por vehículo de trabajo — ${a.name}`, sublabel: '', recomendada: a.vCOP * 0.3, tipo: 'vehiculo', noAplica: false }));
    if (cd?.liberalProfession) {
        const ing = parseFloat(cd?.monthlyActiveIncome) || gastosMes;
        items.push({ label: `Por profesión liberal — ${cd.liberalProfession}`, sublabel: '', recomendada: ing * 12, tipo: 'profesion', noAplica: false });
    }
    return items;
}

// ── Generar HTML de Capa 1 (dinámico según activos y cliente) ─────────
// ══════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════
// C6 — Planificación Sucesoria
// ══════════════════════════════════════════════════════════════════════

function c6EsCasado(clientData) {
    // Check both maritalStatus (saved from form) and any variant
    const ms = (clientData?.maritalStatus || clientData?.estadoCivil || '').trim();
    const lower = ms.toLowerCase().replace(/[áéíóú]/g, c => ({á:'a',é:'e',í:'i',ó:'o',ú:'u'})[c] || c);
    return lower === 'casado' || lower === 'casada'
        || lower === 'union libre' || lower === 'unión libre'
        || lower === 'union_libre' || lower === 'unionlibre';
}

// Score C6 normalizado sobre 5 pts
function c6ScoreFromResp(ps, met, clientData) {
    ps = ps || {};
    const tieneEmpresa = (met.activosEmpresariales || []).length > 0;
    const esCasado     = c6EsCasado(clientData);
    // Máx base: P1(2)+P2(1)+P4(1)+P6(2)+P7(1) = 7 → normalizado a 5
    let maxPts = 7, obtenido = 0;

    // P1: testamento
    if      (ps.testamento === 'vigente')        obtenido += 2;
    else if (ps.testamento === 'desactualizado') obtenido += 1;

    // P2: beneficiarios pólizas
    if      (ps.beneficiariosPolizas === 'todos')   obtenido += 1;
    else if (ps.beneficiariosPolizas === 'algunos') obtenido += 0.5;

    // P3: protocolo familiar (solo si empresa)
    if (tieneEmpresa) {
        maxPts += 1;
        if      (ps.protocoloFamiliar === 'si')         obtenido += 1;
        else if (ps.protocoloFamiliar === 'en_proceso') obtenido += 0.5;
    }

    // P4: mandato preventivo
    if (ps.mandatoPreventivo === 'si') obtenido += 1;

    // P5: capitulaciones (solo si casado/unión libre)
    if (esCasado) {
        maxPts += 1;
        if (ps.capitulaciones === 'si') obtenido += 1;
    }

    // P6: estructura para transferir patrimonio
    if      (ps.estructurasSucesorias === 'mayor60') obtenido += 2;
    else if (ps.estructurasSucesorias === 'menor60') obtenido += 1;

    // P7: cobertura para costos de sucesión
    if      (ps.liquidezSucesion === 'suficiente')    obtenido += 1;
    else if (ps.liquidezSucesion === 'parcial')        obtenido += 0.5;

    if (maxPts === 0) return 0;
    const scoreNorm = parseFloat(((obtenido / maxPts) * 5).toFixed(2));
    console.log('[C6] puntaje obtenido:', obtenido, '/ máximo:', maxPts, '→ score normalizado:', scoreNorm);
    return scoreNorm;
}

// Lee C6 del DOM → objeto planificacionSucesoria
function c6LeerDOM(met, clientData) {
    const radio = n => { const e = document.querySelector(`[name="${n}"]:checked`); return e ? e.value : null; };
    const tieneEmpresa = (met.activosEmpresariales || []).length > 0;
    const esCasado     = c6EsCasado(clientData);
    const ps = {
        testamento:            radio('c6_testamento'),
        beneficiariosPolizas:  radio('c6_beneficiarios'),
        protocoloFamiliar:     tieneEmpresa ? radio('c6_protocolo') : null,
        mandatoPreventivo:     radio('c6_mandato'),
        capitulaciones:        esCasado     ? radio('c6_capitulaciones') : null,
        estructurasSucesorias: radio('c6_estructura'),
        liquidezSucesion:      radio('c6_liquidez'),
    };
    ps.scoreC6 = c6ScoreFromResp(ps, met, clientData);
    return ps;
}

// Construye HTML completo del bloque C6
function c6BuildHtml(rp, met, clientData) {
    const ps           = rp.planificacionSucesoria || {};
    const tieneEmpresa = (met.activosEmpresariales || []).length > 0;
    const esCasado     = c6EsCasado(clientData);

    // Conteo de preguntas aplicables: base 5 (P1+P2+P4+P6+P7) + condicionales
    const aplicables = 5 + (tieneEmpresa ? 1 : 0) + (esCasado ? 1 : 0);
    const scoreInicial = c6ScoreFromResp(ps, met, clientData);
    const scoreClass   = scoreInicial >= 4 ? 'c6-badge-ok' : scoreInicial >= 2.5 ? 'c6-badge-warn' : 'c6-badge-mal';

    // Helper radio pills con ayuda opcional
    const qBlock = (name, texto, opciones, guardado, ayuda) => {
        const opts = opciones.map(([v, l]) =>
            `<label class="c4-opt"><input type="radio" name="${name}" value="${v}"${guardado === v ? ' checked' : ''}><span class="c4-opt-lbl">${l}</span></label>`
        ).join('');
        return `
        <div class="c4-q">
            <div class="c4-q-lbl"><span>${texto}</span></div>
            ${ayuda ? `<div class="c6-ayuda">${ayuda}</div>` : ''}
            <div class="c4-opts">${opts}</div>
        </div>`;
    };

    // P3: protocolo familiar — solo si tiene empresa
    const p3Html = tieneEmpresa ? qBlock(
        'c6_protocolo',
        'P3 — ¿Tienen por escrito un acuerdo sobre cómo se manejaría la empresa si el cliente fallece o decide retirarse?',
        [['si','✅ Sí, documentado (1pt)'],['en_proceso','⚠️ Lo están trabajando (0.5pts)'],['no','🔴 No existe (0pts)']],
        ps.protocoloFamiliar
    ) : '';

    // P5: capitulaciones — solo si es casado o unión libre
    const p5Html = esCasado ? qBlock(
        'c6_capitulaciones',
        'P5 — ¿Tiene un acuerdo firmado con su pareja sobre cómo se dividiría el patrimonio si se separan o si uno de los dos fallece?',
        [['si','✅ Sí, capitulaciones firmadas ante notario (1pt)'],['no','🔴 No tiene (0pts)'],['no_aplica','— No aplica (0pts)']],
        ps.capitulaciones,
        'Sin este acuerdo, la ley colombiana divide automáticamente todos los bienes adquiridos durante el matrimonio en partes iguales, lo que puede afectar la planeación patrimonial.'
    ) : '';

    // P6: estructuras sucesorias — con contexto automático del mapa
    const sucesoriasIF = (met.activosConEstructura || []).filter(a =>
        ['Trust','Fideicomiso','Fundación'].includes(a.leg));
    const pctProtegido = met.patriCOP > 0
        ? (sucesoriasIF.reduce((s,a) => s + a.neto, 0) / met.patriCOP * 100).toFixed(1)
        : '0.0';
    const p6ContextoAuto = sucesoriasIF.length > 0
        ? `<div class="c6-ayuda c6-ctx-auto">
              Se detectaron estructuras sucesorias en el mapa de activos:<br>
              ${sucesoriasIF.map(a => `&nbsp;&nbsp;• ${a.name} — <em>${a.leg}</em>`).join('<br>')}
              <br><strong>% del patrimonio protegido: ${pctProtegido}%</strong>
           </div>`
        : `<div class="c6-ayuda c6-ctx-auto" style="color:#8892a4">No se detectaron estructuras sucesorias en el mapa de activos.</div>`;

    const p6Html = `
        <div class="c4-q">
            <div class="c4-q-lbl"><span>P6 — ¿Tiene algún mecanismo que permita transferir su patrimonio a sus herederos de forma directa, sin necesidad de un proceso judicial?</span></div>
            <div class="c6-ayuda">Los fideicomisos, trusts y fundaciones permiten que los bienes pasen a los herederos sin proceso de sucesión — más rápido, más privado y con menos costos. Se detectan automáticamente del mapa de activos.</div>
            ${p6ContextoAuto}
            <div class="c4-opts">
                <label class="c4-opt"><input type="radio" name="c6_estructura" value="mayor60"${ps.estructurasSucesorias === 'mayor60' ? ' checked' : ''}><span class="c4-opt-lbl">✅ Sí, cubre &gt;60% del patrimonio (2pts)</span></label>
                <label class="c4-opt"><input type="radio" name="c6_estructura" value="menor60"${ps.estructurasSucesorias === 'menor60' ? ' checked' : ''}><span class="c4-opt-lbl">⚠️ Tiene estructuras, pero &lt;60% (1pt)</span></label>
                <label class="c4-opt"><input type="radio" name="c6_estructura" value="ninguna"${ps.estructurasSucesorias === 'ninguna' ? ' checked' : ''}><span class="c4-opt-lbl">🔴 No tiene ninguna (0pts)</span></label>
            </div>
        </div>`;

    // P7: cobertura para costos de sucesión via seguro de vida
    const costoEstimado   = (met.patriCOP || 0) * 0.03;
    const cobVida         = parseFloat(rp.cobVidaTrad || 0) + parseFloat(rp.sumAseguradaSkandiaCP || 0);
    const coberturaSuf    = cobVida >= costoEstimado;
    const coberturaParc   = cobVida > 0 && cobVida < costoEstimado;
    // Auto-selección inteligente si no hay respuesta guardada
    const p7Auto = coberturaSuf ? 'suficiente' : coberturaParc ? 'parcial' : 'insuficiente';
    const p7Guardado = ps.liquidezSucesion || p7Auto;

    const p7Html = `
        <div class="c4-q">
            <div class="c4-q-lbl"><span>P7 — ¿Está previsto cómo se cubrirán los costos del proceso de herencia sin afectar el patrimonio familiar ni el dinero de emergencia?</span></div>
            <div class="c6-ayuda">Un proceso de sucesión puede costar entre el 2% y el 5% del patrimonio en honorarios, impuestos y trámites. Idealmente estos costos están cubiertos por el seguro de vida o por una reserva específica dentro de una estructura patrimonial — no por el fondo de emergencia del cliente que su familia necesitará para sus gastos diarios.</div>
            <div class="c6-ayuda c6-ctx-auto">
                Costo estimado del proceso sucesorio (3%): <strong>${c4cop(costoEstimado)}</strong><br>
                Cobertura de vida disponible: <strong style="color:${coberturaSuf ? '#34d399' : coberturaParc ? '#fbbf24' : '#f87171'}">${c4cop(cobVida)}</strong>
                ${coberturaSuf ? ' ✅ Cubre el costo estimado' : coberturaParc ? ' ⚠️ Cobertura parcial' : ' — Sin cobertura registrada'}
            </div>
            <div class="c4-opts">
                <label class="c4-opt"><input type="radio" name="c6_liquidez" value="suficiente"${p7Guardado === 'suficiente' ? ' checked' : ''}><span class="c4-opt-lbl">✅ Sí — el seguro de vida o una estructura cubre estos costos (1pt)</span></label>
                <label class="c4-opt"><input type="radio" name="c6_liquidez" value="parcial"${p7Guardado === 'parcial' ? ' checked' : ''}><span class="c4-opt-lbl">⚠️ Parcialmente cubierto (0.5pts)</span></label>
                <label class="c4-opt"><input type="radio" name="c6_liquidez" value="insuficiente"${p7Guardado === 'insuficiente' ? ' checked' : ''}><span class="c4-opt-lbl">🔴 No está previsto (0pts)</span></label>
            </div>
        </div>`;

    return `
    <div class="c4-criterio" id="c6-criterio">
        <div class="c4-criterio-hd">
            <span class="c4-crit-num">C6</span>
            <span class="c4-crit-title">Planificación sucesoria</span>
            <span class="c4-tag-pts">Máx 5 pts (normalizado)</span>
        </div>
        <div class="c4-auto-ctx" id="c4-suc-contexto">Calculando contexto…</div>
        <div class="c6-score-badge ${scoreClass}" id="c6-score-badge">
            <span class="c6-score-num" id="c6-score-num">${scoreInicial.toFixed(1)}</span>
            <span class="c6-score-sep">/ 5 pts</span>
            <span class="c6-score-aplicables" id="c6-score-aplicables">${aplicables} pregunta${aplicables !== 1 ? 's' : ''} aplicable${aplicables !== 1 ? 's' : ''}</span>
        </div>
        ${qBlock('c6_testamento',
            'P1 — ¿Tiene testamento vigente y actualizado?',
            [['vigente','✅ Sí, vigente (2pts)'],['desactualizado','⚠️ Lo tiene pero está desactualizado (1pt)'],['no_tiene','🔴 No tiene (0pts)']],
            ps.testamento)}
        ${qBlock('c6_beneficiarios',
            'P2 — ¿Están definidas las personas que recibirían el dinero de los seguros de vida si el cliente falleciera?',
            [['todos','✅ Sí, en todas las pólizas (1pt)'],['algunos','⚠️ Solo en algunas (0.5pts)'],['ninguno','🔴 No están definidos (0pts)']],
            ps.beneficiariosPolizas,
            'Revisar con el cliente quién está designado como beneficiario en cada póliza de seguro.')}
        ${p3Html}
        ${qBlock('c6_mandato',
            'P4 — ¿Ha definido quién tomaría decisiones legales y financieras por él si quedara incapacitado por una enfermedad o accidente grave?',
            [['si','✅ Sí, está definido y formalizado (1pt)'],['no','🔴 No está definido (0pts)']],
            ps.mandatoPreventivo,
            'Por ejemplo: quién podría manejar sus cuentas, firmar documentos o tomar decisiones médicas si él no pudiera hacerlo.')}
        ${p5Html}
        ${p6Html}
        ${p7Html}
    </div>`;
}

// Actualiza badge de score C6 en tiempo real
function c6UpdateScore(met, clientData) {
    const ps      = c6LeerDOM(met, clientData);
    const score   = ps.scoreC6;
    const numEl   = document.getElementById('c6-score-num');
    const badgeEl = document.getElementById('c6-score-badge');
    if (!numEl || !badgeEl) return;
    numEl.textContent = score.toFixed(1);
    badgeEl.className = 'c6-score-badge ' + (
        score >= 4   ? 'c6-badge-ok'   :
        score >= 2.5 ? 'c6-badge-warn' : 'c6-badge-mal'
    );
}

// C5 — Separación patrimonio personal / empresarial
// ══════════════════════════════════════════════════════════════════════

// Definición de preguntas y respuestas correctas por rol
function c5GetPreguntas(rol) {
    if (rol === 'representante_legal') {
        return [
            {
                texto:    '¿Tiene cuenta bancaria exclusiva para su empresa, diferente a su cuenta personal?',
                opts:     [['si','Sí'],['no','No']],
                correcta: 'si',
            },
            {
                texto:    '¿Paga gastos personales como mercado, colegio, viajes o restaurantes desde la cuenta de la empresa?',
                opts:     [['si','Sí'],['no','No']],
                correcta: 'no',
            },
            {
                texto:    '¿Sus propiedades personales como casa y carro están registradas a su nombre personal, no a nombre de la empresa?',
                opts:     [['personal','Sí, a mi nombre personal'],['empresa','A nombre de la empresa']],
                correcta: 'personal',
            },
            {
                texto:    '¿Se paga un salario o dividendo fijo de su empresa?',
                opts:     [['fijo','Sí, salario o dividendo fijo'],['retiro','Retiro lo que necesito cuando lo necesito']],
                correcta: 'fijo',
            },
            {
                texto:    '¿Ha firmado personalmente como deudor o avalista de algún crédito de su empresa?',
                opts:     [['si','Sí'],['no','No']],
                correcta: 'no',
            },
        ];
    }
    if (rol === 'propietario_natural') {
        return [
            {
                texto:    '¿Lleva algún registro separado de los ingresos y gastos de su negocio, aunque sea en una hoja de cálculo o cuaderno?',
                opts:     [['si','Sí'],['no','No']],
                correcta: 'si',
            },
            {
                texto:    '¿Paga gastos personales como mercado, colegio, viajes o restaurantes con el dinero del negocio sin registrarlo como gasto?',
                opts:     [['si','Sí'],['no','No']],
                correcta: 'no',
            },
            {
                texto:    '¿Sus propiedades personales como casa y carro están registradas a su nombre personal?',
                opts:     [['personal','Sí, a mi nombre personal'],['sin_sep','Las uso también para el negocio sin separación']],
                correcta: 'personal',
            },
            {
                texto:    '¿Tiene definido cuánto dinero retira mensualmente del negocio para sus gastos personales?',
                opts:     [['fijo','Sí, tengo un monto fijo definido'],['retiro','Retiro lo que necesito cuando lo necesito']],
                correcta: 'fijo',
            },
            {
                texto:    '¿Tiene RUT con actividad económica registrada?',
                opts:     [['si','Sí'],['no','No']],
                correcta: 'si',
            },
        ];
    }
    return [];
}

// Calcular puntaje de separación dado un conteo de respuestas correctas
function c5PtsFromCorrect(correctas) {
    if (correctas >= 5)          return 2;
    if (correctas >= 3)          return 1;
    return 0;
}

// Etiqueta textual del puntaje
function c5PtsLabel(pts) {
    if (pts >= 2) return '✅ Completamente separados';
    if (pts >= 1) return '⚠️ Parcialmente separados';
    return '🔴 No están separados';
}

// Calcular puntaje global de C5 dado separacionPatrimonial guardado
// Promedio de puntajes por activo, redondeado hacia abajo, max 2
function c5ScoreFromGuardado(separacionPatrimonial, met) {
    const aplicables = (met.activosEmpresariales || []).filter(
        a => a.rolEmpresarial === 'representante_legal' || a.rolEmpresarial === 'propietario_natural'
    );
    if (aplicables.length === 0) return 0;
    const sp = separacionPatrimonial || {};
    let suma = 0;
    aplicables.forEach(a => {
        const dato = sp[a.id];
        if (dato && Array.isArray(dato.respuestas)) {
            const correctas = dato.respuestas.filter(Boolean).length;
            suma += c5PtsFromCorrect(correctas);
        }
    });
    return Math.min(2, Math.floor(suma / aplicables.length));
}

// Leer respuestas de C5 del DOM → objeto { [activoId]: { rol, respuestas, puntaje } }
function c5LeerSepDOM(met) {
    const aplicables = (met.activosEmpresariales || []).filter(
        a => a.rolEmpresarial === 'representante_legal' || a.rolEmpresarial === 'propietario_natural'
    );
    const result = {};
    aplicables.forEach(a => {
        const preguntas = c5GetPreguntas(a.rolEmpresarial);
        const respuestas = preguntas.map((p, qi) => {
            const checked = document.querySelector(`[name="c5_${a.id}_${qi}"]:checked`);
            return checked ? checked.value === p.correcta : null;
        });
        const respondidas = respuestas.filter(r => r !== null);
        const correctas   = respondidas.filter(Boolean).length;
        const puntaje     = respondidas.length === 0 ? null : c5PtsFromCorrect(correctas);
        result[a.id] = { rol: a.rolEmpresarial, respuestas, puntaje };
    });
    return result;
}

// Construir HTML del bloque C5
// rp = guardado.proteccion (puede tener rp.separacionPatrimonial ya cargado)
function c5BuildSepHtml(rp, met) {
    const aplicables = (met.activosEmpresariales || []).filter(
        a => a.rolEmpresarial === 'representante_legal' || a.rolEmpresarial === 'propietario_natural'
    );
    if (aplicables.length === 0) return '';   // C5 no aplica

    const sp = rp.separacionPatrimonial || {};

    const bloques = aplicables.map(a => {
        const preguntas = c5GetPreguntas(a.rolEmpresarial);
        const rolLabel  = a.rolEmpresarial === 'representante_legal'
            ? 'Representante Legal / Gerente'
            : 'Propietario único / Persona Natural';

        const savedDato  = sp[a.id] || {};
        const savedResps = savedDato.respuestas || [];   // array de bool|null

        const qRows = preguntas.map((p, qi) => {
            const savedVal = savedResps[qi];   // true/false/undefined
            const optsHtml = p.opts.map(([v, l]) => {
                // Reconstruir el valor guardado: si resp era true => correcta, si false => la incorrecta
                let isChecked = false;
                if (savedVal === true  && v === p.correcta) isChecked = true;
                if (savedVal === false && v !== p.correcta) isChecked = true;
                // Distinción visual: correcto=verde, incorrecto=rojo cuando está seleccionado
                const esCorrecta   = (v === p.correcta);
                const extraCls     = isChecked ? (esCorrecta ? ' c5-opt-correcto' : ' c5-opt-incorrecto') : '';
                return `<label class="c4-opt${extraCls}">
                    <input type="radio" name="c5_${a.id}_${qi}" value="${v}"${isChecked ? ' checked' : ''}>
                    <span class="c4-opt-lbl">${l}</span>
                </label>`;
            }).join('');

            return `
            <div class="c5-sep-q">
                <div class="c5-sep-q-txt">${qi + 1}. ${p.texto}</div>
                <div class="c4-opts">${optsHtml}</div>
            </div>`;
        }).join('');

        // Badge de score inicial para este activo
        const savedPts   = savedDato.puntaje ?? null;
        const badgeClass = savedPts === null ? 'c5-sep-badge-nd'
                         : savedPts >= 2    ? 'c5-sep-badge-ok'
                         : savedPts >= 1    ? 'c5-sep-badge-warn'
                         : 'c5-sep-badge-mal';
        const badgeTxt   = savedPts === null ? '— Sin responder'
                         : c5PtsLabel(savedPts) + ` (${savedPts} pt${savedPts !== 1 ? 's' : ''})`;

        return `
        <div class="c5-sep-activo" data-activo-id="${a.id}">
            <div class="c5-sep-activo-hd">
                <span class="c5-sep-activo-name">${a.name}</span>
                <span class="c5-sep-rol-tag">${rolLabel}</span>
            </div>
            <div class="c5-sep-badge ${badgeClass}" id="c5-badge-${a.id}">${badgeTxt}</div>
            <div class="c5-sep-preguntas">${qRows}</div>
        </div>`;
    }).join('');

    return `
    <div class="c4-criterio" id="c5-criterio">
        <div class="c4-criterio-hd">
            <span class="c4-crit-num">C5</span>
            <span class="c4-crit-title">Separación patrimonio personal / empresarial</span>
            <span class="c4-tag-pts">5/5: 2pts / 3-4/5: 1pt / ≤2/5: 0pts</span>
        </div>
        <div class="c5-sep-bloques">${bloques}</div>
    </div>`;
}

// Actualizar los badges de C5 en el DOM según el estado actual de los radios
function c5UpdateBadges(met) {
    const aplicables = (met.activosEmpresariales || []).filter(
        a => a.rolEmpresarial === 'representante_legal' || a.rolEmpresarial === 'propietario_natural'
    );
    aplicables.forEach(a => {
        const badge     = document.getElementById(`c5-badge-${a.id}`);
        if (!badge) return;
        const preguntas = c5GetPreguntas(a.rolEmpresarial);
        let respondidas = 0;
        let correctas   = 0;
        preguntas.forEach((p, qi) => {
            const checked = document.querySelector(`[name="c5_${a.id}_${qi}"]:checked`);
            if (checked) {
                respondidas++;
                if (checked.value === p.correcta) correctas++;
                // Actualizar clase visual del label seleccionado
                const allLabels = document.querySelectorAll(`[name="c5_${a.id}_${qi}"]`);
                allLabels.forEach(r => {
                    const lbl = r.closest('label');
                    if (!lbl) return;
                    lbl.classList.remove('c5-opt-correcto','c5-opt-incorrecto');
                    if (r.checked) {
                        lbl.classList.add(r.value === p.correcta ? 'c5-opt-correcto' : 'c5-opt-incorrecto');
                    }
                });
            }
        });
        if (respondidas === 0) {
            badge.textContent = '— Sin responder';
            badge.className   = 'c5-sep-badge c5-sep-badge-nd';
        } else {
            const pts = c5PtsFromCorrect(correctas);
            badge.textContent = c5PtsLabel(pts) + ` (${pts} pt${pts !== 1 ? 's' : ''})`;
            badge.className   = 'c5-sep-badge ' + (
                pts >= 2 ? 'c5-sep-badge-ok' :
                pts >= 1 ? 'c5-sep-badge-warn' :
                           'c5-sep-badge-mal'
            );
        }
    });
}

function c1BuildCapa1HTML(rp, met, gastosMes, clientData) {
    // ── C1: Seguro de Vida — lógica completa ──
    const ingPasivosAjuste   = rp.ingPasivosAjuste;
    const pasivosNoCubAjuste = rp.pasivosNoCubAjuste;

    // Paso 1: Ingresos pasivos sobrevivientes
    const ingDetalle = met.ingPasivosDetalle || [];
    const rowsIngSobrev = ingDetalle.length > 0
        ? ingDetalle.map(x => {
            const tag = x.sobrevive
                ? `<span class="c1v-row-tag c1v-tag-ok">✅ se hereda</span>`
                : x.incierto
                    ? `<span class="c1v-row-tag c1v-tag-inc">⚠️ incierto — asesor decide</span>`
                    : `<span class="c1v-row-tag c1v-tag-no">❌ no se incluye</span>`;
            return `<div class="c1v-row">
                <span class="c1v-row-name">${x.name}</span>
                <span class="c1v-row-val">${c4cop(x.ingMensCOP)}/mes</span>
                ${tag}
            </div>`;
        }).join('')
        : `<div style="font-size:1rem;color:#8892a4">Sin activos con ingreso pasivo registrados</div>`;

    const sobrevAuto = met.ingPasivosSobrevCOP || 0;
    const ajusteIngVal = (ingPasivosAjuste !== null && ingPasivosAjuste !== undefined && ingPasivosAjuste !== '')
        ? ingPasivosAjuste : '';
    const sobrevEfectivo = ajusteIngVal !== '' ? (parseFloat(ajusteIngVal) || 0) : sobrevAuto;
    const ingresoReemplazar = Math.max(0, gastosMes - sobrevEfectivo);

    // Paso 2: Pasivos no cubiertos
    const rowsInc = (met.pasivosIncluidos || []).map(p =>
        `<div class="c1v-row">
            <span class="c1v-row-name">${p.nombre}</span>
            <span class="c1v-row-val">${c4cop(p.pCOP)}</span>
            <span class="c1v-row-tag c1v-tag-ok">✅ incluido</span>
        </div>`).join('');
    const rowsExc = (met.pasivosExcluidos || []).map(p =>
        `<div class="c1v-row">
            <span class="c1v-row-name">${p.nombre}</span>
            <span class="c1v-row-val">${c4cop(p.pCOP)}</span>
            <span class="c1v-row-tag c1v-tag-no">❌ ${p.razon}</span>
        </div>`).join('');
    const pasivosAutoNoCub = met.pasivosNoCubCOP || 0;
    const ajustePasVal = (pasivosNoCubAjuste !== null && pasivosNoCubAjuste !== undefined && pasivosNoCubAjuste !== '')
        ? pasivosNoCubAjuste : '';
    const pasivosEfectivos = ajustePasVal !== '' ? (parseFloat(ajustePasVal) || 0) : pasivosAutoNoCub;

    // Paso 3: Cobertura requerida
    const educacion = parseFloat(clientData?.educationCosts) || 0;
    const cobRequerida = (ingresoReemplazar * 12 * 10) + pasivosEfectivos + educacion;

    // Paso 4: Cobertura actual
    const cobTrad    = parseFloat(rp.cobVidaTrad) || 0;
    const cobSkandiaCP = parseFloat(rp.sumAseguradaSkandiaCP) || 0;
    const cobTotal   = cobTrad + cobSkandiaCP;

    // Paso 5: Gap y puntaje
    const gap = cobRequerida - cobTotal;
    let gapBadgeCls, gapBadgeTxt, ptsTxt;
    if (cobTotal === 0) {
        gapBadgeCls = 'c1v-gap-mal';
        gapBadgeTxt = `🔴 No tiene seguro de vida — Gap total: ${c4cop(cobRequerida)} sin cubrir`;
        ptsTxt = '0 pts';
    } else if (cobTotal < cobRequerida) {
        gapBadgeCls = 'c1v-gap-warn';
        gapBadgeTxt = `⚠️ Cobertura insuficiente — Gap: ${c4cop(gap)} sin cubrir`;
        ptsTxt = '1.5 pts';
    } else {
        gapBadgeCls = 'c1v-gap-ok';
        gapBadgeTxt = `✅ Cobertura adecuada — Excedente: ${c4cop(-gap)}`;
        ptsTxt = '3 pts';
    }

    // Suma asegurada automática de los seguros de pensión detectados en el mapa
    const _cobAutoSegPension = (met.segurosConPension || [])
        .reduce((s, x) => s + (x.valorAseguradoActual || 0), 0);
    const _cobAutoSegPensionITP = (met.segurosConPension || [])
        .filter(x => x.incluyeITP).reduce((s, x) => s + (x.valorAseguradoITP || 0), 0);
    // Pre-fill manual field with auto sum if asesor hasn't overridden
    const _skandiaPrefill = rp.sumAseguradaSkandiaCP != null && rp.sumAseguradaSkandiaCP !== ''
        ? rp.sumAseguradaSkandiaCP
        : (_cobAutoSegPension > 0 ? _cobAutoSegPension : '');

    const skandiaHTML = met.tieneSkandiaCP ? `
        <div class="c1v-block" style="margin-top:4px">
            <div class="c1v-block-title">🔍 Seguro de pensión con ahorro detectado en mapa de activos</div>
            <div class="c1v-warning">
                <strong>⚠️ La suma asegurada es DECRECIENTE</strong>
                Inicia en el objetivo de ahorro y disminuye cada mes con el pago de primas.
                Consulte el valor actual en el estado de cuenta de la póliza.
                <em>No incluya aquí el objetivo de ahorro — ya está reflejado en el mapa patrimonial.</em>
            </div>
            ${_cobAutoSegPension > 0 ? `<div class="c1v-row" style="margin-top:6px">
                <span class="c1v-row-name">Valor asegurado actual (del mapa de activos):</span>
                <span class="c1v-row-val">${c4cop(_cobAutoSegPension)}</span>
            </div>` : ''}
            <div class="c1v-edit-row" style="margin-top:10px">
                <label class="c1v-edit-lbl">Suma asegurada actual (cobertura de vida):</label>
                <input id="c4-vida-skandia" class="c1v-edit-input c4-cob-input" type="number" min="0"
                    placeholder="COP…" value="${_skandiaPrefill}">
                <span class="c1v-edit-unit">COP</span>
            </div>
        </div>` : '';

    const vidaC1Html = `
        <!-- C1: Seguro de vida ─────────────────────────────── -->
        <div class="c4-criterio">
            <div class="c4-criterio-hd">
                <span class="c4-crit-num">C1</span>
                <span class="c4-crit-title">Seguro de vida</span>
                <span class="c4-tag-pts">Adecuada: 3 / Insuficiente: 1.5 / No tiene: 0</span>
                <span class="c4-tag-pts" id="c4-vida-pts-badge" style="margin-left:auto;font-weight:700;color:#f0c040">${ptsTxt}</span>
            </div>

            <div class="c1v-section">

            <!-- Paso 1: Ingresos pasivos sobrevivientes -->
            <div class="c1v-block">
                <div class="c1v-block-title">Paso 1 — Ingresos pasivos que sobreviven al cliente</div>
                ${rowsIngSobrev}
                <hr class="c1v-divider">
                <div class="c1v-total-row">
                    <span>Total que sobrevive (AUTO):</span>
                    <span class="c1v-total-val">${c4cop(sobrevAuto)}/mes</span>
                </div>
                <div class="c1v-edit-row">
                    <label class="c1v-edit-lbl">Ajuste manual del asesor:</label>
                    <input id="c4-vida-ing-ajuste" class="c1v-edit-input c4-cob-input" type="number" min="0"
                        placeholder="Dejar vacío para usar valor auto"
                        value="${ajusteIngVal}">
                    <span class="c1v-edit-unit">COP/mes</span>
                </div>
                <div class="c1v-row" style="margin-top:6px">
                    <span class="c1v-row-name">Gastos mensuales del cliente:</span>
                    <span class="c1v-row-val">${c4cop(gastosMes)}/mes</span>
                </div>
                <div class="c1v-row">
                    <span class="c1v-row-name" style="font-weight:700;color:#e2e8f0">Ingreso mensual a reemplazar:</span>
                    <span class="c1v-row-val c1v-total-val" id="c4-vida-reemplazar">${c4cop(ingresoReemplazar)}/mes</span>
                </div>
            </div>

            <!-- Paso 2: Pasivos no cubiertos -->
            <div class="c1v-block">
                <div class="c1v-block-title">Paso 2 — Pasivos incluidos en cobertura requerida</div>
                ${rowsInc || '<div style="font-size:1rem;color:#8892a4">Ninguno — todos tienen seguro deudor o se extinguen</div>'}
                ${rowsExc ? `<hr class="c1v-divider"><div style="font-size:1rem;color:#8892a4;margin-bottom:4px">Excluidos:</div>${rowsExc}` : ''}
                <hr class="c1v-divider">
                <div class="c1v-total-row">
                    <span>Total pasivos no cubiertos (AUTO):</span>
                    <span class="c1v-total-val">${c4cop(pasivosAutoNoCub)}</span>
                </div>
                <div class="c1v-edit-row">
                    <label class="c1v-edit-lbl">Ajuste manual del asesor:</label>
                    <input id="c4-vida-pas-ajuste" class="c1v-edit-input c4-cob-input" type="number" min="0"
                        placeholder="Dejar vacío para usar valor auto"
                        value="${ajustePasVal}">
                    <span class="c1v-edit-unit">COP</span>
                </div>
            </div>

            <!-- Paso 3: Cobertura requerida — desglose -->
            <div class="c1v-block">
                <div class="c1v-block-title">Paso 3 — Desglose cobertura requerida</div>
                <div class="c1v-desglose">
                    <div class="c1v-des-row">
                        <span class="c1v-des-lbl">Reemplazo de ingresos (×12×10 años):</span>
                        <span class="c1v-des-val" id="c4-vida-desg-ing">${c4cop(ingresoReemplazar * 12 * 10)}</span>
                    </div>
                    <div class="c1v-des-row">
                        <span class="c1v-des-lbl">Pasivos no cubiertos:</span>
                        <span class="c1v-des-val" id="c4-vida-desg-pas">${c4cop(pasivosEfectivos)}</span>
                    </div>
                    ${educacion > 0 ? `
                    <div class="c1v-des-row">
                        <span class="c1v-des-lbl">Gastos educación hijos:</span>
                        <span class="c1v-des-val">${c4cop(educacion)}</span>
                    </div>` : ''}
                    <div class="c1v-des-row" style="margin-top:2px">
                        <span class="c1v-des-lbl" style="font-weight:700;color:#e2e8f0">Cobertura total requerida:</span>
                        <span class="c1v-des-val c1v-des-total" id="c4-vida-req" data-valor="${cobRequerida}">${c4cop(cobRequerida)}</span>
                    </div>
                </div>
            </div>

            <!-- Paso 4: Cobertura actual -->
            <div class="c1v-block">
                <div class="c1v-block-title">Paso 4 — Cobertura actual del cliente</div>
                <div class="c1v-edit-row">
                    <label class="c1v-edit-lbl">Seguro de vida tradicional (término, universal…):</label>
                    <input id="c4-vida-input" class="c1v-edit-input c4-cob-input" type="number" min="0"
                        placeholder="COP…" value="${rp.cobVidaTrad || ''}">
                    <span class="c1v-edit-unit">COP</span>
                </div>
                ${skandiaHTML}
                <div class="c1v-cobertura-total" id="c4-vida-total-wrap">
                    <div class="c1v-cob-tot-row">
                        <span>Seguro tradicional:</span>
                        <span id="c4-vida-cob-trad">${c4cop(cobTrad)}</span>
                    </div>
                    ${met.tieneSkandiaCP ? `<div class="c1v-cob-tot-row">
                        <span>Seguro de pensión con ahorro:</span>
                        <span id="c4-vida-cob-skandia">${c4cop(cobSkandiaCP)}</span>
                    </div>` : ''}
                    <hr class="c1v-divider">
                    <div class="c1v-cob-tot-row c1v-cob-tot-total">
                        <span>Total cobertura actual:</span>
                        <span id="c4-vida-act">${c4cop(cobTotal)}</span>
                    </div>
                </div>
            </div>

            <!-- Paso 5: Gap y evaluación -->
            <div class="c1v-gap-badge ${gapBadgeCls}" id="c4-vida-gap-badge">
                ${gapBadgeTxt}
            </div>

            </div><!-- /.c1v-section -->
        </div>`;

    // C3: RC — solo si aplica
    const rcItems = c1BuildRCItems(met, gastosMes, clientData);
    let rcHtml = '';
    if (rcItems.length > 0) {
        const rcRows = rcItems.map((item, i) => {
            if (item.noAplica) {
                // Ítem informativo sin cobertura (ej: socio sin cargo directivo)
                return `
            <div class="c4-rc-item" style="opacity:.7">
                <div class="c4-rc-header">
                    <span class="c4-rc-lbl">${item.label}</span>
                    <span class="c4-rc-badge" style="background:rgba(100,116,139,.25);color:#94a3b8">— No aplica</span>
                </div>
                ${item.sublabel ? `<div style="font-size:1rem;color:#8892a4;padding:4px 0 2px">${item.sublabel}</div>` : ''}
            </div>`;
            }
            return `
            <div class="c4-rc-item">
                <div class="c4-rc-header">
                    <span class="c4-rc-lbl">${item.label}</span>
                    <span class="c4-rc-badge c4-rc-mal" id="c4-rc-badge-${i}">🔴 No tiene</span>
                </div>
                ${item.sublabel ? `<div style="font-size:1rem;color:#94a3b8;padding:2px 0 6px">${item.sublabel}</div>` : ''}
                <div class="c4-rc-cols">
                    <div class="c4-cob-item">
                        <div class="c4-cob-lbl">Cobertura recomendada</div>
                        <div class="c4-cob-val" id="c4-rc-req-${i}">—</div>
                    </div>
                    <div class="c4-cob-item">
                        <div class="c4-cob-lbl">Cobertura actual</div>
                        <div class="c4-input-wrap">
                            <input id="c4-rc-actual-${i}" class="c4-cob-input" type="number" min="0"
                                placeholder="COP…" value="${((rp.rc||{})[`rc_${i}`]) || ''}">
                            <span class="c4-input-unit">COP</span>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');

        rcHtml = `
        <div class="c4-criterio">
            <div class="c4-criterio-hd">
                <span class="c4-crit-num">C3</span>
                <span class="c4-crit-title">Responsabilidad Civil (RC)</span>
                <span class="c4-tag-auto">AUTO-detectado</span>
                <span class="c4-tag-pts">Adec todas: 2 / Proporcional / No aplica: —</span>
            </div>
            ${rcRows}
        </div>`;
    }

    // C5: Separación — nueva lógica por rol (representante_legal / propietario_natural)
    // Solo aparece si hay activos con esos roles. c5BuildSepHtml devuelve '' si no aplica.
    const sepHtml = c5BuildSepHtml(rp, met);

    // C6 HTML generado por función dedicada
    const c6Html = c6BuildHtml(rp, met, clientData);

    return `
    <!-- ── CAPA 1: PROTECCIÓN ──────────────────────────────────── -->
    <div class="c4-card c4-card-prot">
        <div class="c4-card-hd">
            <div class="c4-num c4n-1">1</div>
            <div>
                <div class="c4-title">Protección</div>
                <div class="c4-sub">Seguros, estructuras legales y planeación — máx 10 pts</div>
            </div>
            <div class="c4-badge">
                <div class="c4-badge-n" id="c4-score-proteccion">—</div>
                <div class="c4-badge-d">/10 pts</div>
            </div>
        </div>
        <div class="c4-body">

        ${vidaC1Html}

        <!-- C2: Seguro de invalidez ────────────────────────── -->
        <div class="c4-criterio">
            <div class="c4-criterio-hd">
                <span class="c4-crit-num">C2</span>
                <span class="c4-crit-title">Seguro de invalidez</span>
                <span class="c4-tag-pts">Adecuada: 2 / Insuficiente: 1 / No tiene: 0</span>
            </div>
            <div class="c4-auto-ctx">
                <div class="c4-ctx-row">
                    <span>Ingreso activo mensual</span>
                    <strong id="c4-inv-ing-activo">—</strong>
                </div>
                <div class="c4-ctx-row">
                    <span>Ingresos pasivos que sobreviven</span>
                    <strong id="c4-inv-ing-pasivos" style="color:#34d399">—</strong>
                </div>
                <div class="c4-ctx-row" style="border-top:1px solid rgba(255,255,255,.08);padding-top:6px;margin-top:2px">
                    <span style="font-weight:600">Ingreso mensual a reemplazar</span>
                    <strong id="c4-inv-reemplazo" style="color:#7dd3fc">—</strong>
                </div>
                <div class="c4-ctx-row">
                    <span>Años productivos restantes (hasta 65)</span>
                    <strong id="c4-inv-anios">—</strong>
                </div>
                <div class="c4-ctx-row">
                    <span>Cobertura mínima recomendada</span>
                    <strong class="c4-cob-val" id="c4-inv-req2">—</strong>
                </div>
            </div>
            <div class="c4-input-row">
                <label class="c4-input-lbl">Cobertura actual del cliente</label>
                <div class="c4-input-wrap">
                    <input id="c4-inv-input" class="c4-cob-input" type="number" min="0"
                        placeholder="Ingresa monto en COP…" value="${rp.cobInvalidez || ''}">
                    <span class="c4-input-unit">COP</span>
                </div>
            </div>
            <div class="c4-cob-row">
                <div class="c4-cob-item"><div class="c4-cob-lbl">Recomendada</div>
                    <div class="c4-cob-val" id="c4-inv-req">—</div></div>
                <div class="c4-cob-item"><div class="c4-cob-lbl">Actual</div>
                    <div class="c4-cob-val" id="c4-inv-act">—</div></div>
                <div class="c4-cob-item"><div class="c4-cob-lbl">Gap</div>
                    <div class="c4-cob-val c4-cob-mal" id="c4-inv-gap">—</div></div>
            </div>
        </div>

        <!-- C3: RC ─────────────────────────────────────────── -->
        ${rcHtml}

        <!-- C4: Estructuras de protección ───────────────────── -->
        <div class="c4-criterio">
            <div class="c4-criterio-hd">
                <span class="c4-crit-num">C4</span>
                <span class="c4-crit-title">Estructuras de protección de activos</span>
                <span class="c4-tag-auto">AUTO</span>
                <span class="c4-tag-pts">Trust/Fid: 2 / Holding/LLC: 1 / Ninguna: 0</span>
            </div>
            <div class="c4-auto-ctx" id="c4-estruc-info">Calculando…</div>
        </div>

        <!-- C5: Separación ──────────────────────────────────── -->
        ${sepHtml}

        <!-- C6: Planificación sucesoria ─────────────────────────── -->
        ${c6Html}

        <!-- Semáforo Capa 1 ──────────────────────────────────── -->
        <div class="c4-c1-sem-wrap">
            <span class="c4-c1-sem-lbl">Diagnóstico Capa 1:</span>
            <span class="c4-c1-sem-badge c4-c1-sem-critico" id="c4-c1-semaforo">🔴 CRÍTICO</span>
        </div>
        </div>
    </div>`;
}

// ── C1 Paso 4-5: Recalcular cobertura actual, gap y puntaje ─────────────
// Lee SIEMPRE directo del DOM para reactividad inmediata.
// Recibe cobRequerida ya calculada (por c4UpdateAutos o por los listeners dedicados).
function c1RecalcularPaso4(cobRequerida) {
    // 1. Leer valores directamente del DOM
    const inputTrad    = document.getElementById('c4-vida-input');
    const inputSkandiaCP = document.getElementById('c4-vida-skandia');
    const cobTrad      = parseFloat(inputTrad?.value)     || 0;
    const cobSkandiaCP = parseFloat(inputSkandiaCP?.value) || 0;

    // 2. Calcular total
    const cobTotal = cobTrad + cobSkandiaCP;

    // 3. Mostrar valores parciales y total en pantalla
    const setTxt = (id, txt) => {
        const el = document.getElementById(id);
        if (el) el.textContent = txt;
    };
    setTxt('c4-vida-cob-trad',    c4cop(cobTrad));
    setTxt('c4-vida-cob-skandia', c4cop(cobSkandiaCP));
    setTxt('c4-vida-act',         c4cop(cobTotal));

    // Si cobRequerida no se pasó, leerla del atributo data-valor (número puro)
    if (cobRequerida === undefined || cobRequerida === null) {
        const reqEl = document.getElementById('c4-vida-req');
        cobRequerida = parseFloat(reqEl?.dataset?.valor) || 0;
    }

    // 4. Calcular gap
    const gap = cobRequerida - cobTotal;

    // 5. Actualizar badge de gap
    const gapBadge = document.getElementById('c4-vida-gap-badge');
    if (gapBadge) {
        if (cobTotal === 0) {
            gapBadge.className = 'c1v-gap-badge c1v-gap-mal';
            gapBadge.textContent = `🔴 No tiene seguro de vida — Gap total: ${c4cop(cobRequerida)} sin cubrir`;
        } else if (cobTotal < cobRequerida) {
            gapBadge.className = 'c1v-gap-badge c1v-gap-warn';
            gapBadge.textContent = `⚠️ Cobertura insuficiente — Gap: ${c4cop(gap)} sin cubrir`;
        } else {
            gapBadge.className = 'c1v-gap-badge c1v-gap-ok';
            gapBadge.textContent = `✅ Cobertura adecuada — Excedente: ${c4cop(-gap)}`;
        }
    }

    // 6. Actualizar badge de puntaje
    const ptsBadge = document.getElementById('c4-vida-pts-badge');
    if (ptsBadge) {
        if      (cobTotal === 0)               ptsBadge.textContent = '0 pts';
        else if (cobTotal < cobRequerida)      ptsBadge.textContent = '1.5 pts';
        else                                   ptsBadge.textContent = '3 pts';
    }
}

// ── Actualizar campos AUTO en pantalla ────────────────────────────────
function c4UpdateAutos(met, gastosMes, resp, clientData) {
    const set = (id, txt, cls) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = txt;
        if (cls !== undefined) el.className = 'c4-cob-val ' + cls;
    };

    // Capa 1 C1: Seguro de vida — Pasos 1-3 (cobertura requerida, siempre del DOM)
    const ingAjuste = document.getElementById('c4-vida-ing-ajuste')?.value ?? '';
    const pasAjuste = document.getElementById('c4-vida-pas-ajuste')?.value ?? '';
    const sobrevEfectivo = ingAjuste !== '' ? (parseFloat(ingAjuste) || 0) : (met.ingPasivosSobrevCOP || 0);
    const ingresoReemplazar = Math.max(0, gastosMes - sobrevEfectivo);
    const pasivosEfectivos  = pasAjuste !== '' ? (parseFloat(pasAjuste) || 0) : (met.pasivosNoCubCOP || 0);
    const educacion = parseFloat(clientData?.educationCosts) || 0;
    const cobRequerida = (ingresoReemplazar * 12 * 10) + pasivosEfectivos + educacion;

    // Actualizar Pasos 1-3 en pantalla
    set('c4-vida-reemplazar', c4cop(ingresoReemplazar) + '/mes');
    set('c4-vida-desg-ing',   c4cop(ingresoReemplazar * 12 * 10));
    set('c4-vida-desg-pas',   c4cop(pasivosEfectivos));
    set('c4-vida-req',        c4cop(cobRequerida));
    // Guardar valor numérico en data-valor para que c1RecalcularPaso4 lo lea sin parsing
    const reqSpan = document.getElementById('c4-vida-req');
    if (reqSpan) reqSpan.dataset.valor = cobRequerida;

    // Paso 4-5: Leer cobertura actual DIRECTO del DOM y recalcular
    // (función dedicada — no depende del parámetro `resp` para estos campos)
    c1RecalcularPaso4(cobRequerida);


    // Capa 1 C2: Seguro de invalidez
    const edad        = parseInt(clientData?.age) || 40;
    const aniosProd   = Math.max(0, 65 - edad);
    const ingActivo   = parseFloat(clientData?.monthlyActiveIncome) || 0;
    // Descontar ingresos pasivos que sobreviven (misma fuente que C1)
    const ingPasivosSobrevInv = parseFloat(met?.ingPasivosSobrevCOP) || 0;
    const aReemplazarInv = Math.max(0, ingActivo - ingPasivosSobrevInv);
    const reqInv = aReemplazarInv * 12 * aniosProd;
    const actInv = parseFloat(resp?.cobInvalidez) || 0;
    const gapInv = reqInv - actInv;
    set('c4-inv-anios',       `${aniosProd} años (65 - ${edad})`);
    set('c4-inv-ing-activo',  c4cop(ingActivo) + '/mes');
    set('c4-inv-ing-pasivos', c4cop(ingPasivosSobrevInv) + '/mes');
    set('c4-inv-reemplazo',   c4cop(aReemplazarInv) + '/mes');
    set('c4-inv-req',  c4cop(reqInv));
    set('c4-inv-req2', c4cop(reqInv));
    set('c4-inv-act',  c4cop(actInv));
    set('c4-inv-gap',  gapInv <= 0 ? c4cop(0) + ' ✓' : c4cop(gapInv),
        gapInv <= 0 ? 'c4-cob-ok' : 'c4-cob-mal');

    // Capa 1 C5: actualizar badges de separación patrimonial en tiempo real
    c5UpdateBadges(met);

    // Capa 1 C3: RC badges
    const rcItems = c1BuildRCItems(met, gastosMes, clientData);
    rcItems.forEach((item, i) => {
        set(`c4-rc-req-${i}`, c4cop(item.recomendada));
        const actRC = parseFloat(resp?.rc?.[`rc_${i}`]) || 0;
        const badge = document.getElementById(`c4-rc-badge-${i}`);
        if (badge) {
            if      (actRC === 0)               { badge.textContent = '🔴 No tiene';    badge.className = 'c4-rc-badge c4-rc-mal'; }
            else if (actRC < item.recomendada)  { badge.textContent = '⚠️ Insuficiente'; badge.className = 'c4-rc-badge c4-rc-warn'; }
            else                                { badge.textContent = '✅ Adecuada';     badge.className = 'c4-rc-badge c4-rc-ok'; }
        }
    });

    // Capa 1 C4: Estructuras detectadas
    const estructEl = document.getElementById('c4-estruc-info');
    if (estructEl) {
        const _PROT_FUERTE = ['Trust','Fideicomiso','Fundación'];
        const _PROT_MEDIA  = ['Holding','LLC'];
        const _PROT_REAL   = [..._PROT_FUERTE, ..._PROT_MEDIA];
        const _NO_PROT     = ['Sociedad Comercial','Propiedad Directa','Otro'];
        const actProteg    = met.activosConEstructura.filter(a => _PROT_REAL.includes(a.leg));
        const actNoProt    = met.activosConEstructura.filter(a => !_PROT_REAL.includes(a.leg));

        if (actProteg.length === 0 && actNoProt.length === 0) {
            estructEl.innerHTML = '<span style="color:#8892a4;font-size:1rem">Todos los activos en Propiedad Directa → 0 pts</span>';
        } else {
            let html = '';
            if (actProteg.length > 0) {
                html += '<div style="font-size:1rem;font-weight:700;color:#34d399;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px">Con estructura de protección</div>';
                html += actProteg.map(a => `<div class="c4-estruc-item">
                    <span class="c4-estruc-name">${a.name}</span>
                    <span class="c4-estruc-leg" style="color:#34d399">${a.leg} ✅</span>
                </div>`).join('');
            }
            if (actNoProt.length > 0) {
                html += '<div style="font-size:1rem;font-weight:700;color:#f87171;text-transform:uppercase;letter-spacing:.04em;margin:6px 0 4px 0">Sin estructura de protección</div>';
                html += actNoProt.map(a => `<div class="c4-estruc-item">
                    <span class="c4-estruc-name">${a.name}</span>
                    <span class="c4-estruc-leg" style="color:#8892a4">${a.leg}${_NO_PROT.includes(a.leg) ? ' — no cuenta como protección ❌' : ' ❌'}</span>
                </div>`).join('');
            }
            html += `<div class="c4-estruc-pct">
                <span>🛡️ ${met.pctProtegido.toFixed(1)}% bajo estructura de protección</span>
                <span style="color:#8892a4">${(100-met.pctProtegido).toFixed(1)}% en propiedad directa o sin protección</span>
            </div>`;
            estructEl.innerHTML = html;
        }
    }

    // Capa 1 C6: Contexto sucesorio
    const sucEl = document.getElementById('c4-suc-contexto');
    if (sucEl) {
        const ESTRUC_SUCES = ['Trust','Fideicomiso','Fundación'];
        const actSuces  = met.activosConEstructura.filter(a => ESTRUC_SUCES.includes(a.leg));
        const pctProt   = met.patriCOP > 0
            ? (actSuces.reduce((s,a) => s+a.neto,0) / met.patriCOP * 100).toFixed(1)
            : '0.0';
        const estructRows = actSuces.length > 0
            ? actSuces.map(a =>
                `<div class="c4-ctx-row c6-sub-row"><span>&nbsp;&nbsp;• ${a.name} (${a.leg})</span><strong style="color:#34d399">${c4cop(a.neto)}</strong></div>`
              ).join('') +
              `<div class="c4-ctx-row c6-sub-row"><span>&nbsp;&nbsp;% del patrimonio protegido</span><strong style="color:#34d399">${pctProt}%</strong></div>`
            : `<div class="c4-ctx-row c6-sub-row"><span>&nbsp;&nbsp;— Ninguna detectada</span><strong style="color:#8892a4">—</strong></div>`;
        sucEl.innerHTML =
            `<div class="c4-ctx-row"><span>Patrimonio total</span><strong>${c4cop(met.patriCOP)}</strong></div>` +
            `<div class="c4-ctx-row"><span>Países con activos</span><strong>${met.paises.size || 0}</strong></div>` +
            `<div class="c4-ctx-row"><span>Activos empresariales</span><strong>${met.activosEmpresariales.length > 0 ? 'Sí' : 'No'}</strong></div>` +
            `<div class="c4-ctx-row"><span>Estructuras sucesorias</span></div>` +
            estructRows;
    }
    c6UpdateScore(met, clientData);

    // Capas 2-4
    // La UI de Capa 2 se actualiza desde c2UpdateUI
    c2UpdateUI(met, gastosMes, clientData);

    const ir = met.inmuRenta;
    set('c4-auto-inm',
        ir >= 2 ? `${ir} propiedades en renta → 2 pts`
        : ir === 1 ? `1 propiedad en renta → 1 pt`
        : 'Ninguna en renta → 0 pts');
    // c4-auto-tipos/monedas/paises ya no existen: Capa 4 usa c4dBuildHTML que los renderiza directamente
}

// ── Renderizar tarjeta de score global ────────────────────────────────
function c4RenderGlobal(scores) {
    const total = (scores.proteccion || 0) + (scores.liquidez || 0)
                + (scores.crecimiento || 0) + (scores.diversificacion || 0);
    const max   = 40;
    const pct   = Math.min(100, (total / max) * 100);

    // Etiqueta y clase de color según puntaje
    let cls, etq, sub;
    if      (total >= 35) { cls = 'excelente';  etq = '🏆 Excelente';   sub = 'Arquitectura patrimonial sólida y bien protegida'; }
    else if (total >= 28) { cls = 'muybueno';   etq = '✅ Muy bueno';   sub = 'Buena base — algunos criterios por optimizar'; }
    else if (total >= 20) { cls = 'aceptable';  etq = '🟡 Aceptable';   sub = 'Avances importantes, pero hay brechas relevantes'; }
    else if (total >= 12) { cls = 'deficiente'; etq = '🟠 Deficiente';  sub = 'Vulnerabilidades significativas que atender'; }
    else                  { cls = 'critico';    etq = '🔴 Crítico';     sub = 'Patrimonio expuesto — acción inmediata requerida'; }

    const LABELS = { proteccion: 'Protección', liquidez: 'Liquidez', crecimiento: 'Crecimiento', diversificacion: 'Diversificación' };
    const FILLS  = { proteccion: '#4a90d9', liquidez: '#34d399', crecimiento: '#f0c040', diversificacion: '#a78bfa' };

    const barras = ['proteccion','liquidez','crecimiento','diversificacion'].map(c => {
        const pts = scores[c] || 0;
        const w   = Math.min(100, (pts / 10) * 100).toFixed(1);
        return `<div class="c4g-bar-row">
            <span style="min-width:90px">${LABELS[c]}</span>
            <div class="c4g-bar-track">
                <div class="c4g-bar-fill" style="width:${w}%;background:${FILLS[c]}"></div>
            </div>
            <span class="c4g-bar-pts">${pts.toFixed(1)}</span>
        </div>`;
    }).join('');

    const inner = document.getElementById('c4-global-inner');
    if (!inner) return;
    inner.innerHTML = `
        <div class="c4g-score sc-${cls}">${total.toFixed(1)}</div>
        <div class="c4g-info">
            <div class="c4g-lbl">Salud Patrimonial Global</div>
            <div class="c4g-etq sc-${cls}">${etq}</div>
            <div class="c4g-sub">${sub}</div>
        </div>
        <div class="c4g-bars">${barras}</div>`;
}

// ── Recalcular todos los puntajes y refrescar pantalla ────────────────
function c4Recalcular(met, gastosMes, resp, clientData) {
    const CAPAS = ['proteccion','liquidez','crecimiento','diversificacion'];
    const scores = {};
    CAPAS.forEach(c => {
        const pts = c4Score(c, resp[c] || {}, met, gastosMes, clientData);
        scores[c] = pts;
        const el = document.getElementById(`c4-score-${c}`);
        if (el) el.textContent = pts.toFixed(1);
    });
    c4RenderGlobal(scores);
    // Semáforo Capa 1
    const sem1 = c1SemaforoCapa(scores.proteccion);
    const b1 = document.getElementById('c4-c1-semaforo');
    if (b1) { b1.textContent = sem1.label; b1.className = 'c4-c1-sem-badge c4-c1-sem-' + sem1.cls; }
    // Semáforo Capa 2
    const sem2 = c2Semaforo(scores.liquidez);
    const b2 = document.getElementById('c2-semaforo-badge');
    if (b2) { b2.textContent = sem2.label; b2.className = 'c2-sem-badge c2-sem-' + sem2.cls; }
    // Semáforo Capa 3
    const sem3 = c3Semaforo(scores.crecimiento);
    const b3 = document.getElementById('c3-semaforo-badge');
    if (b3) { b3.textContent = sem3.label; b3.className = 'c3-sem-badge c3-sem-' + sem3.cls; }
    // Score Capa 4 — ya calculado y embebido en el HTML, solo actualizar badge en card header
    const el4 = document.getElementById('c4-score-diversificacion');
    if (el4 && met._activos) {
        const d4 = c4dCalcularMetricas(met._activos, gastosMes, clientData);
        const s4 = c4dScores(d4);
        el4.textContent = s4.final.toFixed(1);
        scores.diversificacion = s4.final;
        c4RenderGlobal(scores);
    }
}

function c1SemaforoCapa(s) {
    if (s >= 8) return { cls: 'optimo',    label: '🟢 ÓPTIMO' };
    if (s >= 6) return { cls: 'solido',    label: '🟡 SÓLIDO' };
    if (s >= 4) return { cls: 'deficiente',label: '🟠 DEFICIENTE' };
    return              { cls: 'critico',  label: '🔴 CRÍTICO' };
}

// ── Leer todas las respuestas del DOM ─────────────────────────────────
function c4LeerDOM(met, gastosMes, clientData) {
    const radio = n => { const e = document.querySelector(`[name="${n}"]:checked`); return e ? e.value : null; };
    const num   = id => document.getElementById(id)?.value || '';

    const rcItems = c1BuildRCItems(met || {activosEmpresariales:[],inmueblesArrendados:[],vehiculosTrabajo:[]}, gastosMes, clientData);
    const rc = {};
    rcItems.forEach((_, i) => { rc[`rc_${i}`] = num(`c4-rc-actual-${i}`); });

    return {
        proteccion: {
            cobVidaTrad:         num('c4-vida-input'),
            sumAseguradaSkandiaCP: num('c4-vida-skandia'),
            ingPasivosAjuste:    num('c4-vida-ing-ajuste'),
            pasivosNoCubAjuste:  num('c4-vida-pas-ajuste'),
            cobInvalidez:        num('c4-inv-input'),
            rc,
            separacionPatrimonial: c5LeerSepDOM(met),
            planificacionSucesoria: c6LeerDOM(met, clientData),
        },
        liquidez: {},
        crecimiento: c3LeerDOM(met),
        diversificacion: {},  // Capa 4 completamente automática
    };
}

// ── Helper: pregunta con radio pills ──────────────────────────────────
function c4Q(name, label, opciones, guardado, ptsTxt) {
    const opts = opciones.map(([v, l]) =>
        `<label class="c4-opt">
            <input type="radio" name="${name}" value="${v}"${guardado === v ? ' checked' : ''}>
            <span class="c4-opt-lbl">${l}</span>
        </label>`
    ).join('');
    return `
        <div class="c4-q">
            <div class="c4-q-lbl">
                <span>${label}</span>
                <span class="c4-tag-pts">${ptsTxt}</span>
            </div>
            <div class="c4-opts">${opts}</div>
        </div>`;
}

// ── Helper: campo solo lectura (calculado automáticamente) ────────────
function c4Auto(id, label, ptsTxt) {
    return `
        <div class="c4-q">
            <div class="c4-q-lbl">
                <span>${label}</span>
                <span class="c4-tag-auto">AUTO</span>
                <span class="c4-tag-pts">${ptsTxt}</span>
            </div>
            <div class="c4-auto" id="${id}">Calculando…</div>
        </div>`;
}


// ══════════════════════════════════════════════════════════════════════
// CAPA 2 — LIQUIDEZ
// ══════════════════════════════════════════════════════════════════════

function c2Semaforo(pts) {
    if (pts >= 9)   return { cls: 'optimo',    label: '🟢 ÓPTIMO' };
    if (pts >= 7.5) return { cls: 'muybueno',  label: '🟢 MUY BUENO' };
    if (pts >= 6)   return { cls: 'aceptable', label: '🟡 ACEPTABLE' };
    if (pts >= 4)   return { cls: 'deficiente',label: '🟠 DEFICIENTE' };
    return              { cls: 'critico',  label: '🔴 CRÍTICO' };
}

function c2Calcular(met, gastosMes, clientData) {
    const tipoIng    = (clientData?.tipoIngresosActivos || '').toLowerCase();
    const metaM      = tipoIng === 'empleado' ? 6 : 9;
    const defMensual = Math.max(0, gastosMes - (met.ingPasivoTotalCOP || 0));
    const liqAlta    = met.altaLiqCOP || 0;
    const liqMedia   = met.liquidezMediaCOP || 0;
    const patriTotal = met.patriCOP || 0;
    const metaCOP    = defMensual * metaM;
    const excedente  = Math.max(0, liqAlta - metaCOP);
    const pctLiq     = patriTotal > 0 ? (liqAlta / patriTotal) * 100 : 0;

    // Meses cubiertos (999 = sin déficit)
    const mesesCub  = defMensual > 0 ? liqAlta / defMensual   : (liqAlta > 0   ? 999 : 0);
    const mesesExc  = defMensual > 0 ? excedente / defMensual  : (excedente > 0 ? 999 : 0);
    const mesesSemi = defMensual > 0 ? liqMedia / defMensual   : (liqMedia > 0  ? 999 : 0);

    // C1 — Fondo de emergencia (3pts)
    let sc1 = 0;
    if (mesesCub >= metaM)  sc1 = 3;
    else if (mesesCub >= 3) sc1 = 2;

    // C2 — Reserva de oportunidad (2pts)
    let sc2 = 0;
    if (mesesExc >= 3)      sc2 = 2;
    else if (mesesExc >= 1) sc2 = 1;

    // C3 — Activos semilíquidos estratégicos (3pts)
    let sc3 = 0;
    if (mesesSemi >= 12)     sc3 = 3;
    else if (mesesSemi >= 6) sc3 = 2;
    else if (mesesSemi >= 3) sc3 = 1;

    // C4 — % liquidez sobre patrimonio (1pt)
    let sc4 = 0;
    if (pctLiq >= 10 && pctLiq <= 15)                                 sc4 = 1;
    else if ((pctLiq >= 5 && pctLiq < 10)||(pctLiq > 15 && pctLiq <= 20)) sc4 = 0.5;

    // Total: máx bruto = 9, normalizado a 10
    const bruto = sc1 + sc2 + sc3 + sc4;
    const total = parseFloat(((bruto / 9) * 10).toFixed(1));

    // Nota crédito: mostrar solo si C1 < 2 Y C2 = 0
    const mostrarNotaCredito = sc1 < 2 && sc2 === 0;

    return {
        tipoIng, metaM, defMensual, liqAlta, liqMedia, patriTotal,
        metaCOP, excedente, pctLiq,
        mesesCub, mesesExc, mesesSemi,
        sc1, sc2, sc3, sc4,
        bruto, total, mostrarNotaCredito,
    };
}

function c2UpdateUI(met, gastosMes, clientData) {
    const sel = id => document.getElementById(id);
    const setText = (id, txt) => { const e = sel(id); if (e) e.textContent = txt; };
    const setHtml = (id, html) => { const e = sel(id); if (e) e.innerHTML = html; };
    const cop = c4cop;

    const c = c2Calcular(met, gastosMes, clientData);

    // ── Contexto automático ─────────────────────────────────────────────
    const tipoLabel = c.tipoIng === 'empleado'      ? 'Empleado'
                    : c.tipoIng === 'independiente' ? 'Independiente'
                    : c.tipoIng === 'empresario'    ? 'Empresario'
                    : c.tipoIng === 'mixto'         ? 'Mixto'
                    : 'Sin definir';
    setText('c2-ctx-perfil',   tipoLabel);
    setText('c2-ctx-meta-txt', `${c.metaM} meses de déficit neto`);
    setText('c2-ctx-gastos',   cop(gastosMes) + '/mes');
    setText('c2-ctx-ingpas',   cop(met.ingPasivoTotalCOP || 0) + '/mes');
    setText('c2-ctx-deficit',  cop(c.defMensual) + '/mes');
    setText('c2-ctx-liqalta',  cop(c.liqAlta));
    setText('c2-ctx-metacop',  cop(c.metaCOP));
    setText('c2-ctx-semiliq',  cop(c.liqMedia));

    // ── C1: Fondo de emergencia ─────────────────────────────────────────
    const listaAlta = (met.activosAltaLiq || []).map(a =>
        `<div class="c2-activo-row">
            <span class="c2-activo-name">${a.name}</span>
            <span class="c2-activo-sub">${a.subtype}</span>
            <span class="c2-activo-val">${cop(a.neto)}</span>
        </div>`
    ).join('') || '<div class="c2-activo-empty">Sin activos de alta liquidez detectados</div>';
    setHtml('c2-c1-activos', listaAlta);

    const mesesTxt = c.mesesCub >= 999 ? '∞' : c.mesesCub.toFixed(1);
    setText('c2-c1-meses',    `${mesesTxt} meses`);
    setText('c2-c1-deficit',  `déficit neto ${cop(c.defMensual)}/mes`);
    setText('c2-c1-meta',     `${c.metaM} meses`);
    const tipoMetaLbl = c.tipoIng === 'empleado' ? 'Empleado: 6 meses' : `${tipoLabel}: ${c.metaM} meses`;
    setText('c2-c1-meta-hint', tipoMetaLbl);
    const gap1COP = Math.max(0, c.metaCOP - c.liqAlta);
    const c1El = sel('c2-c1-gap');
    if (c1El) {
        if (gap1COP > 0) {
            c1El.textContent = `Gap: ${cop(gap1COP)} — faltan ${Math.max(0, c.metaM - c.mesesCub).toFixed(1)} meses`;
            c1El.className = 'c2-gap-mal';
        } else {
            c1El.textContent = '✅ Meta cubierta';
            c1El.className = 'c2-gap-ok';
        }
    }
    const c1Badge = sel('c2-c1-badge');
    if (c1Badge) {
        c1Badge.textContent = c.sc1.toFixed(1) + ' / 3 pts';
        c1Badge.className = 'c2-crit-badge ' + (c.sc1 >= 3 ? 'c2-badge-ok' : c.sc1 >= 2 ? 'c2-badge-warn' : 'c2-badge-mal');
    }

    // ── C2: Reserva de oportunidad ─────────────────────────────────────
    setText('c2-c2-liqalta',   cop(c.liqAlta));
    setText('c2-c2-meta',      cop(c.metaCOP));
    setText('c2-c2-excedente', cop(c.excedente));
    const mesesExcTxt = c.mesesExc >= 999 ? '∞' : c.mesesExc.toFixed(1);
    setText('c2-c2-meses',     `${mesesExcTxt} meses de déficit neto`);
    const c2Badge = sel('c2-c2-badge');
    if (c2Badge) {
        c2Badge.textContent = c.sc2.toFixed(1) + ' / 2 pts';
        c2Badge.className = 'c2-crit-badge ' + (c.sc2 >= 2 ? 'c2-badge-ok' : c.sc2 >= 1 ? 'c2-badge-warn' : 'c2-badge-mal');
    }

    // ── Nota crédito (solo si C1 < 2 Y C2 = 0) ───────────────────────
    const notaEl = sel('c2-nota-credito');
    if (notaEl) notaEl.style.display = c.mostrarNotaCredito ? 'block' : 'none';

    // ── C3: Activos semilíquidos estratégicos ─────────────────────────
    const listaSemi = (met.activosSemiLiq || []).map(a => {
        const val = a.montoAccesible != null ? a.montoAccesible : a.neto;
        const plazo = a.plazoLiqDias ? `${a.plazoLiqDias} días hábiles` : '—';
        return `<div class="c2-activo-row">
            <span class="c2-activo-name">${a.name}</span>
            <span class="c2-activo-sub">${a.subtype}${a.montoAccesible != null ? ' · monto accesible' : ''}</span>
            <span class="c2-activo-val">${cop(val)}</span>
            <span class="c2-activo-plazo">⏱ ${plazo}</span>
        </div>`;
    }).join('') || '<div class="c2-activo-empty">Sin activos semilíquidos estratégicos detectados</div>';
    setHtml('c2-c3-activos', listaSemi);
    setText('c2-c3-total',   cop(c.liqMedia));
    const mesesSemiTxt = c.mesesSemi >= 999 ? '∞' : c.mesesSemi.toFixed(1);
    setText('c2-c3-meses',   `${mesesSemiTxt} meses de déficit neto`);
    const maxPlazo = (met.activosSemiLiq || []).reduce((mx, a) => Math.max(mx, a.plazoLiqDias || 0), 0);
    setText('c2-c3-plazo',   maxPlazo > 0 ? `Plazo máximo de liquidación: ${maxPlazo} días hábiles` : 'Sin plazo de liquidación registrado');
    const c3Badge = sel('c2-c3-badge');
    if (c3Badge) {
        c3Badge.textContent = c.sc3.toFixed(1) + ' / 3 pts';
        c3Badge.className = 'c2-crit-badge ' + (c.sc3 >= 3 ? 'c2-badge-ok' : c.sc3 >= 2 ? 'c2-badge-ok' : c.sc3 >= 1 ? 'c2-badge-warn' : 'c2-badge-mal');
    }

    // ── C4: % liquidez sobre patrimonio ───────────────────────────────
    setText('c2-c4-pct',   `${c.pctLiq.toFixed(1)}%`);
    const c4Lbl = (c.pctLiq >= 10 && c.pctLiq <= 15)              ? '✅ Óptimo — entre 10% y 15%'
                : (c.pctLiq > 15 && c.pctLiq <= 20)               ? '⚠️ Algo alto — evalúa invertir el excedente'
                : (c.pctLiq >= 5  && c.pctLiq < 10)               ? '⚠️ Algo bajo — considera aumentar liquidez'
                : c.pctLiq > 20                                    ? '🔴 Exceso de liquidez — alto costo de oportunidad'
                :                                                    '🔴 Insuficiente';
    setText('c2-c4-label',  c4Lbl);
    const c4Badge = sel('c2-c4-badge');
    if (c4Badge) {
        c4Badge.textContent = c.sc4.toFixed(1) + ' / 1 pt';
        c4Badge.className = 'c2-crit-badge ' + (c.sc4 >= 1 ? 'c2-badge-ok' : c.sc4 >= 0.5 ? 'c2-badge-warn' : 'c2-badge-mal');
    }
}

function c2BuildHTML(rl, met, gastosMes, clientData) {
    const tipoIng   = (clientData?.tipoIngresosActivos || '').toLowerCase();
    const metaM     = tipoIng === 'empleado' ? 6 : 9;
    const tipoLabel = tipoIng === 'empleado'      ? 'Empleado'
                    : tipoIng === 'independiente' ? 'Independiente'
                    : tipoIng === 'empresario'    ? 'Empresario'
                    : tipoIng === 'mixto'         ? 'Mixto'
                    : 'Sin definir';

    return `
    <!-- ── CAPA 2: LIQUIDEZ ────────────────────────────────────────── -->
    <div class="c4-card">
        <div class="c4-card-hd">
            <div class="c4-num c4n-2">2</div>
            <div>
                <div class="c4-title">Liquidez</div>
                <div class="c4-sub">Disponibilidad inmediata de recursos — máx 10 pts</div>
            </div>
            <div class="c4-badge">
                <div class="c4-badge-n" id="c4-score-liquidez">—</div>
                <div class="c4-badge-d">/10 pts</div>
            </div>
        </div>
        <div class="c4-body">

        <!-- Objetivo ─────────────────────────────────────────────── -->
        <div class="c2-objetivo">
            Garantizar disponibilidad inmediata de recursos para cubrir emergencias, aprovechar oportunidades de inversión, sostener el nivel de vida ante interrupciones de ingresos y evitar la venta forzada de activos estratégicos.
        </div>

        <!-- Contexto automático ─────────────────────────────────── -->
        <div class="c4-criterio">
            <div class="c4-criterio-hd">
                <span class="c4-crit-num">AUTO</span>
                <span class="c4-crit-title">Datos de base</span>
            </div>
            <div class="c4-auto-ctx">
                <div class="c4-ctx-row">
                    <span>Perfil de ingresos</span>
                    <strong id="c2-ctx-perfil">${tipoLabel}</strong>
                </div>
                <div class="c4-ctx-row">
                    <span>Meta fondo de emergencia</span>
                    <strong id="c2-ctx-meta-txt">${metaM} meses de déficit neto</strong>
                </div>
                <div class="c4-ctx-sub" style="border-top:1px solid rgba(255,255,255,.05);padding-top:6px;margin-top:2px"></div>
                <div class="c4-ctx-row">
                    <span>Gastos mensuales</span>
                    <strong id="c2-ctx-gastos">Calculando…</strong>
                </div>
                <div class="c4-ctx-row">
                    <span>Ingresos pasivos mensuales</span>
                    <strong id="c2-ctx-ingpas">Calculando…</strong>
                </div>
                <div class="c4-ctx-row" style="border-top:1px solid rgba(255,255,255,.05);padding-top:4px;margin-top:2px">
                    <span style="font-weight:700;color:#e2e8f0">Déficit mensual neto</span>
                    <strong id="c2-ctx-deficit" style="font-size:1.3rem">Calculando…</strong>
                </div>
                <div class="c4-ctx-sub" style="border-top:1px solid rgba(255,255,255,.05);padding-top:6px;margin-top:2px"></div>
                <div class="c4-ctx-row">
                    <span>Liquidez Alta disponible</span>
                    <strong id="c2-ctx-liqalta">Calculando…</strong>
                </div>
                <div class="c4-ctx-row">
                    <span>Meta fondo de emergencia</span>
                    <strong id="c2-ctx-metacop">Calculando…</strong>
                </div>
                <div class="c4-ctx-row">
                    <span>Activos semilíquidos estratégicos</span>
                    <strong id="c2-ctx-semiliq">Calculando…</strong>
                </div>
            </div>
        </div>

        <!-- C1: Fondo de emergencia ────────────────────────────── -->
        <div class="c4-criterio">
            <div class="c4-criterio-hd">
                <span class="c4-crit-num">C1</span>
                <span class="c4-crit-title">Fondo de emergencia</span>
                <span class="c4-tag-auto">AUTO</span>
                <span class="c4-tag-pts">≥meta: 3 / ≥3m: 2 / &lt;3m: 0</span>
                <span class="c2-crit-badge" id="c2-c1-badge">—</span>
            </div>
            <div class="c2-activos-list" id="c2-c1-activos">
                <div class="c2-activo-empty">Calculando…</div>
            </div>
            <div class="c4-auto-ctx">
                <div class="c4-ctx-row">
                    <span>Meses cubiertos</span>
                    <strong id="c2-c1-meses">—</strong>
                </div>
                <div class="c4-ctx-row">
                    <span>Base de cálculo</span>
                    <strong id="c2-c1-deficit">—</strong>
                </div>
                <div class="c4-ctx-row">
                    <span>Meta</span>
                    <strong id="c2-c1-meta">—</strong>
                    <span class="c4-ctx-sub" style="margin-left:6px" id="c2-c1-meta-hint"></span>
                </div>
                <div id="c2-c1-gap" class="c2-gap-ok">—</div>
            </div>
        </div>

        <!-- C2: Reserva de oportunidad ─────────────────────────── -->
        <div class="c4-criterio">
            <div class="c4-criterio-hd">
                <span class="c4-crit-num">C2</span>
                <span class="c4-crit-title">Reserva de oportunidad</span>
                <span class="c4-tag-auto">AUTO</span>
                <span class="c4-tag-pts">≥3m excedente: 2 / ≥1m: 1 / 0: 0</span>
                <span class="c2-crit-badge" id="c2-c2-badge">—</span>
            </div>
            <div class="c4-auto-ctx">
                <div class="c4-ctx-row">
                    <span>Liquidez Alta total</span>
                    <strong id="c2-c2-liqalta">—</strong>
                </div>
                <div class="c4-ctx-row">
                    <span>− Meta fondo emergencia</span>
                    <strong id="c2-c2-meta">—</strong>
                </div>
                <div class="c4-ctx-row" style="border-top:1px solid rgba(255,255,255,.07);padding-top:4px;margin-top:2px">
                    <span style="font-weight:700;color:#e2e8f0">Excedente para oportunidades</span>
                    <strong id="c2-c2-excedente" style="font-size:1.3rem">—</strong>
                </div>
                <div class="c4-ctx-row">
                    <span>Equivale a</span>
                    <strong id="c2-c2-meses">—</strong>
                </div>
            </div>
        </div>

        <!-- Nota crédito (condicional: C1 < 2pts Y C2 = 0) ──────── -->
        <div id="c2-nota-credito" class="c2-nota-credito" style="display:none">
            💡 Dado que la liquidez disponible es baja, contar con una línea de crédito aprobada no usada puede servir como red de seguridad temporal mientras se construye el fondo de emergencia. Consulta con tu banco las opciones disponibles.
        </div>

        <!-- C3: Activos semilíquidos estratégicos ───────────────── -->
        <div class="c4-criterio">
            <div class="c4-criterio-hd">
                <span class="c4-crit-num">C3</span>
                <span class="c4-crit-title">Activos semilíquidos estratégicos</span>
                <span class="c4-tag-auto">AUTO</span>
                <span class="c4-tag-pts">≥12m: 3 / ≥6m: 2 / ≥3m: 1 / &lt;3m: 0</span>
                <span class="c2-crit-badge" id="c2-c3-badge">—</span>
            </div>
            <div class="c2-activos-list" id="c2-c3-activos">
                <div class="c2-activo-empty">Calculando…</div>
            </div>
            <div class="c4-auto-ctx">
                <div class="c4-ctx-row">
                    <span>Total semilíquido estratégico</span>
                    <strong id="c2-c3-total">—</strong>
                </div>
                <div class="c4-ctx-row">
                    <span>Equivale a</span>
                    <strong id="c2-c3-meses">—</strong>
                </div>
                <div class="c4-ctx-row">
                    <span id="c2-c3-plazo" style="color:#8892a4;font-size:1rem">—</span>
                </div>
            </div>
        </div>

        <!-- C4: % liquidez sobre patrimonio ─────────────────────── -->
        <div class="c4-criterio">
            <div class="c4-criterio-hd">
                <span class="c4-crit-num">C4</span>
                <span class="c4-crit-title">% liquidez sobre patrimonio</span>
                <span class="c4-tag-auto">AUTO</span>
                <span class="c4-tag-pts">10-15%: 1 / 5-10% ó 15-20%: 0.5 / resto: 0</span>
                <span class="c2-crit-badge" id="c2-c4-badge">—</span>
            </div>
            <div class="c4-auto-ctx">
                <div class="c4-ctx-row">
                    <span>% liquidez sobre patrimonio total</span>
                    <strong id="c2-c4-pct" style="font-size:1.3rem">—</strong>
                </div>
                <div class="c4-ctx-row">
                    <span id="c2-c4-label">—</span>
                </div>
                <div class="c4-ctx-sub">Rango óptimo: entre 10% y 15% del patrimonio total</div>
            </div>
        </div>

        <!-- Semáforo resultado ──────────────────────────────────── -->
        <div class="c4-c1-sem-wrap">
            <span class="c4-c1-sem-lbl">Resultado Capa 2</span>
            <span class="c2-sem-badge c2-sem-critico" id="c2-semaforo-badge">Calculando…</span>
        </div>

        </div><!-- .c4-body -->
    </div>`;
}

// ── Construir HTML completo de la sección ─────────────────────────────
function c4BuildHTML(g, met, gastosMes, clientData, activos) {
    activos = activos || [];
    const rp = g.proteccion     || {};
    const rl = g.liquidez       || {};
    const rc = g.crecimiento    || {};
    const rd = g.diversificacion|| {};

    return `
    <!-- PUNTUACIÓN GLOBAL ──────────────────────────────────────── -->
    <div class="c4-global">
        <div id="c4-global-inner" style="display:contents">
            <div class="c4g-score sc-critico">—</div>
            <div class="c4g-info">
                <div class="c4g-lbl">Salud Patrimonial Global</div>
                <div class="c4g-etq sc-critico">Calculando…</div>
                <div class="c4g-sub">Responde las preguntas para ver el resultado</div>
            </div>
        </div>
    </div>

    <!-- CUATRO CAPAS ─────────────────────────────────────────────── -->
    <div class="c4-grid">

    ${c1BuildCapa1HTML(rp, met, gastosMes, clientData)}

    ${c2BuildHTML(rl, met, gastosMes, clientData)}

    ${c3BuildHTML(rc, met, gastosMes, clientData)}

    ${c4dBuildHTML(activos, gastosMes, clientData)}

    </div><!-- /.c4-grid -->

    <!-- GUARDAR ────────────────────────────────────────────────── -->
    <div class="c4-save-bar">
        <button class="btn-primary" id="c4-save-btn">💾 Guardar evaluación</button>
    </div>`;
}

// ── Inicializar sección (se llama cada vez que el asesor navega a ella) ──
async function initializeCapasSection() {
    if (!selectedClientId) return;

    const section = document.getElementById('capas-section');
    if (!section) return;

    const gastosMes = parseFloat(selectedClientData?.monthlyExpenses) || 0;
    let clientData = selectedClientData || {};

    // 1. Cargar activos y calcular métricas auto
    let activos = [];
    try { activos = await c4GetActivos(); }
    catch (e) { console.error('Error cargando activos para 4 capas:', e); }
    const met = c4Metricas(activos, gastosMes);
    met._activos = activos;  // para c4Score diversificacion

    // 2. Cargar respuestas guardadas — bajo clients/{id}
    let guardado = {};
    let guardadoC3 = {};
    try {
        const snap = await getDoc(doc(db, 'clients', selectedClientId));
        if (snap.exists()) {
            if (snap.data().evaluacion4capas) guardado = snap.data().evaluacion4capas;
            if (snap.data().capa3Crecimiento) guardadoC3 = snap.data().capa3Crecimiento;
        }
    } catch (e) { console.error('Error cargando evaluacion4capas:', e); }
    // Mezclar datos guardados de Capa 3 en guardado.crecimiento
    if (guardadoC3.negociosEscalables || guardadoC3.retornoEstimadoAsesor != null) {
        guardado.crecimiento = {
            ...(guardado.crecimiento || {}),
            negociosEscalables:    guardadoC3.negociosEscalables || {},
            retornoEstimadoAsesor: guardadoC3.retornoEstimadoAsesor ?? null,
        };
    }

    // Inferencia automática: si hay activos Empresariales y no hay tipo definido, sugerir empresario
    if (!clientData.tipoIngresosActivos && met.activosEmpresariales.length > 0) {
        clientData = { ...clientData, tipoIngresosActivos: 'empresario' };
        const radEmp = document.querySelector('input[name="tipo-ingresos-activos"][value="empresario"]');
        if (radEmp) radEmp.checked = true;
    }

    // 3. Pintar HTML con respuestas pre-seleccionadas
    section.innerHTML = c4BuildHTML(guardado, met, gastosMes, clientData, activos);

    // 4. Actualizar campos auto + scores iniciales
    c4UpdateAutos(met, gastosMes, guardado.proteccion || {}, clientData);
    c4Recalcular(met, gastosMes, guardado, clientData);

    // 5. Listener general: radios y números no-cobertura recalculan todo
    const onChange = () => {
        const resp = c4LeerDOM(met, gastosMes, clientData);
        c4UpdateAutos(met, gastosMes, resp.proteccion || {}, clientData);
        c4Recalcular(met, gastosMes, resp, clientData);
    };

    // IDs de campos de cobertura que tienen listener dedicado — excluirlos del onChange general
    const COB_IDS = new Set(['c4-vida-input', 'c4-vida-skandia']);

    // Registrar en todos los inputs EXCEPTO los de cobertura del Paso 4
    section.querySelectorAll('input[type="radio"], input[type="number"]')
        .forEach(r => { if (!COB_IDS.has(r.id)) r.addEventListener('change', onChange); });
    section.querySelectorAll('input[type="number"]')
        .forEach(r => { if (!COB_IDS.has(r.id)) r.addEventListener('input', onChange); });

    // 5b. Listeners DEDICADOS para los campos de cobertura del Paso 4.
    // Se registran sobre el contenedor padre (delegación) para garantizar que funcionen
    // incluso si los inputs se recrean o existen problemas de timing en el DOM.
    const onCoberturaInput = (e) => {
        if (!COB_IDS.has(e.target.id)) return;

        // Leer cobRequerida del atributo data-valor (número puro, ya calculado)
        const reqEl = document.getElementById('c4-vida-req');
        const cobRequerida = parseFloat(reqEl?.dataset?.valor) || 0;

        // Actualizar Total cobertura actual, gap y badge de gap
        c1RecalcularPaso4(cobRequerida);

        // Recalcular el score global de Capa 1 (badge /10 pts y semáforo)
        const respScore = c4LeerDOM(met, gastosMes, clientData);
        c4Recalcular(met, gastosMes, respScore, clientData);
    };

    // Delegación sobre el contenedor de la sección — cubre cualquier momento del ciclo de vida del DOM
    section.addEventListener('input',  onCoberturaInput);
    section.addEventListener('change', onCoberturaInput);

    // 6. Botón guardar → Firestore
    // evaluacion4capas es la fuente de verdad única.
    // evaluacion4capas.proteccion.separacionPatrimonial contiene el C5 detallado.
    document.getElementById('c4-save-btn')?.addEventListener('click', async () => {
        const respGuardar = c4LeerDOM(met, gastosMes, clientData);
        const c3Resp = respGuardar.crecimiento || {};
        // Calcular scores para guardar
        const sc1 = c3ScoreC1(met, clientData);
        const sc2 = c3ScoreC2(met);
        const sc3 = c3ScoreC3(met);
        const sc4 = c3ScoreC4(met, c3Resp);
        const sc5 = c3ScoreC5(met, c3Resp, clientData);
        const sc6 = c3ScoreC6(clientData, met, gastosMes);
        const bruto = sc1 + sc2 + sc3 + sc4 + sc5 + sc6;
        const scoreFinal = parseFloat(Math.min(10, (bruto / 11) * 10).toFixed(1));
        const capa3Save = {
            negociosEscalables:    c3Resp.negociosEscalables || {},
            retornoEstimadoAsesor: c3Resp.retornoEstimadoAsesor ?? null,
            scoreC1: sc1, scoreC2: sc2, scoreC3: sc3,
            scoreC4: sc4, scoreC5: sc5, scoreC6: sc6,
            scoreCapa3Final: scoreFinal,
        };
        // Calcular y guardar scores Capa 4
        const _c4dActivos = met._activos || activos || [];
        const _c4dData = c4dCalcularMetricas(_c4dActivos, gastosMes, clientData);
        const _c4dS    = c4dScores(_c4dData);
        const capa4Save = {
            scoreC1: _c4dS.sc1, scoreC2: _c4dS.sc2, scoreC3: _c4dS.sc3,
            scoreC4: _c4dS.sc4, scoreC5: _c4dS.sc5, scoreC6: _c4dS.sc6,
            scoreCapa4Final: _c4dS.final,
        };
        try {
            await updateDoc(doc(db, 'clients', selectedClientId), {
                evaluacion4capas: respGuardar,
                capa3Crecimiento: capa3Save,
                capa4Diversificacion: capa4Save,
                updatedAt: serverTimestamp()
            });
            showToast('Evaluación guardada', 'success');
        } catch (e) {
            console.error(e);
            showToast('Error al guardar', 'error');
        }
    });
}

// Stubs vacíos para no romper referencias antiguas
function createCapaCard() { return ''; }
async function saveCapasEvaluation() {}


// Utility Functions
function formatCurrency(value, currency = 'USD') {
    const symbols = {
        USD: '$', COP: '$', EUR: '€', GBP: '£',
        MXN: '$', BRL: 'R$', ARS: '$', CLP: '$', PEN: 'S/'
    };
    
    const formatted = new Intl.NumberFormat('es-US', {
        minimumFractionDigits: 0,
        maximumFractionDigits: currency === 'COP' || currency === 'CLP' ? 0 : 2
    }).format(value);
    
    return `${symbols[currency] || '$'}${formatted} ${currency}`;
}

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'toast show ' + type;
    setTimeout(() => toast.classList.remove('show'), 3000);
}

function getErrorMessage(errorCode) {
    const messages = {
        'auth/email-already-in-use': 'Email ya en uso',
        'auth/invalid-email': 'Email inválido',
        'auth/weak-password': 'Contraseña débil (mín. 6 caracteres)',
        'auth/user-not-found': 'Usuario no encontrado',
        'auth/wrong-password': 'Contraseña incorrecta',
        'auth/too-many-requests': 'Demasiados intentos',
        'auth/network-request-failed': 'Error de conexión'
    };
    return messages[errorCode] || 'Error desconocido';
}

window.navigateToSection = function(sectionName) {
    // Si es la sección de clientes, ir ahí
    if (sectionName === 'clientes') {
        showClientsView();
        return;
    }
    
    // Si no hay cliente seleccionado y no es la sección de clientes
    if (!selectedClientId && sectionName !== 'clientes') {
        showToast('Seleccione un cliente primero', 'error');
        return;
    }
    
    const navItem = document.querySelector(`#client-nav [data-section="${sectionName}"]`);
    if (navItem) {
        navItem.click();
    } else {
        console.warn('No se encontró la sección:', sectionName);
    }
};
// ══════════════════════════════════════════════════════════════════════
// CAPA 3 — CRECIMIENTO
// ══════════════════════════════════════════════════════════════════════

function c3Semaforo(pts) {
    if (pts >= 9)   return { cls: 'optimo',    label: '🟢 ÓPTIMO' };
    if (pts >= 7.5) return { cls: 'muybueno',  label: '🟢 MUY BUENO' };
    if (pts >= 6)   return { cls: 'aceptable', label: '🟡 ACEPTABLE' };
    if (pts >= 4)   return { cls: 'deficiente',label: '🟠 DEFICIENTE' };
    return              { cls: 'critico',  label: '🔴 CRÍTICO' };
}

// ── Helpers de score individuales (también usados al guardar) ─────────

function c3ScoreC1(met, clientData) {
    const patriC3   = met.patriCOP || 0;
    const actInv    = met.activosInversion || [];
    const valPort   = actInv.reduce((s, a) => s + a.neto, 0);
    const pctPort   = patriC3 > 0 ? valPort / patriC3 * 100 : 0;
    const tiposInv  = new Set(actInv.map(a => a.category)).size;  // tipos = categorías
    const paisesInv = new Set(actInv.filter(a => a.location).map(a => a.location)).size;
    let ptA = 0;
    if (pctPort >= 30) ptA = 1; else if (pctPort >= 15) ptA = 0.5;
    let ptB = 0;
    if (tiposInv >= 3 && paisesInv >= 2) ptB = 1;
    else if (tiposInv >= 2 || paisesInv >= 2) ptB = 0.5;
    const perfil    = (clientData?.riskProfile || '').toUpperCase();
    const horizonte = (clientData?.investmentHorizon || '');
    const pctRiesgo = patriC3 > 0 ? (met.valorRiesgoAlto || 0) / patriC3 * 100 : 0;
    let alineado = false;
    if (perfil === 'CONSERVADOR' && pctRiesgo < 20) alineado = true;
    else if (perfil === 'MODERADO' && pctRiesgo >= 20 && pctRiesgo <= 50) alineado = true;
    else if (perfil === 'AGRESIVO' && pctRiesgo > 50) alineado = true;
    if (horizonte === 'Corto' && pctRiesgo > 30) alineado = false;
    return parseFloat((ptA + ptB + (alineado ? 1 : 0)).toFixed(2));
}

function c3ScoreC2(met) {
    const patriC3 = met.patriCOP || 0;
    const pctIntl = patriC3 > 0 ? (met.valorIntlCOP || 0) / patriC3 * 100 : 0;
    if (pctIntl >= 20) return 2;
    if (pctIntl >= 10) return 1;
    return 0;
}

function c3CapRatePond(inmuR) {
    const sumInmu = inmuR.reduce((s, i) => s + i.neto, 0);
    if (sumInmu <= 0) return 0;
    return inmuR.reduce((s, i) => s + (i.neto > 0 ? (i.rentaMes * 12 / i.neto * 100) * (i.neto / sumInmu) : 0), 0);
}

function c3ScoreC3(met) {
    const inmuR = met.inmueblesRentaC3 || [];
    const cap   = c3CapRatePond(inmuR);
    if (inmuR.length >= 2 && cap >= 5)      return 2;
    if (inmuR.length >= 1 && cap >= 4)      return 1;
    if (inmuR.length >= 1 && cap < 4)       return 0.5;
    return 0;
}

function c3ScoreC4(met, resp) {
    const empAplic = (met.activosEmpresariales || []).filter(e =>
        e.rolEmpresarial === 'representante_legal' || e.rolEmpresarial === 'propietario_natural'
    );
    if (empAplic.length === 0) return 0;
    const valMap = { alto: 1, medio: 0.5, bajo: 0 };
    const negRespMap = resp.negociosEscalables || {};
    let sumScore = 0, sumVal = 0;
    empAplic.forEach(e => {
        const r  = negRespMap[e.id] || {};
        const sc = (valMap[r.modeloIngresos] || 0) * 0.40
            + (valMap[r.estructuraOperativa] || 0) * 0.30
            + (valMap[r.potencialCrecimiento] || 0) * 0.20
            + (valMap[r.diversificacionClientes] || 0) * 0.10;
        sumScore += sc * e.neto;
        sumVal   += e.neto;
    });
    return parseFloat((sumVal > 0 ? (sumScore / sumVal) * 2 : 0).toFixed(2));
}

function c3CalcCAGR(met, clientData) {
    const fechaAnlRaw = clientData?.analysisDate || '';
    const fechaAnl = /^\d{4}-\d{2}-\d{2}$/.test(fechaAnlRaw)
        ? new Date(fechaAnlRaw + 'T00:00:00') : new Date();
    const actInv = met.activosInversion || [];
    const activosConCAGR = actInv.filter(a => a.valorAdquisicionCOP > 0 && a.fechaAdquisicion
        && a.subtype !== SUBTIPO_SEGURO_PENSION);
    let cagrPond = null, sumV = 0;
    activosConCAGR.forEach(a => {
        const fa   = new Date(a.fechaAdquisicion + 'T00:00:00');
        const diff = fechaAnl - fa;
        if (diff <= 0) return;
        const anios = diff / (365.25 * 24 * 3600 * 1000);
        if (anios < 0.1 || a.neto <= 0) return;
        const cagr = Math.pow(a.neto / a.valorAdquisicionCOP, 1 / anios) - 1;
        if (!isFinite(cagr)) return;
        if (cagrPond === null) cagrPond = 0;
        cagrPond += cagr * a.neto;
        sumV     += a.neto;
    });
    if (sumV > 0) cagrPond = cagrPond / sumV;
    const pctConCAGR = actInv.length > 0
        ? activosConCAGR.length / actInv.length * 100 : 0;
    return { cagrPond, pctConCAGR, nConCAGR: activosConCAGR.length, nTotal: actInv.length };
}

function c3ScoreC5(met, resp, clientData) {
    const { cagrPond, pctConCAGR } = c3CalcCAGR(met, clientData);
    let tasaEvaluar = null;
    if (pctConCAGR >= 50 && cagrPond !== null) {
        tasaEvaluar = cagrPond * 100;
    } else if (resp.retornoEstimadoAsesor != null && resp.retornoEstimadoAsesor !== '') {
        tasaEvaluar = parseFloat(resp.retornoEstimadoAsesor);
    }
    if (tasaEvaluar === null) return 0;
    if (tasaEvaluar > 10)        return 1;
    if (tasaEvaluar >= 8)        return 0.75;
    if (tasaEvaluar >= 5)        return 0.5;
    return 0;
}


// ── C6: Alineación con objetivos ─────────────────────────────────────────

// Diccionario de claves a textos legibles (cubre claves actuales + del spec)
const C6_ETIQUETAS = {
    // Corto plazo
    'vivienda':           'Comprar vivienda propia',
    'vivienda_propia':    'Comprar vivienda propia',
    'edu_propia':         'Financiar educación propia',
    'edu_hijos':          'Financiar educación de hijos',
    'negocio':            'Crear o expandir negocio',
    'crear_negocio':      'Crear o expandir negocio',
    'fondo_emergencia':   'Completar fondo de emergencia',
    // Mediano plazo
    'if_parcial':             'Independencia financiera parcial',
    'independencia_parcial':  'Independencia financiera parcial',
    'inm_inversion':          'Compra de inmueble de inversión',
    'inmueble_inversion':     'Compra de inmueble de inversión',
    'expansion_intl':         'Expansión internacional del patrimonio',
    'expansion_internacional':'Expansión internacional del patrimonio',
    'estructura':             'Estructuración patrimonial',
    'estructuracion':         'Estructuración patrimonial',
    'edu_univ_hijos':         'Financiar educación universitaria de hijos',
    'edu_universitaria':      'Financiar educación universitaria de hijos',
    // Largo plazo
    'independencia_total':    'Independencia financiera total',
    'Independencia financiera total': 'Independencia financiera total',
    // Fallback
    'otro':  'Otro objetivo',
};

function c6NombreObjetivo(o) {
    if (!o) return '—';
    if (o.tipo === 'Independencia financiera total') return 'Independencia financiera total';
    // Para tipo "otro": mostrar el texto libre que ingresó el asesor,
    // NO la etiqueta genérica del diccionario
    if (o.tipo === 'otro') {
        return o.tipoOtro
            || o.tipoPersonalizado
            || o.descripcion
            || o.otroTexto
            || 'Objetivo personalizado';
    }
    return C6_ETIQUETAS[o.tipo]
        || o.tipo
        || '—';
}

// Reúne todos los objetivos (corto + mediano + largo) con costoEstimado y fechaObjetivo
function c3C6Todos(clientData) {
    const obj = clientData?.objetivosCliente || {};
    const largo = obj.largoPlayzo;

    // Número Mágico = gastos × 12 / 0.04 = gastos × 300 (regla del 4%)
    const gastosMensuales = parseFloat(clientData?.monthlyExpenses) || 0;
    const numeroMagico = gastosMensuales * 300;

    return [
        ...(obj.cortoPlayzo   || []),
        ...(obj.medianoPlayzo || []),
        // Incluir objetivo de largo plazo si tiene fecha y hay gastos registrados
        ...(largo?.fechaObjetivo && numeroMagico > 0 ? [{
            tipo:           'Independencia financiera total',
            costoEstimado:  numeroMagico,
            fechaObjetivo:  largo.fechaObjetivo,
            prioridad:      'Alta',
        }] : []),
    ].filter(o => o.costoEstimado > 0 && o.fechaObjetivo);
}

function c3C6Datos(clientData, met, gastosMes) {
    const todos = c3C6Todos(clientData);
    if (todos.length === 0) return { todos: [], viables: [], pctViables: null, capAhorro: 0, ahorroTotalReq: 0 };

    const fechaAnlRaw = clientData?.analysisDate || '';
    const fechaAnl = /^\d{4}-\d{2}-\d{2}$/.test(fechaAnlRaw)
        ? new Date(fechaAnlRaw + 'T00:00:00') : new Date();

    const ingActivo = parseFloat(clientData?.monthlyActiveIncome) || 0;
    const ingPasivo = met.ingPasivoTotalCOP || 0;
    const capAhorro = Math.max(0, ingActivo + ingPasivo - gastosMes);
    const patriTotal= met.patriCOP || 0;
    // Portafolio productivo para proyección de viabilidad (regla del 4%)
    const portafolioProdTotal = met.portafolioProductivoCOP != null
        ? met.portafolioProductivoCOP
        : patriTotal;  // fallback si no viene calculado

    const cagrData  = c3CalcCAGR(met, clientData);
    const tasa = (cagrData.pctConCAGR >= 50 && cagrData.cagrPond !== null)
        ? cagrData.cagrPond : 0.06;

    // Paso 1: calcular meses y enriquecer, luego ordenar por cercanía
    const conMeses = todos.map(o => {
        const fechaObj = new Date(o.fechaObjetivo + 'T00:00:00');
        const diffMs   = fechaObj - fechaAnl;
        const meses    = Math.round(diffMs / (1000 * 3600 * 24 * 30.44));
        return { ...o, meses };
    }).sort((a, b) => a.meses - b.meses);

    // Paso 2: distribución en cascada — los más cercanos consumen primero
    let capacidadRestante = capAhorro;

    const procesados = conMeses.map(o => {
        if (o.meses <= 0) {
            return { ...o, ahorroReq: 0, ahorroAsignado: 0, gapAhorro: 0,
                viable_ahorro: false, patriProyectado: portafolioProdTotal,
                viable_patrimonio: portafolioProdTotal >= o.costoEstimado, viable: false,
                capAgotada: false };
        }

        const ahorroReq       = o.costoEstimado / o.meses;
        const patriProyectado = portafolioProdTotal * Math.pow(1 + tasa, o.meses / 12);
        const viable_patrimonio = patriProyectado >= o.costoEstimado;

        let ahorroAsignado, gapAhorro, viable_ahorro, capAgotada;
        if (capacidadRestante >= ahorroReq) {
            ahorroAsignado  = ahorroReq;
            gapAhorro       = 0;
            viable_ahorro   = true;
            capAgotada      = false;
            capacidadRestante -= ahorroReq;
        } else {
            ahorroAsignado  = capacidadRestante;
            gapAhorro       = ahorroReq - capacidadRestante;
            viable_ahorro   = false;
            capAgotada      = capacidadRestante === 0;
            capacidadRestante = 0;
        }

        const capacidadRestanteDespues = capacidadRestante;
        const viable = viable_ahorro || viable_patrimonio;
        return { ...o, ahorroReq, ahorroAsignado, gapAhorro,
            viable_ahorro, viable_patrimonio, viable,
            patriProyectado, capAgotada, capacidadRestanteDespues };
    });

    const ahorroTotalReq = procesados.reduce((s, o) => s + (o.ahorroReq || 0), 0);
    const viables    = procesados.filter(o => o.viable);
    const pctViables = procesados.length > 0 ? viables.length / procesados.length * 100 : 0;

    // Seguros de pensión alineados con meta de IF (vencen antes o en la fecha meta)
    const seguros = met?.segurosConPension || [];
    const objLargoFecha = clientData?.objetivosCliente?.largoPlayzo?.fechaObjetivo || '';
    let segurosPensionAlineados = [];
    let aporteSegurosPension = 0;
    if (objLargoFecha && seguros.length > 0) {
        const fMeta = new Date(objLargoFecha + 'T00:00:00');
        segurosPensionAlineados = seguros.filter(s => {
            if (!s.fechaVencimiento) return false;
            const fV = new Date(s.fechaVencimiento + 'T00:00:00');
            return fV <= fMeta;
        });
        aporteSegurosPension = segurosPensionAlineados.reduce((s, x) => s + (x.objetivoAhorro || 0), 0);
    }

    return { todos: procesados, viables, pctViables, capAhorro, ahorroTotalReq,
             segurosPensionAlineados, aporteSegurosPension };
}

function c3ScoreC6(clientData, met, gastosMes) {
    const { todos, pctViables } = c3C6Datos(clientData, met, gastosMes);
    if (todos.length === 0) return 0;
    if (pctViables === 100)  return 1;
    if (pctViables >= 50)    return 0.5;
    return 0;
}

// ── Leer inputs del DOM para Capa 3 ──────────────────────────────────
function c3LeerDOM(met) {
    const empAplic = (met?.activosEmpresariales || []).filter(e =>
        e.rolEmpresarial === 'representante_legal' || e.rolEmpresarial === 'propietario_natural'
    );
    const negociosEscalables = {};
    empAplic.forEach(e => {
        const r = n => document.querySelector(`input[name="c3_neg_${e.id}_${n}"]:checked`)?.value || null;
        negociosEscalables[e.id] = {
            modeloIngresos:        r('modelo'),
            estructuraOperativa:   r('estructura'),
            potencialCrecimiento:  r('potencial'),
            diversificacionClientes: r('diversificacion'),
        };
    });
    const retEl = document.getElementById('c3-retorno-estimado');
    return {
        negociosEscalables,
        retornoEstimadoAsesor: retEl ? (retEl.value !== '' ? parseFloat(retEl.value) : null) : null,
    };
}

// ── Construir HTML completo Capa 3 ────────────────────────────────────
function c3BuildHTML(rc, met, gastosMes, clientData) {
    const cop    = c4cop;
    const patriC3 = met.patriCOP || 0;
    const actInv  = met.activosInversion || [];
    const inmuR   = met.inmueblesRentaC3 || [];
    const empAplic = (met.activosEmpresariales || []).filter(e =>
        e.rolEmpresarial === 'representante_legal' || e.rolEmpresarial === 'propietario_natural'
    );
    const negGuard = rc.negociosEscalables || {};

    // — Métricas —
    const valPort    = actInv.reduce((s, a) => s + a.neto, 0);
    const pctPort    = patriC3 > 0 ? valPort / patriC3 * 100 : 0;
    const tiposInv   = new Set(actInv.map(a => a.category)).size;  // tipos = categorías
    const paisesInv  = new Set(actInv.filter(a => a.location).map(a => a.location)).size;
    const valIntl    = met.valorIntlCOP || 0;
    const pctIntl    = patriC3 > 0 ? valIntl / patriC3 * 100 : 0;
    const pctRiesgo  = patriC3 > 0 ? (met.valorRiesgoAlto || 0) / patriC3 * 100 : 0;
    const capRatePond = c3CapRatePond(inmuR);
    const perfil     = (clientData?.riskProfile || '').toUpperCase();
    const horizonte  = clientData?.investmentHorizon || '—';
    const { cagrPond, pctConCAGR, nConCAGR, nTotal } = c3CalcCAGR(met, clientData);
    const ingActivo  = parseFloat(clientData?.monthlyActiveIncome) || 0;
    const ingPasivo  = met.ingPasivoTotalCOP || 0;
    const capAhorro  = Math.max(0, ingActivo + ingPasivo - gastosMes);

    // — Scores individuales —
    const sc1 = c3ScoreC1(met, clientData);
    const sc2 = c3ScoreC2(met);
    const sc3v= c3ScoreC3(met);
    const sc4v= c3ScoreC4(met, rc);
    const sc5v= c3ScoreC5(met, rc, clientData);
    const bruto = sc1 + sc2 + sc3v + sc4v + sc5v;

    // — Helpers visuales —
    const badge = (txt, ok) => `<span class="c3-badge ${ok === true ? 'c3-ok' : ok === false ? 'c3-mal' : 'c3-warn'}">${txt}</span>`;
    const fmtPct = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';

    // ── C1: lista activos de inversión agrupada por categoría ──
    const _CATS_C1_ORDEN = ['Financiero', 'Inmueble', 'Alternativo'];
    const _CATS_C1_LABEL = { Financiero: 'Financieros de inversión', Inmueble: 'Inmuebles productivos', Alternativo: 'Alternativos productivos' };
    const listaInv = (() => {
        if (actInv.length === 0) return '<div class="c3-empty">Sin activos de inversión detectados</div>';
        const grupos = {};
        actInv.forEach(a => {
            const cat = a.category || 'Otro';
            if (!grupos[cat]) grupos[cat] = [];
            grupos[cat].push(a);
        });
        let html = '';
        _CATS_C1_ORDEN.forEach(cat => {
            if (!grupos[cat]) return;
            html += `<div class="c3-asset-group-lbl">${_CATS_C1_LABEL[cat] || cat}</div>`;
            grupos[cat].forEach(a => {
                html += `<div class="c3-asset-row">
                <span class="c3-asset-name">${a.name}</span>
                <span class="c3-asset-sub">${a.subtype}${a.location ? ' · ' + a.location : ''}</span>
                <span class="c3-asset-val">${cop(a.neto)}</span>
            </div>`;
            });
        });
        // Categorías no previstas
        Object.keys(grupos).filter(c => !_CATS_C1_ORDEN.includes(c)).forEach(cat => {
            html += `<div class="c3-asset-group-lbl">${cat}</div>`;
            grupos[cat].forEach(a => {
                html += `<div class="c3-asset-row">
                <span class="c3-asset-name">${a.name}</span>
                <span class="c3-asset-sub">${a.subtype}${a.location ? ' · ' + a.location : ''}</span>
                <span class="c3-asset-val">${cop(a.neto)}</span>
            </div>`;
            });
        });
        html += `<div class="c3-asset-total">
            <span>Total portafolio de inversión</span>
            <strong>${cop(valPort)} (${pctPort.toFixed(1)}% del patrimonio)</strong>
        </div>`;
        return html;
    })();

    // Alineación perfil
    let alineado = false;
    if (perfil === 'CONSERVADOR' && pctRiesgo < 20) alineado = true;
    else if (perfil === 'MODERADO' && pctRiesgo >= 20 && pctRiesgo <= 50) alineado = true;
    else if (perfil === 'AGRESIVO' && pctRiesgo > 50) alineado = true;
    if (horizonte === 'Corto' && pctRiesgo > 30) alineado = false;
    const alertaHorizonte = horizonte === 'Corto' && pctRiesgo > 30
        ? '<div class="c3-alerta">⚠️ Horizonte corto con alta concentración en riesgo</div>' : '';

    // ── C2: activos internacionales y distribución por país ──
    const activosIntl = actInv.filter(a => a.location && a.location !== 'Colombia');
    const listaIntl = activosIntl.length > 0
        ? activosIntl.map(a => `<div class="c3-asset-row">
                <span class="c3-asset-name">${a.name}</span>
                <span class="c3-asset-sub">${a.category} · ${a.location}</span>
                <span class="c3-asset-val">${cop(a.neto)}</span>
            </div>`).join('')
        : '';
    const porPais = {};
    activosIntl.forEach(a => {
        porPais[a.location] = (porPais[a.location] || 0) + a.neto;
    });
    const listaPaises = Object.keys(porPais).length > 0
        ? Object.entries(porPais)
            .sort((a,b) => b[1]-a[1])
            .map(([p, v]) => `<div class="c3-ctx-row">
                <span>${p}</span>
                <strong>${patriC3 > 0 ? (v/patriC3*100).toFixed(1) : '0.0'}%</strong>
            </div>`).join('')
        : '';
    const alertaUSD = (() => {
        const vUSD = (porPais['Estados Unidos'] || 0);
        if (valIntl > 0 && vUSD / valIntl * 100 > 80)
            return '<div class="c3-alerta">⚠️ Alta concentración en USD — considera diversificar hacia EUR u otros mercados</div>';
        return '';
    })();
    const alertaSinIntl = pctIntl === 0
        ? '<div class="c3-alerta c3-alerta-red">🔴 Sin exposición internacional — el portafolio está 100% expuesto a la economía colombiana que representa menos del 0.4% del PIB mundial</div>' : '';

    // ── C3: lista inmuebles ──
    const listaInmu = inmuR.length > 0
        ? inmuR.map(i => {
            const capOk = i.capRate >= 5 ? true : i.capRate >= 4 ? null : false;
            return `<div class="c3-inmu-row">
                <div class="c3-inmu-nombre">${i.name}</div>
                <div class="c3-inmu-detalle">
                    <span>Valor: ${cop(i.neto)}</span>
                    <span>Renta: ${cop(i.rentaMes)}/mes</span>
                    <span>Cap Rate: ${badge(i.capRate.toFixed(1) + '% EA', capOk)}</span>
                </div>
            </div>`;
        }).join('')
        : '<div class="c3-empty">🔴 Sin inmuebles productivos — los inmuebles en renta son uno de los vehículos más estables de generación de ingresos pasivos a largo plazo</div>';

    // ── C4: bloque negocios ──
    const bloqueNegocios = empAplic.length === 0
        ? `<div class="c3-empty">El cliente no tiene participación activa en negocios. Los negocios escalables son uno de los vehículos más poderosos de generación de riqueza a largo plazo.</div>`
        : empAplic.map(e => {
            const r = negGuard[e.id] || {};
            const dim = (n, label, opts) => {
                const opts2 = [['alto','Alto'],['medio','Medio'],['bajo','Bajo']];
                const pills = opts2.map(([v, l]) =>
                    `<label class="c4-opt">
                        <input type="radio" name="c3_neg_${e.id}_${n}" value="${v}"${r[n] === v ? ' checked' : ''}>
                        <span class="c4-opt-lbl">${l}</span>
                    </label>`).join('');
                return `<div class="c3-neg-dim">
                    <div class="c3-neg-dim-lbl">${label}</div>
                    <div class="c4-opts">${pills}</div>
                </div>`;
            };
            return `<div class="c3-neg-bloque">
                <div class="c3-neg-titulo">${e.name} <span style="color:#8892a4;font-size:1rem">${cop(e.neto)}</span></div>
                ${dim('modelo',
                    '1. Modelo de ingresos <span class="c4-tag-pts">peso 40%</span><br><small style="color:#8892a4;font-weight:400">¿Cómo genera ingresos el negocio principalmente?<br>Alto = Recurrentes automáticos · Medio = Por contratos repetibles · Bajo = Por tiempo/presencia del dueño</small>',
                    null)}
                ${dim('estructura',
                    '2. Estructura operativa <span class="c4-tag-pts">peso 30%</span><br><small style="color:#8892a4;font-weight:400">¿El negocio funciona si el dueño no está?<br>Alto = Tiene gerencia y procesos independientes · Medio = Funciona parcialmente · Bajo = El dueño es el negocio</small>',
                    null)}
                ${dim('potencial',
                    '3. Potencial de crecimiento <span class="c4-tag-pts">peso 20%</span><br><small style="color:#8892a4;font-weight:400">¿Puede crecer sin aumentar costos proporcionalmente?<br>Alto = Modelo de alto margen escalable · Medio = Parcialmente · Bajo = Crece linealmente con los costos</small>',
                    null)}
                ${dim('diversificacion',
                    '4. Diversificación de clientes <span class="c4-tag-pts">peso 10%</span><br><small style="color:#8892a4;font-weight:400">¿Qué tan concentrada está la facturación?<br>Alto = Ningún cliente >20% · Medio = Un cliente 20-40% · Bajo = Un cliente >40%</small>',
                    null)}
            </div>`;
        }).join('');

    // ── C5: retorno ──
    const retornoEstimado = rc.retornoEstimadoAsesor ?? '';
    const usarCAGR = pctConCAGR >= 50 && cagrPond !== null;
    const tasaMostrar = usarCAGR ? (cagrPond * 100) : (retornoEstimado !== '' ? parseFloat(retornoEstimado) : null);
    const retornoReal = tasaMostrar !== null ? tasaMostrar - 5 : null;
    const alertaInflacion = tasaMostrar !== null && tasaMostrar < 5
        ? '<div class="c3-alerta c3-alerta-red">🔴 El portafolio está perdiendo valor real contra la inflación</div>' : '';
    const campoEstimado = !usarCAGR
        ? `<div class="c3-retorno-input">
            <label>Retorno anual estimado del portafolio (% EA)</label>
            <div style="display:flex;gap:8px;align-items:center;margin-top:4px">
                <input type="number" id="c3-retorno-estimado" class="c4-cob-input"
                    step="0.1" min="-50" max="100" placeholder="Ej: 8.5"
                    value="${retornoEstimado !== '' ? retornoEstimado : ''}">
                <span style="color:#94a3b8;font-size:1rem">% EA</span>
            </div>
          </div>` : '';

    return `
    <!-- ── CAPA 3: CRECIMIENTO ─────────────────────────────────────────── -->
    <div class="c4-card">
        <div class="c4-card-hd">
            <div class="c4-num c4n-3">3</div>
            <div>
                <div class="c4-title">Crecimiento</div>
                <div class="c4-sub">Inversiones y rentabilidad — máx 10 pts</div>
            </div>
            <div class="c4-badge">
                <div class="c4-badge-n" id="c4-score-crecimiento">—</div>
                <div class="c4-badge-d">/10 pts</div>
            </div>
        </div>
        <div class="c4-body">

        <!-- Objetivo ─────────────────────────────────────────────── -->
        <div class="c2-objetivo">
            Hacer crecer el patrimonio de forma sistemática para alcanzar la independencia financiera, generar ingresos pasivos crecientes y proteger el poder adquisitivo contra la inflación. Esta capa debe estar alineada con el horizonte temporal, perfil de riesgo y objetivos del cliente.
        </div>

        <!-- Contexto automático ─────────────────────────────────── -->
        <div class="c4-criterio">
            <div class="c4-criterio-hd">
                <span class="c4-crit-num">AUTO</span>
                <span class="c4-crit-title">Datos de base</span>
            </div>
            <div class="c4-auto-ctx">
                <div class="c4-ctx-row"><span>Perfil de riesgo</span><strong>${perfil || '—'}</strong></div>
                <div class="c4-ctx-row"><span>Horizonte temporal</span><strong>${horizonte}</strong></div>
                <div class="c4-ctx-sub" style="border-top:1px solid rgba(255,255,255,.05);padding-top:6px;margin-top:2px"></div>
                <div class="c4-ctx-row"><span>Portafolio de inversión</span><strong>${cop(valPort)} (${pctPort.toFixed(1)}% del patrimonio)</strong></div>
                <div class="c4-ctx-row"><span>Exposición internacional</span><strong>${cop(valIntl)} (${pctIntl.toFixed(1)}% del patrimonio)</strong></div>
                <div class="c4-ctx-row"><span>Inmuebles productivos</span><strong>${inmuR.length} inmueble${inmuR.length !== 1 ? 's' : ''} — Cap Rate ${capRatePond.toFixed(1)}% EA</strong></div>
                <div class="c4-ctx-row"><span>Capacidad de ahorro mensual</span><strong>${cop(capAhorro)}</strong></div>
                <div class="c4-ctx-row"><span>CAGR calculado con</span><strong>${nConCAGR} de ${nTotal} activos</strong></div>
            </div>
        </div>

        <!-- C1: Portafolio de inversión ─────────────────────────── -->
        <div class="c4-criterio">
            <div class="c4-criterio-hd">
                <span class="c4-crit-num">C1</span>
                <span class="c4-crit-title">Portafolio de inversión activo</span>
                <span class="c4-tag-auto">AUTO</span>
                <span class="c4-tag-pts">máx 3 pts</span>
                <span class="c2-crit-badge ${sc1 >= 2.5 ? 'c2-badge-ok' : sc1 >= 1.5 ? 'c2-badge-warn' : 'c2-badge-mal'}">${sc1.toFixed(1)} / 3 pts</span>
            </div>

            <div class="c3-assets-list">${listaInv}</div>

            <div class="c4-auto-ctx" style="margin-top:8px">
                <div class="c4-ctx-row" style="font-size:1rem;color:#8892a4;font-weight:600;text-transform:uppercase;letter-spacing:.04em">
                    <span>Tamaño del portafolio</span>
                    <span class="c4-tag-pts">≥30%: 1 / 15-29%: 0.5 / &lt;15%: 0</span>
                </div>
                <div class="c4-ctx-row">
                    <span>${cop(valPort)} = ${pctPort.toFixed(1)}% del patrimonio</span>
                    ${pctPort >= 30 ? badge('✅ Sólido ≥30%', true) : pctPort >= 15 ? badge('⚠️ Básico 15-29%', null) : badge('🔴 Insuficiente <15%', false)}
                </div>

                <div class="c4-ctx-row" style="font-size:1rem;color:#8892a4;font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin-top:8px">
                    <span>Diversificación</span>
                    <span class="c4-tag-pts">≥3 tipos y ≥2 países: 1 / parcial: 0.5 / concentrado: 0</span>
                </div>
                <div class="c4-ctx-row"><span>Tipos de activo distintos (Financiero / Inmueble / Alternativo)</span><strong>${tiposInv}</strong></div>
                <div class="c4-ctx-row"><span>Países distintos</span><strong>${paisesInv}</strong></div>
                <div class="c4-ctx-row">
                    ${tiposInv >= 3 && paisesInv >= 2 ? badge('✅ Diversificado', true) : tiposInv >= 2 || paisesInv >= 2 ? badge('⚠️ Parcialmente diversificado', null) : badge('🔴 Concentrado', false)}
                </div>

                <div class="c4-ctx-row" style="font-size:1rem;color:#8892a4;font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin-top:8px">
                    <span>Alineación con perfil ${perfil || '—'}</span>
                    <span class="c4-tag-pts">Alineado: 1 / Desalineado: 0</span>
                </div>
                <div class="c4-ctx-row"><span>% en activos de riesgo Alto/Muy Alto</span><strong>${pctRiesgo.toFixed(1)}%</strong></div>
                <div class="c4-ctx-row">${alineado ? badge('✅ Alineado con perfil', true) : badge('🔴 Desalineado con perfil', false)}</div>
                ${alertaHorizonte}
            </div>
        </div>

        <!-- C2: Exposición internacional ───────────────────────── -->
        <div class="c4-criterio">
            <div class="c4-criterio-hd">
                <span class="c4-crit-num">C2</span>
                <span class="c4-crit-title">Exposición a mercados internacionales</span>
                <span class="c4-tag-auto">AUTO</span>
                <span class="c4-tag-pts">≥20%: 2 / 10-19%: 1 / &lt;10%: 0</span>
                <span class="c2-crit-badge ${sc2 >= 2 ? 'c2-badge-ok' : sc2 >= 1 ? 'c2-badge-warn' : 'c2-badge-mal'}">${sc2.toFixed(1)} / 2 pts</span>
            </div>
            <div class="c4-auto-ctx">
                ${listaIntl ? `<div class="c3-assets-list" style="margin-bottom:8px">${listaIntl}<div class="c3-asset-total"><span>Total internacional</span><strong>${cop(valIntl)} (${pctIntl.toFixed(1)}% del patrimonio)</strong></div></div>` : ''}
                <div class="c4-ctx-row">
                    <span>% internacional sobre patrimonio</span>
                    <strong>${pctIntl.toFixed(1)}%</strong>
                </div>
                <div class="c4-ctx-row">
                    ${pctIntl >= 20 ? badge('✅ ≥20%', true) : pctIntl >= 10 ? badge('⚠️ 10-19%', null) : badge('🔴 <10%', false)}
                </div>
                ${listaPaises ? `<div class="c4-ctx-row" style="font-size:1rem;color:#8892a4;margin-top:6px"><span>Distribución por país</span></div>${listaPaises}` : ''}
                ${alertaUSD}
                ${alertaSinIntl}
            </div>
        </div>

        <!-- C3: Inmuebles productivos ───────────────────────────── -->
        <div class="c4-criterio">
            <div class="c4-criterio-hd">
                <span class="c4-crit-num">C3</span>
                <span class="c4-crit-title">Inmuebles productivos en renta</span>
                <span class="c4-tag-auto">AUTO</span>
                <span class="c4-tag-pts">≥2+CR≥5%: 2 / 1+CR≥4%: 1 / 1+CR&lt;4%: 0.5 / 0: 0</span>
                <span class="c2-crit-badge ${sc3v >= 2 ? 'c2-badge-ok' : sc3v >= 1 ? 'c2-badge-warn' : 'c2-badge-mal'}">${sc3v.toFixed(1)} / 2 pts</span>
            </div>
            <div class="c3-inmu-list">${listaInmu}</div>
            ${inmuR.length > 0 ? `<div class="c4-auto-ctx" style="margin-top:6px">
                <div class="c4-ctx-row"><span>Cap Rate promedio ponderado</span><strong>${capRatePond.toFixed(1)}% EA</strong></div>
                <div class="c4-ctx-sub">Referencia Colombia: 4-6% EA · Referencia internacional: 5-8% EA</div>
            </div>` : ''}
        </div>

        <!-- C4: Negocios escalables ─────────────────────────────── -->
        <div class="c4-criterio">
            <div class="c4-criterio-hd">
                <span class="c4-crit-num">C4</span>
                <span class="c4-crit-title">Negocios escalables</span>
                <span class="c4-tag-pts">máx 2 pts · evaluado por asesor</span>
                <span class="c2-crit-badge ${sc4v >= 1.5 ? 'c2-badge-ok' : sc4v >= 0.5 ? 'c2-badge-warn' : 'c2-badge-mal'}">${sc4v.toFixed(1)} / 2 pts</span>
            </div>
            ${bloqueNegocios}
        </div>

        <!-- C5: Retorno del portafolio ──────────────────────────── -->
        <div class="c4-criterio">
            <div class="c4-criterio-hd">
                <span class="c4-crit-num">C5</span>
                <span class="c4-crit-title">Retorno del portafolio</span>
                <span class="c4-tag-pts">&gt;10%: 1 / 8-10%: 0.75 / 5-8%: 0.5 / &lt;5%: 0</span>
                <span class="c2-crit-badge ${sc5v >= 0.75 ? 'c2-badge-ok' : sc5v >= 0.5 ? 'c2-badge-warn' : 'c2-badge-mal'}">${sc5v.toFixed(1)} / 1 pt</span>
            </div>
            <div class="c4-auto-ctx">
                <div class="c4-ctx-row">
                    <span>Activos con CAGR calculado</span>
                    <strong>${nConCAGR} de ${nTotal}</strong>
                </div>
                ${pctConCAGR < 50 ? '<div class="c3-alerta">⚠️ Información parcial — ingresa valor y fecha de adquisición en el mapa de activos para mayor precisión</div>' : ''}
                ${tasaMostrar !== null ? `
                <div class="c4-ctx-row"><span>CAGR promedio ponderado</span><strong style="color:${tasaMostrar >= 8 ? '#34d399' : tasaMostrar >= 5 ? '#f0c040' : '#f87171'}">${tasaMostrar.toFixed(1)}% EA</strong></div>
                <div class="c4-ctx-row"><span>Fuente</span><strong style="color:#94a3b8">${usarCAGR ? 'Calculado automáticamente' : 'Estimado por el asesor'}</strong></div>
                <div class="c4-ctx-row"><span>Retorno real (CAGR − inflación ~5%)</span><strong style="color:${retornoReal >= 0 ? '#34d399' : '#f87171'}">${fmtPct(retornoReal)}% EA</strong></div>
                ${alertaInflacion}
                ` : '<div class="c3-alerta">Sin datos suficientes — ingresa el retorno estimado</div>'}
                <div class="c4-ctx-sub" style="border-top:1px solid rgba(255,255,255,.05);padding-top:6px;margin-top:4px">
                    Referencias: Inflación Colombia ~5% EA · Mercados globales ~8-10% EA
                </div>
                ${campoEstimado}
            </div>
        </div>

        <!-- C6: Alineación con objetivos ───────────────────────── -->
        ${(() => {
            const sc6v    = c3ScoreC6(clientData, met, gastosMes);
            const c6Data  = c3C6Datos(clientData, met, gastosMes);
            const badgeCls= sc6v >= 1 ? 'c2-badge-ok' : sc6v >= 0.5 ? 'c2-badge-warn' : 'c2-badge-mal';
            const fmtCOP  = c4cop;

            let bodyHtml;
            if (c6Data.todos.length === 0) {
                bodyHtml = '<div class="c3-alerta">⚠️ No hay objetivos registrados — ve al perfil del cliente para registrar las metas financieras. Sin objetivos no es posible evaluar si el portafolio está trabajando en la dirección correcta.</div>';
            } else {
                // ── Bloque resumen de capacidad ──
                const capTotal    = c6Data.capAhorro;
                const ahorroReqTotal = c6Data.ahorroTotalReq;
                const capSuficiente  = capTotal >= ahorroReqTotal;
                const gapCap         = ahorroReqTotal - capTotal;

                const resumenCap = '<div class="c4-auto-ctx" style="margin-bottom:8px;padding:8px 10px;background:rgba(255,255,255,.04);border-radius:8px;border:1px solid rgba(255,255,255,.07);">'
                    + '<div class="c4-ctx-row"><span>Capacidad de ahorro mensual disponible</span>'
                    + '<strong>' + fmtCOP(capTotal) + '/mes</strong></div>'
                    + '<div class="c4-ctx-row"><span>Ahorro total requerido para todos los objetivos</span>'
                    + '<strong>' + fmtCOP(ahorroReqTotal) + '/mes</strong></div>'
                    + '<div class="c4-ctx-row"><span></span>'
                    + '<strong class="' + (capSuficiente ? 'obj-via-ok' : 'obj-via-warn') + '">'
                    + (capSuficiente ? '✅ Suficiente' : '⚠️ Gap de ' + fmtCOP(gapCap) + '/mes') + '</strong></div>'
                    + '<div style="font-size:1rem;color:#8892a4;margin-top:6px;font-weight:600;text-transform:uppercase;letter-spacing:.04em">Distribución por plazo (más cercano primero)</div>'
                    + c6Data.todos.map((o, i) => {
                        const capAgotadaTxt = o.capAgotada ? ' — cubierto por patrimonio' : '';
                        return '<div class="c4-ctx-row" style="font-size:1rem;">'
                            + '<span>Objetivo ' + (i+1) + ' (' + o.meses + ' meses)</span>'
                            + '<strong>' + fmtCOP(o.ahorroAsignado) + '/mes'
                            + (capAgotadaTxt ? ' <span style="color:#8892a4">' + capAgotadaTxt + '</span>' : '') + '</strong></div>';
                    }).join('')
                    + '</div>';

                // ── Filas por objetivo ──
                const filas = c6Data.todos.map(o => {
                    const nombre      = c6NombreObjetivo(o);
                    const patriOk     = o.viable_patrimonio;
                    const gapPat      = o.costoEstimado - o.patriProyectado;
                    const capAsigLabel = o.capAgotada
                        ? fmtCOP(0) + '/mes <strong class="obj-via-warn">⚠️ capacidad agotada</strong>'
                        : fmtCOP(o.ahorroAsignado) + '/mes'
                          + (o.ahorroAsignado >= o.ahorroReq
                              ? ' <strong class="obj-via-ok">✅ (quedan ' + fmtCOP(o.capacidadRestanteDespues) + '/mes)</strong>'
                              : ' <strong class="obj-via-warn">⚠️ gap ' + fmtCOP(o.gapAhorro) + '/mes</strong>');
                    const veredicto   = o.viable
                        ? (o.viable_ahorro
                            ? '→ <strong class="obj-via-ok">✅ Viable</strong>'
                            : '→ <strong class="obj-via-ok">✅ Viable por patrimonio proyectado</strong>')
                        : '→ <strong class="obj-via-bad">🔴 No viable</strong>';

                    return '<div class="c3-inmu-row" style="margin-bottom:6px;">'
                        + '<div class="c3-inmu-nombre">' + nombre
                        + ' <span style="color:#8892a4;font-size:1rem">'
                        + (o.prioridad ? o.prioridad + '  •  ' : '') + 'plazo: ' + o.meses + ' meses</span></div>'
                        + '<div class="c3-inmu-detalle" style="flex-direction:column;gap:3px;">'
                        + '<span>Costo: ' + fmtCOP(o.costoEstimado) + '</span>'
                        + '<span>Ahorro requerido: ' + fmtCOP(o.ahorroReq) + '/mes</span>'
                        + '<span>Capacidad asignada: ' + capAsigLabel + '</span>'
                        + '<span>Patrimonio proyectado: ' + fmtCOP(o.patriProyectado)
                        + ' <strong class="' + (patriOk ? 'obj-via-ok' : 'obj-via-bad') + '">'
                        + (patriOk ? '✅ financiable' : '⚠️ gap ' + fmtCOP(gapPat)) + '</strong></span>'
                        + '<span>' + veredicto + '</span>'
                        + '</div></div>';
                }).join('');

                const pct      = c6Data.pctViables.toFixed(1) + '%';
                const semBadge = c6Data.pctViables === 100 ? '✅' : c6Data.pctViables >= 50 ? '⚠️' : '🔴';
                const colorVia = c6Data.pctViables === 100 ? '#34d399' : c6Data.pctViables >= 50 ? '#fbbf24' : '#f87171';
                // Seguros de pensión alineados con meta
                let segurosPensionHtml = '';
                if (c6Data.segurosPensionAlineados && c6Data.segurosPensionAlineados.length > 0) {
                    const fmtCOPs = fmtCOP;
                    const gastosMes2 = parseFloat(clientData?.monthlyExpenses) || 0;
                    const numeroMagico = gastosMes2 * 12 * 25;
                    const patriTotal2  = met.portafolioProductivoCOP != null
                        ? met.portafolioProductivoCOP : (met.patriCOP || 0);
                    const nmSeg      = gastosMes * 300;
                    const pctSinSeg  = nmSeg > 0 ? Math.min((patriTotal2 / nmSeg) * 100, 999).toFixed(1) : '—';
                    const pctConSeg  = nmSeg > 0 ? Math.min(((patriTotal2 + c6Data.aporteSegurosPension) / nmSeg) * 100, 999).toFixed(1) : '—';
                    segurosPensionHtml = '<div style="margin-top:8px;padding:8px 10px;background:rgba(52,211,153,.07);border-radius:8px;border:1px solid rgba(52,211,153,.2);">'
                        + '<div style="font-size:1rem;font-weight:700;color:#34d399;text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px;">Seguros de pensión alineados con la meta</div>'
                        + c6Data.segurosPensionAlineados.map(s => {
                            const anioV = s.fechaVencimiento ? s.fechaVencimiento.split('-')[0] : '—';
                            return '<div class="c4-ctx-row"><span>' + (s.name || 'Seguro') + ' — vence ' + anioV + '</span>'
                                + '<strong>' + fmtCOPs(s.objetivoAhorro) + ' ✅</strong></div>';
                        }).join('')
                        + '<div class="c4-ctx-row"><span>Aporte al Número Mágico</span>'
                        + '<strong>' + fmtCOPs(c6Data.aporteSegurosPension) + '</strong></div>'
                        + '<div class="c4-ctx-row"><span>Avance sin seguros</span><strong>' + pctSinSeg + '%</strong></div>'
                        + '<div class="c4-ctx-row"><span>Avance incluyendo seguros</span><strong style="color:#34d399">' + pctConSeg + '%</strong></div>'
                        + '</div>';
                }

                bodyHtml = resumenCap
                    + filas
                    + segurosPensionHtml
                    + '<div class="c4-ctx-row" style="border-top:1px solid rgba(255,255,255,.07);padding-top:6px;margin-top:4px;">'
                    + '<span>Objetivos viables</span>'
                    + '<strong style="color:' + colorVia + '">' + semBadge + ' '
                    + c6Data.viables.length + ' de ' + c6Data.todos.length + ' (' + pct + ')</strong></div>';
            }

            return '<div class="c4-criterio">'
                + '<div class="c4-criterio-hd">'
                + '<span class="c4-crit-num">C6</span>'
                + '<span class="c4-crit-title">Alineación con objetivos del cliente</span>'
                + '<span class="c4-tag-auto">AUTO</span>'
                + '<span class="c4-tag-pts">100%: 1 / ≥50%: 0.5 / &lt;50%: 0</span>'
                + '<span class="c2-crit-badge ' + badgeCls + '">' + sc6v.toFixed(1) + ' / 1 pt</span>'
                + '</div>'
                + '<div class="c4-auto-ctx">' + bodyHtml + '</div>'
                + '</div>';
        })()}

        <!-- Semáforo resultado ──────────────────────────────────── -->
        <div class="c4-c1-sem-wrap">
            <span class="c4-c1-sem-lbl">Resultado Capa 3</span>
            <span class="c3-sem-badge c3-sem-critico" id="c3-semaforo-badge">Calculando…</span>
        </div>

        </div><!-- .c4-body -->
    </div>`;
}
// ══════════════════════════════════════════════════════════════════════
// OBJETIVOS DEL CLIENTE
// ══════════════════════════════════════════════════════════════════════

// ── Tipos de objetivo ─────────────────────────────────────────────────
const OBJ_TIPOS_CORTO = [
    { v: 'vivienda',        l: 'Comprar vivienda propia' },
    { v: 'edu_propia',      l: 'Financiar educación propia' },
    { v: 'edu_hijos',       l: 'Financiar educación de hijos' },
    { v: 'negocio',         l: 'Crear o expandir negocio' },
    { v: 'fondo_emergencia',l: 'Completar fondo de emergencia' },
    { v: 'otro',            l: 'Otro' },
];
const OBJ_TIPOS_MEDIANO = [
    { v: 'if_parcial',      l: 'Independencia financiera parcial' },
    { v: 'inm_inversion',   l: 'Compra de inmueble de inversión' },
    { v: 'expansion_intl',  l: 'Expansión internacional del patrimonio' },
    { v: 'estructura',      l: 'Estructuración patrimonial (holding, trust, fideicomiso)' },
    { v: 'edu_univ_hijos',  l: 'Financiar educación universitaria de hijos' },
    { v: 'otro',            l: 'Otro' },
];

// Contadores para IDs únicos
let _objIdCorto   = 0;
let _objIdMediano = 0;

// ── Formateador COP local ──────────────────────────────────────────────
function _objFmtCOP(n) {
    return new Intl.NumberFormat('es-CO', {
        style: 'currency', currency: 'COP',
        minimumFractionDigits: 0, maximumFractionDigits: 0
    }).format(n || 0);
}

// ── Calcular viabilidad de un objetivo ────────────────────────────────
function _objViabilidad(costoEstimado, fechaObjetivo, clientData, activos) {
    if (!costoEstimado || !fechaObjetivo) return null;

    const fechaAnlRaw = clientData?.analysisDate || '';
    const fechaAnl = /^\d{4}-\d{2}-\d{2}$/.test(fechaAnlRaw)
        ? new Date(fechaAnlRaw + 'T00:00:00') : new Date();
    const fechaObj = new Date(fechaObjetivo + 'T00:00:00');
    const diffMs   = fechaObj - fechaAnl;
    if (diffMs <= 0) return null;

    const meses = Math.round(diffMs / (1000 * 3600 * 24 * 30.44));
    if (meses <= 0) return null;

    const gastos   = parseFloat(clientData?.monthlyExpenses) || 0;
    const ingActivo= parseFloat(clientData?.monthlyActiveIncome) || 0;

    // Ingresos pasivos y patrimonio desde activos del mapa
    let ingPasivoTotal = 0, patrimonioTotal = 0;
    if (activos && activos.length) {
        activos.forEach(a => {
            const val = parseFloat(a.value) || 0;
            const pas = parseFloat(a.liability) || 0;
            const mon = a.currency || 'COP';
            const vCOP = convertirACOP(val, mon);
            if (isNaN(vCOP)) return;
            const pCOP = isNaN(convertirACOP(pas, mon)) ? 0 : convertirACOP(pas, mon);
            patrimonioTotal += vCOP - pCOP;
            if (a.generatesIncome) ingPasivoTotal += parseFloat(a.monthlyIncome) || 0;
        });
    }

    const capAhorro = Math.max(0, ingActivo + ingPasivoTotal - gastos);
    const ahorroReq = meses > 0 ? costoEstimado / meses : 0;

    // CAGR de referencia
    const met = (typeof c4Metricas === 'function' && activos?.length)
        ? c4Metricas(activos, gastos) : null;
    const cagrData = (met && typeof c3CalcCAGR === 'function')
        ? c3CalcCAGR(met, clientData) : null;
    const tasa = (cagrData && cagrData.pctConCAGR >= 50 && cagrData.cagrPond !== null)
        ? cagrData.cagrPond : 0.06;

    const patriProyectado = patrimonioTotal * Math.pow(1 + tasa, meses / 12);

    return { meses, capAhorro, ahorroReq, patrimonioTotal, patriProyectado, costoEstimado };
}

function _objViabilidadHTML(v) {
    if (!v) return '';
    const ahorroOk   = v.capAhorro >= v.ahorroReq;
    const patriOk    = v.patriProyectado >= v.costoEstimado;
    const gap        = v.ahorroReq - v.capAhorro;
    const gapPatri   = v.costoEstimado - v.patriProyectado;
    return `<div class="obj-viabilidad">
        <div class="obj-via-row">
            <span>Plazo</span><span>${v.meses} meses</span>
        </div>
        <div class="obj-via-row">
            <span>Ahorro requerido</span><strong>${_objFmtCOP(v.ahorroReq)}/mes</strong>
        </div>
        <div class="obj-via-row">
            <span>Capacidad de ahorro actual</span><strong>${_objFmtCOP(v.capAhorro)}/mes</strong>
        </div>
        <div class="obj-via-row">
            <span></span>
            <span class="${ahorroOk ? 'obj-via-ok' : 'obj-via-warn'}">
                ${ahorroOk ? '✅ Viable con ahorro actual' : `⚠️ Requiere ${_objFmtCOP(gap)}/mes adicional`}
            </span>
        </div>
        <div class="obj-via-row">
            <span>Patrimonio proyectado a esa fecha</span>
            <strong>${_objFmtCOP(v.patriProyectado)}</strong>
        </div>
        <div class="obj-via-row">
            <span></span>
            <span class="${patriOk ? 'obj-via-ok' : 'obj-via-bad'}">
                ${patriOk ? '✅ El portafolio puede financiarlo'
                          : `⚠️ Gap de ${_objFmtCOP(gapPatri)}`}
            </span>
        </div>
    </div>`;
}

// ── Construir card de un objetivo (corto o mediano) ───────────────────
function _objBuildCard(plazo, idx, datos, clientData, activos) {
    const uid   = `${plazo}_${idx}`;
    const tipos = plazo === 'corto' ? OBJ_TIPOS_CORTO : OBJ_TIPOS_MEDIANO;
    const tipoGuardado = datos?.tipo || '';
    const otroGuardado = datos?.tipoOtro || '';
    const pifPct       = datos?.pifPct || '';

    const tipoOpts = tipos.map(t => `
        <label class="obj-tipo-opt">
            <input type="radio" name="obj_tipo_${uid}" value="${t.v}"
                ${tipoGuardado === t.v ? 'checked' : ''}>
            <span>${t.l}</span>
        </label>`).join('');

    const mostrarOtro = tipoGuardado === 'otro' ? '' : 'display:none';
    const mostrarPIF  = (plazo === 'mediano' && tipoGuardado === 'if_parcial') ? '' : 'display:none';

    const prioridades = ['Alta','Media','Baja'].map(p =>
        `<label class="obj-pri-opt">
            <input type="radio" name="obj_pri_${uid}" value="${p}"
                ${(datos?.prioridad || 'Media') === p ? 'checked' : ''}>
            ${p}
        </label>`).join('');

    const via = datos?.costoEstimado && datos?.fechaObjetivo
        ? _objViabilidadHTML(_objViabilidad(datos.costoEstimado, datos.fechaObjetivo, clientData, activos))
        : '';

    return `<div class="obj-card" id="obj-card-${uid}">
        <div class="obj-card-header">
            <span class="obj-card-num">Objetivo ${idx + 1}</span>
            <button type="button" class="obj-remove-btn"
                onclick="_objRemoveCard('${plazo}', ${idx})">✕</button>
        </div>
        <div class="obj-tipo-grid">${tipoOpts}</div>
        <div id="obj-otro-wrap-${uid}" style="${mostrarOtro}">
            <input type="text" class="obj-otro-input" id="obj_otro_${uid}"
                placeholder="Especificar objetivo…" value="${otroGuardado}">
        </div>
        <div id="obj-pif-wrap-${uid}" style="${mostrarPIF}" class="obj-pif-opt">
            <label>% de gastos cubiertos por ingresos pasivos:</label>
            <input type="number" id="obj_pif_${uid}" min="1" max="99"
                placeholder="50" value="${pifPct}"> <span style="color:#94a3b8;font-size:1rem">%</span>
        </div>
        <div class="obj-row3">
            <div class="obj-field">
                <label>Costo estimado (COP)</label>
                <input type="number" id="obj_costo_${uid}" min="0" step="1000000"
                    placeholder="0" value="${datos?.costoEstimado || ''}">
            </div>
            <div class="obj-field">
                <label>Fecha objetivo</label>
                <input type="date" id="obj_fecha_${uid}"
                    value="${datos?.fechaObjetivo || ''}">
            </div>
            <div class="obj-field">
                <label>Prioridad</label>
                <div class="obj-pri-opts">${prioridades}</div>
            </div>
        </div>
        <div id="obj-via-${uid}">${via}</div>
    </div>`;
}

// ── Estado en memoria de los objetivos ────────────────────────────────
let _objDatosCorto   = [];
let _objDatosMediano = [];

// ── Añadir nueva card vacía ───────────────────────────────────────────
window._objAddCard = function(plazo) {
    const lista  = plazo === 'corto' ? _objDatosCorto : _objDatosMediano;
    lista.push({});
    _objRenderLista(plazo);
    // Scroll al último card
    const listEl = document.getElementById('obj-list-' + plazo);
    if (listEl) listEl.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};

// ── Eliminar card ──────────────────────────────────────────────────────
window._objRemoveCard = function(plazo, idx) {
    const lista = plazo === 'corto' ? _objDatosCorto : _objDatosMediano;
    // Leer datos actuales antes de eliminar
    _objLeerLista(plazo);
    if (plazo === 'corto')   _objDatosCorto.splice(idx, 1);
    else                     _objDatosMediano.splice(idx, 1);
    _objRenderLista(plazo);
};

// ── Leer datos de todas las cards de un plazo desde el DOM ──────────
function _objLeerLista(plazo) {
    const lista  = plazo === 'corto' ? _objDatosCorto : _objDatosMediano;
    const n      = lista.length;
    for (let i = 0; i < n; i++) {
        const uid  = `${plazo}_${i}`;
        const tipo = document.querySelector(`input[name="obj_tipo_${uid}"]:checked`)?.value || '';
        lista[i] = {
            tipo,
            tipoOtro:      document.getElementById(`obj_otro_${uid}`)?.value || '',
            pifPct:        document.getElementById(`obj_pif_${uid}`)?.value || '',
            costoEstimado: parseFloat(document.getElementById(`obj_costo_${uid}`)?.value) || null,
            fechaObjetivo: document.getElementById(`obj_fecha_${uid}`)?.value || '',
            prioridad:     document.querySelector(`input[name="obj_pri_${uid}"]:checked`)?.value || 'Media',
        };
    }
}

// ── Re-renderizar lista completa de un plazo ──────────────────────────
function _objRenderLista(plazo) {
    const listEl  = document.getElementById('obj-list-' + plazo);
    if (!listEl) return;
    const lista   = plazo === 'corto' ? _objDatosCorto : _objDatosMediano;
    const cd      = selectedClientData || {};
    // Usar activos globales si están disponibles
    const activos = window._objActivosCached || [];

    listEl.innerHTML = lista.map((d, i) =>
        _objBuildCard(plazo, i, d, cd, activos)
    ).join('');

    // Registrar listeners en las nuevas cards
    lista.forEach((_, i) => {
        const uid  = `${plazo}_${i}`;
        // tipo → mostrar/ocultar "Otro" y campo PIF
        listEl.querySelectorAll(`input[name="obj_tipo_${uid}"]`).forEach(r => {
            r.addEventListener('change', () => {
                const otro  = document.getElementById(`obj-otro-wrap-${uid}`);
                const pif   = document.getElementById(`obj-pif-wrap-${uid}`);
                if (otro) otro.style.display  = r.value === 'otro'       ? '' : 'none';
                if (pif)  pif.style.display   = r.value === 'if_parcial' ? '' : 'none';
                _objActualizarViabilidad(plazo, i);
            });
        });
        // costo y fecha → recalcular viabilidad
        [`obj_costo_${uid}`, `obj_fecha_${uid}`].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', () => _objActualizarViabilidad(plazo, i));
            if (el && id.includes('costo')) el.addEventListener('input', () => _objActualizarViabilidad(plazo, i));
        });
    });
}

// ── Actualizar solo el bloque de viabilidad de una card ───────────────
function _objActualizarViabilidad(plazo, idx) {
    const uid    = `${plazo}_${idx}`;
    const costo  = parseFloat(document.getElementById(`obj_costo_${uid}`)?.value) || null;
    const fecha  = document.getElementById(`obj_fecha_${uid}`)?.value || '';
    const viaEl  = document.getElementById(`obj-via-${uid}`);
    if (!viaEl) return;
    const via    = _objViabilidad(costo, fecha, selectedClientData || {}, window._objActivosCached || []);
    viaEl.innerHTML = _objViabilidadHTML(via);
}

// ── Renderizar card de largo plazo ────────────────────────────────────
function _objRenderLargo(fechaGuardada) {
    const el = document.getElementById('obj-largo-card');
    if (!el) return;

    const cd       = selectedClientData || {};
    const gastos   = parseFloat(cd.monthlyExpenses) || 0;
    const ingActivo= parseFloat(cd.monthlyActiveIncome) || 0;
    const activos  = window._objActivosCached || [];

    let ingPasivoTotal = 0, patrimonioTotal = 0, portafolioProductivoTotal = 0;
    activos.forEach(a => {
        const val  = parseFloat(a.value) || 0;
        const pas  = parseFloat(a.liability) || 0;
        const mon  = a.currency || 'COP';
        const vCOP = convertirACOP(val, mon);
        if (isNaN(vCOP)) return;
        const pCOP = isNaN(convertirACOP(pas, mon)) ? 0 : convertirACOP(pas, mon);
        const neto = vCOP - pCOP;
        patrimonioTotal += neto;
        if (a.generatesIncome) ingPasivoTotal += parseFloat(a.monthlyIncome) || 0;
    });
    // Portafolio productivo para avance real (regla del 4%)
    portafolioProductivoTotal = calcularValorPortafolioProductivoCOP(activos);

    const numeroMagico = gastos * 300;  // gastos × 12 / 0.04 (regla del 4%)
    const pctPatri     = numeroMagico > 0 ? Math.min((portafolioProductivoTotal / numeroMagico) * 100, 999) : 0;
    const pctIngPas    = gastos > 0 ? Math.min((ingPasivoTotal / gastos) * 100, 999) : 0;

    // Fecha objetivo: guardada o fechaAnalisis + 15 años
    let fechaDefecto = '';
    const fechaAnlRaw = cd.analysisDate || '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(fechaAnlRaw)) {
        const d = new Date(fechaAnlRaw + 'T00:00:00');
        d.setFullYear(d.getFullYear() + 15);
        fechaDefecto = d.toISOString().split('T')[0];
    }
    const fechaVal = fechaGuardada || fechaDefecto;

    el.innerHTML = `
        <div class="obj-largo-titulo">🎯 Independencia financiera total</div>
        <div class="obj-largo-sub">Los ingresos pasivos cubren el 100% de los gastos permanentemente.</div>

        <div class="obj-field" style="max-width:200px;margin-bottom:12px;">
            <label>Fecha objetivo</label>
            <input type="date" id="obj-largo-fecha" value="${fechaVal}">
        </div>

        ${gastos > 0 ? `
        <div class="obj-hito">
            <div class="obj-hito-row">
                <span class="obj-hito-lbl">Número Mágico (gastos × 300 = gastos × 12 ÷ 4%)</span>
                <span class="obj-hito-val">${_objFmtCOP(numeroMagico)}</span>
            </div>
        </div>

        <div style="font-size:1rem;font-weight:700;color:#8892a4;text-transform:uppercase;letter-spacing:.05em;margin:8px 0 4px;">
            Hitos intermedios
        </div>
        <div class="obj-hito">
            <div class="obj-hito-row">
                <span class="obj-hito-lbl">Año 5 — 40% de gastos cubiertos</span>
                <span class="obj-hito-val">${_objFmtCOP(gastos * 0.40)}/mes</span>
            </div>
            <div class="obj-hito-row">
                <span class="obj-hito-lbl">Año 10 — 70% de gastos cubiertos</span>
                <span class="obj-hito-val">${_objFmtCOP(gastos * 0.70)}/mes</span>
            </div>
            <div class="obj-hito-row">
                <span class="obj-hito-lbl">Año 15 — 100% de gastos cubiertos</span>
                <span class="obj-hito-val">${_objFmtCOP(gastos * 1.00)}/mes</span>
            </div>
        </div>

        <div style="font-size:1rem;font-weight:700;color:#8892a4;text-transform:uppercase;letter-spacing:.05em;margin:10px 0 6px;">
            Avance actual
        </div>
        <div class="obj-progress-wrap">
            <div>
                <div class="obj-progress-lbl">
                    <span>% del patrimonio hacia el Número Mágico</span>
                    <strong>${pctPatri.toFixed(1)}%</strong>
                </div>
                <div class="obj-progress-track">
                    <div class="obj-progress-fill" style="width:${Math.min(pctPatri,100)}%"></div>
                </div>
                <div style="font-size:1rem;color:#8892a4;margin-top:2px">
                    ${_objFmtCOP(portafolioProductivoTotal)} de ${_objFmtCOP(numeroMagico)} (portafolio productivo)
                </div>
            </div>
            <div>
                <div class="obj-progress-lbl">
                    <span>% de ingresos pasivos sobre gastos</span>
                    <strong>${pctIngPas.toFixed(1)}%</strong>
                </div>
                <div class="obj-progress-track">
                    <div class="obj-progress-fill" style="width:${Math.min(pctIngPas,100)}%"></div>
                </div>
                <div style="font-size:1rem;color:#8892a4;margin-top:2px">
                    ${_objFmtCOP(ingPasivoTotal)}/mes de ${_objFmtCOP(gastos)}/mes
                </div>
            </div>
        </div>
        ` : `<div style="font-size:1rem;color:#8892a4;">Ingresa los gastos mensuales del cliente para ver los hitos y el avance.</div>`}
    `;
}

// ── Leer todos los objetivos del DOM antes de guardar ─────────────────
function objLeerDOM() {
    _objLeerLista('corto');
    _objLeerLista('mediano');
    return {
        cortoPlayzo:   _objDatosCorto.map(d => ({...d})),
        medianoPlayzo: _objDatosMediano.map(d => ({...d})),
        largoPlayzo: {
            fechaObjetivo: document.getElementById('obj-largo-fecha')?.value || '',
        },
    };
}

// ── Inicializar sección objetivos (llamado al abrir modal con cliente) ──
function objInicializar(clientData, activos, datosGuardados) {
    window._objActivosCached = activos || [];

    const dg = datosGuardados || {};
    _objDatosCorto   = (dg.cortoPlayzo   || []).map(d => ({...d}));
    _objDatosMediano = (dg.medianoPlayzo || []).map(d => ({...d}));

    _objRenderLista('corto');
    _objRenderLista('mediano');
    _objRenderLargo((dg.largoPlayzo || {}).fechaObjetivo || '');

    // Listener botón + Agregar
    const btnC = document.getElementById('obj-add-corto');
    const btnM = document.getElementById('obj-add-mediano');
    if (btnC) { btnC.onclick = null; btnC.addEventListener('click', () => _objAddCard('corto')); }
    if (btnM) { btnM.onclick = null; btnM.addEventListener('click', () => _objAddCard('mediano')); }
}
// ══════════════════════════════════════════════════════════════════════
// CAPA 4 — DIVERSIFICACIÓN (nueva implementación completa)
// ══════════════════════════════════════════════════════════════════════

// Jurisdicciones de alta estabilidad jurídica
const C4D_JURISDICCIONES_ESTABLES = new Set([
    'Estados Unidos','Reino Unido','Suiza','Luxemburgo',
    'Singapur','Canadá','Isle of Man','Islas Caimán',
    'Islas Vírgenes Británicas',
]);

// Semáforo Capa 4
function c4dSemaforo(score) {
    if (score >= 9.0) return { cls: 'c4-c1-sem-optimo',    label: '🟢 ÓPTIMO' };
    if (score >= 7.5) return { cls: 'c4-c1-sem-solido',    label: '🟢 MUY BUENO' };
    if (score >= 6.0) return { cls: 'c4-c1-sem-deficiente',label: '🟡 ACEPTABLE' };
    if (score >= 4.0) return { cls: 'c4-c1-sem-deficiente',label: '🟠 DEFICIENTE' };
    return                    { cls: 'c4-c1-sem-critico',  label: '🔴 CRÍTICO' };
}

// ── Calcular métricas de diversificación desde activos raw ────────────
function c4dCalcularMetricas(activos, gastosMes, clientData) {
    const cop = c4cop;

    // Excluir Uso Personal
    const prods = activos.filter(a => (a.category || '') !== 'Uso Personal');
    const patriTotal = prods.reduce((s, a) => {
        const v = convertirACOP(parseFloat(a.value) || 0, a.currency || 'COP');
        const p = convertirACOP(parseFloat(a.liability) || 0, a.currency || 'COP');
        if (isNaN(v)) return s;
        return s + v - (isNaN(p) ? 0 : p);
    }, 0);

    // ── Por tipo ──────────────────────────────────────────────────────
    const mapTipo = {};
    prods.forEach(a => {
        const cat = a.category || 'Sin categoría';
        const v = convertirACOP(parseFloat(a.value)||0, a.currency||'COP');
        const p = convertirACOP(parseFloat(a.liability)||0, a.currency||'COP');
        if (isNaN(v)) return;
        const neto = v - (isNaN(p) ? 0 : p);
        mapTipo[cat] = (mapTipo[cat] || 0) + neto;
    });
    const tipoEntries = Object.entries(mapTipo).sort((a,b) => b[1]-a[1]);
    const numTipos = tipoEntries.length;
    const tipoConcMax = tipoEntries.reduce((mx,[,v]) => Math.max(mx, patriTotal > 0 ? v/patriTotal*100 : 0), 0);
    const tipoConcNombre = tipoEntries.reduce((best,[k,v]) =>
        (patriTotal > 0 && v/patriTotal*100 > best.pct ? {nombre:k, pct:v/patriTotal*100} : best), {nombre:'',pct:0});

    // ── Por moneda ────────────────────────────────────────────────────
    const mapMoneda = {};
    prods.forEach(a => {
        const mon = a.currency || 'COP';
        const v = convertirACOP(parseFloat(a.value)||0, mon);
        const p = convertirACOP(parseFloat(a.liability)||0, mon);
        if (isNaN(v)) return;
        const neto = v - (isNaN(p) ? 0 : p);
        mapMoneda[mon] = (mapMoneda[mon] || 0) + neto;
    });
    const monedaEntries = Object.entries(mapMoneda).sort((a,b) => b[1]-a[1]);
    const numMonedas = monedaEntries.length;
    const pctCOP = patriTotal > 0 ? (mapMoneda['COP'] || 0) / patriTotal * 100 : 0;
    const monedaConcMax = monedaEntries.reduce((mx,[,v]) => Math.max(mx, patriTotal > 0 ? v/patriTotal*100 : 0), 0);

    // ── Por país ──────────────────────────────────────────────────────
    const mapPais = {};
    prods.forEach(a => {
        const pais = (a.location || 'Colombia').trim() || 'Colombia';
        const v = convertirACOP(parseFloat(a.value)||0, a.currency||'COP');
        const p = convertirACOP(parseFloat(a.liability)||0, a.currency||'COP');
        if (isNaN(v)) return;
        const neto = v - (isNaN(p) ? 0 : p);
        mapPais[pais] = (mapPais[pais] || 0) + neto;
    });
    const paisEntries = Object.entries(mapPais).sort((a,b) => b[1]-a[1]);
    const numPaises = paisEntries.length;
    const paisConcMax = paisEntries.reduce((mx,[,v]) => Math.max(mx, patriTotal > 0 ? v/patriTotal*100 : 0), 0);
    const activosEnJurisdiccionEstable = prods.filter(a =>
        C4D_JURISDICCIONES_ESTABLES.has((a.location || '').trim()));
    const tieneJurisdiccionEstable = activosEnJurisdiccionEstable.length > 0;

    // ── Empresariales ─────────────────────────────────────────────────
    const actEmp = prods.filter(a => a.category === 'Empresarial').map(a => {
        const v = convertirACOP(parseFloat(a.value)||0, a.currency||'COP');
        const p = convertirACOP(parseFloat(a.liability)||0, a.currency||'COP');
        const neto = isNaN(v) ? 0 : v - (isNaN(p) ? 0 : p);
        return { name: a.description || a.subtype || 'Empresa', neto };
    });
    const pctNegocioMax = actEmp.length > 0 && patriTotal > 0
        ? Math.max(...actEmp.map(e => e.neto / patriTotal * 100))
        : 0;

    // ── Dependencia ingresos activos ──────────────────────────────────
    const ingActivo = parseFloat(clientData?.monthlyActiveIncome) || 0;
    const ingPasivo = parseFloat(clientData?.totalIngresosPasivos) ||
                      (activos.reduce((s,a) =>
                          a.generatesIncome ? s + (parseFloat(a.monthlyIncome)||0) : s, 0));
    const totalIngresos = ingActivo + ingPasivo;
    const pctDepActiva = totalIngresos > 0 ? ingActivo / totalIngresos * 100 : 100;

    // ── Concentración sectorial ───────────────────────────────────────
    const actConSector = prods.filter(a =>
        (a.category === 'Financiero' || a.category === 'Empresarial') &&
        a.sector && a.sector !== 'Global / Diversificado'
    );
    const actGlobal = prods.filter(a =>
        (a.category === 'Financiero' || a.category === 'Empresarial') &&
        a.sector === 'Global / Diversificado'
    );
    const mapSector = {};
    let totalSectorCOP = 0;
    actConSector.forEach(a => {
        const v = convertirACOP(parseFloat(a.value)||0, a.currency||'COP');
        const p = convertirACOP(parseFloat(a.liability)||0, a.currency||'COP');
        if (isNaN(v)) return;
        const neto = v - (isNaN(p) ? 0 : p);
        mapSector[a.sector] = (mapSector[a.sector] || 0) + neto;
        totalSectorCOP += neto;
    });
    const sectorEntries = Object.entries(mapSector).sort((a,b) => b[1]-a[1]);
    const numSectores = sectorEntries.length;
    const sectorConcMax = totalSectorCOP > 0
        ? sectorEntries.reduce((mx,[,v]) => Math.max(mx, v/totalSectorCOP*100), 0)
        : 0;
    const sectorConcNombre = sectorEntries.length > 0
        ? sectorEntries.reduce((best,[k,v]) =>
            v/totalSectorCOP*100 > best.pct ? {nombre:k, pct:v/totalSectorCOP*100} : best, {nombre:'',pct:0})
        : {nombre:'', pct:0};

    return {
        cop, patriTotal,
        tipoEntries, numTipos, tipoConcMax, tipoConcNombre,
        monedaEntries, numMonedas, pctCOP, monedaConcMax,
        paisEntries, numPaises, paisConcMax,
        activosEnJurisdiccionEstable, tieneJurisdiccionEstable,
        actEmp, pctNegocioMax,
        ingActivo, ingPasivo, totalIngresos, pctDepActiva,
        actConSector, actGlobal, sectorEntries, numSectores,
        sectorConcMax, sectorConcNombre, totalSectorCOP, mapSector,
    };
}

// ── Calcular 6 scores de la Capa 4 ───────────────────────────────────
function c4dScores(d) {
    // C1: tipos
    let sc1 = d.numTipos >= 4 ? 2 : d.numTipos === 3 ? 1.5 : d.numTipos === 2 ? 1 : 0;
    if (d.tipoConcMax > 70) sc1 = parseFloat((sc1 * 0.5).toFixed(2));

    // C2: monedas
    let sc2;
    if (d.numMonedas >= 3) sc2 = 2;
    else if (d.numMonedas === 2 && d.monedaConcMax <= 70) sc2 = 1.5;
    else if (d.numMonedas === 2) sc2 = 1;
    else sc2 = 0;
    if (d.pctCOP > 80) sc2 = Math.max(sc2 - 0.5, 0);

    // C3: geografía + bonus jurisdicción estable
    let sc3;
    if (d.numPaises >= 3) sc3 = 2;
    else if (d.numPaises === 2 && d.paisConcMax <= 70) sc3 = 1.5;
    else if (d.numPaises === 2) sc3 = 1;
    else sc3 = 0;
    if (d.tieneJurisdiccionEstable) sc3 = Math.min(sc3 + 0.5, 2);

    // C4: negocio único
    let sc4;
    if (d.actEmp.length === 0) sc4 = 1;
    else if (d.pctNegocioMax <= 30) sc4 = 2;
    else if (d.pctNegocioMax <= 50) sc4 = 1.5;
    else if (d.pctNegocioMax <= 60) sc4 = 1;
    else sc4 = 0;

    // C5: dependencia ingresos activos
    let sc5;
    if (d.pctDepActiva <= 50) sc5 = 2;
    else if (d.pctDepActiva <= 70) sc5 = 1.5;
    else if (d.pctDepActiva <= 90) sc5 = 1;
    else sc5 = 0;

    // C6: concentración sectorial
    let sc6;
    if (d.actConSector.length === 0)                              sc6 = 2;   // sin sector específico / todo Global
    else if (d.numSectores === 1)                                 sc6 = 0;   // concentración total en 1 sector
    else if (d.numSectores >= 3 && d.sectorConcMax <= 40)        sc6 = 2;   // muy diversificado
    else if (d.numSectores >= 2 && d.sectorConcMax <= 40)        sc6 = 1.5; // bien diversificado
    else if (d.numSectores >= 2 && d.sectorConcMax <= 60)        sc6 = 1;   // concentración moderada
    else                                                           sc6 = 0;   // alta concentración

    const bruto = sc1 + sc2 + sc3 + sc4 + sc5 + sc6;
    const final = parseFloat(Math.min(10, (bruto / 12) * 10).toFixed(1));
    return { sc1, sc2, sc3, sc4, sc5, sc6, final };
}

// ── Helper: fila de barra de distribución ────────────────────────────
function c4dBarraFila(label, neto, pct, patriTotal, warn, cop) {
    const w = Math.min(pct, 100).toFixed(1);
    const fillCls = warn ? 'c4d-barra-fill c4d-barra-fill--warn' : 'c4d-barra-fill';
    return '<div class="c4d-barra-row">'
        + '<span class="c4d-barra-lbl">' + label + '</span>'
        + '<div class="c4d-barra-track"><div class="' + fillCls + '" style="width:' + w + '%"></div></div>'
        + '<span class="c4d-barra-pct">' + pct.toFixed(1) + '%</span>'
        + '<span class="c4d-barra-cop">' + cop(neto) + '</span>'
        + '</div>';
}

// ── Construir HTML de Capa 4 ──────────────────────────────────────────
function c4dBuildHTML(activos, gastosMes, clientData) {
    const d = c4dCalcularMetricas(activos, gastosMes, clientData);
    const s = c4dScores(d);
    const sem = c4dSemaforo(s.final);
    const cop = d.cop;

    const criterio = (num, titulo, pts, max, body) =>
        '<div class="c4-criterio">'
        + '<div class="c4-criterio-hd">'
        + '<span class="c4-crit-num">' + num + '</span>'
        + '<span class="c4-crit-title">' + titulo + '</span>'
        + '<span class="c4-tag-auto">AUTO</span>'
        + '<span class="c4-tag-pts">máx ' + max + ' pt</span>'
        + '<span class="c2-crit-badge ' + (pts >= max*0.75 ? 'c2-badge-ok' : pts >= max*0.4 ? 'c2-badge-warn' : 'c2-badge-mal') + '">'
        + pts.toFixed(1) + ' / ' + max + ' pt</span>'
        + '</div>'
        + '<div class="c4-auto-ctx">' + body + '</div>'
        + '</div>';

    // ── C1: tipos ────────────────────────────────────────────────────
    const c1Body = (() => {
        let h = '<div class="c4d-seccion-lbl">Distribución por tipo de activo (excluye Uso Personal)</div>';
        d.tipoEntries.forEach(([tipo, neto]) => {
            const pct = d.patriTotal > 0 ? neto/d.patriTotal*100 : 0;
            h += c4dBarraFila(tipo, neto, pct, d.patriTotal, pct > 70, cop);
        });
        h += '<div class="c4d-sub">Tipos distintos: ' + d.numTipos + '</div>';
        if (d.tipoConcMax > 70) {
            h += '<div class="c4d-alerta c4d-alerta--warn">⚠️ Alta concentración en '
                + d.tipoConcNombre.nombre + ' — ' + d.tipoConcNombre.pct.toFixed(1)
                + '%. Meta: ningún tipo debe superar el 70%</div>';
        }
        return h;
    })();

    // ── C2: monedas ──────────────────────────────────────────────────
    const c2Body = (() => {
        let h = '<div class="c4d-seccion-lbl">Distribución por moneda</div>';
        d.monedaEntries.forEach(([mon, neto]) => {
            const pct = d.patriTotal > 0 ? neto/d.patriTotal*100 : 0;
            h += c4dBarraFila(mon, neto, pct, d.patriTotal, pct > 80, cop);
        });
        h += '<div class="c4d-sub">Monedas distintas: ' + d.numMonedas + '</div>';
        if (d.pctCOP > 80) {
            h += '<div class="c4d-alerta c4d-alerta--bad">🔴 Alta exposición a COP — '
                + d.pctCOP.toFixed(1) + '%. Riesgo de devaluación. Meta: máximo 60% en COP</div>';
        } else if (d.numMonedas === 1) {
            h += '<div class="c4d-alerta c4d-alerta--warn">⚠️ Todo el patrimonio en una sola moneda — sin cobertura cambiaria</div>';
        }
        return h;
    })();

    // ── C3: geografía ────────────────────────────────────────────────
    const c3Body = (() => {
        let h = '<div class="c4d-seccion-lbl">Distribución geográfica</div>';
        d.paisEntries.forEach(([pais, neto]) => {
            const pct = d.patriTotal > 0 ? neto/d.patriTotal*100 : 0;
            h += c4dBarraFila(pais, neto, pct, d.patriTotal, pct > 70, cop);
        });
        h += '<div class="c4d-sub">Países distintos: ' + d.numPaises + '</div>';
        h += '<div class="c4d-seccion-lbl" style="margin-top:8px">Jurisdicciones de alta estabilidad jurídica</div>';
        if (d.activosEnJurisdiccionEstable.length > 0) {
            d.activosEnJurisdiccionEstable.forEach(a => {
                const v = convertirACOP(parseFloat(a.value)||0, a.currency||'COP');
                h += '<div class="c4d-sub">✅ ' + (a.description || a.subtype || 'Activo')
                    + ' — ' + (a.location||'') + ' (' + cop(isNaN(v)?0:v) + ')</div>';
            });
            h += '<div class="c4d-alerta c4d-alerta--ok">✅ Tiene activos en jurisdicción de alta estabilidad jurídica (+0.5 bonus)</div>';
        } else {
            h += '<div class="c4d-alerta c4d-alerta--warn">⚠️ Sin activos en jurisdicciones de alta estabilidad jurídica</div>';
        }
        if (d.numPaises === 1) {
            h += '<div class="c4d-alerta c4d-alerta--warn">⚠️ Todo el patrimonio en un solo país — sin diversificación geográfica</div>';
        }
        return h;
    })();

    // ── C4: negocio único ────────────────────────────────────────────
    const c4Body = (() => {
        if (d.actEmp.length === 0) return '<div class="c4d-alerta c4d-alerta--ok">Sin activos empresariales — sin riesgo de concentración en negocio único</div>';
        let h = '<div class="c4d-seccion-lbl">Activos empresariales</div>';
        d.actEmp.forEach(e => {
            const pct = d.patriTotal > 0 ? e.neto/d.patriTotal*100 : 0;
            h += c4dBarraFila(e.name, e.neto, pct, d.patriTotal, pct > 60, cop);
        });
        if (d.pctNegocioMax > 60) {
            h += '<div class="c4d-alerta c4d-alerta--bad">🔴 Más del 60% del patrimonio depende de un solo negocio — riesgo crítico ('
                + d.pctNegocioMax.toFixed(1) + '%)</div>';
        } else if (d.pctNegocioMax > 30) {
            h += '<div class="c4d-alerta c4d-alerta--warn">⚠️ Negocio representa '
                + d.pctNegocioMax.toFixed(1) + '% del patrimonio — monitorear</div>';
        }
        return h;
    })();

    // ── C5: dependencia ingresos ─────────────────────────────────────
    const c5Body = (() => {
        let h = '<div class="c4d-seccion-lbl">Composición de ingresos mensuales</div>';
        const total = d.totalIngresos;
        const pctA = total > 0 ? d.ingActivo/total*100 : 100;
        const pctP = total > 0 ? d.ingPasivo/total*100 : 0;
        h += c4dBarraFila('Ingresos activos (trabajo)', d.ingActivo, pctA, total, pctA > 90, cop);
        h += c4dBarraFila('Ingresos pasivos', d.ingPasivo, pctP, total, false, cop);
        h += '<div class="c4d-sub" style="border-top:1px solid rgba(255,255,255,.06);padding-top:4px;margin-top:2px">'
            + 'Total: ' + cop(total) + '/mes</div>';
        if (d.pctDepActiva > 90) {
            h += '<div class="c4d-alerta c4d-alerta--bad">🔴 Más del 90% depende de la capacidad de trabajo del cliente</div>';
        } else if (d.pctDepActiva <= 50) {
            h += '<div class="c4d-alerta c4d-alerta--ok">✅ Excelente balance de ingresos — buena independencia financiera</div>';
        }
        return h;
    })();

    // ── C6: concentración sectorial ──────────────────────────────────
    const c6Body = (() => {
        if (d.actConSector.length === 0 && d.actGlobal.length === 0) {
            return '<div class="c4d-alerta c4d-alerta--warn">⚠️ Sector no definido en los activos — ve al mapa patrimonial y asigna el sector a cada activo de inversión</div>';
        }
        let h = '';
        if (d.actConSector.length === 0) {
            h += '<div class="c4d-alerta c4d-alerta--ok">✅ Sin concentración sectorial — activos globalmente diversificados</div>';
        } else {
            h += '<div class="c4d-seccion-lbl">Distribución sectorial (excluye Global/Diversificado)</div>';
            d.sectorEntries.forEach(([sec, neto]) => {
                const pct = d.totalSectorCOP > 0 ? neto/d.totalSectorCOP*100 : 0;
                h += c4dBarraFila(sec, neto, pct, d.totalSectorCOP, pct > 40, cop);
            });
            if (d.sectorConcMax > 40) {
                h += '<div class="c4d-alerta c4d-alerta--warn">⚠️ Alta concentración en '
                    + d.sectorConcNombre.nombre + ' — ' + d.sectorConcMax.toFixed(1)
                    + '%. Meta: ningún sector debe superar el 40%</div>';
            }
        }
        if (d.actGlobal.length > 0) {
            h += '<div class="c4d-seccion-lbl" style="margin-top:8px">Activos globalmente diversificados (excluidos del análisis)</div>';
            d.actGlobal.forEach(a => {
                const v = convertirACOP(parseFloat(a.value)||0, a.currency||'COP');
                h += '<div class="c4d-sub">✅ ' + (a.description || a.subtype || 'Activo')
                    + ' — Global / Diversificado (' + cop(isNaN(v)?0:v) + ')</div>';
            });
        }
        return h;
    })();

    return '<div class="c4-card">'
        + '<div class="c4-card-hd">'
        + '<div class="c4-num c4n-4">4</div>'
        + '<div>'
        + '<div class="c4-title">Diversificación Patrimonial</div>'
        + '<div class="c4-sub">Distribución estratégica del patrimonio — máx 10 pts</div>'
        + '</div>'
        + '<div class="c4-badge">'
        + '<div class="c4-badge-n" id="c4-score-diversificacion">' + s.final.toFixed(1) + '</div>'
        + '<div class="c4-badge-d">/10 pts</div>'
        + '</div>'
        + '</div>'
        + '<div class="c4-body">'
        + '<div class="c4-auto-ctx" style="margin-bottom:8px;font-size:1rem;color:#8892a4">'
        + 'Evalúa si el patrimonio está distribuido de forma que ningún evento, mercado, moneda, geografía o sector pueda destruirlo. '
        + 'Un patrimonio bien diversificado reduce el riesgo estructural sin sacrificar rentabilidad. '
        + 'Todos los criterios son automáticos desde el mapa de activos.'
        + '</div>'
        + criterio('C1','Diversificación de tipos de activos', s.sc1, 2, c1Body)
        + criterio('C2','Diversificación de monedas', s.sc2, 2, c2Body)
        + criterio('C3','Diversificación geográfica', s.sc3, 2, c3Body)
        + criterio('C4','Dependencia de negocio único', s.sc4, 2, c4Body)
        + criterio('C5','Dependencia de ingresos activos', s.sc5, 2, c5Body)
        + criterio('C6','Concentración sectorial', s.sc6, 2, c6Body)
        + '<div class="c4d-semaforo">'
        + '<span class="c4d-sem-lbl">Resultado Capa 4</span>'
        + '<span class="c4d-sem-badge ' + sem.cls + '">' + sem.label + '</span>'
        + '</div>'
        + '</div>'
        + '</div>';
}
// ══════════════════════════════════════════════════════════════════════
// DASHBOARD: BLOQUES 7-10 + RESUMEN CONCENTRACIONES
// ══════════════════════════════════════════════════════════════════════

let dbChartGeo    = null;
let dbChartSector = null;
let dbChartIngresosDep = null;

// ── Helper: fila de barra de concentración para bloques no-chart ─────
function _dbConcRow(label, neto, pct, cls) {
    const fillCls = cls === 'bad' ? 'db-conc-fill db-conc-fill--bad'
        : cls === 'warn' ? 'db-conc-fill db-conc-fill--warn'
        : 'db-conc-fill';
    const w = Math.min(pct, 100).toFixed(1);
    return '<div class="db-conc-row">'
        + '<span class="db-conc-lbl">' + label + '</span>'
        + '<div class="db-conc-track"><div class="' + fillCls + '" style="width:' + w + '%"></div></div>'
        + '<span class="db-conc-pct">' + pct.toFixed(1) + '%</span>'
        + '<span class="db-conc-cop">' + fmtCOP(neto) + '</span>'
        + '</div>';
}

// ── Calcular métricas de concentración extras desde activos raw ───────
function _dbConcMetricas(activos, clientData) {
    const prods = activos.filter(a => (a.category || '') !== 'Uso Personal');
    let patriTotal = 0;
    prods.forEach(a => {
        const v = convertirACOP(parseFloat(a.value)||0, a.currency||'COP');
        const p = convertirACOP(parseFloat(a.liability)||0, a.currency||'COP');
        if (!isNaN(v)) patriTotal += v - (isNaN(p) ? 0 : p);
    });

    // Por país
    const mapPais = {};
    prods.forEach(a => {
        const pais = (a.location || 'Colombia').trim() || 'Colombia';
        const v = convertirACOP(parseFloat(a.value)||0, a.currency||'COP');
        const p = convertirACOP(parseFloat(a.liability)||0, a.currency||'COP');
        if (isNaN(v)) return;
        mapPais[pais] = (mapPais[pais] || 0) + (v - (isNaN(p) ? 0 : p));
    });
    const paisEntries = Object.entries(mapPais).sort((a,b) => b[1]-a[1]);
    const numPaises   = paisEntries.length;
    const paisConcMax = paisEntries.reduce((mx,[,v]) => Math.max(mx, patriTotal > 0 ? v/patriTotal*100 : 0), 0);
    const actJurisEst = prods.filter(a => C4D_JURISDICCIONES_ESTABLES.has((a.location||'').trim()));

    // Empresariales
    const actEmp = prods.filter(a => a.category === 'Empresarial').map(a => {
        const v = convertirACOP(parseFloat(a.value)||0, a.currency||'COP');
        const p = convertirACOP(parseFloat(a.liability)||0, a.currency||'COP');
        const neto = isNaN(v) ? 0 : v - (isNaN(p) ? 0 : p);
        return { name: a.description || a.subtype || 'Empresa', neto,
                 pct: patriTotal > 0 ? neto/patriTotal*100 : 0 };
    }).sort((a,b) => b.pct - a.pct);
    const pctNegocioMax = actEmp.length > 0 ? actEmp[0].pct : 0;
    const nombreNegocioMax = actEmp.length > 0 ? actEmp[0].name : '';

    // Ingresos
    const ingActivo = parseFloat(clientData?.monthlyActiveIncome) || 0;
    const ingPasivo = activos.reduce((s,a) =>
        a.generatesIncome ? s + (parseFloat(a.monthlyIncome)||0) : s, 0);
    const totalIng  = ingActivo + ingPasivo;
    const pctDepAct = totalIng > 0 ? ingActivo/totalIng*100 : 100;

    // Sectorial
    const actConSec = prods.filter(a =>
        (a.category === 'Financiero' || a.category === 'Empresarial') &&
        a.sector && a.sector !== 'Global / Diversificado');
    const actGlobalDiv = prods.filter(a =>
        (a.category === 'Financiero' || a.category === 'Empresarial') &&
        a.sector === 'Global / Diversificado');
    const mapSec = {};
    let totalSecCOP = 0;
    actConSec.forEach(a => {
        const v = convertirACOP(parseFloat(a.value)||0, a.currency||'COP');
        const p = convertirACOP(parseFloat(a.liability)||0, a.currency||'COP');
        if (isNaN(v)) return;
        const neto = v - (isNaN(p) ? 0 : p);
        mapSec[a.sector] = (mapSec[a.sector] || 0) + neto;
        totalSecCOP += neto;
    });
    const secEntries = Object.entries(mapSec).sort((a,b) => b[1]-a[1]);
    const numSectores = secEntries.length;
    const secConcMax  = secEntries.length > 0 && totalSecCOP > 0
        ? secEntries[0][1]/totalSecCOP*100 : 0;
    const nombreSecMax = secEntries.length > 0 ? secEntries[0][0] : '';

    return {
        patriTotal, paisEntries, numPaises, paisConcMax, actJurisEst,
        actEmp, pctNegocioMax, nombreNegocioMax,
        ingActivo, ingPasivo, totalIng, pctDepAct,
        actConSec, actGlobalDiv, secEntries, numSectores, secConcMax,
        nombreSecMax, totalSecCOP,
    };
}

// ── Bloque 7: Concentración Geográfica ───────────────────────────────
function renderBloque7_Geo(activos, clientData) {
    const d = _dbConcMetricas(activos, clientData);
    if (dbChartGeo) { dbChartGeo.destroy(); dbChartGeo = null; }
    const ctx = document.getElementById('db-chart-geo');
    if (!ctx) return;

    const hasData = d.paisEntries.length > 0;
    const labels = hasData ? d.paisEntries.map(([p]) => p) : ['Sin datos'];
    const vals   = hasData ? d.paisEntries.map(([,v]) => d.patriTotal > 0 ? v/d.patriTotal*100 : 0) : [100];
    const PAIS_COLORS = ['#4a90d9','#34d399','#f0c040','#a78bfa','#f87171','#fb923c','#38bdf8'];
    const colors = hasData ? d.paisEntries.map((_,i) => PAIS_COLORS[i % PAIS_COLORS.length]) : ['#edf0f4'];

    dbChartGeo = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data: vals, backgroundColor: colors, borderWidth: 0 }] },
        options: { responsive: true, maintainAspectRatio: false, cutout: '70%',
            plugins: { legend: { display: false }, tooltip: {
                backgroundColor:'#ffffff',titleColor:'#1e2a3a',bodyColor:'#5e6b7f',
                borderColor:'#e8ecf1',borderWidth:1,
                callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed.toFixed(1)}%` }
            }}}
    });

    const legend = document.getElementById('db-legend-geo');
    if (legend) {
        legend.innerHTML = hasData
            ? d.paisEntries.map(([pais, neto], i) => {
                const pct = d.patriTotal > 0 ? neto/d.patriTotal*100 : 0;
                return `<div class="db-legend-item">
                    <span class="db-legend-dot" style="background:${colors[i]}"></span>
                    <span>${pais}</span>
                    <span class="db-legend-pct">${pct.toFixed(1)}%</span>
                </div>`;
            }).join('') + `<div style="font-size:1rem;color:#8c95a6;margin-top:6px">Países distintos: ${d.numPaises}</div>`
            : '<p class="db-legend-empty">Sin activos registrados</p>';
    }

    const jurisdEl = document.getElementById('db-geo-jurisdiccion');
    if (jurisdEl) {
        if (d.actJurisEst.length > 0) {
            jurisdEl.textContent = '✅ Tiene activos en jurisdicción de alta estabilidad jurídica';
            jurisdEl.style.display = 'block';
        } else { jurisdEl.style.display = 'none'; }
    }

    const alertEl = document.getElementById('db-alert-geo');
    const alertMsg = document.getElementById('db-alert-geo-msg');
    const esDanger  = d.paisConcMax > 70 || d.numPaises === 1;
    const esWarning = !esDanger && d.paisConcMax > 50;
    setCardSemaphore('db-bloque-geo', esDanger ? 'card-danger' : esWarning ? 'card-warning' : 'card-success');
    if (alertEl && alertMsg) {
        if (esDanger) {
            alertMsg.textContent = d.numPaises === 1
                ? 'Todo el patrimonio en un solo país — sin diversificación geográfica'
                : `Alta concentración geográfica: ${d.paisConcMax.toFixed(1)}% en un solo país`;
            alertEl.style.display = 'flex';
        } else if (esWarning) {
            alertMsg.textContent = `Concentración geográfica moderada: ${d.paisConcMax.toFixed(1)}% en un solo país`;
            alertEl.style.display = 'flex';
        } else { alertEl.style.display = 'none'; }
    }
    return d;
}

// ── Bloque 8: Dependencia Negocio Único ──────────────────────────────
function renderBloque8_Negocio(d) {
    const lista = document.getElementById('db-negocio-lista');
    if (lista) {
        if (d.actEmp.length === 0) {
            lista.innerHTML = '<p class="db-legend-empty" style="color:#0d7a4f">✅ Sin activos empresariales</p>';
        } else {
            lista.innerHTML = d.actEmp.map(e => {
                const cls = e.pct > 60 ? 'bad' : e.pct > 40 ? 'warn' : '';
                return _dbConcRow(e.name, e.neto, e.pct, cls);
            }).join('');
        }
    }
    const esDanger  = d.pctNegocioMax > 60;
    const esWarning = !esDanger && d.pctNegocioMax > 40;
    setCardSemaphore('db-bloque-negocio', d.actEmp.length === 0 ? 'card-neutral'
        : esDanger ? 'card-danger' : esWarning ? 'card-warning' : 'card-success');
    const alertEl = document.getElementById('db-alert-negocio');
    const alertMsg = document.getElementById('db-alert-negocio-msg');
    if (alertEl && alertMsg) {
        if (esDanger) {
            alertMsg.textContent = `${d.pctNegocioMax.toFixed(1)}% del patrimonio en un solo negocio — riesgo crítico`;
            alertEl.style.display = 'flex';
        } else if (esWarning) {
            alertMsg.textContent = `Concentración moderada en negocio: ${d.pctNegocioMax.toFixed(1)}%`;
            alertEl.style.display = 'flex';
        } else { alertEl.style.display = 'none'; }
    }
}

// ── Bloque 9: Dependencia Ingresos Activos (donut) ──────────────────
function renderBloque9_IngresosDep(d) {
    if (dbChartIngresosDep) { dbChartIngresosDep.destroy(); dbChartIngresosDep = null; }

    const ctx = document.getElementById('db-chart-ingresos-dep');
    const legend = document.getElementById('db-legend-ingresos-dep');
    if (!ctx) return;

    const hasData = d.totalIng > 0;
    const pctA = hasData ? d.pctDepAct : 0;
    const pctP = hasData ? 100 - pctA : 0;

    const labels = hasData ? ['Ingresos activos', 'Ingresos pasivos'] : ['Sin datos'];
    const data   = hasData ? [pctA, pctP] : [100];
    const colors = hasData ? ['#e8a735', '#3dd68c'] : ['#252b3a'];

    dbChartIngresosDep = new Chart(ctx, {
        type: 'doughnut',
        data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
        options: {
            responsive: true, maintainAspectRatio: false,
            cutout: '70%',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#1c2130',
                    titleColor: '#e8eaed',
                    bodyColor: '#8892a4',
                    borderColor: 'rgba(255,255,255,0.08)',
                    borderWidth: 1,
                    callbacks: {
                        label: ctx => ` ${ctx.label}: ${ctx.parsed.toFixed(1)}%`
                    }
                }
            }
        }
    });

    // Leyenda
    if (legend) {
        if (!hasData) {
            legend.innerHTML = '<p class="db-legend-empty">Sin datos de ingresos</p>';
        } else {
            const items = [
                { label: 'Ingresos activos', value: d.ingActivo, pct: pctA, color: colors[0] },
                { label: 'Ingresos pasivos', value: d.ingPasivo, pct: pctP, color: colors[1] }
            ];
            legend.innerHTML = items.map(it => `
                <div class="db-legend-item">
                    <span class="db-legend-dot" style="background:${it.color}"></span>
                    <span>${it.label}</span>
                    <span class="db-legend-pct">${it.pct.toFixed(1)}%</span>
                </div>
                <div style="font-size:1rem;color:#8892a4;margin-left:18px;margin-top:-4px;">${fmtCOP(it.value)}/mes</div>
            `).join('');
        }
    }

    // Semáforo y alertas (lógica sin cambios)
    const esDanger  = d.pctDepAct > 90;
    const esWarning = !esDanger && d.pctDepAct > 70;
    const esOk      = d.pctDepAct <= 50;
    setCardSemaphore('db-bloque-ingresos-dep', esDanger ? 'card-danger' : esWarning ? 'card-warning' : 'card-success');
    const alertEl = document.getElementById('db-alert-ingresos-dep');
    const alertMsg = document.getElementById('db-alert-ingresos-dep-msg');
    if (alertEl && alertMsg) {
        if (esDanger) { alertMsg.textContent = '🔴 Dependencia crítica de ingresos activos'; alertEl.style.display = 'flex'; }
        else if (esWarning) { alertMsg.textContent = '⚠️ Alta dependencia de ingresos activos'; alertEl.style.display = 'flex'; }
        else if (esOk) { alertMsg.textContent = '✅ Excelente balance de ingresos'; alertEl.style.display = 'flex'; }
        else { alertEl.style.display = 'none'; }
    }
}

// ── Bloque 10: Concentración Sectorial ───────────────────────────────
function renderBloque10_Sector(d) {
    if (dbChartSector) { dbChartSector.destroy(); dbChartSector = null; }
    const body = document.getElementById('db-sector-body');
    if (!body) return;

    if (d.actConSec.length === 0 && d.actGlobalDiv.length === 0) {
        body.innerHTML = '<p class="db-legend-empty">⚠️ Asigna el sector a tus activos de inversión en el mapa patrimonial</p>';
        setCardSemaphore('db-bloque-sector', 'card-warning');
        const alertEl = document.getElementById('db-alert-sector');
        if (alertEl) alertEl.style.display = 'none';
        return;
    }

    let html = '';
    if (d.actConSec.length === 0) {
        html = '<p class="db-legend-empty" style="color:#0d7a4f">✅ Sin concentración sectorial — activos globalmente diversificados</p>';
        setCardSemaphore('db-bloque-sector', 'card-success');
    } else {
        const ctx = document.createElement('canvas');
        ctx.id = 'db-chart-sector'; ctx.width = 200; ctx.height = 200;
        const chartWrap = document.createElement('div');
        chartWrap.className = 'db-chart-inner';
        const donutWrap = document.createElement('div');
        donutWrap.className = 'db-donut-wrap';
        donutWrap.appendChild(ctx);
        const legendDiv = document.createElement('div');
        legendDiv.className = 'db-chart-legend';
        chartWrap.appendChild(donutWrap); chartWrap.appendChild(legendDiv);
        body.innerHTML = ''; body.appendChild(chartWrap);

        const SEC_COLORS = ['#4a90d9','#34d399','#f0c040','#a78bfa','#f87171','#fb923c','#38bdf8','#94a3b8'];
        const slabels = d.secEntries.map(([s]) => s);
        const svals   = d.secEntries.map(([,v]) => d.totalSecCOP > 0 ? v/d.totalSecCOP*100 : 0);
        const scolors = d.secEntries.map((_,i) => SEC_COLORS[i % SEC_COLORS.length]);
        dbChartSector = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: slabels, datasets: [{ data: svals, backgroundColor: scolors, borderWidth: 0 }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '70%',
                plugins: { legend: { display: false }, tooltip: {
                    backgroundColor:'#ffffff',titleColor:'#1e2a3a',bodyColor:'#5e6b7f',
                    borderColor:'#e8ecf1',borderWidth:1,
                    callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed.toFixed(1)}%` }
                }}}
        });
        legendDiv.innerHTML = d.secEntries.map(([sec, neto], i) => {
            const pct = d.totalSecCOP > 0 ? neto/d.totalSecCOP*100 : 0;
            return `<div class="db-legend-item">
                <span class="db-legend-dot" style="background:${scolors[i]}"></span>
                <span>${sec}</span>
                <span class="db-legend-pct">${pct.toFixed(1)}%</span>
            </div>`;
        }).join('');

        const esDanger  = d.numSectores === 1 || d.secConcMax > 60;
        const esWarning = !esDanger && d.secConcMax > 40;
        setCardSemaphore('db-bloque-sector', esDanger ? 'card-danger' : esWarning ? 'card-warning' : 'card-success');
        const alertEl = document.getElementById('db-alert-sector');
        const alertMsg = document.getElementById('db-alert-sector-msg');
        if (alertEl && alertMsg) {
            if (esDanger) {
                alertMsg.textContent = `🔴 Alta concentración en ${d.nombreSecMax} — ${d.secConcMax.toFixed(1)}%`;
                alertEl.style.display = 'flex';
            } else if (esWarning) {
                alertMsg.textContent = `⚠️ Concentración moderada en ${d.nombreSecMax} — ${d.secConcMax.toFixed(1)}%`;
                alertEl.style.display = 'flex';
            } else { alertEl.style.display = 'none'; }
        }

        if (d.actGlobalDiv.length > 0) {
            const nota = document.createElement('div');
            nota.style.cssText = 'font-size:1rem;color:#8c95a6;margin-top:6px;font-style:italic';
            nota.textContent = 'Activos globalmente diversificados no incluidos: '
                + d.actGlobalDiv.map(a => a.description || a.subtype || 'Activo').join(', ');
            body.appendChild(nota);
        }
        return;
    }

    body.innerHTML = html;
    if (d.actGlobalDiv.length > 0) {
        body.innerHTML += `<div style="font-size:1rem;color:#8c95a6;margin-top:6px;font-style:italic">Activos globalmente diversificados: ${d.actGlobalDiv.map(a=>a.description||a.subtype||'Activo').join(', ')}</div>`;
    }
    const alertEl = document.getElementById('db-alert-sector');
    if (alertEl) alertEl.style.display = 'none';
}

// ── Resumen de concentraciones ────────────────────────────────────────
function renderResumenConcentraciones(d) {
    const body = document.getElementById('db-resumen-conc-body');
    if (!body) return;

    const alertas = [];
    // Tipo (viene de m.distribucionTipo — usar datos globales del dashboard)
    // País
    if (d.paisConcMax > 70 || d.numPaises === 1)
        alertas.push({ cls:'danger', dim:'Geográfica', msg: d.numPaises===1 ? 'Todo el patrimonio en un solo país' : `${d.paisConcMax.toFixed(1)}% en un solo país` });
    else if (d.paisConcMax > 50)
        alertas.push({ cls:'warn', dim:'Geográfica', msg: `Concentración moderada: ${d.paisConcMax.toFixed(1)}% en un país` });
    // Negocio
    if (d.pctNegocioMax > 60)
        alertas.push({ cls:'danger', dim:'Negocio único', msg: `${d.pctNegocioMax.toFixed(1)}% en ${d.nombreNegocioMax}` });
    else if (d.pctNegocioMax > 40)
        alertas.push({ cls:'warn', dim:'Negocio único', msg: `Concentración moderada: ${d.pctNegocioMax.toFixed(1)}%` });
    // Ingresos
    if (d.pctDepAct > 90)
        alertas.push({ cls:'danger', dim:'Ingresos activos', msg: 'Dependencia crítica de capacidad laboral' });
    else if (d.pctDepAct > 70)
        alertas.push({ cls:'warn', dim:'Ingresos activos', msg: `${d.pctDepAct.toFixed(1)}% del ingreso es activo` });
    // Sectorial
    if (d.actConSec.length > 0 && (d.numSectores === 1 || d.secConcMax > 60))
        alertas.push({ cls:'danger', dim:'Sectorial', msg: `${d.secConcMax.toFixed(1)}% en ${d.nombreSecMax}` });
    else if (d.actConSec.length > 0 && d.secConcMax > 40)
        alertas.push({ cls:'warn', dim:'Sectorial', msg: `Concentración moderada: ${d.secConcMax.toFixed(1)}% en ${d.nombreSecMax}` });
    else if (d.actConSec.length === 0 && d.actGlobalDiv.length === 0)
        alertas.push({ cls:'warn', dim:'Sectorial', msg: 'Sector no asignado en activos de inversión' });

    setCardSemaphore('db-bloque-resumen-conc', alertas.some(a=>a.cls==='danger') ? 'card-danger'
        : alertas.some(a=>a.cls==='warn') ? 'card-warning' : 'card-success');

    if (alertas.length === 0) {
        body.innerHTML = '<div style="color:#0d7a4f;font-weight:600">✅ Patrimonio bien diversificado en todas las dimensiones</div>';
    } else {
        body.innerHTML = alertas.map(a =>
            `<div class="db-resumen-item">`
            + `<span class="db-resumen-dim">${a.cls==='danger'?'🔴':'⚠️'} ${a.dim}</span>`
            + `<span class="db-resumen-msg">${a.msg}</span>`
            + `</div>`
        ).join('');
    }
}