// Выполнение блока «Модерация». Всё, что касается Telegram, приходит через
// api.moderation (см. netlify/lib/telegramModeration.js и mockApi.js).

import { interpolate } from './flowEngine.js';
import { parseDuration, parseUserId, formatDuration, safeName } from './moderation.js';

// действия, которые наказывают участника: администраторов ими не трогаем
const PUNITIVE = ['warn', 'mute', 'kick', 'ban'];

export async function runModeration(node, context, api) {
  const data = node.data;
  const action = data.action || 'mute';
  const fail = (reason) => {
    context.builtins = { ...context.builtins, mod_result: reason };
    api.log?.(`Модерация: ${reason}`);
    return { next: 'false' };
  };

  const mod = api.moderation;
  if (!mod) return fail('в этом мессенджере блок пока не поддерживается (работает только в Telegram).');

  const chatId = data.chatSource === 'chosen' ? data.targetChatId : context.chatId;
  if (!chatId) return fail('не выбрана группа или канал.');
  const sameChat = String(chatId) === String(context.chatId);

  const target = resolveTarget(data, context);
  if (action !== 'delete' && !target) {
    return fail('не понятно, кого модерировать: ответьте командой на сообщение участника или укажите его ID.');
  }
  if (target) {
    context.builtins = { ...context.builtins, target_id: target.id, target_name: safeName(target.name) };
  }

  // Наказать самого автора сообщения (например, за мат) можно без прав. Всё остальное —
  // действия над другими людьми или снятие наказаний — только по команде администратора,
  // иначе любой участник мог бы банить других или разбанить себя.
  const selfPunishment = (data.target || 'sender') === 'sender' && sameChat && [...PUNITIVE, 'delete'].includes(action);
  if (!selfPunishment && data.requireAdmin !== false) {
    const right = action === 'delete' ? 'can_delete_messages' : 'can_restrict_members';
    const anonymousAdminHere = context.senderIsAnonymousAdmin && sameChat;
    const allowed =
      anonymousAdminHere || (context.sender?.id && (await mod.isAdmin(chatId, context.sender.id, right)));
    if (!allowed) return fail('команда доступна только администраторам с нужными правами.');
  }

  // удаление чужого сообщения идёт в текущем чате — право на это проверяем именно здесь
  const deletes = action === 'delete' || data.deleteMessage;
  if (deletes && data.target === 'reply' && data.requireAdmin !== false) {
    const allowed =
      context.senderIsAnonymousAdmin ||
      (context.sender?.id && (await mod.isAdmin(context.chatId, context.sender.id, 'can_delete_messages')));
    if (!allowed) return fail('удалять чужие сообщения могут только администраторы с этим правом.');
  }

  if (target && PUNITIVE.includes(action) && !target.isChat && (await mod.isAdmin(chatId, target.id))) {
    return fail('нельзя наказать администратора чата.');
  }

  const messageId =
    data.target === 'reply' ? context.replyTo?.messageId : data.target === 'manual' ? null : context.incomingMessageId;

  if (deletes) {
    const deleted = messageId ? await mod.deleteMessage(context.chatId, messageId) : { ok: false, error: 'нет сообщения' };
    if (action === 'delete') {
      if (!deleted.ok) return fail(`не удалось удалить сообщение (${deleted.error}).`);
      context.builtins = { ...context.builtins, mod_result: 'сообщение удалено' };
      return { next: 'true' };
    }
    if (!deleted.ok) api.log?.(`Модерация: сообщение не удалено (${deleted.error}).`);
  }

  const fromCommand = data.durationFromCommand !== false ? parseDuration(context.builtins?.command_args) : null;
  const minutes = fromCommand ?? parseDuration(interpolate(String(data.duration ?? ''), context)) ?? 0;

  if (action === 'warn') {
    const limit = Math.max(1, Number(data.warnLimit) || 3);
    const count = await mod.addWarn(chatId, target.id);
    if (count == null) return fail('не удалось сохранить предупреждение — выполните supabase/schema.sql заново.');
    context.builtins = { ...context.builtins, warn_count: count, warn_limit: limit, mod_result: `предупреждение ${count} из ${limit}` };
    if (count < limit) return { next: 'true' };

    const limitAction = data.limitAction || 'mute';
    const res = await apply(mod, limitAction, chatId, target, minutes);
    if (!res.ok) return fail(res.error);
    await mod.resetWarns(chatId, target.id);
    context.builtins.mod_result += `, ${describe(limitAction, minutes)}`;
    return { next: 'true' };
  }

  const res = await apply(mod, action, chatId, target, minutes);
  if (!res.ok) return fail(res.error);
  context.builtins = { ...context.builtins, mod_result: describe(action, minutes) };
  return { next: 'true' };
}

async function apply(mod, action, chatId, target, minutes) {
  // «пишет от имени канала»: Telegram умеет только блокировать и разблокировать такой канал
  if (target.isChat && !['ban', 'unban', 'kick', 'resetWarns'].includes(action)) {
    return { ok: false, error: 'сообщение отправлено от имени канала — его можно только забанить.' };
  }
  const until = minutes ? Math.floor(Date.now() / 1000) + Math.max(minutes, 1) * 60 : 0;
  if (action === 'mute') return mod.mute(chatId, target.id, until);
  if (action === 'unmute') return mod.unmute(chatId, target.id);
  if (action === 'ban') return mod.ban(chatId, target.id, until, target.isChat);
  if (action === 'unban') return mod.unban(chatId, target.id, target.isChat);
  if (action === 'kick') return mod.kick(chatId, target.id, target.isChat);
  if (action === 'resetWarns') {
    const ok = await mod.resetWarns(chatId, target.id);
    return ok ? { ok } : { ok, error: 'не удалось снять предупреждения.' };
  }
  return { ok: false, error: `неизвестное действие: ${action}` };
}

function describe(action, minutes) {
  return {
    mute: `мут ${formatDuration(minutes)}`,
    unmute: 'мут снят',
    ban: `бан ${formatDuration(minutes)}`,
    unban: 'бан снят',
    kick: 'удалён из чата',
    resetWarns: 'предупреждения сняты'
  }[action];
}

function resolveTarget(data, context) {
  if (data.target === 'manual') {
    const id = interpolate(String(data.targetManual ?? ''), context).trim();
    return /^-?\d+$/.test(id) ? { id, name: id, isChat: id.startsWith('-') } : null;
  }
  if (data.target === 'reply') {
    if (context.replyTo?.sender) return context.replyTo.sender;
    const id = parseUserId(context.builtins?.command_args);
    return id ? { id, name: id } : null;
  }
  return context.sender ?? null;
}
