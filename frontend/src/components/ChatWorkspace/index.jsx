import { useChatWorkspace } from '../../hooks/useChatWorkspace.js';
import ChatLog from './ChatLog.jsx';
import ChatComposer from '../shared/ChatComposer.jsx';
import './ChatWorkspace.css';

export default function ChatWorkspace() {
  const ws = useChatWorkspace();

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    const t = ws.text.trim();
    if (!t && !ws.attachedImage) return;
    ws.setText('');
    ws.sendMessage(t);
  }

  return (
    <>
      <ChatLog
        messages={ws.messages}
        micActive={ws.micActive}
        onRegenerate={ws.regenerateAssistant}
        onDeleteAssistant={ws.deleteLastAssistant}
        onDeleteExchange={ws.deleteLastExchange}
        onResendText={ws.resendText}
      />
      <ChatComposer
        text={ws.text}
        onTextChange={ws.setText}
        onSend={handleSend}
        onKeyDown={handleKeyDown}
        micActive={ws.micActive}
        onMicToggle={ws.toggleMic}
        onAttach={ws.openAttach}
        attachedImage={ws.attachedImage}
        onClearAttach={ws.clearAttach}
        screenOn={ws.screenOn}
        onScreenToggle={ws.toggleScreen}
        idleOn={ws.idleOn}
        onIdleToggle={ws.toggleIdle}
        loopOn={ws.loopOn}
        onLoopToggle={ws.toggleLoop}
        ttsOn={ws.ttsOn}
        onTtsToggle={ws.toggleTts}
        onNewChat={ws.newChat}
        isProcessing={ws.isProcessing}
        onCancel={ws.cancelRequest}
      />
    </>
  );
}
