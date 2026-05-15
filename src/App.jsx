import React, { useState, useEffect, useRef, useMemo } from 'react';
import Header from './components/Header';
import CorrectionModal from './components/CorrectionModal';
import { UploadCloud, FileUp, Database, MapPin, AlertTriangle, Hash, Play, CheckCircle, XCircle, Download, List, Eye } from 'lucide-react';
import Papa from 'papaparse';
import { point, booleanPointInPolygon, buffer } from '@turf/turf';

const normalizeText = (text) => {
  if (!text) return "";
  return String(text)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u0302\u0304-\u036f]/g, "") // Remove all combining marks except tilde (Ñ)
    .normalize("NFC")
    .trim();
};

function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [geoJsonData, setGeoJsonData] = useState(null);
  const [colonyCatalog, setColonyCatalog] = useState([]);
  const [contractMap, setContractMap] = useState({});
  const [showErrors, setShowErrors] = useState(false);
  
  const [kpis, setKpis] = useState({
    total: 0,
    fueraPoligono: 0,
    errorPosicionamiento: 0,
    foliosInvalidos: 0
  });

  const [results, setResults] = useState(null); // original data
  const [allRecords, setAllRecords] = useState([]);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [headers, setHeaders] = useState([]);
  
  const inputRef = useRef(null);

  // Derived state for errors
  const errorRecords = useMemo(() => {
    return allRecords.filter(r => r._error);
  }, [allRecords]);

  useEffect(() => {
    console.log("🚀 PROJECT GATE App Mounted");
    console.log("📦 Dependencies check:", { 
      turfAvailable: !!point && !!booleanPointInPolygon,
      PapaAvailable: !!Papa
    });
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    fetch('/zones.geojson')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
        return res.json();
      })
      .then(data => {
        console.log("✅ GeoJSON loaded successfully", { features: data.features.length });
        setGeoJsonData(data);
      })
      .catch(err => console.error("❌ Error loading geojson", err));

    fetch('/Catalogo_Colonias.csv')
      .then(res => res.text())
      .then(csvText => {
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const normalized = results.data.map(item => ({
              delegacion: normalizeText(item.delegacion),
              colonia: normalizeText(item.colonia)
            }));
            setColonyCatalog(normalized);
          }
        });
      })
      .catch(err => console.error("Error loading colony catalog", err));

    // Cargar mapeo Contrato → Delegación desde contracts.csv
    fetch('/contracts.csv')
      .then(res => res.text())
      .then(csvText => {
        Papa.parse(csvText, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const map = {};
            results.data.forEach(item => {
              // "Contrato 47" -> "47"
              const num = String(item['No. Contrato'] || '').replace(/\D/g, '').padStart(2, '0');
              const delegacion = normalizeText(item['Delegacion'] || '');
              if (num && delegacion) {
                map[num] = delegacion;
              }
            });
            console.log("✅ Contract map loaded:", map);
            setContractMap(map);
          }
        });
      })
      .catch(err => console.error("Error loading contracts", err));
  }, []);

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);

  // Drag and drop handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleFile = (selectedFile) => {
    if (selectedFile.type !== "text/csv" && !selectedFile.name.endsWith('.csv')) {
      alert("Por favor, sube solo archivos .CSV");
      return;
    }
    setFile(selectedFile);
    setResults(null);
    setShowErrors(false);
    setKpis({ total: 0, fueraPoligono: 0, errorPosicionamiento: 0, foliosInvalidos: 0 });
  };

  const exportToCSV = (data = allRecords, filename = "REPORTE_FINAL_GATE.csv") => {
    if (!data || data.length === 0) return;
    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const validateRecord = (row, geoData) => {
    let isRed = false;
    let errors = [];
    let updatedRow = { ...row };

    // ═══════════════════════════════════════════════════════════════
    // 0. Normalización de Texto (Mayúsculas, sin acentos, preserva Ñ)
    // ═══════════════════════════════════════════════════════════════
    updatedRow['delegacion'] = normalizeText(updatedRow['delegacion']);
    updatedRow['colonia'] = normalizeText(updatedRow['colonia']);
    updatedRow['calle'] = normalizeText(updatedRow['calle']);
    if (updatedRow['Entre Calle 1']) updatedRow['Entre Calle 1'] = normalizeText(updatedRow['Entre Calle 1']);
    if (updatedRow['Calle 2']) updatedRow['Calle 2'] = normalizeText(updatedRow['Calle 2']);

    // ═══════════════════════════════════════════════════════════════
    // 1. Formato de Folio Estricto: CCFFFF (Decreto 1)
    //    CC = Contrato (2 dígitos), FFFF = Secuencial (4 dígitos)
    //    Ej: Contrato 07, Folio 0178 => "070178"
    //    Caso erróneo: "700178" => se detecta prefijo incorrecto,
    //    se extrae el secuencial y se reconstruye.
    // ═══════════════════════════════════════════════════════════════
    if (updatedRow['folio'] && updatedRow['No. Contrato']) {
      let folioStr = String(updatedRow['folio']).trim();
      const contrato = String(updatedRow['No. Contrato']).trim().padStart(2, '0');

      // Extraer solo dígitos del folio
      const digitsOnly = folioStr.replace(/\D/g, '');

      if (digitsOnly.length >= 4) {
        // Verificar si el prefijo ya es correcto
        if (!digitsOnly.startsWith(contrato)) {
          // El prefijo no coincide con el contrato.
          // Extraer los últimos 4 dígitos como secuencial y reconstruir.
          const secuencial = digitsOnly.slice(-4);
          updatedRow['folio'] = contrato + secuencial;
        } else if (digitsOnly.length < 6) {
          // Prefijo correcto pero falta padding
          updatedRow['folio'] = digitsOnly.padStart(6, '0');
        } else {
          updatedRow['folio'] = digitsOnly.slice(0, 6);
        }
      } else if (digitsOnly.length > 0) {
        // Menos de 4 dígitos: padear el secuencial y prepend contrato
        updatedRow['folio'] = contrato + digitsOnly.padStart(4, '0');
      }

      // Validación final de longitud
      if (String(updatedRow['folio']).length !== 6) {
        errors.push("Folio debe tener formato CCFFFF (6 dígitos)");
        isRed = true;
      } else if (!String(updatedRow['folio']).startsWith(contrato)) {
        errors.push(`Folio debe iniciar con contrato ${contrato}`);
        isRed = true;
      }
    } else if (!updatedRow['folio']) {
      errors.push("Folio faltante");
      isRed = true;
    }

    // ═══════════════════════════════════════════════════════════════
    // 2. Frontera Temporal (Decreto 2)
    // ═══════════════════════════════════════════════════════════════
    if (updatedRow['fechaRealizado']) {
      let parts = String(updatedRow['fechaRealizado']).split('/');
      if (parts.length === 3) {
        let day = parseInt(parts[0]);
        let month = parseInt(parts[1]) - 1;
        let year = parseInt(parts[2]);
        let date = new Date(year, month, day);
        let minDate = new Date(2026, 2, 25); // 25 de Marzo 2026
        if (date < minDate) {
          errors.push("Fecha inválida (Previa al 25/03/2026)");
          isRed = true;
        }
      } else {
        errors.push("Formato de fecha inválido (DD/MM/AAAA)");
        isRed = true;
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // 3. Purificación de Vías (Decreto 3)
    // ═══════════════════════════════════════════════════════════════
    ['calle', 'Entre Calle 1', 'Calle 2'].forEach(c => {
      if (updatedRow[c]) {
        updatedRow[c] = normalizeText(updatedRow[c])
          .replace(/^(CALLE|AVE|AVENIDA|AV\.)\s+/ig, '');
      }
    });

    // ═══════════════════════════════════════════════════════════════
    // 4. Corrección GPS Inteligente (Decreto 4 - ANTES de spatial)
    //    Maneja múltiples formatos corruptos:
    //    - "19.285044, -99,652069" => comma en lon => "19.285044, -99.652069"
    //    - "19, 274763, -99649536" => lat fragmentada
    //    - "19274763, -99649536"   => falta punto
    // ═══════════════════════════════════════════════════════════════
    if (updatedRow['GEOLOCALIZACION']) {
      let gps = String(updatedRow['GEOLOCALIZACION']).trim();
      
      if (gps.includes(",")) {
        let parts = gps.split(",").map(p => p.trim());
        let finalLat = "";
        let finalLon = "";

        if (parts.length === 3) {
          // CASO A: 3 partes => decidir si es "lat, latDec, lon" o "lat, lonInt, lonDec"
          if (parts[0].includes(".")) {
            // La latitud ya tiene punto decimal (ej: "19.285044, -99, 652069")
            // => lat está completa, las partes 1+2 forman la longitud
            finalLat = parts[0];
            finalLon = `${parts[1]}.${parts[2]}`;
          } else {
            // La latitud NO tiene punto (ej: "19, 274763, -99649536")
            // => partes 0+1 forman la latitud, parte 2 es la longitud
            finalLat = `${parts[0]}.${parts[1]}`;
            finalLon = parts[2];
          }
          
          // Asegurar punto decimal en longitud si empieza con -99 sin punto
          if (finalLon.startsWith("-99") && !finalLon.includes(".")) {
            finalLon = finalLon.replace("-99", "-99.");
          }
        } 
        else if (parts.length === 2) {
          // CASO B: 2 partes (formato estándar o con puntos faltantes)
          finalLat = parts[0];
          finalLon = parts[1];

          if (finalLat.startsWith("19") && !finalLat.includes(".")) {
            finalLat = finalLat.replace("19", "19.");
          }
          if (finalLon.startsWith("-99") && !finalLon.includes(".")) {
            finalLon = finalLon.replace("-99", "-99.");
          }
        }

        if (finalLat && finalLon) {
          gps = `${finalLat}, ${finalLon}`;
          updatedRow['GEOLOCALIZACION'] = gps;
        }
      }

      // Validación de formato final
      if (gps.includes(",")) {
        let [latStr, lonStr] = gps.split(",").map(s => s.trim());
        let lat = parseFloat(latStr);
        let lon = parseFloat(lonStr);

        if (isNaN(lat) || isNaN(lon) || !latStr.includes(".") || !lonStr.includes(".")) {
          errors.push("GPS: Formato decimal estricto requerido");
          isRed = true;
        } else {
          // ═══════════════════════════════════════════════════════════
          // 5. Asignación Espacial Automática (Decreto 5)
          //    Siempre buscar en qué polígono cae el punto.
          //    Si cae dentro de un feature => asignar NOMUT como colonia
          //    y NOMDEL como delegación. Esto SOBREESCRIBE la colonia
          //    del CSV con el dato oficial del GeoJSON.
          // ═══════════════════════════════════════════════════════════
          if (geoData) {
            let isInside = false;
            try {
              const pt = point([lon, lat]);
              const contratoNum = String(updatedRow['No. Contrato']).trim().padStart(2, '0');

              // Obtener nombre de delegación oficial desde el mapeo de contratos
              const expectedDelegacion = contractMap[contratoNum] || '';

              // PASO 1: Buscar polígonos de la DELEGACIÓN del contrato (por NOMDEL, NO por NODEL)
              const contractFeatures = expectedDelegacion
                ? geoData.features.filter(f => {
                    const nomdel = normalizeText(f.properties?.NOMDEL || '');
                    return nomdel === expectedDelegacion;
                  })
                : [];

              console.log(`📍 Contrato ${contratoNum} → Delegación esperada: ${expectedDelegacion}, polígonos encontrados: ${contractFeatures.length}`);

              // 1a. Verificar si cae exactamente dentro de un polígono de la delegación
              let matchedFeature = contractFeatures.find(f => {
                try { return booleanPointInPolygon(pt, f); } catch { return false; }
              });

              // 1b. Si no cae exacto, aplicar tolerancia de 100m a la delegación
              if (!matchedFeature && contractFeatures.length > 0) {
                matchedFeature = contractFeatures.find(f => {
                  try {
                    const buffered = buffer(f, 0.1, { units: 'kilometers' });
                    return booleanPointInPolygon(pt, buffered);
                  } catch { return false; }
                });
              }

              if (matchedFeature) {
                isInside = true;
                const nomut = matchedFeature.properties?.NOMUT;
                const nomdel = matchedFeature.properties?.NOMDEL;
                if (nomut && nomut !== "nan") {
                  updatedRow['colonia'] = normalizeText(nomut);
                }
                if (nomdel) {
                  updatedRow['delegacion'] = normalizeText(nomdel);
                }
              } else {
                // PASO 2: Fallback — buscar en CUALQUIER polígono
                const anyFeature = geoData.features.find(f => {
                  try { return booleanPointInPolygon(pt, f); } catch { return false; }
                });

                if (anyFeature) {
                  isInside = true;
                  const nomut = anyFeature.properties?.NOMUT;
                  const nomdel = anyFeature.properties?.NOMDEL;
                  const featureNodel = String(anyFeature.properties?.NODEL || '').padStart(2, '0');
                  if (nomut && nomut !== "nan") updatedRow['colonia'] = normalizeText(nomut);
                  if (nomdel) updatedRow['delegacion'] = normalizeText(nomdel);

                  // Reportar que cayó en otra delegación
                  errors.push(`GPS: Punto cae en delegación ${normalizeText(nomdel)}, no en ${expectedDelegacion || 'contrato ' + contratoNum}`);
                  isRed = true;
                }
              }
            } catch (e) {
              console.error("Spatial check error:", e);
            }
            if (!isInside) {
              errors.push("GPS: Fuera de jurisdicción autorizada");
              isRed = true;
            }
          }
        }
      } else {
        errors.push("GPS: Error de sintaxis (falta separador)");
        isRed = true;
      }
    } else {
      errors.push("GPS: No registrado");
      isRed = true;
    }

    // ═══════════════════════════════════════════════════════════════
    // 6. Validación contra Catálogo de Colonias (Decreto 6)
    // ═══════════════════════════════════════════════════════════════
    if (updatedRow['colonia'] && updatedRow['colonia'] !== "PENDIENTE_RECUPERACION") {
      const colonyExists = colonyCatalog.some(c => 
        c.delegacion === updatedRow['delegacion'] && 
        c.colonia === updatedRow['colonia']
      );
      if (!colonyExists) {
        errors.push("Colonia no encontrada en catálogo oficial para esta delegación");
        isRed = true;
      }
    } else if (!updatedRow['colonia'] || updatedRow['colonia'] === "PENDIENTE_RECUPERACION") {
      errors.push("Colonia pendiente de recuperación");
      isRed = true;
    }

    // 7. Estandarización Numérica (Decreto 7)
    ['profundidad', 'largo', 'ancho', 'm2total'].forEach(f => {
      if (updatedRow[f]) {
        updatedRow[f] = String(updatedRow[f]).replace(/,/g, '.').trim();
      }
    });

    // 8. Caza de Fantasmas (Decreto 8)
    const criticalFields = ['folio', 'fechaRealizado', 'GEOLOCALIZACION', 'calle'];
    const hasData = criticalFields.some(f => updatedRow[f] && String(updatedRow[f]).trim() !== '');
    if (!hasData) {
      return { ...updatedRow, _error: "Caza de Fantasmas: Registro Fantasma Detectado" };
    }

    if (isRed) {
      updatedRow._error = errors.join(" • ");
    } else {
      delete updatedRow._error;
    }

    return updatedRow;
  };

  const processData = () => {
    if (!file) return;
    setProcessing(true);

    Papa.parse(file, {
      skipEmptyLines: false,
      complete: (parseResult) => {
        const data = parseResult.data;
        let headerIdx = -1;
        for (let i = 0; i < Math.min(10, data.length); i++) {
          const rowStr = data[i].join("").toLowerCase();
          if (rowStr.includes("folio") && rowStr.includes("calle")) {
            headerIdx = i;
            break;
          }
        }

        if (headerIdx === -1) {
          alert("Estructura no reconocida.");
          setProcessing(false);
          return;
        }

        const fileHeaders = data[headerIdx];
        setHeaders(fileHeaders);
        const rows = data.slice(headerIdx + 1);
        
        const processed = rows.map((rowArr, idx) => {
          let row = { id: idx };
          fileHeaders.forEach((h, i) => {
            if (h) row[h.trim()] = rowArr[i];
          });
          
          const rowStr = rowArr.join("").trim();
          if (rowStr === "" || rowArr[0] === "SEXTA SEMANA NO SE TRABAJO") return null;

          return validateRecord(row, geoJsonData);
        }).filter(r => r !== null);

        setAllRecords(processed);
        setResults(true);
        setProcessing(false);
      }
    });
  };

  const handleSaveRecord = (updatedRecord) => {
    const reevaluated = validateRecord(updatedRecord, geoJsonData);
    setAllRecords(prev => prev.map(r => r.id === reevaluated.id ? reevaluated : r));
    setIsModalOpen(false);
    setSelectedRecord(null);
  };

  // Centralized KPI update
  useEffect(() => {
    if (allRecords.length === 0) return;
    const stats = {
      total: allRecords.length,
      fueraPoligono: allRecords.filter(r => r._error?.toLowerCase().includes("fuera") || r._error?.toLowerCase().includes("jurisdicción")).length,
      errorPosicionamiento: allRecords.filter(r => r._error?.includes("GPS") || r._error?.includes("sintaxis")).length,
      foliosInvalidos: allRecords.filter(r => r._error?.includes("Folio") || r._error?.includes("Caza")).length
    };
    setKpis(stats);
  }, [allRecords]);

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-50 transition-colors duration-300 font-sans">
      <Header toggleDarkMode={toggleDarkMode} />
      
      <main className="w-full max-w-[1536px] mx-auto px-4 lg:px-8 py-8 h-[calc(100vh-80px)] flex flex-col overflow-hidden">
        
        {/* Page Title Section */}
        <div className="mb-8 animate-fade-in">
          <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">
            Panel de Control de Información
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1 font-medium">
            Estado actual de folios y seguimiento de incidencias administrativas
          </p>
        </div>

        {/* KPIs Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 p-4 flex items-start justify-between">
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Total Procesados</h4>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black">{kpis.total}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Registros</span>
              </div>
            </div>
            <div className="p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-100 dark:border-slate-600">
              <Database className="w-4 h-4 text-slate-400" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border-l-4 border-l-red-500 border border-slate-200 dark:border-slate-700 p-4 flex items-start justify-between">
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Fuera de Polígono</h4>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black">{kpis.fueraPoligono}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Incidencias</span>
              </div>
            </div>
            <div className="p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-100 dark:border-slate-600">
              <MapPin className="w-4 h-4 text-slate-400" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border-l-4 border-l-amber-500 border border-slate-200 dark:border-slate-700 p-4 flex items-start justify-between">
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Error Posicionamiento</h4>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black">{kpis.errorPosicionamiento}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Alertas</span>
              </div>
            </div>
            <div className="p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-100 dark:border-slate-600">
              <AlertTriangle className="w-4 h-4 text-slate-400" />
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border-l-4 border-l-slate-500 border border-slate-200 dark:border-slate-700 p-4 flex items-start justify-between">
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Folios Inválidos</h4>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black">{kpis.foliosInvalidos}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Errores</span>
              </div>
            </div>
            <div className="p-2 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-100 dark:border-slate-600">
              <Hash className="w-4 h-4 text-slate-400" />
            </div>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.5fr] gap-8 flex-grow min-h-0 pb-4">
          
          {/* Upload Section */}
          <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-md rounded-3xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] border border-white/20 dark:border-slate-700/50 p-8 flex flex-col relative overflow-hidden group">
            {/* Decorative background element */}
            <div className="absolute -top-24 -right-24 w-48 h-48 bg-primary/5 rounded-full blur-3xl group-hover:bg-primary/10 transition-colors duration-700" />
            
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2.5 bg-slate-100 dark:bg-slate-700 rounded-xl">
                <UploadCloud className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h3 className="font-black text-sm text-slate-800 dark:text-slate-100 uppercase tracking-widest">Puerta de Entrada</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Ingesta de Datos CSV</p>
              </div>
            </div>

            <form 
              className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-colors flex-grow
                ${dragActive ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => inputRef.current.click()}
            >
              <input 
                ref={inputRef}
                type="file" 
                accept=".csv" 
                className="hidden" 
                onChange={handleChange}
              />
              
              {file ? (
                <div className="flex flex-col items-center">
                  <CheckCircle className="w-10 h-10 text-emerald-500 mb-3" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 mb-1">
                    Archivo Listo
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {file.name}
                  </span>
                </div>
              ) : (
                <>
                  <FileUp className={`w-10 h-10 mb-4 transition-colors ${dragActive ? 'text-primary' : 'text-slate-400 dark:text-slate-500'}`} />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                    Arrastra aquí tu archivo
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    o haz clic para explorar (.CSV)
                  </span>
                </>
              )}
            </form>

            <button 
              onClick={processData}
              disabled={!file || processing}
              className={`w-full mt-6 py-3 rounded-lg font-bold uppercase tracking-wider text-[10px] transition-all flex justify-center items-center gap-2 shadow-sm
                ${(!file || processing) 
                  ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed border border-transparent' 
                  : 'bg-primary text-white hover:bg-opacity-90 border border-transparent'}`}
            >
              {processing ? (
                 <span className="animate-pulse">Procesando...</span>
              ) : (
                <>
                  <Play className="w-3 h-3" />
                  <span>Procesar Información</span>
                </>
              )}
            </button>
            
            {/* Result Banner if done */}
            {results && (
               <div className="mt-4 flex flex-col gap-4">
                 <div className={`p-4 rounded-xl border flex flex-col gap-3 transition-all ${errorRecords.length === 0 ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800' : 'bg-slate-50 dark:bg-slate-700/50 border-slate-200 dark:border-slate-600'}`}>
                    <div className="flex justify-between items-center text-xs">
                       <span className="font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-[10px]">Estado de Validación:</span>
                       {errorRecords.length === 0 ? (
                         <span className="flex items-center gap-1 font-black text-emerald-600 dark:text-emerald-400">
                           <CheckCircle className="w-4 h-4" /> LISTO PARA EXPORTAR
                         </span>
                       ) : (
                         <span className="flex items-center gap-1 font-black text-amber-600 dark:text-amber-400">
                           <AlertTriangle className="w-4 h-4" /> {errorRecords.length} ERRORES PENDIENTES
                         </span>
                       )}
                    </div>
                    
                    <button 
                      onClick={() => exportToCSV(allRecords, "REPORTE_FINAL_GATE.csv")}
                      disabled={errorRecords.length > 0}
                      className={`w-full py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-sm
                        ${errorRecords.length === 0 
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20' 
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed'}`}
                    >
                      <Download className="w-3 h-3" /> Exportar Archivo Final
                    </button>
                    
                    {errorRecords.length > 0 && (
                      <p className="text-[9px] text-center text-slate-400 dark:text-slate-500 italic">
                        * Debes corregir todos los errores para habilitar la exportación.
                      </p>
                    )}
                 </div>
               </div>
            )}
          </div>

          {/* Results Section */}
          <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-md rounded-3xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.1)] border border-white/20 dark:border-slate-700/50 p-8 flex flex-col min-h-[500px]">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-slate-100 dark:bg-slate-700 rounded-xl">
                  <List className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-800 dark:text-slate-100 uppercase tracking-widest">Núcleo de Errores</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Corrección y Auditoría</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                {allRecords.length > 0 && (
                  <button
                    onClick={() => exportToCSV()}
                    disabled={kpis.fueraPoligono > 0 || kpis.errorPosicionamiento > 0 || kpis.foliosInvalidos > 0}
                    className={`px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg
                      ${(kpis.fueraPoligono > 0 || kpis.errorPosicionamiento > 0 || kpis.foliosInvalidos > 0)
                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-200 dark:border-slate-700 shadow-none'
                        : 'bg-primary text-white hover:shadow-primary/20 hover:-translate-y-0.5 active:translate-y-0 shadow-primary/20'
                      }`}
                  >
                    <Download className="w-4 h-4" /> Exportar Depurado
                  </button>
                )}
              </div>
            </div>
            
            {!results ? (
              <>
                <h3 className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400 mb-4">
                  Reglas de Validación Activas (Los 7 Decretos)
                </h3>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700">
                        <th className="py-3 px-2 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Regla</th>
                        <th className="py-3 px-2 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Descripción</th>
                        <th className="py-3 px-2 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Acción del Motor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {[
                        { n: "1. Formato de Folio", d: "6 dígitos obligatorios (ccffff). Fuerza 0 inicial si contrato < 10.", a: "Autocorrección", c: "amber" },
                        { n: "2. Frontera Temporal", d: "Acepta solo fechas desde el 25 de Marzo de 2026.", a: "Rechazo", c: "red" },
                        { n: "3. Purificación de Vías", d: "Eliminación automática de prefijos en vialidades.", a: "Autocorrección", c: "emerald" },
                        { n: "4. Rescate de Ubicación", d: "Autocompletado de Colonia/Delegación vía GPS.", a: "Autocorrección", c: "emerald" },
                        { n: "5. Formato GPS Civilizado", d: "Exige formato decimal estricto para coordenadas.", a: "Rechazo Inmediato", c: "red" },
                        { n: "6. Estandarización Numérica", d: "Conversión de comas a puntos en medidas.", a: "Autocorrección", c: "emerald" },
                        { n: "7. Caza de Fantasmas", d: "Descarte de folios vacíos/nulos.", a: "Alerta Crítica", c: "red" }
                      ].map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/20 transition-colors">
                          <td className="py-3 px-2 font-bold text-xs text-slate-700 dark:text-slate-300">{r.n}</td>
                          <td className="py-3 px-2 text-slate-500 dark:text-slate-400 text-xs">{r.d}</td>
                          <td className="py-3 px-2">
                            <span className={`inline-flex px-2 py-1 bg-${r.c}-100 text-${r.c}-700 dark:bg-${r.c}-900/30 dark:text-${r.c}-400 text-[9px] rounded font-bold uppercase tracking-wider`}>
                              {r.a}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">
                    Registros con Errores Detectados
                  </h3>
                  <span className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px] font-black px-2 py-1 rounded">
                    {errorRecords.length} Incidencias
                  </span>
                </div>
                
                <div className="overflow-auto flex-grow custom-scrollbar">
                  <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-white dark:bg-slate-800 z-10">
                      <tr className="border-b border-slate-200 dark:border-slate-700">
                        <th className="py-3 px-2 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Contrato</th>
                        <th className="py-3 px-2 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Folio</th>
                        <th className="py-3 px-2 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Tipo de Error</th>
                        <th className="py-3 px-2 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                      {errorRecords.length > 0 ? (
                        errorRecords.map((row) => (
                          <tr key={row.id} className="hover:bg-red-50/50 dark:hover:bg-red-900/10 transition-colors">
                            <td className="py-2.5 px-2 text-xs font-medium text-slate-600 dark:text-slate-400">{row['No. Contrato'] || '---'}</td>
                            <td className="py-2.5 px-2 text-xs font-bold text-slate-800 dark:text-slate-200">{row['folio'] || '---'}</td>
                            <td className="py-2.5 px-2 text-[10px] text-red-600 dark:text-red-400 font-medium">{row._error}</td>
                            <td className="py-2.5 px-2 text-center">
                              <button 
                                onClick={() => { setSelectedRecord(row); setIsModalOpen(true); }}
                                className="p-2 bg-slate-100 dark:bg-slate-700 hover:bg-primary hover:text-white dark:hover:bg-primary transition-all rounded-lg group"
                              >
                                <Eye className="w-4 h-4 text-slate-500 group-hover:text-white" />
                              </button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="4" className="py-20 text-center">
                            <div className="flex flex-col items-center gap-3">
                              <div className="p-4 bg-emerald-100 dark:bg-emerald-900/30 rounded-full">
                                <CheckCircle className="w-8 h-8 text-emerald-600" />
                              </div>
                              <p className="text-sm font-bold text-slate-600 dark:text-slate-300">¡Todos los registros están correctos!</p>
                              <p className="text-xs text-slate-400">Ya puedes exportar el archivo final.</p>
                            </div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Correction Modal */}
        <CorrectionModal 
          isOpen={isModalOpen}
          onClose={() => { setIsModalOpen(false); setSelectedRecord(null); }}
          record={selectedRecord}
          geoJsonData={geoJsonData}
          colonyCatalog={colonyCatalog}
          contractMap={contractMap}
          onSave={handleSaveRecord}
        />
      </main>
    </div>
  );
}

export default App;
