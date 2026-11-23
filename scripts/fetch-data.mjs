/**
 * 抓取 freebie-radar 演示站的公开真实数据，生成 docs/data.json
 * 由 GitHub Actions 每小时定时运行。数据源：radar.zichuanlan.top 公开只读 API。
 */
import { writeFileSync } from 'node:fs';

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

  writeFileSync(new URL('../docs/data.json', import.meta.url), JSON.stringify(data, null, 2));
  console.log(`已生成 docs/data.json：${items.length} 条真福利，更新时间 ${data.updated}`);
}

main().catch(e=>{ console.error('抓取失败:', e); process.exit(1); });
