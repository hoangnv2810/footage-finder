import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, Search, Film, Play, AlertCircle, Loader2, X, CheckCircle2, Download, FileText, Clock, History, Plus, Scissors, Trash2, RefreshCw } from 'lucide-react';
import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile } from '@ffmpeg/util';

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Initialize FFmpeg
const ffmpeg = new FFmpeg();

interface Scene {
  keyword: string;
  start: number;
  end: number;
  description: string;
}

interface VideoVersion {
  id: string;
  timestamp: number;
  scenes: Scene[];
}

interface VideoResult {
  fileName: string;
  file?: File;
  scenes: Scene[];
  status: 'pending' | 'analyzing' | 'success' | 'error';
  error?: string;
  objectUrl?: string;
  versions?: VideoVersion[];
  currentVersionIndex?: number;
}

interface HistoryItem {
  id: string;
  date: number;
  keywords: string;
  videos: VideoResult[];
}

export default function App() {
  const [keywords, setKeywords] = useState('');
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [currentSearchId, setCurrentSearchId] = useState<string | null>(null);
  const [trimmingScene, setTrimmingScene] = useState<string | null>(null);
  const [trimProgress, setTrimProgress] = useState<number>(0);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const relinkInputRef = useRef<HTMLInputElement>(null);
  const [relinkIndex, setRelinkIndex] = useState<number | null>(null);

  // Load history on mount
  useEffect(() => {
    const saved = localStorage.getItem('footage_finder_history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        // Migrate old history to support versions
        const migrated = parsed.map((item: any) => ({
          ...item,
          videos: item.videos.map((v: any) => {
            if (v.versions) return v;
            return {
              ...v,
              versions: v.scenes ? [{ id: 'v1', timestamp: item.date, scenes: v.scenes }] : [],
              currentVersionIndex: 0,
            };
          })
        }));
        setHistory(migrated);
      } catch (e) {
        console.error('Failed to parse history', e);
      }
    }

    // Setup FFmpeg progress listener
    ffmpeg.on('progress', ({ progress }) => {
      setTrimProgress(Math.round(progress * 100));
    });
  }, []);

  // Save history
  const saveToHistory = (newVideos: VideoResult[], searchKeywords: string) => {
    const newItem: HistoryItem = {
      id: Date.now().toString(),
      date: Date.now(),
      keywords: searchKeywords,
      videos: [...newVideos] // Keep files and objectUrls in React state
    };
    
    const updatedHistory = [newItem, ...history].slice(0, 20); // Keep last 20
    setHistory(updatedHistory);
    setCurrentSearchId(newItem.id);

    // Strip File objects and objectUrls only for localStorage
    const storageHistory = updatedHistory.map(item => ({
      ...item,
      videos: item.videos.map(v => ({
        fileName: v.fileName,
        scenes: v.scenes,
        status: v.status,
        error: v.error,
        versions: v.versions,
        currentVersionIndex: v.currentVersionIndex
      }))
    }));
    localStorage.setItem('footage_finder_history', JSON.stringify(storageHistory));
  };

  const updateCurrentHistory = (newVideos: VideoResult[]) => {
    if (!currentSearchId) return;
    
    setHistory(prev => {
      const updated = prev.map(item => {
        if (item.id === currentSearchId) {
          return { ...item, videos: newVideos };
        }
        return item;
      });
      
      const storageHistory = updated.map(item => ({
        ...item,
        videos: item.videos.map(v => ({
          fileName: v.fileName,
          scenes: v.scenes,
          status: v.status,
          error: v.error,
          versions: v.versions,
          currentVersionIndex: v.currentVersionIndex
        }))
      }));
      localStorage.setItem('footage_finder_history', JSON.stringify(storageHistory));
      return updated;
    });
  };

  const deleteHistoryItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setHistory(prev => {
      const updated = prev.filter(item => item.id !== id);
      const storageHistory = updated.map(item => ({
        ...item,
        videos: item.videos.map(v => ({
          fileName: v.fileName,
          scenes: v.scenes,
          status: v.status,
          error: v.error,
          versions: v.versions,
          currentVersionIndex: v.currentVersionIndex
        }))
      }));
      localStorage.setItem('footage_finder_history', JSON.stringify(storageHistory));
      return updated;
    });
    if (currentSearchId === id) {
      startNewSearch();
    }
  };

  const startNewSearch = () => {
    setKeywords('');
    setVideos([]);
    setCurrentSearchId(null);
    setGlobalError(null);
  };

  const loadHistoryItem = (item: HistoryItem) => {
    setKeywords(item.keywords);
    setVideos(item.videos.map(v => ({ ...v })));
    setCurrentSearchId(item.id);
    setGlobalError(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files) as File[];
      
      if (videos.length + newFiles.length > 10) {
        setGlobalError('Bạn chỉ có thể tải lên tối đa 10 video.');
        return;
      }

      const newVideoResults = newFiles.map((file: File) => ({
        fileName: file.name,
        file,
        scenes: [],
        status: 'pending' as const,
        objectUrl: URL.createObjectURL(file)
      }));

      setVideos(prev => [...prev, ...newVideoResults]);
      setGlobalError(null);
    }
  };

  const handleRelinkFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && relinkIndex !== null) {
      const file = e.target.files[0];
      setVideos(prev => {
        const newVideos = [...prev];
        if (newVideos[relinkIndex].fileName === file.name) {
          newVideos[relinkIndex].file = file;
          newVideos[relinkIndex].objectUrl = URL.createObjectURL(file);
          
          // Update the file in history state as well so it persists during the session
          setHistory(currentHistory => currentHistory.map(item => {
            if (item.id === currentSearchId) {
              return { ...item, videos: newVideos };
            }
            return item;
          }));
        } else {
          setGlobalError(`Vui lòng chọn đúng file có tên "${newVideos[relinkIndex].fileName}"`);
        }
        return newVideos;
      });
      setRelinkIndex(null);
    }
  };

  const removeVideo = (index: number) => {
    setVideos(prev => {
      const newVideos = [...prev];
      if (newVideos[index].objectUrl) {
        URL.revokeObjectURL(newVideos[index].objectUrl!);
      }
      newVideos.splice(index, 1);
      return newVideos;
    });
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          const base64 = reader.result.split(',')[1];
          resolve(base64);
        } else {
          reject(new Error('Failed to convert file to base64'));
        }
      };
      reader.onerror = error => reject(error);
    });
  };

  const analyzeVideos = async () => {
    if (!keywords.trim()) {
      setGlobalError('Vui lòng nhập từ khóa để tìm kiếm.');
      return;
    }
    if (videos.length === 0) {
      setGlobalError('Vui lòng tải lên ít nhất một video.');
      return;
    }

    // Check if all videos have files (in case of re-running a history item)
    if (videos.some(v => !v.file)) {
      setGlobalError('Vui lòng liên kết lại các file video bị thiếu trước khi phân tích lại.');
      return;
    }

    setIsAnalyzing(true);
    setGlobalError(null);

    const updatedVideos = videos.map(v => ({ ...v, status: 'pending' as const, scenes: [], error: undefined }));
    setVideos(updatedVideos);

    for (let i = 0; i < updatedVideos.length; i++) {
      const video = updatedVideos[i];
      
      setVideos(prev => {
        const newVideos = [...prev];
        newVideos[i].status = 'analyzing';
        return newVideos;
      });

      try {
        if (video.file!.size > 20 * 1024 * 1024) {
          throw new Error('Video quá lớn. Vui lòng giữ dung lượng dưới 20MB để trình duyệt xử lý.');
        }

        const base64Data = await fileToBase64(video.file!);
        
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-pro-preview',
          contents: [
            {
              inlineData: {
                data: base64Data,
                mimeType: video.file!.type
              }
            },
            `Analyze this video and find scenes that match any of the following keywords: ${keywords}. The keywords might be in Chinese or other languages. Return a JSON array of the matching scenes. Please write the 'description' field in Vietnamese.`
          ],
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  keyword: { type: Type.STRING, description: 'The keyword that matched this scene' },
                  start: { type: Type.NUMBER, description: 'Start time in seconds' },
                  end: { type: Type.NUMBER, description: 'End time in seconds' },
                  description: { type: Type.STRING, description: 'Brief description of the scene' }
                },
                required: ['keyword', 'start', 'end', 'description']
              }
            }
          }
        });

        const scenes: Scene[] = JSON.parse(response.text || '[]');
        
        const newVersion: VideoVersion = {
          id: Date.now().toString(),
          timestamp: Date.now(),
          scenes: scenes
        };

        updatedVideos[i].status = 'success';
        updatedVideos[i].scenes = scenes;
        updatedVideos[i].versions = [newVersion];
        updatedVideos[i].currentVersionIndex = 0;
        setVideos([...updatedVideos]);

      } catch (error: any) {
        console.error(`Error analyzing video ${video.fileName}:`, error);
        updatedVideos[i].status = 'error';
        updatedVideos[i].error = error.message || 'Lỗi khi phân tích video';
        setVideos([...updatedVideos]);
      }
    }

    saveToHistory(updatedVideos, keywords);
    setIsAnalyzing(false);
  };

  const analyzeSingleVideo = async (index: number) => {
    if (!keywords.trim()) {
      setGlobalError('Vui lòng nhập từ khóa để tìm kiếm.');
      return;
    }
    
    const video = videos[index];
    if (!video.file) {
      setGlobalError('Vui lòng liên kết lại file video trước khi phân tích lại.');
      return;
    }

    setGlobalError(null);
    setVideos(prev => {
      const newVideos = [...prev];
      newVideos[index] = { ...newVideos[index], status: 'analyzing', error: undefined };
      return newVideos;
    });

    try {
      if (video.file!.size > 20 * 1024 * 1024) {
        throw new Error('Video quá lớn. Vui lòng giữ dung lượng dưới 20MB để trình duyệt xử lý.');
      }

      const base64Data = await fileToBase64(video.file!);
      
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: [
          {
            inlineData: {
              data: base64Data,
              mimeType: video.file!.type
            }
          },
          `Analyze this video and find scenes that match any of the following keywords: ${keywords}. The keywords might be in Chinese or other languages. Return a JSON array of the matching scenes. Please write the 'description' field in Vietnamese.`
        ],
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                keyword: { type: Type.STRING, description: 'The keyword that matched this scene' },
                start: { type: Type.NUMBER, description: 'Start time in seconds' },
                end: { type: Type.NUMBER, description: 'End time in seconds' },
                description: { type: Type.STRING, description: 'Brief description of the scene' }
              },
              required: ['keyword', 'start', 'end', 'description']
            }
          }
        }
      });

      const scenes: Scene[] = JSON.parse(response.text || '[]');
      
      setVideos(prev => {
        const newVideos = [...prev];
        const currentVideo = newVideos[index];
        
        const newVersion: VideoVersion = {
          id: Date.now().toString(),
          timestamp: Date.now(),
          scenes: scenes
        };
        
        const existingVersions = currentVideo.versions || (currentVideo.scenes ? [{ id: 'v1', timestamp: Date.now() - 1000, scenes: currentVideo.scenes }] : []);
        
        newVideos[index] = {
          ...currentVideo,
          status: 'success',
          scenes: scenes,
          versions: [...existingVersions, newVersion],
          currentVersionIndex: existingVersions.length
        };
        
        updateCurrentHistory(newVideos);
        return newVideos;
      });

    } catch (error: any) {
      console.error(`Error analyzing video ${video.fileName}:`, error);
      setVideos(prev => {
        const newVideos = [...prev];
        newVideos[index] = {
          ...newVideos[index],
          status: 'error',
          error: error.message || 'Lỗi khi phân tích video'
        };
        return newVideos;
      });
    }
  };

  const switchVersion = (videoIndex: number, versionIndex: number) => {
    setVideos(prev => {
      const newVideos = [...prev];
      const video = newVideos[videoIndex];
      if (video.versions && video.versions[versionIndex]) {
        newVideos[videoIndex] = {
          ...video,
          scenes: video.versions[versionIndex].scenes,
          currentVersionIndex: versionIndex
        };
        updateCurrentHistory(newVideos);
      }
      return newVideos;
    });
  };

  const exportSRT = (video: VideoResult) => {
    if (video.scenes.length === 0) return;

    let srt = '';
    video.scenes.forEach((scene, index) => {
      const formatSRTTime = (seconds: number) => {
        const date = new Date(seconds * 1000);
        const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
        const mm = String(date.getUTCMinutes()).padStart(2, '0');
        const ss = String(date.getUTCSeconds()).padStart(2, '0');
        const ms = String(date.getUTCMilliseconds()).padStart(3, '0');
        return `${hh}:${mm}:${ss},${ms}`;
      };
      srt += `${index + 1}\n`;
      srt += `${formatSRTTime(scene.start)} --> ${formatSRTTime(scene.end)}\n`;
      srt += `[${scene.keyword}] ${scene.description}\n\n`;
    });

    const blob = new Blob([srt], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${video.fileName.split('.')[0]}_scenes.srt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const trimAndDownload = async (video: VideoResult, scene: Scene, sceneIndex: number) => {
    if (!video.file) return;
    
    const sceneId = `${video.fileName}-${sceneIndex}`;
    setTrimmingScene(sceneId);
    setTrimProgress(0);
    
    try {
      if (!ffmpeg.loaded) {
        await ffmpeg.load({
          coreURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.js',
          wasmURL: 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd/ffmpeg-core.wasm',
        });
      }

      await ffmpeg.writeFile('input.mp4', await fetchFile(video.file));
      
      // Use -c copy for fast trimming without re-encoding
      await ffmpeg.exec([
        '-i', 'input.mp4', 
        '-ss', scene.start.toString(), 
        '-to', scene.end.toString(), 
        '-c', 'copy', 
        'output.mp4'
      ]);
      
      const data = await ffmpeg.readFile('output.mp4');
      const blob = new Blob([data], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `${video.fileName.split('.')[0]}_${scene.keyword}_${Math.floor(scene.start)}s.mp4`;
      a.click();
      URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Error trimming video:', error);
      alert('Lỗi khi cắt video. Định dạng video có thể không hỗ trợ cắt nhanh.');
    } finally {
      setTrimmingScene(null);
      setTrimProgress(0);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 font-sans selection:bg-indigo-500/30 flex overflow-hidden">
      
      {/* Sidebar History */}
      <motion.div 
        initial={false}
        animate={{ width: isSidebarOpen ? 320 : 0, opacity: isSidebarOpen ? 1 : 0 }}
        className="h-screen bg-zinc-900/50 border-r border-zinc-800 flex-shrink-0 overflow-hidden flex flex-col"
      >
        <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center space-x-2 text-zinc-100">
            <History className="w-5 h-5" />
            <span className="font-medium">Lịch sử</span>
          </div>
          <button 
            onClick={startNewSearch}
            className="p-1.5 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 rounded-md transition-colors"
            title="Tìm kiếm mới"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
          {history.length === 0 ? (
            <p className="text-sm text-zinc-500 text-center mt-10">Chưa có lịch sử</p>
          ) : (
            history.map(item => (
              <div
                key={item.id}
                className={`w-full text-left p-3 rounded-xl border transition-all relative group ${
                  currentSearchId === item.id 
                    ? 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300' 
                    : 'bg-zinc-950/50 border-zinc-800 hover:border-zinc-700 text-zinc-400'
                }`}
              >
                <button onClick={() => loadHistoryItem(item)} className="w-full text-left pr-6">
                  <p className="font-medium truncate mb-1 text-sm">{item.keywords}</p>
                  <div className="flex items-center justify-between text-xs opacity-70">
                    <span>{item.videos.length} video</span>
                    <span>{new Date(item.date).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>
                </button>
                <button
                  onClick={(e) => deleteHistoryItem(e, item.id)}
                  className="absolute top-3 right-3 p-1 text-zinc-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="Xóa lịch sử"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="flex-1 h-screen overflow-y-auto custom-scrollbar">
        <div className="max-w-[1600px] w-full mx-auto px-4 py-8">
          
          {/* Header */}
          <header className="mb-10 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button 
                onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                className="p-2 bg-zinc-900 border border-zinc-800 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                <History className="w-5 h-5 text-zinc-400" />
              </button>
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-zinc-100 flex items-center">
                  <Film className="w-8 h-8 text-indigo-400 mr-3" />
                  Footage Finder
                </h1>
                <p className="text-sm text-zinc-400 mt-1">
                  Tìm kiếm phân cảnh bằng AI & Xuất sang CapCut
                </p>
              </div>
            </div>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Column: Controls */}
            <div className="lg:col-span-1 space-y-6">
              
              {/* Keywords Input */}
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur-sm">
                <label className="block text-sm font-medium text-zinc-300 mb-2">
                  Từ khóa tìm kiếm
                </label>
                <textarea
                  value={keywords}
                  onChange={(e) => setKeywords(e.target.value)}
                  placeholder="VD: 海滩, hoàng hôn, phong cảnh..."
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-zinc-100 placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 transition-all resize-none h-32"
                  disabled={isAnalyzing}
                />
                <p className="text-xs text-zinc-500 mt-2">
                  Phân cách các từ khóa bằng dấu phẩy. Hỗ trợ đa ngôn ngữ (Việt, Trung, Anh...).
                </p>
              </div>

              {/* Video Upload */}
              <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-4">
                  <label className="block text-sm font-medium text-zinc-300">
                    Video ({videos.length}/10)
                  </label>
                  <span className="text-xs text-zinc-500">Tối đa 20MB/file</span>
                </div>
                
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept="video/*"
                  multiple
                  className="hidden"
                  disabled={isAnalyzing || videos.length >= 10}
                />
                
                <input
                  type="file"
                  ref={relinkInputRef}
                  onChange={handleRelinkFile}
                  accept="video/*"
                  className="hidden"
                />
                
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isAnalyzing || videos.length >= 10}
                  className="w-full flex flex-col items-center justify-center py-6 px-4 border-2 border-dashed border-zinc-800 rounded-xl hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
                >
                  <Upload className="w-6 h-6 text-zinc-500 group-hover:text-indigo-400 mb-2 transition-colors" />
                  <span className="text-sm text-zinc-400 group-hover:text-zinc-300">
                    Nhấn để tải video lên
                  </span>
                </button>

                {/* Video List */}
                <div className="mt-4 space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                  <AnimatePresence>
                    {videos.map((video, idx) => (
                      <motion.div
                        key={`${video.fileName}-${idx}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-800 rounded-lg group"
                      >
                        <div className="flex items-center space-x-3 overflow-hidden">
                          <div className="flex-shrink-0">
                            {!video.file ? <AlertCircle className="w-4 h-4 text-amber-500" /> :
                             video.status === 'pending' ? <Film className="w-4 h-4 text-zinc-500" /> :
                             video.status === 'analyzing' ? <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" /> :
                             video.status === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> :
                             <AlertCircle className="w-4 h-4 text-rose-400" />}
                          </div>
                          <span className={`text-sm truncate ${!video.file ? 'text-amber-500/70' : 'text-zinc-300'}`}>
                            {video.fileName}
                          </span>
                        </div>
                        <button
                          onClick={() => removeVideo(idx)}
                          disabled={isAnalyzing}
                          className="p-1 text-zinc-600 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-0"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>

              {globalError && (
                <motion.div 
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start space-x-3"
                >
                  <AlertCircle className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-rose-300">{globalError}</p>
                </motion.div>
              )}

              <button
                onClick={analyzeVideos}
                disabled={isAnalyzing || videos.length === 0 || !keywords.trim()}
                className="w-full py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-medium flex items-center justify-center space-x-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Đang phân tích Video...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    <span>Tìm Phân Cảnh</span>
                  </>
                )}
              </button>

            </div>

            {/* Right Column: Results */}
            <div className="lg:col-span-2 space-y-6">
              {videos.length === 0 ? (
                <div className="h-full min-h-[400px] flex flex-col items-center justify-center border-2 border-dashed border-zinc-800 rounded-2xl text-zinc-500">
                  <Film className="w-12 h-12 mb-4 opacity-20" />
                  <p>Tải video lên để xem kết quả tại đây</p>
                </div>
              ) : (
                <div className="space-y-8">
                  {videos.map((video, idx) => (
                    <motion.div 
                      key={`result-${idx}`}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="bg-zinc-900/30 border border-zinc-800 rounded-2xl overflow-hidden"
                    >
                      <div className="p-4 border-b border-zinc-800 bg-zinc-900/50 flex items-center justify-between">
                        <h3 className="font-medium text-zinc-200 truncate pr-4 flex items-center">
                          {video.fileName}
                          {!video.file && (
                            <span className="ml-3 inline-flex items-center text-xs text-amber-500 bg-amber-500/10 px-2 py-1 rounded-full">
                              Thiếu file
                            </span>
                          )}
                        </h3>
                        <div className="flex-shrink-0 flex items-center space-x-2">
                          {video.versions && video.versions.length > 1 && (
                            <select 
                              value={video.currentVersionIndex || 0}
                              onChange={(e) => switchVersion(idx, parseInt(e.target.value))}
                              className="bg-zinc-950 border border-zinc-800 text-xs text-zinc-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-indigo-500"
                            >
                              {video.versions.map((v, vIdx) => (
                                <option key={v.id} value={vIdx}>
                                  Lần {vIdx + 1} ({new Date(v.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })})
                                </option>
                              ))}
                            </select>
                          )}
                          
                          <button
                            onClick={() => analyzeSingleVideo(idx)}
                            disabled={video.status === 'analyzing' || !video.file}
                            className="inline-flex items-center text-xs text-zinc-300 bg-zinc-800 hover:bg-zinc-700 px-3 py-1.5 rounded-full transition-colors disabled:opacity-50"
                            title="Phân tích lại video này"
                          >
                            <RefreshCw className="w-3 h-3 mr-1.5" />
                            Phân tích lại
                          </button>

                          {video.status === 'success' && video.scenes.length > 0 && (
                            <button
                              onClick={() => exportSRT(video)}
                              className="inline-flex items-center text-xs text-indigo-400 bg-indigo-400/10 hover:bg-indigo-400/20 px-3 py-1.5 rounded-full transition-colors"
                              title="Xuất SRT cho CapCut"
                            >
                              <FileText className="w-3 h-3 mr-1.5" />
                              Xuất SRT
                            </button>
                          )}
                          {video.status === 'analyzing' && (
                            <span className="inline-flex items-center text-xs text-indigo-400 bg-indigo-400/10 px-2 py-1 rounded-full">
                              <Loader2 className="w-3 h-3 animate-spin mr-1.5" />
                              Đang phân tích
                            </span>
                          )}
                          {video.status === 'success' && (
                            <span className="inline-flex items-center text-xs text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-full">
                              {video.scenes.length} phân cảnh
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-zinc-800">
                        {/* Video Player */}
                        <div className="p-4 bg-black/20 flex flex-col justify-center">
                          {video.objectUrl ? (
                            <video 
                              id={`video-player-${idx}`}
                              src={video.objectUrl} 
                              controls 
                              className="w-full max-h-[60vh] rounded-lg bg-black object-contain"
                            />
                          ) : (
                            <div className="w-full min-h-[300px] bg-zinc-950 rounded-lg border border-zinc-800 flex flex-col items-center justify-center p-6 text-center">
                              <AlertCircle className="w-8 h-8 text-amber-500/50 mb-3" />
                              <p className="text-sm text-zinc-400 mb-4">
                                File video gốc chưa được tải vào bộ nhớ.
                              </p>
                              <button
                                onClick={() => {
                                  setRelinkIndex(idx);
                                  relinkInputRef.current?.click();
                                }}
                                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-sm transition-colors"
                              >
                                Liên kết lại File Video
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Scenes List */}
                        <div className="p-4 h-full max-h-[60vh] overflow-y-auto custom-scrollbar">
                          {video.status === 'pending' && (
                            <div className="h-full flex items-center justify-center text-sm text-zinc-500">
                              Đang chờ phân tích...
                            </div>
                          )}
                          
                          {video.status === 'analyzing' && (
                            <div className="h-full flex flex-col items-center justify-center text-sm text-zinc-500 space-y-3">
                              <Loader2 className="w-6 h-6 text-indigo-500/50 animate-spin" />
                              <p>Đang quét video...</p>
                            </div>
                          )}

                          {video.status === 'error' && (
                            <div className="h-full flex flex-col items-center justify-center text-sm text-rose-400/80 text-center p-4">
                              <AlertCircle className="w-6 h-6 mb-2 opacity-50" />
                              <p>{video.error}</p>
                            </div>
                          )}

                          {video.status === 'success' && video.scenes.length === 0 && (
                            <div className="h-full flex items-center justify-center text-sm text-zinc-500">
                              Không tìm thấy phân cảnh nào phù hợp.
                            </div>
                          )}

                          {video.status === 'success' && video.scenes.length > 0 && (
                            <div className="space-y-3">
                              {video.scenes.map((scene, sIdx) => {
                                const isTrimming = trimmingScene === `${video.fileName}-${sIdx}`;
                                return (
                                  <div 
                                    key={sIdx}
                                    className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 hover:border-indigo-500/30 transition-colors group"
                                  >
                                    <div className="flex items-start justify-between mb-2">
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                                        {scene.keyword}
                                      </span>
                                      <div className="flex items-center space-x-2">
                                        <button 
                                          onClick={() => {
                                            const player = document.getElementById(`video-player-${idx}`) as HTMLVideoElement;
                                            if (player) {
                                              player.currentTime = scene.start;
                                              player.play().catch(() => {});
                                            }
                                          }}
                                          disabled={!video.file}
                                          className="flex items-center text-xs text-zinc-400 hover:text-indigo-400 transition-colors disabled:opacity-50 disabled:hover:text-zinc-400"
                                          title="Phát từ đây"
                                        >
                                          <Play className="w-3 h-3 mr-1" />
                                          {formatTime(scene.start)} - {formatTime(scene.end)}
                                        </button>
                                      </div>
                                    </div>
                                    <p className="text-sm text-zinc-300 leading-relaxed mb-3">
                                      {scene.description}
                                    </p>
                                    
                                    {/* Actions */}
                                    <div className="flex items-center justify-end pt-2 border-t border-zinc-800/50">
                                      <button
                                        onClick={() => trimAndDownload(video, scene, sIdx)}
                                        disabled={!video.file || isTrimming}
                                        className="flex items-center text-xs px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                      >
                                        {isTrimming ? (
                                          <Loader2 className="w-3 h-3 mr-1.5 animate-spin" />
                                        ) : (
                                          <Scissors className="w-3 h-3 mr-1.5" />
                                        )}
                                        {isTrimming ? `Đang cắt... ${trimProgress}%` : 'Cắt & Tải xuống'}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
