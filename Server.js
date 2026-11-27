// server.js - VIP Fleming Premium - BOT AUTOMATIC
// Paybill 714888 / Account 467034

const express = require('express');
const app = express();
app.use(express.json());
app.use(express.static('.'));

let users = [];
let SETTINGS = { botToken: process.env.BOT_TOKEN || "", channelId: process.env.CHANNEL_ID || "" };

async function tg(token, method, body){
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body)});
  return await r.json();
}

app.get('/api/users', (req,res)=> res.json({users}));
app.post('/api/settings', (req,res)=>{ SETTINGS={...SETTINGS, ...req.body}; res.json({ok:true}); });
app.post('/api/clear', (req,res)=>{ users=[]; res.json({ok:true}); });

app.post('/api/test-bot', async (req,res)=>{
  try{ const d = await tg(req.body.token, 'getMe', {}); res.json(d); }catch(e){ res.json({ok:false, error:e.message}); }
});

app.post('/api/submit', (req,res)=>{
  const u = {id:Date.now(), ...req.body, status:'pending', createdAt:new Date().toLocaleString(), expiresAt:'', inviteLink:''};
  users.unshift(u);
  res.json({ok:true, user:u});
});

app.post('/api/reject', (req,res)=>{ users = users.filter(u=>u.id!==req.body.id); res.json({ok:true}); });

// APPROVE - BOT creates 1-use Invite Link
app.post('/api/approve', async (req,res)=>{
  const {id, token, channelId} = req.body;
  const u = users.find(x=>x.id===id);
  if(!u) return res.json({ok:false, error:'User not found'});
  const expires = new Date(); expires.setDate(expires.getDate() + u.days);
  u.expiresAt = expires.toLocaleString();
  u.status = 'active';
  // BOT creates invite link - 1 use, expires in 24h
  const d = await tg(token, 'createChatInviteLink', {
    chat_id: channelId,
    name: `${u.name} - ${u.plan}`,
    member_limit: 1,
    expire_date: Math.floor(Date.now()/1000) + 86400
  });
  if(!d.ok) return res.json({ok:false, error:d.description});
  u.inviteLink = d.result.invite_link;
  res.json({ok:true, expiresAt:u.expiresAt, inviteLink:u.inviteLink});
});

app.post('/api/renew', async (req,res)=>{
  const {id, token, channelId} = req.body;
  const u = users.find(x=>x.id===id);
  const expires = new Date(); expires.setDate(expires.getDate() + u.days);
  u.expiresAt = expires.toLocaleString(); u.status='active';
  const d = await tg(token, 'createChatInviteLink', {chat_id: channelId, name:`${u.name} - RENEW ${u.plan}`, member_limit:1, expire_date: Math.floor(Date.now()/1000)+86400});
  if(d.ok) u.inviteLink = d.result.invite_link;
  res.json({ok:true, expiresAt:u.expiresAt, inviteLink:u.inviteLink});
});

// REMOVE - BOT bans then unbans so they can re-join later
async function removeFromTelegram(u, token, channelId){
  if(!u.tgId) return {ok:false, error:'No Telegram ID'};
  await tg(token, 'banChatMember', {chat_id: channelId, user_id: Number(u.tgId)});
  await tg(token, 'unbanChatMember', {chat_id: channelId, user_id: Number(u.tgId), only_if_banned:true});
  return {ok:true};
}

app.post('/api/remove-user', async (req,res)=>{
  const {id, token, channelId} = req.body;
  const u = users.find(x=>x.id===id);
  if(u){ u.status='expired'; await removeFromTelegram(u, token, channelId); }
  res.json({ok:true});
});

// AUTO CHECK EXPIRY - Runs every minute + when Admin clicks Check
app.post('/api/check-expiry', async (req,res)=>{
  const {token, channelId} = req.body;
  const now = new Date();
  let removed = 0;
  for(let u of users){
    if(u.status==='active' && u.expiresAt && new Date(u.expiresAt) < now){
      u.status='expired';
      await removeFromTelegram(u, token || SETTINGS.botToken, channelId || SETTINGS.channelId);
      removed++;
      console.log(`Removed expired: ${u.name} ${u.telegram}`);
    }
  }
  res.json({ok:true, removed});
});

// Auto check every 60 seconds - BOT removes expired by itself
setInterval(async ()=>{
  if(!SETTINGS.botToken || !SETTINGS.channelId) return;
  const now = new Date();
  for(let u of users){
    if(u.status==='active' && u.expiresAt && new Date(u.expiresAt) < now){
      u.status='expired';
      await removeFromTelegram(u, SETTINGS.botToken, SETTINGS.channelId);
      console.log(`AUTO REMOVED: ${u.name}`);
    }
  }
}, 60000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=> console.log(`✅ VIP Fleming Premium BOT running on ${PORT}`));
