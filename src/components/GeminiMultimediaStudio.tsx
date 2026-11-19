import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  Film,
  ImagePlus,
  Loader2,
  Mic,
  PhoneOff,
  ScanEye,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { useStudio } from '../context/StudioContext';
import { compressImageDataUrlForApi } from '../lib/localDiskWorkspace';
import { studioApiFetch } from '../lib/offlineStudioEngines';
import { isRunningAsStandaloneHtmlFile } from '../hooks/usePWAInstall';
import { HapticMaterialType, StyleReferenceRole } from '../types/studio';
import { ProgressiveImage } from './ui/ProgressiveImage';

const ASPECT_RATIOS = [
  '1:1',
  '2:3',
  '3:2',
  '3:4',
  '4:3',
  '9:16',
  '16:9',
  '21:9',
] as const;

const IMAGE_SIZES = ['1K', '2K', '4K'] as const;

function floatTo16BitPCMBase64(float32Array: Float32Array): string {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export const GeminiMultimediaStudio: React.FC = () => {
  const {
    palette,
    depth,
    updateDepth,
    haptic,
    updateHaptic,
    selectMaterialProfile,
    addMediaAsset,
    pendingImageGeneratorDraft,
    setPendingImageGeneratorDraft,
    websiteBuildGuidelines,
    setWebsiteBuildGuidelines,
    frontendStyleReferences,
    addFrontendStyleReferences,
    removeFrontendStyleReference,
    updateFrontendStyleReferenceRole,
    frontendButtonAnalysis,
    applyPreparedFrontendToWorkspace,
  } = useStudio();

  const [loadedFromScreenTitle, setLoadedFromScreenTitle] = useState<string | null>(
    null
  );
  const [detectedButtonCount, setDetectedButtonCount] = useState<number | null>(
    frontendButtonAnalysis?.buttonCount ?? null
  );
  const [approvedNotice, setApprovedNotice] = useState<string | null>(null);

  // Image Create & Edit State
  const [imgPrompt, setImgPrompt] = useState(
    'Makro render szklanego przycisku „Dalej” z iryzującą falą światła pod palcem, perłowe tło, miękkie światło studyjne'
  );
  const [imgModel, setImgModel] = useState<
    'gemini-nano-banana-2.1' | 'gemini-3.1-flash-lite-image' | 'gemini-3-pro-image-preview'
  >('gemini-nano-banana-2.1');
  const [imgSize, setImgSize] = useState<(typeof IMAGE_SIZES)[number]>('1K');
  const [imgAspect, setImgAspect] = useState<(typeof ASPECT_RATIOS)[number]>('16:9');
  const [editSourceImg, setEditSourceImg] = useState<{
    base64: string;
    mime: string;
    name?: string;
  } | null>(null);
  const [imgLoading, setImgLoading] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [imgError, setImgError] = useState<string | null>(null);

  useEffect(() => {
    if (!pendingImageGeneratorDraft) return;
    setImgPrompt(pendingImageGeneratorDraft.prompt);
    setImgAspect(pendingImageGeneratorDraft.aspectRatio);
    setLoadedFromScreenTitle(pendingImageGeneratorDraft.screenTitle || 'Mapa Ekranów');
    if (pendingImageGeneratorDraft.websiteGuidelines) {
      setWebsiteBuildGuidelines(pendingImageGeneratorDraft.websiteGuidelines);
    }
    if (pendingImageGeneratorDraft.sourceImage) {
      setEditSourceImg(pendingImageGeneratorDraft.sourceImage);
    }
    if (
      Array.isArray(pendingImageGeneratorDraft.styleReferences) &&
      pendingImageGeneratorDraft.styleReferences.length > 0 &&
      frontendStyleReferences.length === 0
    ) {
      addFrontendStyleReferences(pendingImageGeneratorDraft.styleReferences);
    }
    if (typeof pendingImageGeneratorDraft.detectedButtonCount === 'number') {
      setDetectedButtonCount(pendingImageGeneratorDraft.detectedButtonCount);
    }
    setPendingImageGeneratorDraft(null);
  }, [
    pendingImageGeneratorDraft,
    setPendingImageGeneratorDraft,
    setWebsiteBuildGuidelines,
    frontendStyleReferences.length,
    addFrontendStyleReferences,
  ]);

  // Video Omni Flash State
  const [vidPrompt, setVidPrompt] = useState(
    'Płynny ruch kamery wokół żłobionej perłowej sfery ze szkła matowego z delikatnymi cząsteczkami światła'
  );
  const [vidAspect, setVidAspect] = useState<'16:9' | '9:16'>('16:9');
  const [vidSourceImg, setVidSourceImg] = useState<{
    base64: string;
    mime: string;
  } | null>(null);
  const [vidLoading, setVidLoading] = useState(false);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState<string | null>(null);
  const [vidError, setVidError] = useState<string | null>(null);

  // Image Analysis State (Gemini Vision)
  const [analyzeSource, setAnalyzeSource] = useState<{
    base64: string;
    mime: string;
    name?: string;
  } | null>(null);
  const [analyzeLoading, setAnalyzeLoading] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<{
    summary: string;
    recognizedElements?: string[];
    recognizedTexts?: string[];
    detectedColors?: string[];
    suggestedMaterial: HapticMaterialType;
    suggestedHardness: number;
    suggestedGlassBlur: number;
    suggestedElevation: number;
    extractedPrompt: string;
    modelUsed?: string;
  } | null>(null);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // Live API Voice Conversation State (gemini-3.8-live)
  const [liveConnected, setLiveConnected] = useState(false);
  const [liveConnecting, setLiveConnecting] = useState(false);
  const [liveTranscripts, setLiveTranscripts] = useState<
    Array<{ role: 'user' | 'model'; text: string }>
  >([]);
  const [liveError, setLiveError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const inputAudioCtxRef = useRef<AudioContext | null>(null);
  const outputAudioCtxRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  const isDark = palette === 'emerald-clinic';

  const cardSurfaceStyle: React.CSSProperties = {
    borderRadius: `${depth.borderRadius}px`,
    backdropFilter: `blur(${depth.glassBlur}px)`,
    backgroundColor: isDark
      ? `rgba(11, 34, 29, ${depth.glassOpacity})`
      : `rgba(255, 255, 255, ${depth.glassOpacity})`,
    boxShadow: isDark
      ? `0 ${depth.elevation}px ${depth.blur}px rgba(0,0,0,0.45)`
      : `0 ${depth.elevation}px ${depth.blur}px rgba(88, 76, 148, 0.12)`,
  };

  const readFileAsBase64 = (
    file: File,
    cb: (res: { base64: string; mime: string; name?: string }) => void
  ) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const raw = String(reader.result || '');
      try {
        const optimized = await compressImageDataUrlForApi(raw, 1024, 0.85);
        cb({
          base64: optimized.dataUrl,
          mime: optimized.mimeType || 'image/jpeg',
          name: file.name,
        });
      } catch {
        cb({
          base64: raw,
          mime: file.type || 'image/jpeg',
          name: file.name,
        });
      }
    };
    reader.readAsDataURL(file);
  };

  const handleUploadStyleRefs = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remainingSlots = Math.max(0, 5 - frontendStyleReferences.length);
    if (remainingSlots <= 0) return;
    const defaultRoles = [
      'styl-obrazu',
      'glebia-swiatlo',
      'tematyka-klimat',
      'kompozycja-ui',
      'styl-obrazu',
    ] as const;

    const toProcess = Array.from(files).slice(0, remainingSlots);
    const loaded = await Promise.all(
      toProcess.map(
        (file, idx) =>
          new Promise<{
            id: string;
            name: string;
            mimeType: string;
            dataUrl: string;
            role: (typeof defaultRoles)[number];
            sizeKb: number;
          } | null>((resolve) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                id: `style_ref_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
                name: file.name,
                mimeType: file.type || 'image/jpeg',
                dataUrl: String(reader.result),
                role: defaultRoles[(frontendStyleReferences.length + idx) % defaultRoles.length],
                sizeKb: Math.max(1, Math.round(file.size / 1024)),
              });
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
          })
      )
    );
    const valid = loaded.filter((item): item is NonNullable<typeof item> => Boolean(item));
    if (valid.length > 0) {
      addFrontendStyleReferences(valid);
    }
  };

  const handleGenerateOrEditImage = async (e: React.FormEvent) => {
    e.preventDefault();
    setImgLoading(true);
    setImgError(null);
    setApprovedNotice(null);
    try {
      const resp = await studioApiFetch('/api/gemini/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imgPrompt,
          websiteGuidelines: websiteBuildGuidelines,
          detectedButtonCount: detectedButtonCount ?? frontendButtonAnalysis?.buttonCount,
          model: imgModel,
          imageSize: imgSize,
          aspectRatio: imgAspect,
          sourceImageBase64: editSourceImg?.base64,
          sourceMimeType: editSourceImg?.mime,
          styleReferenceImages: frontendStyleReferences.slice(0, 5).map((ref) => ({
            base64: ref.dataUrl,
            mimeType: ref.mimeType,
            role: ref.role,
            name: ref.name,
          })),
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Błąd generowania obrazu.');
      setGeneratedImage(data.imageUrl);
      await addMediaAsset({
        title: editSourceImg
          ? 'Przygotowany Frontend AI'
          : 'Render Obrazu Gemini',
        subtitle: `${imgModel === 'gemini-3-pro-image-preview' ? 'Pro Image' : imgModel === 'gemini-3.1-flash-lite-image' ? 'Flash Lite Image' : 'Nano Banana 2.1'} · ${imgAspect} · ${imgSize}${frontendStyleReferences.length > 0 ? ` · ${frontendStyleReferences.length} ref.` : ''}`,
        category: 'AI Studio Render',
        mediaType: 'image',
        aspectRatio: imgAspect,
        resolution: imgSize,
        prompt: imgPrompt,
        src: data.imageUrl,
        audioFreq: 86,
      });
    } catch (err: unknown) {
      setImgError(err instanceof Error ? err.message : 'Błąd generowania obrazu.');
    } finally {
      setImgLoading(false);
    }
  };

  const handleGenerateVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    setVidLoading(true);
    setVidError(null);
    try {
      const resp = await studioApiFetch('/api/gemini/generate-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: vidPrompt,
          aspectRatio: vidAspect,
          sourceImageBase64: vidSourceImg?.base64,
          sourceMimeType: vidSourceImg?.mime,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Błąd generowania wideo.');
      setGeneratedVideoUrl(data.videoUrl);
      await addMediaAsset({
        title: vidSourceImg ? 'Animacja Zdjęcia Omni' : 'Wideo Omni Flash',
        subtitle: `Omni 1.2 Flash · ${vidAspect} · 720p`,
        category: 'Omni Video',
        mediaType: 'video',
        aspectRatio: vidAspect,
        resolution: '720p',
        prompt: vidPrompt,
        src: data.videoUrl,
        audioFreq: 86,
      });
    } catch (err: unknown) {
      setVidError(err instanceof Error ? err.message : 'Błąd generowania wideo.');
    } finally {
      setVidLoading(false);
    }
  };

  const handleAnalyzePhoto = async () => {
    if (!analyzeSource) return;
    setAnalyzeLoading(true);
    setAnalyzeError(null);
    try {
      const resp = await studioApiFetch('/api/gemini/analyze-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: analyzeSource.base64,
          mimeType: analyzeSource.mime,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Błąd analizy obrazu.');

      const validMat: HapticMaterialType = [
        'shiny-glass',
        'frosted-glass',
        'matte-metal',
        'abs-plastic',
        'suede',
      ].includes(data.suggestedMaterial)
        ? data.suggestedMaterial
        : 'frosted-glass';

      setAnalysisResult({
        summary: data.summary,
        recognizedElements: Array.isArray(data.recognizedElements)
          ? data.recognizedElements
          : [],
        recognizedTexts: Array.isArray(data.recognizedTexts)
          ? data.recognizedTexts
          : [],
        detectedColors: Array.isArray(data.detectedColors)
          ? data.detectedColors
          : [],
        suggestedMaterial: validMat,
        suggestedHardness: Math.max(0, Math.min(100, Number(data.suggestedHardness) || 74)),
        suggestedGlassBlur: Math.max(6, Math.min(36, Number(data.suggestedGlassBlur) || 20)),
        suggestedElevation: Math.max(4, Math.min(40, Number(data.suggestedElevation) || 20)),
        extractedPrompt: data.extractedPrompt,
        modelUsed: data.modelUsed,
      });
    } catch (err: unknown) {
      setAnalyzeError(err instanceof Error ? err.message : 'Błąd analizy zdjęcia.');
    } finally {
      setAnalyzeLoading(false);
    }
  };

  const stopLiveSession = () => {
    activeSourcesRef.current.forEach((s) => {
      try {
        s.stop();
      } catch {
        // Ignore
      }
    });
    activeSourcesRef.current = [];

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (inputAudioCtxRef.current) {
      inputAudioCtxRef.current.close().catch(() => {});
      inputAudioCtxRef.current = null;
    }
    if (outputAudioCtxRef.current) {
      outputAudioCtxRef.current.close().catch(() => {});
      outputAudioCtxRef.current = null;
    }
    setLiveConnected(false);
    setLiveConnecting(false);
  };

  useEffect(() => {
    return () => stopLiveSession();
  }, []);

  const play24kHzPcmChunk = (base64Pcm: string) => {
    const outCtx = outputAudioCtxRef.current;
    if (!outCtx) return;

    const binary = window.atob(base64Pcm);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    const sampleCount = Math.floor(bytes.byteLength / 2);
    const view = new DataView(bytes.buffer);
    const audioBuffer = outCtx.createBuffer(1, sampleCount, 24000);
    const channel = audioBuffer.getChannelData(0);
    for (let i = 0; i < sampleCount; i++) {
      channel[i] = view.getInt16(i * 2, true) / 32768;
    }

    const source = outCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(outCtx.destination);

    const startAt = Math.max(outCtx.currentTime, nextStartTimeRef.current);
    source.start(startAt);
    nextStartTimeRef.current = startAt + audioBuffer.duration;
    activeSourcesRef.current.push(source);
  };

  const startLiveSession = async () => {
    setLiveError(null);
    if (isRunningAsStandaloneHtmlFile() || (typeof navigator !== 'undefined' && !navigator.onLine)) {
      setLiveError(
        'Strumieniowa rozmowa głosowa Live API wymaga połączenia online z serwerem WebSocket. W trybie Offline używaj generatora obrazów, skanera zdjęć, syntezatora i mapy ekranów.'
      );
      return;
    }
    setLiveConnecting(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;

      const inCtx = new AudioContext({ sampleRate: 16000 });
      const outCtx = new AudioContext({ sampleRate: 24000 });
      inputAudioCtxRef.current = inCtx;
      outputAudioCtxRef.current = outCtx;
      nextStartTimeRef.current = outCtx.currentTime;

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws/live`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'ready') {
            setLiveConnected(true);
            setLiveConnecting(false);
          } else if (msg.type === 'audio' && msg.audio) {
            play24kHzPcmChunk(msg.audio);
          } else if (msg.type === 'interrupted') {
            activeSourcesRef.current.forEach((s) => {
              try {
                s.stop();
              } catch {
                // Ignore
              }
            });
            activeSourcesRef.current = [];
            if (outputAudioCtxRef.current) {
              nextStartTimeRef.current = outputAudioCtxRef.current.currentTime;
            }
          } else if (msg.type === 'inputTranscript' && msg.text) {
            setLiveTranscripts((prev) => [...prev.slice(-8), { role: 'user', text: msg.text }]);
          } else if (msg.type === 'outputTranscript' && msg.text) {
            setLiveTranscripts((prev) => [...prev.slice(-8), { role: 'model', text: msg.text }]);
          } else if (msg.type === 'error') {
            setLiveError(msg.message || 'Błąd połączenia Live API.');
            stopLiveSession();
          }
        } catch {
          // Ignore malformed WS packet
        }
      };

      ws.onerror = () => {
        setLiveError('Nie udało się nawiązać sesji głosowej Live API.');
        stopLiveSession();
      };

      ws.onclose = () => {
        setLiveConnected(false);
        setLiveConnecting(false);
      };

      const source = inCtx.createMediaStreamSource(stream);
      const processor = inCtx.createScriptProcessor(4096, 1, 1);
      source.connect(processor);
      processor.connect(inCtx.destination);

      processor.onaudioprocess = (ev) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          const base64Audio = floatTo16BitPCMBase64(ev.inputBuffer.getChannelData(0));
          wsRef.current.send(JSON.stringify({ audio: base64Audio }));
        }
      };
    } catch {
      setLiveError('Brak uprawnień do mikrofonu lub błąd inicjalizacji audio.');
      stopLiveSession();
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* 1. Image Creation & Editing (1K, 2K, 4K + All 8 Aspect Ratios) */}
      <section
        style={cardSurfaceStyle}
        className="lg:col-span-6 p-6 sm:p-8 border border-white/80 dark:border-emerald-400/20 space-y-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500 dark:text-emerald-300/80 flex items-center gap-1.5">
              <span>Nano Banana 2.1 & Pro Image</span>
              <span aria-hidden="true">·</span>
              <span>1K · 2K · 4K</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-emerald-50 mt-1">
              Generowanie i Edycja Obrazów UI
            </h2>
          </div>
          <ImagePlus className="w-5 h-5 text-indigo-600 dark:text-emerald-300 shrink-0" />
        </div>

        <form onSubmit={handleGenerateOrEditImage} className="space-y-4">
          {(loadedFromScreenTitle || detectedButtonCount !== null) && (
            <div className="px-3.5 py-2.5 rounded-xl bg-indigo-50/85 dark:bg-emerald-950/80 border border-indigo-200/80 dark:border-emerald-400/30 text-xs text-slate-800 dark:text-emerald-100 flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono tabular-nums">
                {loadedFromScreenTitle
                  ? `Wklejono prompt z: ${loadedFromScreenTitle}`
                  : 'Kontekst analizy obrazu'}
                {detectedButtonCount !== null
                  ? ` · Wykryto przycisków: ${detectedButtonCount}`
                  : ''}
              </span>
              {loadedFromScreenTitle && (
                <button
                  type="button"
                  onClick={() => setLoadedFromScreenTitle(null)}
                  className="text-slate-500 dark:text-emerald-300 hover:underline cursor-pointer shrink-0"
                >
                  Ukryj
                </button>
              )}
            </div>
          )}

          {/* Model Switch */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(
              [
                ['gemini-nano-banana-2.1', 'Nano Banana 2.1 (Domyślny)'],
                ['gemini-3.1-flash-lite-image', 'Flash Lite Image (Szybki)'],
                ['gemini-3-pro-image-preview', 'Pro Image (Jakość Studyjna)'],
              ] as const
            ).map(([mId, label]) => (
              <button
                key={mId}
                type="button"
                onClick={() => setImgModel(mId)}
                className={`py-2 px-3 rounded-xl text-xs font-medium border cursor-pointer truncate ${
                  imgModel === mId
                    ? isDark
                      ? 'bg-emerald-400 text-emerald-950 border-emerald-300'
                      : 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white/60 dark:bg-emerald-950/50 border-slate-200 dark:border-emerald-400/20 text-slate-700 dark:text-emerald-100'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Size & Aspect Ratio Controls */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-slate-700 dark:text-emerald-200">
                Rozdzielczość i proporcje obrazu
              </span>
              <div className="flex items-center gap-1">
                {IMAGE_SIZES.map((sz) => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setImgSize(sz)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold cursor-pointer ${
                      imgSize === sz
                        ? 'bg-indigo-600 text-white dark:bg-emerald-400 dark:text-emerald-950'
                        : 'bg-white/65 dark:bg-emerald-950/60 text-slate-600 dark:text-emerald-200'
                    }`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5">
              {ASPECT_RATIOS.map((ar) => (
                <button
                  key={ar}
                  type="button"
                  onClick={() => setImgAspect(ar)}
                  className={`py-1.5 rounded-lg text-[11px] font-mono cursor-pointer border ${
                    imgAspect === ar
                      ? 'bg-indigo-100 border-indigo-500 text-indigo-950 dark:bg-emerald-800 dark:border-emerald-300 dark:text-emerald-50'
                      : 'bg-white/50 dark:bg-emerald-950/40 border-slate-200/70 dark:border-emerald-400/15 text-slate-600 dark:text-emerald-200/80'
                  }`}
                >
                  {ar}
                </button>
              ))}
            </div>
          </div>

          {/* Optional Source Image for Editing */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="px-3.5 py-2 rounded-xl bg-white/75 dark:bg-emerald-950/70 border border-slate-200 dark:border-emerald-400/25 text-xs font-medium text-slate-700 dark:text-emerald-100 inline-flex items-center gap-2 cursor-pointer">
              <Upload className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate max-w-[260px]">
                {editSourceImg
                  ? `Bazowy obraz: ${editSourceImg.name || 'wgrany frontend'}`
                  : 'Opcjonalnie: prześlij obraz bazowy frontendu'}
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) readFileAsBase64(f, setEditSourceImg);
                }}
                className="hidden"
              />
            </label>
            {editSourceImg && (
              <button
                type="button"
                onClick={() => setEditSourceImg(null)}
                className="text-xs text-rose-600 dark:text-rose-300 underline cursor-pointer"
              >
                Usuń obraz bazowy
              </button>
            )}
          </div>

          {/* Main Prompt (auto-pasted from Step 2) */}
          <div className="space-y-1.5">
            <label
              htmlFor="gemini-studio-main-prompt"
              className="block text-xs font-medium text-slate-700 dark:text-emerald-200"
            >
              Prompt wygenerowany z obrazu bazowego
            </label>
            <textarea
              id="gemini-studio-main-prompt"
              rows={3}
              value={imgPrompt}
              onChange={(e) => setImgPrompt(e.target.value)}
              placeholder="Opisz scenę lub wklej 1-klikiem prompt z analizy obrazu frontendu..."
              className="w-full p-3.5 rounded-2xl text-sm bg-white/80 dark:bg-emerald-950/70 border border-slate-200 dark:border-emerald-400/25 text-slate-900 dark:text-emerald-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Website Build Guidelines */}
          <div className="space-y-1.5">
            <label
              htmlFor="gemini-studio-guidelines"
              className="block text-xs font-medium text-slate-700 dark:text-emerald-200"
            >
              Wytyczne dla budowy strony (układ, kontrast, typografia, hierarchia)
            </label>
            <textarea
              id="gemini-studio-guidelines"
              rows={2}
              value={websiteBuildGuidelines}
              onChange={(e) => setWebsiteBuildGuidelines(e.target.value)}
              placeholder="Np. Siatka 12 kolumn, wyraźne przyciski CTA, styl matowego szkła, kontrast WCAG AA..."
              className="w-full p-3 rounded-2xl text-xs bg-white/80 dark:bg-emerald-950/70 border border-slate-200 dark:border-emerald-400/25 text-slate-900 dark:text-emerald-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* 3-5 Additional Reference Graphics (Style, Depth & Theme) */}
          <div className="p-3.5 rounded-2xl bg-white/65 dark:bg-emerald-950/55 border border-slate-200/80 dark:border-emerald-400/20 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs">
                <span className="font-semibold text-slate-900 dark:text-emerald-50">
                  Dodatkowe grafiki referencyjne (styl, głębia, tematyka)
                </span>
                <span className="mx-1.5 text-slate-400" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono tabular-nums text-slate-600 dark:text-emerald-200/85">
                  {frontendStyleReferences.length} / 5 (zalecane 3–5)
                </span>
              </div>

              <label
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
                  frontendStyleReferences.length >= 5
                    ? 'bg-slate-200 dark:bg-emerald-900/40 text-slate-500 pointer-events-none'
                    : 'bg-indigo-600 dark:bg-emerald-400 text-white dark:text-emerald-950 hover:opacity-95'
                }`}
              >
                <ImagePlus className="w-3.5 h-3.5 shrink-0" />
                <span>Dodaj grafiki (max 5)</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={frontendStyleReferences.length >= 5}
                  onChange={(e) => {
                    void handleUploadStyleRefs(e.target.files);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
              </label>
            </div>

            {frontendStyleReferences.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {frontendStyleReferences.map((refImg) => (
                  <div
                    key={refImg.id}
                    className="p-2 rounded-xl bg-white/85 dark:bg-emerald-950/80 border border-slate-200/80 dark:border-emerald-400/20 flex items-center gap-2.5"
                  >
                    <img
                      src={refImg.dataUrl}
                      alt={refImg.name}
                      className="w-11 h-11 rounded-lg object-cover shrink-0 border border-slate-200/70 dark:border-emerald-400/25"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-[11px] font-medium text-slate-800 dark:text-emerald-100 truncate">
                        {refImg.name}
                      </p>
                      <select
                        aria-label={`Rola grafiki ${refImg.name}`}
                        value={refImg.role}
                        onChange={(e) =>
                          updateFrontendStyleReferenceRole(
                            refImg.id,
                            e.target.value as StyleReferenceRole
                          )
                        }
                        className="w-full h-6 px-1.5 rounded-md text-[11px] bg-white dark:bg-emerald-900 border border-slate-200/80 dark:border-emerald-400/25 text-slate-800 dark:text-emerald-100"
                      >
                        <option value="styl-obrazu">Styl obrazu</option>
                        <option value="glebia-swiatlo">Głębia i światło</option>
                        <option value="tematyka-klimat">Tematyka i klimat</option>
                        <option value="kompozycja-ui">Kompozycja UI</option>
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFrontendStyleReference(refImg.id)}
                      aria-label={`Usuń grafikę ${refImg.name}`}
                      className="p-1.5 text-slate-500 hover:text-rose-600 dark:text-emerald-200/70 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {imgError && (
            <p className="text-xs text-rose-600 dark:text-rose-300">{imgError}</p>
          )}

          <button
            type="submit"
            disabled={imgLoading}
            className="w-full py-3 px-4 rounded-2xl bg-slate-900 dark:bg-emerald-400 text-white dark:text-emerald-950 text-sm font-medium inline-flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-60 cursor-pointer whitespace-nowrap"
          >
            {imgLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Renderowanie frontendu {imgSize}...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>
                  {editSourceImg
                    ? 'Wygeneruj przygotowany frontend z wytycznych i grafik'
                    : 'Wygeneruj obraz i zapisz w bibliotece'}
                </span>
              </>
            )}
          </button>
        </form>

        {generatedImage && (
          <div className="pt-2 space-y-3">
            <ProgressiveImage
              src={generatedImage}
              alt={imgPrompt}
              aspectClass="aspect-video"
              className="rounded-2xl border border-white/80 dark:border-emerald-400/25"
            />
            <button
              type="button"
              onClick={() => {
                applyPreparedFrontendToWorkspace({
                  imageDataUrl: generatedImage,
                  fileName: 'przygotowany-frontend-gemini.png',
                  promptUsed: imgPrompt,
                  analysis: frontendButtonAnalysis,
                });
                setApprovedNotice(
                  'Zatwierdzono wygenerowany obraz jako przygotowany frontend. Krok 4 (praca nad elementami interaktywnymi) jest teraz odblokowany na Stronie Startowej.'
                );
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 dark:bg-emerald-500 text-white dark:text-emerald-950 text-xs font-semibold inline-flex items-center justify-center gap-2 hover:opacity-95 cursor-pointer whitespace-nowrap"
            >
              <Check className="w-4 h-4 shrink-0" />
              <span>Zatwierdź jako przygotowany frontend (odblokuj Krok 4)</span>
            </button>
            {approvedNotice && (
              <p className="text-xs text-emerald-700 dark:text-emerald-300">
                {approvedNotice}
              </p>
            )}
          </div>
        )}
      </section>

      {/* 2. Video Generation & Photo Animation (gemini-omni-1.2-flash Interactions API) */}
      <section
        style={cardSurfaceStyle}
        className="lg:col-span-6 p-6 sm:p-8 border border-white/80 dark:border-emerald-400/20 space-y-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500 dark:text-emerald-300/80 flex items-center gap-1.5">
              <span>Gemini Omni 1.2 Flash</span>
              <span aria-hidden="true">·</span>
              <span>Tekst na Wideo & Animacja Zdjęć</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-emerald-50 mt-1">
              Studio Animacji Wideo (16:9 / 9:16)
            </h2>
          </div>
          <Film className="w-5 h-5 text-indigo-600 dark:text-emerald-300 shrink-0" />
        </div>

        <form onSubmit={handleGenerateVideo} className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {(['16:9', '9:16'] as const).map((ar) => (
                <button
                  key={ar}
                  type="button"
                  onClick={() => setVidAspect(ar)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-mono font-semibold cursor-pointer ${
                    vidAspect === ar
                      ? isDark
                        ? 'bg-emerald-400 text-emerald-950'
                        : 'bg-slate-900 text-white'
                      : 'bg-white/65 dark:bg-emerald-950/60 text-slate-700 dark:text-emerald-100'
                  }`}
                >
                  {ar === '16:9' ? '16:9 Poziomo' : '9:16 Pionowo'}
                </button>
              ))}
            </div>

            <label className="px-3.5 py-1.5 rounded-xl bg-white/75 dark:bg-emerald-950/70 border border-slate-200 dark:border-emerald-400/25 text-xs font-medium text-slate-700 dark:text-emerald-100 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap">
              <Upload className="w-3.5 h-3.5" />
              <span>{vidSourceImg ? 'Zdjęcie załadowane' : 'Prześlij zdjęcie do animacji'}</span>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) readFileAsBase64(f, setVidSourceImg);
                }}
                className="hidden"
              />
            </label>
          </div>

          {vidSourceImg && (
            <div className="flex items-center justify-between text-xs text-indigo-700 dark:text-emerald-300 bg-indigo-50/70 dark:bg-emerald-950/60 px-3 py-2 rounded-xl">
              <span>Tryb: Animacja przesłanego zdjęcia do wideo ({vidAspect})</span>
              <button
                type="button"
                onClick={() => setVidSourceImg(null)}
                className="underline cursor-pointer"
              >
                Przełącz na tekst-na-wideo
              </button>
            </div>
          )}

          <textarea
            rows={3}
            value={vidPrompt}
            onChange={(e) => setVidPrompt(e.target.value)}
            placeholder="Opisz ruch kamery, światła i animację..."
            className="w-full p-3.5 rounded-2xl text-sm bg-white/80 dark:bg-emerald-950/70 border border-slate-200 dark:border-emerald-400/25 text-slate-900 dark:text-emerald-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />

          {vidError && (
            <p className="text-xs text-rose-600 dark:text-rose-300">{vidError}</p>
          )}

          <button
            type="submit"
            disabled={vidLoading}
            className="w-full py-3 px-4 rounded-2xl bg-indigo-600 dark:bg-emerald-400 text-white dark:text-emerald-950 text-sm font-medium inline-flex items-center justify-center gap-2 hover:opacity-95 disabled:opacity-60 cursor-pointer whitespace-nowrap"
          >
            {vidLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generowanie klipu wideo Omni Flash...</span>
              </>
            ) : (
              <>
                <Film className="w-4 h-4" />
                <span>{vidSourceImg ? 'Animuj zdjęcie w wideo' : 'Wygeneruj wideo z tekstu'}</span>
              </>
            )}
          </button>
        </form>

        {generatedVideoUrl && (
          <video
            src={generatedVideoUrl}
            controls
            playsInline
            loop
            className="w-full rounded-2xl border border-white/80 dark:border-emerald-400/25 bg-black/90 max-h-72"
          />
        )}
      </section>

      {/* 3. Image Understanding Analyzer (Gemini Vision) */}
      <section
        style={cardSurfaceStyle}
        className="lg:col-span-6 p-6 sm:p-8 border border-white/80 dark:border-emerald-400/20 space-y-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500 dark:text-emerald-300/80 flex items-center gap-1.5">
              <span>Gemini Vision</span>
              <span aria-hidden="true">·</span>
              <span>Rozpoznawanie Obrazów, Tekstów i Stylu</span>
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-emerald-50 mt-1">
              Skaner Grafiki, Elementów UI i Materiału
            </h3>
          </div>
          <ScanEye className="w-5 h-5 text-indigo-600 dark:text-emerald-300 shrink-0" />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="px-4 py-2.5 rounded-xl bg-white/80 dark:bg-emerald-950/75 border border-slate-200 dark:border-emerald-400/25 text-xs font-medium text-slate-800 dark:text-emerald-100 inline-flex items-center gap-2 cursor-pointer">
            <Upload className="w-4 h-4" />
            <span>
              {analyzeSource?.name
                ? `Zmień grafikę (${analyzeSource.name})`
                : 'Wybierz grafikę do rozpoznania'}
            </span>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setAnalysisResult(null);
                  setAnalyzeError(null);
                  readFileAsBase64(f, setAnalyzeSource);
                }
                e.target.value = '';
              }}
              className="hidden"
            />
          </label>

          <button
            type="button"
            disabled={!analyzeSource || analyzeLoading}
            onClick={handleAnalyzePhoto}
            className="px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-emerald-400 text-white dark:text-emerald-950 text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-50 cursor-pointer whitespace-nowrap"
          >
            {analyzeLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Rozpoznawanie grafiki...</span>
              </>
            ) : (
              <span>Rozpoznaj zawartość grafiki</span>
            )}
          </button>
        </div>

        {analyzeSource && (
          <div className="rounded-2xl overflow-hidden border border-slate-200/80 dark:border-emerald-400/20 bg-slate-100/70 dark:bg-emerald-950/70 p-1.5 flex items-center justify-center">
            <img
              src={analyzeSource.base64}
              alt={analyzeSource.name || 'Podgląd grafiki do analizy'}
              className="max-h-56 max-w-full w-auto h-auto rounded-xl block"
            />
          </div>
        )}

        {analyzeError && (
          <p className="text-xs text-rose-600 dark:text-rose-300">{analyzeError}</p>
        )}

        {analysisResult && (
          <div className="p-4 rounded-2xl bg-white/65 dark:bg-emerald-950/60 border border-slate-200/80 dark:border-emerald-400/20 space-y-3">
            <p className="text-xs text-slate-800 dark:text-emerald-100 leading-relaxed">
              {analysisResult.summary}
            </p>

            {analysisResult.recognizedElements &&
              analysisResult.recognizedElements.length > 0 && (
                <div className="text-[11px] text-slate-700 dark:text-emerald-200/90">
                  <span className="font-semibold text-slate-900 dark:text-emerald-50">
                    Rozpoznane elementy:{' '}
                  </span>
                  {analysisResult.recognizedElements.join(' · ')}
                </div>
              )}

            {analysisResult.recognizedTexts &&
              analysisResult.recognizedTexts.length > 0 && (
                <div className="text-[11px] text-slate-700 dark:text-emerald-200/90">
                  <span className="font-semibold text-slate-900 dark:text-emerald-50">
                    Odczytane napisy:{' '}
                  </span>
                  {analysisResult.recognizedTexts.join(' · ')}
                </div>
              )}

            {analysisResult.detectedColors &&
              analysisResult.detectedColors.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-900 dark:text-emerald-50">
                    Kolory:
                  </span>
                  {analysisResult.detectedColors.map((hex) => (
                    <span
                      key={hex}
                      className="inline-flex items-center gap-1 text-[11px] font-mono text-slate-700 dark:text-emerald-200"
                    >
                      <span
                        style={{ backgroundColor: hex }}
                        className="w-3.5 h-3.5 rounded border border-slate-300 dark:border-emerald-400/40 inline-block"
                      />
                      {hex}
                    </span>
                  ))}
                </div>
              )}

            <div className="text-xs font-mono tabular-nums text-slate-600 dark:text-emerald-300">
              Materiał: {analysisResult.suggestedMaterial} · Twardość: {analysisResult.suggestedHardness} Sh · Rozmycie: {analysisResult.suggestedGlassBlur}px
              {analysisResult.modelUsed ? ` · ${analysisResult.modelUsed}` : ''}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  selectMaterialProfile(analysisResult.suggestedMaterial, { silent: true });
                  updateHaptic({ materialHardness: analysisResult.suggestedHardness });
                  updateDepth({
                    glassBlur: analysisResult.suggestedGlassBlur,
                    elevation: analysisResult.suggestedElevation,
                  });
                }}
                className="py-2 px-3.5 rounded-xl bg-indigo-600 dark:bg-emerald-400 text-white dark:text-emerald-950 text-xs font-semibold cursor-pointer whitespace-nowrap"
              >
                Zastosuj rozpoznane parametry w studiu
              </button>

              {analysisResult.extractedPrompt && (
                <button
                  type="button"
                  onClick={() => {
                    setImgPrompt(analysisResult.extractedPrompt);
                    if (analyzeSource) {
                      setEditSourceImg(analyzeSource);
                    }
                    setLoadedFromScreenTitle(analyzeSource?.name || 'Skaner Grafiki');
                  }}
                  className="py-2 px-3.5 rounded-xl bg-white/85 dark:bg-emerald-900/75 border border-slate-200 dark:border-emerald-400/25 text-slate-800 dark:text-emerald-100 text-xs font-medium cursor-pointer whitespace-nowrap"
                >
                  Wklej prompt do Generatora Grafik
                </button>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 4. Real-Time Voice Conversation (gemini-3.8-live) */}
      <section
        style={cardSurfaceStyle}
        className="lg:col-span-6 p-6 sm:p-8 border border-white/80 dark:border-emerald-400/20 space-y-5"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs text-slate-500 dark:text-emerald-300/80 flex items-center gap-1.5">
              <span>Gemini 3.8 Live API</span>
              <span aria-hidden="true">·</span>
              <span>Rozmowa Głosowa w Czasie Rzeczywistym</span>
            </div>
            <h3 className="text-xl font-semibold text-slate-900 dark:text-emerald-50 mt-1">
              Konsultant Akustyki i Projektowania Live
            </h3>
          </div>
          <Mic className="w-5 h-5 text-indigo-600 dark:text-emerald-300 shrink-0" />
        </div>

        <p className="text-xs text-slate-600 dark:text-emerald-100/80 leading-relaxed">
          Porozmawiaj głosowo na żywo z asystentem studyjnym o doborze tonacji szkła, parametrach syntezatora Aether lub wzorcach haptycznych.
        </p>

        {liveError && (
          <p className="text-xs text-rose-600 dark:text-rose-300">{liveError}</p>
        )}

        <div className="flex items-center gap-3">
          {!liveConnected ? (
            <button
              type="button"
              disabled={liveConnecting}
              onClick={startLiveSession}
              className="px-5 py-3 rounded-2xl bg-slate-900 dark:bg-emerald-400 text-white dark:text-emerald-950 text-sm font-medium inline-flex items-center gap-2 cursor-pointer whitespace-nowrap disabled:opacity-60"
            >
              {liveConnecting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Łączenie z Gemini 3.8 Live...</span>
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4" />
                  <span>Rozpocznij rozmowę głosową Live</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={stopLiveSession}
              className="px-5 py-3 rounded-2xl bg-rose-600 text-white text-sm font-medium inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <PhoneOff className="w-4 h-4" />
              <span>Zakończ sesję głosową</span>
            </button>
          )}
        </div>

        {liveTranscripts.length > 0 && (
          <div className="p-4 rounded-2xl bg-white/55 dark:bg-emerald-950/50 border border-slate-200/70 dark:border-emerald-400/15 space-y-2 max-h-48 overflow-y-auto">
            {liveTranscripts.map((entry, idx) => (
              <div key={idx} className="text-xs">
                <span className="font-semibold text-slate-800 dark:text-emerald-200">
                  {entry.role === 'user' ? 'Ty: ' : 'Studio Live: '}
                </span>
                <span className="text-slate-600 dark:text-emerald-100/85">{entry.text}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
