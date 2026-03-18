// ===============================================
// MOTOR DE CÁLCULOS - ARQUITECTURA PATRIMONIAL
// ===============================================
// Implementa todas las fórmulas del documento oficial

class CalculadoraPatrimonial {
    constructor() {
        this.tasasCambio = {
            USD: 1,
            COP: 0.00025,
            EUR: 1.09,
            GBP: 1.27,
            MXN: 0.059,
            BRL: 0.20,
            ARS: 0.0011,
            CLP: 0.0011,
            PEN: 0.27
        };
        
        this.monedaBase = 'USD'; // Moneda base para todos los cálculos
    }
    
    // ============================================
    // 1. PREPARACIÓN Y CONVERSIÓN
    // ============================================
    
    convertirAMonedaBase(valor, monedaOrigen) {
        if (monedaOrigen === this.monedaBase) return valor;
        return valor * (this.tasasCambio[monedaOrigen] || 1);
    }
    
    calcularPatrimonioNeto(activos) {
        let totalActivos = 0;
        let totalPasivos = 0;
        
        activos.forEach(activo => {
            const valorBase = this.convertirAMonedaBase(activo.value, activo.currency);
            
            if (activo.category === 'Pasivos') {
                totalPasivos += valorBase;
            } else {
                totalActivos += valorBase;
            }
        });
        
        return {
            totalActivos,
            totalPasivos,
            patrimonioNeto: totalActivos - totalPasivos
        };
    }
    
    // ============================================
    // 2. ANÁLISIS DE CONCENTRACIÓN
    // ============================================
    
    calcularConcentracionPorTipo(activos) {
        const patrimonio = this.calcularPatrimonioNeto(activos);
        const total = patrimonio.patrimonioNeto;
        
        if (total === 0) return [];
        
        const distribucion = {};
        
        activos.forEach(activo => {
            if (activo.category === 'Pasivos') return;
            
            const valorBase = this.convertirAMonedaBase(activo.value, activo.currency);
            
            if (!distribucion[activo.category]) {
                distribucion[activo.category] = 0;
            }
            distribucion[activo.category] += valorBase;
        });
        
        const resultado = Object.entries(distribucion).map(([tipo, valor]) => ({
            tipo,
            valor,
            porcentaje: (valor / total) * 100,
            nivel: this.evaluarNivelRiesgo((valor / total) * 100, 'tipo')
        }));
        
        return resultado.sort((a, b) => b.porcentaje - a.porcentaje);
    }
    
    calcularConcentracionPorMoneda(activos) {
        const distribucion = {};
        let totalValor = 0;
        
        activos.forEach(activo => {
            if (activo.category === 'Pasivos') return;
            
            const moneda = activo.currency || 'USD';
            const valor = activo.value;
            
            if (!distribucion[moneda]) {
                distribucion[moneda] = 0;
            }
            distribucion[moneda] += valor;
            totalValor += valor;
        });
        
        if (totalValor === 0) return [];
        
        const resultado = Object.entries(distribucion).map(([moneda, valor]) => ({
            moneda,
            valor,
            porcentaje: (valor / totalValor) * 100,
            nivel: this.evaluarNivelRiesgo((valor / totalValor) * 100, 'moneda')
        }));
        
        return resultado.sort((a, b) => b.porcentaje - a.porcentaje);
    }
    
    calcularConcentracionGeografica(activos) {
        const distribucion = {};
        const patrimonio = this.calcularPatrimonioNeto(activos);
        const total = patrimonio.patrimonioNeto;
        
        if (total === 0) return [];
        
        activos.forEach(activo => {
            if (activo.category === 'Pasivos') return;
            
            const ubicacion = activo.location || 'No especificado';
            const valorBase = this.convertirAMonedaBase(activo.value, activo.currency);
            
            if (!distribucion[ubicacion]) {
                distribucion[ubicacion] = 0;
            }
            distribucion[ubicacion] += valorBase;
        });
        
        const resultado = Object.entries(distribucion).map(([ubicacion, valor]) => ({
            ubicacion,
            valor,
            porcentaje: (valor / total) * 100,
            nivel: this.evaluarNivelRiesgo((valor / total) * 100, 'geografia')
        }));
        
        return resultado.sort((a, b) => b.porcentaje - a.porcentaje);
    }
    
    // ============================================
    // 3. EXPOSICIÓN LEGAL Y FISCAL
    // ============================================
    
    calcularProteccionEstructural(activos) {
        const patrimonio = this.calcularPatrimonioNeto(activos);
        const total = patrimonio.patrimonioNeto;
        
        if (total === 0) return { protegido: 0, enRiesgo: 100, nivel: 'CRÍTICO' };
        
        const estructurasProtegidas = [
            'Fideicomiso', 'Trust', 'Holding', 'LLC', 
            'Foundation', 'Fundación', 'Sociedad'
        ];
        
        let valorProtegido = 0;
        let valorDirecto = 0;
        
        activos.forEach(activo => {
            if (activo.category === 'Pasivos') return;
            
            const valorBase = this.convertirAMonedaBase(activo.value, activo.currency);
            const estructura = activo.legalStructure || 'Propiedad Directa';
            
            const estaProtegido = estructurasProtegidas.some(e => 
                estructura.toLowerCase().includes(e.toLowerCase())
            );
            
            if (estaProtegido) {
                valorProtegido += valorBase;
            } else {
                valorDirecto += valorBase;
            }
        });
        
        const porcentajeProtegido = (valorProtegido / total) * 100;
        const porcentajeEnRiesgo = (valorDirecto / total) * 100;
        
        let nivel = 'CRÍTICO';
        if (porcentajeProtegido >= 60) nivel = 'ÓPTIMO';
        else if (porcentajeProtegido >= 40) nivel = 'ACEPTABLE';
        else if (porcentajeProtegido >= 20) nivel = 'DEFICIENTE';
        
        return {
            protegido: porcentajeProtegido,
            enRiesgo: porcentajeEnRiesgo,
            valorProtegido,
            valorEnRiesgo: valorDirecto,
            nivel
        };
    }
    
    calcularApalancamiento(activos) {
        const patrimonio = this.calcularPatrimonioNeto(activos);
        
        if (patrimonio.patrimonioNeto === 0) return { ratio: 0, nivel: 'ÓPTIMO' };
        
        const ratio = (patrimonio.totalPasivos / patrimonio.patrimonioNeto) * 100;
        
        let nivel = 'ÓPTIMO';
        if (ratio >= 50) nivel = 'CRÍTICO';
        else if (ratio >= 30) nivel = 'MODERADO';
        
        return {
            ratio,
            totalPasivos: patrimonio.totalPasivos,
            nivel
        };
    }
    
    // ============================================
    // 4. EVALUACIÓN DE LAS 4 CAPAS
    // ============================================
    
    evaluarCapaProteccion(datosCliente, activos) {
        let puntos = 0;
        
        // Seguro de vida (3 pts)
        if (datosCliente.seguroVida) {
            const coberturaMinima = datosCliente.gastosAnuales * 10;
            if (datosCliente.seguroVidaMonto >= coberturaMinima) {
                puntos += 3;
            } else if (datosCliente.seguroVidaMonto >= coberturaMinima * 0.5) {
                puntos += 1.5;
            }
        }
        
        // Seguro de incapacidad (2 pts)
        if (datosCliente.seguroIncapacidad) puntos += 2;
        
        // Testamento (2 pts)
        if (datosCliente.testamento === 'vigente') {
            puntos += 2;
        } else if (datosCliente.testamento === 'desactualizado') {
            puntos += 1;
        }
        
        // Estructuras de protección (2 pts)
        const proteccion = this.calcularProteccionEstructural(activos);
        if (proteccion.protegido >= 60) {
            puntos += 2;
        } else if (proteccion.protegido >= 30) {
            puntos += 1;
        }
        
        // Acuerdo prematrimonial (1 pt)
        if (datosCliente.acuerdoPrematrimonial) puntos += 1;
        
        return {
            puntos: Math.round(puntos * 10) / 10,
            nivel: this.getNivelCapa(puntos)
        };
    }
    
    evaluarCapaLiquidez(activos, gastosMensuales) {
        let puntos = 0;
        
        // Calcular activos líquidos
        const liquidosAlta = activos
            .filter(a => a.category !== 'Pasivos' && a.liquidity === 'Alta')
            .reduce((sum, a) => sum + this.convertirAMonedaBase(a.value, a.currency), 0);
        
        const mesesCobertura = liquidosAlta / gastosMensuales;
        
        // Fondo de emergencia (3 pts)
        if (mesesCobertura >= 6) {
            puntos += 3;
        } else if (mesesCobertura >= 3) {
            puntos += 2;
        }
        
        // Activos semi-líquidos (2 pts)
        const semiLiquidos = activos
            .filter(a => a.category !== 'Pasivos' && a.liquidity === 'Media')
            .reduce((sum, a) => sum + this.convertirAMonedaBase(a.value, a.currency), 0);
        
        if (semiLiquidos >= gastosMensuales * 3) {
            puntos += 2;
        } else if (semiLiquidos >= gastosMensuales) {
            puntos += 1;
        }
        
        // Línea de crédito (2 pts) - Asumimos que no la hay por defecto
        // Activos diversificados (2 pts)
        const patrimonio = this.calcularPatrimonioNeto(activos);
        const porcentajeLiquidez = (liquidosAlta / patrimonio.patrimonioNeto) * 100;
        
        if (porcentajeLiquidez >= 10 && porcentajeLiquidez <= 20) {
            puntos += 1;
        } else if (porcentajeLiquidez >= 5 && porcentajeLiquidez <= 30) {
            puntos += 0.5;
        }
        
        return {
            puntos: Math.round(puntos * 10) / 10,
            mesesCobertura: Math.round(mesesCobertura * 10) / 10,
            nivel: this.getNivelCapa(puntos)
        };
    }
    
    evaluarCapaCrecimiento(activos, datosCliente) {
        let puntos = 0;
        
        // Portafolio de inversión (3 pts)
        const tieneInversiones = activos.some(a => 
            a.category === 'Activos Financieros' && a.value > 0
        );
        
        if (tieneInversiones) {
            const concentracion = this.calcularConcentracionPorTipo(activos);
            const financieros = concentracion.find(c => c.tipo === 'Activos Financieros');
            
            if (financieros && financieros.porcentaje >= 20 && financieros.porcentaje <= 40) {
                puntos += 3;
            } else if (financieros) {
                puntos += 1.5;
            }
        }
        
        // Mercados de capitales (2 pts)
        const tieneETFs = activos.some(a => 
            a.description && (
                a.description.toLowerCase().includes('etf') ||
                a.description.toLowerCase().includes('fondo') ||
                a.description.toLowerCase().includes('acciones')
            )
        );
        if (tieneETFs) puntos += 2;
        
        // Inmuebles productivos (2 pts)
        const inmuebles = activos.filter(a => 
            a.category === 'Activos Reales' && 
            a.description && a.description.toLowerCase().includes('renta')
        );
        
        if (inmuebles.length >= 2) {
            puntos += 2;
        } else if (inmuebles.length === 1) {
            puntos += 1;
        }
        
        // Negocios escalables (2 pts)
        const negocios = activos.filter(a => a.category === 'Activos Empresariales');
        if (negocios.length > 0) puntos += 1;
        
        // Retorno esperado (1 pt) - Simplificado
        if (datosCliente.retornoEsperado >= 8) {
            puntos += 1;
        } else if (datosCliente.retornoEsperado >= 5) {
            puntos += 0.5;
        }
        
        return {
            puntos: Math.round(puntos * 10) / 10,
            nivel: this.getNivelCapa(puntos)
        };
    }
    
    evaluarCapaDiversificacion(activos, datosCliente) {
        let puntos = 0;
        
        // Diversificación de activos (2 pts)
        const concentracion = this.calcularConcentracionPorTipo(activos);
        if (concentracion.length >= 4) {
            puntos += 2;
        } else if (concentracion.length >= 2) {
            puntos += 1;
        }
        
        // Diversificación de monedas (2 pts)
        const monedas = this.calcularConcentracionPorMoneda(activos);
        if (monedas.length >= 3) {
            puntos += 2;
        } else if (monedas.length >= 2) {
            puntos += 1;
        }
        
        // Diversificación geográfica (2 pts)
        const geografica = this.calcularConcentracionGeografica(activos);
        if (geografica.length >= 3) {
            puntos += 2;
        } else if (geografica.length >= 2) {
            puntos += 1;
        }
        
        // Plan de retiro (2 pts)
        if (datosCliente.planRetiro === 'cuantificado') {
            puntos += 2;
        } else if (datosCliente.planRetiro === 'informal') {
            puntos += 1;
        }
        
        // Planeación sucesoria (2 pts)
        if (datosCliente.planeacionSucesoria === 'documentado') {
            puntos += 2;
        } else if (datosCliente.planeacionSucesoria === 'proceso') {
            puntos += 1;
        }
        
        return {
            puntos: Math.round(puntos * 10) / 10,
            nivel: this.getNivelCapa(puntos)
        };
    }
    
    // ============================================
    // 5. ANÁLISIS COMPLETO
    // ============================================
    
    generarAnalisisCompleto(activos, datosCliente) {
        const patrimonio = this.calcularPatrimonioNeto(activos);
        const concentracionTipo = this.calcularConcentracionPorTipo(activos);
        const concentracionMoneda = this.calcularConcentracionPorMoneda(activos);
        const concentracionGeo = this.calcularConcentracionGeografica(activos);
        const proteccion = this.calcularProteccionEstructural(activos);
        const apalancamiento = this.calcularApalancamiento(activos);
        
        // Evaluar capas
        const capa1 = this.evaluarCapaProteccion(datosCliente, activos);
        const capa2 = this.evaluarCapaLiquidez(activos, datosCliente.gastosMensuales || 0);
        const capa3 = this.evaluarCapaCrecimiento(activos, datosCliente);
        const capa4 = this.evaluarCapaDiversificacion(activos, datosCliente);
        
        const totalPuntos = capa1.puntos + capa2.puntos + capa3.puntos + capa4.puntos;
        const saludPatrimonial = (totalPuntos / 40) * 10;
        
        // Generar alertas
        const alertas = this.generarAlertas(
            patrimonio,
            concentracionTipo,
            concentracionMoneda,
            concentracionGeo,
            proteccion,
            apalancamiento,
            capa1,
            capa2,
            capa3,
            capa4
        );
        
        return {
            patrimonio,
            concentracion: {
                tipo: concentracionTipo,
                moneda: concentracionMoneda,
                geografia: concentracionGeo
            },
            exposicion: {
                proteccion,
                apalancamiento
            },
            capas: {
                proteccion: capa1,
                liquidez: capa2,
                crecimiento: capa3,
                diversificacion: capa4
            },
            saludPatrimonial: {
                puntos: totalPuntos,
                escala: Math.round(saludPatrimonial * 10) / 10,
                nivel: this.getNivelSalud(saludPatrimonial)
            },
            alertas
        };
    }
    
    // ============================================
    // HELPERS
    // ============================================
    
    evaluarNivelRiesgo(porcentaje, tipo) {
        switch(tipo) {
            case 'tipo':
                if (porcentaje > 70) return 'CRÍTICO';
                if (porcentaje > 50) return 'ALTO';
                if (porcentaje > 30) return 'MODERADO';
                return 'BAJO';
            
            case 'moneda':
                if (porcentaje > 80) return 'CRÍTICO';
                if (porcentaje > 60) return 'ALTO';
                if (porcentaje > 40) return 'MODERADO';
                return 'BAJO';
            
            case 'geografia':
                if (porcentaje > 70) return 'CRÍTICO';
                if (porcentaje > 60) return 'ALTO';
                if (porcentaje > 40) return 'MODERADO';
                return 'BAJO';
            
            default:
                return 'BAJO';
        }
    }
    
    getNivelCapa(puntos) {
        if (puntos >= 8) return 'ÓPTIMO';
        if (puntos >= 6) return 'SÓLIDO';
        if (puntos >= 4) return 'DEFICIENTE';
        return 'CRÍTICO';
    }
    
    getNivelSalud(salud) {
        if (salud >= 9.0) return 'EXCELENTE';
        if (salud >= 7.5) return 'MUY BUENO';
        if (salud >= 6.0) return 'ACEPTABLE';
        if (salud >= 4.0) return 'DEFICIENTE';
        return 'CRÍTICO';
    }
    
    generarAlertas(patrimonio, concentracionTipo, concentracionMoneda, 
                   concentracionGeo, proteccion, apalancamiento, 
                   capa1, capa2, capa3, capa4) {
        const alertas = [];
        
        // Alertas de concentración
        concentracionTipo.forEach(c => {
            if (c.porcentaje > 70) {
                alertas.push({
                    nivel: 'CRÍTICO',
                    tipo: 'Concentración de Activos',
                    mensaje: `${c.porcentaje.toFixed(1)}% del patrimonio en ${c.tipo}. Riesgo crítico - diversificar urgente.`,
                    impacto: 'ALTO'
                });
            } else if (c.porcentaje > 50) {
                alertas.push({
                    nivel: 'ALTO',
                    tipo: 'Concentración de Activos',
                    mensaje: `${c.porcentaje.toFixed(1)}% del patrimonio en ${c.tipo}. Considerar diversificación.`,
                    impacto: 'MEDIO'
                });
            }
        });
        
        // Alertas de moneda
        concentracionMoneda.forEach(c => {
            if (c.porcentaje > 80) {
                alertas.push({
                    nivel: 'CRÍTICO',
                    tipo: 'Exposición Cambiaria',
                    mensaje: `${c.porcentaje.toFixed(1)}% en ${c.moneda}. Riesgo de devaluación crítico.`,
                    impacto: 'ALTO'
                });
            }
        });
        
        // Alertas de protección
        if (proteccion.protegido < 40) {
            alertas.push({
                nivel: 'CRÍTICO',
                tipo: 'Protección Legal',
                mensaje: `Solo ${proteccion.protegido.toFixed(1)}% del patrimonio está protegido. ${proteccion.enRiesgo.toFixed(1)}% vulnerable.`,
                impacto: 'ALTO'
            });
        }
        
        // Alertas de liquidez
        if (capa2.mesesCobertura < 3) {
            alertas.push({
                nivel: 'CRÍTICO',
                tipo: 'Liquidez Insuficiente',
                mensaje: `Solo ${capa2.mesesCobertura} meses de gastos cubiertos. Mínimo recomendado: 6 meses.`,
                impacto: 'ALTO'
            });
        }
        
        // Alertas de apalancamiento
        if (apalancamiento.ratio > 50) {
            alertas.push({
                nivel: 'CRÍTICO',
                tipo: 'Sobreapalancamiento',
                mensaje: `Ratio de apalancamiento: ${apalancamiento.ratio.toFixed(1)}%. Reducir deuda urgente.`,
                impacto: 'ALTO'
            });
        }
        
        // Alertas por capa crítica
        if (capa1.puntos < 4) {
            alertas.push({
                nivel: 'CRÍTICO',
                tipo: 'Capa de Protección',
                mensaje: `Puntuación ${capa1.puntos}/10. Implementar seguros y estructuras legales.`,
                impacto: 'ALTO'
            });
        }
        
        if (capa3.puntos < 5) {
            alertas.push({
                nivel: 'ALTO',
                tipo: 'Capa de Crecimiento',
                mensaje: `Puntuación ${capa3.puntos}/10. Patrimonio estancado - implementar inversiones.`,
                impacto: 'MEDIO'
            });
        }
        
        return alertas.sort((a, b) => {
            const orden = { 'CRÍTICO': 3, 'ALTO': 2, 'MEDIO': 1, 'BAJO': 0 };
            return orden[b.nivel] - orden[a.nivel];
        });
    }
}

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.CalculadoraPatrimonial = CalculadoraPatrimonial;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CalculadoraPatrimonial;
}