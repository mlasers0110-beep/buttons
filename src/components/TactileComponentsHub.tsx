import React, { useState } from 'react';
import { ButtonAnimationsLibrary } from './ButtonAnimationsLibrary';
import { SwitchVariantsLibrary } from './SwitchVariantsLibrary';
import { RotaryDriverCalibrationService } from './RotaryDriverCalibrationService';
import { ScreenTransitionsLibrary } from './ScreenTransitionsLibrary';
import { ScreenPrototypeDropStage } from './ScreenPrototypeDropStage';
import { useStudio } from '../context/StudioContext';
import { StudioLiveTabId } from '../types/studio';

export const TactileComponentsHub: React.FC<{
  onNavigateLiveTab?: (tab: StudioLiveTabId) => void;
  onOpenScreenPrototyper?: (screenId: string) => void;
}> = ({ onNavigateLiveTab, onOpenScreenPrototyper }) => {
  const { palette } = useStudio();
  const [focusView, setFocusView] = useState<
    | 'both'
    | 'prototyper'
    | 'transitions'
    | 'calibration'
    | 'animations'
    | 'switches'
  >('both');
  const isDark = palette === 'emerald-clinic';

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500 dark:text-emerald-300/80 flex flex-wrap items-center gap-1.5">
            <span>Katalog Interaktywny Aether</span>
            <span aria-hidden="true">·</span>
            <span>
              Drag &amp; Drop na Ekran · Przejścia Ekranów · Kalibracja CNC · Animacje · Przełączniki
            </span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-semibold text-slate-900 dark:text-emerald-50 mt-1">
            Biblioteka Komponentów, Przejść Ekranowych i Prototypowania
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-white/65 dark:bg-emerald-950/75 border border-white/80 dark:border-emerald-400/20">
          {(
            [
              ['both', 'Pełna biblioteka'],
              ['prototyper', 'Przeciągnij na ekran'],
              ['transitions', 'Przejścia ekranów'],
              ['calibration', 'Kalibracja sterownika'],
              ['animations', 'Animacje przycisków'],
              ['switches', 'Warianty przełączników'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setFocusView(id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 min-h-[38px] ${
                focusView === id
                  ? isDark
                    ? 'bg-emerald-400 text-emerald-950 shadow-sm'
                    : 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 dark:text-emerald-200/75 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {(focusView === 'both' || focusView === 'prototyper') && (
        <ScreenPrototypeDropStage
          mode="docked-preview"
          onNavigateLiveTab={onNavigateLiveTab}
          onOpenFullPrototyperInScreens={onOpenScreenPrototyper}
        />
      )}

      {(focusView === 'both' || focusView === 'transitions') && (
        <ScreenTransitionsLibrary />
      )}
      {(focusView === 'both' || focusView === 'calibration') && (
        <RotaryDriverCalibrationService />
      )}
      {(focusView === 'both' || focusView === 'animations') && <ButtonAnimationsLibrary />}
      {(focusView === 'both' || focusView === 'switches') && <SwitchVariantsLibrary />}
    </div>
  );
};
