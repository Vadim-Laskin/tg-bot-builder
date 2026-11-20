import Icon from './Icon.jsx';
import { useEffect, useRef, useState } from 'react';
import FlowCanvas from './FlowCanvas.jsx';
import VariablesModal from './VariablesModal.jsx';
import TagsModal from './TagsModal.jsx';
import { useBotStore } from '../store/useBotStore.js';

export default function BotEditorView({ onBack }) {
  const bot = useBotStore((s) => s.getActiveBot());
  const flow = useBotStore((s) => s.getActiveFlow());
  const renameFlow = useBotStore((s) => s.renameFlow);
  const deleteFlow = useBotStore((s) => s.deleteFlow);
  const [modal, setModal] = useState(null); // null | 'variables' | 'tags'
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // закрываем меню по клику снаружи и по Esc
  useEffect(() => {
    if (!menuOpen) return undefined;
    const onDown = (e) => {
      if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
    };
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const openModal = (name) => {
    setMenuOpen(false);
    setModal(name);
  };

  const removeFlow = async () => {
    setMenuOpen(false);
    if (!flow || flow.isMain) return;
    if (!confirm(`Удалить сценарий «${flow.name}» вместе со всеми блоками? Блоки «Цепочка», которые ведут в него, перестанут работать.`)) return;
    const ok = await deleteFlow(bot.id, flow.id);
    if (ok) onBack();
    else alert('Не удалось удалить сценарий. Попробуйте ещё раз.');
  };

  if (!bot || !flow) {
    return (
      <div className="page">
        <p>Сценарий не найден.</p>
        <button className="btn" onClick={onBack}>
          <Icon name="arrow-left" gap />Назад
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <div className="editor-topbar">
        <button className="btn btn--sm" onClick={onBack}>
          <Icon name="arrow-left" />
        </button>
        <span className="editor-topbar__crumb">{bot.name} /</span>
        <span
          className="editor-topbar__name"
          contentEditable
          suppressContentEditableWarning
          onBlur={(e) => renameFlow(bot.id, flow.id, e.currentTarget.textContent)}
        >
          {flow.name}
        </span>

        <div className="editor-topbar__spacer" />

        <div className="editor-menu usermenu" ref={menuRef}>
          <button
            className="btn btn--sm editor-menu__trigger"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Переменные и теги"
            title="Переменные и теги"
          >
            <Icon name="ellipsis" />
          </button>
          {menuOpen && (
            <div className="usermenu__panel editor-menu__panel" role="menu">
              <button className="usermenu__item" role="menuitem" onClick={() => openModal('variables')}>
                <span className="usermenu__icon">
                  <Icon name="hashtag" />
                </span>
                Переменные
              </button>
              <button className="usermenu__item" role="menuitem" onClick={() => openModal('tags')}>
                <span className="usermenu__icon">
                  <Icon name="tag" />
                </span>
                Теги
              </button>
              {!flow.isMain && (
                <>
                  <div className="usermenu__sep" />
                  <button className="usermenu__item usermenu__item--danger" role="menuitem" onClick={removeFlow}>
                    <span className="usermenu__icon">
                      <Icon name="trash" />
                    </span>
                    Удалить сценарий
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <FlowCanvas bot={bot} flow={flow} />

      {modal === 'variables' && <VariablesModal bot={bot} onClose={() => setModal(null)} />}
      {modal === 'tags' && <TagsModal bot={bot} onClose={() => setModal(null)} />}
    </div>
  );
}
