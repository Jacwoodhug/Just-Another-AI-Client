// ai-vc-workspaces.jsx — ChatWorkspace, CodeWorkspace
const { useState, useRef, useEffect } = React;

/* ── Chat Workspace ── */
function ChatWorkspace() {
  const [micActive, setMicActive] = useState(false);
  const [text, setText] = useState("");
  const [screenOn, setScreenOn] = useState(false);
  const [idleOn, setIdleOn]   = useState(false);
  const [loopOn, setLoopOn]   = useState(true);
  const [ttsOn,  setTtsOn]    = useState(false);

  const messages = [
    { role: "ai",   text: "Hello! How can I help you today?" },
    { role: "user", text: "Generate an image of a pirate ship" },
    { role: "ai",   text: null, image: true },
    { role: "user", text: "Can you describe it?" },
    { role: "ai",   text: "The image shows a tall wooden galleon with dark sails sailing through a dramatic fjord. Rocky cliffs rise on both sides and the water is deep blue-green." },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
      {/* Chat log */}
      <div style={{
        flex: 1, overflow: "auto", padding: "20px 24px",
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            display: "flex",
            justifyContent: m.role === "user" ? "flex-end" : "flex-start",
          }}>
            {m.role === "ai" && (
              <div style={{ display: "flex", gap: 10, maxWidth: "75%" }}>
                <div style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  background: "rgba(74,160,140,0.2)", border: "1px solid rgba(74,160,140,0.4)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, marginTop: 2,
                }}>AI</div>
                <div>
                  {m.image && (
                    <div style={{
                      borderRadius: 12, overflow: "hidden", marginBottom: 8,
                      border: "1px solid var(--stroke)",
                      background: "rgba(255,255,255,0.04)",
                      width: 200, height: 130,
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <span style={{ fontFamily: "var(--font)", fontSize: 11, color: "var(--muted)" }}>[ generated image ]</span>
                    </div>
                  )}
                  {m.text && (
                    <div style={{
                      background: "rgba(27,22,16,0.9)", border: "1px solid var(--stroke)",
                      borderRadius: "0 12px 12px 12px",
                      padding: "10px 14px",
                      fontFamily: "var(--font)", fontSize: 14, color: "var(--ink)",
                      lineHeight: 1.55,
                    }}>{m.text}</div>
                  )}
                  {m.image && !m.text && (
                    <div style={{
                      background: "rgba(27,22,16,0.9)", border: "1px solid var(--stroke)",
                      borderRadius: "0 12px 12px 12px",
                      padding: "8px 12px",
                      fontFamily: "var(--font)", fontSize: 13, color: "var(--muted)",
                    }}>Image generated.</div>
                  )}
                </div>
              </div>
            )}
            {m.role === "user" && (
              <div style={{
                background: "var(--accent)", borderRadius: "12px 12px 0 12px",
                padding: "10px 14px", maxWidth: "68%",
                fontFamily: "var(--font)", fontSize: 14, color: "#fff",
                lineHeight: 1.5,
              }}>{m.text}</div>
            )}
          </div>
        ))}

        {/* Listening indicator */}
        {micActive && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
            <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
              {[0,1,2,3].map(i => (
                <div key={i} style={{
                  width: 3, height: [8,14,10,12][i],
                  background: "var(--accent)", borderRadius: 2,
                  animation: "pulse 0.8s ease-in-out infinite",
                  animationDelay: `${i * 0.15}s`,
                }}/>
              ))}
            </div>
            <span style={{ fontFamily: "var(--font)", fontSize: 12, color: "var(--muted)" }}>Listening…</span>
          </div>
        )}
      </div>

      {/* Composer */}
      <div style={{
        padding: "10px 16px 12px",
        borderTop: "1px solid var(--stroke)",
        background: "rgba(20,16,11,0.95)",
        display: "flex", flexDirection: "column", gap: 8,
        flexShrink: 0,
      }}>
        {/* Main input row */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {/* Mic */}
          <button
            onClick={() => setMicActive(v => !v)}
            style={{
              width: 38, height: 38, borderRadius: 10, border: "1px solid",
              borderColor: micActive ? "var(--accent)" : "var(--stroke)",
              background: micActive ? "rgba(212,87,42,0.2)" : "rgba(255,255,255,0.05)",
              color: micActive ? "var(--accent)" : "var(--muted)",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.15s", flexShrink: 0,
            }}
          >
            <svg width="14" height="16" viewBox="0 0 14 16" fill="none">
              <rect x="4" y="0" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M1 8c0 3.31 2.69 6 6 6s6-2.69 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="7" y1="14" x2="7" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>

          {/* Text input */}
          <input
            value={text} onChange={e => setText(e.target.value)}
            placeholder="Type a message…"
            style={{
              flex: 1, background: "rgba(255,255,255,0.06)",
              border: "1px solid var(--stroke)", borderRadius: 10,
              color: "var(--ink)", fontFamily: "var(--font)", fontSize: 14,
              padding: "9px 14px", outline: "none",
            }}
          />

          {/* Attach */}
          <button className="hdr-icon-btn" style={{ width: 38, height: 38, borderRadius: 10 }} title="Attach image">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M13.5 8.5L7 15a4.243 4.243 0 01-6-6l7-7a2.828 2.828 0 014 4L5.5 13A1.414 1.414 0 013.5 11L9 5.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          {/* Send */}
          <button className="btn-primary" style={{ height: 38, padding: "0 18px", borderRadius: 10 }}>Send</button>
        </div>

        {/* Secondary controls strip */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <Toggle label="Screen" active={screenOn} onClick={() => setScreenOn(v=>!v)} />
          <Toggle label="Idle capture" active={idleOn} onClick={() => setIdleOn(v=>!v)} />
          <Toggle label="Thinking loop" active={loopOn} onClick={() => setLoopOn(v=>!v)} />
          <Toggle label="TTS" active={ttsOn} onClick={() => setTtsOn(v=>!v)} />
          <div style={{ width: 1, height: 16, background: "var(--stroke)", margin: "0 2px" }}/>
          <span style={{ fontFamily: "var(--font)", fontSize: 12, color: "var(--muted)" }}>New chat</span>
        </div>
      </div>
    </div>
  );
}

/* ── Code Workspace ── */
function CodeWorkspace() {
  const [approved, setApproved] = useState({});
  const [recording, setRecording] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [selectedFiles, setSelectedFiles] = useState(new Set(["src/app.py", "src/utils.py"]));

  const files = [
    { path: "src/",           type: "dir" },
    { path: "src/app.py",     changed: true },
    { path: "src/utils.py",   changed: true },
    { path: "src/models.py",  changed: false },
    { path: "src/config.py",  changed: false },
    { path: "tests/",         type: "dir" },
    { path: "tests/test_app.py", changed: false },
    { path: "requirements.txt",  changed: false },
  ];

  const diffs = [
    {
      file: "src/app.py",
      lines: [
        { t: "ctx", n: "11", c: "" },
        { t: "ctx", n: "12", c: "def handle_message(msg):" },
        { t: "del", n: "13", c: '    print("debug:", msg)' },
        { t: "add", n: "13", c: '    logger.debug("msg: %s", msg)' },
        { t: "ctx", n: "14", c: "    return process(msg)" },
      ],
    },
    {
      file: "src/utils.py",
      lines: [
        { t: "ctx", n: "4",  c: "" },
        { t: "ctx", n: "5",  c: "import os" },
        { t: "add", n: "6",  c: "import logging" },
        { t: "add", n: "7",  c: 'logger = logging.getLogger(__name__)' },
        { t: "ctx", n: "8",  c: "" },
      ],
    },
  ];

  const allApproved = diffs.every((_, i) => approved[i] === true);
  const allDenied   = diffs.every((_, i) => approved[i] === false);
  const anyPending  = diffs.some((_, i)  => approved[i] === undefined);

  const toggleFile = (path) => {
    setSelectedFiles(prev => {
      const next = new Set(prev);
      next.has(path) ? next.delete(path) : next.add(path);
      return next;
    });
  };

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
      {/* File tree */}
      <div style={{
        width: 180, flexShrink: 0,
        borderRight: "1px solid var(--stroke)",
        background: "rgba(16,12,8,0.9)",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        <div style={{
          padding: "12px 14px 8px",
          borderBottom: "1px solid var(--stroke)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontFamily: "var(--font)", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1.2 }}>Files</span>
          <button className="btn-ghost" style={{ fontSize: 11, padding: "2px 7px" }}>+ Add</button>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "6px 0" }}>
          {files.map((f, i) => {
            const isDir = f.type === "dir";
            const label = isDir ? f.path : f.path.split("/").pop();
            const indent = !isDir && f.path.includes("/") ? 18 : 0;
            const selected = selectedFiles.has(f.path);
            return (
              <div
                key={i}
                onClick={() => !isDir && toggleFile(f.path)}
                style={{
                  display: "flex", alignItems: "center", gap: 6,
                  padding: `5px 14px 5px ${14 + indent}px`,
                  cursor: isDir ? "default" : "pointer",
                  background: selected && !isDir ? "rgba(212,87,42,0.1)" : "transparent",
                  borderLeft: selected && !isDir ? "2px solid var(--accent)" : "2px solid transparent",
                  transition: "background 0.1s",
                }}
              >
                {!isDir && (
                  <div style={{
                    width: 14, height: 14, border: "1.5px solid",
                    borderColor: selected ? "var(--accent)" : "var(--stroke)",
                    borderRadius: 3, flexShrink: 0,
                    background: selected ? "var(--accent)" : "transparent",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    {selected && <span style={{ color: "#fff", fontSize: 9 }}>✓</span>}
                  </div>
                )}
                <span style={{
                  fontFamily: "var(--font)", fontSize: 12,
                  color: isDir ? "var(--muted)" :
                         f.changed ? (selected ? "var(--accent)" : "#d4876e") : "var(--muted)",
                  fontWeight: isDir ? 600 : 400,
                }}>{label}</span>
                {f.changed && !isDir && (
                  <span style={{ marginLeft: "auto", width: 6, height: 6, borderRadius: 3, background: "var(--accent)", flexShrink: 0 }}/>
                )}
              </div>
            );
          })}
        </div>
        <div style={{
          padding: "8px 14px",
          borderTop: "1px solid var(--stroke)",
        }}>
          <span style={{ fontFamily: "var(--font)", fontSize: 11, color: "var(--muted)" }}>
            {selectedFiles.size} file{selectedFiles.size !== 1 ? "s" : ""} selected
          </span>
        </div>
      </div>

      {/* Diff + composer */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
        {/* Diff area */}
        <div style={{ flex: 1, overflow: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Bulk bar */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 12px", borderRadius: 8,
            background: "rgba(255,255,255,0.04)", border: "1px solid var(--stroke)",
            flexShrink: 0,
          }}>
            <span style={{ fontFamily: "var(--font)", fontSize: 12, color: "var(--muted)" }}>
              {diffs.length} files changed · 3 additions · 1 deletion
            </span>
            <div style={{ flex: 1 }}/>
            {anyPending && <>
              <button
                className="btn-teal"
                style={{ fontSize: 12 }}
                onClick={() => {
                  const next = {};
                  diffs.forEach((_, i) => next[i] = true);
                  setApproved(next);
                }}
              >✓ Approve all</button>
              <button
                style={{
                  background: "rgba(200,50,50,0.1)", border: "1px solid rgba(200,50,50,0.3)",
                  color: "#e87070", borderRadius: 8, fontFamily: "var(--font)", fontSize: 12,
                  padding: "5px 12px", cursor: "pointer",
                }}
                onClick={() => {
                  const next = {};
                  diffs.forEach((_, i) => next[i] = false);
                  setApproved(next);
                }}
              >✕ Deny all</button>
            </>}
            {!anyPending && (
              <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setApproved({})}>Reset</button>
            )}
          </div>

          {/* Individual diffs */}
          {diffs.map((diff, di) => (
            <div key={di} style={{
              borderRadius: 10, overflow: "hidden",
              border: "1px solid",
              borderColor: approved[di] === true ? "rgba(74,160,140,0.4)" :
                           approved[di] === false ? "rgba(200,50,50,0.3)" :
                           "var(--stroke)",
              flexShrink: 0,
            }}>
              {/* File header */}
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "8px 12px",
                background: "rgba(10,8,5,0.9)",
                borderBottom: "1px solid rgba(255,255,255,0.06)",
              }}>
                <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
                  <path d="M2 0h6l4 4v10H2V0z" stroke="var(--muted)" strokeWidth="1.2"/>
                  <path d="M8 0v4h4" stroke="var(--muted)" strokeWidth="1.2"/>
                </svg>
                <span style={{ fontFamily: "var(--font)", fontSize: 13, fontWeight: 600, color: "var(--ink)", flex: 1 }}>{diff.file}</span>
                <div style={{ display: "flex", gap: 6 }}>
                  {approved[di] === undefined && <>
                    <button
                      className="btn-teal"
                      style={{ fontSize: 11, padding: "3px 10px" }}
                      onClick={() => setApproved(a => ({ ...a, [di]: true }))}
                    >✓ Approve</button>
                    <button
                      style={{
                        background: "rgba(200,50,50,0.1)", border: "1px solid rgba(200,50,50,0.3)",
                        color: "#e87070", borderRadius: 6, fontFamily: "var(--font)", fontSize: 11,
                        padding: "3px 10px", cursor: "pointer",
                      }}
                      onClick={() => setApproved(a => ({ ...a, [di]: false }))}
                    >✕ Deny</button>
                  </>}
                  {approved[di] === true && <span style={{ fontFamily: "var(--font)", fontSize: 12, color: "#4aa08c", fontWeight: 600 }}>✓ Approved</span>}
                  {approved[di] === false && <span style={{ fontFamily: "var(--font)", fontSize: 12, color: "#e87070", fontWeight: 600 }}>✕ Denied</span>}
                </div>
              </div>
              {/* Diff lines */}
              <div style={{ background: "#0b0906", fontFamily: "'Space Mono', monospace", fontSize: 12 }}>
                {diff.lines.map((l, li) => (
                  <div key={li} style={{
                    display: "flex", gap: 0, padding: "2px 0",
                    background: l.t === "del" ? "rgba(200,50,50,0.12)" :
                                l.t === "add" ? "rgba(40,160,100,0.12)" : "transparent",
                    opacity: approved[di] === false ? 0.4 : 1,
                  }}>
                    <span style={{
                      width: 28, textAlign: "center", flexShrink: 0,
                      color: l.t === "del" ? "#e87070" : l.t === "add" ? "#4aa08c" : "rgba(255,255,255,0.15)",
                      fontSize: 11, userSelect: "none",
                    }}>{l.t === "del" ? "−" : l.t === "add" ? "+" : ""}</span>
                    <span style={{
                      width: 32, color: "rgba(255,255,255,0.2)", flexShrink: 0,
                      fontSize: 11, textAlign: "right", paddingRight: 10, userSelect: "none",
                    }}>{l.n}</span>
                    <span style={{
                      color: l.t === "del" ? "#e87070" : l.t === "add" ? "#4aa08c" : "var(--muted)",
                    }}>{l.c || "\u00A0"}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Code composer */}
        <div style={{
          padding: "10px 16px 12px",
          borderTop: "1px solid var(--stroke)",
          background: "rgba(20,16,11,0.95)",
          display: "flex", gap: 8, alignItems: "center",
          flexShrink: 0,
        }}>
          {/* Push-to-talk mic */}
          <button
            onMouseDown={() => setRecording(true)}
            onMouseUp={() => setRecording(false)}
            onMouseLeave={() => setRecording(false)}
            style={{
              width: 38, height: 38, borderRadius: 10, border: "1px solid",
              borderColor: recording ? "var(--accent)" : "var(--stroke)",
              background: recording ? "rgba(212,87,42,0.25)" : "rgba(255,255,255,0.05)",
              color: recording ? "var(--accent)" : "var(--muted)",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.1s", flexShrink: 0,
              position: "relative",
            }}
            title="Hold to record"
          >
            <svg width="14" height="16" viewBox="0 0 14 16" fill="none">
              <rect x="4" y="0" width="6" height="10" rx="3" stroke="currentColor" strokeWidth="1.5"/>
              <path d="M1 8c0 3.31 2.69 6 6 6s6-2.69 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <line x1="7" y1="14" x2="7" y2="16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            {recording && (
              <span style={{
                position: "absolute", top: -4, right: -4,
                width: 10, height: 10, borderRadius: 5,
                background: "var(--accent)",
                animation: "blink 0.7s ease-in-out infinite",
              }}/>
            )}
          </button>

          <input
            value={prompt} onChange={e => setPrompt(e.target.value)}
            placeholder={recording ? "Recording… release to stop" : "Ask AI to edit files…"}
            style={{
              flex: 1, background: "rgba(255,255,255,0.06)",
              border: "1px solid var(--stroke)", borderRadius: 10,
              color: "var(--ink)", fontFamily: "var(--font)", fontSize: 14,
              padding: "9px 14px", outline: "none",
              borderColor: recording ? "rgba(212,87,42,0.5)" : "var(--stroke)",
              transition: "border-color 0.15s",
            }}
          />

          <button className="btn-primary" style={{ height: 38, padding: "0 18px", borderRadius: 10 }}>Run</button>
        </div>
      </div>
    </div>
  );
}

/* ── Toggle chip ── */
function Toggle({ label, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: active ? "rgba(212,87,42,0.15)" : "rgba(255,255,255,0.05)",
      border: "1px solid", borderColor: active ? "rgba(212,87,42,0.45)" : "var(--stroke)",
      borderRadius: 20, padding: "3px 10px",
      fontFamily: "var(--font)", fontSize: 11, fontWeight: active ? 600 : 400,
      color: active ? "var(--accent)" : "var(--muted)",
      cursor: "pointer", transition: "all 0.15s",
      display: "flex", alignItems: "center", gap: 5,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: 3,
        background: active ? "var(--accent)" : "var(--stroke)",
        transition: "background 0.15s",
      }}/>
      {label}
    </button>
  );
}

Object.assign(window, { ChatWorkspace, CodeWorkspace, Toggle });
