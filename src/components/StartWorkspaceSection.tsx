import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  ClipboardPaste,
  Crosshair,
  FileText,
  FolderOpen,
  HardDriveDownload,
  ImagePlus,
  Layers,
  Loader2,
  Lock,
  Palette,
  Plus,
  RefreshCw,
  RotateCcw,
  ScanEye,
  Server,
  ShieldCheck,
  Sparkles,
  Square,
  Trash2,
  Unlock,
  Upload,
} from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import { hapticAudio } from '../lib/hapticAudioEngine';
import {
  FRONTEND_ELEMENT_SHADE_ORDER,
  FRONTEND_ELEMENT_SHADES,
} from '../lib/frontendElementShades';
import {
  createWorkingStateFromAssetUrl,
  readImageFileToWorkingState,
} from '../lib/localDiskWorkspace';
import { studioApiFetch } from '../lib/offlineStudioEngines';
import {
  appendCatalogWidgetToNode,
  buildComponentsArrayFromWidgets,
  PROTOTYPE_ZONE_LABELS,
  resolvePrototypeWidgetsForNode,
  TACTILE_UI_CATALOG,
} from '../lib/tactileUiCatalog';
import {
  DetectedFrontendButton,
  ElementShadeId,
  FrontendImageButtonAnalysis,
  FrontendStyleReferenceImage,
  PrototypeDropZone,
  PrototypeScreenWidget,
  StyleReferenceRole,
  WorkingFrontendImageState,
} from '../types/studio';

const ZONE_OPTIONS: PrototypeDropZone[] = ['header', 'main', 'footer'];

const ROLE_LABELS: Record<DetectedFrontendButton['role'], string> = {
  'primary-cta': 'CTA główny',
  'secondary-action': 'Akcja pomocnicza',
  'nav-tab': 'Zakładka / Nawigacja',
  'toggle-slider': 'Przełącznik / Suwak',
  'icon-control': 'Ikona sterująca',
};

const ROLE_OPTIONS: DetectedFrontendButton['role'][] = [
  'primary-cta',
  'secondary-action',
  'nav-tab',
  'toggle-slider',
  'icon-control',
];

const WEBSITE_GUIDELINE_PRESETS: Array<{ label: string; text: string }> = [
  {
    label: 'Siatka 12 kol. 1440px',
    text: 'Układ oparty o siatkę 12 kolumn (1440px) z czystym marginesem i wyraźną hierarchią nagłówków.',
  },
  {
    label: 'Matowe szkło + głębia 3D',
    text: 'Powierzchnie z matowego szkła (frosted glass), miękkie wielowarstwowe cienie i subtelna głębia optyczna.',
  },
  {
    label: 'Kontrast WCAG AA',
    text: 'Wysoki kontrast etykiet przycisków i tekstów (minimum 4.5:1), brak nakładania się typografii na tło.',
  },
  {
    label: 'Wyraźna hierarchia CTA',
    text: 'Główny przycisk akcji wyróżniony kolorem akcentowym, przyciski pomocnicze w stonowanym obrysie.',
  },
  {
    label: 'Styl minimalistyczny',
    text: 'Minimalistyczna, spokojna estetyka bez zbędnych ozdobników, dużo światła i oddechu wokół komponentów.',
  },
];

const STYLE_REF_ROLE_LABELS: Record<StyleReferenceRole, string> = {
  'styl-obrazu': 'Styl obrazu',
  'glebia-swiatlo': 'Głębia i światło',
  'tematyka-klimat': 'Tematyka i klimat',
  'kompozycja-ui': 'Kompozycja UI',
};

const DEFAULT_STYLE_ROLE_CYCLE: StyleReferenceRole[] = [
  'styl-obrazu',
  'glebia-swiatlo',
  'tematyka-klimat',
  'kompozycja-ui',
  'styl-obrazu',
];

function getShadeSpec(shadeId: ElementShadeId | undefined, fallbackIdx = 0) {
  if (shadeId && FRONTEND_ELEMENT_SHADES[shadeId]) {
    return FRONTEND_ELEMENT_SHADES[shadeId];
  }
  const id = FRONTEND_ELEMENT_SHADE_ORDER[fallbackIdx % FRONTEND_ELEMENT_SHADE_ORDER.length];
  return FRONTEND_ELEMENT_SHADES[id];
}

async function compressStyleReferenceFile(
  file: File,
  role: StyleReferenceRole,
  idx: number
): Promise<FrontendStyleReferenceImage | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onerror = () => resolve(null);
    reader.onload = () => {
      const rawDataUrl = String(reader.result || '');
      if (!rawDataUrl) {
        resolve(null);
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 768;
          const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
          const targetW = Math.max(1, Math.round((img.width || 640) * scale));
          const targetH = Math.max(1, Math.round((img.height || 400) * scale));
          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve({
              id: `style_ref_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
              name: file.name,
              mimeType: file.type || 'image/jpeg',
              dataUrl: rawDataUrl,
              role,
              sizeKb: Math.max(1, Math.round(rawDataUrl.length / 1370)),
            });
            return;
          }
          ctx.drawImage(img, 0, 0, targetW, targetH);
          const compressed = canvas.toDataURL('image/jpeg', 0.84);
          resolve({
            id: `style_ref_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            mimeType: 'image/jpeg',
            dataUrl: compressed,
            role,
            sizeKb: Math.max(1, Math.round(compressed.length / 1370)),
          });
        } catch {
          resolve({
            id: `style_ref_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            mimeType: file.type || 'image/jpeg',
            dataUrl: rawDataUrl,
            role,
            sizeKb: Math.max(1, Math.round(rawDataUrl.length / 1370)),
          });
        }
      };
      img.onerror = () => resolve(null);
      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  });
}

async function loadAssetUrlAsStyleRef(
  assetUrl: string,
  title: string,
  role: StyleReferenceRole,
  idx: number
): Promise<FrontendStyleReferenceImage | null> {
  try {
    const working = await createWorkingStateFromAssetUrl({
      src: assetUrl,
      title,
    });
    return {
      id: `style_ref_sample_${Date.now()}_${idx}`,
      name: working.fileName,
      mimeType: working.mimeType || 'image/jpeg',
      dataUrl: working.dataUrl,
      role,
      sizeKb: working.compressedSizeKb || 80,
    };
  } catch {
    return null;
  }
}

export const StartWorkspaceSection: React.FC<{
  onEnterStudioTab: (tab: 'dashboard' | 'screens' | 'ui-library' | 'gemini') => void;
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
    setPendingImageGeneratorDraft,
    userGraphicPrompt,
    setUserGraphicPrompt,
    userGraphicPromptFileName,
    setUserGraphicPromptFileName,
    interactiveElementsApproved,
    setInteractiveElementsApproved,
    frontendButtonAnalysis,
    setFrontendButtonAnalysis,
    websiteBuildGuidelines,
    setWebsiteBuildGuidelines,
    frontendStyleReferences,
    addFrontendStyleReferences,
    removeFrontendStyleReference,
    updateFrontendStyleReferenceRole,
    clearFrontendStyleReferences,
    preparedFrontendReady,
    setPreparedFrontendReady,
    applyPreparedFrontendToWorkspace,
    addMediaAsset,
    setLocalhostModalOpen,
    zeroLimitLocalMode,
    setZeroLimitLocalMode,
    mediaLibrary,
    pulseInteraction,
  } = useStudio();

  // Step 1: Proposed graphic + Mandatory Prompt Upload/Input
  const [proposedImage, setProposedImage] = useState<WorkingFrontendImageState | null>(
    () => workingFrontendImage
  );
  const [uploadingProposed, setUploadingProposed] = useState(false);
  const [dragOverImage, setDragOverImage] = useState(false);
  const [dragOverPrompt, setDragOverPrompt] = useState(false);
  const [step1Error, setStep1Error] = useState<string | null>(null);
  const [promptRequiredBanner, setPromptRequiredBanner] = useState(false);
  const [previousPromptBackup, setPreviousPromptBackup] = useState<string>('');

  // Step 2: AI Analysis + Manual Confirmation of Interactive Elements
  const [analyzingButtons, setAnalyzingButtons] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [reviewButtons, setReviewButtons] = useState<DetectedFrontendButton[]>(
    () => frontendButtonAnalysis?.detectedButtons || []
  );
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);
  const [manualAddMode, setManualAddMode] = useState(false);
  const [editableAnalysisPrompt, setEditableAnalysisPrompt] = useState<string>(
    () => frontendButtonAnalysis?.generatedImagePrompt || ''
  );

  // Step 3: Embedded Image Generator + Guidelines + 3-5 Style References
  const [generatorPrompt, setGeneratorPrompt] = useState<string>(
    () => frontendButtonAnalysis?.generatedImagePrompt || ''
  );
  const [promptPastedBadge, setPromptPastedBadge] = useState(false);
  const [generatorModel, setGeneratorModel] = useState<
    'gemini-nano-banana-2.1' | 'gemini-3.1-flash-lite-image' | 'gemini-3-pro-image-preview'
  >('gemini-nano-banana-2.1');
  const [generatorAspect, setGeneratorAspect] = useState<'16:9' | '4:3' | '1:1' | '9:16'>('16:9');
  const [generatingFrontendImg, setGeneratingFrontendImg] = useState(false);
  const [generatorError, setGeneratorError] = useState<string | null>(null);
  const [generatedPreparedImage, setGeneratedPreparedImage] = useState<string | null>(null);
  const [uploadingStyleRefs, setUploadingStyleRefs] = useState(false);
  const [styleRefDragOver, setStyleRefDragOver] = useState(false);

  // Step 4: Interactive Frontend Work
  const [activeRegionId, setActiveRegionId] = useState<string | null>(null);
  const [quickAddZone, setQuickAddZone] = useState<PrototypeDropZone>('main');

  // Optional local disk panel (collapsed by default)
  const [diskPanelOpen, setDiskPanelOpen] = useState(false);
  const [diskFeedback, setDiskFeedback] = useState<string | null>(null);
  const [diskBusy, setDiskBusy] = useState(false);
  const [fallbackFolderInput, setFallbackFolderInput] = useState(
    localDiskConfig.directoryName || 'Aether-Studio-Projekt'
  );

  // Refs
  const step1ImageInputRef = useRef<HTMLInputElement | null>(null);
  const step1PromptInputRef = useRef<HTMLInputElement | null>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const styleRefsInputRef = useRef<HTMLInputElement | null>(null);
  const step2Ref = useRef<HTMLElement | null>(null);
  const step3Ref = useRef<HTMLElement | null>(null);
  const step4Ref = useRef<HTMLElement | null>(null);
  const reviewImageRef = useRef<HTMLImageElement | null>(null);

  const isDark = palette === 'emerald-clinic';

  const playStudioClick = (intensityScale = 0.7) => {
    hapticAudio.triggerPress(synth, haptic, patterns, { intensityScale });
  };

  // Keep reviewButtons synced when restored from snapshot/storage
  useEffect(() => {
    if (frontendButtonAnalysis?.detectedButtons && reviewButtons.length === 0) {
      setReviewButtons(frontendButtonAnalysis.detectedButtons);
      setEditableAnalysisPrompt(frontendButtonAnalysis.generatedImagePrompt || '');
    }
  }, [frontendButtonAnalysis, reviewButtons.length]);

  const activeProposed = proposedImage || workingFrontendImage;
  const trimmedUserPrompt = userGraphicPrompt.trim();
  const isPromptValid = trimmedUserPrompt.length >= 5;
  const step1Complete = Boolean(activeProposed && isPromptValid);
  const confirmedButtons = useMemo(
    () => reviewButtons.filter((b) => Boolean(b.confirmed)),
    [reviewButtons]
  );
  const reviewCounts = useMemo(
    () => ({
      total: reviewButtons.length,
      confirmed: confirmedButtons.length,
      header: reviewButtons.filter((b) => b.zone === 'header').length,
      main: reviewButtons.filter((b) => b.zone === 'main').length,
      footer: reviewButtons.filter((b) => b.zone === 'footer').length,
    }),
    [reviewButtons, confirmedButtons]
  );
  const step2Complete = Boolean(
    step1Complete &&
      frontendButtonAnalysis &&
      interactiveElementsApproved &&
      confirmedButtons.length > 0
  );
  const step3Unlocked = step2Complete;
  const step4Unlocked = Boolean(step2Complete && preparedFrontendReady && workingFrontendImage);

  const selectedReviewButton = useMemo(
    () => reviewButtons.find((b) => b.id === selectedReviewId) || null,
    [reviewButtons, selectedReviewId]
  );

  // Current screen widgets for Step 4
  const activeScreenNode = useMemo(() => {
    return (
      activeScreenMap.nodes.find((n) => n.id === activePreviewScreenId) ||
      activeScreenMap.nodes[0] ||
      null
    );
  }, [activeScreenMap.nodes, activePreviewScreenId]);

  const activeWidgets = useMemo(
    () => (activeScreenNode ? resolvePrototypeWidgetsForNode(activeScreenNode) : []),
    [activeScreenNode]
  );

  const sampleMediaImages = useMemo(
    () => mediaLibrary.filter((m) => m.mediaType === 'image').slice(0, 6),
    [mediaLibrary]
  );

  const activeShadeSpec = activeModifiedElement
    ? FRONTEND_ELEMENT_SHADES[activeModifiedElement.shadeId]
    : null;

  // =========================================================================
  // STEP 1: Upload Proposed Graphic -> AUTOMATICALLY REQUIRE PROMPT EVERY TIME
  // =========================================================================
  const resetAfterNewGraphicUpload = (nextImage: WorkingFrontendImageState) => {
    if (userGraphicPrompt.trim().length > 0) {
      setPreviousPromptBackup(userGraphicPrompt.trim());
    }
    setProposedImage(nextImage);
    setWorkingFrontendImage(nextImage);
    // Automatically require a fresh prompt whenever a graphic is uploaded
    setUserGraphicPrompt('');
    setUserGraphicPromptFileName(null);
    setPromptRequiredBanner(true);

    // Lock downstream steps until prompt + analysis + manual confirmation are completed
    setFrontendButtonAnalysis(null);
    setReviewButtons([]);
    setSelectedReviewId(null);
    setManualAddMode(false);
    setInteractiveElementsApproved(false);
    setPreparedFrontendReady(false);
    setGeneratedPreparedImage(null);
    setEditableAnalysisPrompt('');
    setGeneratorPrompt('');
    setAnalysisError(null);
    setGeneratorError(null);
    setStep1Error(null);

    playStudioClick(0.72);
    pulseInteraction(0.42);

    // Automatically focus prompt input right beside the uploaded graphic
    setTimeout(() => {
      promptTextareaRef.current?.focus();
    }, 80);
  };

  const handleProposedFileUpload = async (file: File) => {
    setStep1Error(null);
    setUploadingProposed(true);
    try {
      const next = await readImageFileToWorkingState(file);
      resetAfterNewGraphicUpload(next);
    } catch (err) {
      setStep1Error(
        err instanceof Error ? err.message : 'Nie udało się wczytać wybranego pliku obrazu.'
      );
    } finally {
      setUploadingProposed(false);
    }
  };

  const handleLoadSampleProposed = async (src: string, title: string) => {
    setStep1Error(null);
    setUploadingProposed(true);
    try {
      const next = await createWorkingStateFromAssetUrl({ src, title });
      resetAfterNewGraphicUpload(next);
    } catch (err) {
      setStep1Error(
        err instanceof Error ? err.message : 'Nie udało się załadować szablonu grafiki.'
      );
    } finally {
      setUploadingProposed(false);
    }
  };

  const handleStep1Paste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) {
          e.preventDefault();
          void handleProposedFileUpload(file);
          return;
        }
      }
    }
  };

  const handlePromptFileUpload = async (file: File) => {
    setStep1Error(null);
    try {
      const rawText = await file.text();
      let extracted = rawText.trim();
      if (file.name.toLowerCase().endsWith('.json')) {
        try {
          const parsed = JSON.parse(rawText) as Record<string, unknown>;
          const candidate =
            parsed.prompt ||
            parsed.masterPrompt ||
            parsed.description ||
            parsed.text ||
            parsed.brief;
          if (typeof candidate === 'string' && candidate.trim()) {
            extracted = candidate.trim();
          }
        } catch {
          // Keep raw text if JSON cannot be parsed cleanly
        }
      }
      if (!extracted) {
        setStep1Error(`Plik „${file.name}” jest pusty — wybierz plik z treścią promptu.`);
        return;
      }
      setUserGraphicPrompt(extracted);
      setUserGraphicPromptFileName(file.name);
      setPromptRequiredBanner(false);
      if (interactiveElementsApproved) {
        setInteractiveElementsApproved(false);
        setPreparedFrontendReady(false);
      }
      playStudioClick(0.65);
    } catch {
      setStep1Error(`Nie udało się odczytać pliku promptu „${file.name}”.`);
    }
  };

  const handlePromptTextChange = (nextVal: string) => {
    setUserGraphicPrompt(nextVal);
    if (nextVal.trim().length >= 5) {
      setPromptRequiredBanner(false);
    }
    if (interactiveElementsApproved) {
      setInteractiveElementsApproved(false);
      setPreparedFrontendReady(false);
    }
  };

  const handleRestorePreviousPrompt = () => {
    if (!previousPromptBackup) return;
    setUserGraphicPrompt(previousPromptBackup);
    setUserGraphicPromptFileName('Przywrócony prompt');
    setPromptRequiredBanner(false);
    playStudioClick(0.5);
  };

  // =========================================================================
  // STEP 2: AI Vision Button Recognition + Manual Confirmation of Elements
  // =========================================================================
  const handleRunButtonAnalysis = async () => {
    if (!activeProposed?.dataUrl) {
      setStep1Error('Najpierw wgraj grafikę frontendu w Kroku 01.');
      return;
    }
    if (!isPromptValid) {
      setPromptRequiredBanner(true);
      setStep1Error(
        'Dla każdej wgranej grafiki wymagany jest prompt (min. 5 znaków) — wgraj plik promptu lub wpisz go obok grafiki.'
      );
      promptTextareaRef.current?.focus();
      return;
    }
    setStep1Error(null);
    setAnalysisError(null);
    setAnalyzingButtons(true);
    setInteractiveElementsApproved(false);
    setPreparedFrontendReady(false);

    try {
      const res = await studioApiFetch('/api/gemini/analyze-frontend-buttons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: activeProposed.dataUrl,
          mimeType: activeProposed.mimeType || 'image/jpeg',
          fileName: activeProposed.fileName,
          userPrompt: trimmedUserPrompt,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Błąd analizy przycisków na obrazie.');
      }

      const rawDetected: DetectedFrontendButton[] = Array.isArray(data.detectedButtons)
        ? data.detectedButtons.map((b: DetectedFrontendButton, idx: number) => ({
            ...b,
            id: b.id || `btn_ai_${Date.now()}_${idx}`,
            confirmed: false,
            source: b.source === 'manual' ? 'manual' : 'ai',
          }))
        : [];

      const analysis: FrontendImageButtonAnalysis = {
        ...(data as FrontendImageButtonAnalysis),
        detectedButtons: rawDetected,
        userGraphicPrompt: trimmedUserPrompt,
      };

      setFrontendButtonAnalysis(analysis);
      setReviewButtons(rawDetected);
      setSelectedReviewId(rawDetected[0]?.id || null);
      setManualAddMode(false);
      setEditableAnalysisPrompt(analysis.generatedImagePrompt || '');
      playStudioClick(0.78);
      pulseInteraction(0.55);

      setTimeout(() => {
        step2Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    } catch (err) {
      setAnalysisError(
        err instanceof Error ? err.message : 'Nie udało się przeanalizować obrazu.'
      );
    } finally {
      setAnalyzingButtons(false);
    }
  };

  const mutateReviewButtons = (
    updater: (prev: DetectedFrontendButton[]) => DetectedFrontendButton[]
  ) => {
    setReviewButtons((prev) => updater(prev));
    if (interactiveElementsApproved) {
      setInteractiveElementsApproved(false);
      setPreparedFrontendReady(false);
    }
  };

  const handleToggleButtonConfirmed = (id: string) => {
    mutateReviewButtons((prev) =>
      prev.map((btn) => (btn.id === id ? { ...btn, confirmed: !btn.confirmed } : btn))
    );
    playStudioClick(0.45);
  };

  const handleConfirmAllDetected = () => {
    mutateReviewButtons((prev) => prev.map((btn) => ({ ...btn, confirmed: true })));
    playStudioClick(0.65);
  };

  const handleUnconfirmAllDetected = () => {
    mutateReviewButtons((prev) => prev.map((btn) => ({ ...btn, confirmed: false })));
    playStudioClick(0.45);
  };

  const handleUpdateReviewButton = (
    id: string,
    patch: Partial<DetectedFrontendButton>
  ) => {
    mutateReviewButtons((prev) =>
      prev.map((btn) => (btn.id === id ? { ...btn, ...patch } : btn))
    );
  };

  const handleDeleteReviewButton = (id: string) => {
    mutateReviewButtons((prev) => prev.filter((btn) => btn.id !== id));
    if (selectedReviewId === id) {
      setSelectedReviewId(null);
    }
    playStudioClick(0.4);
  };

  const handleAddManualButtonAt = (xCenterPct: number, yCenterPct: number) => {
    const wPct = 16;
    const hPct = 7;
    const xPct = Number(Math.max(1, Math.min(98 - wPct, xCenterPct - wPct / 2)).toFixed(1));
    const yPct = Number(Math.max(1, Math.min(98 - hPct, yCenterPct - hPct / 2)).toFixed(1));
    const zone: PrototypeDropZone =
      yPct < 18 ? 'header' : yPct > 78 ? 'footer' : 'main';
    const nextIdx = reviewButtons.length;
    const newBtn: DetectedFrontendButton = {
      id: `btn_manual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      label: `Przycisk ręczny #${nextIdx + 1}`,
      role: nextIdx === 0 ? 'primary-cta' : 'secondary-action',
      zone,
      xPct,
      yPct,
      wPct,
      hPct,
      shadeId: FRONTEND_ELEMENT_SHADE_ORDER[nextIdx % FRONTEND_ELEMENT_SHADE_ORDER.length],
      confirmed: true,
      source: 'manual',
    };
    mutateReviewButtons((prev) => [...prev, newBtn]);
    setSelectedReviewId(newBtn.id);
    playStudioClick(0.7);
  };

  const handleReviewImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!manualAddMode || !reviewImageRef.current) return;
    const rect = reviewImageRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    handleAddManualButtonAt(xPct, yPct);
  };

  const handleApproveInteractiveElements = () => {
    if (!frontendButtonAnalysis || confirmedButtons.length === 0) return;

    const confirmedHeader = confirmedButtons.filter((b) => b.zone === 'header').length;
    const confirmedMain = confirmedButtons.filter((b) => b.zone === 'main').length;
    const confirmedFooter = confirmedButtons.filter((b) => b.zone === 'footer').length;
    const labelsSummary = confirmedButtons.map((b) => `"${b.label}"`).join(', ');

    const basePrompt = (
      editableAnalysisPrompt ||
      frontendButtonAnalysis.generatedImagePrompt ||
      ''
    ).trim();
    const enrichedPrompt = `${basePrompt}\n\n[ZATWIERDZONE ELEMENTY INTERAKTYWNE (${confirmedButtons.length}): ${labelsSummary}. Rozkład: nagłówek ${confirmedHeader}, sekcja główna ${confirmedMain}, stopka ${confirmedFooter}. Prompt źródłowy użytkownika: ${trimmedUserPrompt}]`;

    const committedAnalysis: FrontendImageButtonAnalysis = {
      ...frontendButtonAnalysis,
      buttonCount: confirmedButtons.length,
      headerButtons: confirmedHeader,
      mainButtons: confirmedMain,
      footerButtons: confirmedFooter,
      detectedButtons: confirmedButtons.map((b) => ({ ...b, confirmed: true })),
      generatedImagePrompt: enrichedPrompt,
      userGraphicPrompt: trimmedUserPrompt,
    };

    setFrontendButtonAnalysis(committedAnalysis);
    setEditableAnalysisPrompt(enrichedPrompt);
    setGeneratorPrompt(enrichedPrompt);
    setInteractiveElementsApproved(true);
    setPromptPastedBadge(true);
    setTimeout(() => setPromptPastedBadge(false), 3000);

    setPendingImageGeneratorDraft({
      prompt: enrichedPrompt,
      websiteGuidelines: websiteBuildGuidelines,
      aspectRatio: generatorAspect,
      screenTitle: `Zatwierdzone elementy (${confirmedButtons.length}) · ${activeProposed?.fileName || 'frontend'}`,
      sourceImage: activeProposed?.dataUrl
        ? {
            base64: activeProposed.dataUrl,
            mime: activeProposed.mimeType || 'image/jpeg',
            name: activeProposed.fileName,
          }
        : undefined,
      styleReferences: frontendStyleReferences,
      detectedButtonCount: confirmedButtons.length,
    });

    playStudioClick(0.88);
    pulseInteraction(0.75);

    setTimeout(() => {
      step3Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  };

  // =========================================================================
  // STEP 3: Auto-Paste Prompt + Website Guidelines + 3-5 Style Ref Graphics
  // =========================================================================
  const handleOneClickPastePrompt = () => {
    const promptToPaste = (
      editableAnalysisPrompt ||
      frontendButtonAnalysis?.generatedImagePrompt ||
      ''
    ).trim();
    if (!promptToPaste) return;
    setGeneratorPrompt(promptToPaste);
    setPendingImageGeneratorDraft({
      prompt: promptToPaste,
      websiteGuidelines: websiteBuildGuidelines,
      aspectRatio: generatorAspect,
      screenTitle: `Zatwierdzona analiza (${confirmedButtons.length} elementów)`,
      sourceImage: activeProposed?.dataUrl
        ? {
            base64: activeProposed.dataUrl,
            mime: activeProposed.mimeType || 'image/jpeg',
            name: activeProposed.fileName,
          }
        : undefined,
      styleReferences: frontendStyleReferences,
      detectedButtonCount: confirmedButtons.length,
    });
    setPromptPastedBadge(true);
    setTimeout(() => setPromptPastedBadge(false), 2600);
    playStudioClick(0.72);
  };

  const handleAppendGuidelinePreset = (text: string) => {
    setWebsiteBuildGuidelines((prev) => {
      const clean = prev.trim();
      if (clean.includes(text)) return prev;
      return clean ? `${clean}\n- ${text}` : `- ${text}`;
    });
    playStudioClick(0.45);
  };

  const handleUploadStyleReferenceFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (fileArray.length === 0) return;
    const remainingSlots = Math.max(0, 5 - frontendStyleReferences.length);
    if (remainingSlots === 0) return;

    setUploadingStyleRefs(true);
    try {
      const toProcess = fileArray.slice(0, remainingSlots);
      const startIndex = frontendStyleReferences.length;
      const results = await Promise.all(
        toProcess.map((f, idx) =>
          compressStyleReferenceFile(
            f,
            DEFAULT_STYLE_ROLE_CYCLE[(startIndex + idx) % DEFAULT_STYLE_ROLE_CYCLE.length],
            startIndex + idx
          )
        )
      );
      const valid = results.filter((r): r is FrontendStyleReferenceImage => Boolean(r));
      if (valid.length > 0) {
        addFrontendStyleReferences(valid);
        playStudioClick(0.65);
      }
    } finally {
      setUploadingStyleRefs(false);
    }
  };

  const handleFillRecommended3StyleRefs = async () => {
    const remaining = Math.max(0, 5 - frontendStyleReferences.length);
    if (remaining === 0 || sampleMediaImages.length === 0) return;
    setUploadingStyleRefs(true);
    try {
      const needed = Math.min(3, remaining, sampleMediaImages.length);
      const picked = sampleMediaImages.slice(0, needed);
      const startIndex = frontendStyleReferences.length;
      const loaded = await Promise.all(
        picked.map((item, idx) =>
          loadAssetUrlAsStyleRef(
            item.src,
            item.title,
            DEFAULT_STYLE_ROLE_CYCLE[(startIndex + idx) % DEFAULT_STYLE_ROLE_CYCLE.length],
            startIndex + idx
          )
        )
      );
      const valid = loaded.filter((r): r is FrontendStyleReferenceImage => Boolean(r));
      if (valid.length > 0) {
        addFrontendStyleReferences(valid);
        playStudioClick(0.7);
      }
    } finally {
      setUploadingStyleRefs(false);
    }
  };

  const handleGeneratePreparedFrontend = async () => {
    if (!step3Unlocked) return;
    const finalPrompt = (
      generatorPrompt ||
      editableAnalysisPrompt ||
      frontendButtonAnalysis?.generatedImagePrompt ||
      ''
    ).trim();
    if (!finalPrompt) {
      setGeneratorError('Wklej lub wpisz prompt przed wygenerowaniem frontendu.');
      return;
    }

    setGeneratorError(null);
    setGeneratingFrontendImg(true);
    try {
      const res = await studioApiFetch('/api/gemini/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: finalPrompt,
          model: generatorModel,
          aspectRatio: generatorAspect,
          imageSize: '1K',
          baseFrontendImageBase64: activeProposed?.dataUrl || undefined,
          websiteGuidelines: websiteBuildGuidelines.trim() || undefined,
          buttonCount: frontendButtonAnalysis?.buttonCount || confirmedButtons.length,
          styleReferenceImages: frontendStyleReferences.map((ref) => ({
            name: ref.name,
            role: STYLE_REF_ROLE_LABELS[ref.role],
            mimeType: ref.mimeType,
            dataUrl: ref.dataUrl,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Błąd generowania przygotowanego frontendu.');
      }
      if (!data.imageDataUrl) {
        throw new Error('Model nie zwrócił obrazu — spróbuj ponownie lub zmień model.');
      }
      setGeneratedPreparedImage(String(data.imageDataUrl));
      playStudioClick(0.86);
      pulseInteraction(0.75);
    } catch (err) {
      setGeneratorError(
        err instanceof Error ? err.message : 'Nie udało się wygenerować grafiki frontendu.'
      );
    } finally {
      setGeneratingFrontendImg(false);
    }
  };

  const handleApprovePreparedFrontend = async (useGenerated: boolean) => {
    if (!step3Unlocked) return;
    const chosenUrl = useGenerated ? generatedPreparedImage : activeProposed?.dataUrl;
    if (!chosenUrl) return;

    const chosenName = useGenerated
      ? `przygotowany-frontend-${Date.now()}.png`
      : activeProposed?.fileName || 'zatwierdzony-frontend.jpg';
    const usedPrompt = generatorPrompt || editableAnalysisPrompt || trimmedUserPrompt;

    applyPreparedFrontendToWorkspace({
      imageDataUrl: chosenUrl,
      fileName: chosenName,
      mimeType: useGenerated ? 'image/png' : activeProposed?.mimeType || 'image/jpeg',
      promptUsed: usedPrompt,
      analysis: frontendButtonAnalysis,
    });

    addAttachedPromptGraphic({
      name: chosenName,
      mimeType: useGenerated ? 'image/png' : activeProposed?.mimeType || 'image/jpeg',
      dataUrl: chosenUrl,
      role: 'uklad-ekranu',
    });

    try {
      await addMediaAsset({
        title: useGenerated
          ? 'Przygotowany Frontend AI'
          : `Zatwierdzony Frontend (${confirmedButtons.length} elem.)`,
        subtitle: `Zatwierdzone elementy: ${confirmedButtons.length} · Stylów: ${frontendStyleReferences.length}`,
        category: 'frontend-ui',
        mediaType: 'image',
        aspectRatio: generatorAspect,
        resolution: '1440×900',
        prompt: usedPrompt,
        src: chosenUrl,
        audioFreq: 420,
      });
    } catch {
      // Non-fatal
    }

    playStudioClick(0.9);
    pulseInteraction(0.85);
    setTimeout(() => {
      step4Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 120);
  };

  // =========================================================================
  // STEP 4: Interactive Element Work & Multi-Shade Highlighting
  // =========================================================================
  const handleSelectWidget = (widget: PrototypeScreenWidget, idx: number) => {
    const shadeId =
      composedElementShades[widget.instanceId] ||
      FRONTEND_ELEMENT_SHADE_ORDER[idx % FRONTEND_ELEMENT_SHADE_ORDER.length];
    markElementAsActivelyModified({
      id: widget.instanceId,
      kind: 'widget',
      label: widget.label,
      shadeId,
      zone: widget.zone,
      screenId: activeScreenNode?.id,
      sourceSurface: 'start-workspace',
    });
    const matchedRegion = workingFrontendImage?.regions.find(
      (r) => r.linkedElementId === widget.instanceId
    );
    setActiveRegionId(matchedRegion?.id || null);
    playStudioClick(0.6);
    pulseInteraction(0.38);
  };

  const handleAssignWidgetShade = (
    widget: PrototypeScreenWidget,
    shadeId: ElementShadeId
  ) => {
    setElementCustomShade(widget.instanceId, shadeId);
    markElementAsActivelyModified({
      id: widget.instanceId,
      kind: 'widget',
      label: widget.label,
      shadeId,
      zone: widget.zone,
      screenId: activeScreenNode?.id,
      sourceSurface: 'start-workspace',
    });
    const matchedRegion = workingFrontendImage?.regions.find(
      (r) => r.linkedElementId === widget.instanceId
    );
    if (matchedRegion) {
      updateFrontendImageRegion(matchedRegion.id, { shadeId });
    }
    playStudioClick(0.5);
  };

  const handleQuickAddCatalogWidget = (catalogId: string) => {
    if (!activeScreenNode) return;
    const catalogItem = TACTILE_UI_CATALOG.find((c) => c.id === catalogId);
    if (!catalogItem) return;
    const nextIdx = activeWidgets.length;
    const nextShade =
      FRONTEND_ELEMENT_SHADE_ORDER[nextIdx % FRONTEND_ELEMENT_SHADE_ORDER.length];
    const updatedNode = appendCatalogWidgetToNode(activeScreenNode, catalogItem, quickAddZone);
    const updatedWidgets = resolvePrototypeWidgetsForNode(updatedNode);
    const createdWidget = updatedWidgets[updatedWidgets.length - 1];
    if (createdWidget) {
      setElementCustomShade(createdWidget.instanceId, nextShade);
      markElementAsActivelyModified({
        id: createdWidget.instanceId,
        kind: 'widget',
        label: createdWidget.label,
        shadeId: nextShade,
        zone: quickAddZone,
        screenId: activeScreenNode.id,
        sourceSurface: 'start-workspace',
      });
      if (workingFrontendImage) {
        const yBase = quickAddZone === 'header' ? 8 : quickAddZone === 'footer' ? 80 : 38;
        const reg = addFrontendImageRegion({
          label: createdWidget.label,
          linkedElementId: createdWidget.instanceId,
          zone: quickAddZone,
          shadeId: nextShade,
          xPct: Math.min(64, 10 + (nextIdx % 3) * 24),
          yPct: Math.min(76, yBase + Math.floor(nextIdx / 3) * 8),
          wPct: 26,
          hPct: 12,
        });
        setActiveRegionId(reg.id);
      }
    }

    setActiveScreenMap((prev) => ({
      ...prev,
      nodes: prev.nodes.map((node) =>
        node.id === activeScreenNode.id
          ? {
              ...updatedNode,
              prototypeWidgets: updatedWidgets,
              components: buildComponentsArrayFromWidgets(
                updatedWidgets,
                activeScreenNode.components
              ),
            }
          : node
      ),
    }));
    playStudioClick(0.72);
  };

  // =========================================================================
  // Local Disk Helpers (Collapsible Bottom Panel)
  // =========================================================================
  const handleSelectDirectory = async () => {
    setDiskBusy(true);
    setDiskFeedback(null);
    try {
      const res = await selectLocalDiskDirectory();
      setDiskFeedback(res.message);
      playStudioClick(0.6);
    } finally {
      setDiskBusy(false);
    }
  };

  const handleSaveNow = async (forceFallback = false) => {
    setDiskBusy(true);
    setDiskFeedback(null);
    try {
      const res = await saveProjectToLocalDiskNow(forceFallback);
      setDiskFeedback(res.message);
      playStudioClick(0.65);
    } finally {
      setDiskBusy(false);
    }
  };

  // Styling tokens (Light & Dark accessible)
  const cardCls = isDark
    ? 'bg-slate-900/80 border-slate-800/90 text-slate-100'
    : 'bg-white/95 border-slate-200/90 text-slate-900 shadow-sm';
  const subCardCls = isDark
    ? 'bg-slate-950/75 border-slate-800/80'
    : 'bg-slate-50/90 border-slate-200/80';
  const mutedCls = isDark ? 'text-slate-400' : 'text-slate-600';
  const inputCls = isDark
    ? 'bg-slate-950/90 border-slate-700/90 text-slate-100 placeholder:text-slate-500 focus:border-indigo-400'
    : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 focus:border-indigo-500';

  const stepperItems = [
    {
      num: '01',
      title: 'Grafika + Wymagany Prompt',
      done: step1Complete,
      active: !step1Complete,
      locked: false,
      onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' }),
    },
    {
      num: '02',
      title: 'Analiza & Potwierdzenie Elementów',
      done: step2Complete,
      active: step1Complete && !step2Complete,
      locked: !step1Complete,
      onClick: () => step2Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    },
    {
      num: '03',
      title: 'Generator Grafik + 3–5 Stylów',
      done: step4Unlocked,
      active: step3Unlocked && !step4Unlocked,
      locked: !step3Unlocked,
      onClick: () => step3Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    },
    {
      num: '04',
      title: 'Praca nad Frontendem',
      done: false,
      active: step4Unlocked,
      locked: !step4Unlocked,
      onClick: () => step4Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    },
  ];

  return (
    <div className="space-y-6 pb-8" onPaste={handleStep1Paste}>
      {/* ===================================================================== */}
      {/* TOP BAR & 4-STEP STRICT SEQUENTIAL PROGRESS                           */}
      {/* ===================================================================== */}
      <section className={`rounded-2xl border p-5 ${cardCls}`}>
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-indigo-500">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Sekwencyjny Proces Projektowania Frontendu</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              Grafika + Prompt → Analiza &amp; Potwierdzenie Elementów → Praca nad Frontendem
            </h1>
            <p className={`text-sm max-w-3xl ${mutedCls}`}>
              Każde wgranie grafiki wymaga dołączenia promptu obok obrazu. Następnie AI rozpoznaje
              wszystkie przyciski, które ręcznie weryfikujesz i zatwierdzasz — dopiero po zatwierdzeniu
              elementów interaktywnych odblokowuje się generator i praca nad frontendem.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setZeroLimitLocalMode(!zeroLimitLocalMode)}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                zeroLimitLocalMode
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-500'
                  : isDark
                    ? 'bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white'
                    : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
              }`}
              title="Przełącz tryb pracy pomiędzy Gemini Vision API a lokalnym silnikiem offline"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{zeroLimitLocalMode ? 'Silnik Lokalny (Offline)' : 'Silnik Gemini Vision AI'}</span>
            </button>

            <button
              type="button"
              onClick={() => setLocalhostModalOpen(true)}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                isDark
                  ? 'bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-700'
                  : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-50'
              }`}
            >
              <Server className="w-3.5 h-3.5 text-indigo-500" />
              <span>Prezentacja Localhost</span>
            </button>
          </div>
        </div>

        {/* 4-Step Interactive Progress Bar */}
        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
          {stepperItems.map((step) => (
            <button
              key={step.num}
              type="button"
              onClick={step.onClick}
              disabled={step.locked}
              className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left transition-all ${
                step.done
                  ? isDark
                    ? 'bg-emerald-500/10 border-emerald-500/35 text-emerald-300'
                    : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : step.active
                    ? isDark
                      ? 'bg-indigo-500/15 border-indigo-400/50 text-indigo-200'
                      : 'bg-indigo-50 border-indigo-300 text-indigo-900'
                    : isDark
                      ? 'bg-slate-950/60 border-slate-800/80 text-slate-500 opacity-75 cursor-not-allowed'
                      : 'bg-slate-50 border-slate-200 text-slate-400 opacity-80 cursor-not-allowed'
              }`}
            >
              <span
                className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold tabular-nums shrink-0 ${
                  step.done
                    ? 'bg-emerald-500 text-white'
                    : step.active
                      ? 'bg-indigo-600 text-white'
                      : isDark
                        ? 'bg-slate-800 text-slate-400'
                        : 'bg-slate-200 text-slate-500'
                }`}
              >
                {step.done ? (
                  <Check className="w-4 h-4" />
                ) : step.locked ? (
                  <Lock className="w-3.5 h-3.5" />
                ) : (
                  step.num
                )}
              </span>
              <div className="min-w-0">
                <div className="text-[10px] font-bold uppercase tracking-wider opacity-75">
                  Krok {step.num}
                </div>
                <div className="text-xs font-semibold truncate">{step.title}</div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* ===================================================================== */}
      {/* KROK 01: SIDE-BY-SIDE GRAPHIC UPLOAD + MANDATORY PROMPT ELEMENT       */}
      {/* ===================================================================== */}
      <section className={`rounded-2xl border p-5 sm:p-6 ${cardCls}`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-4 border-b border-slate-200/70 dark:border-slate-800/80">
          <div className="flex items-center gap-3">
            <span className="w-8 h-8 rounded-xl bg-indigo-600 text-white font-bold text-xs flex items-center justify-center tabular-nums shrink-0">
              01
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight">
                Wgraj grafikę frontendu oraz wymagany prompt obok
              </h2>
              <p className={`text-xs ${mutedCls}`}>
                Za każdym razem po wgraniu grafiki system wymaga podania lub wgrania powiązanego
                promptu, aby precyzyjnie rozpoznać przyciski i ich rolę w Kroku 02.
              </p>
            </div>
          </div>

          <div className="text-xs font-semibold tabular-nums shrink-0">
            {step1Complete ? (
              <span className="inline-flex items-center gap-1.5 text-emerald-500">
                <Check className="w-4 h-4" />
                Grafika i prompt gotowe
              </span>
            ) : activeProposed ? (
              <span className="inline-flex items-center gap-1.5 text-amber-500">
                <AlertTriangle className="w-4 h-4" />
                Wymagany prompt dla wgranej grafiki
              </span>
            ) : (
              <span className={mutedCls}>Oczekuje na grafikę i prompt</span>
            )}
          </div>
        </div>

        {step1Error && (
          <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-500 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{step1Error}</span>
          </div>
        )}

        {/* Side-by-side 2 columns: Left = Graphic Upload, Right = Mandatory Prompt Upload/Input */}
        <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* LEFT COLUMN: Graphic Upload */}
          <div className={`lg:col-span-6 rounded-2xl border p-4 flex flex-col gap-4 ${subCardCls}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ImagePlus className="w-4 h-4 text-indigo-500" />
                <h3 className="text-sm font-bold">1A. Grafika proponowanego frontendu</h3>
              </div>
              {activeProposed && (
                <span className={`text-[11px] font-medium truncate max-w-[200px] ${mutedCls}`}>
                  {activeProposed.fileName}
                </span>
              )}
            </div>

            <input
              ref={step1ImageInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleProposedFileUpload(file);
                e.target.value = '';
              }}
            />

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverImage(true);
              }}
              onDragLeave={() => setDragOverImage(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverImage(false);
                const file = e.dataTransfer.files?.[0];
                if (file && file.type.startsWith('image/')) {
                  void handleProposedFileUpload(file);
                }
              }}
              onClick={() => step1ImageInputRef.current?.click()}
              className={`relative rounded-xl border-2 border-dashed p-4 cursor-pointer transition-all flex flex-col items-center justify-center min-h-[240px] ${
                dragOverImage
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : isDark
                    ? 'border-slate-700 hover:border-indigo-400/70 bg-slate-900/60'
                    : 'border-slate-300 hover:border-indigo-400 bg-white'
              }`}
            >
              {uploadingProposed ? (
                <div className="flex flex-col items-center gap-2 py-8">
                  <Loader2 className="w-7 h-7 text-indigo-500 animate-spin" />
                  <span className="text-xs font-semibold">
                    Przetwarzanie grafiki w wysokiej rozdzielczości…
                  </span>
                </div>
              ) : activeProposed?.dataUrl ? (
                <div className="w-full flex flex-col items-center gap-3">
                  <img
                    src={activeProposed.dataUrl}
                    alt={activeProposed.fileName}
                    className="max-h-[230px] w-auto object-contain rounded-lg border border-slate-300/60 dark:border-slate-700/80 shadow-sm"
                  />
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <span className="text-xs font-semibold text-indigo-500">
                      Kliknij lub upuść nową grafikę, aby podmienić (automatycznie wymaga nowego
                      promptu)
                    </span>
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-2 py-6">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 text-indigo-500 flex items-center justify-center mx-auto">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div className="text-sm font-bold">
                    Upuść grafikę frontendu, kliknij lub wklej (Ctrl+V)
                  </div>
                  <div className={`text-xs ${mutedCls}`}>
                    PNG, JPG, WebP — zrzut ekranu, makieta Figma lub projekt aplikacji
                  </div>
                </div>
              )}
            </div>

            {/* Sample templates row */}
            {sampleMediaImages.length > 0 && (
              <div className="space-y-2">
                <div className={`text-[11px] font-semibold uppercase tracking-wider ${mutedCls}`}>
                  Lub załaduj przykład z biblioteki (również wymaga promptu):
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {sampleMediaImages.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => void handleLoadSampleProposed(item.src, item.title)}
                      title={item.title}
                      className={`group relative rounded-lg overflow-hidden border aspect-[4/3] transition-all ${
                        isDark
                          ? 'border-slate-700 hover:border-indigo-400'
                          : 'border-slate-300 hover:border-indigo-500'
                      }`}
                    >
                      <img
                        src={item.src}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Mandatory Prompt Upload & Editor directly beside Graphic Upload */}
          <div
            className={`lg:col-span-6 rounded-2xl border p-4 flex flex-col gap-3.5 transition-all ${
              activeProposed && !isPromptValid
                ? isDark
                  ? 'bg-amber-950/25 border-amber-500/70 ring-2 ring-amber-500/25'
                  : 'bg-amber-50/70 border-amber-400 ring-2 ring-amber-400/25'
                : subCardCls
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <FileText
                  className={`w-4 h-4 ${
                    activeProposed && !isPromptValid ? 'text-amber-500' : 'text-indigo-500'
                  }`}
                />
                <h3 className="text-sm font-bold">
                  1B. Prompt do grafiki <span className="text-rose-500">*</span>
                </h3>
              </div>
              <span
                className={`text-[11px] font-bold uppercase tracking-wider ${
                  isPromptValid
                    ? 'text-emerald-500'
                    : activeProposed
                      ? 'text-amber-500'
                      : mutedCls
                }`}
              >
                {isPromptValid ? 'Prompt gotowy' : 'Wymagany przy każdej grafice'}
              </span>
            </div>

            {/* Automatic mandatory alert banner whenever a graphic is uploaded without a prompt */}
            {activeProposed && !isPromptValid && (
              <div
                className={`rounded-xl border px-3.5 py-2.5 text-xs flex items-start gap-2.5 ${
                  promptRequiredBanner
                    ? 'border-amber-500/60 bg-amber-500/15 text-amber-600 dark:text-amber-300'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300'
                }`}
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold">
                    Wymagany prompt dla wgranej grafiki „{activeProposed.fileName}”
                  </div>
                  <p className="opacity-90">
                    Wgraj plik z promptem (.txt, .md, .json) lub wpisz opis funkcji ekranu i jego
                    przycisków poniżej. Bez promptu analiza obrazu w Kroku 02 pozostaje zablokowana.
                  </p>
                </div>
              </div>
            )}

            {/* Prompt File Dropzone / Picker */}
            <input
              ref={step1PromptInputRef}
              type="file"
              accept=".txt,.md,.markdown,.json,.prompt,text/plain,application/json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handlePromptFileUpload(file);
                e.target.value = '';
              }}
            />

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverPrompt(true);
              }}
              onDragLeave={() => setDragOverPrompt(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverPrompt(false);
                const file = e.dataTransfer.files?.[0];
                if (file) void handlePromptFileUpload(file);
              }}
              className={`rounded-xl border border-dashed px-3.5 py-3 flex flex-wrap items-center justify-between gap-2.5 transition-colors ${
                dragOverPrompt
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : isDark
                    ? 'border-slate-700 bg-slate-900/70'
                    : 'border-slate-300 bg-white'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <Upload className="w-4 h-4 text-indigo-500 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">
                    {userGraphicPromptFileName
                      ? `Wgrany plik: ${userGraphicPromptFileName}`
                      : 'Wgraj plik promptu (.txt, .md, .json, .prompt)'}
                  </div>
                  <div className={`text-[11px] ${mutedCls}`}>
                    Upuść plik tekstowy tutaj lub wybierz z dysku
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => step1PromptInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold whitespace-nowrap shrink-0 transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Wgraj prompt</span>
                </button>
                {previousPromptBackup && !isPromptValid && (
                  <button
                    type="button"
                    onClick={handleRestorePreviousPrompt}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                      isDark
                        ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                        : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Użyj poprzedniego</span>
                  </button>
                )}
              </div>
            </div>

            {/* Prompt Textarea */}
            <div className="flex-1 flex flex-col gap-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="mandatory-graphic-prompt" className="font-semibold">
                  Treść promptu opisującego grafikę i oczekiwane elementy interaktywne:
                </label>
                <span
                  className={`tabular-nums text-[11px] ${
                    isPromptValid ? 'text-emerald-500' : mutedCls
                  }`}
                >
                  {trimmedUserPrompt.length} znaków (min. 5)
                </span>
              </div>
              <textarea
                id="mandatory-graphic-prompt"
                ref={promptTextareaRef}
                value={userGraphicPrompt}
                onChange={(e) => handlePromptTextChange(e.target.value)}
                rows={6}
                placeholder="Np.: Aplikacja medyczna Flebologia — 3 ekrany mobilne z przyciskiem CTA 'Rozpocznij analizę', listą objawów do zaznaczenia, nawigacją dolną i ikoną wstecz. Zidentyfikuj wszystkie klikalne przyciski, kafelki wyboru i zakładki..."
                className={`w-full flex-1 rounded-xl border px-3.5 py-2.5 text-sm leading-relaxed outline-none transition-colors resize-y min-h-[140px] ${inputCls}`}
              />
            </div>

            {/* Step 1 -> Step 2 Launch CTA */}
            <div className="pt-1 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className={`text-[11px] ${mutedCls}`}>
                {!activeProposed
                  ? 'Najpierw wgraj grafikę po lewej stronie.'
                  : !isPromptValid
                    ? 'Uzupełnij lub wgraj prompt (min. 5 znaków), aby uruchomić analizę.'
                    : 'Gotowe do analizy AI i ręcznej weryfikacji przycisków.'}
              </div>
              <button
                type="button"
                disabled={!step1Complete || analyzingButtons}
                onClick={() => void handleRunButtonAnalysis()}
                className={`inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 transition-all ${
                  step1Complete && !analyzingButtons
                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm'
                    : isDark
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                {analyzingButtons ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Rozpoznawanie przycisków AI…</span>
                  </>
                ) : (
                  <>
                    <ScanEye className="w-4 h-4" />
                    <span>Analizuj obraz i wykryj przyciski (Krok 02)</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* KROK 02: IMAGE ANALYSIS & MANUAL CONFIRMATION OF INTERACTIVE ELEMENTS */}
      {/* ===================================================================== */}
      <section ref={step2Ref} className={`rounded-2xl border p-5 sm:p-6 ${cardCls}`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-200/70 dark:border-slate-800/80">
          <div className="flex items-center gap-3">
            <span
              className={`w-8 h-8 rounded-xl font-bold text-xs flex items-center justify-center tabular-nums shrink-0 ${
                step2Complete
                  ? 'bg-emerald-600 text-white'
                  : step1Complete
                    ? 'bg-indigo-600 text-white'
                    : isDark
                      ? 'bg-slate-800 text-slate-400'
                      : 'bg-slate-200 text-slate-500'
              }`}
            >
              {step2Complete ? <Check className="w-4 h-4" /> : '02'}
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight">
                Analiza obrazu i manualne potwierdzenie elementów interaktywnych
              </h2>
              <p className={`text-xs ${mutedCls}`}>
                Zweryfikuj wykryte przyciski na obrazie, dodaj brakujące kliknięciem na grafice lub
                skoryguj etykiety i ramki. Dopiero po zatwierdzeniu elementów odblokujesz pracę nad
                frontendem.
              </p>
            </div>
          </div>

          {step1Complete && (
            <button
              type="button"
              disabled={analyzingButtons}
              onClick={() => void handleRunButtonAnalysis()}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                isDark
                  ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                  : 'border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200'
              }`}
            >
              {analyzingButtons ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              <span>{frontendButtonAnalysis ? 'Ponów analizę AI' : 'Uruchom analizę AI'}</span>
            </button>
          )}
        </div>

        {analysisError && (
          <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-500 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{analysisError}</span>
          </div>
        )}

        {!step1Complete ? (
          <div className={`mt-5 rounded-xl border p-6 flex items-center gap-4 ${subCardCls}`}>
            <Lock className="w-6 h-6 text-slate-400 shrink-0" />
            <div className="space-y-1">
              <div className="text-sm font-bold">Sekcja zablokowana — dokończ Krok 01</div>
              <p className={`text-xs ${mutedCls}`}>
                Wgraj grafikę frontendu oraz wymagany prompt obok niej, aby uruchomić analizę obrazu i
                manualną weryfikację przycisków.
              </p>
            </div>
          </div>
        ) : !frontendButtonAnalysis ? (
          <div
            className={`mt-5 rounded-xl border p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${subCardCls}`}
          >
            <div className="space-y-1">
              <div className="text-sm font-bold">
                Grafika i prompt są gotowe — uruchom rozpoznawanie przycisków
              </div>
              <p className={`text-xs ${mutedCls}`}>
                Model Gemini Vision przeskanuje obraz z uwzględnieniem Twojego promptu, wykryje
                wszystkie przyciski i przygotuje je do ręcznego zatwierdzenia.
              </p>
            </div>
            <button
              type="button"
              disabled={analyzingButtons}
              onClick={() => void handleRunButtonAnalysis()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold whitespace-nowrap shrink-0 transition-colors"
            >
              {analyzingButtons ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ScanEye className="w-4 h-4" />
              )}
              <span>{analyzingButtons ? 'Analizowanie obrazu…' : 'Analizuj obraz teraz'}</span>
            </button>
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            {/* Recognition Summary & Tabular Counters */}
            <div className={`rounded-xl border p-4 space-y-3 ${subCardCls}`}>
              <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                <div className="space-y-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-indigo-500">
                    Rozpoznany obraz · {frontendButtonAnalysis.detectedTheme}
                  </div>
                  <p className="text-sm leading-relaxed">
                    {frontendButtonAnalysis.imageDescription || frontendButtonAnalysis.layoutSummary}
                  </p>
                </div>

                {frontendButtonAnalysis.detectedColors &&
                  frontendButtonAnalysis.detectedColors.length > 0 && (
                    <div className="flex items-center gap-1.5 shrink-0">
                      {frontendButtonAnalysis.detectedColors.map((hex) => (
                        <div
                          key={hex}
                          title={hex}
                          className="w-6 h-6 rounded-md border border-slate-400/40 shadow-xs"
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                  )}
              </div>

              {/* Clean Tabular Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 pt-1">
                <div className={`rounded-lg border px-3 py-2 ${cardCls}`}>
                  <div className={`text-[10px] font-semibold uppercase ${mutedCls}`}>
                    Wykryto łącznie
                  </div>
                  <div className="text-lg font-bold tabular-nums">{reviewCounts.total}</div>
                </div>
                <div
                  className={`rounded-lg border px-3 py-2 ${
                    reviewCounts.confirmed > 0
                      ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                      : 'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-300'
                  }`}
                >
                  <div className="text-[10px] font-semibold uppercase">Potwierdzono ręcznie</div>
                  <div className="text-lg font-bold tabular-nums">
                    {reviewCounts.confirmed} / {reviewCounts.total}
                  </div>
                </div>
                <div className={`rounded-lg border px-3 py-2 ${cardCls}`}>
                  <div className={`text-[10px] font-semibold uppercase ${mutedCls}`}>Nagłówek</div>
                  <div className="text-lg font-bold tabular-nums">{reviewCounts.header}</div>
                </div>
                <div className={`rounded-lg border px-3 py-2 ${cardCls}`}>
                  <div className={`text-[10px] font-semibold uppercase ${mutedCls}`}>
                    Sekcja główna
                  </div>
                  <div className="text-lg font-bold tabular-nums">{reviewCounts.main}</div>
                </div>
                <div className={`rounded-lg border px-3 py-2 ${cardCls}`}>
                  <div className={`text-[10px] font-semibold uppercase ${mutedCls}`}>Stopka</div>
                  <div className="text-lg font-bold tabular-nums">{reviewCounts.footer}</div>
                </div>
              </div>

              {frontendButtonAnalysis.recognizedTexts &&
                frontendButtonAnalysis.recognizedTexts.length > 0 && (
                  <div className={`text-xs pt-1 ${mutedCls}`}>
                    <span className="font-semibold">Odczytane napisy (OCR): </span>
                    <span>{frontendButtonAnalysis.recognizedTexts.join(' · ')}</span>
                  </div>
                )}
            </div>

            {/* Interactive Bounding-Box Canvas (Left) + Manual Confirmation List (Right) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* LEFT: Pixel-Aligned Interactive Canvas */}
              <div className={`lg:col-span-7 rounded-2xl border p-4 space-y-3 ${subCardCls}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-bold">
                    Podgląd rozpoznanych przycisków (kliknij ramkę, aby edytować; podwójny klik
                    potwierdza)
                  </div>
                  <button
                    type="button"
                    onClick={() => setManualAddMode((v) => !v)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold whitespace-nowrap shrink-0 transition-colors ${
                      manualAddMode
                        ? 'bg-indigo-600 border-indigo-500 text-white'
                        : isDark
                          ? 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                          : 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100'
                    }`}
                  >
                    <Crosshair className="w-3.5 h-3.5" />
                    <span>
                      {manualAddMode
                        ? 'Tryb dodawania AKTYWNY — kliknij na obraz'
                        : '+ Dodaj przycisk kliknięciem na obrazie'}
                    </span>
                  </button>
                </div>

                {/* Centered inline-block container so % overlays match the image pixels 1:1 */}
                <div
                  className={`rounded-xl border p-2 flex justify-center overflow-auto ${
                    isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100/80 border-slate-200'
                  }`}
                >
                  <div
                    onClick={handleReviewImageClick}
                    className={`relative inline-block max-w-full select-none ${
                      manualAddMode ? 'cursor-crosshair' : 'cursor-default'
                    }`}
                  >
                    {activeProposed?.dataUrl && (
                      <img
                        ref={reviewImageRef}
                        src={activeProposed.dataUrl}
                        alt="Analizowany frontend"
                        className="block max-h-[540px] w-auto max-w-full rounded-lg"
                        draggable={false}
                      />
                    )}

                    {/* Pixel-aligned bounding boxes */}
                    {reviewButtons.map((btn, idx) => {
                      const shade = getShadeSpec(btn.shadeId, idx);
                      const shadeHex = shade.activeBorderHex;
                      const isSelected = selectedReviewId === btn.id;
                      const isConfirmed = Boolean(btn.confirmed);

                      return (
                        <button
                          key={btn.id}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedReviewId(btn.id);
                          }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            handleToggleButtonConfirmed(btn.id);
                          }}
                          title={`${btn.label} (${ROLE_LABELS[btn.role]}) — ${
                            isConfirmed ? 'Potwierdzony' : 'Oczekuje na potwierdzenie'
                          }`}
                          style={{
                            left: `${btn.xPct}%`,
                            top: `${btn.yPct}%`,
                            width: `${btn.wPct}%`,
                            height: `${btn.hPct}%`,
                            borderColor: isConfirmed ? '#10b981' : shadeHex,
                            backgroundColor: isSelected
                              ? shade.activeOverlayFill
                              : isConfirmed
                                ? 'rgba(16, 185, 129, 0.16)'
                                : `${shadeHex}1c`,
                            boxShadow: isSelected
                              ? `0 0 0 2px #ffffff, 0 0 0 4px ${isConfirmed ? '#10b981' : shadeHex}`
                              : undefined,
                          }}
                          className={`absolute rounded-md transition-all text-left ${
                            isConfirmed ? 'border-2 border-solid' : 'border-2 border-dashed'
                          }`}
                        >
                          <span
                            style={{
                              backgroundColor: isConfirmed ? '#059669' : shade.badgeBgHex,
                            }}
                            className="absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[10px] font-bold text-white whitespace-nowrap shadow-sm flex items-center gap-1 max-w-[180px] truncate pointer-events-none"
                          >
                            <span className="tabular-nums">{idx + 1}.</span>
                            {isConfirmed && <Check className="w-2.5 h-2.5 shrink-0" />}
                            <span className="truncate">{btn.label}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Selected box fine-tuning coordinates bar */}
                {selectedReviewButton && (
                  <div className={`rounded-xl border p-3 space-y-2.5 ${cardCls}`}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold">
                        Korekta pozycji i rozmiaru: {selectedReviewButton.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleToggleButtonConfirmed(selectedReviewButton.id)}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap shrink-0 ${
                          selectedReviewButton.confirmed
                            ? 'bg-emerald-600 text-white'
                            : 'bg-amber-500 text-slate-950'
                        }`}
                      >
                        <Check className="w-3 h-3" />
                        <span>
                          {selectedReviewButton.confirmed
                            ? 'Potwierdzony'
                            : 'Potwierdź ten przycisk'}
                        </span>
                      </button>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {(
                        [
                          ['xPct', 'Pozycja X (%)'],
                          ['yPct', 'Pozycja Y (%)'],
                          ['wPct', 'Szerokość (%)'],
                          ['hPct', 'Wysokość (%)'],
                        ] as const
                      ).map(([field, label]) => (
                        <label key={field} className="space-y-1">
                          <span className={`block text-[10px] font-semibold ${mutedCls}`}>
                            {label}
                          </span>
                          <input
                            type="number"
                            step={0.5}
                            min={field === 'wPct' || field === 'hPct' ? 2 : 0}
                            max={98}
                            value={selectedReviewButton[field]}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              if (!Number.isFinite(val)) return;
                              handleUpdateReviewButton(selectedReviewButton.id, {
                                [field]: Math.max(0, Math.min(98, val)),
                              });
                            }}
                            className={`w-full rounded-lg border px-2 py-1 text-xs tabular-nums outline-none ${inputCls}`}
                          />
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* RIGHT: Manual Verification Checklist & Editor */}
              <div className={`lg:col-span-5 rounded-2xl border p-4 flex flex-col gap-3 ${subCardCls}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider">
                    Lista elementów do potwierdzenia ({reviewCounts.confirmed}/{reviewCounts.total})
                  </h3>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleConfirmAllDetected}
                      disabled={reviewButtons.length === 0}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold whitespace-nowrap shrink-0 disabled:opacity-40"
                    >
                      <CheckSquare className="w-3 h-3" />
                      <span>Potwierdź wszystkie</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleUnconfirmAllDetected}
                      disabled={reviewCounts.confirmed === 0}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] font-semibold whitespace-nowrap shrink-0 disabled:opacity-40 ${
                        isDark
                          ? 'border-slate-700 bg-slate-800 text-slate-300'
                          : 'border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      <Square className="w-3 h-3" />
                      <span>Odznacz</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAddManualButtonAt(50, 50)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Dodaj ręcznie</span>
                    </button>
                  </div>
                </div>

                {reviewButtons.length === 0 ? (
                  <div className={`rounded-xl border p-5 text-center space-y-2 ${cardCls}`}>
                    <p className="text-xs font-semibold">
                      Nie wykryto automatycznie przycisków na tej grafice.
                    </p>
                    <p className={`text-[11px] ${mutedCls}`}>
                      Włącz tryb „Dodaj przycisk kliknięciem na obrazie” lub kliknij „Dodaj ręcznie”,
                      aby oznaczyć elementy interaktywne.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                    {reviewButtons.map((btn, idx) => {
                      const shade = getShadeSpec(btn.shadeId, idx);
                      const isSelected = selectedReviewId === btn.id;
                      const isConfirmed = Boolean(btn.confirmed);

                      return (
                        <div
                          key={btn.id}
                          onClick={() => setSelectedReviewId(btn.id)}
                          className={`rounded-xl border p-2.5 space-y-2 cursor-pointer transition-all ${
                            isSelected
                              ? isDark
                                ? 'bg-slate-900 border-indigo-400/80 ring-1 ring-indigo-400/40'
                                : 'bg-white border-indigo-500 ring-1 ring-indigo-500/30'
                              : isConfirmed
                                ? isDark
                                  ? 'bg-emerald-950/20 border-emerald-500/35'
                                  : 'bg-emerald-50/50 border-emerald-200'
                                : cardCls
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleButtonConfirmed(btn.id);
                              }}
                              aria-label={
                                isConfirmed ? 'Odznacz potwierdzenie' : 'Potwierdź przycisk'
                              }
                              className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                                isConfirmed
                                  ? 'bg-emerald-600 border-emerald-500 text-white'
                                  : isDark
                                    ? 'border-slate-600 bg-slate-950 text-transparent hover:border-emerald-400'
                                    : 'border-slate-400 bg-white text-transparent hover:border-emerald-500'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>

                            <span
                              style={{ backgroundColor: shade.activeBorderHex }}
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                            />

                            <span
                              className={`text-[11px] font-bold tabular-nums shrink-0 ${mutedCls}`}
                            >
                              #{idx + 1}
                            </span>

                            <input
                              type="text"
                              value={btn.label}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                handleUpdateReviewButton(btn.id, { label: e.target.value })
                              }
                              className={`flex-1 min-w-0 rounded-lg border px-2 py-1 text-xs font-semibold outline-none ${inputCls}`}
                            />

                            <span
                              className={`text-[10px] font-bold uppercase shrink-0 ${
                                btn.source === 'manual' ? 'text-indigo-500' : mutedCls
                              }`}
                            >
                              {btn.source === 'manual' ? 'Ręczny' : 'AI'}
                            </span>

                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteReviewButton(btn.id);
                              }}
                              title="Usuń element"
                              className="p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors shrink-0"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-2 pl-7">
                            <select
                              value={btn.role}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                handleUpdateReviewButton(btn.id, {
                                  role: e.target.value as DetectedFrontendButton['role'],
                                })
                              }
                              className={`rounded-lg border px-2 py-1 text-[11px] font-medium outline-none ${inputCls}`}
                            >
                              {ROLE_OPTIONS.map((r) => (
                                <option key={r} value={r}>
                                  {ROLE_LABELS[r]}
                                </option>
                              ))}
                            </select>

                            <select
                              value={btn.zone}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) =>
                                handleUpdateReviewButton(btn.id, {
                                  zone: e.target.value as PrototypeDropZone,
                                })
                              }
                              className={`rounded-lg border px-2 py-1 text-[11px] font-medium outline-none ${inputCls}`}
                            >
                              {ZONE_OPTIONS.map((z) => (
                                <option key={z} value={z}>
                                  {PROTOTYPE_ZONE_LABELS[z]}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Editable AI-Synthesized Prompt Preview */}
            <div className={`rounded-xl border p-4 space-y-2 ${subCardCls}`}>
              <label htmlFor="analysis-generated-prompt" className="text-xs font-bold block">
                Wygenerowany prompt wynikowy (zostanie automatycznie przekazany do Kroku 03 po
                zatwierdzeniu elementów):
              </label>
              <textarea
                id="analysis-generated-prompt"
                value={editableAnalysisPrompt}
                onChange={(e) => setEditableAnalysisPrompt(e.target.value)}
                rows={3}
                className={`w-full rounded-xl border px-3 py-2 text-xs leading-relaxed outline-none ${inputCls}`}
              />
            </div>

            {/* STRICT MANUAL APPROVAL GATE BAR */}
            <div
              className={`rounded-2xl border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${
                step2Complete
                  ? isDark
                    ? 'bg-emerald-950/30 border-emerald-500/50'
                    : 'bg-emerald-50 border-emerald-300'
                  : isDark
                    ? 'bg-indigo-950/30 border-indigo-500/40'
                    : 'bg-indigo-50/80 border-indigo-200'
              }`}
            >
              <div className="space-y-1">
                <div className="text-sm font-bold flex items-center gap-2">
                  {step2Complete ? (
                    <>
                      <Unlock className="w-4 h-4 text-emerald-500" />
                      <span>
                        Zatwierdzono {confirmedButtons.length} elementów interaktywnych — praca nad
                        frontendem jest odblokowana
                      </span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4 text-amber-500" />
                      <span>
                        Potwierdź manualnie co najmniej 1 element interaktywny (
                        {reviewCounts.confirmed} z {reviewCounts.total})
                      </span>
                    </>
                  )}
                </div>
                <p className={`text-xs ${mutedCls}`}>
                  Zaznacz checkboxy przy właściwych przyciskach na liście (lub użyj „Potwierdź
                  wszystkie”), a następnie kliknij przycisk zatwierdzenia, aby odblokować Krok 03 i
                  pracę nad frontendem.
                </p>
              </div>

              <button
                type="button"
                disabled={confirmedButtons.length === 0}
                onClick={handleApproveInteractiveElements}
                className={`inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 transition-all ${
                  confirmedButtons.length > 0
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm'
                    : isDark
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <ShieldCheck className="w-4 h-4" />
                <span>
                  {step2Complete
                    ? `Zaktualizuj zatwierdzone elementy (${confirmedButtons.length})`
                    : `Zatwierdź elementy interaktywne (${confirmedButtons.length}) i odblokuj frontend`}
                </span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ===================================================================== */}
      {/* KROK 03: GENERATOR GRAFIK + WYTYCZNE + 3-5 STYLÓW (LOCKED UNTIL 02)   */}
      {/* ===================================================================== */}
      <section ref={step3Ref} className={`rounded-2xl border p-5 sm:p-6 ${cardCls}`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-200/70 dark:border-slate-800/80">
          <div className="flex items-center gap-3">
            <span
              className={`w-8 h-8 rounded-xl font-bold text-xs flex items-center justify-center tabular-nums shrink-0 ${
                step4Unlocked
                  ? 'bg-emerald-600 text-white'
                  : step3Unlocked
                    ? 'bg-indigo-600 text-white'
                    : isDark
                      ? 'bg-slate-800 text-slate-400'
                      : 'bg-slate-200 text-slate-500'
              }`}
            >
              {step4Unlocked ? (
                <Check className="w-4 h-4" />
              ) : step3Unlocked ? (
                '03'
              ) : (
                <Lock className="w-4 h-4" />
              )}
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight">
                Generator grafik + wytyczne budowy strony + 3–5 grafik stylu
              </h2>
              <p className={`text-xs ${mutedCls}`}>
                Wklej jednym kliknięciem prompt z zatwierdzonymi elementami, dodaj wytyczne oraz 3–5
                grafik referencyjnych (styl, głębia, tematyka) lub przejdź bezpośrednio na
                zatwierdzonym obrazie do Kroku 04.
              </p>
            </div>
          </div>

          {step3Unlocked && (
            <button
              type="button"
              onClick={handleOneClickPastePrompt}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold whitespace-nowrap shrink-0"
            >
              <ClipboardPaste className="w-3.5 h-3.5" />
              <span>
                {promptPastedBadge
                  ? 'Wklejono prompt z Kroku 02!'
                  : 'Wklej prompt z Kroku 02 (1 klik)'}
              </span>
            </button>
          )}
        </div>

        {!step3Unlocked ? (
          <div className={`mt-5 rounded-xl border p-6 flex items-center gap-4 ${subCardCls}`}>
            <Lock className="w-6 h-6 text-amber-500 shrink-0" />
            <div className="space-y-1">
              <div className="text-sm font-bold">
                Krok 03 zablokowany — najpierw zatwierdź elementy interaktywne w Kroku 02
              </div>
              <p className={`text-xs ${mutedCls}`}>
                Praca nad generacją i edycją frontendu może rozpocząć się dopiero po ręcznym
                potwierdzeniu wykrytych przycisków w poprzedniej sekcji.
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
              {/* Prompt + Website Guidelines */}
              <div className={`lg:col-span-7 rounded-2xl border p-4 space-y-4 ${subCardCls}`}>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="step3-generator-prompt" className="text-xs font-bold">
                      Prompt dla generatora grafik (uwzględnia {confirmedButtons.length}{' '}
                      zatwierdzonych elementów)
                    </label>
                    <div className="flex items-center gap-2">
                      <select
                        value={generatorModel}
                        onChange={(e) =>
                          setGeneratorModel(
                            e.target.value as
                              | 'gemini-nano-banana-2.1'
                              | 'gemini-3.1-flash-lite-image'
                              | 'gemini-3-pro-image-preview'
                          )
                        }
                        className={`rounded-lg border px-2 py-1 text-[11px] font-semibold outline-none ${inputCls}`}
                      >
                        <option value="gemini-nano-banana-2.1">Nano Banana 2.1</option>
                        <option value="gemini-3.1-flash-lite-image">Gemini Flash Image</option>
                        <option value="gemini-3-pro-image-preview">Gemini 3 Pro Image</option>
                      </select>
                      <select
                        value={generatorAspect}
                        onChange={(e) =>
                          setGeneratorAspect(e.target.value as '16:9' | '4:3' | '1:1' | '9:16')
                        }
                        className={`rounded-lg border px-2 py-1 text-[11px] font-semibold outline-none ${inputCls}`}
                      >
                        <option value="16:9">16:9</option>
                        <option value="4:3">4:3</option>
                        <option value="1:1">1:1</option>
                        <option value="9:16">9:16</option>
                      </select>
                    </div>
                  </div>
                  <textarea
                    id="step3-generator-prompt"
                    value={generatorPrompt}
                    onChange={(e) => setGeneratorPrompt(e.target.value)}
                    rows={4}
                    className={`w-full rounded-xl border px-3 py-2 text-xs leading-relaxed outline-none ${inputCls}`}
                  />
                </div>

                {/* Website build guidelines */}
                <div className="space-y-2">
                  <label htmlFor="step3-guidelines" className="text-xs font-bold block">
                    Wytyczne dla budowy strony (układ, typografia, głębia, kontrast):
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {WEBSITE_GUIDELINE_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => handleAppendGuidelinePreset(preset.text)}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold whitespace-nowrap shrink-0 transition-colors ${
                          isDark
                            ? 'border-slate-700 bg-slate-900 text-slate-300 hover:border-indigo-400'
                            : 'border-slate-300 bg-white text-slate-700 hover:border-indigo-500'
                        }`}
                      >
                        + {preset.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    id="step3-guidelines"
                    value={websiteBuildGuidelines}
                    onChange={(e) => setWebsiteBuildGuidelines(e.target.value)}
                    rows={3}
                    placeholder="Dodaj wytyczne dla układu, materiałów, kontrastu i struktury sekcji..."
                    className={`w-full rounded-xl border px-3 py-2 text-xs leading-relaxed outline-none ${inputCls}`}
                  />
                </div>
              </div>

              {/* 3-5 Style Reference Graphics */}
              <div className={`lg:col-span-5 rounded-2xl border p-4 space-y-3 ${subCardCls}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs font-bold">
                    Grafiki stylu, głębi i tematyki ({frontendStyleReferences.length}/5)
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleFillRecommended3StyleRefs()}
                      disabled={uploadingStyleRefs || frontendStyleReferences.length >= 5}
                      className={`px-2.5 py-1 rounded-lg border text-[11px] font-semibold whitespace-nowrap shrink-0 disabled:opacity-40 ${
                        isDark
                          ? 'border-slate-700 bg-slate-800 text-slate-200'
                          : 'border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      + 3 przykłady
                    </button>
                    {frontendStyleReferences.length > 0 && (
                      <button
                        type="button"
                        onClick={clearFrontendStyleReferences}
                        className="px-2 py-1 rounded-lg text-[11px] font-semibold text-rose-500 hover:bg-rose-500/10"
                      >
                        Wyczyść
                      </button>
                    )}
                  </div>
                </div>

                <input
                  ref={styleRefsInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) void handleUploadStyleReferenceFiles(e.target.files);
                    e.target.value = '';
                  }}
                />

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setStyleRefDragOver(true);
                  }}
                  onDragLeave={() => setStyleRefDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setStyleRefDragOver(false);
                    if (e.dataTransfer.files) {
                      void handleUploadStyleReferenceFiles(e.dataTransfer.files);
                    }
                  }}
                  onClick={() => styleRefsInputRef.current?.click()}
                  className={`rounded-xl border border-dashed p-3.5 text-center cursor-pointer transition-colors ${
                    styleRefDragOver
                      ? 'border-indigo-500 bg-indigo-500/10'
                      : isDark
                        ? 'border-slate-700 bg-slate-900/60 hover:border-indigo-400'
                        : 'border-slate-300 bg-white hover:border-indigo-500'
                  }`}
                >
                  {uploadingStyleRefs ? (
                    <span className="text-xs font-semibold inline-flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                      Przetwarzanie grafik referencyjnych…
                    </span>
                  ) : (
                    <span className={`text-xs ${mutedCls}`}>
                      Kliknij lub upuść 3–5 grafik referencyjnych (styl obrazu, głębia, tematyka)
                    </span>
                  )}
                </div>

                {frontendStyleReferences.length > 0 && (
                  <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                    {frontendStyleReferences.map((ref) => (
                      <div
                        key={ref.id}
                        className={`rounded-xl border p-2 flex items-center gap-2.5 ${cardCls}`}
                      >
                        <img
                          src={ref.dataUrl}
                          alt={ref.name}
                          className="w-12 h-9 rounded-md object-cover shrink-0 border border-slate-300/50 dark:border-slate-700"
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="text-[11px] font-semibold truncate">{ref.name}</div>
                          <select
                            value={ref.role}
                            onChange={(e) =>
                              updateFrontendStyleReferenceRole(
                                ref.id,
                                e.target.value as StyleReferenceRole
                              )
                            }
                            className={`w-full rounded-md border px-1.5 py-0.5 text-[10px] font-semibold outline-none ${inputCls}`}
                          >
                            {(Object.keys(STYLE_REF_ROLE_LABELS) as StyleReferenceRole[]).map(
                              (roleKey) => (
                                <option key={roleKey} value={roleKey}>
                                  {STYLE_REF_ROLE_LABELS[roleKey]}
                                </option>
                              )
                            )}
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFrontendStyleReference(ref.id)}
                          className="p-1 text-slate-400 hover:text-rose-500 shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {generatorError && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-xs text-rose-500 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{generatorError}</span>
              </div>
            )}

            {/* Step 3 Action Row */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                disabled={generatingFrontendImg}
                onClick={() => void handleGeneratePreparedFrontend()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-bold whitespace-nowrap shrink-0 transition-colors disabled:opacity-50"
              >
                {generatingFrontendImg ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                <span>
                  {generatingFrontendImg
                    ? 'Generowanie przygotowanego frontendu…'
                    : 'Wygeneruj przygotowany frontend AI'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => void handleApprovePreparedFrontend(false)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold whitespace-nowrap shrink-0 transition-colors ${
                  isDark
                    ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25'
                    : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                }`}
              >
                <Check className="w-4 h-4" />
                <span>Rozpocznij pracę bezpośrednio na zatwierdzonym obrazie (Krok 04)</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Generated comparison preview */}
            {generatedPreparedImage && (
              <div className={`rounded-2xl border p-4 space-y-4 ${subCardCls}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-bold text-emerald-500">
                    Wygenerowany frontend jest gotowy do zatwierdzenia
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleApprovePreparedFrontend(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold whitespace-nowrap shrink-0"
                  >
                    <Check className="w-4 h-4" />
                    <span>Zatwierdź wygenerowany frontend i przejdź do Kroku 04</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <div className={`text-[11px] font-semibold uppercase ${mutedCls}`}>
                      Obraz bazowy (Krok 01)
                    </div>
                    {activeProposed?.dataUrl && (
                      <img
                        src={activeProposed.dataUrl}
                        alt="Bazowy frontend"
                        className="w-full max-h-[300px] object-contain rounded-xl border border-slate-300/60 dark:border-slate-700 bg-slate-950/30"
                      />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <div className="text-[11px] font-semibold uppercase text-emerald-500">
                      Nowy przygotowany frontend AI (Krok 03)
                    </div>
                    <img
                      src={generatedPreparedImage}
                      alt="Wygenerowany frontend"
                      className="w-full max-h-[300px] object-contain rounded-xl border-2 border-emerald-500/60 bg-slate-950/30"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ===================================================================== */}
      {/* KROK 04: PRACA NAD ELEMENTAMI INTERAKTYWNYMI FRONTENDU (STRICT GATE)  */}
      {/* ===================================================================== */}
      <section ref={step4Ref} className={`rounded-2xl border p-5 sm:p-6 ${cardCls}`}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-slate-200/70 dark:border-slate-800/80">
          <div className="flex items-center gap-3">
            <span
              className={`w-8 h-8 rounded-xl font-bold text-xs flex items-center justify-center tabular-nums shrink-0 ${
                step4Unlocked
                  ? 'bg-emerald-600 text-white'
                  : isDark
                    ? 'bg-slate-800 text-slate-400'
                    : 'bg-slate-200 text-slate-500'
              }`}
            >
              {step4Unlocked ? '04' : <Lock className="w-4 h-4" />}
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight">
                Praca nad elementami interaktywnymi frontendu
              </h2>
              <p className={`text-xs ${mutedCls}`}>
                Dopasowuj odcienie, strefy i komponenty interaktywne zsynchronizowane kolorem z
                zatwierdzonymi obszarami na obrazie.
              </p>
            </div>
          </div>

          {step4Unlocked && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onEnterStudioTab('dashboard')}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold whitespace-nowrap shrink-0"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Pulpit Główny</span>
              </button>
              <button
                type="button"
                onClick={() => onEnterStudioTab('screens')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold whitespace-nowrap shrink-0 ${
                  isDark
                    ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                    : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
                }`}
              >
                <span>Mapa Ekranów</span>
              </button>
              <button
                type="button"
                onClick={() => onEnterStudioTab('ui-library')}
                className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold whitespace-nowrap shrink-0 ${
                  isDark
                    ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                    : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
                }`}
              >
                <span>Biblioteka UI</span>
              </button>
            </div>
          )}
        </div>

        {!step4Unlocked ? (
          <div className={`mt-5 rounded-xl border p-6 flex items-center gap-4 ${subCardCls}`}>
            <Lock className="w-6 h-6 text-amber-500 shrink-0" />
            <div className="space-y-1">
              <div className="text-sm font-bold">
                Praca nad frontendem jest zablokowana do momentu zatwierdzenia elementów
              </div>
              <p className={`text-xs ${mutedCls}`}>
                Ukończ Krok 01 (grafika + wymagany prompt), ręcznie potwierdź i zatwierdź elementy
                interaktywne w Kroku 02, a następnie zatwierdź przygotowany frontend w Kroku 03.
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Synchronized Preview Canvas with Color-Coded Active Regions */}
            <div className={`lg:col-span-7 rounded-2xl border p-4 space-y-3 ${subCardCls}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-bold flex items-center gap-2">
                  <Palette className="w-4 h-4 text-indigo-500" />
                  <span>
                    Podgląd roboczy frontendu ({workingFrontendImage?.regions.length || 0}{' '}
                    zatwierdzonych stref)
                  </span>
                </div>
                {activeModifiedElement && activeShadeSpec && (
                  <span
                    style={{
                      borderColor: activeShadeSpec.activeBorderHex,
                      color: isDark ? activeShadeSpec.hexDark : activeShadeSpec.hexLight,
                    }}
                    className="text-[11px] font-bold border px-2 py-0.5 rounded-md"
                  >
                    Modyfikowany: {activeModifiedElement.label}
                  </span>
                )}
              </div>

              <div
                className={`rounded-xl border p-2 flex justify-center overflow-auto ${
                  isDark ? 'bg-slate-950 border-slate-800' : 'bg-slate-100/80 border-slate-200'
                }`}
              >
                <div className="relative inline-block max-w-full">
                  {workingFrontendImage?.dataUrl && (
                    <img
                      src={workingFrontendImage.dataUrl}
                      alt={workingFrontendImage.fileName}
                      className="block max-h-[500px] w-auto max-w-full rounded-lg"
                    />
                  )}
                  {(workingFrontendImage?.regions || []).map((reg, idx) => {
                    const shade = getShadeSpec(reg.shadeId, idx);
                    const isActive =
                      activeRegionId === reg.id ||
                      (activeModifiedElement?.id &&
                        activeModifiedElement.id === reg.linkedElementId);

                    return (
                      <button
                        key={reg.id}
                        type="button"
                        onClick={() => {
                          setActiveRegionId(reg.id);
                          markElementAsActivelyModified({
                            id: reg.linkedElementId || reg.id,
                            kind: 'region',
                            label: reg.label,
                            shadeId: reg.shadeId,
                            zone: reg.zone,
                            screenId: activeScreenNode?.id,
                            sourceSurface: 'start-workspace',
                          });
                          playStudioClick(0.6);
                        }}
                        style={{
                          left: `${reg.xPct}%`,
                          top: `${reg.yPct}%`,
                          width: `${reg.wPct}%`,
                          height: `${reg.hPct}%`,
                          borderColor: shade.activeBorderHex,
                          backgroundColor: isActive
                            ? shade.activeOverlayFill
                            : `${shade.activeBorderHex}22`,
                          boxShadow: isActive ? shade.activeGlowShadow : undefined,
                        }}
                        className="absolute rounded-md border-2 transition-all text-left"
                      >
                        <span
                          style={{ backgroundColor: shade.badgeBgHex }}
                          className="absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[10px] font-bold text-white whitespace-nowrap max-w-[160px] truncate"
                        >
                          {reg.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Interactive Components & Multi-Shade Controls */}
            <div className={`lg:col-span-5 rounded-2xl border p-4 space-y-4 ${subCardCls}`}>
              {/* Active screen selector */}
              <div className="flex items-center justify-between gap-2">
                <label className="text-xs font-bold">Ekran docelowy:</label>
                <select
                  value={activeScreenNode?.id || ''}
                  onChange={(e) => setActivePreviewScreenId(e.target.value)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-semibold outline-none ${inputCls}`}
                >
                  {activeScreenMap.nodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.title} ({node.route})
                    </option>
                  ))}
                </select>
              </div>

              {/* Composed interactive elements with synchronized shade picker */}
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {activeWidgets.map((widget, idx) => {
                  const shadeId =
                    composedElementShades[widget.instanceId] ||
                    FRONTEND_ELEMENT_SHADE_ORDER[idx % FRONTEND_ELEMENT_SHADE_ORDER.length];
                  const shade = FRONTEND_ELEMENT_SHADES[shadeId];
                  const isActive = activeModifiedElement?.id === widget.instanceId;

                  return (
                    <div
                      key={widget.instanceId}
                      onClick={() => handleSelectWidget(widget, idx)}
                      style={{
                        borderColor: isActive ? shade.activeBorderHex : undefined,
                      }}
                      className={`rounded-xl border p-2.5 space-y-2 cursor-pointer transition-all ${cardCls}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            style={{ backgroundColor: shade.activeBorderHex }}
                            className="w-3 h-3 rounded-full shrink-0"
                          />
                          <span className="text-xs font-bold truncate">{widget.label}</span>
                        </div>
                        <span className={`text-[10px] font-semibold uppercase ${mutedCls}`}>
                          {PROTOTYPE_ZONE_LABELS[widget.zone]}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        {FRONTEND_ELEMENT_SHADE_ORDER.map((sId) => {
                          const s = FRONTEND_ELEMENT_SHADES[sId];
                          return (
                            <button
                              key={sId}
                              type="button"
                              title={s.labelPl}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleAssignWidgetShade(widget, sId);
                              }}
                              style={{ backgroundColor: s.activeBorderHex }}
                              className={`w-4 h-4 rounded-full transition-transform ${
                                shadeId === sId
                                  ? 'ring-2 ring-offset-1 ring-indigo-500 scale-110'
                                  : 'opacity-70 hover:opacity-100'
                              }`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Quick-add interactive widget */}
              <div className="pt-2 border-t border-slate-200/70 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold">Dodaj element interaktywny do strefy:</span>
                  <select
                    value={quickAddZone}
                    onChange={(e) => setQuickAddZone(e.target.value as PrototypeDropZone)}
                    className={`rounded-lg border px-2 py-1 text-[11px] font-semibold outline-none ${inputCls}`}
                  >
                    {ZONE_OPTIONS.map((z) => (
                      <option key={z} value={z}>
                        {PROTOTYPE_ZONE_LABELS[z]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {TACTILE_UI_CATALOG.slice(0, 6).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleQuickAddCatalogWidget(item.id)}
                      className={`px-2.5 py-2 rounded-lg border text-[11px] font-semibold text-left truncate transition-colors ${
                        isDark
                          ? 'border-slate-700 bg-slate-900 hover:border-indigo-400 text-slate-200'
                          : 'border-slate-300 bg-white hover:border-indigo-500 text-slate-800'
                      }`}
                    >
                      + {item.labelPl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Region delete helper if a region is selected */}
              {activeRegionId && (
                <div className="flex items-center justify-between pt-2 border-t border-slate-200/70 dark:border-slate-800 text-xs">
                  <span className={mutedCls}>
                    Aktywny projekt: {generatedElements.length} komponentów · {patterns.length}{' '}
                    wzorców · głębia {depth.elevation}px
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      removeFrontendImageRegion(activeRegionId);
                      setActiveRegionId(null);
                    }}
                    className="inline-flex items-center gap-1 text-rose-500 font-semibold hover:underline"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Usuń zaznaczoną strefę</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ===================================================================== */}
      {/* OPCJONALNY PANEL ZAPISU LOKALNEGO (ZWINIĘTY DOMYŚLNIE)                */}
      {/* ===================================================================== */}
      <section className={`rounded-2xl border ${cardCls}`}>
        <button
          type="button"
          onClick={() => setDiskPanelOpen((v) => !v)}
          className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-left"
        >
          <div className="flex items-center gap-2.5">
            <HardDriveDownload className="w-4 h-4 text-indigo-500" />
            <span className="text-xs sm:text-sm font-bold">
              Opcjonalnie: Zapis przestrzeni roboczej na dysku lokalnym
            </span>
            <span className={`text-xs ${mutedCls}`}>
              ({localDiskConfig.directoryName || 'Brak wybranego folderu'})
            </span>
          </div>
          {diskPanelOpen ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {diskPanelOpen && (
          <div className="px-5 pb-5 pt-2 border-t border-slate-200/70 dark:border-slate-800/80 space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={diskBusy}
                onClick={() => void handleSelectDirectory()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold whitespace-nowrap shrink-0"
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span>Wybierz folder na dysku</span>
              </button>

              <button
                type="button"
                disabled={diskBusy}
                onClick={() => void handleSaveNow(false)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold whitespace-nowrap shrink-0 ${
                  isDark
                    ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                    : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-100'
                }`}
              >
                <HardDriveDownload className="w-3.5 h-3.5" />
                <span>Zapisz teraz (JSON)</span>
              </button>

              <label className="inline-flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={localDiskConfig.autoSaveOnChange}
                  onChange={(e) =>
                    updateLocalDiskConfig({ autoSaveOnChange: e.target.checked })
                  }
                />
                <span>Autozapis zmian</span>
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={fallbackFolderInput}
                onChange={(e) => setFallbackFolderInput(e.target.value)}
                placeholder="Nazwa folderu projektu"
                className={`rounded-lg border px-3 py-1.5 text-xs outline-none ${inputCls}`}
              />
              <button
                type="button"
                onClick={() => linkLocalDirectoryNameFallback(fallbackFolderInput)}
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                  isDark
                    ? 'border-slate-700 bg-slate-800 text-slate-200'
                    : 'border-slate-300 bg-slate-100 text-slate-800'
                }`}
              >
                Ustaw nazwę folderu
              </button>
            </div>

            {diskFeedback && (
              <div className={`text-xs font-medium ${mutedCls}`}>{diskFeedback}</div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
