import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  Check,
  FolderOpen,
  HardDriveDownload,
  ImagePlus,
  Layers,
  Palette,
  Plus,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import { hapticAudio } from '../lib/hapticAudioEngine';
import {
  FRONTEND_ELEMENT_SHADE_ORDER,
  FRONTEND_ELEMENT_SHADES,
  resolveElementShadeSpec,
} from '../lib/frontendElementShades';
import {
  createWorkingStateFromAssetUrl,
  readImageFileToWorkingState,
} from '../lib/localDiskWorkspace';
import {
  appendCatalogWidgetToNode,
  buildComponentsArrayFromWidgets,
  PROTOTYPE_ZONE_LABELS,
  resolvePrototypeWidgetsForNode,
  TACTILE_UI_CATALOG,
} from '../lib/tactileUiCatalog';
import {
  ElementShadeId,
  PrototypeDropZone,
  PrototypeScreenWidget,
} from '../types/studio';

const ZONE_OPTIONS: PrototypeDropZone[] = ['header', 'main', 'footer'];

export const StartWorkspaceSection: React.FC<{
  onEnterStudioTab: (tab: 'dashboard' | 'screens' | 'ui-library') => void;
}> = ({ onEnterStudioTab }) => {
  const {
    palette,
    depth,
    synth,
    haptic,
    patterns,
    activeScreenMap,
    setActiveScreenMap,
    activePreviewScreenId,
    setActivePreviewScreenId,
    localDiskConfig,
    updateLocalDiskConfig,
    selectLocalDiskDirectory,
    linkLocalDirectoryNameFallback,
    saveProjectToLocalDiskNow,
    workingFrontendImage,
    setWorkingFrontendImage,
    updateFrontendImageRegion,
    addFrontendImageRegion,
    removeFrontendImageRegion,
    composedElementShades,
    setElementCustomShade,
    activeModifiedElement,
    markElementAsActivelyModified,
    generatedElements,
    addAttachedPromptGraphic,
    generatePlanAndMatrixFromFile,
    mediaLibrary,
    pulseInteraction,
  } = useStudio();

  const [diskNotice, setDiskNotice] = useState<string | null>(null);
  const [savingDisk, setSavingDisk] = useState<boolean>(false);
  const [uploadingImage, setUploadingImage] = useState<boolean>(false);
  const [analyzingAiPlan, setAnalyzingAiPlan] = useState<boolean>(false);
  const [aiPlanBanner, setAiPlanBanner] = useState<string | null>(null);
  const [imgBroken, setImgBroken] = useState<boolean>(false);
  const [selectedQuickCatalogId, setSelectedQuickCatalogId] = useState<string>(
    TACTILE_UI_CATALOG[0]?.id || 'btn-primary-cta'
  );
  const [selectedQuickZone, setSelectedQuickZone] =
    useState<PrototypeDropZone>('main');

  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const folderFallbackInputRef = useRef<HTMLInputElement | null>(null);

  const isDark = palette === 'emerald-clinic';

  const cardSurfaceStyle: React.CSSProperties = {
    borderRadius: `${depth.borderRadius}px`,
    backdropFilter: `blur(${depth.glassBlur}px)`,
    backgroundColor: isDark
      ? `rgba(11, 34, 29, ${depth.glassOpacity})`
      : `rgba(255, 255, 255, ${depth.glassOpacity})`,
    boxShadow: isDark
      ? `0 ${depth.elevation}px ${depth.blur}px rgba(0,0,0,0.44)`
      : `0 ${depth.elevation}px ${depth.blur}px rgba(88, 76, 148, 0.12)`,
  };

  const activeScreen = useMemo(
    () =>
      activeScreenMap.nodes.find((n) => n.id === activePreviewScreenId) ||
      activeScreenMap.nodes[0],
    [activeScreenMap.nodes, activePreviewScreenId]
  );

  const screenWidgets = useMemo(
    () => (activeScreen ? resolvePrototypeWidgetsForNode(activeScreen) : []),
    [activeScreen]
  );

  const screenGeneratedElements = useMemo(
    () =>
      generatedElements.filter((el) => el.targetScreenId === activeScreen?.id),
    [generatedElements, activeScreen?.id]
  );

  const sampleImages = useMemo(
    () => mediaLibrary.filter((m) => m.mediaType === 'image' && m.src).slice(0, 3),
    [mediaLibrary]
  );

  const handleChooseLocalDiskFolder = async () => {
    setDiskNotice(null);
    const res = await selectLocalDiskDirectory();
    setDiskNotice(res.message);
  };

  const handleFallbackDirectorySelected = async (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const firstRel =
      (files[0] as File & { webkitRelativePath?: string }).webkitRelativePath || '';
    const folderName = firstRel.split('/')[0] || 'lokalny-katalog-projektu';
    linkLocalDirectoryNameFallback(folderName);
    setDiskNotice(
      `Powiązano lokalny katalog „${folderName}” (${files.length} plików w katalogu).`
    );

    // If the user's selected folder already contains an image and none is loaded yet, offer seamless load
    if (!workingFrontendImage) {
      const firstImage = Array.from(files).find((f) =>
        f.type.startsWith('image/')
      );
      if (firstImage) {
        try {
          const loaded = await readImageFileToWorkingState(firstImage);
          setWorkingFrontendImage(loaded);
          setImgBroken(false);
        } catch {
          // Ignore optional image preload error
        }
      }
    }
    e.target.value = '';
  };

  const handleManualSaveToDisk = async (forceDownload = false) => {
    setSavingDisk(true);
    setDiskNotice(null);
    try {
      const res = await saveProjectToLocalDiskNow(forceDownload);
      setDiskNotice(res.message);
    } finally {
      setSavingDisk(false);
    }
  };

  const handleUploadFrontendImageFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setDiskNotice('Wybierz plik graficzny (PNG, JPG lub WEBP) przedstawiający frontend.');
      return;
    }
    setUploadingImage(true);
    setImgBroken(false);
    try {
      const state = await readImageFileToWorkingState(file);
      setWorkingFrontendImage(state);
      // Also attach to persistent master prompt graphics for seamless AI generation
      addAttachedPromptGraphic({
        name: state.fileName,
        mimeType: state.mimeType,
        dataUrl: state.dataUrl,
        role: 'uklad-ekranu',
      });
      if (state.regions[0]) {
        markElementAsActivelyModified({
          id: state.regions[0].id,
          kind: 'region',
          label: state.regions[0].label,
          zone: state.regions[0].zone,
          screenId: activeScreen?.id,
          shadeId: state.regions[0].shadeId,
          sourceSurface: 'Obraz referencyjny frontendu',
        });
      }
      pulseInteraction(0.95);
    } catch (err) {
      setDiskNotice(
        err instanceof Error ? err.message : 'Nie udało się wczytać obrazu frontendu.'
      );
    } finally {
      setUploadingImage(false);
    }
  };

  const handleGenerateAiPlanFromFrontendImage = async () => {
    if (!workingFrontendImage) return;
    setAnalyzingAiPlan(true);
    setAiPlanBanner(null);
    try {
      const res = await generatePlanAndMatrixFromFile({
        fileName: workingFrontendImage.fileName,
        mimeType: workingFrontendImage.mimeType,
        fileSize: Math.round(workingFrontendImage.dataUrl.length * 0.75),
        base64Data: workingFrontendImage.dataUrl,
        projectGoal:
          'Odtwórz architekturę ekranów, sekcje i komponenty na podstawie wgranego obrazu frontendu.',
        targetType: 'website-and-webapp',
      });
      setAiPlanBanner(
        `Utworzono mapę „${res.mapProject.name}” (${res.mapProject.nodes.length} ekranów) na podstawie wgranego obrazu frontendu.`
      );
      hapticAudio.triggerPress(synth, haptic, patterns, { pitchSemitones: 6 });
    } catch (err) {
      setAiPlanBanner(
        err instanceof Error
          ? err.message
          : 'Nie udało się przeanalizować obrazu frontendu.'
      );
    } finally {
      setAnalyzingAiPlan(false);
    }
  };

  const handleUpdateWidget = (
    widget: PrototypeScreenWidget,
    index: number,
    patch: Partial<PrototypeScreenWidget>
  ) => {
    if (!activeScreen) return;
    const shadeSpec = resolveElementShadeSpec(
      widget.instanceId,
      composedElementShades,
      index
    );

    setActiveScreenMap((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node) => {
        if (node.id !== activeScreen.id) return node;
        const curr = resolvePrototypeWidgetsForNode(node);
        const updated = curr.map((w) =>
          w.instanceId === widget.instanceId ? { ...w, ...patch } : w
        );
        return {
          ...node,
          prototypeWidgets: updated,
          components: buildComponentsArrayFromWidgets(updated, node.components),
        };
      }),
    }));

    markElementAsActivelyModified({
      id: widget.instanceId,
      kind: 'widget',
      label: patch.label ?? widget.label,
      zone: patch.zone ?? widget.zone,
      screenId: activeScreen.id,
      shadeId: shadeSpec.id,
      sourceSurface: 'Kompozytor Odcieni (Strona Startowa)',
    });
    hapticAudio.triggerSliderTick(haptic, 0.5);
  };

  const handleAddQuickElement = () => {
    if (!activeScreen) return;
    const catalogItem =
      TACTILE_UI_CATALOG.find((c) => c.id === selectedQuickCatalogId) ||
      TACTILE_UI_CATALOG[0];
    if (!catalogItem) return;

    let addedInstanceId = '';
    let addedLabel = catalogItem.labelPl;

    setActiveScreenMap((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node) => {
        if (node.id !== activeScreen.id) return node;
        const updatedNode = appendCatalogWidgetToNode(
          node,
          catalogItem,
          selectedQuickZone
        );
        const list = updatedNode.prototypeWidgets || [];
        const newest = list[list.length - 1];
        if (newest) {
          addedInstanceId = newest.instanceId;
          addedLabel = newest.label;
        }
        return updatedNode;
      }),
    }));

    const nextIdx = screenWidgets.length;
    const assignedShade =
      FRONTEND_ELEMENT_SHADE_ORDER[
        nextIdx % FRONTEND_ELEMENT_SHADE_ORDER.length
      ];
    if (addedInstanceId) {
      setElementCustomShade(addedInstanceId, assignedShade);
      markElementAsActivelyModified({
        id: addedInstanceId,
        kind: 'widget',
        label: addedLabel,
        zone: selectedQuickZone,
        screenId: activeScreen.id,
        shadeId: assignedShade,
        sourceSurface: 'Dodano nowy element w Kompozytorze',
      });
    }
    hapticAudio.triggerPress(synth, haptic, patterns, { pitchSemitones: 4 });
    pulseInteraction(0.85);
  };

  return (
    <div
      onPaste={async (e) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        for (let i = 0; i < items.length; i++) {
          if (items[i].type.startsWith('image/')) {
            const f = items[i].getAsFile();
            if (f) {
              await handleUploadFrontendImageFile(f);
              break;
            }
          }
        }
      }}
      className="space-y-6"
    >
      {/* Hero Proposition & Primary Action Card */}
      <section
        style={cardSurfaceStyle}
        className="p-6 sm:p-7 border border-white/80 dark:border-emerald-400/20 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <div className="text-xs text-slate-500 dark:text-emerald-300/80 flex flex-wrap items-center gap-1.5">
              <span>Sekcja Startowa Projektu</span>
              <span aria-hidden="true">·</span>
              <span>Zapis Lokalny · Obraz Frontendu · Synchronizacja Odcieni</span>
            </div>
            <h1
              style={{ textWrap: 'balance' }}
              className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-emerald-50"
            >
              Skonfiguruj miejsce zapisu na dysku lokalnym i wgraj obraz frontendu do pracy
            </h1>
            <p className="text-sm text-slate-600 dark:text-emerald-100/80 leading-relaxed">
              Wskaż lokalny folder zapisu danych projektu, załaduj zrzut lub makietę frontendu,
              a następnie komponuj elementy w odrębnych odcieniach kolorystycznych z natychmiastowym
              podświetlaniem tym samym kolorem na żywym podglądzie obok.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onEnterStudioTab('dashboard')}
              className="min-h-[44px] px-5 py-2.5 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-emerald-400 text-white dark:text-emerald-950 hover:opacity-95 transition-opacity inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <span>Przejdź do Pulpitu Głównego</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Active Synchronized Color Status Bar */}
        {activeModifiedElement && (
          <div
            style={{
              backgroundColor: isDark
                ? FRONTEND_ELEMENT_SHADES[activeModifiedElement.shadeId].surfaceBgDark
                : FRONTEND_ELEMENT_SHADES[activeModifiedElement.shadeId].surfaceBgLight,
              borderColor:
                FRONTEND_ELEMENT_SHADES[activeModifiedElement.shadeId].activeBorderHex,
            }}
            className="p-3 rounded-2xl border flex flex-wrap items-center justify-between gap-3 text-xs"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                style={{
                  backgroundColor:
                    FRONTEND_ELEMENT_SHADES[activeModifiedElement.shadeId].badgeBgHex,
                  color:
                    FRONTEND_ELEMENT_SHADES[activeModifiedElement.shadeId].badgeTextHex,
                }}
                className="px-2.5 py-0.5 rounded-md font-semibold whitespace-nowrap shrink-0"
              >
                Odcień: {FRONTEND_ELEMENT_SHADES[activeModifiedElement.shadeId].shortNamePl}
              </span>
              <span className="font-medium text-slate-900 dark:text-emerald-50 truncate">
                Aktualnie modyfikowany na podglądzie: „{activeModifiedElement.label}” (
                {PROTOTYPE_ZONE_LABELS[activeModifiedElement.zone]})
              </span>
            </div>
            <button
              type="button"
              onClick={() => markElementAsActivelyModified(null)}
              className="text-[11px] underline text-slate-700 dark:text-emerald-100 cursor-pointer whitespace-nowrap"
            >
              Zakończ podświetlenie
            </button>
          </div>
        )}
      </section>

      {/* Step 01: Local Disk Storage Location Selector */}
      <section
        style={cardSurfaceStyle}
        className="p-6 border border-white/80 dark:border-emerald-400/20 space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500 dark:text-emerald-300/80 flex flex-wrap items-center gap-1.5">
              <span>Krok 1 z 3</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {localDiskConfig.lastSavedAt
                  ? `Ostatni zapis: ${localDiskConfig.lastSavedAt} (${localDiskConfig.savedFilesCount} plików)`
                  : 'Oczekuje na wybór folderu dysku'}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-emerald-50 mt-0.5">
              01. Miejsce zapisu danych projektu na lokalnym dysku
            </h2>
          </div>

          <span className="text-xs font-mono tabular-nums text-slate-600 dark:text-emerald-200/85">
            {localDiskConfig.directoryName
              ? `Katalog: ${localDiskConfig.directoryName}/${localDiskConfig.subFolderName}`
              : 'Nie wybrano jeszcze katalogu'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
          <div className="md:col-span-5 space-y-1.5">
            <label
              htmlFor="local-disk-subfolder-input"
              className="block text-xs font-medium text-slate-700 dark:text-emerald-100"
            >
              Nazwa podkatalogu projektu na dysku
            </label>
            <input
              id="local-disk-subfolder-input"
              type="text"
              value={localDiskConfig.subFolderName}
              onChange={(e) =>
                updateLocalDiskConfig({ subFolderName: e.target.value })
              }
              placeholder="aether-frontend-workspace"
              className="w-full h-10 px-3 rounded-xl text-xs font-mono bg-white/90 dark:bg-emerald-950/85 border border-slate-200/90 dark:border-emerald-400/25 text-slate-900 dark:text-emerald-50"
            />
          </div>

          <div className="md:col-span-7 flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={handleChooseLocalDiskFolder}
              className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 dark:bg-emerald-400 text-white dark:text-emerald-950 hover:opacity-95 inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <FolderOpen className="w-4 h-4 shrink-0" />
              <span>Wybierz folder na dysku</span>
            </button>

            {/* Fallback folder linker that also works in cross-origin preview iframes */}
            <input
              ref={folderFallbackInputRef}
              type="file"
              // @ts-expect-error webkitdirectory is standard across Chromium/Firefox/Safari
              webkitdirectory="true"
              directory=""
              multiple
              className="hidden"
              onChange={handleFallbackDirectorySelected}
            />
            <button
              type="button"
              onClick={() => folderFallbackInputRef.current?.click()}
              className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-medium bg-white/90 dark:bg-emerald-900/75 border border-slate-200/85 dark:border-emerald-400/25 text-slate-800 dark:text-emerald-50 hover:opacity-95 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5 shrink-0" />
              <span>Powiąż istniejący katalog</span>
            </button>

            <button
              type="button"
              disabled={savingDisk}
              onClick={() => handleManualSaveToDisk(false)}
              className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-emerald-800 text-white dark:text-emerald-50 hover:opacity-95 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap"
            >
              <HardDriveDownload className="w-3.5 h-3.5 shrink-0" />
              <span>{savingDisk ? 'Zapisywanie...' : 'Zapisz na dysku teraz'}</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-5 pt-1 text-xs text-slate-700 dark:text-emerald-100">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={localDiskConfig.autoSaveOnChange}
              onChange={(e) =>
                updateLocalDiskConfig({ autoSaveOnChange: e.target.checked })
              }
              className="rounded accent-indigo-600 dark:accent-emerald-400"
            />
            <span>Automatyczny zapis zmian na wybranym dysku lokalnym</span>
          </label>

          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={localDiskConfig.saveImagesAndTsx}
              onChange={(e) =>
                updateLocalDiskConfig({ saveImagesAndTsx: e.target.checked })
              }
              className="rounded accent-indigo-600 dark:accent-emerald-400"
            />
            <span>Zapisuj wgrany obraz frontendu, mapę odcieni i komponenty .tsx</span>
          </label>
        </div>

        {(diskNotice || localDiskConfig.statusNote) && (
          <div className="p-3 rounded-xl bg-white/75 dark:bg-emerald-950/65 border border-slate-200/80 dark:border-emerald-400/20 text-xs text-slate-700 dark:text-emerald-100 flex flex-wrap items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-300 shrink-0" />
              <span>{diskNotice || localDiskConfig.statusNote}</span>
            </span>
            {localDiskConfig.accessMode !== 'fs-handle-readwrite' && (
              <button
                type="button"
                onClick={() => handleManualSaveToDisk(true)}
                className="underline font-medium text-indigo-600 dark:text-emerald-300 cursor-pointer whitespace-nowrap"
              >
                Pobierz plik zapisu bezpośrednio
              </button>
            )}
          </div>
        )}
      </section>

      {/* Step 02: Upload Frontend Image & Interactive Shaded Region Overlay */}
      <section
        style={cardSurfaceStyle}
        className="p-6 border border-white/80 dark:border-emerald-400/20 space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500 dark:text-emerald-300/80 flex flex-wrap items-center gap-1.5">
              <span>Krok 2 z 3</span>
              <span aria-hidden="true">·</span>
              <span>
                {workingFrontendImage
                  ? `${workingFrontendImage.fileName} (${workingFrontendImage.widthPx}×${workingFrontendImage.heightPx} px)`
                  : 'PNG, JPG, WEBP lub wklejenie ze schowka Ctrl+V'}
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-emerald-50 mt-0.5">
              02. Obraz frontendu, nad którym pracujesz
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={imageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void handleUploadFrontendImageFile(file);
                  e.target.value = '';
                }
              }}
            />
            <button
              type="button"
              onClick={() => imageInputRef.current?.click()}
              disabled={uploadingImage}
              className="min-h-[40px] px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 dark:bg-emerald-400 text-white dark:text-emerald-950 hover:opacity-95 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <ImagePlus className="w-4 h-4 shrink-0" />
              <span>
                {workingFrontendImage ? 'Zmień obraz frontendu' : 'Wgraj obraz frontendu'}
              </span>
            </button>

            {workingFrontendImage && (
              <button
                type="button"
                disabled={analyzingAiPlan}
                onClick={handleGenerateAiPlanFromFrontendImage}
                className="min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold bg-white/90 dark:bg-emerald-900/75 border border-slate-200/85 dark:border-emerald-400/25 text-slate-900 dark:text-emerald-50 hover:opacity-95 inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {analyzingAiPlan
                    ? 'Analiza obrazu AI...'
                    : 'Zbuduj plan ekranów AI z obrazu'}
                </span>
              </button>
            )}
          </div>
        </div>

        {aiPlanBanner && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-900/45 border border-emerald-200 dark:border-emerald-400/30 text-xs text-emerald-900 dark:text-emerald-100">
            {aiPlanBanner}
          </div>
        )}

        {!workingFrontendImage ? (
          <div
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('Files')) e.preventDefault();
            }}
            onDrop={(e) => {
              const file = e.dataTransfer.files?.[0];
              if (file) {
                e.preventDefault();
                void handleUploadFrontendImageFile(file);
              }
            }}
            className="p-8 rounded-2xl border-2 border-dashed border-slate-300/90 dark:border-emerald-400/30 bg-white/55 dark:bg-emerald-950/40 text-center space-y-4"
          >
            <div className="space-y-1 max-w-lg mx-auto">
              <p className="text-sm font-semibold text-slate-900 dark:text-emerald-50">
                Upuść tutaj zrzut ekranu lub makietę frontendu (albo wklej Ctrl+V)
              </p>
              <p className="text-xs text-slate-500 dark:text-emerald-200/75">
                Po wgraniu obrazu aplikacja nałoży strefy kolorystyczne zsynchronizowane
                z komponowanymi elementami oraz z żywym podglądem modelu po prawej stronie.
              </p>
            </div>

            {sampleImages.length > 0 && (
              <div className="pt-2 space-y-2">
                <div className="text-[11px] text-slate-500 dark:text-emerald-300/80">
                  Lub wybierz gotowy wzorzec referencyjny z biblioteki studia:
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {sampleImages.map((sample) => (
                    <button
                      key={sample.id}
                      type="button"
                      onClick={async () => {
                        const state = await createWorkingStateFromAssetUrl({
                          title: sample.title,
                          src: sample.src,
                        });
                        setWorkingFrontendImage(state);
                        setImgBroken(false);
                        hapticAudio.triggerPress(synth, haptic, patterns);
                      }}
                      className="px-3 py-1.5 rounded-xl text-xs font-medium bg-white dark:bg-emerald-900/75 border border-slate-200/85 dark:border-emerald-400/25 text-slate-800 dark:text-emerald-50 hover:opacity-95 cursor-pointer whitespace-nowrap"
                    >
                      Załaduj wzorzec: {sample.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* Interactive Frontend Reference Canvas with Synchronized Colored Region Overlays */}
            <div className="relative rounded-2xl overflow-hidden border border-slate-300/80 dark:border-emerald-400/25 bg-slate-900">
              {!imgBroken ? (
                <img
                  src={workingFrontendImage.dataUrl}
                  alt={workingFrontendImage.fileName}
                  referrerPolicy="no-referrer"
                  onError={() => setImgBroken(true)}
                  className="w-full max-h-[420px] object-contain mx-auto block select-none"
                />
              ) : (
                <div className="h-56 flex items-center justify-center text-xs text-slate-300">
                  Podgląd obrazu referencyjnego ({workingFrontendImage.fileName})
                </div>
              )}

              {/* Shaded Regions Mapped onto the Uploaded Frontend Image */}
              <div className="absolute inset-0 pointer-events-none">
                {workingFrontendImage.regions.map((reg) => {
                  const shade = FRONTEND_ELEMENT_SHADES[reg.shadeId];
                  const isHighlighted =
                    activeModifiedElement?.id === reg.id ||
                    activeModifiedElement?.zone === reg.zone;
                  return (
                    <button
                      key={reg.id}
                      type="button"
                      onClick={() => {
                        markElementAsActivelyModified({
                          id: reg.id,
                          kind: 'region',
                          label: reg.label,
                          zone: reg.zone,
                          screenId: activeScreen?.id,
                          shadeId: reg.shadeId,
                          sourceSurface: 'Strefa na obrazie frontendu',
                        });
                        hapticAudio.triggerPress(synth, haptic, patterns, {
                          pitchSemitones: 2,
                        });
                      }}
                      style={{
                        left: `${reg.xPct}%`,
                        top: `${reg.yPct}%`,
                        width: `${reg.wPct}%`,
                        height: `${reg.hPct}%`,
                        borderColor: shade.activeBorderHex,
                        backgroundColor: isHighlighted
                          ? shade.activeOverlayFill
                          : 'rgba(15, 23, 42, 0.08)',
                        boxShadow: isHighlighted ? shade.activeGlowShadow : undefined,
                      }}
                      className="pointer-events-auto absolute rounded-xl border-2 transition-opacity flex items-start justify-between p-1.5 text-left cursor-pointer"
                    >
                      <span
                        style={{
                          backgroundColor: shade.badgeBgHex,
                          color: shade.badgeTextHex,
                        }}
                        className="px-2 py-0.5 rounded-md text-[10px] font-semibold shadow-sm truncate max-w-full"
                      >
                        {shade.shortNamePl}: {reg.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Region List & Quick Add Region */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-700 dark:text-emerald-100">
                Strefy na wgranym obrazie frontendu (kliknij strefę, aby podświetlić odpowiadające elementy na podglądzie):
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const nextShade =
                      FRONTEND_ELEMENT_SHADE_ORDER[
                        workingFrontendImage.regions.length %
                          FRONTEND_ELEMENT_SHADE_ORDER.length
                      ];
                    const created = addFrontendImageRegion({
                      label: `Nowa sekcja UI #${workingFrontendImage.regions.length + 1}`,
                      zone: 'main',
                      xPct: 12,
                      yPct: 30,
                      wPct: 45,
                      hPct: 24,
                      shadeId: nextShade,
                    });
                    markElementAsActivelyModified({
                      id: created.id,
                      kind: 'region',
                      label: created.label,
                      zone: created.zone,
                      screenId: activeScreen?.id,
                      shadeId: created.shadeId,
                      sourceSurface: 'Nowa strefa obrazu frontendu',
                    });
                  }}
                  className="px-3 py-1.5 rounded-xl text-xs font-medium bg-white/90 dark:bg-emerald-900/75 border border-slate-200/85 dark:border-emerald-400/25 text-slate-800 dark:text-emerald-50 inline-flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Dodaj strefę na obrazie</span>
                </button>
                <button
                  type="button"
                  onClick={() => setWorkingFrontendImage(null)}
                  className="px-2.5 py-1.5 rounded-xl text-xs text-rose-600 dark:text-rose-300 hover:underline cursor-pointer whitespace-nowrap"
                >
                  Usuń obraz
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {workingFrontendImage.regions.map((reg) => {
                const shade = FRONTEND_ELEMENT_SHADES[reg.shadeId];
                const isMod = activeModifiedElement?.id === reg.id;
                return (
                  <div
                    key={reg.id}
                    onClick={() =>
                      markElementAsActivelyModified({
                        id: reg.id,
                        kind: 'region',
                        label: reg.label,
                        zone: reg.zone,
                        screenId: activeScreen?.id,
                        shadeId: reg.shadeId,
                        sourceSurface: 'Edycja strefy obrazu',
                      })
                    }
                    style={{
                      backgroundColor: isDark
                        ? shade.surfaceBgDark
                        : shade.surfaceBgLight,
                      borderColor: isMod
                        ? shade.activeBorderHex
                        : isDark
                          ? shade.idleBorderDark
                          : shade.idleBorderLight,
                      boxShadow: isMod ? shade.activeGlowShadow : undefined,
                    }}
                    className="p-3 rounded-2xl border space-y-2 transition-shadow cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={reg.label}
                        aria-label="Nazwa strefy obrazu"
                        onChange={(e) => {
                          updateFrontendImageRegion(reg.id, {
                            label: e.target.value,
                          });
                          markElementAsActivelyModified({
                            id: reg.id,
                            kind: 'region',
                            label: e.target.value,
                            zone: reg.zone,
                            screenId: activeScreen?.id,
                            shadeId: reg.shadeId,
                            sourceSurface: 'Edycja nazwy strefy obrazu',
                          });
                        }}
                        className="flex-1 min-w-0 h-7 px-2 rounded-lg text-xs font-semibold bg-white/85 dark:bg-emerald-950/80 border border-slate-200/70 dark:border-emerald-400/20 text-slate-900 dark:text-emerald-50"
                      />
                      <select
                        aria-label="Powiązana strefa ekranu"
                        value={reg.zone}
                        onChange={(e) => {
                          const z = e.target.value as PrototypeDropZone;
                          updateFrontendImageRegion(reg.id, { zone: z });
                          markElementAsActivelyModified({
                            id: reg.id,
                            kind: 'region',
                            label: reg.label,
                            zone: z,
                            screenId: activeScreen?.id,
                            shadeId: reg.shadeId,
                            sourceSurface: 'Zmiana strefy docelowej obrazu',
                          });
                        }}
                        className="h-7 px-2 rounded-lg text-[11px] bg-white/85 dark:bg-emerald-950/80 border border-slate-200/70 dark:border-emerald-400/20 text-slate-800 dark:text-emerald-100"
                      >
                        {ZONE_OPTIONS.map((z) => (
                          <option key={z} value={z}>
                            {PROTOTYPE_ZONE_LABELS[z]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFrontendImageRegion(reg.id);
                        }}
                        aria-label={`Usuń strefę ${reg.label}`}
                        className="p-1 text-slate-500 hover:text-rose-600 dark:text-emerald-200/75 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-1">
                        {FRONTEND_ELEMENT_SHADE_ORDER.map((sId) => {
                          const sSpec = FRONTEND_ELEMENT_SHADES[sId];
                          const selected = reg.shadeId === sId;
                          return (
                            <button
                              key={sId}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateFrontendImageRegion(reg.id, { shadeId: sId });
                                markElementAsActivelyModified({
                                  id: reg.id,
                                  kind: 'region',
                                  label: reg.label,
                                  zone: reg.zone,
                                  screenId: activeScreen?.id,
                                  shadeId: sId,
                                  sourceSurface: 'Zmiana odcienia strefy',
                                });
                              }}
                              title={sSpec.labelPl}
                              style={{ backgroundColor: sSpec.badgeBgHex }}
                              className={`w-5 h-5 rounded-md cursor-pointer transition-transform ${
                                selected ? 'ring-2 ring-offset-1 ring-slate-900 dark:ring-white scale-110' : 'opacity-70 hover:opacity-100'
                              }`}
                            />
                          );
                        })}
                      </div>

                      <span className="font-mono tabular-nums text-slate-600 dark:text-emerald-200/80">
                        X:{reg.xPct}% Y:{reg.yPct}% · {reg.wPct}×{reg.hPct}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* Step 03: Multi-Shade Composed Elements Matrix Synchronized Live with Preview */}
      <section
        style={cardSurfaceStyle}
        className="p-6 border border-white/80 dark:border-emerald-400/20 space-y-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500 dark:text-emerald-300/80 flex flex-wrap items-center gap-1.5">
              <span>Krok 3 z 3</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {screenWidgets.length + screenGeneratedElements.length} komponowanych elementów na ekranie
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-slate-900 dark:text-emerald-50 mt-0.5">
              03. Komponowane elementy w różnych odcieniach z synchronizacją na podglądzie
            </h2>
            <p className="text-xs text-slate-600 dark:text-emerald-100/75 mt-1">
              Każdy komponowany element posiada własny odcień powierzchni frontendu. Kliknięcie lub
              edycja dowolnego parametru natychmiast zaznacza ten sam element identycznym kolorem
              na podglądzie modelu frontendu.
            </p>
          </div>

          <select
            aria-label="Wybierz ekran do kompozycji odcieni"
            value={activeScreen?.id || ''}
            onChange={(e) => setActivePreviewScreenId(e.target.value)}
            className="h-9 px-3 rounded-xl text-xs font-medium bg-white/90 dark:bg-emerald-950/85 border border-slate-200/85 dark:border-emerald-400/25 text-slate-900 dark:text-emerald-50 cursor-pointer"
          >
            {activeScreenMap.nodes.map((node, i) => (
              <option key={node.id} value={node.id}>
                Ekran {i + 1}: {node.title}
              </option>
            ))}
          </select>
        </div>

        {/* Quick Add Composed Element Bar */}
        <div className="p-3.5 rounded-2xl bg-white/70 dark:bg-emerald-950/55 border border-slate-200/80 dark:border-emerald-400/20 flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-medium text-slate-700 dark:text-emerald-100 inline-flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5" />
            <span>Skomponuj nowy element na ekranie:</span>
          </span>

          <select
            aria-label="Wybierz komponent z katalogu"
            value={selectedQuickCatalogId}
            onChange={(e) => setSelectedQuickCatalogId(e.target.value)}
            className="h-9 px-2.5 rounded-xl text-xs bg-white dark:bg-emerald-950 border border-slate-200/85 dark:border-emerald-400/25 text-slate-900 dark:text-emerald-50 max-w-[240px]"
          >
            {TACTILE_UI_CATALOG.map((item) => (
              <option key={item.id} value={item.id}>
                {item.labelPl}
              </option>
            ))}
          </select>

          <select
            aria-label="Docelowa strefa osadzenia"
            value={selectedQuickZone}
            onChange={(e) => setSelectedQuickZone(e.target.value as PrototypeDropZone)}
            className="h-9 px-2.5 rounded-xl text-xs bg-white dark:bg-emerald-950 border border-slate-200/85 dark:border-emerald-400/25 text-slate-900 dark:text-emerald-50"
          >
            {ZONE_OPTIONS.map((z) => (
              <option key={z} value={z}>
                {PROTOTYPE_ZONE_LABELS[z]}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleAddQuickElement}
            className="min-h-[36px] px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 dark:bg-emerald-400 text-white dark:text-emerald-950 hover:opacity-95 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Dodaj i przypisz odcień</span>
          </button>
        </div>

        {/* Distinctly Shaded Composed Elements Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {screenGeneratedElements.map((genEl, idx) => {
            const shade = resolveElementShadeSpec(
              genEl.id,
              composedElementShades,
              idx
            );
            const isActivelyMod = activeModifiedElement?.id === genEl.id;

            return (
              <div
                key={genEl.id}
                onClick={() =>
                  markElementAsActivelyModified({
                    id: genEl.id,
                    kind: 'generated',
                    label: genEl.name,
                    zone: genEl.targetZone,
                    screenId: genEl.targetScreenId,
                    shadeId: shade.id,
                    sourceSurface: 'Karta wygenerowanego modułu .tsx',
                  })
                }
                style={{
                  backgroundColor: isDark
                    ? shade.surfaceBgDark
                    : shade.surfaceBgLight,
                  borderColor: isActivelyMod
                    ? shade.activeBorderHex
                    : isDark
                      ? shade.idleBorderDark
                      : shade.idleBorderLight,
                  boxShadow: isActivelyMod ? shade.activeGlowShadow : undefined,
                }}
                className="p-4 rounded-2xl border space-y-3 transition-shadow cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-600 dark:text-emerald-200/85 flex items-center gap-1.5">
                      <span
                        style={{
                          backgroundColor: shade.badgeBgHex,
                          color: shade.badgeTextHex,
                        }}
                        className="px-2 py-0.5 rounded font-semibold"
                      >
                        {shade.shortNamePl}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono truncate">{genEl.fileName}</span>
                    </div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-emerald-50 mt-1 truncate">
                      {genEl.headline || genEl.name}
                    </h3>
                  </div>

                  {isActivelyMod && (
                    <span
                      style={{
                        backgroundColor: shade.badgeBgHex,
                        color: shade.badgeTextHex,
                      }}
                      className="px-2 py-0.5 rounded-md text-[10px] font-semibold whitespace-nowrap shrink-0"
                    >
                      Modyfikowany
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-slate-600 dark:text-emerald-200/80" />
                    {FRONTEND_ELEMENT_SHADE_ORDER.map((sId) => {
                      const sSpec = FRONTEND_ELEMENT_SHADES[sId];
                      return (
                        <button
                          key={sId}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setElementCustomShade(genEl.id, sId);
                            markElementAsActivelyModified({
                              id: genEl.id,
                              kind: 'generated',
                              label: genEl.name,
                              zone: genEl.targetZone,
                              screenId: genEl.targetScreenId,
                              shadeId: sId,
                              sourceSurface: 'Zmiana odcienia modułu .tsx',
                            });
                          }}
                          title={sSpec.labelPl}
                          style={{ backgroundColor: sSpec.badgeBgHex }}
                          className={`w-5 h-5 rounded-md cursor-pointer ${
                            shade.id === sId
                              ? 'ring-2 ring-offset-1 ring-slate-900 dark:ring-white scale-110'
                              : 'opacity-70 hover:opacity-100'
                          }`}
                        />
                      );
                    })}
                  </div>
                  <span className="text-[11px] font-mono text-slate-700 dark:text-emerald-200">
                    {PROTOTYPE_ZONE_LABELS[genEl.targetZone]}
                  </span>
                </div>
              </div>
            );
          })}

          {screenWidgets.map((widget, idx) => {
            const shade = resolveElementShadeSpec(
              widget.instanceId,
              composedElementShades,
              idx + screenGeneratedElements.length
            );
            const isActivelyMod = activeModifiedElement?.id === widget.instanceId;

            return (
              <div
                key={widget.instanceId}
                onClick={() =>
                  markElementAsActivelyModified({
                    id: widget.instanceId,
                    kind: 'widget',
                    label: widget.label,
                    zone: widget.zone,
                    screenId: activeScreen?.id,
                    shadeId: shade.id,
                    sourceSurface: 'Kompozytor elementów (Strona Startowa)',
                  })
                }
                style={{
                  backgroundColor: isDark
                    ? shade.surfaceBgDark
                    : shade.surfaceBgLight,
                  borderColor: isActivelyMod
                    ? shade.activeBorderHex
                    : isDark
                      ? shade.idleBorderDark
                      : shade.idleBorderLight,
                  boxShadow: isActivelyMod ? shade.activeGlowShadow : undefined,
                }}
                className="p-4 rounded-2xl border space-y-3 transition-shadow cursor-pointer"
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    style={{
                      backgroundColor: shade.badgeBgHex,
                      color: shade.badgeTextHex,
                    }}
                    className="px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap"
                  >
                    Odcień: {shade.shortNamePl}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {isActivelyMod && (
                      <span
                        style={{
                          backgroundColor: shade.badgeBgHex,
                          color: shade.badgeTextHex,
                        }}
                        className="px-2 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap"
                      >
                        Modyfikowany teraz
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUpdateWidget(widget, idx, {
                          spanCols: widget.spanCols === 2 ? 1 : 2,
                        });
                      }}
                      className="px-2 py-0.5 rounded text-[11px] font-mono tabular-nums bg-white/80 dark:bg-emerald-950/80 border border-slate-200/75 dark:border-emerald-400/20 text-slate-800 dark:text-emerald-100 cursor-pointer"
                    >
                      {widget.spanCols === 2 ? '2 kol.' : '1 kol.'}
                    </button>
                  </div>
                </div>

                {/* Inline Label & Zone Editor (modifying immediately highlights on preview in the same color) */}
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <input
                    type="text"
                    value={widget.label}
                    aria-label={`Etykieta elementu ${widget.label}`}
                    onFocus={() =>
                      markElementAsActivelyModified({
                        id: widget.instanceId,
                        kind: 'widget',
                        label: widget.label,
                        zone: widget.zone,
                        screenId: activeScreen?.id,
                        shadeId: shade.id,
                        sourceSurface: 'Edycja tekstu elementu',
                      })
                    }
                    onChange={(e) =>
                      handleUpdateWidget(widget, idx, { label: e.target.value })
                    }
                    className="sm:col-span-8 h-8 px-2.5 rounded-xl text-xs font-medium bg-white/90 dark:bg-emerald-950/85 border border-slate-200/80 dark:border-emerald-400/25 text-slate-900 dark:text-emerald-50"
                  />

                  <select
                    aria-label="Strefa elementu"
                    value={widget.zone}
                    onChange={(e) =>
                      handleUpdateWidget(widget, idx, {
                        zone: e.target.value as PrototypeDropZone,
                      })
                    }
                    className="sm:col-span-4 h-8 px-2 rounded-xl text-[11px] bg-white/90 dark:bg-emerald-950/85 border border-slate-200/80 dark:border-emerald-400/25 text-slate-800 dark:text-emerald-100"
                  >
                    {ZONE_OPTIONS.map((z) => (
                      <option key={z} value={z}>
                        {PROTOTYPE_ZONE_LABELS[z]}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Shade Picker Swatches */}
                <div className="flex items-center justify-between gap-2 pt-0.5">
                  <div className="flex items-center gap-1.5">
                    {(FRONTEND_ELEMENT_SHADE_ORDER as ElementShadeId[]).map((sId) => {
                      const sSpec = FRONTEND_ELEMENT_SHADES[sId];
                      return (
                        <button
                          key={sId}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setElementCustomShade(widget.instanceId, sId);
                            markElementAsActivelyModified({
                              id: widget.instanceId,
                              kind: 'widget',
                              label: widget.label,
                              zone: widget.zone,
                              screenId: activeScreen?.id,
                              shadeId: sId,
                              sourceSurface: 'Wybór odcienia elementu',
                            });
                          }}
                          title={sSpec.labelPl}
                          style={{ backgroundColor: sSpec.badgeBgHex }}
                          className={`w-5 h-5 rounded-md cursor-pointer transition-transform ${
                            shade.id === sId
                              ? 'ring-2 ring-offset-1 ring-slate-900 dark:ring-white scale-110'
                              : 'opacity-70 hover:opacity-100'
                          }`}
                        />
                      );
                    })}
                  </div>
                  <span className="text-[11px] text-slate-600 dark:text-emerald-200/80 font-mono">
                    {widget.componentName}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
