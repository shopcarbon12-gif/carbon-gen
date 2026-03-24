const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'app/accessibility/widget/route.ts');
let content = fs.readFileSync(targetFile, 'utf8');

// The rewrite logic here will be to replace the `widgetCss` variable with the exact CSS 
// that matches "Pic 4 Monochrome" using the .ca-* class structures from the old DOM, 
// OR rewriting the DOM builders if needed. 

// Let's first overwrite the CSS string completely with a high-fidelity dark glassmorphic styling
const cssRewrite = `var widgetCss='' +
  '@font-face { font-family: "CarbonFont"; src: url("/accessibility-assets/NeuzeitGrotesk-Regular.otf") format("opentype"); }' +
  '.ca-assist-root, .ca-assist-root::before, .ca-assist-root::after, .ca-assist-root *, .ca-assist-root *::before, .ca-assist-root *::after { box-sizing: border-box; margin: 0; padding: 0; font-family: "CarbonFont", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important; font-size: 13px; line-height: 1.4; text-decoration: none; color: inherit; border: none; background: transparent; box-shadow: none; outline: none; }' +
  '.ca-assist-root button, .ca-assist-root [role="switch"], .ca-assist-root [role="radio"] { font: inherit; color: inherit; cursor: pointer; appearance: none; -webkit-appearance: none; border-radius: 0; }' +
  '.ca-assist-shell { position: relative; display: block; isolation: isolate; }' +
  
  /* LAUNCHER */
  '.ca-assist-launcher { position: relative; display: inline-flex; align-items: stretch; min-width: min(320px, calc(100vw - 48px)); max-width: min(420px, 92vw); padding: 0 12px 0 14px; cursor: pointer; color: #fff; background: rgba(15, 15, 20, 0.85); box-shadow: 0 10px 30px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.1), inset 0 1px 0 rgba(255,255,255,0.05); backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); border-radius: 999px; transition: transform 0.2s ease, box-shadow 0.2s ease; }' +
  '.ca-assist-launcher:hover { transform: translateY(-1px); background: rgba(20, 20, 25, 0.9); box-shadow: 0 14px 40px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(255,255,255,0.15), inset 0 1px 0 rgba(255,255,255,0.1); }' +
  '.ca-assist-launcher__inner { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 48px; }' +
  '.ca-assist-launcher__brand { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }' +
  '.ca-assist-launcher__glyph { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,0.05); color: #fff; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.05); }' +
  '.ca-assist-launcher__glyph svg { width: 18px; height: 18px; }' +
  
  /* BRANDING */
  '.ca-assist-markword { display: inline-flex; align-items: center; gap: 6px; letter-spacing: 0.1em !important; font-size: 14px; color: #fff; font-weight: normal; }' +
  '.ca-assist-hex { font-size: 18px; margin-right: 0px; margin-bottom: 2px; }' +
  
  /* PANEL */
  '.ca-assist-panel { z-index: 2147483647; display: none; position: absolute; bottom: calc(64px + env(safe-area-inset-bottom, 0px)); width: 100%; color: #e4e4e7; flex-direction: column; overflow: hidden; background: rgba(12, 8, 18, 0.95); backdrop-filter: blur(25px); -webkit-backdrop-filter: blur(25px); border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 40px 80px rgba(0,0,0,0.8), inset 0 1px 0 rgba(255,255,255,0.05); border-radius: 20px; }' +
  '.ca-assist-panel.ca-assist-panel--mono { background: rgba(8, 4, 12, 0.95); border: 1px solid rgba(255,255,255,0.12); }' +
  '.ca-assist-panel, .ca-assist-shell .ca-assist-panel { display: flex; }' +

  /* EXPLICIT NONE BEFORE OPEN */
  '.ca-assist-panel[style*="display: none"] { display: none !important; }' +
  
  /* SCROLLBAR */
  '.ca-assist-panel::-webkit-scrollbar { width: 0px; }' +
  '.ca-assist-panel-body::-webkit-scrollbar { width: 0px; }' +
  
  /* HEAD */
  '.ca-assist-head { flex-shrink: 0; padding: 24px 24px 20px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; flex-direction: column; position: relative; }' +
  '.ca-assist-brand-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; width: 100%; }' +
  '.ca-assist-close { width: 32px; height: 32px; position: absolute; right: 24px; top: 24px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.1); background: rgba(255,255,255,0.04); color: #fff; font-size: 20px; display: grid; place-items: center; cursor: pointer; transition: all 0.15s; }' +
  '.ca-assist-close:hover { background: rgba(255,255,255,0.1); }' +
  '.ca-assist-logo-img { max-height: 24px !important; margin-bottom: 16px; margin-left: -4px; }' +
  '.ca-assist-head-titles { display: flex; flex-direction: column; gap: 6px; }' +
  '.ca-assist-title { font-size: 22px; color: #fff; letter-spacing: -0.01em !important; font-weight: 500; }' +
  '.ca-assist-panel-sub { font-size: 13px; color: rgba(255,255,255,0.5); display: none; }' +
  '.ca-assist-helper { font-size: 13px; color: rgba(255,255,255,0.5); line-height: 1.5; }' +
  
  /* BODY */
  '.ca-assist-panel-body { flex: 1; overflow-y: auto; padding: 0 0 24px; display: flex; flex-direction: column; }' +
  
  /* SECTIONS */
  '.ca-assist-sec-group { display: flex; flex-direction: column; margin-top: 0; }' +
  '.ca-assist-sec-group-header, .ca-assist-stack > .ca-assist-sec { font-size: 14px; color: #fff; padding: 16px 24px; background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.04); border-top: 1px solid rgba(255,255,255,0.04); margin: 0; display: flex; justify-content: space-between; align-items: center; }' +
  '.ca-assist-sec-group-header::after { content: "›"; opacity: 0.5; font-size: 16px; margin-top: -2px; pointer-events: none; }' +
  
  /* PROFILES */
  '.ca-assist-stack { display: flex; flex-direction: column; }' +
  '.ca-assist-profile-strip { display: flex; flex-wrap: wrap; gap: 8px; padding: 20px 24px; }' +
  '.ca-assist-profile-pill { padding: 8px 16px; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; color: rgba(255,255,255,0.8); font-size: 13px; cursor: pointer; transition: all 0.15s; }' +
  '.ca-assist-profile-pill:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.15); color: #fff; }' +
  '.ca-assist-profile-pill.is-active { background: #fff; color: #000; font-weight: 500; border-color: #fff; }' +
  '.ca-assist-profile-clear { margin: 0 24px 20px; align-self: flex-start; padding: 8px 16px; background: transparent; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; color: #fff; font-size: 13px; cursor: pointer; transition: background 0.15s; }' +
  '.ca-assist-profile-clear:hover { background: rgba(255,255,255,0.05); }' +
  
  /* ROWS (TOGGLES/RADIOS) */
  '.ca-assist-toggle { width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; min-height: 56px; border-bottom: 1px solid rgba(255,255,255,0.04); cursor: pointer; transition: background 0.15s; }' +
  '.ca-assist-toggle:last-child { border-bottom: none; }' +
  '.ca-assist-toggle:hover { background: rgba(255,255,255,0.02); }' +
  '.ca-assist-toggle__label { font-size: 14px; color: rgba(255,255,255,0.9); }' +
  '.ca-assist-toggle__hint { font-size: 11px; color: rgba(255,255,255,0.4); margin-top: 4px; }' +
  
  /* SLIDER SWITCH */
  '.ca-assist-switch__track { position: relative; width: 44px; height: 24px; border-radius: 24px; background: rgba(255,255,255,0.1); transition: background 0.2s; border: 1px solid rgba(255,255,255,0.05); box-shadow: inset 0 2px 4px rgba(0,0,0,0.2); }' +
  '.ca-assist-toggle.is-on .ca-assist-switch__track { background: #10b981; border-color: #059669; }' +
  '.ca-assist-switch__thumb { position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform 0.2s cubic-bezier(0.4, 0.0, 0.2, 1); box-shadow: 0 2px 4px rgba(0,0,0,0.3); }' +
  '.ca-assist-toggle.is-on .ca-assist-switch__thumb { transform: translateX(20px); }' +
  
  /* NAV ROW (RADIOS ETC) */
  '.ca-assist-navrow { width: 100%; display: flex; align-items: center; justify-content: space-between; padding: 16px 24px; min-height: 56px; border-bottom: 1px solid rgba(255,255,255,0.04); cursor: pointer; }' +
  '.ca-assist-navrow:last-child { border-bottom: none; }' +
  '.ca-assist-navrow:hover { background: rgba(255,255,255,0.02); }' +
  '.ca-assist-navrow__label { font-size: 14px; color: rgba(255,255,255,0.9); }' +
  '.ca-assist-navrow__right { display: flex; align-items: center; gap: 12px; }' +
  '.ca-assist-navrow__val { font-size: 14px; color: rgba(255,255,255,0.5); }' +
  '.ca-assist-navrow__chev { font-size: 18px; color: rgba(255,255,255,0.3); }' +
  
  /* VALUE STEPPERS */
  '.ca-assist-step { display: flex; align-items: center; justify-content: center; gap: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 99px; padding: 4px; }' +
  '.ca-assist-step__btn { width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,0.05); color: #fff; font-size: 18px; line-height: 1; display: flex; align-items: center; justify-content: center; transition: background 0.15s; }' +
  '.ca-assist-step__btn:hover { background: rgba(255,255,255,0.15); }' +
  '.ca-assist-step__val { min-width: 48px; text-align: center; font-size: 13px; color: #fff; font-weight: 500; }' +
  
  /* FOOTER */
  '.ca-assist-footer { padding: 24px; display: flex; flex-direction: column; align-items: stretch; gap: 16px; background: rgba(0,0,0,0.2); }' +
  '.ca-assist-footer-dynamic { display: flex; flex-direction: column; gap: 16px; width: 100%; }' +
  '.ca-assist-footlink { font-size: 14px; color: rgba(255,255,255,0.6); text-align: center; }' +
  '.ca-assist-footlink:hover { color: #fff; }' +
  '.ca-assist-footreset { display: none; }' + // Hide native reset
  '.ca-assist-custom-reset-btn { width: 100%; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; color: #fff; background: rgba(255,255,255,0.02); border-bottom: 1px solid rgba(255,255,255,0.04); border-top: 1px solid rgba(255,255,255,0.04); font-size: 14px; cursor: pointer; margin-top: 24px; }' +
  '.ca-assist-custom-reset-btn::after { content: "›"; opacity: 0.5; font-size: 16px; }' +
  '.ca-assist-footer-brand { display: flex; justify-content: center; margin-top: 8px; }' +
  '.ca-assist-footer-brand .ca-assist-brand { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 10px 24px; border-radius: 99px; }' +
  '.ca-assist-footer-brand img { max-height: 16px !important; }' +
  '.ca-assist-footer-lang { display: flex; align-items: center; gap: 12px; padding: 0 12px; }' +
  '.ca-assist-footer-globe { color: rgba(255,255,255,0.5); }' +
  
  '.ca-assist-sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }' +
  '';\n`;

content = content.replace(/var widgetCss='' \+[\s\S]*?'';\n/, cssRewrite);

// Replace "Reset" visually at the bottom of the body (before footer)
// In rerenderPanel(), we append reset logic.
const oldResetLogic = `var reset=document.createElement('button');
    reset.type='button';
    reset.className='ca-assist-footreset';`;

const newResetLogic = `var customReset = document.createElement('div');
    customReset.className = 'ca-assist-custom-reset-btn';
    customReset.textContent = 'Reset';
    customReset.addEventListener('click', function(){ applyProfile('clear'); track('reset',{}); });
    panelBody.appendChild(customReset);
    
    var reset=document.createElement('button');
    reset.type='button';
    reset.className='ca-assist-footreset';`;

if (content.includes("var customReset") === false) {
    content = content.replace(oldResetLogic, newResetLogic);
}

// Adjust the top logo in head explicitly by inserting the logo DOM directly inside ca-assist-brand-row and stripping titles.
const headDomRewrite = `var head=document.createElement('div');
  head.className='ca-assist-head';
  var closeBtn=document.createElement('button');
  closeBtn.type='button';
  closeBtn.id='ca-assist-close';
  closeBtn.className='ca-assist-close';
  closeBtn.setAttribute('data-carbon-key','close');
  closeBtn.setAttribute('aria-label',t('closePanel'));
  closeBtn.textContent='×';
  closeBtn.addEventListener('click',function(){setOpen(false);});
  
  var topBrandGroup = document.createElement('div');
  topBrandGroup.className = 'ca-assist-brand-header';
  var topLogo = document.createElement('img');
  topLogo.src = 'https://cdn.shopify.com/s/files/1/0680/6572/2620/files/Carbon_stacked_white.eps?v=1774083466';
  topLogo.className = 'ca-assist-logo-img';
  topLogo.alt = 'Carbon';
  topBrandGroup.appendChild(topLogo);
  
  var title=document.createElement('div');
  title.id='ca-assist-panel-title';
  title.className='ca-assist-title';
  title.textContent='Carbon Assist';
  
  var hel=document.createElement('div');
  hel.id='ca-assist-panel-desc';
  hel.className='ca-assist-helper';
  hel.textContent='Accessibility Preferences';
  
  var texts = document.createElement('div');
  texts.className = 'ca-assist-head-titles';
  texts.appendChild(title);
  texts.appendChild(hel);
  
  head.appendChild(closeBtn);
  head.appendChild(topBrandGroup);
  head.appendChild(texts);
  
  panel.setAttribute('aria-labelledby',title.id);
  panel.setAttribute('aria-describedby',hel.id);
  panel.appendChild(head);`;

content = content.replace(/var head=document\.createElement\('div'\);[\s\S]*?panel\.appendChild\(head\);/, headDomRewrite);

fs.writeFileSync(targetFile, content, 'utf8');
console.log('Update complete');
