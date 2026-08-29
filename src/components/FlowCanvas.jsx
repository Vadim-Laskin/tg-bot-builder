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
import BlockPalette from './BlockPalette.jsx';
import PropertiesPanel from './PropertiesPanel.jsx';
import TestPanel from './TestPanel.jsx';
import { BLOCK_DEFS } from '../engine/blockDefs.js';
import { useBotStore } from '../store/useBotStore.js';

const nodeTypes = Object.fromEntries(Object.keys(BLOCK_DEFS).map((t) => [t, BlockNode]));

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
  const wrapRef = useRef(null);
  const { screenToFlowPosition } = useReactFlow();

  // switching flows (main <-> chain) should reload the canvas contents
  useEffect(() => {
    setNodes(flow.nodes);
    setEdges(flow.edges);
    setSelectedId(null);
  }, [flow.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // autosave, debounced on any graph change
  useEffect(() => {
    const t = setTimeout(() => updateFlowGraph(bot.id, flow.id, { nodes, edges }), 250);
    return () => clearTimeout(t);
  }, [nodes, edges, bot.id, flow.id, updateFlowGraph]);

  const onConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges]
  );

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      const blockType = e.dataTransfer.getData('application/flowbase-block');
      const def = BLOCK_DEFS[blockType];
      if (!def) return;
      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const newNode = {
        id: nanoid(8),
        type: blockType,
        position,
        data: structuredClone(def.defaultData)
      };
      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, setNodes]
  );

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedId) ?? null, [nodes, selectedId]);

  const otherFlows = useMemo(
    () => bot.flows.filter((f) => f.id !== flow.id).map((f) => ({ id: f.id, name: f.name })),
    [bot.flows, flow.id]
  );

  return (
    <div className="editor-layout">
      <BlockPalette />

      <div className="canvas-wrap" ref={wrapRef}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onNodeClick={(_, n) => setSelectedId(n.id)}
          onPaneClick={() => setSelectedId(null)}
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
        onChange={(data) => setNodes((nds) => nds.map((n) => (n.id === selectedId ? { ...n, data } : n)))}
        onDelete={() => {
          setNodes((nds) => nds.filter((n) => n.id !== selectedId));
          setEdges((eds) => eds.filter((e) => e.source !== selectedId && e.target !== selectedId));
          setSelectedId(null);
        }}
      />
    </div>
  );
}
