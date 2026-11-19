// Цепочки связывают сценарии бота между собой.
//
// Блок «Цепочка» бывает двух видов:
//   mode 'new'  — «Начало»: именованная точка входа (chainId + chainName).
//                 Блоки, подключённые после него, выполняются, когда в любом
//                 сценарии бота кто-то делает переход к этой цепочке.
//   mode 'goto' — «Переход к …»: выбирает одну из таких цепочек по chainId.
//                 Бот переходит в тот сценарий и идёт дальше от её «Начала».
//
// Поиск идёт по всем сценариям бота, поэтому переход работает откуда угодно:
// из «Главной» в «Админку» и обратно.

/** Старые блоки без mode: с flowId — это был «переход», без — пустой новый блок. */
export const chainMode = (data) => data?.mode ?? (data?.flowId ? 'goto' : 'new');

// Сценарий в редакторе хранит { nodes, edges }, в базе — { graph: { nodes, edges } }.
const graphOf = (flow) => ({
  nodes: flow?.nodes ?? flow?.graph?.nodes ?? [],
  edges: flow?.edges ?? flow?.graph?.edges ?? []
});

/** Все цепочки бота: [{ chainId, chainName, flowId, flowName, nodeId }]. */
export function listChains(flows) {
  const chains = [];
  for (const flow of flows ?? []) {
    for (const node of graphOf(flow).nodes) {
      if (node.type !== 'chain' || chainMode(node.data) !== 'new' || !node.data?.chainId) continue;
      chains.push({
        chainId: node.data.chainId,
        chainName: node.data.chainName ?? '',
        flowId: flow.id,
        flowName: flow.name ?? '',
        nodeId: node.id
      });
    }
  }
  return chains;
}

/**
 * Находит «Начало» цепочки и сценарий, в котором оно лежит.
 * Возвращает { graph, nodeId, flowId, chainName } или null, если цепочки нет.
 * flowId — только для блоков из старой версии: тогда берём первое «Начало» в том сценарии.
 */
export function findChainStart(flows, { chainId, flowId } = {}) {
  const chains = listChains(flows);
  const hit = chainId
    ? chains.find((c) => c.chainId === chainId)
    : flowId
      ? chains.find((c) => c.flowId === flowId)
      : null;
  if (!hit) return null;
  const flow = flows.find((f) => f.id === hit.flowId);
  return { graph: graphOf(flow), nodeId: hit.nodeId, flowId: hit.flowId, chainName: hit.chainName };
}
