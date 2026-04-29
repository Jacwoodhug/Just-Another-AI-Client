import React from 'react';
import { createRoot } from 'react-dom/client';
import CodeWorkspace from './components/CodeWorkspace/index.jsx';

const container = document.getElementById('codeWorkspace');
if (container) {
  createRoot(container).render(<CodeWorkspace />);
}
