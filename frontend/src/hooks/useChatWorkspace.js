import { useState, useEffect, useCallback } from 'react';

function genId() {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getInitialState() {
  try { return window.chatBridge?.getState?.() || {}; } catch { return {}; }
}

function getInitialHistory() {
  try {
    const raw = window.chatBridge?.getHistory?.();
    if (!Array.isArray(raw)) return [];
    return raw.map(h => ({
      id: genId(),
      role: h.role === 'assistant' ? 'ai' : 'user',
      text: h.text || '',
      imageDataUrl: h.imageDataUrl || '',
      imageDataUrls: (h.imageDataUrls && h.imageDataUrls.length > 0) ? h.imageDataUrls : null,
      personalityName: h.personalityName || '',
    }));
  } catch { return []; }
}

export function useChatWorkspace() {
  const s0 = getInitialState();

  const [messages, setMessages] = useState(() => getInitialHistory());
  const [micActive, setMicActive]     = useState(() => Boolean(s0.isListening));
  const [screenOn, setScreenOn]       = useState(() => Boolean(s0.screenOn));
  const [idleOn, setIdleOn]           = useState(() => Boolean(s0.idleOn));
  const [loopOn, setLoopOn]           = useState(() => s0.loopOn !== false);
  const [ttsOn, setTtsOn]             = useState(() => s0.ttsOn !== false);
  const [isProcessing, setIsProcessing] = useState(() => Boolean(s0.isProcessing));
  const [attachedImage, setAttachedImage] = useState(() => s0.attachedImage || null);
  const [text, setText] = useState('');

  useEffect(() => {
    function onAdd(e) {
      const { id, role, text, variant, imageDataUrl, personalityName } = e.detail;

      if (typeof variant === 'string' && variant.includes('typing')) {
        setMessages(prev => {
          const filtered = prev.filter(m => m.role !== 'typing');
          return [...filtered, { id, role: 'typing', text: '' }];
        });
        return;
      }

      if (typeof variant === 'string' && variant.includes('generating')) {
        setMessages(prev => {
          const filtered = prev.filter(m => m.role !== 'generating');
          return [...filtered, { id, role: 'generating', text: '' }];
        });
        return;
      }

      if (variant === 'status') {
        setMessages(prev => [...prev, {
          id: id || genId(), role: 'status',
          text: text || '', personalityName: personalityName || '',
        }]);
        return;
      }

      setMessages(prev => [...prev, {
        id: id || genId(),
        role: role === 'user' ? 'user' : 'ai',
        text: text || '',
        imageDataUrl: imageDataUrl || '',
        personalityName: personalityName || '',
      }]);
    }

    function onStreamStart(e) {
      const { id, personalityName } = e.detail;
      setMessages(prev => [...prev, {
        id, role: 'ai', text: '', personalityName: personalityName || '', isStreaming: true,
      }]);
    }

    function onToken(e) {
      const { id, text } = e.detail;
      setMessages(prev => prev.map(m => m.id === id ? { ...m, text } : m));
    }

    function onStreamEnd(e) {
      const { id } = e.detail;
      setMessages(prev => prev.map(m => m.id === id ? { ...m, isStreaming: false } : m));
    }

    function onStatusUpdate(e) {
      const { id, text } = e.detail;
      setMessages(prev => prev.map(m => m.id === id ? { ...m, text } : m));
    }

    function onImageGroupAdd(e) {
      const { groupId, url } = e.detail;
      setMessages(prev => {
        const idx = prev.findIndex(m => m.id === groupId);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            imageDataUrls: [...(updated[idx].imageDataUrls || []), url],
          };
          return updated;
        }
        return [...prev, {
          id: groupId, role: 'ai', text: '', imageDataUrls: [url], personalityName: '',
        }];
      });
    }

    function onRemove(e) {
      const { id } = e.detail;
      setMessages(prev => prev.filter(m => m.id !== id));
    }

    function onRemoveLastRole(e) {
      const { role } = e.detail;
      setMessages(prev => {
        const revIdx = [...prev].reverse().findIndex(m => m.role === role);
        if (revIdx < 0) return prev;
        const idx = prev.length - 1 - revIdx;
        return prev.filter((_, i) => i !== idx);
      });
    }

    function onClear() {
      setMessages([]);
    }

    function onReload() {
      setMessages(getInitialHistory());
    }

    function onStateUpdate(e) {
      const s = e.detail || {};
      if (typeof s.isListening === 'boolean') setMicActive(s.isListening);
      if (typeof s.screenOn    === 'boolean') setScreenOn(s.screenOn);
      if (typeof s.idleOn      === 'boolean') setIdleOn(s.idleOn);
      if (typeof s.loopOn      === 'boolean') setLoopOn(s.loopOn);
      if (typeof s.ttsOn       === 'boolean') setTtsOn(s.ttsOn);
      if (typeof s.isProcessing === 'boolean') setIsProcessing(s.isProcessing);
      if ('attachedImage' in s) setAttachedImage(s.attachedImage);
    }

    window.addEventListener('chat:add',           onAdd);
    window.addEventListener('chat:streamStart',    onStreamStart);
    window.addEventListener('chat:token',          onToken);
    window.addEventListener('chat:streamEnd',      onStreamEnd);
    window.addEventListener('chat:statusUpdate',   onStatusUpdate);
    window.addEventListener('chat:imageGroupAdd',  onImageGroupAdd);
    window.addEventListener('chat:remove',         onRemove);
    window.addEventListener('chat:removeLastRole', onRemoveLastRole);
    window.addEventListener('chat:clear',          onClear);
    window.addEventListener('chat:reload',         onReload);
    window.addEventListener('chat:stateUpdate',    onStateUpdate);

    return () => {
      window.removeEventListener('chat:add',           onAdd);
      window.removeEventListener('chat:streamStart',    onStreamStart);
      window.removeEventListener('chat:token',          onToken);
      window.removeEventListener('chat:streamEnd',      onStreamEnd);
      window.removeEventListener('chat:statusUpdate',   onStatusUpdate);
      window.removeEventListener('chat:imageGroupAdd',  onImageGroupAdd);
      window.removeEventListener('chat:remove',         onRemove);
      window.removeEventListener('chat:removeLastRole', onRemoveLastRole);
      window.removeEventListener('chat:clear',          onClear);
      window.removeEventListener('chat:reload',         onReload);
      window.removeEventListener('chat:stateUpdate',    onStateUpdate);
    };
  }, []);

  const sendMessage          = useCallback(t  => window.chatBridge?.sendText(t),              []);
  const toggleMic            = useCallback(()  => window.chatBridge?.toggleMic(),              []);
  const toggleScreen         = useCallback(()  => window.chatBridge?.toggleScreen(),           []);
  const toggleIdle           = useCallback(()  => window.chatBridge?.toggleIdle(),             []);
  const toggleLoop           = useCallback(()  => window.chatBridge?.toggleLoop(),             []);
  const toggleTts            = useCallback(()  => window.chatBridge?.toggleTts(),              []);
  const newChat              = useCallback(()  => window.chatBridge?.newChat(),                []);
  const openAttach           = useCallback(()  => window.chatBridge?.openAttach(),             []);
  const clearAttach          = useCallback(()  => window.chatBridge?.clearAttach(),            []);
  const cancelRequest        = useCallback(()  => window.chatBridge?.cancelRequest(),          []);
  const regenerateAssistant  = useCallback(()  => window.chatBridge?.regenerateAssistant?.(),  []);
  const deleteLastAssistant  = useCallback(()  => window.chatBridge?.deleteLastAssistant?.(),  []);
  const deleteLastExchange   = useCallback(()  => window.chatBridge?.deleteLastExchange?.(),   []);
  const resendText           = useCallback(t   => window.chatBridge?.resendText?.(t),          []);

  return {
    messages, text, setText,
    micActive, screenOn, idleOn, loopOn, ttsOn,
    isProcessing, attachedImage,
    sendMessage, toggleMic, toggleScreen, toggleIdle, toggleLoop, toggleTts,
    newChat, openAttach, clearAttach, cancelRequest,
    regenerateAssistant, deleteLastAssistant, deleteLastExchange, resendText,
  };
}
