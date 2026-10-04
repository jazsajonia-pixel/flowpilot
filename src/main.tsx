/**
 * FlowPilot AI Web Application Entry Point (Phase 0 Scaffold)
 */

import React from 'react';
import ReactDOM from 'react-dom/client';

const App = () => {
  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1>FlowPilot AI</h1>
      <p><strong>Phase 0: Project Constitution & Architecture</strong></p>
      <p>
        FlowPilot AI is a web-based AI-powered workflow automation platform.
        This foundation is established and ready for Phase 1 feature development.
      </p>
    </div>
  );
};

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
