import { useState } from 'react';
import TopBar from './components/TopBar.jsx';
import BotList from './components/BotList.jsx';
import BotEditorView from './components/BotEditorView.jsx';
import TemplatesGallery from './components/TemplatesGallery.jsx';

export default function App() {
  const [view, setView] = useState('bots'); // 'bots' | 'editor' | 'templates'

  return (
    <div className="app">
      <TopBar view={view} onNavigate={setView} />

      {view === 'bots' && <BotList onOpenBot={() => setView('editor')} />}
      {view === 'editor' && <BotEditorView onBack={() => setView('bots')} />}
      {view === 'templates' && <TemplatesGallery onOpenBot={() => setView('editor')} />}
    </div>
  );
}
