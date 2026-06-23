import { createClient } from '@supabase/supabase-js';

const MAX_ATTACHMENT_BYTES = 3_500_000;
const CATEGORY_RULES = [
  ['tools', ['域名', '服务器', '软件', '订阅', '工具', 'tool', 'tools', 'domain', 'hosting', 'server', 'saas']],
  ['marketing', ['广告', '投放', '海报', '营销', '推广', 'marketing', 'ads', 'poster', 'promo']],
  ['salary', ['工资', '薪水', 'salary', 'payroll']],
  ['client_payment', ['客户', '预付', '定金', '尾款', 'client', 'deposit', 'invoice', 'prepaid', 'prepayment']],
  ['procurement', ['采购', '进货', '供应商', 'purchase', 'supplier']],
  ['travel', ['差旅', '火车', '机票', '酒店', 'travel', 'train', 'flight', 'hotel']],
];

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '8mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!isAuthorized(req)) return res.status(401).json({ error: '共享密码不对，或者 Vercel 没配置 FOUNDER_APP_PASSWORD。' });

  const supabaseUrl = process.env.FOUNDER_SUPABASE_URL;
  const serviceKey = process.env.FOUNDER_SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return res.status(500).json({ error: 'Vercel 缺少 FOUNDER_SUPABASE_URL 或 FOUNDER_SUPABASE_SERVICE_ROLE_KEY。' });

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const actor = normalizeActor(req.body?.actor);
  const text = String(req.body?.text || '').trim();
  const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
  const links = extractLinks(text);
  const createdAt = new Date().toISOString();

  let userMessageId;
  try {
    const { data } = await supabase
      .from('founder_capture_messages')
      .insert({ actor, role: 'user', text: text || '(附件)', status: 'pending', payload: { link_count: links.length, attachment_count: attachments.length } })
      .select('id')
      .single();
    userMessageId = data?.id;
  } catch {
    userMessageId = undefined;
  }

  const assetSummaries = [];
  for (const attachment of attachments.slice(0, 5)) {
    const saved = await saveAttachment(supabase, userMessageId, actor, attachment, text);
    if (saved) assetSummaries.push(saved.summary);
  }

  for (const link of links.slice(0, 5)) {
    const summary = await summarizeLink(link);
    assetSummaries.push(summary);
    await insertAsset(supabase, userMessageId, {
      source_type: 'link',
      original_name: link,
      mime_type: 'text/uri-list',
      size_bytes: 0,
      storage_path: null,
      summary,
    });
  }

  const workItems = await fetchWorkItems(supabase);
  const financeEntries = await fetchFinanceEntries(supabase);
  const intent = parseFounderInput(text, actor, financeEntries, workItems);
  const actionResult = await executeIntent(supabase, intent, actor, text, assetSummaries);
  const aiSummary = await maybeAskNvidia({ text, assetSummaries, intent, actionResult });
  const reply = aiSummary || actionResult.reply;

  if (userMessageId) {
    await supabase.from('founder_capture_messages').update({ status: actionResult.ok ? 'processed' : 'failed', intent_kind: intent.kind, response_text: reply }).eq('id', userMessageId);
  }
  await supabase.from('founder_capture_messages').insert({ actor, role: 'assistant', text: reply, status: actionResult.ok ? 'processed' : 'failed', intent_kind: intent.kind, response_text: reply, payload: { source_message_id: userMessageId } });

  return res.status(actionResult.ok ? 200 : 422).json({ ok: actionResult.ok, intent: intent.kind, reply, createdAt });
}

function isAuthorized(req) {
  const expected = process.env.FOUNDER_APP_PASSWORD;
  if (!expected) return false;
  return String(req.headers['x-founder-passcode'] || '') === expected;
}

function normalizeActor(value) {
  return value === 'partner' ? 'partner' : 'wendy';
}

function extractLinks(text) {
  return Array.from(text.matchAll(/https?:\/\/[^\s)]+/gi)).map(match => match[0]);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function classifyCategory(text) {
  const normalized = text.toLowerCase();
  for (const [category, keywords] of CATEGORY_RULES) {
    if (keywords.some(keyword => normalized.includes(keyword.toLowerCase()))) return category;
  }
  return 'other';
}

function extractAmount(text) {
  const match = text.match(/(?:£|gbp|pounds?|镑)?\s*(\d+(?:\.\d+)?)/i);
  return match ? Number(match[1]) : null;
}

function parseStatus(text) {
  if (/完成|已完成|done|finished|complete/i.test(text)) return 'done';
  if (/进行中|开始|doing|in progress|started/i.test(text)) return 'doing';
  if (/待办|todo|to do/i.test(text)) return 'todo';
  return undefined;
}

function parseFounderInput(text, actor, financeEntries, workItems) {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  const amount = extractAmount(trimmed);

  if (/本月.*(花|支出|spend|spent)|monthly spend/i.test(trimmed)) {
    const month = today().slice(0, 7);
    const total = financeEntries
      .filter(entry => entry.entry_type === 'expense' && String(entry.entry_date).startsWith(month))
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    return { kind: 'query', reply: `本月支出是 £${total.toFixed(2)}。` };
  }

  const childMatch = trimmed.match(/^给\s*(.+?)\s*加子任务[:：]?\s*(.+)$/)
    || trimmed.match(/^add subtask to\s+(.+?)[:：]?\s*(.+)$/i);
  if (childMatch) {
    return { kind: 'create_child_work_item', parentTitle: childMatch[1].trim(), title: childMatch[2].trim(), actor };
  }

  const status = parseStatus(trimmed);
  if (status) {
    const titleQuery = trimmed
      .replace(/^(完成|已完成)\s*/i, '')
      .replace(/\s*(完成|已完成|进行中|开始|待办|done|finished|complete|doing|in progress|started|todo|to do)\s*$/i, '')
      .trim();
    if (titleQuery) return { kind: 'update_work_status', titleQuery, status };
  }

  if (/^任务[:：]/.test(trimmed) || lower.startsWith('task:')) {
    return { kind: 'create_work_item', itemType: 'task', title: trimmed.replace(/^任务[:：]\s*|^task:\s*/i, '').trim(), actor };
  }

  if (/^想法[:：]/.test(trimmed) || lower.startsWith('idea:')) {
    return { kind: 'create_work_item', itemType: 'idea', title: trimmed.replace(/^想法[:：]\s*|^idea:\s*/i, '').trim(), actor };
  }

  const income = /收到|收入|付款|预付|paid me|received/i.test(trimmed);
  const expense = /花了|买|支出|spent|paid for|bought/i.test(trimmed);
  if (amount && (income || expense)) {
    return {
      kind: 'create_finance',
      entryType: income ? 'income' : 'expense',
      amount,
      category: classifyCategory(trimmed),
      note: trimmed,
      actor,
    };
  }

  if (trimmed || workItems.length) return { kind: 'save_wiki_note', text: trimmed, actor };
  return { kind: 'unknown', reply: '我收到附件了，但没有文字说明。请补一句它应该记成任务、账目、想法还是 Wiki 资料。' };
}

async function executeIntent(supabase, intent, actor, text, assetSummaries) {
  if (intent.kind === 'query') return { ok: true, reply: intent.reply };

  if (intent.kind === 'create_finance') {
    const { error } = await supabase.from('finance_entries').insert({
      entry_type: intent.entryType,
      amount: intent.amount,
      currency: 'GBP',
      category: intent.category,
      note: intent.note,
      entry_date: today(),
      created_by: actor,
    });
    if (error) return { ok: false, reply: `账目没写入：${error.message}` };
    await logActivity(supabase, actor, `finance.${intent.entryType}`, `记录${intent.entryType === 'income' ? '收入' : '支出'} £${intent.amount}：${intent.note}`);
    return { ok: true, reply: `已记录${intent.entryType === 'income' ? '收入' : '支出'} £${intent.amount}，分类为${categoryZh(intent.category)}。` };
  }

  if (intent.kind === 'create_work_item') {
    const { error } = await supabase.from('work_items').insert({
      item_type: intent.itemType,
      title: intent.title,
      priority: /紧急|urgent|asap/i.test(intent.title) ? 'high' : 'medium',
      status: 'todo',
      tags: assetSummaries.length ? [`source:capture`, `note:${assetSummaries.join('\n\n')}`] : [],
      sort_order: await nextSortOrder(supabase, null),
      created_by: actor,
    });
    if (error) return { ok: false, reply: `任务没写入：${error.message}` };
    await logActivity(supabase, actor, `work.${intent.itemType}`, `新增${intent.itemType === 'task' ? '任务' : '想法'}：${intent.title}`);
    return { ok: true, reply: `已创建${intent.itemType === 'task' ? '任务' : '想法'}：${intent.title}` };
  }

  if (intent.kind === 'create_child_work_item') {
    const parent = await findWorkItem(supabase, intent.parentTitle);
    if (!parent) return { ok: false, reply: `没找到父任务：${intent.parentTitle}` };
    const { error } = await supabase.from('work_items').insert({
      item_type: 'task',
      title: intent.title,
      parent_id: parent.id,
      priority: 'medium',
      status: 'todo',
      tags: [],
      sort_order: await nextSortOrder(supabase, parent.id),
      created_by: actor,
    });
    if (error) return { ok: false, reply: `子任务没写入：${error.message}` };
    await logActivity(supabase, actor, 'work.child', `给 ${parent.title} 新增子任务：${intent.title}`);
    return { ok: true, reply: `已给 ${parent.title} 加子任务：${intent.title}` };
  }

  if (intent.kind === 'update_work_status') {
    const item = await findWorkItem(supabase, intent.titleQuery);
    if (!item) return { ok: false, reply: `没找到任务：${intent.titleQuery}` };
    const { error } = await supabase.from('work_items').update({ status: intent.status }).eq('id', item.id);
    if (error) return { ok: false, reply: `任务状态没更新：${error.message}` };
    await logActivity(supabase, actor, 'work.status', `更新任务状态：${item.title} -> ${statusZh(intent.status)}`);
    return { ok: true, reply: `已把 ${item.title} 标记为${statusZh(intent.status)}。` };
  }

  if (intent.kind === 'save_wiki_note') {
    await logActivity(supabase, actor, 'capture.wiki', `保存资料：${(text || assetSummaries.join(' ')).slice(0, 80)}`);
    return { ok: true, reply: assetSummaries.length ? `已保存资料和 ${assetSummaries.length} 条附件摘要。` : '已作为资料记录到 Capture。' };
  }

  return { ok: false, reply: intent.reply || '还没识别出要做什么，请换成“任务：...”或“今天花了...”这种说法。' };
}

async function fetchWorkItems(supabase) {
  const { data } = await supabase.from('work_items').select('id,title,parent_id,status,sort_order').limit(300);
  return data || [];
}

async function fetchFinanceEntries(supabase) {
  const { data } = await supabase.from('finance_entries').select('entry_type,amount,entry_date').limit(300);
  return data || [];
}

async function findWorkItem(supabase, query) {
  const { data } = await supabase.from('work_items').select('id,title').limit(300);
  const normalized = query.toLowerCase().trim();
  return (data || []).find(item => item.title.toLowerCase() === normalized)
    || (data || []).find(item => item.title.toLowerCase().includes(normalized) || normalized.includes(item.title.toLowerCase()));
}

async function nextSortOrder(supabase, parentId) {
  const query = supabase.from('work_items').select('sort_order').order('sort_order', { ascending: false }).limit(1);
  const { data } = parentId ? await query.eq('parent_id', parentId) : await query.is('parent_id', null);
  return Number(data?.[0]?.sort_order || 0) + 1;
}

async function logActivity(supabase, actor, actionType, summary) {
  await supabase.from('activity_log').insert({ actor, action_type: actionType, summary });
}

function categoryZh(category) {
  return ({ tools: '工具', marketing: '营销', salary: '工资', client_payment: '客户付款', procurement: '采购', travel: '差旅', other: '其他' })[category] || '其他';
}

function statusZh(status) {
  return ({ todo: '待办', doing: '进行中', done: '完成' })[status] || status;
}

async function saveAttachment(supabase, messageId, actor, attachment, contextText) {
  if (!attachment?.data || attachment.size > MAX_ATTACHMENT_BYTES) {
    const summary = `${attachment?.name || '附件'} 太大或格式不完整，未上传。`;
    await insertAsset(supabase, messageId, { source_type: 'file', original_name: attachment?.name || 'unknown', mime_type: attachment?.type || 'application/octet-stream', size_bytes: attachment?.size || 0, storage_path: null, summary });
    return { summary };
  }

  const parsed = parseDataUrl(attachment.data);
  if (!parsed) return null;
  const safeName = attachment.name.replace(/[^\w.\-]+/g, '_').slice(-96);
  const path = `${actor}/${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from('founder-captures').upload(path, parsed.buffer, {
    contentType: attachment.type || parsed.mime,
    upsert: false,
  });
  const summary = attachment.type?.startsWith('image/')
    ? await summarizeImageWithNvidia(attachment.data, contextText, attachment.name)
    : summarizeFileBuffer(attachment, parsed.buffer);

  await insertAsset(supabase, messageId, {
    source_type: attachment.type?.startsWith('image/') ? 'image' : 'file',
    original_name: attachment.name,
    mime_type: attachment.type || parsed.mime,
    size_bytes: attachment.size || parsed.buffer.length,
    storage_path: error ? null : path,
    summary: error ? `${summary}\n上传 Storage 失败：${error.message}` : summary,
  });
  return { summary };
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
}

function summarizeFileBuffer(attachment, buffer) {
  const type = attachment.type || 'application/octet-stream';
  const size = Math.round((attachment.size || buffer.length) / 1024);
  if (/^text\/|json|csv|markdown|xml|yaml|javascript|typescript/i.test(type) || /\.(txt|md|json|csv|xml|ya?ml|js|ts)$/i.test(attachment.name)) {
    const text = buffer.toString('utf8').replace(/\s+/g, ' ').trim().slice(0, 1500);
    return `已上传并提取文本：${attachment.name} (${size} KB)\n${text || '文件没有读到可用文本。'}`;
  }
  return `已上传文件：${attachment.name} (${type}, ${size} KB)。复杂格式会先存档，后续可接 MarkItDown worker 做全文转换。`;
}

async function insertAsset(supabase, messageId, asset) {
  try {
    await supabase.from('founder_capture_assets').insert({
      message_id: messageId || null,
      ...asset,
    });
  } catch {
    // Capture assets are useful but should not block the core write path.
  }
}

async function summarizeLink(link) {
  try {
    if (isPrivateUrl(link)) return `链接已记录，但出于安全原因没有抓取内网地址：${link}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(link, { signal: controller.signal, headers: { 'user-agent': 'FounderOS/1.0' } });
    clearTimeout(timeout);
    const html = await response.text();
    const title = html.match(/<title[^>]*>(.*?)<\/title>/is)?.[1]?.replace(/\s+/g, ' ').trim();
    const description = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i)?.[1];
    return `链接：${link}\n标题：${title || '未读取到标题'}\n摘要：${description || stripHtml(html).slice(0, 500)}`;
  } catch (error) {
    return `链接已记录，但抓取失败：${link} (${error instanceof Error ? error.message : 'unknown'})`;
  }
}

function stripHtml(html) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function isPrivateUrl(raw) {
  try {
    const url = new URL(raw);
    const host = url.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host.startsWith('10.') || host.startsWith('192.168.') || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
  } catch {
    return true;
  }
}

async function maybeAskNvidia({ text, assetSummaries, intent, actionResult }) {
  if (!process.env.FOUNDER_NVIDIA_API_KEY || !process.env.FOUNDER_AI_MODEL) return '';
  if (intent.kind !== 'save_wiki_note' && assetSummaries.length === 0) return '';
  const prompt = [
    '你是 Founder OS 的线上 Capture 助手。用简短中文回复，说明已经保存了什么，下一步建议是什么。',
    `用户输入：${text || '(无文字)'}`,
    `系统动作：${actionResult.reply}`,
    `附件/链接摘要：${assetSummaries.join('\n\n') || '(无)'}`,
  ].join('\n');
  return callNvidia([{ role: 'user', content: prompt }]);
}

async function summarizeImageWithNvidia(dataUrl, contextText, fileName) {
  if (!process.env.FOUNDER_NVIDIA_API_KEY || !process.env.FOUNDER_AI_MODEL) return `图片已上传：${fileName}。`;
  const content = [
    { type: 'text', text: `请用中文简要总结这张图片里对 Founder OS 有用的信息。上下文：${contextText || '无'}` },
    { type: 'image_url', image_url: { url: dataUrl } },
  ];
  return await callNvidia([{ role: 'user', content }]) || `图片已上传：${fileName}。`;
}

async function callNvidia(messages) {
  try {
    const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.FOUNDER_NVIDIA_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.FOUNDER_AI_MODEL,
        messages,
        temperature: 0.2,
        max_tokens: 500,
      }),
    });
    if (!response.ok) return '';
    const payload = await response.json();
    return payload?.choices?.[0]?.message?.content?.trim() || '';
  } catch {
    return '';
  }
}
