const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'app/accessibility/page.tsx');
let content = fs.readFileSync(file, 'utf8');

// Find the return statement - replace everything from "  return (" to end of function
// The function ends with the closing "}" after the JSX
const returnStart = content.indexOf('\n  return (');
if (returnStart === -1) {
  console.error('Could not find return statement');
  process.exit(1);
}

// Keep everything up to (but not including) the return
const logic = content.slice(0, returnStart);

const newJsx = `
  return (
    <main className={styles.page}>
      <style dangerouslySetInnerHTML={{__html: \`
        .app-bg-top-photo, .app-bg-top-fade { display: none !important; }
      \`}} />

      {/* HERO */}
      <header className={styles.hero}>
        <h1 className={styles.heroTitle}>Accessibility</h1>
        <p className={styles.heroSub}>Manage the accessibility assistant and site compliance status.</p>
      </header>

      {/* TAB BAR */}
      <nav className={styles.tabBar}>
        <div className={styles.tabsRow}>
          <button className={styles.tab}>Docs</button>
          <button className={styles.tab}>Tickets</button>
          <button className={styles.tab}>Log History</button>
          <button className={\`\${styles.tab} \${styles.tabActive}\`}>Widget</button>
        </div>
        <button
          className={styles.publishBtn}
          onClick={saveSettings}
          disabled={settingsSaving || !canSaveSettings}
        >
          {settingsSaving ? 'Saving...' : 'Publish Changes ›'}
        </button>
      </nav>

      {/* SUCCESS BANNER */}
      {settings.complianceChecklist.monthlyRetestDone && (
        <div className={styles.successBanner}>
          <div className={styles.bannerCheck}>✓</div>
          Monthly retest and evidence log completed
        </div>
      )}

      {/* MAIN LAYOUT */}
      <div className={styles.layout}>

        {/* LEFT COLUMN */}
        <div className={styles.mainCol}>

          {/* ACCESSIBILITY PANEL */}
          <section className={styles.glassPanel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Accessibility</h2>
              <button className={styles.panelAction}>Crees Festens ▾</button>
            </div>

            {/* Brand row */}
            <div className={styles.brandRow}>
              <div className={styles.brandLeft}>
                <span className={styles.brandHex}>⬡</span>
                <span>CARBON ASSIST</span>
              </div>
              <div className={styles.activeBadge}>Active</div>
            </div>

            {/* Profile strip */}
            <div className={styles.profileSection}>
              <span className={styles.profileLabel}>Accessibility preferences</span>
              <div className={styles.profileStrip}>
                <button className={styles.pill}>Retail</button>
                <button className={styles.pill}>Low Vision</button>
                <button className={styles.pill}>Motor</button>
                <button className={styles.pill}>Dyslexia</button>
                <button className={styles.pill}>ADHD</button>
                <button className={styles.pillAdd}>New ›</button>
              </div>
            </div>

            {/* Widget preview card */}
            <div className={styles.widgetPreviewCard}>
              {/* Mini widget mockup on left */}
              <div className={styles.wpLeft}>
                <div className={styles.wpMiniHead}>
                  <div className={styles.wpMiniBrand}>
                    <span>⬡</span> CARBON ASSIST
                  </div>
                  <button className={styles.wpMiniClose} onClick={removeRuntimeWidgetFromPage}>×</button>
                </div>
                <div className={styles.wpMiniTitle}>Accessibility preferences</div>
                <div className={styles.wpMiniSub}>Tune display, motion, and navigation for this site.</div>
                <div className={styles.wpMiniProfiles}>
                  <span className={styles.wpMiniPill}>Blind</span>
                  <span className={styles.wpMiniPill}>Low Vision</span>
                  <span className={styles.wpMiniPill}>Motor</span>
                  <span className={styles.wpMiniPill}>Dyslexia</span>
                  <span className={styles.wpMiniPill}>ADHD</span>
                  <span className={styles.wpMiniPill}>Seizure Safe</span>
                </div>
              </div>
              {/* Action buttons on right */}
              <div className={styles.wpRight}>
                <div className={styles.wpActionGroup}>
                  <button className={styles.wpBtn} onClick={installRuntimeWidgetOnPage}>
                    {runtimeWidgetMounted ? 'Reload Preview ›' : 'Open Preview ›'}
                  </button>
                  <button className={styles.wpBtn} onClick={() => setPreviewOpen(!previewOpen)}>↺</button>
                  <button className={styles.wpBtn} onClick={() => setPreviewOpen(!previewOpen)}>View ↓</button>
                </div>
                <div className={styles.wpActionGroup}>
                  <button className={styles.wpBtn} onClick={() => document.getElementById('snippets')?.scrollIntoView({behavior:'smooth'})}>
                    Installation Snippets ▾
                  </button>
                  <button className={styles.wpBtn} onClick={() => { removeRuntimeWidgetFromPage(); setRuntimeWidgetMounted(false); }}>
                    Uninstall
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom action row */}
            <div className={styles.actionRow}>
              <button className={styles.outlineBtn} onClick={installRuntimeWidgetOnPage}>Open Preview</button>
              <button className={styles.outlineBtn} onClick={() => setPreviewOpen(!previewOpen)}>View ›</button>
              <button className={styles.outlineBtn} onClick={() => document.getElementById('snippets')?.scrollIntoView({behavior:'smooth'})}>
                ↺ Installation Snippets
              </button>
              <button className={styles.outlineBtn} style={{border:'none',background:'transparent',color:'rgba(255,255,255,0.4)'}}>✐</button>
            </div>
          </section>

          {/* INSTALLATION SNIPPETS */}
          <section id="snippets" className={styles.glassPanel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Installation Snippets</h2>
              <button className={styles.panelAction} onClick={copySnippet}>
                {copied ? '✓ Copied' : '••• ↺ Refresh'}
              </button>
            </div>

            <div className={styles.snippetSection}>
              <div>
                <div className={styles.snippetLabel}>Site Snippet</div>
                <div className={styles.snippetBox}>
                  <code className={styles.snippetCode}>
                    {installSnippet ? installSnippet.slice(0, 72) + '...' : '<script src="https://example.com/accessibility.js" async></script>'}
                  </code>
                  <button className={styles.snippetCopyBtn} onClick={copySnippet}>
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
              <div>
                <div className={styles.snippetLabel}>App Snippet</div>
                <div className={styles.snippetBox}>
                  <code className={styles.snippetCode}>
                    {managedInstallSnippet ? managedInstallSnippet.slice(0, 72) + '...' : 'const carbonAssist = require("carbon-assist");'}
                  </code>
                  <button className={styles.snippetCopyBtn} onClick={copyManagedSnippet}>
                    {copyManagedState ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>
            </div>

            <button className={styles.outlineBtn} style={{alignSelf:'flex-start'}}>Check Installation</button>
          </section>

          {/* LAW WATCH STATUS */}
          <section className={styles.glassPanel}>
            <div className={styles.panelHeader}>
              <h2 className={styles.panelTitle}>Law Watch Status</h2>
              <button className={styles.panelAction} onClick={runLawWatchNow}>••• ↺ Reset</button>
            </div>
            <p className={styles.lawDesc}>
              Daily automated checks for accessibility law/regulation source updates (ADA.gov, Federal regulators,
              etc.)
            </p>
            <div className={styles.actionRow}>
              <button className={styles.outlineBtn} onClick={runLawWatchNow} disabled={lawWatchRunning}>
                {lawWatchRunning ? 'Refreshing...' : 'Refresh Status'}
              </button>
              <button className={styles.outlineBtn} style={{width:'42px',justifyContent:'center'}}>✓</button>
              <button className={styles.outlineBtn} onClick={runLawWatchNow} disabled={lawWatchRunning}>
                Run Law watch now
              </button>
            </div>
            {lawWatchStatus && <p className={styles.lawDesc} style={{color:'rgba(255,255,255,0.7)'}}>{lawWatchStatus}</p>}
          </section>

        </div>{/* end mainCol */}

        {/* RIGHT RAIL */}
        <aside className={styles.rail}>

          {/* API STATUS */}
          <section className={styles.railCard}>
            <div className={styles.railCardHead}>
              <span className={styles.railCardTitle}>API STATUS</span>
              <button className={styles.railCloseBtn}>×</button>
            </div>
            <div className={styles.railRow}>
              <span>Shopify</span>
              <span className={styles.dotActive}>Active</span>
            </div>
            <div className={styles.railRow}>
              <span>Lightspeed API</span>
              <span className={styles.dotActive}>Active</span>
            </div>
            <div className={styles.railRow}>
              <span>Dropbox</span>
              <span className={styles.dotActive}>Active</span>
            </div>
          </section>

          {/* CHATGPT */}
          <section className={\`\${styles.railCard} \${styles.chatCard}\`}>
            <div className={styles.chatHead}>
              <div className={styles.chatTitle}>
                <span>⬡</span> ChatGPT
              </div>
              <button className={styles.chatRefresh}>↺</button>
            </div>
            <p className={styles.chatSub}>Ask anything.</p>
            <div className={styles.chatLog}>No chat messages.</div>
            <div className={styles.chatInputRow}>
              <span>Message ChatGPT...</span>
              <span>›</span>
            </div>
            <div className={styles.chatBtns}>
              <button className={styles.chatSendBtn}>Send</button>
              <button className={styles.chatClearBtn}>Clear</button>
            </div>
          </section>

          {/* COMPLIANCE CHECKLIST */}
          <section className={\`\${styles.railCard} \${styles.complianceCard}\`}>
            <div className={styles.railCardHead}>
              <span className={styles.complianceTitle}>🌐 Compliance Checklist</span>
            </div>
            <div className={styles.progressWrap}>
              <span className={styles.progressLabel}>Remediation progress</span>
              <div className={styles.progressBar}>
                <div className={styles.progressFill} style={{width:\`\${checklistCompletion.percent}%\`}} />
              </div>
            </div>
            <div className={styles.statsRow}>
              <span className={styles.statBig}>
                {String(checklistCompletion.done).padStart(2,'0')} / {String(checklistCompletion.total).padStart(2,'0')}
              </span>
              <span className={styles.statSuffix}>({checklistCompletion.percent}%)</span>
            </div>
            <div className={styles.statMeta}>
              <div className={styles.statMetaRow}>
                <span className={styles.statMetaNum}>1:38s</span>
                <span className={styles.statMetaLabel}>Avg. Automation<br/>Time</span>
              </div>
              <div className={styles.statMetaRow}>
                <span className={styles.statMetaNum}>3.6%</span>
                <span className={styles.statMetaLabel}>Assist Clickthrough<br/>Rate</span>
              </div>
            </div>
            <button className={styles.logLink}>View log history ⓘ</button>
          </section>

          {/* LAW WATCH RAIL */}
          <section className={\`\${styles.railCard} \${styles.lawWatchCard}\`}>
            <div className={styles.railCardHead}>
              <span className={styles.complianceTitle}>⏱ Law Watch Status</span>
            </div>
            <p className={styles.lawDesc} style={{fontSize:'12px',marginTop:'-4px'}}>
              Daily automated checks for accessibility law/regulation source updates (ADA.gov, Federal regulations, Florida statutes).
            </p>
            <div className={styles.lawStatusBox}>
              <span className={styles.lawStatusLabel}>Current Compliance:</span>
              <span className={styles.statusGreen}>active/ok</span>
            </div>
            <div className={styles.lawActionRow}>
              <button className={styles.lawBtn}>Send</button>
              <button className={styles.lawBtn}>Clear</button>
            </div>
          </section>

        </aside>
      </div>
    </main>
  );
}
`;

const newContent = logic + newJsx;
fs.writeFileSync(file, newContent, 'utf8');
console.log('page.tsx JSX rewritten successfully. Total lines:', newContent.split('\n').length);
