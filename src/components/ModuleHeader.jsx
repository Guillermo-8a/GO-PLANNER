// src/components/ModuleHeader.jsx
// Header consistente para todos los módulos. Shell ya te manda navIcon/navLabel/navDesc:
//   function ModuleDayli({ t, isDark, navIcon, navLabel, navDesc }) {
//     return (
//       <div className="p-8">
//         <ModuleHeader Icon={navIcon} label={navLabel} desc={navDesc} t={t} isDark={isDark} />
//         ...resto del módulo...
//       </div>
//     );
//   }
import React from 'react';

export default function ModuleHeader({ Icon, label, desc, t, isDark, right }) {
  return (
    <div className={`relative z-30 p-5 rounded-2xl border flex items-center justify-between flex-wrap gap-4 ${t.card}`}>
      <div className="flex items-center gap-3">
        {Icon && (
          <div className={`p-2 rounded-xl ${isDark ? 'bg-violet-500/20 text-violet-400' : 'bg-violet-50 text-violet-600'}`}>
            <Icon size={22} />
          </div>
        )}
        <div>
          <h1 className={`text-2xl font-black tracking-tight leading-none ${t.textMain || t.text}`}>{label}</h1>
          {desc && <p className={`text-xs mt-1 ${t.textMuted}`}>{desc}</p>}
        </div>
      </div>
      {right && <div className="flex items-center gap-2 flex-wrap">{right}</div>}
    </div>
  );
}
