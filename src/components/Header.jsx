import React from 'react';

const Header = ({ toggleDarkMode }) => {
    return (
        <header className="header-gradient text-white shadow-lg" style={{ transition: 'all 0.6s ease' }}>
            {/* Círculos decorativos de fondo con glassmorphism */}
            <div className="semi-circle-1"></div>
            <div className="semi-circle-2"></div>
            
            <div className="w-full max-w-[1536px] mx-auto px-4 lg:px-8 py-4 relative z-10">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    
                    {/* Sección Izquierda: Título y Logo */}
                    <div className="flex items-center gap-6">
                        <div className="flex items-center gap-3">
                            <div className="bg-white/10 p-2 rounded-lg backdrop-blur-sm border border-white/10">
                                {/* Requiere Material Symbols Outlined */}
                                <span className="material-symbols-outlined text-3xl">account_balance</span>
                            </div>
                            <div>
                                <h1 className="text-xl font-black tracking-tight leading-none uppercase">Toluca Capital</h1>
                                <p className="text-[10px] font-medium tracking-[0.2em] opacity-80 uppercase">Ayuntamiento 2025-2027</p>
                            </div>
                        </div>
                        {/* Divisor vertical */}
                        <div className="h-10 w-[1px] bg-white/20 hidden md:block"></div>
                        <div className="hidden md:block">
                            <h2 className="text-lg font-bold leading-tight">Supervisión Inteligente</h2>
                            <p className="text-sm font-light opacity-90 uppercase tracking-wider">DIRECCIÓN DE OBRAS PÚBLICAS</p>
                        </div>
                    </div>
                    
                    {/* Sección Derecha: Controles y Perfil */}
                    <div className="flex items-center gap-4 w-full md:w-auto flex-wrap justify-end">
                        
                        {/* Botón de Tema (Dark/Light mode) */}
                        <button
                            onClick={toggleDarkMode}
                            className="p-2 rounded-full hover:bg-white/10 transition-colors"
                            title="Cambiar Tema"
                        >
                            <span className="material-symbols-outlined">light_mode</span>
                        </button>
                        
                        {/* Avatar / Perfil */}
                        <div className="flex items-center gap-3 pl-2 border-l border-white/20 cursor-pointer hover:opacity-80 transition-opacity">
                            <div className="text-right hidden sm:block">
                                <p className="text-xs font-bold leading-none">Usuario</p>
                                <p className="text-[10px] opacity-70">Administrador</p>
                            </div>
                            <div className="w-10 h-10 rounded-full border-2 border-white/20 bg-white/10 flex items-center justify-center overflow-hidden">
                                <span className="material-symbols-outlined text-xl">person</span>
                            </div>
                        </div>
                        
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;
