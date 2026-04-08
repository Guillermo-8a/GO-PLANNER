import React from 'react';
// Importamos el Shell (incluimos la extensión .jsx para asegurar que el sistema lo encuentre)
import { GOPlannerShell } from './GOPlanner_Shell.jsx';
// Importamos tu módulo de Forecast (incluimos la extensión .jsx para asegurar que el sistema lo encuentre)
import ModuleForecast from './ModuleForecast.jsx';

/**
 * ARCHIVO: App.jsx
 * Este es el orquestador principal. Aquí conectamos la "carcasa" profesional (Shell)
 * con tu herramienta de Forecast de alta precisión.
 */
export default function App() {
  return (
    <GOPlannerShell
      ModuleForecast={ModuleForecast}
      // En el futuro, aquí conectarás los módulos de Assortment, Distribución y Resurtido
    />
  );
}
