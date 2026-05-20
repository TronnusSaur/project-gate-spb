import React, { useState, useEffect, useRef, useMemo } from 'react';
import Header from './components/Header';
import CorrectionModal from './components/CorrectionModal';
import ConflictResolverModal from './components/ConflictResolverModal';
import { UploadCloud, FileUp, Database, MapPin, AlertTriangle, Hash, Play, CheckCircle, XCircle, Download, List, Eye, Trash2, Settings, Loader2, Globe, CloudLightning, ExternalLink } from 'lucide-react';
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

const getStandardKeyForHeader = (header) => {
  if (!header) return "";
  const clean = header.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, '').replace(/[^a-z0-9]/g, '');
  
  if (clean.includes('contrato')) return 'No. Contrato';
  if (clean.includes('empresa')) return 'Empresa';
  if (clean.includes('folio')) return 'folio';
  if (clean.includes('fecharealizado') || clean.includes('fecha')) return 'fechaRealizado';
  if (clean.includes('calle') && !clean.includes('entre')) return 'calle';
  if (clean.includes('colonia')) return 'colonia';
  if (clean.includes('delegacion')) return 'delegacion';
  if (clean.includes('geolocalizacion') || clean.includes('gps') || clean.includes('coordenada')) return 'GEOLOCALIZACION';
  if (clean.includes('tipo')) return 'Tipo';
  if (clean.includes('largo')) return 'largo';
  if (clean.includes('ancho')) return 'ancho';
  if (clean.includes('profundidad')) return 'profundidad';
  if (clean.includes('m2total') || clean.includes('metroscuadrados') || clean.includes('area')) return 'm2total';
  if (clean.includes('solicitudatendida')) return 'Solicitud Atendida';
  if (clean.includes('entrecalle1') || clean.includes('calle1')) return 'Entre Calle 1';
  if (clean.includes('calle2')) return 'Calle 2';
  
  return header.trim();
};

function App() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [geoJsonData, setGeoJsonData] = useState(null);
  const [colonyCatalog, setColonyCatalog] = useState([]);
  const [contractMap, setContractMap] = useState({});
  const [dominantContract, setDominantContract] = useState(null);
  const [dominantEmpresa, setDominantEmpresa] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [activeTab, setActiveTab] = useState('errors');
  
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
  
  // Estados de Sincronización con Google Sheets (Base de Datos)
  const [webAppUrl, setWebAppUrl] = useState(() => localStorage.getItem('gate_web_app_url') || '');
  const [showSettings, setShowSettings] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadStep, setUploadStep] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [conflictData, setConflictData] = useState([]);
  const [showConflictResolver, setShowConflictResolver] = useState(false);
  const [uploadSuccessInfo, setUploadSuccessInfo] = useState(null);
  
  const inputRef = useRef(null);

  // Derived state for errors
  const errorRecords = useMemo(() => {
    return allRecords.filter(r => r._error);
  }, [allRecords]);

  const correctRecords = useMemo(() => {
    return allRecords.filter(r => !r._error);
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
    setDominantContract(null);
    setDominantEmpresa('');
    setActiveTab('errors');
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

  const getExportFilename = (isDevMode) => {
    const contrato = dominantContract || 'CONTRATO';
    const empresa = dominantEmpresa || 'EMPRESA';
    const semana = "Semana X";
    if (isDevMode) {
      return `${contrato}_${empresa}_${semana}_Dev Mode.csv`;
    }
    return `${contrato}_${empresa}_${semana}.csv`;
  };

  const exportOriginal = () => {
    if (!allRecords || allRecords.length === 0) return;
    const filename = getExportFilename(false);
    
    // Reconstruct each row using the original headers to preserve their exact case/casing
    const cleanedData = allRecords.map(r => {
      const exportedRow = {};
      headers.forEach(header => {
        const trimmedHeader = header.trim();
        const stdKey = getStandardKeyForHeader(trimmedHeader);
        exportedRow[trimmedHeader] = r[stdKey] !== undefined ? r[stdKey] : '';
      });
      return exportedRow;
    });
    
    exportToCSV(cleanedData, filename);
  };

  const exportDevMode = () => {
    if (!allRecords || allRecords.length === 0) return;
    const devModeData = allRecords.map(r => mapRowToDevMode(r));
    const filename = getExportFilename(true);
    exportToCSV(devModeData, filename);
  };

  const mapRowToDevMode = (r) => {
    if (!r) return {};
    const tipoDocVal = r['Solicitud Atendida'] || '';
    let lat = '', lon = '';
    const geo = r['GEOLOCALIZACION'] || '';
    if (geo && geo.includes(',')) {
      const parts = geo.split(',').map(s => s.trim());
      if (parts.length === 2) {
        lat = parts[0];
        lon = parts[1];
      }
    }
    return {
      ID: r['No. Contrato'] || dominantContract || '',
      EMPRESA: r['Empresa'] || dominantEmpresa || '',
      idEmpresa: '',
      idResponsable: '',
      idDocRef: '',
      tipoDocRef: tipoDocVal,
      folioRef: r['folio'] || '',
      idBacheo: '',
      idDelegacion: '',
      fecha: r['fechaRealizado'] || '',
      estatus: 'T',
      folio: r['folio'] || '',
      latitude: lat,
      longitude: lon,
      GEOLOCALIZACION: geo,
      calle: r['calle'] || '',
      delegacion: r['delegacion'] || '',
      colonia: r['colonia'] || '',
      tipo: r['Tipo'] || '',
      largo: r['largo'] || '',
      ancho: r['ancho'] || '',
      profundidad: r['profundidad'] || '',
      m2total: r['m2total'] || ''
    };
  };

  const handleDatabaseSend = async () => {
    if (!webAppUrl) {
      alert("Por favor, configura la URL de la Web App de Google Apps Script primero.");
      setShowSettings(true);
      return;
    }

    if (errorRecords.length > 0) {
      alert("Debes corregir todos los errores en Cuarentena antes de enviar a la base de datos.");
      return;
    }

    setUploading(true);
    setUploadProgress(15);
    setUploadStep("Inicializando conexión con Google Sheets...");

    try {
      // Obtener lista de folios a enviar
      const folios = allRecords.map(r => String(r.folio).trim());
      
      setUploadProgress(40);
      setUploadStep("Comprobando folios duplicados en la hoja central...");

      const response = await fetch(webAppUrl, {
        method: "POST",
        mode: "cors",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify({
          action: "check_duplicates",
          folios: folios
        })
      });

      if (!response.ok) {
        throw new Error(`Error de servidor: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.status === "error") {
        throw new Error(data.message || "Error al comprobar duplicados en Sheets.");
      }

      if (data.duplicates && data.duplicates.length > 0) {
        setUploadProgress(60);
        setUploadStep("Duplicados encontrados. Esperando resolución de Adrián...");
        
        // Mapear los duplicados con los registros actuales de GATE
        const mappedConflicts = data.duplicates.map(dup => {
          const matchedGate = allRecords.find(r => String(r.folio).trim() === String(dup.folio).trim());
          return {
            folio: dup.folio,
            sheetRow: dup.sheetRow,
            gateRow: matchedGate ? mapRowToDevMode(matchedGate) : {}
          };
        });

        setConflictData(mappedConflicts);
        setShowConflictResolver(true);
        setUploading(false); // Detener el loader de progreso de carga mientras se reconcilia
      } else {
        // No hay duplicados en absoluto, proceder a insertar de forma directa
        setUploadProgress(70);
        setUploadStep("¡Excelente! No hay duplicados. Insertando registros en Sheets...");
        
        const appends = allRecords.map(r => mapRowToDevMode(r));
        await executeWriteRecords(appends, []);
      }
    } catch (error) {
      console.error("❌ Error de comunicación:", error);
      alert(`Error al enviar a la base de datos: ${error.message}\nVerifica que la URL de la Web App sea correcta y que tenga permisos de ejecución ("Anyone").`);
      setUploading(false);
    }
  };

  const executeWriteRecords = async (appends, overwrites) => {
    setUploading(true);
    setUploadProgress(85);
    setUploadStep("Inyectando registros en DEV y actualizando bitácora de UPLOAD TIMESTAMPS...");

    try {
      const response = await fetch(webAppUrl, {
        method: "POST",
        mode: "cors",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify({
          action: "write_records",
          appends: appends,
          overwrites: overwrites
        })
      });

      if (!response.ok) {
        throw new Error(`Error de servidor al escribir: ${response.status}`);
      }

      const data = await response.json();

      if (data.status === "error") {
        throw new Error(data.message || "Error al escribir registros en Sheets.");
      }

      setUploadProgress(100);
      setUploadStep("¡Sincronización completada exitosamente!");
      setUploadSuccessInfo({
        appendsCount: data.appendsCount || 0,
        overwritesCount: data.overwritesCount || 0,
        total: (data.appendsCount || 0) + (data.overwritesCount || 0)
      });
      
      // Limpiar archivo para evitar doble carga accidental
      setFile(null);
      setAllRecords([]);
      setResults(null);
    } catch (error) {
      console.error("❌ Error al escribir:", error);
      alert(`Error al finalizar la escritura: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleResolveConflicts = async (appends, overwrites) => {
    setShowConflictResolver(false);
    // Filtrar los registros que no están en conflicto y agregarlos a los appends
    const conflictFoliosSet = new Set(conflictData.map(c => c.folio));
    const nonConflictAppends = allRecords
      .filter(r => !conflictFoliosSet.has(String(r.folio).trim()))
      .map(r => mapRowToDevMode(r));

    const totalAppends = [...appends, ...nonConflictAppends];
    
    await executeWriteRecords(totalAppends, overwrites);
  };

  const validateRecord = (row, geoData, currentDominant = dominantContract) => {
    let isRed = false;
    let errors = [];
    let updatedRow = { ...row };

    // ═══════════════════════════════════════════════════════════════
    // -0. Autocorrección de Contrato Discrepante (Contrato Dominante)
    // ═══════════════════════════════════════════════════════════════
    if (currentDominant && updatedRow['No. Contrato']) {
      const rowContract = String(updatedRow['No. Contrato']).trim().replace(/\D/g, '');
      if (rowContract && rowContract !== currentDominant) {
        console.log(`🩹 Autocorrigiendo No. Contrato discrepante para folio ${updatedRow['folio'] || 'sin-folio'}: ${rowContract} ➔ ${currentDominant}`);
        updatedRow['No. Contrato'] = currentDominant;
      }
    }

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
        
        // Encontrar contrato dominante
        let detectedDominant = null;
        const contractHeaderIdx = fileHeaders.findIndex(h => h && getStandardKeyForHeader(h) === 'No. Contrato');
        if (contractHeaderIdx !== -1) {
          const counts = {};
          rows.forEach(rowArr => {
            if (!rowArr || rowArr.length <= contractHeaderIdx) return;
            const rawVal = rowArr[contractHeaderIdx];
            if (rawVal) {
              const val = String(rawVal).replace(/\D/g, '').trim();
              if (val) {
                counts[val] = (counts[val] || 0) + 1;
              }
            }
          });
          
          let maxCount = 0;
          Object.entries(counts).forEach(([val, count]) => {
            if (count > maxCount) {
              maxCount = count;
              detectedDominant = val;
            }
          });
        }
        setDominantContract(detectedDominant);
        console.log("🔍 Contrato dominante autodetectado:", detectedDominant);

        // Encontrar empresa dominante
        let detectedEmpresa = "";
        const empresaHeaderIdx = fileHeaders.findIndex(h => h && getStandardKeyForHeader(h) === 'Empresa');
        if (empresaHeaderIdx !== -1) {
          const counts = {};
          rows.forEach(rowArr => {
            if (!rowArr || rowArr.length <= empresaHeaderIdx) return;
            const rawVal = rowArr[empresaHeaderIdx];
            if (rawVal) {
              const val = normalizeText(rawVal);
              if (val) {
                counts[val] = (counts[val] || 0) + 1;
              }
            }
          });
          
          let maxCount = 0;
          Object.entries(counts).forEach(([val, count]) => {
            if (count > maxCount) {
              maxCount = count;
              detectedEmpresa = val;
            }
          });
        }
        setDominantEmpresa(detectedEmpresa);
        console.log("🔍 Empresa dominante autodetectada:", detectedEmpresa);
        
        const processed = rows.map((rowArr, idx) => {
          let row = { id: idx };
          fileHeaders.forEach((h, i) => {
            if (h) {
              const stdKey = getStandardKeyForHeader(h);
              row[stdKey] = rowArr[i];
            }
          });
          
          const rowStr = rowArr.join("").trim();
          if (rowStr === "" || rowArr[0] === "SEXTA SEMANA NO SE TRABAJO") return null;

          return validateRecord(row, geoJsonData, detectedDominant);
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

  const handleDeleteRecord = (id) => {
    if (window.confirm("¿Estás seguro de que deseas eliminar este registro del listado?")) {
      setAllRecords(prev => prev.filter(r => r.id !== id));
    }
  };

  const handlePurgeGhosts = () => {
    const ghostCount = allRecords.filter(r => r._error && r._error.includes("Caza de Fantasmas")).length;
    if (ghostCount === 0) return;
    
    if (window.confirm(`¿Estás seguro de que deseas eliminar los ${ghostCount} folios fantasma detectados?`)) {
      setAllRecords(prev => prev.filter(r => !r._error || !r._error.includes("Caza de Fantasmas")));
    }
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
            
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-slate-100 dark:bg-slate-700 rounded-xl">
                  <UploadCloud className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-800 dark:text-slate-100 uppercase tracking-widest">Puerta de Entrada</h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Ingesta de Datos CSV</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(!showSettings)}
                className={`p-2 rounded-xl transition-all border ${showSettings ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-slate-100 dark:bg-slate-700 border-transparent text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                title="Configuración de Base de Datos"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>

            {/* Panel de Configuración de Google Sheets Premium */}
            {showSettings && (
              <div className="mb-6 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 animate-slide-down">
                <div className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
                  <Globe className="w-3.5 h-3.5 text-primary" />
                  <span>Enlace Google Apps Script Web App</span>
                </div>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-3">
                  Pega la URL obtenida al implementar tu Apps Script para la comunicación con Google Sheets.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={webAppUrl}
                    onChange={(e) => {
                      const url = e.target.value.trim();
                      setWebAppUrl(url);
                      localStorage.setItem('gate_web_app_url', url);
                    }}
                    placeholder="https://script.google.com/macros/s/.../exec"
                    className="flex-grow px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-mono focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  {webAppUrl ? (
                    <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400 rounded-xl border border-emerald-100 dark:border-emerald-900/50 flex items-center justify-center">
                      <CheckCircle className="w-4 h-4" />
                    </div>
                  ) : (
                    <div className="px-3 py-2 bg-amber-50 dark:bg-amber-950/20 text-amber-600 dark:text-amber-400 rounded-xl border border-amber-100 dark:border-amber-900/50 flex items-center justify-center">
                      <AlertTriangle className="w-4 h-4 animate-pulse" />
                    </div>
                  )}
                </div>
              </div>
            )}

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
                    
                    {errorRecords.length === 0 ? (
                      <div className="flex flex-col gap-2">
                        <button 
                          onClick={handleDatabaseSend}
                          className="w-full py-3.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg bg-gradient-to-r from-indigo-600 via-primary to-[#9c1d42] hover:shadow-primary/20 text-white transform hover:-translate-y-0.5 active:translate-y-0"
                        >
                          <Database className="w-3.5 h-3.5" /> Enviar a la Base de Datos
                        </button>
                        
                        <div className="h-[1px] bg-slate-200 dark:bg-slate-700 my-1" />
                        
                        <button 
                          onClick={exportOriginal}
                          className="w-full py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20"
                        >
                          <Download className="w-3 h-3" /> Exportar Original Depurado
                        </button>
                        <button 
                          onClick={exportDevMode}
                          className="w-full py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-sm bg-gradient-to-r from-primary to-[#9c1d42] hover:shadow-primary/20 text-white"
                        >
                          <Download className="w-3 h-3" /> Exportar Plantilla Dev Mode
                        </button>
                      </div>
                    ) : (
                      <>
                        <button 
                          disabled={true}
                          className="w-full py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-sm bg-slate-200 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                        >
                          <Download className="w-3 h-3" /> Exportar Archivo Final
                        </button>
                        <p className="text-[9px] text-center text-slate-400 dark:text-slate-500 italic">
                          * Debes corregir todos los errores para habilitar la exportación.
                        </p>
                      </>
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
              
              <div className="flex items-center gap-2">
                {allRecords.length > 0 && (
                  <>
                    <button
                      onClick={handleDatabaseSend}
                      disabled={errorRecords.length > 0}
                      className={`px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all shadow-lg
                        ${errorRecords.length > 0
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-200 dark:border-slate-700 shadow-none'
                          : 'bg-gradient-to-r from-indigo-600 to-primary text-white hover:shadow-indigo-500/20 hover:-translate-y-0.5 active:translate-y-0'
                        }`}
                    >
                      <Database className="w-4 h-4" /> Enviar a la BD
                    </button>
                    <button
                      onClick={exportOriginal}
                      disabled={errorRecords.length > 0}
                      className={`px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all border
                        ${errorRecords.length > 0
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-200 dark:border-slate-700 shadow-none'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                    >
                      <Download className="w-4 h-4" /> Original
                    </button>
                    <button
                      onClick={exportDevMode}
                      disabled={errorRecords.length > 0}
                      className={`px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest flex items-center gap-2 transition-all border
                        ${errorRecords.length > 0
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-200 dark:border-slate-700 shadow-none'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                    >
                      <Download className="w-4 h-4" /> Dev Mode
                    </button>
                  </>
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
                {/* Tabs de Navegación Premium */}
                <div className="flex border-b border-slate-200 dark:border-slate-700 mb-6 gap-2">
                  <button
                    onClick={() => setActiveTab('errors')}
                    className={`pb-3 px-4 text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 border-b-2
                      ${activeTab === 'errors' 
                        ? 'border-primary text-primary' 
                        : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}
                  >
                    <span>Cuarentena</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black 
                      ${activeTab === 'errors' 
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-400' 
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}
                    >
                      {errorRecords.length}
                    </span>
                  </button>
                  
                  <button
                    onClick={() => setActiveTab('correct')}
                    className={`pb-3 px-4 text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 border-b-2
                      ${activeTab === 'correct' 
                        ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400' 
                        : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}
                  >
                    <span>Aprobados</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black 
                      ${activeTab === 'correct' 
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400' 
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}
                    >
                      {correctRecords.length}
                    </span>
                  </button>
                </div>

                {activeTab === 'errors' ? (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3">
                        <h3 className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">
                          Registros con Errores Detectados
                        </h3>
                        <span className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px] font-black px-2 py-1 rounded">
                          {errorRecords.length} Incidencias
                        </span>
                      </div>

                      {allRecords.some(r => r._error && r._error.includes("Caza de Fantasmas")) && (
                        <button
                          onClick={handlePurgeGhosts}
                          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black text-[9px] uppercase tracking-widest flex items-center gap-2 transition-all shadow-md hover:shadow-red-600/20 hover:-translate-y-0.5 active:translate-y-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Purgar Fantasmas
                        </button>
                      )}
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
                                <td className="py-2.5 px-2">
                                  <div className="flex items-center justify-center gap-2">
                                    <button 
                                      onClick={() => { setSelectedRecord(row); setIsModalOpen(true); }}
                                      className="p-2 bg-slate-100 dark:bg-slate-700 hover:bg-primary hover:text-white dark:hover:bg-primary transition-all rounded-lg group"
                                      title="Ver / Editar"
                                    >
                                      <Eye className="w-4 h-4 text-slate-500 group-hover:text-white" />
                                    </button>
                                    <button 
                                      onClick={() => handleDeleteRecord(row.id)}
                                      className="p-2 bg-slate-100 dark:bg-slate-700 hover:bg-red-500 hover:text-white dark:hover:bg-red-500 transition-all rounded-lg group"
                                      title="Eliminar Registro"
                                    >
                                      <Trash2 className="w-4 h-4 text-slate-500 group-hover:text-white" />
                                    </button>
                                  </div>
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
                ) : (
                  <>
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3">
                        <h3 className="text-[10px] uppercase tracking-wider font-bold text-slate-500 dark:text-slate-400">
                          Registros Aprobados Correctamente
                        </h3>
                        <span className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px] font-black px-2 py-1 rounded">
                          {correctRecords.length} Aprobados
                        </span>
                      </div>
                    </div>
                    
                    <div className="overflow-auto flex-grow custom-scrollbar">
                      <table className="w-full text-left text-sm">
                        <thead className="sticky top-0 bg-white dark:bg-slate-800 z-10">
                          <tr className="border-b border-slate-200 dark:border-slate-700">
                            <th className="py-3 px-2 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Contrato</th>
                            <th className="py-3 px-2 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Folio</th>
                            <th className="py-3 px-2 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Colonia</th>
                            <th className="py-3 px-2 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400">Delegación</th>
                            <th className="py-3 px-2 text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 text-center">Inspeccionar</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
                          {correctRecords.length > 0 ? (
                            correctRecords.map((row) => (
                              <tr key={row.id} className="hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-colors">
                                <td className="py-2.5 px-2 text-xs font-medium text-slate-600 dark:text-slate-400">{row['No. Contrato'] || '---'}</td>
                                <td className="py-2.5 px-2 text-xs font-bold text-slate-800 dark:text-slate-200">{row['folio'] || '---'}</td>
                                <td className="py-2.5 px-2 text-xs text-slate-600 dark:text-slate-400 truncate max-w-[150px]" title={row['colonia']}>{row['colonia'] || '---'}</td>
                                <td className="py-2.5 px-2 text-xs text-slate-600 dark:text-slate-400 truncate max-w-[150px]" title={row['delegacion']}>{row['delegacion'] || '---'}</td>
                                <td className="py-2.5 px-2">
                                  <div className="flex items-center justify-center">
                                    <button 
                                      onClick={() => { setSelectedRecord(row); setIsModalOpen(true); }}
                                      className="p-2 bg-slate-100 dark:bg-slate-700 hover:bg-emerald-600 hover:text-white dark:hover:bg-emerald-600 transition-all rounded-lg group"
                                      title="Ver / Inspeccionar"
                                    >
                                      <Eye className="w-4 h-4 text-slate-500 group-hover:text-white" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          ) : (
                            <tr>
                              <td colSpan="5" className="py-20 text-center">
                                <div className="flex flex-col items-center gap-3">
                                  <p className="text-sm font-bold text-slate-600 dark:text-slate-300">No hay registros aprobados aún.</p>
                                  <p className="text-xs text-slate-400">Corrige incidencias para moverlas a aprobados.</p>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
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

        {/* Conflict Resolver Modal */}
        <ConflictResolverModal
          isOpen={showConflictResolver}
          onClose={() => { setShowConflictResolver(false); setConflictData([]); }}
          conflicts={conflictData}
          dominantContract={dominantContract}
          onResolve={handleResolveConflicts}
        />

        {/* Pantalla de Progreso (Loader de Ingesta Centralizada) */}
        {uploading && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-md animate-fade-in">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 max-w-md w-full shadow-2xl text-center flex flex-col items-center">
              <div className="relative mb-6">
                <div className="w-24 h-24 rounded-full border-4 border-slate-100 dark:border-slate-800 flex items-center justify-center relative">
                  <Loader2 className="w-10 h-10 text-primary animate-spin absolute" />
                  <CloudLightning className="w-5 h-5 text-indigo-500 absolute" />
                </div>
              </div>

              <h3 className="text-sm font-black tracking-widest text-slate-800 dark:text-white uppercase mb-2">Transmitiendo Información</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mb-6 uppercase tracking-wider">{uploadStep}</p>

              <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden mb-2">
                <div 
                  className="bg-gradient-to-r from-indigo-500 via-primary to-[#9c1d42] h-full transition-all duration-300 rounded-full"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                Progreso: {uploadProgress}%
              </span>
            </div>
          </div>
        )}

        {/* Modal de Éxito de Carga */}
        {uploadSuccessInfo && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-md animate-fade-in">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 max-w-lg w-full shadow-2xl text-center relative overflow-hidden flex flex-col items-center">
              <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-emerald-400 via-teal-500 to-indigo-500" />
              
              <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-200/50 dark:border-emerald-900/50 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mb-6">
                <CheckCircle className="w-8 h-8" />
              </div>

              <h3 className="text-lg font-black tracking-tight text-slate-800 dark:text-white uppercase mb-2">¡Sincronización Exitosa!</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mb-6">
                La información depurada ha sido inyectada directamente en el Sheets oficial sin violar reglas de consistencia.
              </p>

              <div className="grid grid-cols-3 gap-3 w-full mb-6">
                <div className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl">
                  <span className="block text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-1">Nuevos (Appends)</span>
                  <span className="text-xl font-black text-slate-700 dark:text-slate-200">{uploadSuccessInfo.appendsCount}</span>
                </div>
                <div className="p-3 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl">
                  <span className="block text-[9px] text-slate-400 uppercase font-bold tracking-wider mb-1">Actualizados</span>
                  <span className="text-xl font-black text-rose-500">{uploadSuccessInfo.overwritesCount}</span>
                </div>
                <div className="p-3 bg-primary/5 dark:bg-primary/10 border border-primary/10 rounded-2xl">
                  <span className="block text-[9px] text-primary/70 dark:text-slate-400 uppercase font-bold tracking-wider mb-1">Total Lote</span>
                  <span className="text-xl font-black text-primary dark:text-slate-200">{uploadSuccessInfo.total}</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 w-full">
                <a
                  href="https://docs.google.com/spreadsheets/d/1u-JWLmWk_3YP1Hu3O407j_XJq7p8Rq-MEihzBQjd-IU/edit?gid=1982805141#gid=1982805141"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-grow py-3 px-4 rounded-xl text-xs font-black uppercase tracking-widest text-white bg-gradient-to-r from-emerald-500 to-teal-600 hover:shadow-lg hover:shadow-emerald-500/20 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2"
                >
                  <span>Abrir Google Sheets</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  onClick={() => setUploadSuccessInfo(null)}
                  className="flex-grow py-3 px-4 rounded-xl text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700/80 transition-colors"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
