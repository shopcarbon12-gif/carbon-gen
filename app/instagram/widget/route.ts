import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  loadInstagramSectionConfig,
  type InstagramSectionStoredConfig,
} from "@/lib/instagramSectionConfigRepository";

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
/* The popup is appended to <body>, not inside .cig-root — it has to escape the
   section's overflow and stacking context to cover the page. So it needs its own
   copy of these variables: inheritance cannot reach it from .cig-root, and
   without them the post icons draw with no stroke and vanish. */
.cig-root,.cig-pop{--cig-fg:#111;--cig-muted:#8e8e8e;--cig-line:#dbdbdb;--cig-blue:#0095f6;
  font-family:inherit;color:var(--cig-fg);box-sizing:border-box}
.cig-root *,.cig-root *::before,.cig-root *::after,
.cig-pop *,.cig-pop *::before,.cig-pop *::after{box-sizing:border-box}

/* ---------- profile header ----------
   Values mirror .profileBar / .followBtn in the studio's CSS module. A grid,
   not a flex row, so the name, both counts and the button sit on one baseline
   grid the way the studio lays them out. */
.cig-bar{display:flex;justify-content:center;width:100%;margin-bottom:22px}
/* Two rows, one column per field: the big values share the top line and the
   small ones the bottom, so each reads straight across. Baseline alignment is
   what keeps the bottom row level despite the handle and labels differing in
   size. Avatar and button span both rows and centre against them. */
.cig-barIn{display:grid;align-items:baseline;justify-content:center;
  column-gap:clamp(20px,3.5vw,36px);row-gap:2px;
  grid-template-columns:auto auto auto auto auto;
  grid-template-rows:auto auto;
  grid-template-areas:"avatar name posts followers btn"
                      "avatar handle postsLabel followersLabel btn";max-width:100%}
.cig-avatar{grid-area:avatar;width:60px;height:60px;border-radius:50%;overflow:hidden;
  justify-self:start;align-self:center;flex-shrink:0}
.cig-avatar img{width:100%;height:100%;object-fit:cover;display:block}
/* The studio's fallback avatar asset has the gradient ring painted into the
   image; the picture Instagram returns does not. So the ring is drawn here only
   for the live one — otherwise it renders twice on the fallback. */
.cig-avatar[data-ring="1"]{padding:2px;
  background:linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)}
.cig-avatar[data-ring="1"] img{border-radius:50%;border:2px solid #fff;background:#fff}
/* The wrappers dissolve so their children become grid items themselves — that is
   what puts a value and its label in two different rows of one column. */
.cig-id,.cig-stats,.cig-stat{display:contents}
.cig-name{grid-area:name;justify-self:start;font-size:1.125rem;font-weight:700;color:#000;
  letter-spacing:.04em;text-transform:uppercase}
.cig-handle{grid-area:handle;justify-self:start;font-size:.9375rem;color:#8e8e8e}
.cig-statv{justify-self:start;font-size:1.125rem;font-weight:700;color:#000;line-height:1.15}
.cig-statl{justify-self:start;font-size:.8125rem;font-weight:400;color:#8e8e8e;line-height:1.2}
.cig-stat[data-k="posts"] .cig-statv{grid-area:posts}
.cig-stat[data-k="posts"] .cig-statl{grid-area:postsLabel}
.cig-stat[data-k="followers"] .cig-statv{grid-area:followers}
.cig-stat[data-k="followers"] .cig-statl{grid-area:followersLabel}
.cig-follow{grid-area:btn;justify-self:start;align-self:center;display:inline-flex;align-items:center;gap:8px;
  padding:10px 20px;border-radius:8px;background:#0095f6;color:#fff;font-size:.9375rem;
  font-weight:700;text-decoration:none}
.cig-follow:hover{filter:brightness(1.05)}
/* Outlined white camera, not the gradient wordmark logo — the studio's glyph. */
.cig-follow svg{width:18px;height:18px;flex-shrink:0;fill:none;stroke:currentColor;
  stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round}
.cig-follow svg .cig-dotFill{fill:currentColor;stroke:none}

/* ---------- hero + tiles ---------- */
.cig-media{display:flex;gap:10px;align-items:stretch}
.cig-hero{position:relative;flex:1 1 50%;min-width:0;overflow:hidden}
/* Slow push-in on hover, same 0.55s / 1.04 as the studio's .banner. */
.cig-hero img,.cig-hero video{width:100%;height:100%;object-fit:cover;display:block;
  transition:transform .55s ease}
.cig-hero:hover img,.cig-hero:hover video{transform:scale(1.04)}
/* Sits above the image so the hover push-in happens behind it, and matches the
   studio's .instagramLink: weight 500, underline on hover, no shadow. */
.cig-heroLink{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);padding:10px 15px;
  z-index:4;text-align:center;font-size:var(--cig-heroFsD,clamp(1.25rem,3vw,2rem));color:#fff}
.cig-heroLink a{font-size:inherit;color:#fff;font-weight:500;text-decoration:none}
.cig-heroLink a:hover{text-decoration:underline}
.cig-tilesCell{position:relative;flex:1 1 50%;min-width:0}
.cig-viewport{overflow-x:auto;overflow-y:hidden;scrollbar-width:none;-ms-overflow-style:none;scroll-behavior:smooth}
.cig-viewport::-webkit-scrollbar{display:none}
.cig-strip{display:flex;gap:10px}
.cig-col{display:flex;flex-direction:column;gap:10px;flex:0 0 auto}

.cig-tile{position:relative;display:block;padding:0;border:0;background:#e5e7eb;cursor:pointer;
  overflow:hidden;border-radius:2px}
/* The tiles push in on hover too, matching the hero rather than sitting static
   next to it. The image scales under the overlay, which does not move. */
.cig-tile img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .55s ease}
.cig-tile:hover img,.cig-tile:focus-visible img{transform:scale(1.04)}

/* multi-post marker: only rendered for carousels */
.cig-badge{position:absolute;top:8px;right:8px;width:18px;height:18px;pointer-events:none;
  filter:drop-shadow(0 1px 2px rgba(0,0,0,.5))}
.cig-badge svg{width:100%;height:100%;display:block;fill:#fff}

/* hover: dimmed image, like/comment counts on top, caption underneath */
.cig-hover{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:10px;padding:14px 12px;box-sizing:border-box;
  background:rgba(0,0,0,.58);opacity:0;transition:opacity .18s ease;color:#fff;
  font-weight:600;font-size:14px;text-align:center}
.cig-tile:hover .cig-hover,.cig-tile:focus-visible .cig-hover{opacity:1}
.cig-hstats{display:flex;align-items:center;justify-content:center;gap:20px;flex:0 0 auto}
.cig-hstat{display:inline-flex;align-items:center;gap:6px}
.cig-hstat svg{width:19px;height:19px;fill:#fff}
/* The caption is clamped rather than scrolled: a tile is small, and a partial
   line reads as "there is more" without stealing the pointer from the click. */
.cig-hcap{font-weight:400;font-size:12.5px;line-height:1.45;overflow:hidden;
  display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:5}
@media (max-width:900px){ .cig-hcap{-webkit-line-clamp:3;font-size:11.5px} }

/* Mirrored semicircles that curve toward the grid with the flat edge outward,
   matching .scrollBtn in the studio: 30x60, near-black, 0.85 idle opacity
   rising to 1, and a directional shadow on hover. */
.cig-arrow{position:absolute;top:50%;transform:translate3d(0,-50%,0) scale(1);transform-origin:50% 50%;
  z-index:4;width:30px;height:60px;padding:0;display:flex;align-items:center;border:none;
  background:rgba(0,0,0,.88);opacity:.85;color:#fff;cursor:pointer;
  -webkit-tap-highlight-color:transparent;box-shadow:0 2px 10px rgba(0,0,0,.28);
  transition:all .2s ease}
.cig-arrow[hidden]{display:none}
.cig-arrow:hover{opacity:1;background:rgba(0,0,0,.88);transform:translate3d(0,-50%,0) scale(1)}
.cig-arrow:active{transform:translate3d(0,-50%,0) scale(.943);opacity:1}
.cig-arrow:focus-visible{outline:2px solid #0095f6;outline-offset:2px}
.cig-arrow[data-side="prev"]{left:0;border-radius:0 30px 30px 0;justify-content:flex-start;padding-left:4px}
.cig-arrow[data-side="next"]{right:0;border-radius:30px 0 0 30px;justify-content:flex-end;padding-right:4px}
.cig-arrow[data-side="prev"]:hover,.cig-arrow[data-side="prev"]:active{box-shadow:rgba(0,0,0,.3) 2px 0 5px 0}
.cig-arrow[data-side="next"]:hover,.cig-arrow[data-side="next"]:active{box-shadow:rgba(0,0,0,.3) -2px 0 5px 0}
.cig-arrow svg{display:block;flex-shrink:0;width:12px;height:12px;fill:currentColor}

@media (max-width:900px){
  .cig-media{flex-direction:column}
  .cig-hero,.cig-tilesCell{flex:1 1 auto}
  .cig-heroLink{font-size:var(--cig-heroFsM,clamp(1.1rem,5vw,1.5rem))}
  /* Five columns will not fit a phone. The identity keeps the top pair of rows
     with the avatar, the two counts keep their own pair below it, and the button
     spans the width — each pair still reading as two straight lines. */
  .cig-barIn{grid-template-columns:auto auto auto;
    grid-template-areas:"avatar name   name"
                        "avatar handle handle"
                        ".      posts  followers"
                        ".      postsLabel followersLabel"
                        "btn    btn    btn";
    column-gap:16px;row-gap:2px}
  .cig-follow{justify-self:center;margin-top:12px}
}

/* ---------- post popup ---------- */
/* Top of the stack on purpose. The storefront's own floating controls (the
   accessibility widget sits at 2147483646) would otherwise punch through the
   dimmed backdrop and sit on top of the open post. */
.cig-pop{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.72);
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
  /* Follow button glyph: outlined camera in the button's own colour, matching
     the studio. The gradient wordmark logo reads as a different button. */
  ig:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="3.25"/><circle class="cig-dotFill" cx="17.25" cy="6.75" r="0.9"/></svg>',
  /* Filled carets — the hit target's shape comes from .cig-arrow, not these. */
  caretPrev: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11 3.2L4.8 8 11 12.8 11 3.2z"/></svg>',
  caretNext: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3.2L11.2 8 5 12.8 5 3.2z"/></svg>',
  /* The post header keeps the recognisable gradient mark. */
  igMark:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="cigG" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#f09433"/><stop offset=".5" stop-color="#dc2743"/><stop offset="1" stop-color="#bc1888"/></linearGradient></defs><path fill="url(#cigG)" d="M12 2.2c3.2 0 3.6 0 4.9.07 1.2.06 1.8.25 2.2.42.6.22 1 .48 1.4.9.4.4.7.8.9 1.4.17.4.36 1 .42 2.2.07 1.3.07 1.7.07 4.9s0 3.6-.07 4.9c-.06 1.2-.25 1.8-.42 2.2-.22.6-.5 1-.9 1.4-.4.4-.8.7-1.4.9-.4.17-1 .36-2.2.42-1.3.07-1.7.07-4.9.07s-3.6 0-4.9-.07c-1.2-.06-1.8-.25-2.2-.42-.6-.22-1-.5-1.4-.9-.4-.4-.7-.8-.9-1.4-.17-.4-.36-1-.42-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.07-4.9c.06-1.2.25-1.8.42-2.2.22-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.17 1-.36 2.2-.42C8.4 2.2 8.8 2.2 12 2.2zm0 3.2A6.6 6.6 0 1 0 18.6 12 6.6 6.6 0 0 0 12 5.4zm0 10.9A4.3 4.3 0 1 1 16.3 12 4.3 4.3 0 0 1 12 16.3zm6.9-11a1.55 1.55 0 1 1-1.55-1.55A1.55 1.55 0 0 1 18.9 5.3z"/></svg>',
};

function widgetJs(origin: string, conf: InstagramSectionStoredConfig) {
  return `(function(){
"use strict";
var ORIGIN=${JSON.stringify(origin)};
var CSS=${JSON.stringify(CSS)};
var I=${JSON.stringify(ICONS)};
/* Settings saved in the studio. Baked in as the starting value so a config
   request that fails still renders a correct row, then replaced by the live read
   in mount() — this script is cached for five minutes, and publishing must not
   wait for that to expire. */
var CONF=${JSON.stringify(conf)};

function el(tag,cls,html){var n=document.createElement(tag);if(cls)n.className=cls;if(html!=null)n.innerHTML=html;return n;}
function txt(n,s){n.textContent=s==null?"":String(s);return n;}
/* Studio-authored strings are the only values that reach innerHTML here, and
   they are typed by an admin rather than by a shopper — escaped anyway, because
   markup arriving through a settings field should render as text, not as HTML. */
var ESC={"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"};
function esc(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return ESC[c];});}
function compact(n){n=Number(n)||0;
  if(n>=1000000)return (n/1000000).toFixed(n%1000000===0?0:1).replace(/\\.0$/,"")+"M";
  if(n>=1000)return (n/1000).toFixed(n%1000===0?0:1).replace(/\\.0$/,"")+"K";
  return String(n);}
function fmtDate(iso){if(!iso)return "";try{return new Date(iso).toLocaleDateString(undefined,{month:"long",day:"numeric"});}catch(e){return "";}}

function injectCss(){ if(document.getElementById("cig-style"))return;
  var s=document.createElement("style"); s.id="cig-style"; s.textContent=CSS; document.head.appendChild(s); }

/* Live Instagram first, the studio's saved value next, the written default last.
   The account's own name and counts are the truth here — the studio fields stand
   in only while the feed is loading or if Meta is unreachable. */
function pick(live, saved, fallback){
  if(live!=null && live!=="" ) return live;
  if(saved!=null && String(saved).trim()!=="") return String(saved).trim();
  return fallback;
}

function buildHeader(p, handle){
  var bar=el("div","cig-bar");
  var inner=el("div","cig-barIn");
  bar.appendChild(inner);

  var liveAvatar=p&&p.avatarUrl? String(p.avatarUrl):"";
  var avatar=pick(liveAvatar, CONF.profileAvatarUrl, "");
  if(avatar){
    var av=el("div","cig-avatar");
    if(avatar===liveAvatar) av.setAttribute("data-ring","1");
    var im=new Image(); im.src=avatar; im.alt=""; im.loading="lazy"; av.appendChild(im); inner.appendChild(av);
  }
  var id=el("div","cig-id");
  id.appendChild(txt(el("div","cig-name"), pick(p&&p.name, CONF.profileBrandName, handle)));
  id.appendChild(txt(el("div","cig-handle"), "@"+handle));
  inner.appendChild(id);

  /* .cig-stats is display:contents, so each stat lands in its own grid area
     rather than nesting — the header stays one row of aligned columns. */
  var stats=el("div","cig-stats");
  function stat(v,l,k){var d=el("div","cig-stat");d.setAttribute("data-k",k);
    d.appendChild(txt(el("span","cig-statv"),v));d.appendChild(txt(el("span","cig-statl"),l));return d;}
  var posts=pick(p&&p.mediaCount? compact(p.mediaCount):null, CONF.profilePostsCount, "");
  var followers=pick(p&&p.followersCount? compact(p.followersCount):null, CONF.profileFollowersCount, "");
  if(posts) stats.appendChild(stat(posts,"Posts","posts"));
  if(followers) stats.appendChild(stat(followers,"Followers","followers"));
  inner.appendChild(stats);

  var f=el("a","cig-follow",I.ig+"<span>"+esc(pick(null,CONF.profileFollowButtonLabel,"Follow"))+"</span>");
  f.href=pick(null,CONF.profileFollowButtonHref,"https://www.instagram.com/"+handle+"/");
  f.target="_blank"; f.rel="noopener noreferrer";
  inner.appendChild(f);
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
  var hs=el("span","cig-hstats");
  hs.appendChild(el("span","cig-hstat", I.heartFill+"<span>"+compact(item.likeCount||0)+"</span>"));
  hs.appendChild(el("span","cig-hstat", I.commentFill+"<span>"+compact(item.commentsCount||0)+"</span>"));
  hov.appendChild(hs);
  var capText=String(item.caption||"").trim();
  if(capText) hov.appendChild(txt(el("span","cig-hcap"), capText));
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
  var ig=el("a","cig-postIg",I.igMark); ig.href=item.permalink; ig.target="_blank"; ig.rel="noopener noreferrer";
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
  var limit=parseInt(root.getAttribute("data-limit")||"12",10)||12;

  /* Settings and posts together. The settings read is uncached, so pressing
     "Publish Changes" in the studio reaches shoppers on their next page load
     instead of waiting out this script's five-minute cache. If it fails, the
     values baked in above still render the row. */
  Promise.all([
    fetch(ORIGIN+"/api/public/instagram-feed?limit="+limit,{credentials:"omit"})
      .then(function(r){return r.ok?r.json():null;})
      .catch(function(){return null;}),
    fetch(ORIGIN+"/api/public/instagram-config",{credentials:"omit",cache:"no-store"})
      .then(function(r){return r.ok?r.json():null;})
      .catch(function(){return null;})
  ])
    .then(function(res){
      var d=res[0];
      if(res[1]&&res[1].ok&&res[1].config) CONF=res[1].config;

      /* The studio wins over the mount's data-* attributes: those are only a
         theme-side starting point, and an edit in the studio must not need a
         theme change to take effect. */
      var handle=pick(null, CONF.profileHandle, root.getAttribute("data-handle")||"shopcarbon").replace(/^@/,"");
      var heroSrc=pick(null, CONF.heroImageUrl, root.getAttribute("data-hero")||"");
      var heroText=pick(null, CONF.heroLinkText, root.getAttribute("data-hero-text")||("@"+handle));
      var heroAlt=pick(null, CONF.heroAlt, "Instagram banner for @"+handle);
      var heroHref=pick(null, CONF.heroLinkHref, "https://www.instagram.com/"+handle+"/");
      var arrowsOn=CONF.feedSliderArrowsEnabled!==false;
      var dragOn=CONF.feedSliderDragEnabled!==false;
      var animMs=Math.max(0,(Number(CONF.feedSliderAnimationSec)||0)*1000);
      var autoplayMs=Math.max(0,(Number(CONF.feedSliderAutoplaySec)||0)*1000);

      if(!d||!d.ok||!d.items||!d.items.length) return;   /* stays hidden */
      injectCss();
      root.classList.add("cig-root");
      root.innerHTML="";

      root.appendChild(buildHeader(d.profile,handle));

      var media=el("div","cig-media");
      if(heroSrc){
        var hero=el("div","cig-hero");
        var hi=new Image(); hi.src=heroSrc; hi.alt=heroAlt; hi.loading="lazy";
        hero.appendChild(hi);
        var hl=el("div","cig-heroLink");
        var ha=document.createElement("a"); ha.href=heroHref;
        ha.target="_blank"; ha.rel="noopener noreferrer"; ha.textContent=heroText;
        /* Desktop and mobile sizes are separate settings, so they go on the root
           as variables and the stylesheet's media query picks between them —
           an inline font-size could only ever carry one of the two. */
        if(CONF.heroLinkColor) ha.style.color=CONF.heroLinkColor;
        if(CONF.heroLinkFontWeight) ha.style.fontWeight=String(CONF.heroLinkFontWeight);
        if(CONF.heroLinkFontSizeDesktopPx) root.style.setProperty("--cig-heroFsD",CONF.heroLinkFontSizeDesktopPx+"px");
        if(CONF.heroLinkFontSizeMobilePx) root.style.setProperty("--cig-heroFsM",CONF.heroLinkFontSizeMobilePx+"px");
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

      var prev=el("button","cig-arrow",I.caretPrev);
      prev.type="button"; prev.setAttribute("data-side","prev"); prev.setAttribute("aria-label","Previous");
      var next=el("button","cig-arrow",I.caretNext);
      next.type="button"; next.setAttribute("data-side","next"); next.setAttribute("aria-label","Next");
      cell.appendChild(prev); cell.appendChild(next);
      media.appendChild(cell);
      root.appendChild(media);

      function step(dir){
        var col=strip.querySelector(".cig-col");
        var w=col? col.getBoundingClientRect().width+10 : vp.clientWidth;
        /* A zero animation time means "jump" — smooth scrolling would ignore it
           and still glide, so the behaviour is chosen rather than the duration. */
        vp.style.scrollBehavior = animMs>0 ? "smooth" : "auto";
        vp.scrollLeft+=dir*w;
      }
      prev.addEventListener("click",function(){step(-1);});
      next.addEventListener("click",function(){step(1);});
      function syncArrows(){
        if(!arrowsOn){ prev.hidden=true; next.hidden=true; return; }
        prev.hidden = vp.scrollLeft<=2;
        next.hidden = vp.scrollLeft >= vp.scrollWidth-vp.clientWidth-2;
      }
      vp.addEventListener("scroll",syncArrows);
      window.addEventListener("resize",syncArrows);

      /* Click-drag to scroll, for pointers that have no touch surface. The
         threshold is what keeps a drag from also firing the tile's click. */
      if(dragOn){
        var down=false,startX=0,startLeft=0,moved=false;
        vp.addEventListener("pointerdown",function(e){
          if(e.pointerType==="touch") return;   /* native touch scrolling is better */
          down=true; moved=false; startX=e.clientX; startLeft=vp.scrollLeft;
        });
        vp.addEventListener("pointermove",function(e){
          if(!down) return;
          var dx=e.clientX-startX;
          if(Math.abs(dx)>4){ moved=true; vp.style.scrollBehavior="auto"; vp.scrollLeft=startLeft-dx; }
        });
        function endDrag(){ down=false; }
        vp.addEventListener("pointerup",endDrag);
        vp.addEventListener("pointercancel",endDrag);
        vp.addEventListener("pointerleave",endDrag);
        vp.addEventListener("click",function(e){ if(moved){ e.preventDefault(); e.stopPropagation(); moved=false; } },true);
      }

      /* Autoplay wraps to the start once the last column is reached, and stops
         while a pointer is over the strip so it cannot scroll out from under a
         shopper mid-look. */
      if(autoplayMs>0){
        var timer=null, paused=false;
        function tick(){
          if(paused) return;
          if(vp.scrollLeft >= vp.scrollWidth-vp.clientWidth-2){ vp.style.scrollBehavior="smooth"; vp.scrollLeft=0; }
          else step(1);
        }
        vp.addEventListener("pointerenter",function(){paused=true;});
        vp.addEventListener("pointerleave",function(){paused=false;});
        timer=setInterval(tick,autoplayMs);
        window.addEventListener("pagehide",function(){ if(timer) clearInterval(timer); });
      }

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

  /* A studio that cannot be read must not blank the section, so a failure here
     falls back to an empty config and the widget's own written defaults. */
  let conf: InstagramSectionStoredConfig = {};
  try {
    conf = (await loadInstagramSectionConfig("default")) || {};
  } catch {
    conf = {};
  }

  return new NextResponse(widgetJs(origin, conf), {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=86400",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
