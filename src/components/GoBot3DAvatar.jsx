import React from 'react';

/**
 * GoBot3DAvatar - Renderizador Volumétrico 3D PBR en SVG con 5 Animaciones
 * @param {string} variant - 'neutral' | 'amber' | 'green' | 'red' | 'purple'
 * @param {string} animation - 'idle' | 'scanning' | 'chairSpin360' | 'threePointShot' | 'paperBallThrow' | 'cocaColaBreak' | 'fortniteVictoryDance'
 * @param {boolean} isDark - Activa iluminación neón en modo oscuro
 * @param {number} size - Tamaño en px
 */
export default function GoBot3DAvatar({
  variant = 'neutral',
  animation = 'idle',
  isDark = true,
  size = 94,
  onClick
}) {
  const uid = React.useId().replace(/:/g, '');

  const shaders = {
    neutral: isDark
      ? {
          s0: '#FFFFFF', s1: '#F1F5F9', s2: '#94A3B8', s3: '#334155', s4: '#0F172A',
          rim: '#38BDF8', glow: 'rgba(56, 189, 248, 0.78)', eye: '#38BDF8'
        }
      : {
          s0: '#64748B', s1: '#475569', s2: '#1E293B', s3: '#0F172A', s4: '#020617',
          rim: '#6366F1', glow: 'rgba(99, 102, 241, 0.35)', eye: '#38BDF8'
        },
    amber: {
      s0: '#FEF9C3', s1: '#FACC15', s2: '#D97706', s3: '#78350F', s4: '#451A03',
      rim: '#FBBF24', glow: 'rgba(251, 191, 36, 0.82)', eye: '#38BDF8'
    },
    green: {
      s0: '#D1FAE5', s1: '#34D399', s2: '#059669', s3: '#064E3B', s4: '#022C22',
      rim: '#34D399', glow: 'rgba(52, 211, 153, 0.82)', eye: '#FEF08A'
    },
    red: {
      s0: '#FFE4E6', s1: '#FB7185', s2: '#E11D48', s3: '#881337', s4: '#4C0519',
      rim: '#F43F5E', glow: 'rgba(244, 63, 94, 0.92)', eye: '#FEF08A'
    },
    purple: {
      s0: '#F3E8FF', s1: '#C084FC', s2: '#7E22CE', s3: '#4C1D95', s4: '#2E1065',
      rim: '#A855F7', glow: 'rgba(168, 85, 247, 0.82)', eye: '#34D399'
    }
  };

  const c = shaders[variant] || shaders.neutral;

  const animMap = {
    chairSpin360: 'animate-gobot-chair-spin',
    threePointShot: 'animate-gobot-jumpshot',
    cocaColaBreak: 'animate-gobot-cola',
    fortniteVictoryDance: 'animate-gobot-fortnite',
    paperBallThrow: 'animate-gobot-float',
    scanning: 'animate-gobot-float',
    idle: 'animate-gobot-float'
  };

  return (
    <div
      onClick={onClick}
      className={`relative inline-flex items-center justify-center select-none cursor-pointer transition-transform duration-300 hover:scale-105 ${animMap[animation] || 'animate-gobot-float'}`}
      style={{
        width: size,
        height: size * 1.18,
        filter: isDark
          ? `drop-shadow(0 0 16px ${c.glow}) drop-shadow(0 10px 14px rgba(0,0,0,0.65))`
          : 'drop-shadow(0 10px 14px rgba(15,23,42,0.28))'
      }}
    >
      <svg viewBox="0 0 190 220" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <radialGradient id={`pbrBody-${uid}`} cx="32%" cy="22%" r="72%" fx="24%" fy="16%">
            <stop offset="0%" stopColor={c.s0} />
            <stop offset="24%" stopColor={c.s1} />
            <stop offset="60%" stopColor={c.s2} />
            <stop offset="88%" stopColor={c.s3} />
            <stop offset="100%" stopColor={c.s4} />
          </radialGradient>

          <linearGradient id={`rimLight-${uid}`} x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor={c.rim} stopOpacity="0.75" />
            <stop offset="38%" stopColor={c.rim} stopOpacity="0" />
          </linearGradient>

          <linearGradient id={`visor-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1E293B" />
            <stop offset="30%" stopColor="#090D16" />
            <stop offset="100%" stopColor="#020617" />
          </linearGradient>

          <linearGradient id={`glassReflect-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
            <stop offset="35%" stopColor="#FFFFFF" stopOpacity="0.12" />
            <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>

          <radialGradient id={`bball-${uid}`} cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#FDBA74" />
            <stop offset="45%" stopColor="#EA580C" />
            <stop offset="100%" stopColor="#431407" />
          </radialGradient>

          <linearGradient id={`colaCan-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#991B1B" />
            <stop offset="30%" stopColor="#EF4444" />
            <stop offset="50%" stopColor="#FCA5A5" />
            <stop offset="75%" stopColor="#DC2626" />
            <stop offset="100%" stopColor="#450A0A" />
          </linearGradient>

          <linearGradient id={`goldCrown-${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FEF08A" />
            <stop offset="50%" stopColor="#FACC15" />
            <stop offset="100%" stopColor="#CA8A04" />
          </linearGradient>

          <filter id={`neonEye-${uid}`} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="3.5" result="b1" />
            <feGaussianBlur stdDeviation="7" result="b2" />
            <feMerge>
              <feMergeNode in="b2" />
              <feMergeNode in="b1" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* === 1. SILLA EJECUTIVA GIRATORIA 360° (ABURRIMIENTO) === */}
        {animation === 'chairSpin360' && (
          <g>
            <rect x="52" y="60" width="84" height="98" rx="24" fill="#0F172A" stroke="#475569" strokeWidth="3" />
            <rect x="60" y="68" width="68" height="80" rx="18" fill="#1E293B" />
            <rect x="89" y="172" width="10" height="24" rx="3" fill="#94A3B8" />
            <path d="M58 198 L130 198 M66 198 L58 207 M122 198 L130 207" stroke="#CBD5E1" strokeWidth="4.5" strokeLinecap="round" />
            <path d="M24 150 C10 172, 178 172, 164 150" stroke={c.rim} strokeWidth="3" strokeDasharray="8 5" fill="none" />
          </g>
        )}

        {/* === 2. CANASTA HOLOGRÁFICA Y BALÓN 3D EN TIRO DE 3 PUNTOS === */}
        {animation === 'threePointShot' && (
          <g>
            <g transform="translate(8, 22)">
              <rect x="2" y="0" width="6" height="36" rx="3" fill="#38BDF8" />
              <ellipse cx="16" cy="28" rx="12" ry="4" stroke="#F97316" strokeWidth="3" fill="none" />
              <path d="M6 30 L10 46 L22 46 L26 30" stroke="#E2E8F0" strokeWidth="1.5" strokeDasharray="2 2" fill="none" />
            </g>
            <g className="animate-bball-shot" style={{ transformOrigin: '135px 75px' }}>
              <circle cx="136" cy="74" r="15" fill={`url(#bball-${uid})`} />
              <path d="M122 74 Q136 66 150 74 M136 59 Q130 74 136 89" stroke="#1C1917" strokeWidth="1.8" fill="none" />
            </g>
            <ellipse cx="94" cy="188" rx="14" ry="5" fill="#38BDF8" filter={`url(#neonEye-${uid})`} />
          </g>
        )}

        {/* === 3. BOLITA DE PAPEL + MINI BOT VÍCTIMA === */}
        {animation === 'paperBallThrow' && (
          <g>
            <g transform="translate(4, 56) scale(0.45)">
              <ellipse cx="50" cy="95" rx="24" ry="28" fill="#7E22CE" />
              <rect x="18" y="26" width="64" height="48" rx="24" fill="#9333EA" />
              <rect x="26" y="36" width="48" height="26" rx="12" fill="#090D16" />
              <path d="M34 44 L42 49 L34 54 M58 44 L50 49 L58 54" stroke="#34D399" strokeWidth="3.5" strokeLinecap="round" fill="none" />
            </g>
            <g className="animate-paper-throw" style={{ transformOrigin: '130px 88px' }}>
              <polygon points="124,74 136,77 139,88 129,94 119,90 117,80" fill="#F8FAFC" stroke="#94A3B8" strokeWidth="2" />
              <polyline points="121,82 129,85 134,79" stroke="#CBD5E1" strokeWidth="1.5" fill="none" />
            </g>
          </g>
        )}

        {/* === 5. PISTA DE BAILE NEÓN Y CORONA DORADA (VICTORY ROYALE) === */}
        {animation === 'fortniteVictoryDance' && (
          <g>
            <ellipse cx="94" cy="200" rx="56" ry="10" stroke="#38BDF8" strokeWidth="2.5" strokeDasharray="6 4" fill="none" filter={`url(#neonEye-${uid})`} />
            <circle cx="26" cy="52" r="4" fill="#F43F5E" filter={`url(#neonEye-${uid})`} />
            <circle cx="166" cy="48" r="4.5" fill="#FACC15" filter={`url(#neonEye-${uid})`} />
            <circle cx="170" cy="110" r="3.5" fill="#34D399" filter={`url(#neonEye-${uid})`} />
          </g>
        )}

        {/* === SOMBRA DE PISO === */}
        <ellipse cx="94" cy="202" rx="46" ry="9" fill="#000000" fillOpacity="0.55" />

        {/* === TORSO CÁPSULA 3D PBR === */}
        <path
          d="M58 120 C58 94, 130 94, 130 120 C130 162, 116 188, 94 188 C72 188, 58 162, 58 120 Z"
          fill={`url(#pbrBody-${uid})`}
        />
        <path
          d="M58 120 C58 94, 130 94, 130 120 C130 162, 116 188, 94 188 C72 188, 58 162, 58 120 Z"
          fill={`url(#rimLight-${uid})`}
        />

        {/* Core Reactor GO */}
        <circle cx="94" cy="140" r="10" fill="#090D16" stroke="#334155" strokeWidth="2" />
        <circle cx="94" cy="140" r="5.5" fill={c.eye} filter={`url(#neonEye-${uid})`} />

        {/* Cuello */}
        <ellipse cx="94" cy="99" rx="21" ry="7.5" fill="#020617" />

        {/* === CABEZA 3D PBR === */}
        <rect x="42" y="24" width="104" height="78" rx="39" fill={`url(#pbrBody-${uid})`} />
        <rect x="42" y="24" width="104" height="78" rx="39" fill={`url(#rimLight-${uid})`} />

        {/* Corona Dorada 3D si está en Baile de Victoria */}
        {animation === 'fortniteVictoryDance' && (
          <polygon
            points="68,24 75,6 86,17 94,2 102,17 113,6 120,24"
            fill={`url(#goldCrown-${uid})`}
            stroke="#FEF08A"
            strokeWidth="1.5"
          />
        )}

        {/* Brillo Especular 3D */}
        <ellipse cx="75" cy="37" rx="25" ry="8.5" transform="rotate(-12 75 37)" fill="#FFFFFF" fillOpacity="0.82" />
        <ellipse cx="56" cy="51" rx="6" ry="3" transform="rotate(-35 56 51)" fill="#FFFFFF" fillOpacity="0.65" />

        {/* === VISOR DE CRISTAL CURVO === */}
        <rect x="54" y="41" width="80" height="45" rx="22" fill="#020617" stroke="#334155" strokeWidth="2.5" />
        <rect x="58" y="45" width="72" height="37" rx="18" fill={`url(#visor-${uid})`} />

        {/* === EXPRESIONES EN EL VISOR SEGÚN LAS 5 ANIMACIONES === */}
        {animation === 'chairSpin360' || animation === 'cocaColaBreak' ? (
          <>
            <path d="M71 66 Q80 52 89 66" stroke={c.eye} strokeWidth="5" strokeLinecap="round" fill="none" filter={`url(#neonEye-${uid})`} />
            <path d="M99 66 Q108 52 117 66" stroke={c.eye} strokeWidth="5" strokeLinecap="round" fill="none" filter={`url(#neonEye-${uid})`} />
            <ellipse cx="68" cy="71" rx="4.5" ry="2.2" fill="#F472B6" fillOpacity="0.8" />
            <ellipse cx="120" cy="71" rx="4.5" ry="2.2" fill="#F472B6" fillOpacity="0.8" />
          </>
        ) : animation === 'fortniteVictoryDance' ? (
          <>
            <text x="79" y="70" fill="#FACC15" fontSize="19" fontWeight="900" textAnchor="middle" filter={`url(#neonEye-${uid})`}>★</text>
            <text x="109" y="70" fill="#FACC15" fontSize="19" fontWeight="900" textAnchor="middle" filter={`url(#neonEye-${uid})`}>★</text>
            <path d="M87 72 Q94 79 101 72" stroke="#38BDF8" strokeWidth="3" strokeLinecap="round" fill="none" />
          </>
        ) : animation === 'paperBallThrow' ? (
          <>
            <path d="M70 63 L87 63" stroke={c.eye} strokeWidth="5" strokeLinecap="round" filter={`url(#neonEye-${uid})`} />
            <circle cx="108" cy="63" r="7.5" fill={c.eye} filter={`url(#neonEye-${uid})`} />
            <circle cx="110" cy="60" r="2.5" fill="#FFFFFF" />
          </>
        ) : variant === 'red' ? (
          <>
            <ellipse cx="79" cy="64" rx="7" ry="8" fill={c.eye} filter={`url(#neonEye-${uid})`} />
            <ellipse cx="109" cy="64" rx="7" ry="8" fill={c.eye} filter={`url(#neonEye-${uid})`} />
            <line x1="69" y1="53" x2="89" y2="58" stroke={c.eye} strokeWidth="3.5" strokeLinecap="round" />
            <line x1="119" y1="53" x2="99" y2="58" stroke={c.eye} strokeWidth="3.5" strokeLinecap="round" />
          </>
        ) : (
          <>
            <ellipse cx="79" cy="63" rx="7" ry="8.5" fill={c.eye} filter={`url(#neonEye-${uid})`} />
            <circle cx="81" cy="60" r="2.5" fill="#FFFFFF" />
            <ellipse cx="109" cy="63" rx="7" ry="8.5" fill={c.eye} filter={`url(#neonEye-${uid})`} />
            <circle cx="111" cy="60" r="2.5" fill="#FFFFFF" />
          </>
        )}

        {animation === 'scanning' && (
          <rect x="62" y="61" width="64" height="3.5" rx="1.5" fill="#38BDF8" className="animate-visor-scan" filter={`url(#neonEye-${uid})`} />
        )}

        <path d="M62 49 C81 47, 104 47, 123 51 C111 61, 77 63, 62 49 Z" fill={`url(#glassReflect-${uid})`} />

        {/* === BRAZOS Y ACCESORIO 4: LATA 3D DE COQUITA BIEN FRÍA CON POPOTE === */}
        {animation === 'cocaColaBreak' ? (
          <>
            <path d="M54 124 C40 134, 38 150, 46 160" stroke={`url(#pbrBody-${uid})`} strokeWidth="14" strokeLinecap="round" fill="none" />
            <circle cx="47" cy="162" r="10" fill={`url(#pbrBody-${uid})`} />
            <path d="M134 124 C154 114, 162 98, 146 86" stroke={`url(#pbrBody-${uid})`} strokeWidth="14" strokeLinecap="round" fill="none" />
            <circle cx="144" cy="84" r="10" fill={`url(#pbrBody-${uid})`} />
            {/* Popote hacia el visor */}
            <path d="M140 64 L134 49 L114 60" stroke="#F8FAFC" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
            <path d="M140 64 L134 49 L114 60" stroke="#EF4444" strokeWidth="3.5" strokeDasharray="3 3" strokeLinecap="round" fill="none" />
            {/* Lata Roja 3D con onda blanca y gotas de hielo */}
            <g transform="translate(128, 60) rotate(-10)">
              <rect x="0" y="0" width="26" height="40" rx="5" fill={`url(#colaCan-${uid})`} stroke="#FCA5A5" strokeWidth="1" />
              <ellipse cx="13" cy="2" rx="12" ry="2.8" fill="#E2E8F0" />
              <path d="M2 22 Q13 14 24 22" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" fill="none" />
              <circle cx="7" cy="12" r="1.5" fill="#BAE6FD" />
              <circle cx="20" cy="29" r="1.8" fill="#BAE6FD" />
            </g>
            {/* Burbujas efervescentes */}
            <g className="animate-cola-bubbles">
              <circle cx="154" cy="48" r="2.8" fill="#FCA5A5" />
              <circle cx="164" cy="38" r="3.8" fill="#FCA5A5" />
            </g>
          </>
        ) : animation === 'chairSpin360' || animation === 'threePointShot' || animation === 'fortniteVictoryDance' ? (
          <>
            <path d="M54 122 C36 104, 28 84, 36 68" stroke={`url(#pbrBody-${uid})`} strokeWidth="14" strokeLinecap="round" fill="none" />
            <circle cx="36" cy="65" r="10" fill={`url(#pbrBody-${uid})`} />
            <path d="M134 122 C152 104, 160 84, 152 68" stroke={`url(#pbrBody-${uid})`} strokeWidth="14" strokeLinecap="round" fill="none" />
            <circle cx="152" cy="65" r="10" fill={`url(#pbrBody-${uid})`} />
          </>
        ) : (
          <>
            <path d="M54 124 C40 134, 38 150, 46 160" stroke={`url(#pbrBody-${uid})`} strokeWidth="14" strokeLinecap="round" fill="none" />
            <circle cx="47" cy="162" r="10" fill={`url(#pbrBody-${uid})`} />
            <path d="M134 124 C148 134, 150 150, 142 160" stroke={`url(#pbrBody-${uid})`} strokeWidth="14" strokeLinecap="round" fill="none" />
            <circle cx="141" cy="162" r="10" fill={`url(#pbrBody-${uid})`} />
          </>
        )}
      </svg>
    </div>
  );
}
