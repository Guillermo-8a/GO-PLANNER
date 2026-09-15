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
    <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
      <div className="flex items-center gap-3">
        {Icon && (
          <div className={`p-2.5 rounded-xl ${isDark ? 'bg-violet-600/20 text-violet-400' : 'bg-blue-50 text-blue-600'}`}>
            <Icon size={20} />
          </div>
        )}
        <div>
          <h2 className={`text-2xl font-black tracking-tight leading-none ${t.text}`}>{label}</h2>
          {desc && <p className={`text-xs mt-1 ${t.textMuted}`}>{desc}</p>}
        </div>
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  );
}
