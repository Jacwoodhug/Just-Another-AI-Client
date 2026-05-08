import { useState, useEffect, useCallback, useRef } from 'react';
import {
  listImages, listFolders, createFolder as apiCreateFolder, deleteFolder as apiDeleteFolder,
  starImage as apiStar, setImageFolder as apiSetFolder,
  deleteImage as apiDelete, bulkDelete as apiBulkDelete, bulkSetFolder as apiBulkSetFolder,
  generateImage as apiGenerate,
} from '../api/image.js';

let _queueId = 0;
function genQueueId() { return `q-${++_queueId}`; }

const GEN_STORAGE_KEY = 'imageWorkspace:genSettings';
const CHAT_STORAGE_KEY = 'imageWorkspace:chatMessages';

function loadGenSettings() {
  try {
    const raw = localStorage.getItem(GEN_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function loadChatMessages() {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function useImageWorkspace() {
  // --- Library ---
  const [images, setImages] = useState([]);
  const [folders, setFolders] = useState([]);
  const [activeFolder, setActiveFolder] = useState('all');
  const [showStarred, setShowStarred] = useState(false);
  const [selectedImages, setSelectedImages] = useState(new Set());
  const [detailImg, setDetailImg] = useState(null);
  const [editImg, setEditImg] = useState(null);
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // --- Generation ---
  const _gs = loadGenSettings();
  const [prompt, setPrompt] = useState(_gs.prompt ?? '');
  const [negPrompt, setNegPrompt] = useState(_gs.negPrompt ?? '');
  const [enhance, setEnhance] = useState(_gs.enhance ?? true);
  const [seed, setSeed] = useState(_gs.seed ?? '');
  const [lockSeed, setLockSeed] = useState(_gs.lockSeed ?? false);
  const [batchCount, setBatchCount] = useState(_gs.batchCount ?? 1);
  const [aspectRatio, setAspectRatio] = useState(_gs.aspectRatio ?? '1:1');
  const [customRes, setCustomRes] = useState(_gs.customRes ?? '');
  const [negOpen, setNegOpen] = useState(_gs.negOpen ?? false);
  const [moreOpen, setMoreOpen] = useState(_gs.moreOpen ?? false);
  const [queue, setQueue] = useState([]);

  // --- Agent Chat ---
  const [chatMessages, setChatMessages] = useState(() => loadChatMessages());
  const [chatInput, setChatInput] = useState('');

  const abortRefs = useRef({});

  // Persist generation settings
  useEffect(() => {
    try {
      localStorage.setItem(GEN_STORAGE_KEY, JSON.stringify({
        prompt, negPrompt, enhance, seed, lockSeed, batchCount, aspectRatio, customRes, negOpen, moreOpen,
      }));
    } catch {}
  }, [prompt, negPrompt, enhance, seed, lockSeed, batchCount, aspectRatio, customRes, negOpen, moreOpen]);

  // Persist chat messages (skip transient typing/status entries)
  useEffect(() => {
    try {
      const toSave = chatMessages.filter(m => m.role === 'user' || m.role === 'ai');
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(toSave));
    } catch {}
  }, [chatMessages]);

  // Load on mount
  useEffect(() => {
    listImages().then(setImages).catch(() => {});
    listFolders().then(setFolders).catch(() => {});
  }, []);

  // Refresh image grid when agent generates an image via chat
  useEffect(() => {
    function onLibraryUpdated() {
      listImages().then(setImages).catch(() => {});
    }
    window.addEventListener('image:library_updated', onLibraryUpdated);
    return () => window.removeEventListener('image:library_updated', onLibraryUpdated);
  }, []);

  // Agent chat event bridge
  useEffect(() => {
    function onAdd(e) {
      const { id, role, text, variant } = e.detail;
      if (variant === 'typing') {
        setChatMessages(prev => {
          const filtered = prev.filter(m => m.role !== 'typing');
          return [...filtered, { id, role: 'typing', text: '' }];
        });
        return;
      }
      if (variant === 'status') {
        setChatMessages(prev => [...prev, { id: id || genQueueId(), role: 'status', text: text || '' }]);
        return;
      }
      setChatMessages(prev => {
        const filtered = prev.filter(m => m.role !== 'typing');
        return [...filtered, { id: id || genQueueId(), role: role === 'user' ? 'user' : 'ai', text: text || '' }];
      });
    }
    function onToken(e) {
      const { id, token } = e.detail;
      setChatMessages(prev => prev.map(m => m.id === id ? { ...m, text: m.text + token } : m));
    }
    function onImageReady(e) {
      const { url } = e.detail;
      if (!url) return;
      const msgId = genQueueId();
      setChatMessages(prev => {
        const filtered = prev.filter(m => m.role !== 'typing');
        return [...filtered, { id: msgId, role: 'ai', text: '', imageDataUrls: [url] }];
      });
    }
    function onStreamStart(e) {
      const { id } = e.detail;
      setChatMessages(prev => [...prev, { id, role: 'ai', text: '', isStreaming: true }]);
    }
    function onStreamEnd(e) {
      const { id } = e.detail;
      setChatMessages(prev => prev.map(m => m.id === id ? { ...m, isStreaming: false } : m));
    }
    window.addEventListener('image-chat:add', onAdd);
    window.addEventListener('image-chat:imageReady', onImageReady);
    window.addEventListener('image-chat:token', onToken);
    window.addEventListener('image-chat:streamStart', onStreamStart);
    window.addEventListener('image-chat:streamEnd', onStreamEnd);
    return () => {
      window.removeEventListener('image-chat:add', onAdd);
      window.removeEventListener('image-chat:imageReady', onImageReady);
      window.removeEventListener('image-chat:token', onToken);
      window.removeEventListener('image-chat:streamStart', onStreamStart);
      window.removeEventListener('image-chat:streamEnd', onStreamEnd);
    };
  }, []);

  const sendImageChatMessage = useCallback((text) => {
    window.imageChatBridge?.sendText(text);
  }, []);

  // --- Library actions ---
  const handleStar = useCallback(async (filename) => {
    try {
      const result = await apiStar(filename);
      setImages(prev => prev.map(img =>
        img.filename === filename ? { ...img, starred: result.starred } : img
      ));
    } catch (_) {}
  }, []);

  const handleDelete = useCallback(async (filename) => {
    try {
      await apiDelete(filename);
      setImages(prev => prev.filter(img => img.filename !== filename));
      setSelectedImages(prev => { const s = new Set(prev); s.delete(filename); return s; });
      if (detailImg?.filename === filename) setDetailImg(null);
    } catch (_) {}
  }, [detailImg]);

  const handleSetFolder = useCallback(async (filename, folder) => {
    try {
      await apiSetFolder(filename, folder);
      setImages(prev => prev.map(img =>
        img.filename === filename ? { ...img, folder: folder ?? null } : img
      ));
    } catch (_) {}
  }, []);

  const handleDropToFolder = useCallback(async (filename, folderName) => {
    // Optimistic update
    setImages(prev => prev.map(img =>
      img.filename === filename ? { ...img, folder: folderName } : img
    ));
    try {
      await apiSetFolder(filename, folderName);
    } catch (_) {
      // Revert on error
      listImages().then(setImages).catch(() => {});
    }
  }, []);

  // --- Selection ---
  const toggleSelect = useCallback((filename) => {
    setSelectedImages(prev => {
      const s = new Set(prev);
      s.has(filename) ? s.delete(filename) : s.add(filename);
      return s;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedImages(new Set(images.map(img => img.filename)));
  }, [images]);

  const clearSelection = useCallback(() => {
    setSelectedImages(new Set());
  }, []);

  // --- Bulk actions ---
  const handleBulkDelete = useCallback(async () => {
    const filenames = [...selectedImages];
    try {
      await apiBulkDelete(filenames);
      setImages(prev => prev.filter(img => !selectedImages.has(img.filename)));
      setSelectedImages(new Set());
    } catch (_) {}
  }, [selectedImages]);

  const handleBulkSetFolder = useCallback(async (folder) => {
    const filenames = [...selectedImages];
    try {
      await apiBulkSetFolder(filenames, folder);
      setImages(prev => prev.map(img =>
        selectedImages.has(img.filename) ? { ...img, folder: folder ?? null } : img
      ));
      setSelectedImages(new Set());
    } catch (_) {}
  }, [selectedImages]);

  // --- Folder management ---
  const addFolder = useCallback(async (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await apiCreateFolder(trimmed);
      setFolders(prev => [...new Set([...prev, trimmed])].sort());
    } catch (_) {}
    setAddingFolder(false);
    setNewFolderName('');
  }, []);

  const deleteFolder = useCallback(async (name) => {
    try {
      await apiDeleteFolder(name);
      setFolders(prev => prev.filter(f => f !== name));
      setImages(prev => prev.map(img => img.folder === name ? { ...img, folder: null } : img));
      if (activeFolder === name) setActiveFolder('all');
    } catch (_) {}
  }, [activeFolder]);

  // --- Generation ---
  function _resolutionForAspect(ar, custom) {
    if (ar === 'custom' && custom) return custom;
    const map = { '1:1': '1024x1024', '16:9': '1216x704', '9:16': '704x1216', '4:3': '1152x864', '3:4': '864x1152' };
    return map[ar] || '1024x1024';
  }

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    const resolution = _resolutionForAspect(aspectRatio, customRes);
    const count = Math.max(1, Math.min(batchCount, 8));

    // Read the header model/provider selection from localStorage (set by app.js)
    const _provider = localStorage.getItem('llmProvider') || 'ollama';
    const _modelKey = _provider === 'openrouter' ? 'openrouterModel' : 'ollamaModel';
    const _model = localStorage.getItem(_modelKey) || undefined;

    for (let i = 0; i < count; i++) {
      const qId = genQueueId();
      const itemPrompt = prompt;
      setQueue(prev => [...prev, { id: qId, prompt: itemPrompt, status: 'queued', progress: 0 }]);

      const controller = new AbortController();
      abortRefs.current[qId] = controller;

      try {
        await apiGenerate(
          {
            prompt: itemPrompt,
            negative_prompt: negPrompt,
            resolution,
            raw: !enhance,
            model: _model,
            provider: _provider,
            workspace: 'image',
            ...(lockSeed && seed ? { seed: parseInt(seed, 10) } : {}),
          },
          (chunk) => {
            if (chunk.type === 'status') {
              setQueue(prev => prev.map(q => q.id === qId ? { ...q, status: chunk.text, progress: 50 } : q));
            } else if (chunk.type === 'image_ready') {
              const filename = chunk.url.split('/').pop();
              const newImg = {
                filename,
                url: chunk.url,
                prompt: itemPrompt,
                negPrompt,
                enhancedPrompt: chunk.enhanced_prompt || '',
                enhanced: !!chunk.enhanced_prompt,
                seed: chunk.seed ?? null,
                resolution,
                timestamp: new Date().toISOString(),
                starred: false,
                folder: null,
                source: 'manual',
                workspace: 'image',
                personality: null,
              };
              setImages(prev => [newImg, ...prev]);
              setQueue(prev => prev.map(q => q.id === qId ? { ...q, status: 'done', progress: 100 } : q));
              // Remove from queue after short delay
              setTimeout(() => setQueue(prev => prev.filter(q => q.id !== qId)), 3000);
            } else if (chunk.type === 'error') {
              setQueue(prev => prev.map(q => q.id === qId ? { ...q, status: `Error: ${chunk.detail}`, progress: 0 } : q));
              setTimeout(() => setQueue(prev => prev.filter(q => q.id !== qId)), 5000);
            }
          },
          controller.signal,
        );
      } catch (err) {
        if (err.name !== 'AbortError') {
          setQueue(prev => prev.map(q => q.id === qId ? { ...q, status: 'Failed', progress: 0 } : q));
          setTimeout(() => setQueue(prev => prev.filter(q => q.id !== qId)), 5000);
        } else {
          setQueue(prev => prev.filter(q => q.id !== qId));
        }
      } finally {
        delete abortRefs.current[qId];
      }
    }
  }, [prompt, negPrompt, enhance, aspectRatio, customRes, batchCount]);

  const cancelQueueItem = useCallback((qId) => {
    abortRefs.current[qId]?.abort();
    setQueue(prev => prev.filter(q => q.id !== qId));
  }, []);

  return {
    // Library state
    images, folders, activeFolder, setActiveFolder,
    showStarred, setShowStarred,
    selectedImages,
    detailImg, setDetailImg,
    editImg, setEditImg,
    addingFolder, setAddingFolder,
    newFolderName, setNewFolderName,
    // Library actions
    handleStar, handleDelete, handleSetFolder, handleDropToFolder,
    toggleSelect, selectAll, clearSelection,
    handleBulkDelete, handleBulkSetFolder,
    addFolder, deleteFolder,
    setImages,
    // Generation state
    prompt, setPrompt,
    negPrompt, setNegPrompt,
    enhance, setEnhance,
    seed, setSeed,
    lockSeed, setLockSeed,
    batchCount, setBatchCount,
    aspectRatio, setAspectRatio,
    customRes, setCustomRes,
    negOpen, setNegOpen,
    moreOpen, setMoreOpen,
    queue, cancelQueueItem,
    handleGenerate,
    // Agent chat
    chatMessages, chatInput, setChatInput, sendImageChatMessage,
  };
}
