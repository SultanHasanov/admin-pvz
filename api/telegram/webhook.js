import { db, decryptToken, safeEqual, secretHash, telegram } from '../_telegram.js'

const keyboard = { keyboard: [[{text:'➕ Удержание'},{text:'➕ Расход'}],[{text:'👥 Сотрудники'},{text:'📅 Смены'}],[{text:'🔄 Главное меню'}]], resize_keyboard:true }
const money = text => { const value=Number(String(text).replace(',','.').replace(/\s/g,'')); return Number.isFinite(value)&&value>0?Math.round(value*100):null }

async function integrationContext(req) {
  const id=String(req.query?.integration || '')
  if(!/^[0-9a-f-]{36}$/i.test(id)) return null
  const integrations=await db(`telegram_integrations?id=eq.${encodeURIComponent(id)}&status=eq.CONNECTED&select=id,organization_id`)
  const integration=integrations[0]
  if(!integration) return null
  const secrets=await db(`telegram_bot_secrets?integration_id=eq.${encodeURIComponent(id)}&select=encrypted_bot_token,webhook_secret_hash`)
  const stored=secrets[0], received=String(req.headers['x-telegram-bot-api-secret-token'] || '')
  if(!stored || !received || !safeEqual(stored.webhook_secret_hash,secretHash(received))) return null
  return {...integration,botToken:decryptToken(stored.encrypted_bot_token)}
}

async function getChat(integrationId,chatId){const rows=await db(`telegram_chats?integration_id=eq.${integrationId}&telegram_chat_id=eq.${chatId}&active=eq.true&select=*`);return rows[0]||null}
async function setState(id,state){await db(`telegram_chats?id=eq.${id}`,{method:'PATCH',body:JSON.stringify({state,updated_at:new Date().toISOString()}),prefer:'return=minimal'})}
async function send(token,chatId,text){return telegram(token,'sendMessage',{chat_id:chatId,text,reply_markup:keyboard})}
async function linkChat(context,chatId,userId,code){
  const rows=await db(`telegram_pairing_codes?integration_id=eq.${context.id}&code=eq.${encodeURIComponent(code)}&used_at=is.null&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=*`)
  const pair=rows[0];if(!pair)return false
  await db('telegram_chats',{method:'POST',body:JSON.stringify({organization_id:context.organization_id,integration_id:context.id,user_id:pair.user_id,telegram_chat_id:chatId,telegram_user_id:userId,role:'OWNER',state:{step:'idle'}}),prefer:'resolution=merge-duplicates,return=minimal'})
  await db(`telegram_pairing_codes?id=eq.${pair.id}`,{method:'PATCH',body:JSON.stringify({used_at:new Date().toISOString()}),prefer:'return=minimal'})
  return true
}

async function handleConnected(context,chat,text){
  const state=chat.state||{step:'idle'}, reply=value=>send(context.botToken,chat.telegram_chat_id,value)
  if(text==='🔄 Главное меню'||text==='/start'){await setState(chat.id,{step:'idle'});return reply('Выберите действие.')}
  if(text==='➕ Удержание'){await setState(chat.id,{step:'deduction_amount'});return reply('Введите сумму удержания в рублях.')}
  if(text==='➕ Расход'){await setState(chat.id,{step:'expense_amount'});return reply('Введите сумму расхода в рублях.')}
  if(text==='👥 Сотрудники'){const rows=await db(`employees?organization_id=eq.${chat.organization_id}&status=eq.ACTIVE&select=full_name&order=full_name`);return reply(rows.length?`Сотрудники:\n${rows.map(x=>`• ${x.full_name}`).join('\n')}`:'Сотрудников пока нет. Добавьте их в админке.')}
  if(text==='📅 Смены'){const rows=await db(`shifts?organization_id=eq.${chat.organization_id}&planned_start=gte.${encodeURIComponent(new Date().toISOString())}&select=planned_start,employees(full_name)&order=planned_start&limit=5`);return reply(rows.length?`Ближайшие смены:\n${rows.map(x=>`• ${new Date(x.planned_start).toLocaleString('ru-RU')} — ${x.employees?.full_name||'сотрудник'}`).join('\n')}`:'Ближайших смен нет.')}
  if(state.step==='deduction_amount'){const amount=money(text);if(!amount)return reply('Введите сумму числом, например: 3730');await setState(chat.id,{step:'deduction_reason',amount});return reply('Напишите причину удержания.')}
  if(state.step==='deduction_reason'){await db('wb_deductions',{method:'POST',body:JSON.stringify({organization_id:chat.organization_id,amount_kopecks:state.amount,reason:text,status:'NEW'}),prefer:'return=minimal'});await setState(chat.id,{step:'idle'});return reply(`Удержание ${state.amount/100} ₽ добавлено. Причина: ${text}`)}
  if(state.step==='expense_amount'){const amount=money(text);if(!amount)return reply('Введите сумму числом, например: 1200');await setState(chat.id,{step:'expense_category',amount});return reply('Напишите категорию расхода, например: Расходники.')}
  if(state.step==='expense_category'){const categories=await db(`expense_categories?organization_id=eq.${chat.organization_id}&name=eq.${encodeURIComponent(text)}&select=id`);let categoryId=categories[0]?.id;if(!categoryId){const created=await db('expense_categories',{method:'POST',body:JSON.stringify({organization_id:chat.organization_id,name:text})});categoryId=created[0].id}await db('expense_entries',{method:'POST',body:JSON.stringify({organization_id:chat.organization_id,category_id:categoryId,date:new Date().toISOString().slice(0,10),amount_kopecks:state.amount}),prefer:'return=minimal'});await setState(chat.id,{step:'idle'});return reply(`Расход ${state.amount/100} ₽ добавлен в категорию «${text}».`)}
  return reply('Нажмите кнопку нужного действия.')
}

export default async function handler(req,res){
  if(req.method==='GET')return res.status(200).json({ok:true,service:'pvz-control-telegram',mode:'organization-bots'})
  if(req.method!=='POST')return res.status(405).end()
  try{
    const context=await integrationContext(req);if(!context)return res.status(401).end()
    const message=req.body?.message;if(!message?.chat?.id||!message?.from?.id)return res.status(200).json({ok:true})
    const text=String(message.text||'').trim(),match=text.match(/^\/start\s+([A-Z0-9]{8})$/i)
    if(match){const linked=await linkChat(context,message.chat.id,message.from.id,match[1].toUpperCase());await send(context.botToken,message.chat.id,linked?'PVZ Control подключён. Выберите действие.':'Код подключения недействителен или истёк. Создайте новый в админке.');return res.status(200).json({ok:true})}
    const chat=await getChat(context.id,message.chat.id)
    if(!chat){await send(context.botToken,message.chat.id,'Сначала создайте код подключения в админке и отправьте /start КОД.');return res.status(200).json({ok:true})}
    await handleConnected(context,chat,text);return res.status(200).json({ok:true})
  }catch(error){console.error('telegram webhook',error.message);return res.status(500).json({error:'Webhook failed'})}
}
