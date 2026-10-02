import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlowProvider,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow
} from 'reactflow';
import 'reactflow/dist/style.css';
import { nanoid } from 'nanoid';
import BlockNode from './nodes/BlockNode.jsx';
import DeletableEdge from './edges/DeletableEdge.jsx';
import AddBlockModal from './AddBlockModal.jsx';
import PropertiesPanel from './PropertiesPanel.jsx';
import { ButtonsContext } from './ButtonsContext.js';
import { normalizeButtonIds } from '../lib/normalizeButtons.js';
import TestPanel from './TestPanel.jsx';
import { BLOCK_DEFS } from '../engine/blockDefs.js';
import { useBotStore } from '../store/useBotStore.js';
import { supabase } from '../lib/supabaseClient.js';

const nodeTypes = Object.fromEntries(Object.keys(BLOCK_DEFS).map((t) => [t, BlockNode]));
// registering our component as the 'default' edge type means it applies to
// every edge — both ones freshly drawn and ones loaded from storage that
// have no `type` field of their own
const edgeTypes = { default: DeletableEdge };

export default function FlowCanvas({ bot, flow }) {
  return (
    <ReactFlowProvider>
      <InnerCanvas bot={bot} flow={flow} />
    </ReactFlowProvider>
  );
}

function InnerCanvas({ bot, flow }) {
  const updateFlowGraph = useBotStore((s) => s.updateFlowGraph);
  const [nodes, setNodes, onNodesChange] = useNodesState(flow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flow.edges);
  const [selectedId, setSelectedId] = useState(null);
  const [showTest, setShowTest] = useState(false);
  const [addBlockOpen, setAddBlockOpen] = useState(false);
  const [editing, setEditing] = useState(null); // { nodeId, buttonId } — открыты настройки кнопки
  const wrapRef = useRef(null);
  const { screenToFlowPosition } = useReactFlow();

  // switching flows (main <-> scenario) should reload the canvas contents
  useEffect(() => {
    // старым кнопкам без id раздаём id (и переносим их стрелки)
    const fixed = normalizeButtonIds(flow.nodes, flow.edges);
    setNodes(fixed.nodes);
    setEdges(fixed.edges);
    setSelectedId(null);
    setEditing(null);
  }, [flow.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // autosave, debounced on any graph change
  useEffect(() => {
    const t = setTimeout(() => updateFlowGraph(bot.id, flow.id, { nodes, edges }), 250);
    return () => clearTimeout(t);
  }, [nodes, edges, bot.id, flow.id, updateFlowGraph]);

  // any single output point (the default handle, or one specific button's
  // handle) can only send to one block — but a block can receive from as
  // many sources as you like. Drawing a new line from an already-used
  // output replaces the old one instead of adding a second.
  const onConnect = useCallback(
    (params) => {
      setEdges((eds) => {
        const withoutConflict = eds.filter(
          (e) => !(e.source === params.source && (e.sourceHandle ?? null) === (params.sourceHandle ?? null))
        );
        return addEdge({ ...params, animated: true }, withoutConflict);
      });
    },
    [setEdges]
  );

  // the sole way to add a block now — no more drag-from-sidebar, since that
  // never worked on touch anyway. Places the new node roughly where the "+"
  // button was tapped, or dead center as a fallback.
  const addBlock = useCallback(
    (blockType) => {
      const def = BLOCK_DEFS[blockType];
      if (!def) return;
      const bounds = wrapRef.current?.getBoundingClientRect();
      const centerScreen = bounds
        ? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
        : { x: 300, y: 300 };
      const position = screenToFlowPosition(centerScreen);
      const newNode = { id: nanoid(8), type: blockType, position, data: structuredClone(def.defaultData) };
      setNodes((nds) => nds.concat(newNode));
      setSelectedId(newNode.id);
      setAddBlockOpen(false);
    },
    [screenToFlowPosition, setNodes]
  );

  // ---------- кнопки блоков: тап, перенос, настройки ----------
  const patchNodeData = useCallback(
    (nodeId, fn) => setNodes((nds) => nds.map((n) => (n.id === nodeId ? { ...n, data: fn(n.data) } : n))),
    [setNodes]
  );

  const changeButtons = useCallback(
    (nodeId, buttons) => patchNodeData(nodeId, (d) => ({ ...d, buttons })),
    [patchNodeData]
  );

  // from: 'canvas' — тап по кнопке на блоке; 'panel' — в боковой панели блока
  const openButton = useCallback((nodeId, buttonId, from = 'canvas') => {
    setSelectedId(nodeId);
    setEditing({ nodeId, buttonId, from });
  }, []);

  const addButton = useCallback(
    (nodeId, from = 'canvas') => {
      const b = { id: nanoid(6), text: 'Кнопка', kind: 'callback', style: '', newRow: true };
      patchNodeData(nodeId, (d) => ({ ...d, buttons: [...(d.buttons ?? []), b] }));
      openButton(nodeId, b.id, from);
    },
    [patchNodeData, openButton]
  );

  const buttonsCtx = useMemo(
    () => ({ editing, openButton, addButton, changeButtons }),
    [editing, openButton, addButton, changeButtons]
  );

  const closeButtonEditor = () => {
    const from = editing?.from;
    setEditing(null);
    // открывали из панели блока — туда и возвращаемся
    if (from === 'panel') return;
    // на телефоне после «Готово» хочется обратно к холсту, а не в полноэкранные свойства блока
    if (window.matchMedia('(max-width: 860px)').matches) setSelectedId(null);
  };

  const editingNode = editing ? nodes.find((n) => n.id === editing.nodeId) : null;
  const editingButton = editingNode?.data.buttons?.find((b) => b.id === editing.buttonId) ?? null;
  const handleOf = (buttonId) => `btn-${buttonId}`;

  const buttonEditorProps = useMemo(() => {
    if (!editingNode || !editingButton) return null;
    const nodeId = editingNode.id;
    const buttonId = editingButton.id;
    const handle = handleOf(buttonId);
    const dropEdges = (eds) => eds.filter((e) => !(e.source === nodeId && e.sourceHandle === handle));
    const connect = (eds, target) => [
      ...dropEdges(eds),
      { id: `e-${nanoid(8)}`, source: nodeId, sourceHandle: handle, target, animated: true }
    ];

    return {
      button: editingButton,
      layout:
        editingNode.type === 'sendToChat' && editingNode.data.targetType === 'group'
          ? 'inline'
          : editingNode.data.buttonsLayout || 'inline',
      blocks: nodes,
      targetId: edges.find((e) => e.source === nodeId && e.sourceHandle === handle)?.target ?? null,
      onPatch: (patch) => {
        changeButtons(
          nodeId,
          editingNode.data.buttons.map((b) => (b.id === buttonId ? { ...b, ...patch } : b))
        );
        // кнопка-ссылка никуда не «переходит» — стрелка ей не нужна
        if (patch.kind === 'url') setEdges(dropEdges);
      },
      onTarget: (target) => setEdges((eds) => (target ? connect(eds, target) : dropEdges(eds))),
      onCreateTarget: () => {
        const def = BLOCK_DEFS.message;
        const idx = editingNode.data.buttons.findIndex((b) => b.id === buttonId);
        const newNode = {
          id: nanoid(8),
          type: 'message',
          position: { x: editingNode.position.x + 380, y: editingNode.position.y + Math.max(idx, 0) * 90 },
          data: structuredClone(def.defaultData)
        };
        setNodes((nds) => nds.concat(newNode));
        setEdges((eds) => connect(eds, newNode.id));
      },
      onDelete: () => {
        changeButtons(
          nodeId,
          editingNode.data.buttons.filter((b) => b.id !== buttonId)
        );
        setEdges(dropEdges);
        closeButtonEditor();
      },
      onClose: closeButtonEditor
    };
  }, [editing, editingNode, editingButton, nodes, edges]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedId) ?? null, [nodes, selectedId]);

  const otherFlows = useMemo(
    () => bot.flows.filter((f) => f.id !== flow.id).map((f) => ({ id: f.id, name: f.name })),
    [bot.flows, flow.id]
  );

  // for the "Отправить в чат" block's group/user pickers — loaded once per
  // bot, not kept live-updated, since picking a stale-by-a-minute chat is
  // harmless here (worst case: the list refreshes next time you open this bot)
  const [knownChats, setKnownChats] = useState([]);
  const [knownUsers, setKnownUsers] = useState([]);
  useEffect(() => {
    supabase
      .from('bot_chats')
      .select('chat_id, title, type')
      .eq('bot_id', bot.id)
      .then(({ data, error }) => {
        if (error) console.error('load bot_chats:', error.message);
        setKnownChats(data ?? []);
      });
    supabase
      .from('chat_state')
      .select('chat_id, display_name, username')
      .eq('bot_id', bot.id)
      .eq('chat_type', 'private')
      .then(({ data, error }) => {
        if (error) console.error('load chat_state users:', error.message);
        setKnownUsers(data ?? []);
      });
  }, [bot.id]);

  return (
    <ButtonsContext.Provider value={buttonsCtx}>
    <div className="editor-layout">
      <div className="canvas-wrap" ref={wrapRef}>
        <button className="btn btn--primary add-block-fab" onClick={() => setAddBlockOpen(true)} title="Добавить блок">
          +
        </button>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={(_, n) => {
            setSelectedId(n.id);
            setEditing((cur) => (cur && cur.nodeId === n.id ? cur : null));
          }}
          onPaneClick={() => {
            setSelectedId(null);
            setEditing(null);
          }}
          fitView
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.4} color="var(--grid-dot)" />
          <Controls showInteractive={false} />
        </ReactFlow>

        {showTest ? (
          <TestPanel graph={{ nodes, edges }} allFlows={bot.flows} onClose={() => setShowTest(false)} />
        ) : (
          <button className="btn btn--primary test-fab" onClick={() => setShowTest(true)}>
            🧪 Тест
          </button>
        )}
      </div>

      <PropertiesPanel
        node={selectedNode}
        otherFlows={otherFlows}
        flowNodes={nodes}
        variableDefs={bot.variableDefs}
        tagDefs={bot.tagDefs}
        knownChats={knownChats}
        knownUsers={knownUsers}
        onChange={(data) => setNodes((nds) => nds.map((n) => (n.id === selectedId ? { ...n, data } : n)))}
        onDelete={() => {
          setNodes((nds) => nds.filter((n) => n.id !== selectedId));
          setEdges((eds) => eds.filter((e) => e.source !== selectedId && e.target !== selectedId));
          setSelectedId(null);
          setEditing(null);
        }}
        onCloseMobile={() => setSelectedId(null)}
        buttonEditor={buttonEditorProps}
      />

      {addBlockOpen && <AddBlockModal onAdd={addBlock} onClose={() => setAddBlockOpen(false)} />}
    </div>
    </ButtonsContext.Provider>
  );
}
