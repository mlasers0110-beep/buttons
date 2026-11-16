import React, { useRef, useState } from 'react';
import { motion } from 'motion/react';
import { useStudio } from '../../context/StudioContext';
import { hapticAudio } from '../../lib/hapticAudioEngine';
import {
  BUTTON_MOTION_PRESETS,
  ButtonGroupId,
  ButtonIlluminationPresetId,
  ButtonMotionPresetId,
  EngravingSymbol,
  HapticMaterialType,
} from '../../types/studio';
import { EngravingGlyph } from './EngravingGlyph';

interface TactileButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  groupId?: ButtonGroupId;
  symbol?: EngravingSymbol;
  materialOverride?: HapticMaterialType;
  motionPresetOverride?: ButtonMotionPresetId;
  illuminationPresetOverride?: ButtonIlluminationPresetId;
  glowColorOverride?: string;
  pitchSemitones?: number;
  variant?: 'glass-card' | 'crystal-pill' | 'neumorphic-icon' | 'primary-cta';
  selected?: boolean;
  className?: string;
  subtitle?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

export const TactileButton: React.FC<TactileButtonProps> = ({
  children,
  onClick,
  groupId = 'group-primary',
  symbol,
  materialOverride,
  motionPresetOverride,
  illuminationPresetOverride,
  glowColorOverride,
  pitchSemitones,
  variant = 'glass-card',
  selected = false,
  className = '',
  subtitle,
  ariaLabel,
  disabled = false,
}) => {
  const {
    synth,
    haptic,
    engraving,
    animation,
    patterns,
    palette,
    depth,
    selectedGroups,
    groupConfigs,
    setActiveHoldLevel,
    pulseInteraction,
  } = useStudio();

  const [isPressed, setIsPressed] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [holdIntensity, setHoldIntensity] = useState(0);
  const [pointerCoords, setPointerCoords] = useState({
    spotX: 50,
    spotY: 50,
    normX: 0,
    normY: 0,
  });

  const btnRef = useRef<HTMLButtonElement | null>(null);

  const isGroupUnified = selectedGroups.includes(groupId);
  const groupCfg = groupConfigs[groupId];

  const effectiveMaterial: HapticMaterialType =
    materialOverride ?? (isGroupUnified ? haptic.material : groupCfg.material);

  const effectiveSymbol: EngravingSymbol =
    symbol ?? (isGroupUnified ? engraving.symbol : groupCfg.symbol);

  const effectiveGlowColor =
    glowColorOverride ?? (isGroupUnified ? engraving.glowColor : groupCfg.glowColor);

  const effectivePitch =
    pitchSemitones ?? (isGroupUnified ? 0 : groupCfg.pitchOffsetSemitones);

  const effectiveMotionId: ButtonMotionPresetId =
    motionPresetOverride ?? animation.motionPreset ?? 'magnetic-levitation';

  const effectiveIlluminationId: ButtonIlluminationPresetId =
    illuminationPresetOverride ?? animation.illuminationPreset ?? 'cursor-spotlight';

  const overrideMotionSpec = motionPresetOverride
    ? BUTTON_MOTION_PRESETS.find((m) => m.id === motionPresetOverride)
    : undefined;

  const activeStiffness = overrideMotionSpec?.stiffness ?? animation.stiffness;
  const activeDamping = overrideMotionSpec?.damping ?? animation.damping;
  const activeMass = overrideMotionSpec?.mass ?? animation.mass;
  const activePressScale = overrideMotionSpec?.pressScale ?? animation.pressScale;

  const updateLocalCoords = (e: React.PointerEvent<HTMLButtonElement>) => {
    const el = btnRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const px = Math.max(0, Math.min(100, ((e.clientX - rect.left) / Math.max(1, rect.width)) * 100));
    const py = Math.max(0, Math.min(100, ((e.clientY - rect.top) / Math.max(1, rect.height)) * 100));
    setPointerCoords({
      spotX: px,
      spotY: py,
      normX: (px - 50) / 50,
      normY: (py - 50) / 50,
    });
  };

  const handlePointerEnter = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    setIsHovered(true);
    updateLocalCoords(e);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    updateLocalCoords(e);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    updateLocalCoords(e);
    setIsPressed(true);

    hapticAudio.triggerPress(synth, haptic, patterns, {
      material: effectiveMaterial,
      pitchSemitones: effectivePitch,
    });
    pulseInteraction(1);

    hapticAudio.startHoldRamp(
      synth,
      haptic,
      (lvl) => {
        setHoldIntensity(lvl);
        setActiveHoldLevel(lvl);
        pulseInteraction(0.35);
      },
      effectiveMaterial
    );
  };

  const endPress = () => {
    setIsHovered(false);
    setPointerCoords((prev) => ({ ...prev, normX: 0, normY: 0 }));
    if (!isPressed) return;
    setIsPressed(false);
    setHoldIntensity(0);
    setActiveHoldLevel(0);
    hapticAudio.stopHoldRamp();
    hapticAudio.triggerReleaseReverseClutch(haptic, effectiveMaterial);
  };

  const handlePointerUpOnly = () => {
    if (!isPressed) return;
    setIsPressed(false);
    setHoldIntensity(0);
    setActiveHoldLevel(0);
    hapticAudio.stopHoldRamp();
    hapticAudio.triggerReleaseReverseClutch(haptic, effectiveMaterial);
  };

  const isDark = palette === 'emerald-clinic';

  const getMaterialClasses = (): string => {
    if (variant === 'primary-cta') {
      return isDark
        ? 'bg-gradient-to-r from-[#67B596] to-[#3B7D65] text-white border border-emerald-200/40'
        : 'bg-gradient-to-r from-[#2E274E] via-[#3A3163] to-[#282246] text-white border border-indigo-200/30';
    }

    if (variant === 'crystal-pill') {
      return isDark
        ? 'bg-emerald-900/45 text-emerald-50 border border-emerald-300/35'
        : 'bg-white/65 text-slate-900 border border-white/90';
    }

    switch (effectiveMaterial) {
      case 'shiny-glass':
        return isDark
          ? 'bg-emerald-900/40 text-emerald-50 border border-emerald-200/35'
          : 'bg-white/82 text-slate-900 border border-white';
      case 'matte-metal':
        return isDark
          ? 'bg-gradient-to-b from-[#17332D] to-[#0D211D] text-emerald-50 border border-emerald-400/25'
          : 'bg-gradient-to-b from-[#F4F6FB] to-[#DCE2F0] text-slate-900 border border-slate-300/90';
      case 'abs-plastic':
        return isDark
          ? 'bg-[#122C26] text-emerald-50 border border-emerald-400/30'
          : 'bg-[#F8FAFC] text-slate-900 border border-slate-300';
      case 'suede':
        return isDark
          ? 'bg-[#102621]/95 text-emerald-100 border border-emerald-700/40'
          : 'bg-[#E9ECF8]/95 text-slate-800 border border-indigo-200/60';
      case 'frosted-glass':
      default:
        return isDark
          ? 'bg-emerald-950/55 text-emerald-50 border border-emerald-400/20'
          : 'bg-white/62 text-slate-900 border border-white/80';
    }
  };

  const dynamicRadius =
    variant === 'crystal-pill' || variant === 'neumorphic-icon'
      ? 9999
      : Math.max(14, depth.borderRadius - 4);

  const shadowColor = isDark
    ? 'rgba(0, 0, 0, 0.48)'
    : palette === 'finance-ice'
      ? 'rgba(79, 105, 198, 0.16)'
      : 'rgba(88, 76, 148, 0.15)';

  const specularAlpha =
    (depth.specularRim / 100) * (effectiveMaterial === 'suede' ? 0.25 : 0.85);
  const glowFactor = engraving.glowEnabled ? engraving.glowIntensity / 100 : 0.25;

  const boxShadowStyle = isPressed
    ? `inset 0 3px 10px ${shadowColor}, 0 0 ${Math.round(
        animation.glowSpread * (0.55 + holdIntensity)
      )}px ${effectiveGlowColor}66`
    : selected || effectiveIlluminationId === 'subsurface-caustic'
      ? `0 ${Math.round(depth.elevation * 0.65)}px ${Math.round(
          depth.blur * 0.78
        )}px ${shadowColor}, 0 0 ${Math.round(
          glowFactor * (effectiveIlluminationId === 'subsurface-caustic' ? 32 : 22)
        )}px ${effectiveGlowColor}42, inset 0 1px 1px rgba(255,255,255,${specularAlpha})`
      : `0 ${Math.round(depth.elevation * 0.55)}px ${Math.round(
          depth.blur * 0.7
        )}px ${shadowColor}, inset 0 1px 1px rgba(255,255,255,${specularAlpha})`;

  // Compute compositor-only motion targets per preset
  const holdTremorX =
    holdIntensity > 0.25 ? Math.sin(performance.now() * 0.06) * holdIntensity * 1.35 : 0;

  let targetX = holdTremorX;
  let targetY = 0;
  let targetRotateX = 0;
  let targetRotateY = 0;
  let targetScale = isPressed ? activePressScale - holdIntensity * 0.014 : 1;

  if (!disabled) {
    switch (effectiveMotionId) {
      case 'magnetic-levitation':
        if (isHovered && !isPressed) {
          targetX += pointerCoords.normX * 3.8;
          targetY = pointerCoords.normY * 2.4 - 2;
          targetScale = 1.012;
        } else if (isPressed) {
          targetY = 1;
        }
        break;
      case 'liquid-glass-spring':
        if (isHovered && !isPressed) {
          targetY = -2;
          targetScale = 1.014;
        }
        break;
      case 'cnc-micro-detent':
        if (isPressed) {
          targetY = 1.6;
        } else if (isHovered) {
          targetY = -0.8;
          targetScale = 1.005;
        }
        break;
      case 'velvet-cushion':
        if (isPressed) {
          targetY = 2.2;
        } else if (isHovered) {
          targetY = -1.2;
          targetScale = 1.008;
        }
        break;
      case 'rocker-tilt':
        if (isPressed) {
          targetRotateY = pointerCoords.normX * 8.5;
          targetRotateX = -pointerCoords.normY * 7.5;
        } else if (isHovered) {
          targetRotateY = pointerCoords.normX * 4.5;
          targetRotateX = -pointerCoords.normY * 4;
          targetY = -1.5;
        }
        break;
      case 'harmonic-hover-lift':
        if (isPressed) {
          targetY = 1.2;
        } else if (isHovered) {
          targetY = -3.5;
          targetScale = 1.018;
        }
        break;
    }
  }

  return (
    <motion.button
      ref={btnRef}
      type="button"
      disabled={disabled}
      aria-label={ariaLabel}
      onClick={onClick}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUpOnly}
      onPointerLeave={endPress}
      onPointerCancel={endPress}
      animate={{
        scale: targetScale,
        x: targetX,
        y: targetY,
        rotateX: targetRotateX,
        rotateY: targetRotateY,
      }}
      transition={{
        type: 'spring',
        stiffness: activeStiffness,
        damping: activeDamping,
        mass: activeMass,
      }}
      style={{
        borderRadius: `${dynamicRadius}px`,
        transformPerspective: effectiveMotionId === 'rocker-tilt' ? 640 : undefined,
        backdropFilter:
          effectiveMaterial === 'frosted-glass' || effectiveMaterial === 'shiny-glass'
            ? `blur(${depth.glassBlur}px)`
            : undefined,
        boxShadow: boxShadowStyle,
      }}
      className={`relative overflow-hidden select-none cursor-pointer transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:opacity-50 ${getMaterialClasses()} ${
        selected
          ? isDark
            ? 'ring-1 ring-emerald-300/70'
            : 'ring-1 ring-indigo-500/60'
          : ''
      } ${className}`}
    >
      {/* Illumination Layer 1: Cursor Radial Spotlight */}
      {effectiveIlluminationId === 'cursor-spotlight' && (
        <span
          aria-hidden="true"
          style={{
            opacity: isPressed ? 0.95 : isHovered ? 0.82 : 0.22,
            background: `radial-gradient(170px circle at ${pointerCoords.spotX}% ${pointerCoords.spotY}%, ${effectiveGlowColor}52, transparent 72%)`,
          }}
          className="pointer-events-none absolute inset-0 transition-opacity duration-150"
        />
      )}

      {/* Illumination Layer 2: Conic Fiber-Optic Border Beam */}
      {effectiveIlluminationId === 'conic-border-beam' && (
        <span
          aria-hidden="true"
          style={{
            padding: '1.5px',
            borderRadius: `${dynamicRadius}px`,
            WebkitMask:
              'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
            opacity: isPressed ? 1 : isHovered ? 0.95 : 0.65,
          }}
          className="pointer-events-none absolute inset-0 overflow-hidden transition-opacity duration-150"
        >
          <span
            style={{
              background: `conic-gradient(from 0deg, transparent 68%, ${effectiveGlowColor} 92%, #ffffff 100%)`,
            }}
            className="absolute left-1/2 top-1/2 w-[240%] aspect-square animate-border-beam"
          />
        </span>
      )}

      {/* Illumination Layer 3: Prism Specular Sweep */}
      {effectiveIlluminationId === 'prism-refraction-sweep' && (
        <span
          aria-hidden="true"
          style={{
            opacity: isPressed || isHovered ? 0.95 : 0.45,
            background: `linear-gradient(110deg, transparent 22%, ${effectiveGlowColor}38 44%, rgba(255,255,255,0.68) 50%, ${effectiveGlowColor}30 56%, transparent 78%)`,
          }}
          className="pointer-events-none absolute inset-y-0 -left-1/4 w-3/5 animate-prism-sweep"
        />
      )}

      {/* Illumination Layer 4: Subsurface Caustic Cloud */}
      {effectiveIlluminationId === 'subsurface-caustic' && (
        <span
          aria-hidden="true"
          style={{
            opacity: Math.min(1, 0.42 + (isHovered ? 0.25 : 0) + (isPressed ? 0.35 : 0) + holdIntensity * 0.4),
            background: `radial-gradient(85% 95% at 50% 110%, ${effectiveGlowColor}68 0%, ${effectiveGlowColor}22 52%, transparent 82%)`,
          }}
          className="pointer-events-none absolute inset-0 transition-opacity duration-150"
        />
      )}

      {/* Illumination Layer 5: Dual Horizon Fresnel Rim */}
      {effectiveIlluminationId === 'horizon-dual-rim' && (
        <>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute top-0 left-4 right-4 h-[1.5px] bg-gradient-to-r from-transparent via-white/90 to-transparent opacity-90"
          />
          <span
            aria-hidden="true"
            style={{
              opacity: isPressed ? 1 : isHovered ? 0.88 : 0.55,
              background: `linear-gradient(90deg, transparent 8%, ${effectiveGlowColor} 50%, transparent 92%)`,
            }}
            className="pointer-events-none absolute bottom-0 left-3 right-3 h-[2px] transition-opacity duration-150"
          />
        </>
      )}

      {/* Illumination Layer 6: Breathing Laser-Etched Halo */}
      {effectiveIlluminationId === 'breathing-etched-halo' && (
        <span
          aria-hidden="true"
          style={{
            background: `radial-gradient(65% 80% at 50% 50%, ${effectiveGlowColor}46 0%, transparent 76%)`,
          }}
          className="pointer-events-none absolute inset-0 animate-etch-breathe"
        />
      )}

      {/* Group Unification Indicator Bar (subtle top hairline) */}
      {isGroupUnified &&
        variant !== 'neumorphic-icon' &&
        effectiveIlluminationId !== 'horizon-dual-rim' && (
          <span
            aria-hidden="true"
            style={{ backgroundColor: effectiveGlowColor }}
            className="pointer-events-none absolute top-0 left-6 right-6 h-[1.5px] opacity-55"
          />
        )}

      <span className="relative z-10 flex items-center justify-between gap-3 w-full">
        <span className="flex items-center gap-3 min-w-0">
          {effectiveSymbol !== 'none' && variant !== 'neumorphic-icon' && (
            <EngravingGlyph
              symbol={effectiveSymbol}
              glowEnabled={engraving.glowEnabled}
              glowColor={effectiveGlowColor}
              glowIntensity={
                isPressed
                  ? Math.min(100, engraving.glowIntensity + 25)
                  : engraving.glowIntensity
              }
              etchDepth={engraving.etchDepth}
              className={
                variant === 'primary-cta'
                  ? 'text-white'
                  : isDark
                    ? 'text-emerald-200'
                    : 'text-indigo-900/85'
              }
            />
          )}
          <span className="flex flex-col items-start min-w-0 text-left">
            <span className="font-medium leading-tight truncate max-w-full">
              {children}
            </span>
            {subtitle && (
              <span
                className={`text-xs mt-0.5 truncate max-w-full ${
                  variant === 'primary-cta'
                    ? 'text-white/80'
                    : isDark
                      ? 'text-emerald-200/70'
                      : 'text-slate-500'
                }`}
              >
                {subtitle}
              </span>
            )}
          </span>
        </span>

        {selected && variant === 'glass-card' && (
          <span
            aria-label="Wybrano"
            className={`w-5 h-5 rounded-full flex items-center justify-center text-[11px] shrink-0 ${
              isDark
                ? 'bg-emerald-400 text-emerald-950'
                : 'bg-slate-900 text-white'
            }`}
          >
            ✓
          </span>
        )}
      </span>
    </motion.button>
  );
};
