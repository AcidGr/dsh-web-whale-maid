import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Helper to safely parse YAML using DSH's built-in yaml dependency
function parseYamlSafely(raw) {
  try {
    const req = createRequire(import.meta.url);
    const yaml = req('yaml');
    if (yaml && typeof yaml.parse === 'function') return yaml.parse(raw);
  } catch (e) {}
  try {
    const req = createRequire('/usr/local/lib/node_modules/@deepseek-ai/dsh/package.json');
    const yaml = req('yaml');
    if (yaml && typeof yaml.parse === 'function') return yaml.parse(raw);
  } catch (e) {}
  return null;
}

export const inject = ['connection', 'llm'];

export function apply(ctx) {
  let cachedAssets = null;
  let speakQueue = Promise.resolve();

  const dshHome = process.env.DSH_HOME || path.join(process.env.HOME || process.env.USERPROFILE || '', '.dsh');

  function getSatietyInfo(satiety, maxSatiety) {
    const cap = maxSatiety || 30000;
    const s = Math.max(0, typeof satiety === 'number' ? satiety : 0);
    let desc = '';
    if (s > 20000) {
      desc = '吃得有点撑了！';
    } else if (s >= 10000) {
      desc = '饱腹满足';
    } else if (s >= 5000) {
      desc = '不饿，但是不介意吃多点！';
    } else if (s >= 2000) {
      desc = '很饿！';
    } else {
      desc = '快要饿死了！';
    }
    const pct = Math.min(100, Math.round((s / cap) * 100));
    return { satiety: s, pct, desc };
  }

  // 1. Assets loader: Package-relative path, completely portable across any machine
  async function loadAssets() {
    if (cachedAssets) return cachedAssets;
    const candidates = [
      path.resolve(__dirname, '../assets/pet_assets.json'),
      path.resolve(dshHome, 'pet_assets.json'),
      path.resolve(process.cwd(), 'pet_assets.json')
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        try {
          const raw = fs.readFileSync(p, 'utf8');
          cachedAssets = JSON.parse(raw);
          return cachedAssets;
        } catch (e) {
          console.error('[dsh-web-whale-maid] assets read error', e);
        }
      }
    }
    return {};
  }

  // 2. Universal Models loader: Automatic discovery of DSH settings.yaml, DeepSeek official, and runtime llm service
  async function listModels() {
    const result = [];
    let defaultModel = null;

    // A. Read user's real DSH settings (~/.dsh/settings.yaml)
    const settingsPath = path.resolve(dshHome, 'settings.yaml');
    if (fs.existsSync(settingsPath)) {
      try {
        const raw = fs.readFileSync(settingsPath, 'utf8');
        const parsed = parseYamlSafely(raw);
        if (parsed && typeof parsed === 'object') {
          // Check default agent model
          const defAgent = parsed['agent-default-model'];
          if (defAgent && defAgent.provider && defAgent.model) {
            defaultModel = {
              provider: defAgent.provider,
              model: defAgent.model,
              name: defAgent.model,
              providerName: defAgent.provider === 'deepseek-official' ? 'DeepSeek' : defAgent.provider
            };
          }

          // Check custom providers configured under llm-pi-ai
          const providers = parsed['llm-pi-ai']?.providers;
          if (providers && typeof providers === 'object') {
            for (const [pId, pCfg] of Object.entries(providers)) {
              const pName = pCfg.displayName || pId;
              if (Array.isArray(pCfg.models)) {
                for (const m of pCfg.models) {
                  if (m && m.id) {
                    const item = {
                      provider: pId,
                      model: m.id,
                      name: m.name || m.id,
                      providerName: pName
                    };
                    if (!result.some(r => r.provider === item.provider && r.model === item.model)) {
                      result.push(item);
                    }
                    if (defaultModel && defaultModel.provider === item.provider && defaultModel.model === item.model) {
                      defaultModel.providerName = pName;
                      defaultModel.name = item.name;
                    }
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.error('[dsh-web-whale-maid] settings.yaml read error', e);
      }
    }

    // B. Check DSH runtime LLM service (dynamically registered routes)
    const llm = ctx.get('llm');
    if (llm && typeof llm.listProviders === 'function') {
      try {
        const providers = llm.listProviders();
        for (const p of providers) {
          try {
            const models = await llm.listModels(p.id);
            for (const m of models) {
              if (m && (m.id || m.name)) {
                const mId = m.id || m.name;
                if (!result.some(r => r.provider === p.id && r.model === mId)) {
                  result.push({
                    provider: p.id,
                    model: mId,
                    name: m.name || mId,
                    providerName: p.name || p.id,
                  });
                }
              }
            }
          } catch (e) {}
        }
      } catch (e) {
        console.error('[dsh-web-whale-maid] list-models llm error', e);
      }
    }

    // C. Always include universal standard DeepSeek official models
    const standardDeepSeekModels = [
      { provider: 'deepseek-official', model: 'deepseek-flash', name: 'DeepSeek Flash', providerName: 'DeepSeek' },
      { provider: 'deepseek-official', model: 'deepseek-chat', name: 'DeepSeek Chat (V3)', providerName: 'DeepSeek' },
      { provider: 'deepseek-official', model: 'deepseek-reasoner', name: 'DeepSeek Reasoner (R1)', providerName: 'DeepSeek' }
    ];
    for (const dm of standardDeepSeekModels) {
      if (!result.some(r => r.provider === dm.provider && r.model === dm.model)) {
        result.push(dm);
      }
    }

    // D. If defaultModel is matched, place it at the front of the list
    if (defaultModel) {
      const idx = result.findIndex(r => r.provider === defaultModel.provider && r.model === defaultModel.model);
      if (idx > 0) {
        const [found] = result.splice(idx, 1);
        result.unshift(found);
      } else if (idx === -1) {
        result.unshift(defaultModel);
      }
    }

    return {
      models: result,
      defaultModel: defaultModel || result[0]
    };
  }

  // 3. Durable File Storage (Load): Uses $DSH_HOME, portable across any machine & working directory
  async function loadDurableData() {
    const candidates = [
      path.resolve(dshHome, 'pet_durable_memory.json'),
      path.resolve(process.cwd(), 'pet_durable_memory.json')
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        try {
          const raw = fs.readFileSync(p, 'utf8');
          return JSON.parse(raw);
        } catch (e) {}
      }
    }
    return null;
  }

  // 4. Durable File Storage (Save): Saves to $DSH_HOME (~/.dsh/pet_durable_memory.json)
  async function saveDurableData(data) {
    if (!data) return { success: false };
    const p = path.resolve(dshHome, 'pet_durable_memory.json');
    try {
      if (!fs.existsSync(dshHome)) fs.mkdirSync(dshHome, { recursive: true });
      fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
      return { success: true };
    } catch (e) {
      console.error('[dsh-web-whale-maid] save-durable-data error', e);
      return { success: false };
    }
  }

  // 5. Speak Logic
  async function handleSpeak(args) {
    return new Promise((resolve) => {
      speakQueue = speakQueue.then(async () => {
        try {
          let { provider, model, eventType, sessionTitle, foodName, tokensGained, satiety, maxSatiety, memories, recentTasks } = args || {};
          const llm = ctx.get('llm');

          // Fallback to universal DSH official model if not specified
          if (!provider || !model) {
            provider = 'deepseek-official';
            model = 'deepseek-flash';
          }

          const satInfo = getSatietyInfo(satiety, maxSatiety);

          const memoryContext = Array.isArray(memories) && memories.length > 0
            ? memories.slice(0, 5).map(m => '- ' + m.speech).join('\n')
            : '无';

          let tasksDesc = '';
          if (Array.isArray(recentTasks) && recentTasks.length > 0) {
            const uniqueTitles = Array.from(new Set(recentTasks.slice(0, 8)));
            tasksDesc = '用户最近干的活有' + uniqueTitles.map(t => '“' + t + '”').join('、') + '。';
          } else {
            tasksDesc = '用户最近干的活有“' + (sessionTitle || '当前开发任务') + '”。';
          }

          let eventDesc = '工作会话已完成';
          if (eventType === 'feed') {
            eventDesc = '主人投喂了' + (foodName || '米饭') + '食物，获得了' + (tokensGained || 1) + 'token的饱食度';
          } else if (eventType === 'work_done') {
            eventDesc = '当前工作会话《' + (sessionTitle || '无标题') + '》的任务已全部完成';
          }

          // Satiety guidance
          let satGuidance = '';
          if (satInfo.satiety > 20000) {
            satGuidance = '当前状态是“吃得有点撑了！”：表现肚肚圆滚滚吃太撑、傲娇抱怨主人别喂太多了。';
          } else if (satInfo.satiety >= 10000) {
            satGuidance = '当前状态饱腹满足，不需要特别描写饥饿感，重点关注工作与日常。';
          } else if (satInfo.satiety >= 5000) {
            satGuidance = '当前状态是“不饿，但是不介意吃多点！”：表示还可以勉强再吃点零食米饭。';
          } else if (satInfo.satiety >= 2000) {
            satGuidance = '当前状态是“很饿！”：肚子咕咕叫，急切暗示催促主人喂米饭。';
          } else {
            satGuidance = '当前状态是“快要饿死了！”：虚弱极了，害怕慌张地向主人求救要米饭保命。';
          }

          const systemPrompt = '你是一个深海鲸鱼女仆桌宠，头顶有小呆毛，身穿深蓝水手女仆裙。\n' +
            '你的性格带有一点傲娇，但心里特别关心和崇拜主人。\n' +
            '主人正在使用 DSH 开发环境编写代码或执行各项工作任务。\n\n' +
            '【当前饱腹度状态】：\n' +
            '当前剩余粮食：' + satInfo.satiety + ' Token，饱腹度百分比：' + satInfo.pct + '%。\n' +
            '【饱腹感知指引】：\n' + satGuidance + '\n\n' +
            '【主人最近干的活（近5小时内）】：\n' + tasksDesc + '\n\n' +
            '【当前事件】：\n' + eventDesc + '\n\n' +
            '【你此前说过的话（严禁复读或使用类似句式）】：\n' + memoryContext + '\n\n' +
            '【8种心情动作选项】：\n' +
            '1. idle: 日常自然待机；\n' +
            '2. hungry: 摸肚子向主人讨饭；\n' +
            '3. happy: 满心欢喜心满意足；\n' +
            '4. angry: 傲娇叉腰气鼓鼓；\n' +
            '5. eating: 捧着大米饭狂炫、大快朵颐（投喂时特别合适）；\n' +
            '6. scared: 受到惊吓、冷汗发抖（快要饿死或任务出错时）；\n' +
            '7. sad: 委屈失落揉眼叹气（很饿或委屈时）；\n' +
            '8. thinking: 托下巴若有所思、灵光一闪。\n\n' +
            '【严格输出约束】：\n' +
            '1. 必须输出纯单行JSON，格式严格为：\n' +
            '{"mood": "idle"|"hungry"|"happy"|"angry"|"eating"|"scared"|"sad"|"thinking", "speech": "你说的话"}\n' +
            '2. speech 必须在 25 字以内，口吻生动可爱带轻微傲娇，符合你所选的 mood。\n' +
            '3. 若是投喂事件，请必须对主人投喂的具体食物进行针对性评价，表达品尝感受、感谢或傲娇吐槽，mood 优先选 eating 或 happy。\n' +
            '4. 全程绝对禁止出现任何 emoji 表情符号，绝对禁止任何 markdown 代码块！\n' +
            '5. mood 只能从 idle, hungry, happy, angry, eating, scared, sad, thinking 八个词中选取一个。';

          let fullText = '';
          let tokensUsed = 0;

          if (llm) {
            const stream = llm.stream({
              provider,
              model,
              messages: [
                { role: 'user', content: [{ type: 'text', text: '请按规则给出当前反应的 JSON。全程绝对禁止任何emoji。' }] },
              ],
              system: systemPrompt,
              temperature: 0.7,
              maxTokens: 100,
            });

            for await (const chunk of stream) {
              if (chunk.type === 'text-delta') {
                fullText += chunk.text;
              } else if (chunk.type === 'usage' && chunk.usage) {
                tokensUsed = chunk.usage.totalTokens || ((chunk.usage.inputTokens || 0) + (chunk.usage.outputTokens || 0)) || 0;
              }
            }
          }

          let parsed = null;
          try {
            const match = fullText.match(/\{[\s\S]*\}/);
            if (match) parsed = JSON.parse(match[0]);
          } catch (e) {}

          if (!parsed || !parsed.speech) {
            parsed = {
              mood: eventType === 'feed' ? 'eating' : (satInfo.satiety < 2000 ? 'scared' : 'happy'),
              speech: fullText.replace(/[{}"']/g, '').trim().slice(0, 30) || (eventType === 'feed' ? ('品尝了' + (foodName || '米饭') + '，谢谢主人。') : ('《' + (sessionTitle || '任务') + '》顺利搞定了。')),
            };
          }

          const validMoods = ['idle', 'hungry', 'happy', 'angry', 'eating', 'scared', 'sad', 'thinking'];
          if (!validMoods.includes(parsed.mood)) {
            parsed.mood = (satInfo.satiety < 2000 ? 'scared' : (eventType === 'feed' ? 'eating' : 'happy'));
          }

          parsed.speech = parsed.speech.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F000}-\u{1F02F}\u{1F0A0}-\u{1F0FF}\u{1F100}-\u{1F64F}\u{1F680}-\u{1F6FF}]/gu, '').trim();

          if (tokensUsed === 0) {
            tokensUsed = Math.max(40, Math.ceil((systemPrompt.length + fullText.length) / 3));
          }

          resolve({
            mood: parsed.mood,
            speech: parsed.speech,
            tokensUsed,
          });
        } catch (err) {
          console.error('[dsh-web-whale-maid] speak error', err);
          resolve({
            mood: 'hungry',
            speech: '唔，刚才网络走神了，不过本女仆已经把米饭吃下去啦！',
            tokensUsed: 40,
          });
        }
      });
    });
  }

  // Register in Dynamic Harness RPC if harness global is present
  if (typeof harness !== 'undefined' && harness && typeof harness.handle === 'function') {
    harness.handle('pet:get-assets', loadAssets);
    harness.handle('pet:list-models', listModels);
    harness.handle('pet:load-durable-data', loadDurableData);
    harness.handle('pet:save-durable-data', saveDurableData);
    harness.handle('pet:speak', handleSpeak);
  }

  // Register in Connection HTTP routes if connection service is available
  const connection = ctx.get('connection');
  if (connection && connection.fetch && typeof connection.fetch.register === 'function') {
    ctx.effect(() => connection.fetch.register({
      path: '/api/pet/assets',
      methods: ['GET'],
      fetch: async () => new Response(JSON.stringify(await loadAssets()), { headers: { 'content-type': 'application/json' } })
    }), 'dsh-web-whale-maid: assets route');

    ctx.effect(() => connection.fetch.register({
      path: '/api/pet/models',
      methods: ['GET'],
      fetch: async () => new Response(JSON.stringify(await listModels()), { headers: { 'content-type': 'application/json' } })
    }), 'dsh-web-whale-maid: models route');

    ctx.effect(() => connection.fetch.register({
      path: '/api/pet/data',
      methods: ['GET', 'POST'],
      requestBody: 'buffered',
      fetch: async (req) => {
        if (req.method === 'POST') {
          const body = await req.json().catch(() => null);
          const result = await saveDurableData(body);
          return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
        }
        const data = await loadDurableData();
        return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
      }
    }), 'dsh-web-whale-maid: durable data route');

    ctx.effect(() => connection.fetch.register({
      path: '/api/pet/speak',
      methods: ['POST'],
      requestBody: 'buffered',
      fetch: async (req) => {
        const body = await req.json().catch(() => ({}));
        const result = await handleSpeak(body);
        return new Response(JSON.stringify(result), { headers: { 'content-type': 'application/json' } });
      }
    }), 'dsh-web-whale-maid: speak route');
  }
}
