import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, GeoJSON, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { centerOfMass, point } from '@turf/turf';
import { X, Save, MapPin, AlertCircle, CheckCircle2, Navigation, AlertTriangle } from 'lucide-react';

const normalizeText = (text) => {
  if (!text) return "";
  return String(text)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u0302\u0304-\u036f]/g, "") // Remove all combining marks except tilde (Ñ)
    .normalize("NFC")
    .trim();
};

// Fix Leaflet icon issue
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

function MapController({ coords }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    if (coords) {
      map.flyTo(coords, map.getZoom());
    }
  }, [coords, map]);
  return null;
}

const CorrectionModal = ({ isOpen, onClose, record, geoJsonData, contractMap, onSave }) => {
  const [editedRecord, setEditedRecord] = useState(null);
  const [currentCoords, setCurrentCoords] = useState(null);
  const [originalCoords, setOriginalCoords] = useState(null);
  const [zonePolygon, setZonePolygon] = useState(null);

  useEffect(() => {
    if (record) {
      console.log("🔍 Modal Opening for Record:", { 
        contract: record['No. Contrato'], 
        folio: record['folio'],
        geoLoaded: !!geoJsonData,
        featuresCount: geoJsonData?.features?.length
      });
      setEditedRecord({ ...record });
      
      let lat, lon;
      if (record['GEOLOCALIZACION'] && record['GEOLOCALIZACION'].includes(',')) {
        const gpsParts = record['GEOLOCALIZACION'].split(',').map(c => c.trim());
        if (gpsParts.length === 2) {
          lat = parseFloat(gpsParts[0]);
          lon = parseFloat(gpsParts[1]);
        }
      }

      const isValidCoords = !isNaN(lat) && !isNaN(lon) && lat !== 0 && lon !== 0;
      const coords = isValidCoords ? [lat, lon] : null;
      
      setOriginalCoords(coords);
      setCurrentCoords(coords);

      // Find zone polygons using contract→delegation name mapping (NOMDEL)
      if (geoJsonData && record['No. Contrato']) {
        const contrato = String(record['No. Contrato']).trim().padStart(2, '0');
        const expectedDelegacion = contractMap?.[contrato] || normalizeText(record['delegacion'] || '');
        
        console.log("🎯 Searching for polygons with NOMDEL:", expectedDelegacion, "(contrato", contrato, ")");

        const matchingFeatures = geoJsonData.features.filter(f => {
          const nomdel = normalizeText(f.properties?.NOMDEL || '');
          return nomdel === expectedDelegacion;
        });
        
        console.log("✅ Matching Polygons found:", matchingFeatures.length);

        if (matchingFeatures.length > 0) {
          setZonePolygon({
            type: "FeatureCollection",
            features: matchingFeatures
          });
          if (!isValidCoords) {
            console.log("📍 No valid coords found, centering on polygon...");
            try {
              const center = centerOfMass(matchingFeatures[0]);
              setCurrentCoords([center.geometry.coordinates[1], center.geometry.coordinates[0]]);
            } catch (e) {
              console.error("Error calculating center:", e);
              setCurrentCoords([19.4326, -99.1332]);
            }
          }
        } else {
          console.warn("⚠️ No matching polygons found for NODEL:", contrato);
          setZonePolygon(null);
        }
      } else {
        console.warn("⚠️ No geoJsonData or No. Contrato available");
        setZonePolygon(null);
      }
    }
  }, [record, geoJsonData]);

  if (!isOpen || !editedRecord) return null;

  const handleMarkerDragEnd = (e) => {
    const marker = e.target;
    const position = marker.getLatLng();
    const newCoords = [position.lat, position.lng];
    setCurrentCoords(newCoords);
    setEditedRecord(prev => ({
      ...prev,
      'GEOLOCALIZACION': `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)}`
    }));
  };

  const handleInputChange = (field, value) => {
    // Normalizar automáticamente ciertos campos
    const fieldsToNormalize = ['delegacion', 'colonia', 'calle'];
    let finalValue = value;
    if (fieldsToNormalize.includes(field.toLowerCase())) {
      finalValue = normalizeText(value);
    }
    
    setEditedRecord(prev => {
      const updated = { ...prev };
      const targetLower = field.toLowerCase();
      Object.keys(updated).forEach(k => {
        if (k.toLowerCase() === targetLower) {
          updated[k] = finalValue;
        }
      });
      return updated;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(editedRecord);
  };

  const fieldsToExclude = [
    'GEOLOCALIZACION', '_error', 'id', 'isRed', 'isCorrected',
    'OBSERVACIONES', 'SOLICITUD ATENDIDA', 'ENTRE CALLE 1', 'CALLE 2',
    'observaciones', 'solicitud atendida', 'entre calle 1', 'calle 2',
    'Observaciones', 'Solicitud Atendida', 'Entre Calle 1', 'Calle 2',
    'solicitud_atendida', 'entre_calle_1', 'calle_2',
    'ENTRE CALLE 1 Y 2', 'entre calle 1 y 2', 'Entre Calle 1 y 2'
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md transition-all">
      <div className="bg-white dark:bg-slate-900 w-full max-w-7xl h-[90vh] rounded-3xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col border border-slate-200/50 dark:border-slate-700/50 animate-fade-in">
        
        {/* Header - Premium Glassmorphism */}
        <div className="px-8 py-5 border-b border-slate-100 dark:border-slate-800/50 flex justify-between items-center bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/10 dark:bg-primary/20 rounded-2xl shadow-inner">
              <MapPin className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight leading-tight">Centro de Corrección Geosocial</h2>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-widest">Contrato {editedRecord['No. Contrato']}</span>
                <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold uppercase tracking-widest">Folio {editedRecord['folio']}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all duration-300 group">
            <X className="w-5 h-5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 group-hover:rotate-90 transition-transform" />
          </button>
        </div>

        <div className="flex-grow overflow-hidden grid grid-cols-1 lg:grid-cols-[1.2fr_1fr]">
          
          {/* Panel Izquierdo: Mapa con estética Premium */}
          <div className="relative flex flex-col h-full bg-slate-100 dark:bg-slate-950 border-r border-slate-100 dark:border-slate-800/50">
            {/* Coords indicators - Estética Flotante */}
            <div className="absolute top-6 left-6 z-[1000] flex flex-col gap-3 pointer-events-none">
              {originalCoords && (
                <div className="bg-amber-400 text-amber-950 px-4 py-3 rounded-2xl shadow-[0_10px_25px_-5px_rgba(251,191,36,0.6)] border-2 border-amber-300 flex items-center gap-4 backdrop-blur-xl animate-fade-in">
                   <div className="p-2 bg-amber-500/20 rounded-lg">
                      <MapPin className="w-4 h-4" />
                   </div>
                   <div className="flex flex-col">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-80">Coordenada Original</span>
                      <span className="text-xs font-black font-mono tracking-tighter">{originalCoords[0].toFixed(6)}, {originalCoords[1].toFixed(6)}</span>
                   </div>
                </div>
              )}
              {currentCoords && (originalCoords ? (currentCoords[0] !== originalCoords[0] || currentCoords[1] !== originalCoords[1]) : true) && (
                <div className="bg-emerald-500 text-white px-4 py-3 rounded-2xl shadow-[0_10px_25px_-5px_rgba(16,185,129,0.6)] border-2 border-emerald-400 flex items-center gap-4 backdrop-blur-xl animate-bounce-subtle">
                   <div className="p-2 bg-white/20 rounded-lg">
                      <Navigation className="w-4 h-4" />
                   </div>
                   <div className="flex flex-col">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] opacity-90">Ubicación Corregida</span>
                      <span className="text-xs font-black font-mono tracking-tighter">{currentCoords[0].toFixed(6)}, {currentCoords[1].toFixed(6)}</span>
                   </div>
                </div>
              )}
            </div>

            <div className="flex-grow relative z-10">
              <MapContainer 
                center={currentCoords || [19.4326, -99.1332]} 
                zoom={16} 
                style={{ height: '100%', width: '100%' }}
                className="z-10"
              >
                <TileLayer
                  url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> colaboradores &copy; <a href="https://carto.com/attributions">CARTO</a>'
                />
                <MapController coords={currentCoords} />
                {zonePolygon && (
                  <GeoJSON 
                    key={`zone-${editedRecord['folio'] || 'default'}-${Date.now()}`}
                    data={zonePolygon} 
                    style={{ color: '#7a1531', weight: 3, fillOpacity: 0.15, fillColor: '#7a1531', dashArray: '5, 10' }} 
                  />
                )}
                {currentCoords && (
                  <Marker 
                    position={currentCoords} 
                    draggable={true}
                    eventHandlers={{ dragend: handleMarkerDragEnd }}
                  />
                )}
              </MapContainer>
            </div>

            {/* Bottom buttons for Map - Fixed as requested */}
            <div className="absolute bottom-16 left-0 right-0 z-[1000] flex justify-center gap-4">
              <button 
                onClick={onClose}
                className="px-8 py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-800 dark:hover:text-white transition-all shadow-2xl hover:scale-105 active:scale-95"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSubmit}
                className="px-10 py-3 bg-primary text-white rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-opacity-90 transition-all shadow-2xl shadow-primary/30 flex items-center gap-3 hover:scale-105 active:scale-95"
              >
                <Save className="w-4 h-4" /> Confirmar Ubicación
              </button>
            </div>
          </div>

          {/* Panel Derecho: Formulario Cuadriculado (Grid-based) */}
          <div className="flex flex-col h-full min-h-0 overflow-hidden bg-slate-50 dark:bg-slate-900/30">
            <div className="p-5 overflow-y-auto flex-grow custom-scrollbar">
              <div className="flex flex-col gap-3 mb-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-1 h-8 bg-primary rounded-full" />
                    <h3 className="text-sm font-black uppercase tracking-[0.2em] text-slate-800 dark:text-slate-100">Datos del Registro</h3>
                  </div>
                  <div className="p-2 bg-slate-200/50 dark:bg-slate-800 rounded-xl">
                     <AlertCircle className="w-4 h-4 text-slate-400" />
                  </div>
                </div>

                {editedRecord._error && (
                  <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/50 rounded-2xl flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <p className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider leading-relaxed">
                      {editedRecord._error}
                    </p>
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-3">
                {(() => {
                  const renderedKeys = new Set();
                  const excludeSet = new Set(fieldsToExclude.map(f => f.toLowerCase()));
                  
                  return Object.keys(editedRecord)
                    .filter(key => {
                      const lowerKey = key.toLowerCase();
                      if (excludeSet.has(lowerKey) || renderedKeys.has(lowerKey)) {
                        return false;
                      }
                      renderedKeys.add(lowerKey);
                      return true;
                    })
                    .map(key => (
                      <div key={key} className="flex flex-col gap-1 p-3 bg-white dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/50 rounded-2xl group transition-all hover:shadow-md hover:border-primary/30">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 group-focus-within:text-primary transition-colors">
                          {key}
                        </label>
                        <input 
                          type="text"
                          value={editedRecord[key] || ''}
                          onChange={(e) => handleInputChange(key, e.target.value)}
                          className="w-full bg-transparent text-xs font-bold text-slate-700 dark:text-slate-200 outline-none placeholder:opacity-30"
                          placeholder={`...`}
                        />
                      </div>
                    ));
                })()}
              </div>
            </div>
            
            <div className="p-4 bg-white dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-100 dark:border-slate-800 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)]">
              <button 
                onClick={handleSubmit}
                className="w-full py-3 bg-gradient-to-r from-primary to-[#9c1d42] text-white rounded-2xl font-black uppercase tracking-[0.25em] text-xs hover:shadow-[0_20px_50px_-12px_rgba(122,21,49,0.5)] transition-all flex items-center justify-center gap-3 hover:-translate-y-1 active:translate-y-0"
              >
                <Save className="w-5 h-5" /> Guardar Todos los Cambios
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CorrectionModal;
