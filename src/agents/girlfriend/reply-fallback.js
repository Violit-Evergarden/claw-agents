'use strict';

const memoryStore = require('../../core/memory-store');

const DOM_KEYWORDS = ['跪下', '跪', '不许', '别动', '听话', '乖', '命令', '控制', '支配', '拒绝', '反抗', '惩罚'];
const AFF_KEYWORDS = ['喜欢', '爱', '想你', '想要', '亲', '抱', '宝', '乖', '乖乖'];

function buildImageFallbackReply(charId, userMessage) {
  const recentMessages = memoryStore.getMessages(charId).slice(-10);
  const recentText = recentMessages.map(m => m.content || '').join('\n');

  const domHits = DOM_KEYWORDS.reduce((acc, k) => acc + (recentText.includes(k) ? 1 : 0), 0);
  const affHits = AFF_KEYWORDS.reduce((acc, k) => acc + (recentText.includes(k) ? 1 : 0), 0);

  const msg = userMessage || '';
  const wantsLeg = msg.includes('腿');
  const wantsChest = msg.includes('胸');
  const wantsFace = msg.includes('脸') || msg.includes('自拍') || msg.includes('颜值');

  if (domHits >= 2 && domHits >= affHits) {
    return '照片我已经发给你了。现在别走神，回我一句：你要我更强势一点，还是更克制一点？';
  }
  if (affHits >= 2 && affHits > domHits) {
    return '照片发过去了。看完告诉我：你喜欢我用这种氛围对你说话吗？';
  }
  if (wantsLeg) return '腿照我已经发给你了。喜欢这份线条感吗？';
  if (wantsChest) return '胸部近景我已经发给你了。你觉得这种质感怎么样？';
  if (wantsFace) return '自拍/脸照我已经发给你了。看着我现在的表情，你心里什么感觉？';
  return '照片我已经发给你了。喜欢的话回我一声，好吗？';
}

module.exports = { buildImageFallbackReply };
