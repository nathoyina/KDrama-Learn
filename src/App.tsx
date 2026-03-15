/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  SkipForward, 
  SkipBack, 
  Languages, 
  BookOpen, 
  Sparkles, 
  Search,
  Plus,
  Info,
  ChevronRight,
  Tv,
  MessageSquare,
  Upload,
  Maximize2,
  Volume2,
  Settings,
  X,
  Mic,
  Ear
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeDramaScene, analyzeDramaAudio, SceneAnalysis, VocabItem } from './services/gemini';
import Markdown from 'react-markdown';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [analysis, setAnalysis] = useState<SceneAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedWord, setSelectedWord] = useState<VocabItem | null>(null);
  const [savedVocab, setSavedVocab] = useState<VocabItem[]>([]);
  const [activeTab, setActiveTab] = useState<'watch' | 'vocabulary'>('watch');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isListening, setIsListening] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startListening = async () => {
    if (!videoRef.current || !videoUrl) return;
    
    setIsListening(true);
    setLoading(true);
    audioChunksRef.current = [];

    try {
      // Capture audio from the video element
      const stream = (videoRef.current as any).captureStream?.() || (videoRef.current as any).mozCaptureStream?.();
      
      if (!stream) {
        throw new Error("Audio capture not supported in this browser");
      }

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = (reader.result as string).split(',')[1];
          try {
            const result = await analyzeDramaAudio(base64Audio, 'audio/webm');
            setAnalysis(result);
            setSelectedWord(null);
          } catch (err) {
            console.error(err);
          } finally {
            setLoading(false);
            setIsListening(false);
          }
        };
      };

      recorder.start();
      
      // Record for 5 seconds
      setTimeout(() => {
        if (recorder.state === 'recording') {
          recorder.stop();
        }
      }, 5000);

    } catch (error) {
      console.error("Error capturing audio:", error);
      setLoading(false);
      setIsListening(false);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setVideoUrl(url);
      setAnalysis(null);
    }
  };

  const handleAnalyze = async (text: string) => {
    if (!text.trim()) return;
    setLoading(true);
    if (videoRef.current) videoRef.current.pause();
    
    try {
      const result = await analyzeDramaScene(text);
      setAnalysis(result);
      setSelectedWord(null);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const saveWord = (word: VocabItem) => {
    if (!savedVocab.find(v => v.word === word.word)) {
      setSavedVocab([...savedVocab, word]);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0502] text-[#e0d8d0] font-sans selection:bg-[#ff4e00]/30 overflow-hidden flex flex-col">
      <div className="atmosphere-bg" />
      
      {/* Navigation */}
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
                  "text-xs font-bold uppercase tracking-widest transition-colors hover:text-white",
                  activeTab === 'watch' ? "text-[#ff4e00]" : "text-white/40"
                )}
              >
                Companion Mode
              </button>
              <button 
                onClick={() => setActiveTab('vocabulary')}
                className={cn(
                  "text-xs font-bold uppercase tracking-widest transition-colors hover:text-white",
                  activeTab === 'vocabulary' ? "text-[#ff4e00]" : "text-white/40"
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
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileChange} 
              accept="video/*" 
              className="hidden" 
            />
          </div>
        </div>
      </nav>

      <main className="flex-1 flex overflow-hidden">
        {activeTab === 'watch' ? (
          <>
            {/* Video Area */}
            <div className="flex-1 relative bg-black flex flex-col">
              {!videoUrl ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                  <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center mb-6 border border-white/10">
                    <Tv className="w-10 h-10 text-white/20" />
                  </div>
                  <h2 className="text-2xl font-bold text-white mb-2">Ready to watch?</h2>
                  <p className="text-white/40 max-w-md mb-8">
                    Upload a drama file from your computer to use the integrated AI analysis features.
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
                <div className="flex-1 relative group">
                  <video 
                    ref={videoRef}
                    src={videoUrl}
                    controls
                    className="w-full h-full object-contain"
                  />
                  
                  {/* Floating Subtitle Overlay (Manual Input) */}
                  <div className="absolute bottom-24 left-1/2 -translate-x-1/2 w-full max-w-2xl px-6">
                    <AnimatePresence>
                      {analysis && (
                        <motion.div 
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 10 }}
                          className="bg-black/80 backdrop-blur-xl border border-white/10 p-6 rounded-3xl text-center shadow-2xl"
                        >
                          <p className="text-2xl md:text-3xl font-bold text-white mb-2 leading-tight">
                            {analysis.transcript.split(' ').map((word, i) => {
                              const vocabMatch = analysis.vocabulary.find(v => word.includes(v.word));
                              return (
                                <span 
                                  key={i} 
                                  onClick={() => vocabMatch && setSelectedWord(vocabMatch)}
                                  className={cn(
                                    "cursor-pointer transition-all hover:text-[#ff4e00] mx-1 inline-block",
                                    vocabMatch && "border-b-2 border-[#ff4e00]/50"
                                  )}
                                >
                                  {word}
                                </span>
                              );
                            })}
                          </p>
                          <p className="text-white/50 italic font-serif">{analysis.translation}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {/* Quick Input Bar */}
              <div className="p-4 bg-black/60 border-t border-white/10 backdrop-blur-md">
                <div className="max-w-3xl mx-auto flex gap-3">
                  <div className="flex-1 relative">
                    <input 
                      type="text"
                      value={inputText}
                      onChange={(e) => setInputText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAnalyze(inputText)}
                      placeholder="Heard something interesting? Type it here to analyze..."
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#ff4e00]/50 transition-all"
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                       <span className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Press Enter</span>
                    </div>
                  </div>
                  <button 
                    onClick={startListening}
                    disabled={loading || !videoUrl || isListening}
                    className={cn(
                      "px-6 rounded-2xl font-bold transition-all flex items-center gap-2 shrink-0",
                      isListening ? "bg-red-500 text-white animate-pulse" : "bg-white/10 text-white hover:bg-white/20"
                    )}
                  >
                    {isListening ? <Ear className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    <span>{isListening ? "Listening..." : "Listen & Analyze"}</span>
                  </button>
                  <div className="h-8 w-px bg-white/10 mx-1" />
                  <button 
                    onClick={() => handleAnalyze(inputText)}
                    disabled={loading || !inputText.trim()}
                    className="bg-[#ff4e00] text-white px-6 rounded-2xl font-bold hover:bg-[#ff6a26] disabled:opacity-50 transition-all flex items-center gap-2 shrink-0"
                  >
                    {loading ? (
                      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: "linear" }}>
                        <Sparkles className="w-4 h-4" />
                      </motion.div>
                    ) : <Sparkles className="w-4 h-4" />}
                    <span>Analyze</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Sidebar Analysis */}
            <aside className={cn(
              "w-96 border-l border-white/10 bg-[#0a0502] flex flex-col transition-all duration-300",
              !isSidebarOpen && "w-0 border-none opacity-0"
            )}>
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
                        <span className={cn(
                          "text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-md mb-2 inline-block",
                          selectedWord.type === 'slang' ? "bg-purple-500/20 text-purple-400" :
                          selectedWord.type === 'honorific' ? "bg-blue-500/20 text-blue-400" :
                          selectedWord.type === 'grammar' ? "bg-emerald-500/20 text-emerald-400" :
                          "bg-zinc-500/20 text-zinc-400"
                        )}>
                          {selectedWord.type}
                        </span>
                        <h2 className="text-4xl font-bold text-white mb-1">{selectedWord.word}</h2>
                        <p className="text-lg text-white/40 font-mono italic">[{selectedWord.reading}]</p>
                      </div>

                      <div className="space-y-6">
                        <div>
                          <h4 className="text-xs font-bold text-white/30 uppercase tracking-widest mb-2">Meaning</h4>
                          <p className="text-xl text-white font-medium">{selectedWord.meaning}</p>
                        </div>
                        
                        <div>
                          <h4 className="text-xs font-bold text-white/30 uppercase tracking-widest mb-2">Drama Context</h4>
                          <p className="text-white/80 leading-relaxed italic">"{selectedWord.context}"</p>
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
                        <button onClick={() => setAnalysis(null)} className="text-white/20 hover:text-white">
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Cultural Insights */}
                      <div className="bg-white/5 border border-white/10 rounded-3xl p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <Info className="w-4 h-4 text-[#ff4e00]" />
                          <h4 className="text-sm font-bold text-white">Cultural Notes</h4>
                        </div>
                        <div className="text-sm text-white/70 leading-relaxed prose prose-invert prose-sm">
                          <Markdown>{analysis.culturalNotes}</Markdown>
                        </div>
                      </div>

                      {/* Scene Vocabulary List */}
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
                        Type a line from the drama in the input bar to get instant AI analysis here.
                      </p>
                    </div>
                  )}
                </AnimatePresence>
              </div>
            </aside>
          </>
        ) : (
          /* Vocabulary Tab */
          <div className="flex-1 overflow-y-auto p-12">
            <div className="max-w-5xl mx-auto space-y-12">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-5xl font-bold text-white tracking-tighter mb-2">My Vocabulary Bank</h1>
                  <p className="text-white/40">A collection of words and phrases you've discovered in dramas.</p>
                </div>
                <div className="flex items-center gap-3 bg-white/5 border border-white/10 px-6 py-3 rounded-2xl">
                  <Search className="w-5 h-5 text-white/40" />
                  <input 
                    type="text" 
                    placeholder="Search saved words..." 
                    className="bg-transparent border-none focus:outline-none text-white placeholder:text-white/20"
                  />
                </div>
              </div>

              {savedVocab.length === 0 ? (
                <div className="py-32 text-center bg-white/5 border border-dashed border-white/10 rounded-[60px]">
                  <BookOpen className="w-20 h-20 text-white/10 mx-auto mb-6" />
                  <h3 className="text-2xl font-bold text-white/40">Your bank is empty</h3>
                  <p className="text-white/20">Analyze scenes and click the '+' button to save words here.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {savedVocab.map((vocab, idx) => (
                    <motion.div 
                      layoutId={`vocab-${vocab.word}`}
                      key={idx}
                      className="bg-white/5 border border-white/10 rounded-[32px] p-8 hover:border-[#ff4e00]/30 transition-all group relative overflow-hidden"
                    >
                      <div className="absolute top-0 right-0 p-4">
                        <button 
                          onClick={() => setSavedVocab(savedVocab.filter(v => v.word !== vocab.word))}
                          className="p-2 text-white/10 hover:text-red-400 transition-colors"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                      
                      <div className="mb-6">
                        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 bg-white/10 rounded-md text-white/60 mb-4 inline-block">
                          {vocab.type}
                        </span>
                        <h3 className="text-3xl font-bold text-white mb-1 group-hover:text-[#ff4e00] transition-colors">{vocab.word}</h3>
                        <p className="text-lg text-white/40 font-mono italic">[{vocab.reading}]</p>
                      </div>

                      <div className="space-y-6">
                        <div>
                          <p className="text-xs font-bold text-white/20 uppercase tracking-widest mb-1">Meaning</p>
                          <p className="text-xl text-white font-medium">{vocab.meaning}</p>
                        </div>
                        <div className="p-4 bg-black/40 rounded-2xl border border-white/5">
                          <p className="text-xs text-white/20 uppercase font-bold mb-2 tracking-widest">Drama Context</p>
                          <p className="text-sm text-white/60 italic leading-relaxed">"{vocab.context}"</p>
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
