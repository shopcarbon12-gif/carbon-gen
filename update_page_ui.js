const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'app/accessibility/page.tsx');
let content = fs.readFileSync(file, 'utf8');

const anchor = '  return (';
const idx = content.indexOf(anchor);

if (idx === -1) {
  console.error("COULD NOT FIND ANCHOR IN PAGE.TSX");
  process.exit(1);
}

const headerPart = content.substring(0, idx);

const newJsx = `  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <h1 className={styles.heroTitle}>Accessibility</h1>
        <p className={styles.heroSub}>Manage the accessibility assistant and site compliance status.</p>
      </header>
      
      <nav className={styles.tabBar}>
        <div className={styles.tabs}>
          <button className={styles.tab}>Docs</button>
          <button className={styles.tab}>Tickets</button>
          <button className={styles.tab}>Log History</button>
          <button className={\`\${styles.tab} \${styles.tabActive}\`}>Widget</button>
        </div>
        <button className={styles.publishBtn} onClick={saveSettings} disabled={settingsSaving || !canSaveSettings}>
          {settingsSaving ? "Saving..." : "Publish Changes \\u203a"}
        </button>
      </nav>

      {settings.complianceChecklist.monthlyRetestDone && (
         <div className={styles.successBanner}>✓ Monthly retest and evidence log completed</div>
      )}

      <div className={styles.layout}>
         <div className={styles.mainCol}>
            {/* Accessibility config panel */}
            <section className={styles.glassPanel}>
               <div className={styles.panelHeader}>
                 <h2 className={styles.panelTitle}>Accessibility</h2>
                 <div className={styles.panelActions}>
                    <span className={styles.activeDot}>Active</span>
                    <input className={styles.scopeInput} value={settingsScope} onChange={(e) => setSettingsScope(e.target.value)} placeholder="default" />
                 </div>
               </div>
               
               <div className={styles.brandRow}>
                 <div className={styles.brandLeft}>
                   <span className={styles.hexGlyph}>⬡</span>
                   CARBON ASSIST
                 </div>
                 <div className={styles.activeDot}>Active</div>
               </div>
               
               <div className={styles.profileSection}>
                 <span className={styles.profileLabel}>Accessibility preferences</span>
                 <div className={styles.profileStrip}>
                   <span className={styles.profilePill}>Retail</span>
                   <span className={styles.profilePill}>Low Vision</span>
                   <span className={styles.profilePill}>Motor</span>
                   <span className={styles.profilePill}>Dyslexia</span>
                   <span className={styles.profilePill}>ADHD</span>
                   <button className={styles.profilePillAdd}>New \\u203a</button>
                 </div>
               </div>

               {/* Widget Preview inside the Page */}
               <div className={styles.widgetPreviewCard}>
                 <div className={styles.wpHead}>
                   <div className={styles.wpBrand}><span className={styles.hexGlyph}>⬡</span> CARBON ASSIST</div>
                   <button className={styles.wpClose} onClick={removeRuntimeWidgetFromPage}>×</button>
                 </div>
                 <div className={styles.wpSplit}>
                    <div className={styles.wpBody}>
                      <span className={styles.wpEyebrow}>Accessibility preferences</span>
                      <span className={styles.wpSubtitle}>Tune display, motion, and navigation for this site.</span>
                      <div className={styles.wpProfiles}>
                         <span className={styles.wpProfilePill}>Blind</span>
                         <span className={styles.wpProfilePill}>Low Vision</span>
                         <span className={styles.wpProfilePill}>Motor</span>
                         <span className={styles.wpProfilePill}>Dyslexia</span>
                         <span className={styles.wpProfilePill}>ADHD</span>
                         <span className={styles.wpProfilePill}>Seizure Safe</span>
                      </div>
                    </div>
                    <div className={styles.wpActionsCol}>
                      <button className={styles.wpActionBtn} onClick={installRuntimeWidgetOnPage}>
                         {runtimeWidgetMounted ? "Reload Preview \\u203a" : "Open Preview \\u203a"}
                      </button>
                      <button className={styles.wpActionBtn} onClick={() => setPreviewOpen(!previewOpen)}>
                         View {previewOpen ? "↑" : "↓"}
                      </button>
                      <button className={styles.wpActionBtn} onClick={() => { removeRuntimeWidgetFromPage(); setRuntimeWidgetMounted(false); }}>
                         ↺
                      </button>
                    </div>
                 </div>
               </div>

               <div className={styles.actionRow}>
                 <button className={styles.outlineBtn} onClick={installRuntimeWidgetOnPage}>Open Preview</button>
                 <button className={styles.outlineBtn} onClick={() => setPreviewOpen(!previewOpen)}>View {previewOpen ? "↑" : "↓"}</button>
                 <button className={styles.outlineBtn} onClick={() => document.getElementById("snippets")?.scrollIntoView({behavior: "smooth"})}>Installation Snippets \\u203a</button>
                 <button className={styles.outlineBtn} onClick={() => { removeRuntimeWidgetFromPage(); setRuntimeWidgetMounted(false); }}>Uninstall</button>
               </div>
            </section>

            <section id="snippets" className={styles.glassPanel}>
               <div className={styles.panelHeader}>
                 <h2 className={styles.panelTitle}>Installation Snippets</h2>
                 <button className={styles.outlineBtn} onClick={copySnippet} style={{width:'auto', padding:'4px 12px'}}>
                   {copied ? "Copied!" : "↺ Refresh"}
                 </button>
               </div>
               
               <div>
                 <span className={styles.subLabel}>Site Snippet</span>
                 <div className={styles.snippetBox}>
                   <code>{installSnippet ? installSnippet.slice(0, 70) + '...' : ''}</code>
                   <button className={styles.snippetCopy} onClick={copySnippet}>{copied ? 'Copied' : 'Copy'}</button>
                 </div>
               </div>
               
               <div>
                 <span className={styles.subLabel}>App Snippet</span>
                 <div className={styles.snippetBox}>
                   <code>const carbonAssist = require("carbon-assist");</code>
                   <button className={styles.snippetCopy}>Copy</button>
                 </div>
               </div>
               
               <button className={styles.outlineBtn} style={{alignSelf: 'flex-start'}}>Check Installation</button>
            </section>

            <section className={styles.glassPanel}>
               <div className={styles.panelHeader}>
                 <h2 className={styles.panelTitle}>Law Watch Status</h2>
                 <div className={styles.panelActions}>
                   <span className={styles.activeDot}></span>
                   <button className={styles.outlineBtn} onClick={runLawWatchNow} style={{padding: '4px 12px'}}>↺ Reset</button>
                 </div>
               </div>
               <p className={styles.lawWatchDesc}>Daily automated checks for accessibility law/regulation source updates (ADA.gov, Federal regulators, etc.)</p>
               <div className={styles.lawWatchRow}>
                 <button className={styles.outlineBtn} onClick={runLawWatchNow} disabled={lawWatchRunning}>{lawWatchRunning ? "Refreshing..." : "Refresh Status"}</button>
                 <button className={styles.outlineBtn} style={{width:'40px'}}>✓</button>
                 <button className={styles.outlineBtn} onClick={runLawWatchNow}>Run Law watch now</button>
               </div>
               {lawWatchStatus && <span className={styles.lawWatchDesc}>{lawWatchStatus}</span>}
            </section>
         </div>

         {/* SIDEBAR RIGHT RAIL */}
         <div className={styles.mainCol}>
            <section className={styles.railCard}>
               <div className={styles.railCardHeader}>
                 API STATUS
                 <button className={styles.wpClose}>×</button>
               </div>
               <div className={styles.railItemRow}>
                 <span>Shopify</span>
                 <span className={styles.railStatusDot}><span style={{color:'#10b981'}}>●</span> Active</span>
               </div>
               <div className={styles.railItemRow}>
                 <span>Lightspeed API</span>
                 <span className={styles.railStatusDot}><span style={{color:'#10b981'}}>●</span> Active</span>
               </div>
               <div className={styles.railItemRow}>
                 <span>Dropbox</span>
                 <span className={styles.railStatusDot}><span style={{color:'#10b981'}}>●</span> Active</span>
               </div>
            </section>

            <section className={styles.railCard}>
               <div className={styles.railCardHeader}>
                 <span style={{display:'flex', alignItems:'center', gap:'8px'}}><span className={styles.hexGlyph}>⬡</span> ChatGPT</span>
                 <span>↻</span>
               </div>
               <div className={styles.lawWatchDesc}>Ask anything.</div>
               <div className={styles.railItemRow} style={{height: '120px', alignItems:'flex-start'}}>
                 <span style={{color: 'rgba(255,255,255,0.4)'}}>No chat messages yet.</span>
               </div>
               <div className={styles.railItemRow}>
                 <span style={{color: 'rgba(255,255,255,0.4)'}}>Message ChatGPT...</span>
                 <span>\\u203a</span>
               </div>
               <div className={styles.actionRow}>
                 <button className={styles.outlineBtn}>Send</button>
                 <button className={styles.outlineBtn}>Clear</button>
               </div>
            </section>

            <section className={styles.railCard}>
               <div className={styles.railCardHeader}>
                 Compliance Checklist
               </div>
               <div className={styles.progressWrap}>
                 <span className={styles.progressLabel}>Remediation progress</span>
                 <div className={styles.progressBar}><div className={styles.progressFill} style={{width: \`\${checklistCompletion.percent}%\`}}></div></div>
               </div>
               <div className={styles.statsRow}>
                 <span className={styles.statBig}>{String(checklistCompletion.done).padStart(2,'0')} / {checklistCompletion.total}</span>
                 <span className={styles.statSmall}>({checklistCompletion.percent}%)</span>
               </div>
               <div className={styles.statsRow}>
                 <span className={styles.statBig}>1:38s</span>
                 <span className={styles.statsSubtext}>Avg. Automation Times</span>
               </div>
               <div className={styles.statsRow}>
                 <span className={styles.statBig}>3.6%</span>
                 <span className={styles.statsSubtext}>Assist Clickthrough Rate</span>
               </div>
               <button className={styles.outlineBtn}>View Log History ⓘ</button>
            </section>
            
            <section className={styles.railCard}>
               <div className={styles.railCardHeader}>
                 Law Watch Status
               </div>
               <div className={styles.lawWatchDesc}>Daily automated checks for accessibility law updates (ADA.gov, Federal regs, Florida statues).</div>
               <div className={styles.lawWatchStatusBox}>
                 <span className={styles.lawWatchStatusLabel}>Current Compliance:</span>
                 <span className={styles.railStatusDot}><span style={{color:'#10b981'}}>●</span> active/ok</span>
               </div>
               <div className={styles.actionRow}>
                 <button className={styles.outlineBtn}>Send</button>
                 <button className={styles.outlineBtn}>Clear</button>
               </div>
            </section>
         </div>
      </div>
    </main>
  );
}
`;

fs.writeFileSync(file, headerPart + newJsx, 'utf8');
console.log("PAGE JSX UPDATED.");
