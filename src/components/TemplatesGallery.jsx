import { useState } from 'react';
import { useTemplateStore } from '../store/useTemplateStore.js';
import { useBotStore } from '../store/useBotStore.js';
import { useAuthStore } from '../store/useAuthStore.js';
import NewBotWizard from './NewBotWizard.jsx';
import TemplatePreview from './TemplatePreview.jsx';

// Пользователи шаблоны только используют. Создают и правят их админы — в «Админке».
export default function TemplatesGallery({ onOpenBot, onOpenAdmin }) {
  const templates = useTemplateStore((s) => s.templates);
  const isAdmin = useAuthStore((s) => Boolean(s.profile?.is_admin));
  const setActiveBot = useBotStore((s) => s.setActiveBot);

  const [preset, setPreset] = useState(null); // шаблон, для которого открыт мастер нового бота
  const [preview, setPreview] = useState(null); // шаблон в предпросмотре

  return (
    <div className="page">
      <div className="page__header">
        <div>
          <h1 className="page__title">Шаблоны</h1>
          <p className="page__subtitle">Готовые сценарии — используйте как основу для нового бота.</p>
        </div>
        {isAdmin && (
          <button className="btn" onClick={onOpenAdmin}>
            Управление шаблонами → Админка
          </button>
        )}
      </div>

      <div className="templates-grid">
        {templates.map((tpl) => (
          <div className="template-card" key={tpl.id}>
            <div className="template-card__name">{tpl.name}</div>
            <div className="template-card__desc">{tpl.description}</div>
            <div className="template-card__meta">{tpl.nodes.length} блоков</div>
            <div className="template-card__actions">
              <button className="btn btn--sm" onClick={() => setPreview(tpl)}>
                Посмотреть
              </button>
              <button className="btn btn--primary btn--sm" onClick={() => setPreview(tpl)}>
                Использовать
              </button>
            </div>
          </div>
        ))}
        {templates.length === 0 && <p style={{ color: 'var(--text-faint)', fontSize: 13 }}>Шаблонов пока нет.</p>}
      </div>

      {preview && !preset && (
        <TemplatePreview
          tpl={preview}
          onClose={() => setPreview(null)}
          onCreateNew={() => setPreset(preview)}
          onAdded={(id) => {
            setPreview(null);
            setActiveBot(id);
            onOpenBot();
          }}
        />
      )}

      {preset && (
        <NewBotWizard
          preset={preset}
          onClose={() => setPreset(null)}
          onDone={(id) => {
            setPreset(null);
            setPreview(null);
            setActiveBot(id);
            onOpenBot();
          }}
        />
      )}
    </div>
  );
}
