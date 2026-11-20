import Icon from './Icon.jsx';
import { useEffect, useRef, useState } from 'react';
import FlowCanvas from './FlowCanvas.jsx';
import VariablesModal from './VariablesModal.jsx';
import TagsModal from './TagsModal.jsx';
import ConfirmModal from './ConfirmModal.jsx';
import { listChains, chainMode } from '../engine/chains.js';
import { useBotStore } from '../store/useBotStore.js';

export default function BotEditorView({ onBack }) {
  const bot = useBotStore((s) => s.getActiveBot());
  const flow = useBotStore((s) => s.getActiveFlow());
  const renameFlow = useBotStore((s) => s.renameFlow);
  const deleteFlow = useBotStore((s) => s.deleteFlow);
  const [modal, setModal] = useState(null); // null | 'variables' | 'tags'
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  // сколько блоков «Переход к …» в других сценариях ведут в цепочки этого сценария
  const incomingLinks = (() => {
    if (!flow) return 0;
    const mine = new Set(listChains([flow]).map((c) => c.chainId));
    if (mine.size === 0) return 0;
    let n = 0;
    for (const f of bot?.flows ?? []) {
      if (f.id === flow.id) continue;
      for (const node of f.nodes ?? []) {
        if (node.type === 'chain' && chainMode(node.data) === 'goto' && mine.has(node.data?.chainId)) n += 1;
      }
    }
    return n;
  })();

  const removeFlow = async () => {
    if (!flow || flow.isMain) return;
    setDeleting(true);
    const ok = await deleteFlow(bot.id, flow.id);
    setDeleting(false);
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
                  <button className="usermenu__item usermenu__item--danger" role="menuitem" onClick={() => {
                      setMenuOpen(false);
                      setConfirmDelete(true);
                    }}>
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

      {confirmDelete && (
        <ConfirmModal
          danger
          title={`Удалить сценарий «${flow.name}»?`}
          confirmLabel="Удалить"
          busy={deleting}
          onConfirm={removeFlow}
          onClose={() => !deleting && setConfirmDelete(false)}
        >
          <p>
            Сценарий и все его блоки ({flow.nodes.length}) будут удалены навсегда. Это действие нельзя отменить.
          </p>
          {incomingLinks > 0 && (
            <p className="confirm__warn">
              <Icon name="triangle-exclamation" gap />
              Блоков «Переход к …» из других сценариев, которые ведут сюда: {incomingLinks}. Они перестанут работать.
            </p>
          )}
        </ConfirmModal>
      )}
      {modal === 'variables' && <VariablesModal bot={bot} onClose={() => setModal(null)} />}
      {modal === 'tags' && <TagsModal bot={bot} onClose={() => setModal(null)} />}
    </div>
  );
}
