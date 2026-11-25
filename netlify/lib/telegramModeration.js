// Модерация через Telegram Bot API. Боту нужны права администратора в чате
// («Блокировка участников», «Удаление сообщений»); мут работает только в супергруппах.

const SEND_PERMISSIONS = [
  'can_send_messages',
  'can_send_audios',
  'can_send_documents',
  'can_send_photos',
  'can_send_videos',
  'can_send_video_notes',
  'can_send_voice_notes',
  'can_send_polls',
  'can_send_other_messages',
  'can_add_web_page_previews'
];

const permissions = (value) => Object.fromEntries(SEND_PERMISSIONS.map((p) => [p, value]));

/**
 * @param {(method: string, payload: object) => Promise<any>} tg — вызов Bot API
 * @param {object} supabase — клиент с service role (счётчик предупреждений)
 */
export function buildTelegramModeration({ tg, supabase, botId }) {
  const call = async (method, payload) => {
    const res = await tg(method, payload);
    if (res?.ok) return { ok: true, result: res.result };
    const error = res?.description || 'Telegram не ответил';
    console.error(`${method} failed:`, error);
    return { ok: false, error: `Telegram отклонил действие: ${error}` };
  };

  const members = new Map(); // кэш на один апдейт

  return {
    // right — конкретное право администратора; без него подходит любой администратор
    async isAdmin(chatId, userId, right) {
      const key = `${chatId}:${userId}`;
      if (!members.has(key)) members.set(key, await call('getChatMember', { chat_id: chatId, user_id: Number(userId) }));
      const member = members.get(key).result;
      if (member?.status === 'creator') return true;
      return member?.status === 'administrator' && (!right || member[right] === true);
    },

    deleteMessage: (chatId, messageId) => call('deleteMessage', { chat_id: chatId, message_id: messageId }),

    mute: (chatId, userId, until) =>
      call('restrictChatMember', {
        chat_id: chatId,
        user_id: Number(userId),
        permissions: permissions(false),
        use_independent_chat_permissions: true,
        until_date: until || undefined
      }),

    // возвращаем участнику обычные права этого чата, а не «все подряд»
    async unmute(chatId, userId) {
      const chat = await call('getChat', { chat_id: chatId });
      return call('restrictChatMember', {
        chat_id: chatId,
        user_id: Number(userId),
        permissions: chat.result?.permissions ?? permissions(true),
        use_independent_chat_permissions: true
      });
    },

    ban: (chatId, userId, until, isChat) =>
      isChat
        ? call('banChatSenderChat', { chat_id: chatId, sender_chat_id: Number(userId) })
        : call('banChatMember', { chat_id: chatId, user_id: Number(userId), until_date: until || undefined }),

    // only_if_banned: без него «разбан» выгнал бы обычного участника
    unban: (chatId, userId, isChat) =>
      isChat
        ? call('unbanChatSenderChat', { chat_id: chatId, sender_chat_id: Number(userId) })
        : call('unbanChatMember', { chat_id: chatId, user_id: Number(userId), only_if_banned: true }),

    // «выгнать» = забанить и сразу разбанить: человек может вернуться по ссылке
    async kick(chatId, userId, isChat) {
      if (isChat) return { ok: false, error: 'канал-отправителя нельзя «выгнать» — используйте бан.' };
      const banned = await this.ban(chatId, userId);
      if (!banned.ok) return banned;
      return call('unbanChatMember', { chat_id: chatId, user_id: Number(userId), only_if_banned: true });
    },

    async addWarn(chatId, userId) {
      const { data, error } = await supabase.rpc('add_moderation_warn', {
        p_bot_id: botId,
        p_chat_id: String(chatId),
        p_user_id: String(userId)
      });
      if (error) {
        console.error('add_moderation_warn failed:', error.message);
        return null;
      }
      return data;
    },

    async resetWarns(chatId, userId) {
      const { error } = await supabase
        .from('moderation_warns')
        .delete()
        .eq('bot_id', botId)
        .eq('chat_id', String(chatId))
        .eq('user_id', String(userId));
      if (error) console.error('reset warns failed:', error.message);
      return !error;
    }
  };
}
