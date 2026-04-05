/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Play,
  BookOpen,
  Sparkles,
  Search,
  Plus,
  Info,
  ChevronRight,
  Tv,
  Upload,
  X,
  Mic,
  Ear,
  RotateCcw,
  AlertCircle,
  Subtitles,
  Layers,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeDramaScene, analyzeDramaAudio, SceneAnalysis, VocabItem } from './services/gemini';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { parseSubtitleFile, type SubtitleCue } from './lib/subtitles';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const VOCAB_STORAGE_KEY = 'dramak_saved_vocab_v1';

type SavedVocabEntry = VocabItem & { savedAt: number; lineTime?: number };

type LastFailed = { type: 'text'; text: string } | { type: 'listen' };

const VOC_TYPES: VocabItem['type'][] = ['slang', 'honorific', 'common', 'grammar'];

function loadSavedVocab(): SavedVocabEntry[] {
  try {
    const raw = localStorage.getItem(VOCAB_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x): SavedVocabEntry | null => {
        if (!x || typeof x !== 'object') return null;
        const o = x as Record<string, unknown>;
        if (typeof o.word !== 'string') return null;
        const type = VOC_TYPES.includes(o.type as VocabItem['type']) ? (o.type as VocabItem['type']) : 'common';
        return {
          word: o.word,
          reading: typeof o.reading === 'string' ? o.reading : '',
          meaning: typeof o.meaning === 'string' ? o.meaning : '',
          context: typeof o.context === 'string' ? o.context : '',
          type,
          savedAt: typeof o.savedAt === 'number' ? o.savedAt : Date.now(),
          ...(typeof o.lineTime === 'number' ? { lineTime: o.lineTime } : {}),
        };
      })
      .filter((x): x is SavedVocabEntry => x != null);
  } catch {
    return [];
  }
}

export default function App() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [analysis, setAnalysis] = useState<SceneAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedWord, setSelectedWord] = useState<VocabItem | null>(null);
  const [savedVocab, setSavedVocab] = useState<SavedVocabEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'watch' | 'vocabulary'>('watch');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [lineBookmarkTime, setLineBookmarkTime] = useState<number | null>(null);
  const [captureDurationSec, setCaptureDurationSec] = useState<2 | 5 | 10>(5);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [lastFailed, setLastFailed] = useState<LastFailed | null>(null);
  const [vocabSearchQuery, setVocabSearchQuery] = useState('');
  const [subtitles, setSubtitles] = useState<SubtitleCue[] | null>(null);
  const [activeCueIndex, setActiveCueIndex] = useState<number | null>(null);
  const [showCueList, setShowCueList] = useState(false);
  const [practiceEntry, setPracticeEntry] = useState<SavedVocabEntry | null>(null);
  const [practiceRevealed, setPracticeRevealed] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const subtitleInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const videoObjectUrlRef = useRef<string | null>(null);

  useEffect(() => {
    setSavedVocab(loadSavedVocab());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(VOCAB_STORAGE_KEY, JSON.stringify(savedVocab));
    } catch {
      /* ignore quota */
    }
  }, [savedVocab]);

  useEffect(() => {
    return () => {
      if (videoObjectUrlRef.current) {
        URL.revokeObjectURL(videoObjectUrlRef.current);
        videoObjectUrlRef.current = null;
      }
    };
  }, []);

  const filteredSavedVocab = useMemo(() => {
    const q = vocabSearchQuery.trim().toLowerCase();
    if (!q) return savedVocab;
    return savedVocab.filter(
      (v) =>
        v.word.toLowerCase().includes(q) ||
        v.meaning.toLowerCase().includes(q) ||
        v.reading.toLowerCase().includes(q)
    );
  }, [savedVocab, vocabSearchQuery]);

  const clearRecordTimeout = () => {
    if (recordTimeoutRef.current) {
      clearTimeout(recordTimeoutRef.current);
      recordTimeoutRef.current = null;
    }
  };

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state === 'recording') {
      recorder.stop();
    }
    clearRecordTimeout();
  }, []);

  const startListening = async () => {
    if (!videoRef.current || !videoUrl) return;

    setAnalysisError(null);
    setLastFailed(null);
    setIsListening(true);
    setLoading(true);
    audioChunksRef.current = [];
    mediaRecorderRef.current = null;

    const el = videoRef.current;
    const wasPaused = el.paused;
    if (wasPaused) {
      try {
        await el.play();
      } catch {
        setAnalysisError('Start playback first so audio can be captured from the video.');
        setIsListening(false);
        setLoading(false);
        setLastFailed({ type: 'listen' });
        return;
      }
    }

    const t0 = el.currentTime;
    setLineBookmarkTime(t0);

    try {
      const stream =
        (el as HTMLVideoElement & { captureStream?: () => MediaStream }).captureStream?.() ||
        (el as HTMLVideoElement & { mozCaptureStream?: () => MediaStream }).mozCaptureStream?.();

      if (!stream) {
        throw new Error('Audio capture is not supported in this browser.');
      }

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        el.pause();
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          try {
            const result = await analyzeDramaAudio(base64Audio, 'audio/webm');
            setAnalysis(result);
            setSelectedWord(null);
            setAnalysisError(null);
            setLastFailed(null);
          } catch (err) {
            console.error(err);
            const msg = err instanceof Error ? err.message : 'Could not analyze audio.';
            setAnalysisError(msg);
            setLastFailed({ type: 'listen' });
          } finally {
            setLoading(false);
            setIsListening(false);
          }
        };
      };

      recorder.start();
      recordTimeoutRef.current = setTimeout(() => {
        stopRecording();
      }, captureDurationSec * 1000);
    } catch (error) {
      console.error('Error capturing audio:', error);
      el.pause();
      const msg = error instanceof Error ? error.message : 'Could not capture audio.';
      setAnalysisError(msg);
      setLastFailed({ type: 'listen' });
      setLoading(false);
      setIsListening(false);
      clearRecordTimeout();
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (videoObjectUrlRef.current) {
      URL.revokeObjectURL(videoObjectUrlRef.current);
    }
    const url = URL.createObjectURL(file);
    videoObjectUrlRef.current = url;
    setVideoUrl(url);
    setAnalysis(null);
    setLineBookmarkTime(null);
    setSubtitles(null);
    setActiveCueIndex(null);
    event.target.value = '';
  };

  const handleSubtitleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      try {
        const cues = parseSubtitleFile(file.name, text);
        setSubtitles(cues.length ? cues : null);
        setShowCueList(true);
        setAnalysisError(null);
      } catch {
        setAnalysisError('Could not read subtitle file. Try a standard .srt or .vtt file.');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleAnalyze = async (text: string) => {
    if (!text.trim()) return;
    setAnalysisError(null);
    setLastFailed(null);
    setLoading(true);
    if (videoRef.current) {
      videoRef.current.pause();
      setLineBookmarkTime(videoRef.current.currentTime);
    }

    try {
      const result = await analyzeDramaScene(text);
      setAnalysis(result);
      setSelectedWord(null);
      setAnalysisError(null);
      setLastFailed(null);
    } catch (error) {
      console.error(error);
      const msg = error instanceof Error ? error.message : 'Could not analyze text.';
      setAnalysisError(msg);
      setLastFailed({ type: 'text', text });
    } finally {
      setLoading(false);
    }
  };

  const retryLast = () => {
    if (!lastFailed) return;
    if (lastFailed.type === 'text') {
      void handleAnalyze(lastFailed.text);
    } else {
      void startListening();
    }
  };

  const saveWord = (word: VocabItem) => {
    setSavedVocab((prev) => {
      if (prev.find((v) => v.word === word.word)) return prev;
      const entry: SavedVocabEntry = {
        ...word,
        savedAt: Date.now(),
        ...(lineBookmarkTime != null ? { lineTime: lineBookmarkTime } : {}),
      };
      return [...prev, entry];
    });
  };

  const replayFromBookmark = () => {
    const v = videoRef.current;
    if (!v || lineBookmarkTime == null) return;
    v.currentTime = lineBookmarkTime;
    void v.play();
  };

  const continueWatching = () => {
    const v = videoRef.current;
    if (!v) return;
    void v.play();
  };

  const dismissAnalysisOverlay = useCallback(() => {
    setAnalysis(null);
    setSelectedWord(null);
  }, []);

  const onVideoTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !subtitles?.length) return;
    const t = v.currentTime;
    const idx = subtitles.findIndex((c) => t >= c.start && t < c.end);
    setActiveCueIndex(idx >= 0 ? idx : null);
  };

  const seekToCue = (cue: SubtitleCue) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = cue.start;
    void v.play();
  };

  const pickPracticeCard = () => {
    const pool = filteredSavedVocab;
    if (!pool.length) return;
    setPracticeEntry(pool[Math.floor(Math.random() * pool.length)]!);
    setPracticeRevealed(false);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' && analysis) {
        e.preventDefault();
        dismissAnalysisOverlay();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [analysis, dismissAnalysisOverlay]);

  const isAnalyzingAfterRecord = loading && !isListening;

  return (
    <div className="min-h-screen bg-[#0a0502] text-[#e0d8d0] font-sans selection:bg-[#ff4e00]/30 overflow-hidden flex flex-col">
      <div className="atmosphere-bg" />

      <nav className="border-b border-white/10 bg-black/40 backdrop-blur-md z-50 shrink-0">
        <div className="max-w-full mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 bg-[#ff4e00] rounded-lg flex items-center justify-center">
              <Tv className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold tracking-tighter text-white">DramaK Companion</span>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex gap-6">
              <button
                onClick={() => setActiveTab('watch')}
                className={cn(
                  'text-xs font-bold uppercase tracking-widest transition-colors hover:text-white',
                  activeTab === 'watch' ? 'text-[#ff4e00]' : 'text-white/40'
                )}
              >
                Companion Mode
              </button>
              <button
                onClick={() => setActiveTab('vocabulary')}
                className={cn(
                  'text-xs font-bold uppercase tracking-widest transition-colors hover:text-white',
                  activeTab === 'vocabulary' ? 'text-[#ff4e00]' : 'text-white/40'
                )}
              >
                My Bank ({savedVocab.length})
              </button>
            </div>
            <div className="h-4 w-px bg-white/10" />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs font-bold uppercase tracking-widest text-white/60 hover:text-white flex items-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Load Drama
            </button>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="video/*" className="hidden" />
            <input
              type="file"
              ref={subtitleInputRef}
              onChange={handleSubtitleFile}
              accept=".srt,.vtt,text/plain"
              className="hidden"
            />
          </div>
        </div>
      </nav>

      <main className="flex-1 flex overflow-hidden">
        {activeTab === 'watch' ? (
          <>
            <div className="flex-1 relative bg-black flex flex-col">
              {!videoUrl ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center max-w-lg mx-auto">
                  <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/10">
                    <Tv className="w-10 h-10 text-white/20" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">Study with your episode</h2>
                  <ol className="text-left text-white/50 text-sm space-y-3 mb-8 list-decimal list-inside">
                    <li>Load a video file from your computer.</li>
                    <li>
                      Capture a line: type what you heard and press Analyze, or use Listen (video plays briefly
                      while audio is captured, then pauses for results).
                    </li>
                    <li>Read the translation and notes, tap words, save to My Bank.</li>
                    <li>Use Replay line or Continue when you are ready to watch again.</li>
                  </ol>
                  <p className="text-white/30 text-xs mb-6">
                    Optional: load a matching .srt or .vtt file after the video for a clickable subtitle list.
                  </p>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="bg-white text-black px-8 py-3 rounded-full font-bold hover:bg-[#ff4e00] hover:text-white transition-all flex items-center gap-2"
                  >
                    <Upload className="w-5 h-5" />
                    Select Video File
                  </button>
                </div>
              ) : (
                <div className="flex-1 relative group flex flex-col min-h-0">
                  <video
                    ref={videoRef}
                    src={videoUrl}
                    controls
                    className="w-full flex-1 min-h-0 object-contain"
                    onTimeUpdate={onVideoTimeUpdate}
                  />

                  <div className="absolute top-3 left-3 right-3 flex flex-wrap gap-2 justify-end pointer-events-none">
                    <div className="pointer-events-auto flex gap-2">
                      <button
                        type="button"
                        onClick={() => subtitleInputRef.current?.click()}
                        className="text-[10px] font-bold uppercase tracking-widest px-3 py-2 rounded-xl bg-black/70 border border-white/15 text-white/80 hover:text-white flex items-center gap-2"
                      >
                        <Subtitles className="w-3.5 h-3.5" />
                        Load subtitles
                      </button>
                      {subtitles && (
                        <button
                          type="button"
                          onClick={() => setShowCueList((s) => !s)}
                          className="text-[10px] font-bold uppercase tracking-widest px-3 py-2 rounded-xl bg-black/70 border border-white/15 text-white/80 hover:text-white flex items-center gap-2"
                        >
                          <Layers className="w-3.5 h-3.5" />
                          {showCueList ? 'Hide cues' : 'Show cues'}
                        </button>
                      )}
                    </div>
                  </div>

                  {showCueList && subtitles && subtitles.length > 0 && (
                    <div className="absolute top-14 right-3 w-[min(100%-1.5rem,20rem)] max-h-[40vh] overflow-y-auto rounded-2xl border border-white/10 bg-black/85 backdrop-blur-md text-left text-xs custom-scrollbar pointer-events-auto">
                      <div className="px-3 py-2 border-b border-white/10 text-[10px] font-bold uppercase tracking-widest text-white/40">
                        Subtitle cues
                      </div>
                      <ul className="p-2 space-y-1">
                        {subtitles.map((cue, i) => (
                          <li key={`${cue.start}-${i}`}>
                            <button
                              type="button"
                              onClick={() => seekToCue(cue)}
                              className={cn(
                                'w-full text-left rounded-lg px-2 py-1.5 transition-colors',
                                i === activeCueIndex
                                  ? 'bg-[#ff4e00]/25 text-white'
                                  : 'text-white/70 hover:bg-white/10'
                              )}
                            >
                              <span className="text-white/30 font-mono text-[10px] block">
                                {cue.start.toFixed(1)}s – {cue.end.toFixed(1)}s
                              </span>
                              <span className="line-clamp-2">{cue.text}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-full max-w-2xl px-6">
                    <AnimatePresence>
                      {analysis && (
                        <motion.div
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="relative bg-black/92 backdrop-blur-xl border border-white/20 p-6 pt-12 rounded-3xl text-center shadow-2xl shadow-black/60 space-y-4 ring-1 ring-white/5"
                        >
                          <button
                            type="button"
                            onClick={dismissAnalysisOverlay}
                            className="absolute top-3 right-3 p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/10 transition-colors"
                            aria-label="Close analysis"
                          >
                            <X className="w-5 h-5" />
                          </button>
                          <p className="text-2xl md:text-3xl font-bold text-white mb-1 leading-snug [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
                            {analysis.transcript.split(' ').map((word, i) => {
                              const vocabMatch = analysis.vocabulary.find((v) => word.includes(v.word));
                              return (
                                <span
                                  key={i}
                                  onClick={() => vocabMatch && setSelectedWord(vocabMatch)}
                                  className={cn(
                                    'cursor-pointer transition-all hover:text-[#ff4e00] mx-1 inline-block',
                                    vocabMatch && 'border-b-2 border-[#ff4e00]/50'
                                  )}
                                >
                                  {word}
                                </span>
                              );
                            })}
                          </p>
                          <div className="rounded-2xl bg-white/[0.12] border border-white/20 px-4 py-3 md:px-5 md:py-4 max-w-prose mx-auto text-left">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-[#ffb899] mb-2">
                              English
                            </p>
                            <p className="text-base md:text-lg text-zinc-50 font-sans font-medium leading-relaxed">
                              {analysis.translation}
                            </p>
                          </div>
                          {lineBookmarkTime != null && (
                            <div className="flex flex-wrap gap-2 justify-center pt-2">
                              <button
                                type="button"
                                onClick={replayFromBookmark}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/10 text-white text-sm font-bold hover:bg-white/20"
                              >
                                <RotateCcw className="w-4 h-4" />
                                Replay line
                              </button>
                              <button
                                type="button"
                                onClick={continueWatching}
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#ff4e00] text-white text-sm font-bold hover:bg-[#ff6a26]"
                              >
                                <Play className="w-4 h-4" />
                                Continue
                              </button>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              <div className="p-4 bg-black/60 border-t border-white/10 backdrop-blur-md space-y-3 shrink-0">
                {analysisError && (
                  <div className="max-w-3xl mx-auto flex flex-wrap items-center gap-3 rounded-2xl border border-red-500/40 bg-red-950/40 px-4 py-3 text-sm text-red-100">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    <span className="flex-1 min-w-[12rem]">{analysisError}</span>
                    {lastFailed && (
                      <button
                        type="button"
                        onClick={retryLast}
                        disabled={loading}
                        className="shrink-0 text-xs font-bold uppercase tracking-widest px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-50"
                      >
                        Retry
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setAnalysisError(null);
                        setLastFailed(null);
                      }}
                      className="shrink-0 p-1 rounded-lg hover:bg-white/10 text-red-200"
                      aria-label="Dismiss error"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                <div className="max-w-3xl mx-auto flex flex-col gap-2">
                  <p className="text-[10px] text-white/30 uppercase tracking-widest px-1">
                    Listen captures audio while the video plays, then pauses for analysis. Choose clip length
                    below.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Clip</span>
                    {([2, 5, 10] as const).map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        disabled={isListening || loading}
                        onClick={() => setCaptureDurationSec(sec)}
                        className={cn(
                          'px-3 py-1 rounded-lg text-xs font-bold transition-colors',
                          captureDurationSec === sec
                            ? 'bg-[#ff4e00] text-white'
                            : 'bg-white/10 text-white/60 hover:bg-white/15',
                          (isListening || loading) && 'opacity-50'
                        )}
                      >
                        {sec}s
                      </button>
                    ))}
                  </div>
                </div>

                <div className="max-w-3xl mx-auto flex flex-wrap gap-3">
                  <div className="flex-1 relative min-w-[12rem]">
                    <input
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAnalyze(inputText)}
                      placeholder="Heard something interesting? Type it here to analyze..."
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff4e00]/50 transition-all"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
                      <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">
                        Enter
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    {isListening && (
                      <button
                        type="button"
                        onClick={stopRecording}
                        className="px-4 rounded-2xl font-bold bg-amber-600 text-white hover:bg-amber-500 transition-all flex items-center gap-2 shrink-0 py-3"
                      >
                        <Ear className="w-4 h-4" />
                        Stop early
                      </button>
                    )}
                    <button
                      onClick={startListening}
                      disabled={loading || !videoUrl || isListening}
                      className={cn(
                        'px-6 rounded-2xl font-bold transition-all flex items-center gap-2 shrink-0 py-3',
                        isListening
                          ? 'bg-red-500 text-white animate-pulse'
                          : 'bg-white/10 text-white hover:bg-white/20 disabled:opacity-50'
                      )}
                    >
                      {isListening ? (
                        <Ear className="w-4 h-4" />
                      ) : isAnalyzingAfterRecord ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                        >
                          <Sparkles className="w-4 h-4" />
                        </motion.div>
                      ) : (
                        <Mic className="w-4 h-4" />
                      )}
                      <span>
                        {isListening
                          ? 'Recording…'
                          : isAnalyzingAfterRecord
                            ? 'Analyzing…'
                            : 'Listen & Analyze'}
                      </span>
                    </button>
                    <div className="h-8 w-px bg-white/10 mx-1 hidden sm:block" />
                    <button
                      onClick={() => handleAnalyze(inputText)}
                      disabled={loading || !inputText.trim()}
                      className="bg-[#ff4e00] text-white px-6 rounded-2xl font-bold hover:bg-[#ff6a26] disabled:opacity-50 transition-all flex items-center gap-2 shrink-0 py-3"
                    >
                      {loading && !isListening ? (
                        <motion.div
                          animate={{ rotate: 360 }}
                          transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                        >
                          <Sparkles className="w-4 h-4" />
                        </motion.div>
                      ) : (
                        <Sparkles className="w-4 h-4" />
                      )}
                      <span>Analyze</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <aside
              className={cn(
                'w-96 border-l border-white/10 bg-[#0a0502] flex flex-col transition-all duration-300',
                !isSidebarOpen && 'w-0 border-none opacity-0'
              )}
            >
              <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
                <AnimatePresence mode="wait">
                  {selectedWord ? (
                    <motion.div
                      key="word-detail"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      className="space-y-6"
                    >
                      <button
                        onClick={() => setSelectedWord(null)}
                        className="text-xs font-bold text-white/40 hover:text-white flex items-center gap-1 mb-4"
                      >
                        <X className="w-3 h-3" /> Back to Analysis
                      </button>

                      <div>
                        <span
                          className={cn(
                            'text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md mb-2 inline-block',
                            selectedWord.type === 'slang'
                              ? 'bg-purple-500/20 text-purple-400'
                              : selectedWord.type === 'honorific'
                                ? 'bg-blue-500/20 text-blue-400'
                                : selectedWord.type === 'grammar'
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-zinc-500/20 text-zinc-400'
                          )}
                        >
                          {selectedWord.type}
                        </span>
                        <h2 className="text-4xl font-bold text-white mb-1">{selectedWord.word}</h2>
                        <p className="text-lg text-white/40 font-mono italic">[{selectedWord.reading}]</p>
                      </div>

                      <div className="space-y-6">
                        <div>
                          <h4 className="text-xs font-bold text-white/30 uppercase tracking-widest mb-2">
                            Meaning
                          </h4>
                          <p className="text-xl text-white font-medium">{selectedWord.meaning}</p>
                        </div>

                        <div>
                          <h4 className="text-xs font-bold text-white/30 uppercase tracking-widest mb-2">
                            Drama Context
                          </h4>
                          <p className="text-white/80 leading-relaxed italic">&quot;{selectedWord.context}&quot;</p>
                        </div>

                        <button
                          onClick={() => saveWord(selectedWord)}
                          className="w-full py-4 bg-[#ff4e00] text-white rounded-2xl font-bold hover:bg-[#ff6a26] transition-all flex items-center justify-center gap-2"
                        >
                          <Plus className="w-5 h-5" />
                          Save to Bank
                        </button>
                      </div>
                    </motion.div>
                  ) : analysis ? (
                    <motion.div
                      key="analysis-summary"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="space-y-8"
                    >
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold uppercase tracking-widest text-white/40">Scene Insights</h3>
                        <button onClick={dismissAnalysisOverlay} className="text-white/20 hover:text-white">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="bg-white/5 border border-white/10 rounded-3xl p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <Info className="w-4 h-4 text-[#ff4e00]" />
                          <h4 className="text-sm font-bold text-white">Cultural Notes</h4>
                        </div>
                        <div className="text-sm text-white/70 leading-relaxed prose prose-invert prose-sm">
                          <Markdown>{analysis.culturalNotes}</Markdown>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center gap-2">
                          <BookOpen className="w-4 h-4 text-[#ff4e00]" />
                          <h4 className="text-sm font-bold text-white">Vocabulary</h4>
                        </div>
                        <div className="grid grid-cols-1 gap-2">
                          {analysis.vocabulary.map((vocab, idx) => (
                            <button
                              key={idx}
                              onClick={() => setSelectedWord(vocab)}
                              className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl hover:border-[#ff4e00]/30 transition-all group text-left"
                            >
                              <div>
                                <p className="font-bold text-white group-hover:text-[#ff4e00]">{vocab.word}</p>
                                <p className="text-xs text-white/40">{vocab.meaning}</p>
                              </div>
                              <ChevronRight className="w-4 h-4 text-white/20 group-hover:text-white" />
                            </button>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center py-24 px-6">
                      <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mb-6">
                        <Sparkles className="w-8 h-8 text-white/10" />
                      </div>
                      <h3 className="text-lg font-bold text-white/40 mb-2">Analysis Sidebar</h3>
                      <p className="text-sm text-white/20">
                        Analyze a line from the bar (type + Analyze or Listen). Cultural notes and vocabulary
                        appear here. Press Esc to clear the overlay.
                      </p>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </aside>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto p-12">
            <div className="max-w-5xl mx-auto space-y-12">
              <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h1 className="text-5xl font-bold text-white tracking-tighter mb-2">My Vocabulary Bank</h1>
                  <p className="text-white/40">Words and phrases you have saved from dramas (stored in this browser).</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                  <button
                    type="button"
                    onClick={pickPracticeCard}
                    disabled={!filteredSavedVocab.length}
                    className="px-5 py-3 rounded-2xl font-bold bg-white/10 text-white hover:bg-white/15 disabled:opacity-40 text-sm"
                  >
                    Practice random
                  </button>
                  <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-6 py-3 rounded-2xl min-w-[16rem]">
                    <Search className="w-5 h-5 text-white/40 shrink-0" />
                    <input
                      type="text"
                      value={vocabSearchQuery}
                      onChange={(e) => setVocabSearchQuery(e.target.value)}
                      placeholder="Search saved words..."
                      className="bg-transparent border-none focus:outline-none text-white placeholder:text-white/20 w-full"
                    />
                  </div>
                </div>
              </div>

              {practiceEntry && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-[32px] border border-[#ff4e00]/30 bg-white/5 p-10 max-w-xl mx-auto text-center cursor-pointer"
                  onClick={() => setPracticeRevealed((r) => !r)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setPracticeRevealed((r) => !r);
                    }
                  }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-4">
                    Tap card to {practiceRevealed ? 'hide' : 'reveal'}
                  </p>
                  <h3 className="text-4xl font-bold text-white mb-2">{practiceEntry.word}</h3>
                  <p className="text-white/40 font-mono italic mb-6">[{practiceEntry.reading}]</p>
                  {practiceRevealed && (
                    <div className="text-left space-y-4 pt-4 border-t border-white/10">
                      <p className="text-xl text-white">{practiceEntry.meaning}</p>
                      <p className="text-sm text-white/50 italic">&quot;{practiceEntry.context}&quot;</p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 justify-center mt-8">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        pickPracticeCard();
                      }}
                      className="px-4 py-2 rounded-xl bg-[#ff4e00] text-white text-sm font-bold"
                    >
                      Next card
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPracticeEntry(null);
                      }}
                      className="px-4 py-2 rounded-xl bg-white/10 text-sm font-bold"
                    >
                      Close
                    </button>
                  </div>
                </motion.div>
              )}

              {savedVocab.length === 0 ? (
                <div className="py-32 text-center bg-white/5 border border-dashed border-white/10 rounded-[60px]">
                  <BookOpen className="w-20 h-20 text-white/10 mx-auto mb-6" />
                  <h3 className="text-2xl font-bold text-white/40">Your bank is empty</h3>
                  <p className="text-white/20 max-w-md mx-auto mt-2">
                    Analyze a scene, open a word, then Save to Bank. Your list is saved in this browser.
                  </p>
                </div>
              ) : filteredSavedVocab.length === 0 ? (
                <div className="py-24 text-center text-white/40">
                  No matches for &quot;{vocabSearchQuery}&quot;.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredSavedVocab.map((vocab) => (
                    <motion.div
                      layoutId={`vocab-${vocab.word}-${vocab.savedAt}`}
                      key={`${vocab.word}-${vocab.savedAt}`}
                      className="bg-white/5 border border-white/10 rounded-[32px] p-8 hover:border-[#ff4e00]/30 transition-all group relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-4">
                        <button
                          onClick={() =>
                            setSavedVocab((prev) => prev.filter((v) => v.savedAt !== vocab.savedAt))
                          }
                          className="p-2 text-white/10 hover:text-red-400 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="mb-6">
                        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 bg-white/10 rounded-md text-white/60 mb-4 inline-block">
                          {vocab.type}
                        </span>
                        <h3 className="text-3xl font-bold text-white mb-1 group-hover:text-[#ff4e00] transition-colors">
                          {vocab.word}
                        </h3>
                        <p className="text-lg text-white/40 font-mono italic">[{vocab.reading}]</p>
                        {vocab.lineTime != null && (
                          <p className="text-[10px] text-white/25 mt-2 font-mono">
                            Saved at ~{vocab.lineTime.toFixed(1)}s in video
                          </p>
                        )}
                      </div>

                      <div className="space-y-6">
                        <div>
                          <p className="text-xs font-bold text-white/20 uppercase tracking-widest mb-1">
                            Meaning
                          </p>
                          <p className="text-xl text-white font-medium">{vocab.meaning}</p>
                        </div>
                        <div className="p-4 bg-black/40 rounded-2xl border border-white/5">
                          <p className="text-xs text-white/20 uppercase font-bold mb-2 tracking-widest">
                            Drama Context
                          </p>
                          <p className="text-sm text-white/60 italic leading-relaxed">
                            &quot;{vocab.context}&quot;
                          </p>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
