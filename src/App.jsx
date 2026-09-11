import { useState } from 'react';
import AuthGate from './components/AuthGate.jsx';
import TopBar from './components/TopBar.jsx';
import BotList from './components/BotList.jsx';
import FlowListView from './components/FlowListView.jsx';
import BotEditorView from './components/BotEditorView.jsx';
import TemplatesGallery from './components/TemplatesGallery.jsx';

export default function App() {
  const [view, setView] = useState('bots'); // 'bots' | 'flows' | 'editor' | 'templates'

  return (
    <AuthGate>
      <div className="app">
        <TopBar view={view} onNavigate={setView} />

        {view === 'bots' && <BotList onOpenBot={() => setView('flows')} />}
        {view === 'flows' && <FlowListView onOpenFlow={() => setView('editor')} onBack={() => setView('bots')} />}
        {view === 'editor' && <BotEditorView onBack={() => setView('flows')} />}
        {view === 'templates' && <TemplatesGallery onOpenBot={() => setView('editor')} />}
      </div>
    </AuthGate>
  );
}
