import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Storefront Instagram widget — the full section, served as one script.
 *
 * The storefront used to carry a hand-written copy of the grid, which meant the
 * studio at /studio/instagram-widget and the live site drifted apart the moment
 * either changed. This serves the whole widget from here instead, the same way
 * /accessibility/widget is served, so the shop embeds one <script> and the
 * markup lives in a single place.
 *
 * Styling is deliberately NOT the studio's CSS module. Those class names are
 * generic — .tile, .banner, .stat, .root — and injecting them globally into a
 * Shopify theme would collide with the theme's own rules. Everything here is
 * prefixed `cig-` so the widget cannot affect the page around it, or be
 * affected by it.
 *
 * Data comes from /api/public/instagram-feed, which caches Meta for 15 minutes
 * and serves everyone from that cache — shopper traffic can never exhaust a
 * quota, which is what took the previous third-party widget offline.
 */

const CSS = `
.cig-root{--cig-fg:#111;--cig-muted:#8e8e8e;--cig-line:#dbdbdb;--cig-blue:#0095f6;
  font-family:inherit;color:var(--cig-fg);box-sizing:border-box}
.cig-root *,.cig-root *::before,.cig-root *::after{box-sizing:border-box}

/* ---------- profile header ---------- */
.cig-bar{display:flex;align-items:center;justify-content:center;gap:22px;padding:4px 0 18px;flex-wrap:wrap}
.cig-avatar{width:56px;height:56px;border-radius:50%;padding:2px;flex:0 0 auto;
  background:linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)}
.cig-avatar img{width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;border:2px solid #fff;background:#fff}
.cig-id{display:flex;flex-direction:column;line-height:1.25}
.cig-name{font-weight:700;font-size:15px}
.cig-handle{font-size:14px;color:var(--cig-muted)}
.cig-stats{display:flex;gap:22px}
.cig-stat{display:flex;flex-direction:column;align-items:center;line-height:1.25}
.cig-statv{font-weight:700;font-size:15px}
.cig-statl{font-size:13px;color:var(--cig-muted)}
.cig-follow{display:inline-flex;align-items:center;gap:8px;background:var(--cig-blue);color:#fff;
  font-weight:600;font-size:14px;text-decoration:none;padding:9px 16px;border-radius:8px;line-height:1}
.cig-follow:hover{filter:brightness(.95)}
.cig-follow svg{width:16px;height:16px;fill:currentColor}

/* ---------- hero + tiles ---------- */
.cig-media{display:flex;gap:10px;align-items:stretch}
.cig-hero{position:relative;flex:1 1 50%;min-width:0;overflow:hidden}
.cig-hero img,.cig-hero video{width:100%;height:100%;object-fit:cover;display:block}
.cig-heroLink{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center}
.cig-heroLink a{color:#fff;font-weight:600;font-size:28px;text-decoration:none;text-shadow:0 1px 6px rgba(0,0,0,.45)}
.cig-tilesCell{position:relative;flex:1 1 50%;min-width:0}
.cig-viewport{overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-ms-overflow-style:none;scroll-behavior:smooth}
.cig-viewport::-webkit-scrollbar{display:none}
.cig-strip{display:flex;gap:10px}
.cig-col{display:flex;flex-direction:column;gap:10px;flex:0 0 auto}

.cig-tile{position:relative;display:block;padding:0;border:0;background:#f2f2f2;cursor:pointer;overflow:hidden}
.cig-tile img{width:100%;height:100%;object-fit:cover;display:block}

/* multi-post marker: only rendered for carousels */
.cig-badge{position:absolute;top:8px;right:8px;width:18px;height:18px;pointer-events:none;
  filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))}
.cig-badge svg{width:100%;height:100%;display:block;fill:#fff}

/* hover: dimmed image with the like / comment counts, as Instagram shows */
.cig-hover{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:20px;
  background:rgba(0,0,0,.35);opacity:0;transition:opacity .18s ease;color:#fff;font-weight:600;font-size:14px}
.cig-tile:hover .cig-hover,.cig-tile:focus-visible .cig-hover{opacity:1}
.cig-hstat{display:inline-flex;align-items:center;gap:6px}
.cig-hstat svg{width:19px;height:19px;fill:#fff}

.cig-arrow{position:absolute;top:50%;transform:translateY(-50%);width:34px;height:34px;border-radius:50%;
  border:0;background:rgba(255,255,255,.94);box-shadow:0 1px 6px rgba(0,0,0,.25);cursor:pointer;
  display:flex;align-items:center;justify-content:center;z-index:2}
.cig-arrow[hidden]{display:none}
.cig-arrow svg{width:15px;height:15px;fill:#333}
.cig-arrow[data-side="prev"]{left:-14px}
.cig-arrow[data-side="next"]{right:-14px}

@media (max-width:900px){
  .cig-media{flex-direction:column}
  .cig-hero,.cig-tilesCell{flex:1 1 auto}
  .cig-heroLink a{font-size:22px}
  .cig-bar{gap:14px}
}

/* ---------- post popup ---------- */
.cig-pop{position:fixed;inset:0;z-index:2147483000;background:rgba(0,0,0,.72);
  display:flex;justify-content:center;overflow-y:auto;overscroll-behavior:contain;padding:28px 16px}
.cig-pop[hidden]{display:none}
.cig-popClose{position:fixed;top:12px;right:18px;background:none;border:0;color:#fff;font-size:34px;
  line-height:1;cursor:pointer;z-index:1}
.cig-popInner{width:100%;max-width:600px;display:flex;flex-direction:column;gap:26px;margin:auto 0}
.cig-post{background:#fff;border-radius:6px;overflow:hidden}
.cig-postHead{display:flex;align-items:center;gap:10px;padding:12px 14px}
.cig-postHead img{width:32px;height:32px;border-radius:50%;object-fit:cover}
.cig-postUser{font-weight:600;font-size:14px;text-decoration:none;color:var(--cig-fg)}
.cig-postFollow{color:var(--cig-blue);font-weight:600;font-size:14px;text-decoration:none}
.cig-postDot{color:var(--cig-muted)}
.cig-postIg{margin-left:auto;display:inline-flex}
.cig-postIg svg{width:22px;height:22px}
.cig-postImg{width:100%;display:block;background:#000}
.cig-postBody{padding:10px 14px 16px}
.cig-acts{display:flex;gap:14px;padding:2px 0 8px}
.cig-acts svg{width:24px;height:24px;fill:none;stroke:var(--cig-fg);stroke-width:1.8}
.cig-cap{font-size:14px;line-height:1.5;white-space:pre-wrap;word-break:break-word}
.cig-cap b{font-weight:600}
.cig-date{margin-top:8px;font-size:12px;color:var(--cig-muted);text-transform:uppercase;letter-spacing:.02em}
.cig-dots{display:flex;gap:5px;justify-content:center;padding:8px 0 0}
.cig-dot{width:6px;height:6px;border-radius:50%;background:var(--cig-line)}
.cig-dot[data-on="1"]{background:var(--cig-blue)}
`;

/* Icons kept as fixed markup — never built from feed data. */
const ICONS = {
  carousel:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 3H9a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM5 7H3v12a2 2 0 0 0 2 2h12v-2H5V7z"/></svg>',
  video: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>',
  heartFill:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
  commentFill:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C6.48 2 2 6.02 2 11c0 2.8 1.42 5.29 3.64 6.94L5 22l4.4-2.3c.83.2 1.7.3 2.6.3 5.52 0 10-4.02 10-9s-4.48-9-10-9z"/></svg>',
  heartLine:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.7l-1.3-1.2C6 15.4 3 12.6 3 9.2 3 6.6 5 4.6 7.5 4.6c1.5 0 2.9.7 3.8 1.8l.7.9.7-.9c.9-1.1 2.3-1.8 3.8-1.8C19 4.6 21 6.6 21 9.2c0 3.4-3 6.2-7.7 10.3L12 20.7z"/></svg>',
  commentLine:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.7 11.2c0 4.2-3.9 7.6-8.7 7.6-1 0-2-.15-2.9-.42L4 20.9l1.6-4.1C4 15.4 3.3 13.4 3.3 11.2c0-4.2 3.9-7.6 8.7-7.6s8.7 3.4 8.7 7.6z"/></svg>',
  share:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>',
  ig:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="cigG" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#f09433"/><stop offset=".5" stop-color="#dc2743"/><stop offset="1" stop-color="#bc1888"/></linearGradient></defs><path fill="url(#cigG)" d="M12 2.2c3.2 0 3.6 0 4.9.07 1.2.06 1.8.25 2.2.42.6.22 1 .48 1.4.9.4.4.7.8.9 1.4.17.4.36 1 .42 2.2.07 1.3.07 1.7.07 4.9s0 3.6-.07 4.9c-.06 1.2-.25 1.8-.42 2.2-.22.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.17-1 .36-2.2.42-1.3.07-1.7.07-4.9.07s-3.6 0-4.9-.07c-1.2-.06-1.8-.25-2.2-.42-.6-.22-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.17-.4-.36-1-.42-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.07-4.9c.06-1.2.25-1.8.42-2.2.22-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.17 1-.36 2.2-.42C8.4 2.2 8.8 2.2 12 2.2zm0 3.2A6.6 6.6 0 1 0 18.6 12 6.6 6.6 0 0 0 12 5.4zm0 10.9A4.3 4.3 0 1 1 16.3 12 4.3 4.3 0 0 1 12 16.3zm6.9-11a1.55 1.55 0 1 1-1.55-1.55A1.55 1.55 0 0 1 18.9 5.3z"/></svg>',
};

function widgetJs(origin: string) {
  return `(function(){
"use strict";
var ORIGIN=${JSON.stringify(origin)};
var CSS=${JSON.stringify(CSS)};
var I=${JSON.stringify(ICONS)};

function el(tag,cls,html){var n=document.createElement(tag);if(cls)n.className=cls;if(html!=null)n.innerHTML=html;return n;}
function txt(n,s){n.textContent=s==null?"":String(s);return n;}
function compact(n){n=Number(n)||0;
  if(n>=1000000)return (n/1000000).toFixed(n%1000000===0?0:1).replace(/\\.0$/,"")+"M";
  if(n>=1000)return (n/1000).toFixed(n%1000===0?0:1).replace(/\\.0$/,"")+"K";
  return String(n);}
function fmtDate(iso){if(!iso)return "";try{return new Date(iso).toLocaleDateString(undefined,{month:"long",day:"numeric"});}catch(e){return "";}}

function injectCss(){ if(document.getElementById("cig-style"))return;
  var s=document.createElement("style"); s.id="cig-style"; s.textContent=CSS; document.head.appendChild(s); }

function buildHeader(p, handle){
  var bar=el("div","cig-bar");
  if(p&&p.avatarUrl){
    var av=el("div","cig-avatar"); var im=new Image(); im.src=p.avatarUrl; im.alt=""; im.loading="lazy"; av.appendChild(im); bar.appendChild(av);
  }
  var id=el("div","cig-id");
  id.appendChild(txt(el("div","cig-name"), (p&&p.name)||handle));
  id.appendChild(txt(el("div","cig-handle"), "@"+handle));
  bar.appendChild(id);

  var stats=el("div","cig-stats");
  function stat(v,l){var d=el("div","cig-stat");d.appendChild(txt(el("span","cig-statv"),v));d.appendChild(txt(el("span","cig-statl"),l));return d;}
  if(p){ stats.appendChild(stat(compact(p.mediaCount),"Posts"));
         stats.appendChild(stat(compact(p.followersCount),"Followers")); }
  bar.appendChild(stats);

  var f=el("a","cig-follow",I.ig+"<span>Follow</span>");
  f.href="https://www.instagram.com/"+handle+"/"; f.target="_blank"; f.rel="noopener noreferrer";
  bar.appendChild(f);
  return bar;
}

function buildTile(item, onOpen){
  var b=el("button","cig-tile"); b.type="button";
  b.setAttribute("aria-label", item.caption? String(item.caption).slice(0,110) : "Open Instagram post");
  var im=new Image(); im.src=item.image; im.alt=""; im.loading="lazy"; im.decoding="async"; b.appendChild(im);

  /* Multi-post marker only for carousels; a single image must not show it. */
  if(item.type==="CAROUSEL_ALBUM"||item.type==="VIDEO"){
    b.appendChild(el("span","cig-badge", item.type==="VIDEO"? I.video : I.carousel));
  }

  var hov=el("span","cig-hover");
  hov.appendChild(el("span","cig-hstat", I.heartFill+"<span>"+compact(item.likeCount||0)+"</span>"));
  hov.appendChild(el("span","cig-hstat", I.commentFill+"<span>"+compact(item.commentsCount||0)+"</span>"));
  b.appendChild(hov);

  b.addEventListener("click", onOpen);
  return b;
}

function buildPost(item, p, handle){
  var post=el("article","cig-post");

  var head=el("div","cig-postHead");
  if(p&&p.avatarUrl){var a=new Image();a.src=p.avatarUrl;a.alt="";head.appendChild(a);}
  var u=el("a","cig-postUser"); txt(u,handle); u.href="https://www.instagram.com/"+handle+"/"; u.target="_blank"; u.rel="noopener noreferrer";
  head.appendChild(u);
  head.appendChild(txt(el("span","cig-postDot"),"·"));
  var fo=el("a","cig-postFollow"); txt(fo,"Follow"); fo.href="https://www.instagram.com/"+handle+"/"; fo.target="_blank"; fo.rel="noopener noreferrer";
  head.appendChild(fo);
  var ig=el("a","cig-postIg",I.ig); ig.href=item.permalink; ig.target="_blank"; ig.rel="noopener noreferrer";
  head.appendChild(ig);
  post.appendChild(head);

  /* Carousel: page through children, mirroring the post on Instagram. */
  var imgs=(item.children&&item.children.length)? item.children : [item.image];
  var idx=0;
  var pic=new Image(); pic.className="cig-postImg"; pic.src=imgs[0]; pic.alt=""; pic.loading="lazy";
  post.appendChild(pic);

  if(imgs.length>1){
    var dots=el("div","cig-dots");
    imgs.forEach(function(_,i){var d=el("span","cig-dot");if(i===0)d.setAttribute("data-on","1");dots.appendChild(d);});
    post.appendChild(dots);
    pic.style.cursor="pointer";
    pic.addEventListener("click",function(){
      idx=(idx+1)%imgs.length; pic.src=imgs[idx];
      [].forEach.call(dots.children,function(d,i){ if(i===idx)d.setAttribute("data-on","1"); else d.removeAttribute("data-on"); });
    });
  }

  var body=el("div","cig-postBody");
  var acts=el("div","cig-acts", I.heartLine+I.commentLine+I.share);
  body.appendChild(acts);

  if(item.caption){
    var cap=el("div","cig-cap");
    var strong=el("b"); txt(strong,handle+" ");
    cap.appendChild(strong);
    cap.appendChild(document.createTextNode(String(item.caption)));
    body.appendChild(cap);
  }
  var dt=fmtDate(item.timestamp);
  if(dt) body.appendChild(txt(el("div","cig-date"),dt));
  post.appendChild(body);
  return post;
}

function mount(root){
  var handle=root.getAttribute("data-handle")||"shopcarbon";
  var heroSrc=root.getAttribute("data-hero")||"";
  var heroText=root.getAttribute("data-hero-text")||("@"+handle);
  var limit=parseInt(root.getAttribute("data-limit")||"12",10)||12;

  fetch(ORIGIN+"/api/public/instagram-feed?limit="+limit,{credentials:"omit"})
    .then(function(r){return r.ok?r.json():null;})
    .then(function(d){
      if(!d||!d.ok||!d.items||!d.items.length) return;   /* stays hidden */
      injectCss();
      root.classList.add("cig-root");
      root.innerHTML="";

      root.appendChild(buildHeader(d.profile,handle));

      var media=el("div","cig-media");
      if(heroSrc){
        var hero=el("div","cig-hero");
        var hi=new Image(); hi.src=heroSrc; hi.alt="Instagram banner for @"+handle; hi.loading="lazy";
        hero.appendChild(hi);
        var hl=el("div","cig-heroLink");
        var ha=document.createElement("a"); ha.href="https://www.instagram.com/"+handle+"/";
        ha.target="_blank"; ha.rel="noopener noreferrer"; ha.textContent=heroText;
        hl.appendChild(ha); hero.appendChild(hl); media.appendChild(hero);
      }

      var cell=el("div","cig-tilesCell");
      var vp=el("div","cig-viewport");
      var strip=el("div","cig-strip");

      var openAt;
      /* Two rows per column, scrolling horizontally — the studio layout. */
      for(var i=0;i<d.items.length;i+=2){
        var col=el("div","cig-col");
        [d.items[i],d.items[i+1]].forEach(function(it){
          if(!it) return;
          col.appendChild(buildTile(it,function(){ openAt(it.id); }));
        });
        strip.appendChild(col);
      }
      vp.appendChild(strip); cell.appendChild(vp);

      var prev=el("button","cig-arrow",'<svg viewBox="0 0 24 24"><path d="M15 4l-8 8 8 8z"/></svg>');
      prev.type="button"; prev.setAttribute("data-side","prev"); prev.setAttribute("aria-label","Previous");
      var next=el("button","cig-arrow",'<svg viewBox="0 0 24 24"><path d="M9 4l8 8-8 8z"/></svg>');
      next.type="button"; next.setAttribute("data-side","next"); next.setAttribute("aria-label","Next");
      cell.appendChild(prev); cell.appendChild(next);
      media.appendChild(cell);
      root.appendChild(media);

      function step(dir){
        var col=strip.querySelector(".cig-col");
        var w=col? col.getBoundingClientRect().width+10 : vp.clientWidth;
        vp.scrollLeft+=dir*w;
      }
      prev.addEventListener("click",function(){step(-1);});
      next.addEventListener("click",function(){step(1);});
      function syncArrows(){
        prev.hidden = vp.scrollLeft<=2;
        next.hidden = vp.scrollLeft >= vp.scrollWidth-vp.clientWidth-2;
      }
      vp.addEventListener("scroll",syncArrows);
      window.addEventListener("resize",syncArrows);

      /* Square tiles: three columns visible, matching the hero height. */
      function sizeTiles(){
        var w=cell.clientWidth; if(!w) return;
        var s=Math.floor((w-2*10)/3);
        [].forEach.call(strip.querySelectorAll(".cig-tile"),function(t){t.style.width=s+"px";t.style.height=s+"px";});
        var h=2*s+10;
        vp.style.height=h+"px";
        var hero=media.querySelector(".cig-hero"); if(hero&&window.innerWidth>900) hero.style.height=h+"px";
        syncArrows();
      }
      sizeTiles();
      window.addEventListener("resize",sizeTiles);
      if(window.ResizeObserver) new ResizeObserver(sizeTiles).observe(cell);

      /* ---- popup: every post stacked, scrolls in feed order ---- */
      var pop=el("div","cig-pop"); pop.hidden=true;
      var close=el("button","cig-popClose","×"); close.type="button"; close.setAttribute("aria-label","Close");
      var inner=el("div","cig-popInner");
      var anchors={};
      d.items.forEach(function(it){ var node=buildPost(it,d.profile,handle); anchors[it.id]=node; inner.appendChild(node); });
      pop.appendChild(close); pop.appendChild(inner);
      document.body.appendChild(pop);

      function closePop(){ pop.hidden=true; document.documentElement.style.overflow=""; document.body.style.overflow=""; }
      openAt=function(id){
        pop.hidden=false;
        document.documentElement.style.overflow="hidden"; document.body.style.overflow="hidden";
        var n=anchors[id];
        if(n) n.scrollIntoView({block:"start"});
      };
      close.addEventListener("click",closePop);
      pop.addEventListener("click",function(e){ if(e.target===pop) closePop(); });
      document.addEventListener("keydown",function(e){ if(e.key==="Escape"&&!pop.hidden) closePop(); });
    })
    .catch(function(){ /* offline or endpoint down — the section stays hidden */ });
}

function boot(){
  var nodes=document.querySelectorAll("[data-carbon-instagram]");
  for(var i=0;i<nodes.length;i++){ if(!nodes[i].getAttribute("data-cig-mounted")){ nodes[i].setAttribute("data-cig-mounted","1"); mount(nodes[i]); } }
}
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",boot); else boot();
})();`;
}

export async function GET(req: NextRequest) {
  const proto = req.headers.get("x-forwarded-proto") || "https";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "app.shopcarbon.com";
  /* Never bake a loopback origin into storefront JS (Coolify internal URL). */
  const safeHost = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?)(:\d+)?$/i.test(host)
    ? "app.shopcarbon.com"
    : host;
  const origin = `${proto}://${safeHost}`;

  return new NextResponse(widgetJs(origin), {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
