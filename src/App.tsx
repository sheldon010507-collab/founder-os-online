import { createClient } from '@supabase/supabase-js';
import {
  Brain,
  ChevronDown,
  ChevronRight,
  GitBranch,
  LayoutDashboard,
  Link as LinkIcon,
  Loader2,
  Menu,
  Paperclip,
  Pencil,
  Save,
  Send,
  Settings,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, DragEvent, FormEvent, ReactNode } from 'react';

type Person = 'wendy' | 'partner';
type View = 'capture' | 'board' | 'learning' | 'settings';
type Status = 'todo' | 'doing' | 'done';
type Category = 'tools' | 'marketing' | 'salary' | 'client_payment' | 'procurement' | 'travel' | 'other';
type Priority = 'high' | 'medium' | 'low';

type Finance = {
  id: string;
  type: 'income' | 'expense';
  amount: number;
  category: Category;
  note: string;
  entryDate: string;
  createdBy: Person;
  createdAt: string;
};

type Work = {
  id: string;
  itemType: 'task' | 'idea';
  title: string;
  parentId?: string;
  status: Status;
  priority: Priority;
  tags: string[];
  sortOrder: number;
  createdBy: Person;
  createdAt: string;
};

type Activity = { id: string; actor: Person; actionType: string; summary: string; createdAt: string };
type Candidate = { id: string; title: string; ruleText: string; status: 'pending' | 'approved' | 'rejected'; evidenceCount: number; createdAt: string };
type CaptureMessage = {
  id: string;
  actor: Person;
  role: 'user' | 'assistant';
  text: string;
  status: 'pending' | 'processed' | 'failed';
  createdAt: string;
  attachments?: CaptureAttachment[];
};
type CaptureAttachment = { name: string; type: string; size: number; data?: string };
type Node = { item: Work; children: Node[]; progress: number; inferred?: boolean };
type DropPosition = 'before' | 'after' | 'child';
type DropTarget = { id: string; position: DropPosition };

const founderSupabaseUrl = 'https://rnjwqzmwmnueugizyvco.supabase.co';
const founderSupabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJuandxem13bW51ZXVnaXp5dmNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA2ODY5MjAsImV4cCI6MjA5NjI2MjkyMH0.7e02nPcRmDoHirSvC8M8W5lGbeedxIry0DrLvYb2WKE';
const supabaseUrl = founderSupabaseUrl;
const supabaseAnonKey = founderSupabaseAnonKey;
const hasSupabase = Boolean(supabaseUrl && supabaseAnonKey);
const supabase = hasSupabase ? createClient(supabaseUrl, supabaseAnonKey) : null;

const actorName = (actor: Person) => actor === 'wendy' ? 'Wendy' : 'Dexter';
const categoryLabel: Record<Category, string> = {
  tools: '工具',
  marketing: '营销',
  salary: '工资',
  client_payment: '客户付款',
  procurement: '采购',
  travel: '差旅',
  other: '其他',
};
const statusLabel: Record<Status, string> = { todo: '待办', doing: '进行中', done: '完成' };
const priorityLabel: Record<Priority, string> = { high: '高', medium: '中', low: '低' };

const nav = [
  { view: 'capture' as const, label: 'Capture', icon: Sparkles },
  { view: 'board' as const, label: '看板', icon: LayoutDashboard },
  { view: 'learning' as const, label: 'Wiki', icon: Brain },
  { view: 'settings' as const, label: 'Settings', icon: Settings },
];

export default function App() {
  const [view, setView] = useState<View>('capture');
  const [menuOpen, setMenuOpen] = useState(false);
  const [actor, setActor] = useState<Person>(() => (localStorage.getItem('founder-actor') as Person) || 'wendy');
  const [appPassword, setAppPassword] = useState(() => localStorage.getItem('founder-app-passcode') || '');
  const [passwordDraft, setPasswordDraft] = useState('');
  const [unlocked, setUnlocked] = useState(() => Boolean(localStorage.getItem('founder-app-passcode')));
  const [finance, setFinance] = useState<Finance[]>([]);
  const [work, setWork] = useState<Work[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [messages, setMessages] = useState<CaptureMessage[]>([]);
  const [connectionNote, setConnectionNote] = useState(hasSupabase ? '正在连接 Supabase...' : '未配置 Supabase：不会显示演示数据，请在 Vercel 配置正确的 Supabase 环境变量。');
  const active = nav.find(item => item.view === view) || nav[0];

  useEffect(() => {
    localStorage.setItem('founder-actor', actor);
  }, [actor]);

  useEffect(() => {
    if (!unlocked || !supabase) return;
    refreshData().catch(error => setConnectionNote(`Supabase 读取失败：${error.message}`));
  }, [unlocked]);

  async function refreshData() {
    if (!supabase) return;
    const [f, w, a, c, m] = await Promise.all([
      supabase.from('finance_entries').select('*').order('entry_date', { ascending: false }).limit(100),
      supabase.from('work_items').select('*').order('sort_order', { ascending: true }).limit(240),
      supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('founder_skill_candidates').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('founder_capture_messages').select('*').order('created_at', { ascending: false }).limit(40),
    ]);
    const coreError = f.error || w.error || a.error || c.error;
    if (coreError) throw coreError;
    setFinance((f.data || []).map(row => ({ id: row.id, type: row.entry_type, amount: Number(row.amount), category: row.category, note: row.note || '', entryDate: row.entry_date, createdBy: row.created_by, createdAt: row.created_at })));
    setWork((w.data || []).map(row => ({ id: row.id, itemType: row.item_type, title: row.title, parentId: row.parent_id || undefined, priority: row.priority, status: row.status, tags: row.tags || [], sortOrder: row.sort_order || 0, createdBy: row.created_by, createdAt: row.created_at })));
    setActivities((a.data || []).map(row => ({ id: row.id, actor: row.actor, actionType: row.action_type, summary: row.summary, createdAt: row.created_at })));
    setCandidates((c.data || []).map(row => ({ id: row.id, title: row.title, ruleText: row.rule_text, status: row.status, evidenceCount: row.evidence_count, createdAt: row.created_at })));
    if (!m.error) {
      setMessages((m.data || []).reverse().map(row => ({
        id: row.id,
        actor: row.actor,
        role: row.role,
        text: row.text,
        status: row.status,
        createdAt: row.created_at,
      })));
    }
    const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
    const dataSummary = `Supabase：${projectRef}｜账目 ${(f.data || []).length}｜任务 ${(w.data || []).length}｜动态 ${(a.data || []).length}`;
    setConnectionNote(m.error ? `${dataSummary}｜Capture 表未初始化：${m.error.message}` : dataSummary);
  }

  function unlock(event: FormEvent) {
    event.preventDefault();
    if (!passwordDraft.trim()) return;
    localStorage.setItem('founder-app-passcode', passwordDraft.trim());
    setAppPassword(passwordDraft.trim());
    setUnlocked(true);
  }

  async function saveWorkItem(next: Work) {
    setWork(current => current.map(item => item.id === next.id ? next : item));
    if (!supabase) return;
    const { error } = await supabase
      .from('work_items')
      .update({ title: next.title, status: next.status, priority: next.priority, tags: next.tags })
      .eq('id', next.id);
    if (error) setConnectionNote(`任务已本地更新，但 Supabase 保存失败：${error.message}`);
  }

  async function moveWorkItem(draggedId: string, targetId: string, position: DropPosition) {
    if (draggedId === targetId) return;
    const result = reorderWorkItems(work, draggedId, targetId, position);
    if (!result.ok) {
      setConnectionNote(result.error);
      return;
    }
    setWork(result.items);
    if (!supabase) return;
    const changed = result.items.filter(next => {
      const before = work.find(item => item.id === next.id);
      return before && ((before.parentId || null) !== (next.parentId || null) || before.sortOrder !== next.sortOrder);
    });
    const updates = await Promise.all(changed.map(item => supabase
      .from('work_items')
      .update({ parent_id: item.parentId || null, sort_order: item.sortOrder })
      .eq('id', item.id)));
    const failed = updates.find(update => update.error);
    setConnectionNote(failed?.error ? `任务已本地拖动，但 Supabase 保存失败：${failed.error.message}` : '任务顺序已保存。');
  }

  async function handleCapture(text: string, attachments: CaptureAttachment[]) {
    const userMessage: CaptureMessage = {
      id: crypto.randomUUID(),
      actor,
      role: 'user',
      text,
      attachments,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };
    setMessages(current => [...current, userMessage]);
    try {
      const response = await fetch('/api/capture', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-founder-passcode': appPassword,
        },
        body: JSON.stringify({ actor, text, attachments }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Capture failed');
      const assistant: CaptureMessage = {
        id: crypto.randomUUID(),
        actor,
        role: 'assistant',
        text: payload.reply || '已处理。',
        status: 'processed',
        createdAt: new Date().toISOString(),
      };
      setMessages(current => [...current.map(item => item.id === userMessage.id ? { ...item, status: 'processed' as const } : item), assistant]);
      await refreshData();
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setMessages(current => [
        ...current.map(item => item.id === userMessage.id ? { ...item, status: 'failed' as const } : item),
        { id: crypto.randomUUID(), actor, role: 'assistant', text: `没写入：${message}`, status: 'failed', createdAt: new Date().toISOString() },
      ]);
    }
  }

  if (!unlocked) {
    return <PasswordGate passwordDraft={passwordDraft} setPasswordDraft={setPasswordDraft} onSubmit={unlock} />;
  }

  const ActiveIcon = active.icon;

  return (
    <div className="app-shell">
      <header className="mobile-topbar">
        <button type="button" className="icon-button" onClick={() => setMenuOpen(true)} aria-label="打开菜单"><Menu size={20} /></button>
        <div className="mobile-brand"><img src="/dog-icon-192.png" alt="" /><strong>Founder OS</strong></div>
        <select value={actor} onChange={event => setActor(event.target.value as Person)} aria-label="当前身份">
          <option value="wendy">Wendy</option>
          <option value="partner">Dexter</option>
        </select>
      </header>

      <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
        <div className="brand">
          <img className="brand-dog" src="/dog-icon-192.png" alt="" />
          <div><strong>Founder OS</strong><span>Online workspace</span></div>
          <button type="button" className="icon-button close-menu" onClick={() => setMenuOpen(false)} aria-label="关闭菜单"><X size={18} /></button>
        </div>
        <nav aria-label="Founder OS sections">
          {nav.map(item => {
            const Icon = item.icon;
            return (
              <button
                key={item.view}
                className={view === item.view ? 'nav-item active' : 'nav-item'}
                onClick={() => { setView(item.view); setMenuOpen(false); }}
              >
                <Icon size={17} />{item.label}
              </button>
            );
          })}
        </nav>
      </aside>
      {menuOpen && <button type="button" className="scrim" aria-label="关闭菜单" onClick={() => setMenuOpen(false)} />}

      <main className="main">
        <header className="page-head">
          <div className="page-title-icon"><ActiveIcon size={20} /></div>
          <div>
            <p className="workspace-path">Founder OS / {active.label}</p>
            <h1>{active.view === 'capture' ? '随手记录' : active.label}</h1>
            <p>{active.view === 'capture' ? '像聊天一样输入任务、账目、想法、链接和资料；系统会写入 Supabase。' : '看板和知识库都放在菜单里，首页只保留最快的输入入口。'}</p>
          </div>
          <label className="actor-switch"><span>当前身份</span><select value={actor} onChange={event => setActor(event.target.value as Person)}><option value="wendy">Wendy</option><option value="partner">Dexter</option></select></label>
        </header>

        {view === 'capture' && <CaptureHome actor={actor} messages={messages} onSubmit={handleCapture} />}
        {view === 'board' && <Board finance={finance} work={work} activities={activities} connectionNote={connectionNote} onSaveWorkItem={saveWorkItem} onMoveWorkItem={moveWorkItem} />}
        {view === 'learning' && <Learning candidates={candidates} connectionNote={connectionNote} />}
        {view === 'settings' && <SettingsPage connectionNote={connectionNote} onLock={() => { localStorage.removeItem('founder-app-passcode'); setUnlocked(false); setAppPassword(''); }} />}
      </main>
    </div>
  );
}

function PasswordGate({ passwordDraft, setPasswordDraft, onSubmit }: { passwordDraft: string; setPasswordDraft: (value: string) => void; onSubmit: (event: FormEvent) => void }) {
  return (
    <main className="password-gate">
      <form className="password-card" onSubmit={onSubmit}>
        <img src="/dog-icon-192.png" alt="" />
        <p className="workspace-path">Founder OS Online</p>
        <h1>私人工作台</h1>
        <p>输入共享密码后进入。密码只保存在这台设备，并会随 Capture 请求发给 Vercel API 校验。</p>
        <input type="password" value={passwordDraft} onChange={event => setPasswordDraft(event.target.value)} placeholder="共享密码" autoFocus />
        <button className="save-button" type="submit">进入</button>
      </form>
    </main>
  );
}

function CaptureHome({ actor, messages, onSubmit }: { actor: Person; messages: CaptureMessage[]; onSubmit: (text: string, attachments: CaptureAttachment[]) => Promise<void> }) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<CaptureAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  async function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const files = Array.from(fileList).slice(0, 5);
    const converted = await Promise.all(files.map(readAttachment));
    setAttachments(current => [...current, ...converted]);
    if (fileRef.current) fileRef.current.value = '';
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if ((!text.trim() && attachments.length === 0) || busy) return;
    setBusy(true);
    await onSubmit(text.trim(), attachments);
    setText('');
    setAttachments([]);
    setBusy(false);
  }

  return (
    <section className="capture-layout">
      <div className="chat-panel">
        <div className="message-list">
          {messages.length === 0 && (
            <div className="empty-state">
              <Sparkles size={22} />
              <strong>直接开始写</strong>
              <p>比如：今天花了50镑买域名、任务：parking alert 上线、Guka Apple Wallet 进行中，或者上传图片/文件让它归档摘要。</p>
            </div>
          )}
          {messages.map(message => <ChatBubble key={message.id} message={message} />)}
        </div>
        <form className="composer" onSubmit={submit}>
          {attachments.length > 0 && (
            <div className="attachment-tray">
              {attachments.map(item => (
                <span key={`${item.name}-${item.size}`}><Paperclip size={13} />{item.name}</span>
              ))}
            </div>
          )}
          <textarea
            value={text}
            onChange={event => setText(event.target.value)}
            placeholder={`${actorName(actor)}，输入账目 / 任务 / 想法 / 链接...`}
            onDrop={event => { event.preventDefault(); addFiles(event.dataTransfer.files); }}
            onDragOver={event => event.preventDefault()}
          />
          <div className="composer-actions">
            <input ref={fileRef} type="file" multiple hidden onChange={event => addFiles(event.target.files)} />
            <button type="button" className="secondary-button" onClick={() => fileRef.current?.click()}><Upload size={16} />上传</button>
            <button type="button" className="secondary-button" onClick={() => setText(current => current ? current : 'https://')}><LinkIcon size={16} />链接</button>
            <button className="save-button" type="submit" disabled={busy}>{busy ? <Loader2 className="spin" size={16} /> : <Send size={16} />}发送</button>
          </div>
        </form>
      </div>
      <aside className="capture-guide">
        <Panel title="线上入口 SOP">
          <p>现在 Founder OS 的主入口就是这个页面。手机添加到桌面后，打开、输入、发送即可。</p>
          <div className="hint-list">
            <span>账目：今天花了50镑买域名</span>
            <span>任务：任务：周五联系供应商</span>
            <span>子任务：给 Guka 加子任务：Apple Wallet</span>
            <span>状态：Guka Apple Wallet 进行中</span>
            <span>查询：本月花了多少？</span>
          </div>
        </Panel>
      </aside>
    </section>
  );
}

function ChatBubble({ message }: { message: CaptureMessage }) {
  return (
    <article className={`chat-bubble ${message.role} ${message.status}`}>
      <div className="bubble-meta"><strong>{message.role === 'user' ? actorName(message.actor) : 'Founder AI'}</strong><time>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>
      <p>{message.text || '已上传附件'}</p>
      {message.attachments && message.attachments.length > 0 && <small>{message.attachments.length} 个附件</small>}
    </article>
  );
}

function Board({ finance, work, activities, connectionNote, onSaveWorkItem, onMoveWorkItem }: { finance: Finance[]; work: Work[]; activities: Activity[]; connectionNote: string; onSaveWorkItem: (item: Work) => Promise<void>; onMoveWorkItem: (draggedId: string, targetId: string, position: DropPosition) => Promise<void> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const income = finance.filter(item => item.type === 'income').reduce((sum, item) => sum + item.amount, 0);
  const expense = finance.filter(item => item.type === 'expense').reduce((sum, item) => sum + item.amount, 0);
  const tree = useMemo(() => buildTree(work), [work]);
  const selected = selectedId ? work.find(item => item.id === selectedId) : undefined;

  async function handleMove(dragged: string, target: DropTarget) {
    setDraggedId(null);
    setDropTarget(null);
    await onMoveWorkItem(dragged, target.id, target.position);
  }

  return (
    <div className="dashboard-layout">
      <section className="connection-banner">
        <strong>数据来源</strong>
        <span>{connectionNote}</span>
      </section>
      <section className="metric-row">
        <Metric label="本月收入" value={`£${income.toFixed(0)}`} tone="good" />
        <Metric label="本月支出" value={`£${expense.toFixed(0)}`} tone="warn" />
        <Metric label="净现金流" value={`£${(income - expense).toFixed(0)}`} tone={income >= expense ? 'good' : 'warn'} />
      </section>
      <section className="panel task-panel">
        <div className="panel-title"><h2>任务树进度</h2><GitBranch size={17} /></div>
        <div className="work-tree">
          {tree.length === 0 && <p className="empty">还没有任务。</p>}
          {tree.map(node => (
            <WorkNode
              key={node.item.id}
              node={node}
              depth={0}
              selectedId={selectedId}
              draggedId={draggedId}
              dropTarget={dropTarget}
              onSelect={setSelectedId}
              onDragStart={setDraggedId}
              onDropTarget={setDropTarget}
              onMove={handleMove}
            />
          ))}
        </div>
      </section>
      <TaskEditor item={selected} onClose={() => setSelectedId(null)} onSave={onSaveWorkItem} />
      <section className="panel">
        <h2>最近账目</h2>
        <div className="list finance-list">
          {finance.length === 0 && <p className="empty">还没有从 Supabase 读到正式账目。</p>}
          {finance.slice(0, 6).map(item => <FinanceRow key={item.id} entry={item} />)}
        </div>
      </section>
      <section className="panel">
        <h2>最近动态</h2>
        <div className="activity-feed compact">
          {activities.length === 0 && <p className="empty">还没有从 Supabase 读到动态记录。</p>}
          {activities.slice(0, 6).map(item => <div key={item.id} className="activity-row"><strong>{actorName(item.actor)}</strong><span>{item.summary}</span><time>{new Date(item.createdAt).toLocaleDateString()}</time></div>)}
        </div>
      </section>
    </div>
  );
}

function WorkNode({ node, depth, selectedId, draggedId, dropTarget, onSelect, onDragStart, onDropTarget, onMove }: {
  node: Node;
  depth: number;
  selectedId: string | null;
  draggedId: string | null;
  dropTarget: DropTarget | null;
  onSelect: (id: string | null) => void;
  onDragStart: (id: string | null) => void;
  onDropTarget: (target: DropTarget | null) => void;
  onMove: (draggedId: string, target: DropTarget) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.item.id;
  const isDragging = draggedId === node.item.id;
  const activeDrop = dropTarget?.id === node.item.id ? dropTarget.position : undefined;
  const canDrag = !node.inferred;
  const rowClassName = [
    'work-node-main',
    isSelected ? 'selected' : '',
    isDragging ? 'dragging' : '',
    activeDrop ? `drop-${activeDrop}` : '',
  ].filter(Boolean).join(' ');

  function readDropPosition(event: DragEvent<HTMLDivElement>): DropPosition {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - rect.top) / Math.max(rect.height, 1);
    if (ratio < 0.28) return 'before';
    if (ratio > 0.72) return 'after';
    return 'child';
  }

  return (
    <div className="work-node" style={{ '--depth': depth } as CSSProperties}>
      <div
        className={rowClassName}
        draggable={canDrag}
        onDragStart={event => {
          if (!canDrag) return;
          event.dataTransfer.effectAllowed = 'move';
          event.dataTransfer.setData('text/plain', node.item.id);
          onDragStart(node.item.id);
        }}
        onDragEnd={() => {
          onDragStart(null);
          onDropTarget(null);
        }}
        onDragOver={event => {
          if (!draggedId || draggedId === node.item.id || node.inferred) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'move';
          onDropTarget({ id: node.item.id, position: readDropPosition(event) });
        }}
        onDragLeave={event => {
          if (!event.currentTarget.contains(event.relatedTarget as globalThis.Node | null)) onDropTarget(null);
        }}
        onDrop={event => {
          const dragged = event.dataTransfer.getData('text/plain') || draggedId;
          if (!dragged || dragged === node.item.id || node.inferred) return;
          event.preventDefault();
          onMove(dragged, { id: node.item.id, position: readDropPosition(event) });
        }}
      >
        <button className="work-expander" type="button" onClick={() => hasChildren && setExpanded(current => !current)} aria-label={expanded ? '收起' : '展开'}>
          {hasChildren ? (expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />) : <span className={`status-dot ${node.item.status}`} />}
        </button>
        <button className="work-open" type="button" onClick={() => node.inferred ? setExpanded(current => !current) : onSelect(node.item.id)}>
          <strong>{node.item.title}</strong>
          <small>{node.inferred ? '项目组' : statusLabel[node.item.status]} · {node.item.itemType === 'task' ? '任务' : '想法'}{hasChildren ? ` · ${node.children.length} 个子项` : ''}</small>
        </button>
        <span className="work-percent">{node.progress}%</span>
      </div>
      <div className="progress-line"><span style={{ width: `${node.progress}%` }} /></div>
      {expanded && node.children.map(child => (
        <WorkNode
          key={child.item.id}
          node={child}
          depth={depth + 1}
          selectedId={selectedId}
          draggedId={draggedId}
          dropTarget={dropTarget}
          onSelect={onSelect}
          onDragStart={onDragStart}
          onDropTarget={onDropTarget}
          onMove={onMove}
        />
      ))}
    </div>
  );
}

function TaskEditor({ item, onClose, onSave }: { item?: Work; onClose: () => void; onSave: (item: Work) => Promise<void> }) {
  const [draft, setDraft] = useState<Work | undefined>(item);
  useEffect(() => setDraft(item), [item]);
  if (!draft) return <aside className="task-editor empty-editor"><Pencil size={18} /><strong>点开一个任务</strong><p>像 Notion 一样在这里改标题、状态、优先级和说明。</p></aside>;
  const note = getNote(draft);
  const setNote = (value: string) => setDraft({ ...draft, tags: setNoteTag(draft.tags, value) });
  return (
    <aside className="task-editor">
      <div className="editor-head"><strong>任务详情</strong><button type="button" onClick={onClose}><X size={16} /></button></div>
      <label>标题<input value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} /></label>
      <div className="editor-grid">
        <label>状态<select value={draft.status} onChange={event => setDraft({ ...draft, status: event.target.value as Status })}><option value="todo">待办</option><option value="doing">进行中</option><option value="done">完成</option></select></label>
        <label>优先级<select value={draft.priority} onChange={event => setDraft({ ...draft, priority: event.target.value as Priority })}><option value="high">高</option><option value="medium">中</option><option value="low">低</option></select></label>
      </div>
      <label>说明<textarea value={note} onChange={event => setNote(event.target.value)} placeholder="补充背景、下一步、卡点..." /></label>
      <div className="editor-meta"><span>{priorityLabel[draft.priority]}优先级</span><span>{actorName(draft.createdBy)}</span></div>
      <button className="save-button" type="button" onClick={() => onSave(draft)}><Save size={16} />保存</button>
    </aside>
  );
}

function FinanceRow({ entry }: { entry: Finance }) {
  const sign = entry.type === 'income' ? '+' : '-';
  return <div className="finance-row"><div><strong>{sign}£{entry.amount}</strong><span>{entry.note || categoryLabel[entry.category]}</span></div><small>{categoryLabel[entry.category]} · {entry.entryDate}</small></div>;
}

function Learning({ candidates, connectionNote }: { candidates: Candidate[]; connectionNote: string }) {
  return (
    <section className="learning-page">
      <Panel title="Wiki 现在怎么用">
        <p className="empty">线上版 Wiki 先放在 Supabase：资料摘要、链接、文件记录和批准后的规则都可以在线查看。Obsidian 本地 vault 暂时不再作为线上写入目标。</p>
        <div className="hint-list">
          <span>适合进 Wiki：SOP、客户背景、长期规则、复盘、资料摘要。</span>
          <span>适合进 Supabase 正式表：账目、任务、状态、动态、进度。</span>
          <span>上传文件/图片时，系统会先记录 capture 和附件摘要。</span>
        </div>
      </Panel>
      <Panel title="候选 Skill">
        <p className="empty">这里不是预置技能列表。只有当你连续纠正同一类习惯 3 次后，才会出现“待批准”的候选 skill。</p>
        <div className="list">
          {candidates.length === 0 && <p className="empty">还没有候选 skill。</p>}
          {candidates.map(item => <div className={`candidate-card ${item.status}`} key={item.id}><strong>{item.title}</strong><p>{item.ruleText}</p><small>{item.status} · evidence {item.evidenceCount}</small></div>)}
        </div>
      </Panel>
      <Panel title="连接状态"><p className="empty">{connectionNote}</p></Panel>
    </section>
  );
}

function SettingsPage({ connectionNote, onLock }: { connectionNote: string; onLock: () => void }) {
  return (
    <section className="settings-grid">
      <Panel title="线上模式">
        <div className="hint-list">
          <span>Telegram：已移出主流程</span>
          <span>OpenClaw：线上版不依赖本机 gateway</span>
          <span>语音：第一版用手机系统听写，不做服务端 STT</span>
          <span>模型：Vercel API 读取 FOUNDER_AI_MODEL / FOUNDER_NVIDIA_API_KEY</span>
        </div>
      </Panel>
      <Panel title="连接状态"><p className="empty">{connectionNote}</p></Panel>
      <Panel title="安全"><button className="secondary-button" type="button" onClick={onLock}>清除本机密码并锁定</button></Panel>
    </section>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) { return <section className="panel"><h2>{title}</h2>{children}</section>; }
function Metric({ label, value, tone }: { label: string; value: string; tone: 'good' | 'warn' }) { return <div className={`metric ${tone}`}><span>{label}</span><strong>{value}</strong></div>; }

function buildTree(items: Work[]): Node[] {
  const byParent = new Map<string, Work[]>();
  const roots: Work[] = [];
  const itemIds = new Set(items.map(item => item.id));
  for (const item of items) {
    if (item.parentId && itemIds.has(item.parentId)) {
      const group = byParent.get(item.parentId) || [];
      group.push(item);
      byParent.set(item.parentId, group);
    } else roots.push(item);
  }
  const build = (item: Work): Node => {
    const children = (byParent.get(item.id) || []).sort(sortItems).map(build);
    const progress = children.length ? Math.round(children.reduce((sum, child) => sum + child.progress, 0) / children.length) : leaf(item.status);
    return { item, children, progress };
  };
  return inferProjectGroups(roots.sort(sortItems).map(build));
}

function sortItems(a: Work, b: Work) { return a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt); }
function leaf(status: Status) { if (status === 'done') return 100; if (status === 'doing') return 50; return 0; }

function reorderWorkItems(items: Work[], draggedId: string, targetId: string, position: DropPosition): { ok: true; items: Work[] } | { ok: false; error: string } {
  const dragged = items.find(item => item.id === draggedId);
  const target = items.find(item => item.id === targetId);
  if (!dragged || !target) return { ok: false, error: '找不到要拖动的任务。' };

  const newParentId = position === 'child' ? target.id : target.parentId;
  if (newParentId === dragged.id || isDescendant(items, newParentId, dragged.id)) {
    return { ok: false, error: '不能把父任务拖进自己的子任务里。' };
  }

  const next = items.map(item => ({ ...item }));
  const moved = next.find(item => item.id === draggedId);
  if (!moved) return { ok: false, error: '找不到要拖动的任务。' };
  moved.parentId = newParentId;

  const affectedParents = new Set<string | undefined>([dragged.parentId, newParentId]);
  for (const parentId of affectedParents) {
    const siblings = next
      .filter(item => item.id !== draggedId && item.parentId === parentId)
      .sort(sortItems);
    if (parentId === newParentId) {
      const targetIndex = siblings.findIndex(item => item.id === targetId);
      const insertAt = position === 'child'
        ? siblings.length
        : targetIndex < 0
          ? siblings.length
          : targetIndex + (position === 'after' ? 1 : 0);
      siblings.splice(insertAt, 0, moved);
    }
    siblings.forEach((item, index) => { item.sortOrder = index + 1; });
  }

  return { ok: true, items: next };
}

function isDescendant(items: Work[], possibleChildId: string | undefined, possibleParentId: string) {
  let currentId = possibleChildId;
  while (currentId) {
    if (currentId === possibleParentId) return true;
    currentId = items.find(item => item.id === currentId)?.parentId;
  }
  return false;
}

function inferProjectGroups(nodes: Node[]): Node[] {
  const grouped = new Map<string, Node[]>();
  const ungrouped: Node[] = [];
  for (const node of nodes) {
    const prefix = inferProjectPrefix(node.item.title);
    if (!prefix) { ungrouped.push(node); continue; }
    const group = grouped.get(prefix) || [];
    group.push(node);
    grouped.set(prefix, group);
  }
  const inferredGroups: Node[] = [];
  for (const [prefix, children] of grouped) {
    if (children.length < 2 || children.some(child => child.item.title.trim().toLowerCase() === prefix.toLowerCase())) { ungrouped.push(...children); continue; }
    const progress = Math.round(children.reduce((sum, child) => sum + child.progress, 0) / children.length);
    inferredGroups.push({ inferred: true, progress, children, item: { id: `inferred-${prefix}`, itemType: 'task', title: prefix, priority: 'medium', status: progress >= 100 ? 'done' : progress > 0 ? 'doing' : 'todo', tags: [], sortOrder: Math.min(...children.map(child => child.item.sortOrder)), createdBy: children[0].item.createdBy, createdAt: children[0].item.createdAt } });
  }
  return [...inferredGroups, ...ungrouped].sort((a, b) => sortItems(a.item, b.item));
}

function inferProjectPrefix(title: string) {
  const firstToken = title.trim().split(/\s+/)[0];
  if (!firstToken || firstToken.length < 3) return undefined;
  if (/^(task|todo|idea|step)$/i.test(firstToken)) return undefined;
  return firstToken;
}

function getNote(item: Work) { return item.tags.find(tag => tag.startsWith('note:'))?.slice(5) || ''; }
function setNoteTag(tags: string[], note: string) { return [...tags.filter(tag => !tag.startsWith('note:')), ...(note.trim() ? [`note:${note.trim()}`] : [])]; }

async function readAttachment(file: File): Promise<CaptureAttachment> {
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return { name: file.name, type: file.type || 'application/octet-stream', size: file.size, data };
}
