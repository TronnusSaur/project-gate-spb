import React from 'react';

const Header = ({ toggleDarkMode, user, onLogin, onLogout, adminMode }) => {
    return (
        <header className="header-gradient text-white shadow-lg" style={{ transition: 'all 0.6s ease' }}>
            {/* Círculos decorativos de fondo con glassmorphism */}
            <div className="semi-circle-1"></div>
            <div className="semi-circle-2"></div>
            
            <div className="w-full max-w-[1536px] mx-auto px-4 lg:px-8 py-4 relative z-10">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    
                    {/* Sección Izquierda: Título y Logo como Trigger */}
                    <button 
                        onClick={onLogin}
                        className="flex items-center gap-6 text-left focus:outline-none hover:opacity-90 active:scale-[0.98] transition-all bg-transparent border-none p-0 cursor-pointer"
                        title="Seleccionar cuenta de Google"
                    >
                        <div className="flex items-center gap-3">
                            <div className="bg-white/10 p-2 rounded-lg backdrop-blur-sm border border-white/10">
                                {/* Requiere Material Symbols Outlined */}
                                <span className="material-symbols-outlined text-3xl">account_balance</span>
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <h1 className="text-xl font-black tracking-tight leading-none uppercase">Toluca Capital</h1>
                                    {adminMode && (
                                        <span className="bg-amber-500/25 text-amber-300 text-[8px] font-black uppercase px-1.5 py-0.5 rounded border border-amber-500/30 tracking-widest animate-pulse">
                                            ADMIN
                                        </span>
                                    )}
                                </div>
                                <p className="text-[10px] font-medium tracking-[0.2em] opacity-80 uppercase">Ayuntamiento 2025-2027</p>
                            </div>
                        </div>
                        {/* Divisor vertical */}
                        <div className="h-10 w-[1px] bg-white/20 hidden md:block"></div>
                        <div className="hidden md:block">
                            <h2 className="text-lg font-bold leading-tight">Supervisión Inteligente</h2>
                            <p className="text-sm font-light opacity-90 uppercase tracking-wider font-sans">DIRECCIÓN DE OBRAS PÚBLICAS</p>
                        </div>
                    </button>
                    
                    {/* Sección Derecha: Controles y Perfil */}
                    <div className="flex items-center gap-4 w-full md:w-auto flex-wrap justify-end">
                        
                        {/* Botón de Tema (Dark/Light mode) */}
                        <button
                            onClick={toggleDarkMode}
                            className="p-2 rounded-full hover:bg-white/10 transition-colors cursor-pointer"
                            title="Cambiar Tema"
                        >
                            <span className="material-symbols-outlined">light_mode</span>
                        </button>
                        
                        {/* Avatar / Perfil con Google OAuth */}
                        {user ? (
                            <div 
                                onClick={onLogout}
                                className="flex items-center gap-3 pl-2 border-l border-white/20 cursor-pointer hover:opacity-80 transition-opacity"
                                title="Cerrar Sesión de Google"
                            >
                                <div className="text-right hidden sm:block">
                                    <p className="text-xs font-bold leading-none font-sans">{user.name}</p>
                                    <p className="text-[10px] opacity-75 truncate max-w-[120px] font-mono">{user.email}</p>
                                </div>
                                <div className="w-10 h-10 rounded-full border-2 border-white/20 bg-white/10 flex items-center justify-center overflow-hidden shadow-inner">
                                    {user.picture ? (
                                        <img src={user.picture} alt={user.name} className="w-full h-full object-cover" referrerpolicy="no-referrer" />
                                    ) : (
                                        <span className="text-sm font-black uppercase font-sans">{user.name.charAt(0)}</span>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <button
                                onClick={onLogin}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/20 bg-white/10 hover:bg-white/20 active:scale-[0.98] transition-all font-sans text-xs font-black uppercase tracking-wider cursor-pointer shadow-sm"
                                title="Iniciar Sesión con Google"
                            >
                                <span className="material-symbols-outlined text-sm">login</span>
                                <span>Acceder</span>
                            </button>
                        )}
                        
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Header;
