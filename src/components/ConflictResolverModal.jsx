import React, { useState, useEffect, useMemo } from 'react';
import { Database, FileText, CheckCircle, ArrowRight, AlertCircle, Edit3, X, HelpCircle, MapPin, Calendar, Ruler } from 'lucide-react';

const ConflictResolverModal = ({
  isOpen,
  onClose,
  conflicts, // array of { folio: '...', sheetRow: {...}, gateRow: {...} }
  dominantContract,
  onResolve, // function (appends, overwrites) called when all resolved
}) => {
  const [resolutions, setResolutions] = useState({}); // mapping: folio -> { type: 'keep' | 'overwrite' | 'rename', newFolio?: string }
  const [editFolios, setEditFolios] = useState({}); // mapping: folio -> input string
  const [errors, setErrors] = useState({}); // mapping: folio -> string error

  const uniqueConflicts = useMemo(() => {
    if (!conflicts) return [];
    const seen = new Set();
    return conflicts.filter(c => {
      if (seen.has(c.folio)) return false;
      seen.add(c.folio);
      return true;
    });
  }, [conflicts]);

  useEffect(() => {
    if (isOpen && uniqueConflicts) {
      const initialResolutions = {};
      const initialEdits = {};
      const initialErrors = {};

      uniqueConflicts.forEach(c => {
        initialResolutions[c.folio] = { type: 'overwrite' }; // Default to overwrite
        initialEdits[c.folio] = c.folio;
        initialErrors[c.folio] = '';
      });

      setResolutions(initialResolutions);
      setEditFolios(initialEdits);
      setErrors(initialErrors);
    }
  }, [isOpen, uniqueConflicts]);

  if (!isOpen || !uniqueConflicts || uniqueConflicts.length === 0) return null;

  const handleSelectOption = (folio, type) => {
    setResolutions(prev => ({
      ...prev,
      [folio]: { ...prev[folio], type }
    }));
  };

  const handleEditFolioChange = (originalFolio, val) => {
    setEditFolios(prev => ({ ...prev, [originalFolio]: val }));
    validateNewFolio(originalFolio, val);
  };

  const validateNewFolio = (originalFolio, val) => {
    const cleanVal = val.trim().replace(/\D/g, '');
    const contractPrefix = String(dominantContract || '').padStart(2, '0');
    
    let err = '';
    if (cleanVal.length !== 6) {
      err = 'El folio debe tener exactamente 6 dígitos.';
    } else if (!cleanVal.startsWith(contractPrefix)) {
      err = `El folio debe iniciar con el contrato ${contractPrefix}.`;
    }

    setErrors(prev => ({ ...prev, [originalFolio]: err }));
    
    if (!err) {
      setResolutions(prev => ({
        ...prev,
        [originalFolio]: { type: 'rename', newFolio: cleanVal }
      }));
    } else {
      // If invalid, fallback the resolution status to keep users from saving bad folios
      setResolutions(prev => ({
        ...prev,
        [originalFolio]: { ...prev[originalFolio], type: 'invalid' }
      }));
    }
  };

  const handleSave = () => {
    // Partition conflicts into updates and new inserts
    const appends = [];
    const overwrites = [];

    uniqueConflicts.forEach(c => {
      const res = resolutions[c.folio];
      if (res.type === 'overwrite') {
        overwrites.push({
          folio: c.folio,
          record: c.gateRow
        });
      } else if (res.type === 'rename') {
        const renamedRecord = { ...c.gateRow, folio: res.newFolio };
        // Renamed records are uploaded as new (appends) with the new folio ID
        appends.push(renamedRecord);
      }
      // 'keep' implies we discard the new GATE record entirely, so no action is taken
    });

    onResolve(appends, overwrites);
  };

  const totalConflicts = uniqueConflicts.length;
  const resolvedCount = Object.values(resolutions).filter(r => r.type === 'keep' || r.type === 'overwrite' || r.type === 'rename').length;
  const allResolved = resolvedCount === totalConflicts && Object.values(errors).every(e => !e);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-md transition-all duration-300 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-5xl h-[85vh] flex flex-col shadow-[0_25px_60px_-15px_rgba(0,0,0,0.3)] overflow-hidden">
        
        {/* Header */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-2xl border border-amber-200/50 dark:border-amber-900/50 text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-slate-800 dark:text-white uppercase">Control de Conflictos de Folio</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Se detectaron {totalConflicts} folios que ya existen en la base de datos central. Decide el destino de cada uno.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conflict count indicator */}
        <div className="px-8 py-3 bg-primary/5 dark:bg-primary/10 border-b border-primary/10 text-xs flex justify-between items-center">
          <span className="font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Progreso de Reconciliación</span>
          <span className="bg-primary/20 dark:bg-primary/30 text-primary dark:text-slate-200 font-black px-2 py-0.5 rounded-full text-[10px]">
            {resolvedCount} de {totalConflicts} Decididos
          </span>
        </div>

        {/* Content list */}
        <div className="flex-grow overflow-y-auto p-6 md:p-8 space-y-8 custom-scrollbar">
          {uniqueConflicts.map((conflict, index) => {
            const originalFolio = conflict.folio;
            const res = resolutions[originalFolio] || { type: 'overwrite' };
            const inputVal = editFolios[originalFolio] || '';
            const errorMsg = errors[originalFolio];

            return (
              <div 
                key={originalFolio} 
                className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/80 rounded-2xl p-6 transition-all duration-300 relative overflow-hidden"
              >
                {/* Visual conflict counter */}
                <div className="absolute top-0 left-0 bg-slate-200 dark:bg-slate-800 px-3 py-1 text-[10px] font-black text-slate-500 rounded-br-lg uppercase tracking-wider">
                  Caso #{index + 1}
                </div>

                {/* Folio info */}
                <div className="flex items-center gap-2 mb-6 mt-2 justify-between flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">Folio Duplicado:</span>
                    <span className="px-2.5 py-1 bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 font-black rounded-lg text-xs tracking-widest border border-amber-200/50">
                      {originalFolio}
                    </span>
                  </div>
                  
                  {/* Current decision status badge */}
                  <div>
                    {res.type === 'keep' && (
                      <span className="px-3 py-1 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-black text-[9px] uppercase tracking-wider rounded-full">
                        Conservar Existente (Ignorar Nuevo)
                      </span>
                    )}
                    {res.type === 'overwrite' && (
                      <span className="px-3 py-1 bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 font-black text-[9px] uppercase tracking-wider rounded-full border border-rose-200/20">
                        Sobreescribir Existente
                      </span>
                    )}
                    {res.type === 'rename' && (
                      <span className="px-3 py-1 bg-primary/10 dark:bg-primary/20 text-primary dark:text-slate-200 font-black text-[9px] uppercase tracking-wider rounded-full border border-primary/20">
                        Renombrar Folio a {res.newFolio}
                      </span>
                    )}
                  </div>
                </div>

                {/* Side by Side Comparison */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Left: Google Sheets Record */}
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-sm">
                    <div className="flex items-center gap-2 pb-3 mb-3 border-b border-slate-100 dark:border-slate-800 text-xs font-bold text-slate-500 dark:text-slate-400">
                      <Database className="w-4 h-4 text-slate-400" />
                      <span className="uppercase tracking-wider">En Base de Datos (Google Sheets)</span>
                    </div>

                    <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-xs">
                      <div>
                        <span className="block text-[10px] text-slate-400 uppercase font-medium">Empresa</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">{conflict.sheetRow.EMPRESA || '---'}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400 uppercase font-medium">Contrato (ID)</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">{conflict.sheetRow.ID || '---'}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="block text-[10px] text-slate-400 uppercase font-medium">Calle y Colonia</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300 truncate block">
                          {conflict.sheetRow.calle || '---'}, {conflict.sheetRow.colonia || '---'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400 uppercase font-medium">Delegación</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{conflict.sheetRow.delegacion || '---'}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400 uppercase font-medium">Geolocalización</span>
                        <span className="font-mono text-slate-600 dark:text-slate-400 text-[11px] truncate block">{conflict.sheetRow.GEOLOCALIZACION || '---'}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400 uppercase font-medium">Medidas (L x A)</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {conflict.sheetRow.largo || '0'} x {conflict.sheetRow.ancho || '0'} m ({conflict.sheetRow.m2total || '0'} m²)
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400 uppercase font-medium">Fecha de Trabajo</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{conflict.sheetRow.fecha || '---'}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: GATE Uploading Record */}
                  <div className="bg-white dark:bg-slate-900 border border-primary/20 dark:border-primary/10 p-4 rounded-xl shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-full blur-2xl" />
                    
                    <div className="flex items-center gap-2 pb-3 mb-3 border-b border-slate-100 dark:border-slate-800 text-xs font-bold text-primary dark:text-slate-200">
                      <FileText className="w-4 h-4" />
                      <span className="uppercase tracking-wider">Tu Archivo Depurado (GATE)</span>
                    </div>

                    <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-xs">
                      <div>
                        <span className="block text-[10px] text-slate-400 uppercase font-medium">Empresa</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">{conflict.gateRow.EMPRESA || '---'}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400 uppercase font-medium">Contrato (ID)</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">{conflict.gateRow.ID || '---'}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="block text-[10px] text-slate-400 uppercase font-medium">Calle y Colonia</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300 truncate block">
                          {conflict.gateRow.calle || '---'}, {conflict.gateRow.colonia || '---'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400 uppercase font-medium">Delegación</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{conflict.gateRow.delegacion || '---'}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400 uppercase font-medium">Geolocalización</span>
                        <span className="font-mono text-slate-600 dark:text-slate-400 text-[11px] truncate block">{conflict.gateRow.GEOLOCALIZACION || '---'}</span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400 uppercase font-medium">Medidas (L x A)</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {conflict.gateRow.largo || '0'} x {conflict.gateRow.ancho || '0'} m ({conflict.gateRow.m2total || '0'} m²)
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] text-slate-400 uppercase font-medium">Fecha de Trabajo</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{conflict.gateRow.fecha || '---'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Conflict Decision Buttons */}
                <div className="mt-5 pt-5 border-t border-slate-100 dark:border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => handleSelectOption(originalFolio, 'keep')}
                      className={`flex-grow sm:flex-grow-0 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border
                        ${res.type === 'keep'
                          ? 'bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                        }`}
                    >
                      Conservar Existente
                    </button>

                    <button
                      onClick={() => handleSelectOption(originalFolio, 'overwrite')}
                      className={`flex-grow sm:flex-grow-0 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all border
                        ${res.type === 'overwrite'
                          ? 'bg-rose-600 border-rose-600 text-white shadow-lg shadow-rose-600/10'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/20 hover:text-rose-600'
                        }`}
                    >
                      Sobreescribir con Nuevo
                    </button>
                  </div>

                  {/* Modify Folio Input Area */}
                  <div className="flex items-center gap-2 w-full sm:w-auto min-w-[280px]">
                    <div className="relative flex-grow">
                      <input
                        type="text"
                        value={inputVal}
                        placeholder="Ej. 440301"
                        onChange={(e) => handleEditFolioChange(originalFolio, e.target.value)}
                        className={`w-full px-4 py-2.5 pl-9 rounded-xl border bg-white dark:bg-slate-900 text-xs font-mono font-bold tracking-widest focus:outline-none transition-all
                          ${errorMsg 
                            ? 'border-red-500 focus:ring-2 focus:ring-red-200 dark:focus:ring-red-950 text-red-600' 
                            : inputVal !== originalFolio && !errorMsg
                              ? 'border-primary focus:ring-2 focus:ring-primary/20 text-primary dark:text-slate-200'
                              : 'border-slate-200 dark:border-slate-800 focus:ring-2 focus:ring-primary/20 text-slate-700 dark:text-slate-300'
                          }`}
                      />
                      <Edit3 className={`w-3.5 h-3.5 absolute left-3 top-3.5 
                        ${errorMsg ? 'text-red-400' : inputVal !== originalFolio && !errorMsg ? 'text-primary' : 'text-slate-400'}`} 
                      />
                    </div>
                    {inputVal !== originalFolio && !errorMsg && (
                      <div className="p-2 bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 rounded-lg">
                        <CheckCircle className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                </div>

                {/* Inline error display */}
                {errorMsg && (
                  <p className="mt-2 text-[10px] text-red-500 font-bold uppercase tracking-wider flex items-center gap-1.5 animate-pulse">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {errorMsg}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            {allResolved ? (
              <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 font-bold uppercase tracking-wider">
                <CheckCircle className="w-4 h-4" /> Todos los conflictos resueltos. Listo para transmitir.
              </span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1.5 uppercase tracking-wider">
                <AlertCircle className="w-4 h-4" /> Resuelve todos los conflictos para habilitar el envío.
              </span>
            )}
          </div>
          
          <div className="flex gap-3 w-full sm:w-auto">
            <button
              onClick={onClose}
              className="w-full sm:w-auto px-6 py-3 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancelar Carga
            </button>
            <button
              disabled={!allResolved}
              onClick={handleSave}
              className={`w-full sm:w-auto px-8 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 shadow-lg
                ${allResolved
                  ? 'bg-gradient-to-r from-primary to-[#9c1d42] text-white hover:shadow-primary/20 hover:-translate-y-0.5 active:translate-y-0'
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed border border-transparent shadow-none'}`}
            >
              <span>Resolver y Guardar en BD</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};

export default ConflictResolverModal;
