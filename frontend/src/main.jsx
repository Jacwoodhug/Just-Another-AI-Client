import React from 'react';
import { createRoot } from 'react-dom/client';
import CodeWorkspace from './components/CodeWorkspace/index.jsx';
import ChatWorkspace from './components/ChatWorkspace/index.jsx';

const codeContainer = document.getElementById('codeWorkspace');
if (codeContainer) {
  createRoot(codeContainer).render(<CodeWorkspace />);
}

const chatContainer = document.getElementById('chatWorkspace');
if (chatContainer) {
  window.__chatReactActive = true;
  createRoot(chatContainer).render(<ChatWorkspace />);
}
