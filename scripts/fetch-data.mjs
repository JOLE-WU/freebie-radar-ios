/**
 * 抓取 freebie-radar 演示站的公开真实数据，生成 docs/data.json
 * 由 GitHub Actions 每小时定时运行。数据源：radar.zichuanlan.top 公开只读 API。
 */
import { writeFileSync, readFileSync } from 'node:fs';

const BASE = 'https://radar.zichuanlan.top';
// 演示站官方「已验证真福利」预设：AI 验真 + 未过期 + 7天内 + 免费/有条件
const FEED_URL = `${BASE}/api/items?preset=verified&unexpired=1&aiOnly=1&kind=freebie&obtain=free,conditional&maxAgeDays=7&sort=newest&limit=100`;
const STATS_URL = `${BASE}/api/stats`;

// source_id / category -> 品牌 logo key（对应前端 BRAND）
const LOGO_BY_SOURCE = {
  'epic-free':'epic', 'epic':'epic', 'steam-free':'epic', 'gamerpower':'epic',
  'linuxdo-welfare':'kuma', 'linuxdo-develop':'kuma', 'linuxdo':'kuma',
  'rss-nodeseek':'racknerd', 'rss-nodeloc':'racknerd', 'nodeseek':'racknerd',
  'zhihu-search':'llm', 'xhs-search':'netease', 'bili-freebies':'bili',
  'tg-cn-deals':'cloudpc', 'rss-smzdm':'adguard', 'nga-trade':'kb'
};
const LOGO_BY_CAT = {
  game:'epic', ai:'llm', vps:'racknerd', opensource:'kuma',
  software:'adguard', media:'bili', hardware:'kb', cloud:'cloudpc'
};
// 分类英文 -> 中文
const CAT_ZH = {
  game:'游戏', ai:'AI 额度', vps:'VPS/主机', opensource:'开源软件', software:'软件授权',
  media:'影音会员', hardware:'硬件/数码', cloud:'云服务', trade:'优惠好价', tech:'科技',
  edu:'网课教程', domain:'域名/建站', goods:'实物福利', finance:'金融', stock:'证券',
  design:'设计资源', news:'新闻资讯', world:'资讯', other:'综合', carpool:'出行',
  pan:'网盘资源', info:'资讯', dev:'开发者工具', 'dev-tools':'开发者工具', github:'开源项目'
};
// obtain -> App 分级
const OBTAIN = { free:'free', conditional:'cond', cond:'cond', trial:'trial', lottery:'lottery', paid:'paid' };

function logoOf(it){
  return LOGO_BY_SOURCE[it.source_id] || LOGO_BY_CAT[it.category] || 'kuma';
}
function agoOf(iso){
  if(!iso) return '近期';
  const diff = Date.now() - new Date(iso).getTime();
  if(isNaN(diff)) return '近期';
  const m = Math.floor(diff/60000);
  if(m<1) return '刚刚';
  if(m<60) return m+' 分钟前';
  const h = Math.floor(m/60);
  if(h<24) return h+' 小时前';
  const d = Math.floor(h/24);
  return d+' 天前';
}
function deadlineOf(iso){
  if(!iso) return '长期有效';
  const diff = new Date(iso).getTime() - Date.now();
  if(isNaN(diff)) return '长期有效';
  const d = Math.ceil(diff/86400000);
  if(d<=0) return '即将截止';
  if(d<30) return d+' 天后截止';
  const dt = new Date(iso);
  return `${dt.getMonth()+1} 月 ${dt.getDate()} 日`;
}
function srcName(sid){
  const m = {
    'epic-free':'Epic Games','rss-nodeseek':'NodeSeek','rss-nodeloc':'NodeLoc',
    'zhihu-search':'知乎','xhs-search':'小红书','linuxdo-welfare':'LINUX DO',
    'linuxdo-develop':'LINUX DO','rss-smzdm':'什么值得买','nga-trade':'NGA',
    'tg-cn-deals':'Telegram','bili-freebies':'哔哩哔哩'
  };
  return m[sid] || sid || '聚合源';
}

async function getJSON(url){
  const r = await fetch(url, { headers:{ accept:'application/json' } });
  if(!r.ok) throw new Error(`请求失败 ${r.status}: ${url}`);
  return r.json();
}

/* ---------- 正文抓取：为 App 内阅读器提供原文快照 ---------- */
function stripTags(html){
  return html
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&')
    .replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'")
    .replace(/\s+/g,' ').trim();
}
function extractArticle(html){
  // 优先取 article / main 等正文容器
  const blocks = [
    /<article\b[^>]*>([\s\S]*?)<\/article>/i,
    /<main\b[^>]*>([\s\S]*?)<\/main>/i,
    /<div[^>]*class=["'][^"']*(?:content|post|article|entry|detail)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
  ];
  for(const re of blocks){
    const m = html.match(re);
    if(m){ const t = stripTags(m[1]); if(t.length>120) return t; }
  }
  // 退而求其次：og:description / description
  const meta = html.match(/<meta[^>]+(?:property=["']og:description["']|name=["']description["'])[^>]*content=["']([^"']{20,})["']/i)
            || html.match(/<meta[^>]+content=["']([^"']{20,})["'][^>]*(?:property=["']og:description["']|name=["']description["'])/i);
  if(meta) return stripTags(meta[1]);
  return '';
}
async function fetchArticle(url, timeout=9000){
  if(!/^https?:\/\//.test(url)) return '';
  const ctrl = new AbortController();
  const timer = setTimeout(()=>ctrl.abort(), timeout);
  try{
    const r = await fetch(url, {
      signal: ctrl.signal, redirect:'follow',
      headers:{
        'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept-Language':'zh-CN,zh;q=0.9'
      }
    });
    if(!r.ok) return '';
    const ct = r.headers.get('content-type') || '';
    if(!/text\/html/i.test(ct)) return '';
    const html = (await r.text()).slice(0,900000);
    return extractArticle(html).slice(0,6000);
  }catch(e){ return ''; }
  finally{ clearTimeout(timer); }
}

async function main(){
  console.log('抓取真实数据…');
  const [feed, stats] = await Promise.all([
    getJSON(FEED_URL),
    getJSON(STATS_URL).catch(()=>({}))
  ]);
  const raw = feed.items || [];
  console.log(`拿到 ${raw.length} 条真福利（库中共 ${feed.total} 条）`);

  // 过滤明显失效的条目（标题含「已无」「已失效」「已结束」）
  const valid = raw.filter(it => !/已无|已失效|已结束|已过期/.test(it.title || ''));
  console.log(`过滤失效条目后剩 ${valid.length} 条`);

  // 复用上一版已抓取的正文，避免每小时全部重抓
  let articleCache = {};
  try{
    const prev = JSON.parse(readFileSync(new URL('../docs/data.json', import.meta.url), 'utf8'));
    for(const x of (prev.items||[])) if(x.article) articleCache[x.id] = x.article;
  }catch(e){ console.log('暂无历史正文缓存，将首次抓取'); }
  console.log(`历史正文缓存 ${Object.keys(articleCache).length} 条`);

  const items = valid.map((it, idx)=>{
    const ai = it.ai || {};
    const codes = it.codes || [];
    return {
      id: String(it.id),
      t: it.title || ' untitled',
      src: it.author || srcName(it.source_id),
      cat: CAT_ZH[it.category] || it.category || '综合',
      obtain: OBTAIN[it.obtain] || 'free',
      score: it.score || ai.quality*20 || 70,
      ago: agoOf(it.published_at || it.last_seen_at),
      deadline: deadlineOf(it.expires_at),
      sources: Math.max(1, it.dupCount || 1),
      logo: logoOf(it),
      image: it.image_url || '',
      code: codes.length ? (typeof codes[0]==='string' ? codes[0] : (codes[0].code||'')) : '',
      url: it.url || '',
      article: articleCache[String(it.id)] || '',
      desc: (it.summary || '').slice(0,160) || (ai.reason || '来自公开信息源，AI 已验证真实性。'),
      verdict: ai.reason ? `AI 已验真：${ai.reason}。评分 ${it.score||'—'}，来源 ${it.dupCount||1} 处同步。` : 'AI 已验真：来自公开信息源，多重来源确认。'
    };
  });

  const t = stats.totals || {};
  const data = {
    updated: new Date().toISOString(),
    source: BASE,
    stats: {
      added24h: t.last24h || 0,
      withCodes: t.withCodes || 0,
      filtered: t.aiRejected || 0,
      total: t.total || feed.total || 0,
      active: t.active || 0
    },
    items,
    // 精选：取评分最高的若干条
    picks: [...items].sort((a,b)=>b.score-a.score).slice(0,8).map(x=>[
      x.t, x.verdict, x.logo||x.id, x.id
    ])
  };

  // 补抓缺失正文（最多 30 条，5 并发，避免拖慢每小时任务 / 触发反爬）
  const missing = items.filter(x=>!x.article && /^https?:\/\//.test(x.url)).slice(0,30);
  if(missing.length){
    console.log(`补抓 ${missing.length} 条原文正文…`);
    let cursor = 0, ok = 0;
    async function worker(){
      while(cursor < missing.length){
        const item = missing[cursor++];
        const art = await fetchArticle(item.url);
        if(art){ item.article = art; ok++; }
      }
    }
    await Promise.all(Array.from({length:5}, worker));
    console.log(`正文抓取成功 ${ok}/${missing.length} 条`);
  }

  writeFileSync(new URL('../docs/data.json', import.meta.url), JSON.stringify(data, null, 2));
  console.log(`已生成 docs/data.json：${items.length} 条真福利，更新时间 ${data.updated}`);
}

main().catch(e=>{ console.error('抓取失败:', e); process.exit(1); });
