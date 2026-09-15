// src/components/ModuleFilterBar.jsx
// Barra de filtros fija (sticky) arriba del contenido al hacer scroll.
// Cada módulo mete SUS filtros como children:
//   <ModuleFilterBar t={t} isDark={isDark}>
//     <select className={`px-3 py-1.5 rounded-lg text-xs ${t.input}`}>...</select>
//   </ModuleFilterBar>
import React from 'react';

export default function ModuleFilterBar({ t, isDark, children, className = '' }) {
  return (
    <div
      className={`sticky top-0 z-20 -mx-6 md:-mx-8 px-6 md:px-8 py-3 mb-6 border-b flex items-center gap-2 flex-wrap backdrop-blur-xl ${
        isDark ? 'bg-[#1c1720]/70 border-white/10' : 'bg-white/85 border-gray-200'
      } ${className}`}
    >
      {children}
    </div>
  );
}
