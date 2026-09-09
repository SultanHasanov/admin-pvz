const TELEGRAM_API = 'https://api.telegram.org';

function config() {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!botToken || !url || !serviceKey) throw new Error('Telegram or Supabase server environment variables are missing');
  return { botToken, url: url.replace(/\/$/, ''), serviceKey };
}
async function db(path, options = {}) {
  const { url, serviceKey } = config();
  const response = await fetch(`${url}/rest/v1/${path}`, { ...options, headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json', Prefer: options.prefer || 'return=representation', ...(options.headers || {}) } });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}
async function telegram(method, body) { const { botToken } = config(); const r = await fetch(`${TELEGRAM_API}/bot${botToken}/${method}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) }); if (!r.ok) throw new Error(`Telegram ${r.status}`); return r.json(); }
const keyboard = { keyboard: [[{text:'➕ Удержание'},{text:'➕ Расход'}],[{text:'👥 Сотрудники'},{text:'📅 Смены'}],[{text:'🔄 Главное меню'}]], resize_keyboard:true };
const money = text => { const value = Number(String(text).replace(',','.').replace(/\s/g,'')); return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : null; };
async function send(chatId, text) { return telegram('sendMessage', { chat_id:chatId, text, reply_markup:keyboard }); }
async function getChat(chatId) { const rows = await db(`telegram_chats?telegram_chat_id=eq.${chatId}&active=eq.true&select=*`); return rows[0] || null; }
async function setState(id, state) { await db(`telegram_chats?id=eq.${id}`, { method:'PATCH', body:JSON.stringify({ state, updated_at:new Date().toISOString() }), prefer:'return=minimal' }); }
async function linkChat(chatId, userId, code) {
  const rows = await db(`telegram_pairing_codes?code=eq.${encodeURIComponent(code)}&used_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=*`);
  const pair = rows[0]; if (!pair) return false;
  await db('telegram_chats', { method:'POST', body:JSON.stringify({ organization_id:pair.organization_id, user_id:pair.user_id, telegram_chat_id:chatId, telegram_user_id:userId, state:{step:'idle'} }), prefer:'resolution=merge-duplicates,return=minimal' });
  await db(`telegram_pairing_codes?id=eq.${pair.id}`, { method:'PATCH', body:JSON.stringify({ used_at:new Date().toISOString() }), prefer:'return=minimal' });
  return true;
}
async function handleConnected(chat, text) {
  const state = chat.state || { step:'idle' };
  if (text === '🔄 Главное меню' || text === '/start') { await setState(chat.id,{step:'idle'}); return send(chat.telegram_chat_id,'Выберите действие.'); }
  if (text === '➕ Удержание') { await setState(chat.id,{step:'deduction_amount'}); return send(chat.telegram_chat_id,'Введите сумму удержания в рублях.'); }
  if (text === '➕ Расход') { await setState(chat.id,{step:'expense_amount'}); return send(chat.telegram_chat_id,'Введите сумму расхода в рублях.'); }
  if (text === '👥 Сотрудники') { const rows=await db(`employees?organization_id=eq.${chat.organization_id}&status=eq.ACTIVE&select=full_name&order=full_name`); return send(chat.telegram_chat_id, rows.length ? `Сотрудники:\n${rows.map(x=>`• ${x.full_name}`).join('\n')}` : 'Сотрудников пока нет. Добавьте их в админке.'); }
  if (text === '📅 Смены') { const rows=await db(`shifts?organization_id=eq.${chat.organization_id}&planned_start=gte.${encodeURIComponent(new Date().toISOString())}&select=planned_start,employees(full_name),pickup_points(name)&order=planned_start&limit=5`); return send(chat.telegram_chat_id, rows.length ? `Ближайшие смены:\n${rows.map(x=>`• ${new Date(x.planned_start).toLocaleString('ru-RU')} — ${x.employees?.full_name || 'сотрудник'}`).join('\n')}` : 'Ближайших смен нет.'); }
  if (state.step === 'deduction_amount') { const amount=money(text); if(!amount) return send(chat.telegram_chat_id,'Введите сумму числом, например: 3730'); await setState(chat.id,{step:'deduction_reason',amount}); return send(chat.telegram_chat_id,'Напишите причину удержания.'); }
  if (state.step === 'deduction_reason') { await db('wb_deductions',{method:'POST',body:JSON.stringify({organization_id:chat.organization_id,amount_kopecks:state.amount,reason:text,status:'NEW'}),prefer:'return=minimal'}); await setState(chat.id,{step:'idle'}); return send(chat.telegram_chat_id,`Удержание ${state.amount/100} ₽ добавлено. Причина: ${text}`); }
  if (state.step === 'expense_amount') { const amount=money(text); if(!amount) return send(chat.telegram_chat_id,'Введите сумму числом, например: 1200'); await setState(chat.id,{step:'expense_category',amount}); return send(chat.telegram_chat_id,'Напишите категорию расхода, например: Расходники.'); }
  if (state.step === 'expense_category') { const categories=await db(`expense_categories?organization_id=eq.${chat.organization_id}&name=eq.${encodeURIComponent(text)}&select=id`); let categoryId=categories[0]?.id; if(!categoryId){const created=await db('expense_categories',{method:'POST',body:JSON.stringify({organization_id:chat.organization_id,name:text}),prefer:'return=representation'});categoryId=created[0].id;} await db('expense_entries',{method:'POST',body:JSON.stringify({organization_id:chat.organization_id,category_id:categoryId,date:new Date().toISOString().slice(0,10),amount_kopecks:state.amount}),prefer:'return=minimal'}); await setState(chat.id,{step:'idle'}); return send(chat.telegram_chat_id,`Расход ${state.amount/100} ₽ добавлен в категорию «${text}».`); }
  return send(chat.telegram_chat_id,'Нажмите кнопку нужного действия.');
}
export default async function handler(req, res) {
  if(req.method === 'GET') return res.status(200).json({ok:true,service:'pvz-control-telegram'});
  if(req.method !== 'POST') return res.status(405).end();
  try { const secret=process.env.TELEGRAM_WEBHOOK_SECRET; if(secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) return res.status(401).end(); const message=req.body?.message; if(!message?.chat?.id || !message?.from?.id) return res.status(200).json({ok:true}); const text=String(message.text||'').trim(); const match=text.match(/^\/start\s+([A-Z0-9]{8})$/i); if(match){const linked=await linkChat(message.chat.id,message.from.id,match[1].toUpperCase()); await send(message.chat.id,linked?'PVZ Control подключён. Выберите действие.':'Код подключения недействителен или истёк. Создайте новый в админке.'); return res.status(200).json({ok:true});} const chat=await getChat(message.chat.id); if(!chat){await send(message.chat.id,'Сначала подключите организацию: в админке создайте код подключения и отправьте боту /start КОД.'); return res.status(200).json({ok:true});} await handleConnected(chat,text); return res.status(200).json({ok:true}); } catch(error){ console.error('telegram webhook',error.message); return res.status(500).json({error:'Webhook failed'}); }
}
