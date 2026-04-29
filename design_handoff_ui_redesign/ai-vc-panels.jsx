// ai-vc-panels.jsx — Header, SessionsDrawer, ThinkingPanel, SettingsModal
const { useState, useEffect } = React;

/* ── Header ── */
function Header({ workspace, onWorkspace, thinkingOpen, onThinkingToggle, onSessionToggle, onSettings }) {
  const WS = [
    { id: "chat",  label: "Chat" },
    { id: "code",  label: "Code" },
    { id: "image", label: "Image" },
  ];
  return (
    <header style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "0 14px", height: 50, flexShrink: 0,
      background: "rgba(20,16,11,0.97)",
      borderBottom: "1px solid var(--stroke)",
      backdropFilter: "blur(12px)",
      zIndex: 10, position: "relative",
    }}>
      {/* Hamburger */}
      <button onClick={onSessionToggle} className="hdr-icon-btn" aria-label="Sessions" title="Sessions">
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none">
          <rect y="0"  width="16" height="1.5" rx="1" fill="currentColor"/>
          <rect y="5"  width="12" height="1.5" rx="1" fill="currentColor"/>
          <rect y="10" width="16" height="1.5" rx="1" fill="currentColor"/>
        </svg>
      </button>

      {/* Workspace tabs */}
      <nav style={{ display: "flex", alignItems: "center", gap: 0, marginLeft: 6 }}>
        {WS.map(w => (
          <button
            key={w.id}
            onClick={() => onWorkspace(w.id)}
            style={{
              background: "none", border: "none", cursor: "pointer",
              fontFamily: "var(--font)", fontSize: 14,
              fontWeight: workspace === w.id ? 700 : 400,
              color: workspace === w.id ? "var(--ink)" : "var(--muted)",
              padding: "0 12px", height: 50,
              borderBottom: workspace === w.id
                ? "2px solid var(--accent)"
                : "2px solid transparent",
              transition: "color 0.15s, border-color 0.15s",
              letterSpacing: workspace === w.id ? 0.2 : 0,
            }}
          >{w.label}</button>
        ))}
      </nav>

      <div style={{ flex: 1 }} />

      {/* Model selector */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "4px 10px",
        border: "1px solid var(--stroke)",
        borderRadius: 8, background: "rgba(255,255,255,0.04)",
      }}>
        <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font)" }}>Model</span>
        <select style={{
          background: "none", border: "none", color: "var(--ink)",
          fontFamily: "var(--font)", fontSize: 13, cursor: "pointer",
          outline: "none",
        }}>
          <option>gemma4:e4b</option>
          <option>llama3.2</option>
          <option>mistral</option>
        </select>
      </div>

      {/* Source toggle */}
      <div style={{
        display: "flex", borderRadius: 8,
        border: "1px solid var(--stroke)",
        overflow: "hidden", background: "rgba(255,255,255,0.04)",
      }}>
        {["Local","API"].map((s,i) => (
          <button key={s} style={{
            background: i===0 ? "rgba(212,87,42,0.18)" : "none",
            border: "none",
            borderLeft: i===1 ? "1px solid var(--stroke)" : "none",
            color: i===0 ? "var(--accent)" : "var(--muted)",
            fontFamily: "var(--font)", fontSize: 12, fontWeight: 600,
            padding: "4px 10px", cursor: "pointer",
          }}>{s}</button>
        ))}
      </div>

      {/* Personality */}
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "4px 10px",
        border: "1px solid var(--stroke)",
        borderRadius: 8, background: "rgba(255,255,255,0.04)",
      }}>
        <span style={{ fontSize: 11, color: "var(--muted)", fontFamily: "var(--font)" }}>Persona</span>
        <select style={{
          background: "none", border: "none", color: "var(--ink)",
          fontFamily: "var(--font)", fontSize: 13, cursor: "pointer",
          outline: "none",
        }}>
          <option>Testing</option>
          <option>Chill Mode</option>
          <option>Assistant</option>
        </select>
      </div>

      {/* Thinking toggle */}
      <button
        onClick={onThinkingToggle}
        title="Toggle Thinking panel"
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "5px 12px", borderRadius: 8, cursor: "pointer",
          fontFamily: "var(--font)", fontSize: 12, fontWeight: 600,
          border: "1px solid",
          borderColor: thinkingOpen ? "rgba(74,160,140,0.6)" : "var(--stroke)",
          background: thinkingOpen ? "rgba(74,160,140,0.15)" : "rgba(255,255,255,0.04)",
          color: thinkingOpen ? "#7ecfc0" : "var(--muted)",
          transition: "all 0.2s",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M5 5.5C5 4.12 5.895 3 7 3s2 1.12 2 2.5c0 1-.5 1.8-1.25 2.2V9h-1.5V7.7C5.5 7.3 5 6.5 5 5.5Z" fill="currentColor"/>
          <circle cx="7" cy="11" r="0.7" fill="currentColor"/>
        </svg>
        Thinking
      </button>

      {/* Settings */}
      <button onClick={onSettings} className="hdr-icon-btn" title="Settings">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.93 2.93l1.41 1.41M11.66 11.66l1.41 1.41M2.93 13.07l1.41-1.41M11.66 4.34l1.41-1.41" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      </button>
    </header>
  );
}

/* ── Sessions Drawer ── */
function SessionsDrawer({ open, onClose }) {
  const sessions = [
    { id: "163B2641", ts: "4/19/26 · 12:32 PM", active: true },
    { id: "14A9F320", ts: "4/18/26 · 9:14 AM",  active: false },
    { id: "12CC09AB", ts: "4/17/26 · 3:55 PM",  active: false },
    { id: "0F3E1128", ts: "4/15/26 · 11:08 AM", active: false },
  ];
  return (
    <>
      {/* Scrim */}
      <div
        onClick={onClose}
        style={{
          position: "absolute", inset: 0, zIndex: 25,
          background: "rgba(14,10,7,0.55)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "all" : "none",
          transition: "opacity 0.22s ease",
        }}
      />
      {/* Panel */}
      <div style={{
        position: "absolute", left: 0, top: 0, bottom: 0, zIndex: 26,
        width: 240,
        background: "rgba(22,17,11,0.98)",
        borderRight: "1px solid var(--stroke)",
        backdropFilter: "blur(20px)",
        display: "flex", flexDirection: "column",
        transform: open ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.22s cubic-bezier(0.4,0,0.2,1)",
      }}>
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "14px 16px 10px",
          borderBottom: "1px solid var(--stroke)",
        }}>
          <span style={{ fontFamily: "var(--font)", fontSize: 13, fontWeight: 700, color: "var(--ink)", letterSpacing: 1.5, textTransform: "uppercase" }}>Sessions</span>
          <button onClick={onClose} className="ghost-btn" style={{ fontSize: 16 }}>✕</button>
        </div>

        <div style={{ padding: "10px 12px", display: "flex", gap: 6 }}>
          <button className="btn-primary" style={{ flex: 1 }}>+ New session</button>
          <button className="btn-ghost" style={{ flex: 1, fontSize: 12 }}>Personality</button>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "4px 12px 12px" }}>
          {sessions.map(s => (
            <div key={s.id} style={{
              padding: "9px 11px", marginBottom: 6, borderRadius: 8, cursor: "pointer",
              border: "1px solid",
              borderColor: s.active ? "rgba(212,87,42,0.45)" : "var(--stroke)",
              background: s.active ? "rgba(212,87,42,0.1)" : "rgba(255,255,255,0.03)",
              transition: "background 0.15s",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <span style={{ fontFamily: "var(--font)", fontSize: 13, color: s.active ? "var(--ink)" : "var(--muted)", fontWeight: s.active ? 600 : 400 }}>
                  Session {s.id}
                </span>
                {s.active && <span style={{ fontSize: 10, color: "var(--accent)", fontFamily: "var(--font)", fontWeight: 600 }}>ACTIVE</span>}
              </div>
              <span style={{ fontFamily: "var(--font)", fontSize: 11, color: "var(--muted)" }}>{s.ts}</span>
              {s.active && (
                <div style={{ display: "flex", gap: 6, marginTop: 7 }}>
                  <button className="btn-ghost" style={{ fontSize: 11, padding: "2px 8px" }}>Rename</button>
                  <button style={{
                    background: "rgba(200,50,50,0.12)", border: "1px solid rgba(200,50,50,0.35)",
                    color: "#e87070", borderRadius: 6, fontFamily: "var(--font)",
                    fontSize: 11, padding: "2px 8px", cursor: "pointer",
                  }}>Delete</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* ── Thinking Panel ── */
function ThinkingPanel({ open }) {
  const [rawOpen, setRawOpen] = useState(false);
  const [ctxOpen, setCtxOpen] = useState(false);
  return (
    <div style={{
      width: open ? 420 : 0, flexShrink: 0,
      overflow: "hidden",
      transition: "width 0.22s cubic-bezier(0.4,0,0.2,1)",
    }}>
      <div style={{
        width: 420, height: "100%",
        background: "rgba(18,26,24,0.97)",
        borderLeft: "1px solid rgba(74,160,140,0.2)",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        <div style={{
          padding: "12px 14px 10px",
          borderBottom: "1px solid rgba(74,160,140,0.15)",
          flexShrink: 0,
        }}>
          <span style={{ fontFamily: "var(--font)", fontSize: 12, fontWeight: 700, color: "#7ecfc0", letterSpacing: 1.5, textTransform: "uppercase" }}>Thinking</span>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "10px 14px", display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Tools */}
          <div>
            <div className="think-section-label">Tools used</div>
            <ul style={{ margin: "6px 0 0 0", padding: "0 0 0 14px", display: "flex", flexDirection: "column", gap: 3 }}>
              <li style={{ fontFamily: "var(--font)", fontSize: 12, color: "#7ecfc0" }}>web_search</li>
              <li style={{ fontFamily: "var(--font)", fontSize: 12, color: "#7ecfc0" }}>image_gen</li>
            </ul>
          </div>

          {/* Screenshot */}
          <div>
            <div className="think-section-label">Screenshot</div>
            <div style={{
              marginTop: 6, borderRadius: 6, overflow: "hidden",
              border: "1px solid rgba(74,160,140,0.2)",
              background: "rgba(74,160,140,0.05)",
              height: 80, display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              <span style={{ fontFamily: "var(--font)", fontSize: 11, color: "rgba(126,207,192,0.4)" }}>No screenshot yet</span>
            </div>
          </div>

          {/* Silent response */}
          <div>
            <div className="think-section-label">Silent response</div>
            <p style={{ fontFamily: "var(--font)", fontSize: 12, color: "var(--muted)", marginTop: 6, lineHeight: 1.5 }}>
              No silent response yet.
            </p>
          </div>

          {/* Full context */}
          <div>
            <div className="think-section-label">Full context</div>
            <button className="think-toggle-btn" onClick={() => setCtxOpen(v => !v)} style={{ marginTop: 6 }}>
              {ctxOpen ? "Hide context" : "Show full context"}
            </button>
            {ctxOpen && (
              <pre style={{
                marginTop: 6, padding: "8px 10px", borderRadius: 6,
                background: "rgba(0,0,0,0.3)", fontFamily: "monospace",
                fontSize: 10, color: "rgba(126,207,192,0.7)",
                overflowX: "auto", whiteSpace: "pre-wrap",
              }}>{"[system]: You are a helpful AI...\n[user]: Generate a pirate ship"}</pre>
            )}
          </div>

          {/* Raw output */}
          <div>
            <div className="think-section-label">Raw output</div>
            <button className="think-toggle-btn" onClick={() => setRawOpen(v => !v)} style={{ marginTop: 6 }}>
              {rawOpen ? "Hide raw output" : "Show raw output"}
            </button>
            {rawOpen && (
              <pre style={{
                marginTop: 6, padding: "8px 10px", borderRadius: 6,
                background: "rgba(0,0,0,0.3)", fontFamily: "monospace",
                fontSize: 10, color: "rgba(126,207,192,0.7)",
                overflowX: "auto", whiteSpace: "pre-wrap",
              }}>{"<thinking>\nI should generate an image...\n</thinking>\nImage generated."}</pre>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "8px 14px",
          borderTop: "1px solid rgba(74,160,140,0.15)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <svg viewBox="0 0 20 20" width="16" height="16">
              <circle cx="10" cy="10" r="8" fill="none" stroke="rgba(74,160,140,0.25)" strokeWidth="2"/>
              <circle cx="10" cy="10" r="8" fill="none" stroke="#4aa08c" strokeWidth="2"
                strokeDasharray="25 50" transform="rotate(-90 10 10)"/>
            </svg>
            <span style={{ fontFamily: "var(--font)", fontSize: 11, color: "rgba(126,207,192,0.6)" }}>VRAM 1.5/4 GB</span>
          </div>
          <span style={{ fontFamily: "var(--font)", fontSize: 11, color: "rgba(126,207,192,0.4)" }}>~1.2k</span>
        </div>
      </div>
    </div>
  );
}

/* ── Settings Modal ── */
function SettingsModal({ open, onClose }) {
  const [tab, setTab] = useState("model");
  const tabs = [
    { id: "model",    label: "Model" },
    { id: "voice",    label: "Voice" },
    { id: "context",  label: "Context" },
    { id: "services", label: "Services" },
  ];

  if (!open) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 100,
      background: "rgba(10,7,4,0.75)", backdropFilter: "blur(6px)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{
        width: 460, maxHeight: "85vh",
        background: "#18140e", borderRadius: 14,
        border: "1px solid var(--stroke)",
        boxShadow: "0 24px 80px rgba(0,0,0,0.6)",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Modal header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "16px 20px",
          borderBottom: "1px solid var(--stroke)",
          flexShrink: 0,
        }}>
          <span style={{ fontFamily: "var(--font)", fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>Settings</span>
          <button onClick={onClose} className="ghost-btn">✕</button>
        </div>

        {/* Tabs */}
        <div style={{
          display: "flex", borderBottom: "1px solid var(--stroke)",
          flexShrink: 0,
        }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: "10px 0", border: "none", background: "none", cursor: "pointer",
              fontFamily: "var(--font)", fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
              color: tab === t.id ? "var(--ink)" : "var(--muted)",
              borderBottom: tab === t.id ? "2px solid var(--accent)" : "2px solid transparent",
              transition: "color 0.15s",
            }}>{t.label}</button>
          ))}
        </div>

        {/* Tab body */}
        <div style={{ flex: 1, overflow: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          {tab === "model" && <ModelTab />}
          {tab === "voice" && <VoiceTab />}
          {tab === "context" && <ContextTab />}
          {tab === "services" && <ServicesTab />}
        </div>
      </div>
    </div>
  );
}

function SettingRow({ label, children }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
      <span style={{ fontFamily: "var(--font)", fontSize: 13, color: "var(--muted)" }}>{label}</span>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}
function SettingSection({ title, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <span style={{ fontFamily: "var(--font)", fontSize: 11, fontWeight: 700, color: "var(--accent)", letterSpacing: 1.2, textTransform: "uppercase" }}>{title}</span>
      {children}
    </div>
  );
}
function SegControl({ options, active }) {
  return (
    <div style={{ display: "flex", borderRadius: 8, border: "1px solid var(--stroke)", overflow: "hidden" }}>
      {options.map((o, i) => (
        <button key={o} style={{
          background: o === active ? "rgba(212,87,42,0.2)" : "rgba(255,255,255,0.03)",
          border: "none", borderLeft: i > 0 ? "1px solid var(--stroke)" : "none",
          color: o === active ? "var(--accent)" : "var(--muted)",
          fontFamily: "var(--font)", fontSize: 12, fontWeight: o === active ? 600 : 400,
          padding: "5px 14px", cursor: "pointer",
        }}>{o}</button>
      ))}
    </div>
  );
}
function StyledSelect({ children }) {
  return (
    <select style={{
      background: "rgba(255,255,255,0.06)", border: "1px solid var(--stroke)",
      borderRadius: 7, color: "var(--ink)", fontFamily: "var(--font)", fontSize: 13,
      padding: "5px 10px", outline: "none", cursor: "pointer",
    }}>{children}</select>
  );
}
function StyledInput({ value, width = 80 }) {
  return (
    <input type="number" defaultValue={value} style={{
      width, background: "rgba(255,255,255,0.06)", border: "1px solid var(--stroke)",
      borderRadius: 7, color: "var(--ink)", fontFamily: "var(--font)", fontSize: 13,
      padding: "5px 10px", outline: "none", textAlign: "right",
    }} />
  );
}

function ModelTab() {
  return (
    <>
      <SettingSection title="Source">
        <SettingRow label="Provider"><SegControl options={["Local","API"]} active="Local" /></SettingRow>
        <SettingRow label="Model">
          <StyledSelect>
            <option>gemma4:e4b</option><option>llama3.2</option><option>mistral</option>
          </StyledSelect>
        </SettingRow>
      </SettingSection>
      <div style={{ height: 1, background: "var(--stroke)" }} />
      <SettingSection title="Personalities">
        {["Testing","Chill Mode","Assistant"].map(p => (
          <div key={p} style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            padding: "8px 12px", borderRadius: 8, background: "rgba(255,255,255,0.04)",
            border: "1px solid var(--stroke)",
          }}>
            <span style={{ fontFamily: "var(--font)", fontSize: 13, color: "var(--ink)" }}>{p}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="btn-ghost" style={{ fontSize: 11, padding: "2px 8px" }}>Edit</button>
              <button style={{
                background: "rgba(200,50,50,0.1)", border: "1px solid rgba(200,50,50,0.3)",
                color: "#e87070", borderRadius: 6, fontFamily: "var(--font)", fontSize: 11,
                padding: "2px 8px", cursor: "pointer",
              }}>Delete</button>
            </div>
          </div>
        ))}
        <button className="btn-ghost" style={{ alignSelf: "flex-start" }}>+ Add personality</button>
      </SettingSection>
    </>
  );
}

function VoiceTab() {
  const [tts, setTts] = useState(true);
  return (
    <>
      <SettingSection title="Text-to-Speech">
        <SettingRow label="TTS enabled">
          <button onClick={() => setTts(v => !v)} style={{
            width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer",
            background: tts ? "var(--accent)" : "rgba(255,255,255,0.12)",
            position: "relative", transition: "background 0.2s",
          }}>
            <span style={{
              position: "absolute", top: 2, left: tts ? "calc(100% - 22px)" : 2,
              width: 20, height: 20, borderRadius: 10,
              background: "#fff", transition: "left 0.2s",
            }}/>
          </button>
        </SettingRow>
        <SettingRow label="Provider"><SegControl options={["Browser","Kokoro"]} active="Kokoro" /></SettingRow>
        <SettingRow label="Voice">
          <StyledSelect>
            <option>af_bella</option><option>af_sky</option><option>am_echo</option>
          </StyledSelect>
        </SettingRow>
        <SettingRow label="">
          <button className="btn-ghost" style={{ fontSize: 12 }}>▶ Test voice</button>
        </SettingRow>
      </SettingSection>
    </>
  );
}

function ContextTab() {
  return (
    <>
      <SettingSection title="History">
        <SettingRow label="Max history messages"><StyledInput value={20} /></SettingRow>
        <SettingRow label="Max context tokens (k)"><StyledInput value={4} /></SettingRow>
        <SettingRow label="Max RAG results"><StyledInput value={4} /></SettingRow>
        <SettingRow label="Search method"><SegControl options={["SearXNG","Brave","None"]} active="SearXNG" /></SettingRow>
      </SettingSection>
      <div style={{ height: 1, background: "var(--stroke)" }} />
      <SettingSection title="Capture timing">
        <SettingRow label="Thinking interval (s)"><StyledInput value={120} /></SettingRow>
        <SettingRow label="Screenshot interval (s)"><StyledInput value={240} /></SettingRow>
      </SettingSection>
    </>
  );
}

function ServicesTab() {
  const services = [
    { name: "Kokoro TTS", status: "running", dot: "#4aa08c" },
    { name: "ComfyUI",    status: "stopped", dot: "#e87070" },
  ];
  return (
    <>
      <SettingSection title="Local Services">
        {services.map(svc => (
          <div key={svc.name} style={{
            padding: "12px 14px", borderRadius: 10,
            background: "rgba(255,255,255,0.04)", border: "1px solid var(--stroke)",
            display: "flex", flexDirection: "column", gap: 8,
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, background: svc.dot, display: "inline-block" }}/>
                <span style={{ fontFamily: "var(--font)", fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{svc.name}</span>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn-ghost" style={{ fontSize: 12 }}>{svc.status === "running" ? "Stop" : "Launch"}</button>
                <button className="btn-ghost" style={{ fontSize: 12 }}>Configure ▾</button>
              </div>
            </div>
            <span style={{ fontFamily: "var(--font)", fontSize: 12, color: svc.dot, textTransform: "capitalize" }}>● {svc.status}</span>
          </div>
        ))}
      </SettingSection>
    </>
  );
}

Object.assign(window, { Header, SessionsDrawer, ThinkingPanel, SettingsModal });
