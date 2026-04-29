// ai-vc-image-workspace.jsx — Image Workspace (v2)
// Layout: Left nav | Center grid | Right agent chat
//         Bottom bar: generation controls (always visible)
const { useState, useRef, useEffect } = React;

/* ── mock data ── */
const MOCK_IMAGES = [
  { id:"img1", prompt:"A galleon sailing through a misty fjord at dusk, dramatic lighting", negPrompt:"", seed:42190, resolution:"1024x1024", model:"dreamshaper_8", timestamp:"4/29/26 · 12:32 PM", folder:"root", starred:true,  w:1024, h:1024 },
  { id:"img2", prompt:"Cyberpunk city street at night, neon reflections on wet pavement, rain", negPrompt:"blurry, low quality", seed:88310, resolution:"1024x1536", model:"dreamshaper_8", timestamp:"4/29/26 · 11:14 AM", folder:"root", starred:false, w:1024, h:1536 },
  { id:"img3", prompt:"Ancient library filled with glowing tomes and floating candles, warm amber light", negPrompt:"", seed:13337, resolution:"1536x1024", model:"dreamshaper_8", timestamp:"4/28/26 · 6:07 PM", folder:"Characters", starred:false, w:1536, h:1024 },
  { id:"img4", prompt:"Portrait of an elven warrior, forest background, golden hour, detailed armor", negPrompt:"ugly, deformed", seed:55551, resolution:"768x1152", model:"dreamshaper_8", timestamp:"4/28/26 · 3:44 PM", folder:"Characters", starred:true,  w:768,  h:1152 },
  { id:"img5", prompt:"Minimalist zen garden with raked sand and a single red maple leaf", negPrompt:"", seed:20001, resolution:"1024x1024", model:"sdxl_base", timestamp:"4/27/26 · 10:22 AM", folder:"root", starred:false, w:1024, h:1024 },
  { id:"img6", prompt:"Macro photo of a dewdrop on a spider web at sunrise, bokeh background", negPrompt:"", seed:77777, resolution:"1024x1024", model:"dreamshaper_8", timestamp:"4/27/26 · 9:55 AM", folder:"Nature", starred:false, w:1024, h:1024 },
  { id:"img7", prompt:"Steampunk airship docking at a floating sky city, warm sunset, epic scale", negPrompt:"cartoon, anime", seed:31415, resolution:"1536x1024", model:"sdxl_base", timestamp:"4/26/26 · 9:30 PM", folder:"root", starred:true,  w:1536, h:1024 },
  { id:"img8", prompt:"Bioluminescent jellyfish in deep ocean darkness, ethereal blue glow", negPrompt:"", seed:99999, resolution:"1024x1024", model:"dreamshaper_8", timestamp:"4/26/26 · 8:11 PM", folder:"Nature", starred:false, w:1024, h:1024 },
  { id:"img9", prompt:"Snow-covered mountain cabin at night, warm light glowing through windows, aurora borealis", negPrompt:"", seed:12345, resolution:"1536x1024", model:"sdxl_base", timestamp:"4/25/26 · 7:00 PM", folder:"Nature", starred:false, w:1536, h:1024 },
];

const MOCK_FOLDERS = ["Characters", "Nature", "Environments"];

const ASPECT_RATIOS = [
  { label:"1:1",   res:"1024x1024" },
  { label:"3:2",   res:"1536x1024" },
  { label:"2:3",   res:"1024x1536" },
  { label:"16:9",  res:"1344x768"  },
  { label:"9:16",  res:"768x1344"  },
  { label:"Custom",res:null        },
];

/* gradient palette for placeholder images */
const GRADIENTS = [
  ["#1a2a3a","#0a1018"],["#2a1a3a","#100818"],["#1a3a2a","#081810"],
  ["#3a2a1a","#180e08"],["#2a3a1a","#101808"],["#3a1a2a","#180810"],
  ["#1a2840","#080e18"],["#2d1a1a","#140808"],
];

function gradient(prompt) {
  return GRADIENTS[Math.abs((prompt.charCodeAt(0)||65) - 65) % GRADIENTS.length];
}

/* ── Placeholder image ── */
function ImgPlaceholder({ prompt, w, h, fill }) {
  const [c1, c2] = gradient(prompt);
  const ratio = h / w;
  const inner = (
    <div style={{
      position:"absolute", inset:0,
      display:"flex", alignItems:"center", justifyContent:"center", padding:10,
    }}>
      <span style={{
        fontFamily:"var(--font)", fontSize:10, color:"rgba(246,239,230,0.2)",
        textAlign:"center", lineHeight:1.4,
        display:"-webkit-box", WebkitLineClamp:4,
        WebkitBoxOrient:"vertical", overflow:"hidden",
      }}>{prompt}</span>
    </div>
  );
  if (fill) return (
    <div style={{ width:"100%", height:"100%", position:"relative", background:`linear-gradient(135deg,${c1},${c2})`, borderRadius:"inherit" }}>
      {inner}
    </div>
  );
  return (
    <div style={{ width:"100%", paddingTop:`${ratio*100}%`, position:"relative", background:`linear-gradient(135deg,${c1},${c2})` }}>
      {inner}
    </div>
  );
}

/* ── Detail Modal (click on image) ── */
function DetailModal({ img, onClose, onStar, onEdit, onDelete }) {
  if (!img) return null;
  return (
    <div
      onClick={e => e.target === e.currentTarget && onClose()}
      style={{
        position:"fixed", inset:0, zIndex:150,
        background:"rgba(10,7,4,0.82)", backdropFilter:"blur(8px)",
        display:"flex", alignItems:"center", justifyContent:"center",
      }}
    >
      <div style={{
        display:"flex", maxWidth:"80vw", maxHeight:"85vh",
        background:"#18140e", borderRadius:14,
        border:"1px solid var(--stroke)",
        boxShadow:"0 32px 80px rgba(0,0,0,0.7)",
        overflow:"hidden",
      }}>
        {/* Image */}
        <div style={{ flex:1, minWidth:300, position:"relative", background:"#0a0806" }}>
          <ImgPlaceholder prompt={img.prompt} w={img.w} h={img.h} fill />
        </div>

        {/* Meta panel */}
        <div style={{
          width:280, flexShrink:0, display:"flex", flexDirection:"column",
          borderLeft:"1px solid var(--stroke)",
        }}>
          <div style={{
            padding:"14px 16px", borderBottom:"1px solid var(--stroke)",
            display:"flex", justifyContent:"space-between", alignItems:"center", flexShrink:0,
          }}>
            <span style={{ fontFamily:"var(--font)", fontSize:13, fontWeight:700, color:"var(--ink)" }}>Image Details</span>
            <button onClick={onClose} className="ghost-btn" style={{padding:"2px 6px"}}>✕</button>
          </div>

          <div style={{ flex:1, overflow:"auto", padding:"14px 16px", display:"flex", flexDirection:"column", gap:14 }}>
            <MetaSection title="Prompt">
              <p style={{ fontFamily:"var(--font)", fontSize:13, color:"var(--ink)", lineHeight:1.5 }}>{img.prompt}</p>
            </MetaSection>

            {img.negPrompt && (
              <MetaSection title="Negative Prompt">
                <p style={{ fontFamily:"var(--font)", fontSize:12, color:"var(--muted)", lineHeight:1.5 }}>{img.negPrompt}</p>
              </MetaSection>
            )}

            <MetaSection title="Generation">
              <MetaRow label="Seed"       value={`#${img.seed}`} mono />
              <MetaRow label="Resolution" value={img.resolution} />
              <MetaRow label="Model"      value={img.model} />
              <MetaRow label="Generated"  value={img.timestamp} />
            </MetaSection>
          </div>

          {/* Actions */}
          <div style={{
            padding:"12px 16px", borderTop:"1px solid var(--stroke)",
            display:"flex", gap:7, flexShrink:0, flexWrap:"wrap",
          }}>
            <button onClick={() => { onStar(img.id); }} style={{
              ...btnBase,
              background: img.starred ? "rgba(212,87,42,0.2)" : "rgba(255,255,255,0.06)",
              borderColor: img.starred ? "rgba(212,87,42,0.5)" : "var(--stroke)",
              color: img.starred ? "var(--accent)" : "var(--muted)",
            }}>{img.starred ? "★ Starred" : "☆ Star"}</button>
            <button onClick={() => { onClose(); onEdit(img); }} style={{...btnBase}}>✏ Edit</button>
            <button onClick={() => { onDelete(img.id); onClose(); }} style={{
              ...btnBase, color:"#e87070",
              borderColor:"rgba(200,50,50,0.35)",
              background:"rgba(200,50,50,0.1)",
            }}>✕ Delete</button>
          </div>
        </div>
      </div>
    </div>
  );
}

const btnBase = {
  background:"rgba(255,255,255,0.06)", border:"1px solid var(--stroke)",
  borderRadius:7, color:"var(--muted)", fontFamily:"var(--font)",
  fontSize:12, padding:"5px 11px", cursor:"pointer",
};

function MetaSection({ title, children }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
      <span style={{ fontFamily:"var(--font)", fontSize:10, fontWeight:700, color:"var(--accent)", textTransform:"uppercase", letterSpacing:1.2 }}>{title}</span>
      {children}
    </div>
  );
}
function MetaRow({ label, value, mono }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", gap:8 }}>
      <span style={{ fontFamily:"var(--font)", fontSize:12, color:"var(--muted)", flexShrink:0 }}>{label}</span>
      <span style={{ fontFamily: mono ? "'Space Mono', monospace" : "var(--font)", fontSize:12, color:"var(--ink)", textAlign:"right" }}>{value}</span>
    </div>
  );
}

/* ── Edit Modal (split view) ── */
function EditModal({ img, onClose }) {
  const [prompt,    setPrompt]    = useState("");
  const [negPrompt, setNegPrompt] = useState(img.negPrompt || "");
  const [analyzing, setAnalyzing] = useState(true);
  const [generating,setGenerating]= useState(false);
  const [result,    setResult]    = useState(null);
  const [enhance,   setEnhance]   = useState(true);

  useEffect(() => {
    const t = setTimeout(() => { setPrompt(img.prompt); setAnalyzing(false); }, 1200);
    return () => clearTimeout(t);
  }, [img]);

  const generate = () => {
    setGenerating(true); setResult(null);
    setTimeout(() => {
      setGenerating(false);
      setResult({ seed: Math.floor(Math.random()*99999) });
    }, 2000);
  };

  return (
    <div style={{
      position:"fixed", inset:0, zIndex:200,
      background:"rgba(10,7,4,0.9)", backdropFilter:"blur(10px)",
      display:"flex", flexDirection:"column",
    }}>
      {/* Header */}
      <div style={{
        display:"flex", alignItems:"center", gap:12, padding:"12px 20px",
        borderBottom:"1px solid var(--stroke)",
        background:"rgba(20,16,11,0.98)", flexShrink:0,
      }}>
        <span style={{ fontFamily:"var(--font)", fontSize:14, fontWeight:700, color:"var(--ink)" }}>Edit Image</span>
        <span style={{ fontFamily:"var(--font)", fontSize:12, color:"var(--muted)" }}>AI describes the image, you refine the prompt</span>
        <div style={{flex:1}}/>
        <button onClick={onClose} className="ghost-btn">✕ Close</button>
      </div>

      {/* Three-column body */}
      <div style={{ flex:1, display:"flex", minHeight:0 }}>
        {/* Original */}
        <div style={{ flex:1, padding:20, display:"flex", flexDirection:"column", gap:10, borderRight:"1px solid var(--stroke)" }}>
          <span style={colLabel}>Original</span>
          <div style={{ flex:1, borderRadius:10, overflow:"hidden", border:"1px solid var(--stroke)" }}>
            <ImgPlaceholder prompt={img.prompt} w={img.w} h={img.h} fill />
          </div>
          <div style={{ fontFamily:"var(--font)", fontSize:11, color:"var(--muted)" }}>
            Seed #{img.seed} · {img.resolution} · {img.model}
          </div>
        </div>

        {/* Controls */}
        <div style={{
          width:320, flexShrink:0, padding:20,
          display:"flex", flexDirection:"column", gap:12,
          borderRight:"1px solid var(--stroke)", overflow:"auto",
        }}>
          <span style={colLabel}>Edit Prompt</span>

          {analyzing ? (
            <div style={{ display:"flex", alignItems:"center", gap:10, paddingTop:8 }}>
              <div style={{ width:16, height:16, borderRadius:8, border:"2px solid var(--accent-2)", borderTopColor:"transparent", animation:"spin 0.7s linear infinite" }}/>
              <span style={{ fontFamily:"var(--font)", fontSize:13, color:"var(--muted)" }}>Analyzing image…</span>
            </div>
          ) : (<>
            <div>
              <label style={editFldLabel}>Prompt</label>
              <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} rows={7} style={txStyle}/>
            </div>
            <div>
              <label style={editFldLabel}>Negative Prompt</label>
              <textarea value={negPrompt} onChange={e=>setNegPrompt(e.target.value)} rows={3} placeholder="What to exclude…" style={txStyle}/>
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{ fontFamily:"var(--font)", fontSize:12, color:"var(--ink)" }}>Enhance prompt</span>
              <MiniToggle value={enhance} onChange={setEnhance}/>
            </div>
            <button onClick={generate} disabled={generating||!prompt.trim()} className="btn-primary" style={{ padding:"10px 0", width:"100%", opacity:prompt.trim()?1:0.5 }}>
              {generating ? "Generating…" : "Regenerate"}
            </button>
          </>)}
        </div>

        {/* Result */}
        <div style={{ flex:1, padding:20, display:"flex", flexDirection:"column", gap:10 }}>
          <span style={colLabel}>Result</span>
          <div style={{
            flex:1, borderRadius:10, overflow:"hidden",
            border:"1px solid var(--stroke)",
            background:"rgba(255,255,255,0.02)",
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>
            {!result && !generating && (
              <span style={{ fontFamily:"var(--font)", fontSize:13, color:"rgba(184,168,143,0.25)" }}>Result will appear here</span>
            )}
            {generating && (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:12 }}>
                <div style={{ width:32, height:32, borderRadius:16, border:"2.5px solid var(--accent)", borderTopColor:"transparent", animation:"spin 0.7s linear infinite" }}/>
                <span style={{ fontFamily:"var(--font)", fontSize:13, color:"var(--muted)" }}>Generating…</span>
              </div>
            )}
            {result && !generating && <ImgPlaceholder prompt={prompt} w={img.w} h={img.h} fill/>}
          </div>
          {result && (
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              <span style={{ fontFamily:"var(--font)", fontSize:11, color:"var(--muted)", flex:1 }}>Seed #{result.seed} · {img.resolution}</span>
              <button className="btn-teal" style={{ fontSize:12 }}>Save to library</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const colLabel  = { fontFamily:"var(--font)", fontSize:10, fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:1.2 };
const editFldLabel = { display:"block", fontFamily:"var(--font)", fontSize:10, fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:1, marginBottom:5 };
const txStyle   = { width:"100%", background:"rgba(255,255,255,0.05)", border:"1px solid var(--stroke)", borderRadius:8, color:"var(--ink)", fontFamily:"var(--font)", fontSize:13, padding:"9px 11px", outline:"none", resize:"vertical", lineHeight:1.5 };

function MiniToggle({ value, onChange }) {
  return (
    <button onClick={()=>onChange(!value)} style={{
      width:36, height:20, borderRadius:10, border:"none", cursor:"pointer",
      background:value?"var(--accent)":"rgba(255,255,255,0.12)", position:"relative", transition:"background 0.2s",
    }}>
      <span style={{ position:"absolute", top:2, left:value?"calc(100% - 18px)":2, width:16, height:16, borderRadius:8, background:"#fff", transition:"left 0.2s" }}/>
    </button>
  );
}

/* ── Image Card ── */
function ImageCard({ img, onStar, onEdit, onClick, onDragStart }) {
  const [hover, setHover] = useState(false);
  const ratio = img.h / img.w;
  return (
    <div
      onMouseEnter={()=>setHover(true)}
      onMouseLeave={()=>setHover(false)}
      onClick={()=>onClick(img)}
      draggable
      onDragStart={e => { e.dataTransfer.setData("text/plain", img.id); onDragStart && onDragStart(img); }}
      style={{
        position:"relative", borderRadius:8, overflow:"hidden", cursor:"pointer",
        border:"1px solid",
        borderColor: img.starred ? "rgba(212,87,42,0.5)" : hover ? "rgba(246,239,230,0.18)" : "var(--stroke)",
        transition:"border-color 0.15s, transform 0.15s",
        transform: hover ? "scale(1.015)" : "scale(1)",
        marginBottom:10, breakInside:"avoid",
      }}
    >
      <ImgPlaceholder prompt={img.prompt} w={img.w} h={img.h}/>

      {/* Star */}
      <button onClick={e=>{e.stopPropagation();onStar(img.id);}} style={{
        position:"absolute", top:7, left:7,
        width:26, height:26, borderRadius:6, border:"none", cursor:"pointer",
        background: img.starred ? "rgba(212,87,42,0.9)" : "rgba(14,10,7,0.72)",
        color: img.starred ? "#fff" : "rgba(246,239,230,0.45)",
        fontSize:13, display:"flex", alignItems:"center", justifyContent:"center",
        opacity: hover||img.starred ? 1 : 0, transition:"opacity 0.15s",
        backdropFilter:"blur(4px)",
      }}>★</button>

      {/* Edit shortcut */}
      <button onClick={e=>{e.stopPropagation();onEdit(img);}} style={{
        position:"absolute", top:7, right:7,
        padding:"3px 8px", borderRadius:5, border:"none", cursor:"pointer",
        background:"rgba(14,10,7,0.72)", backdropFilter:"blur(4px)",
        color:"rgba(246,239,230,0.7)", fontFamily:"var(--font)", fontSize:10,
        opacity:hover?1:0, transition:"opacity 0.15s",
      }}>✏ Edit</button>

      {/* Bottom overlay */}
      <div style={{
        position:"absolute", bottom:0, left:0, right:0,
        padding:"24px 8px 8px",
        background:"linear-gradient(transparent,rgba(10,7,4,0.88))",
        opacity:hover?1:0, transition:"opacity 0.15s",
      }}>
        <div style={{
          fontFamily:"var(--font)", fontSize:10, color:"rgba(184,168,143,0.85)",
          lineHeight:1.4, marginBottom:4,
          display:"-webkit-box", WebkitLineClamp:2, WebkitBoxOrient:"vertical", overflow:"hidden",
        }}>{img.prompt}</div>
        <div style={{ fontFamily:"var(--font)", fontSize:9, color:"rgba(184,168,143,0.4)" }}>
          #{img.seed} · {img.resolution}
        </div>
      </div>
    </div>
  );
}

/* ── Queue pill (in bottom bar) ── */
function QueuePill({ item, onCancel }) {
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:8,
      padding:"5px 10px", borderRadius:8,
      background:"rgba(255,255,255,0.05)", border:"1px solid var(--stroke)",
      minWidth:180, maxWidth:240, flexShrink:0,
    }}>
      <div style={{ flex:1, overflow:"hidden" }}>
        <div style={{
          fontFamily:"var(--font)", fontSize:11, color:"var(--ink)",
          whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
        }}>{item.prompt}</div>
        <div style={{ height:3, borderRadius:2, background:"rgba(255,255,255,0.08)", marginTop:4, overflow:"hidden" }}>
          <div style={{
            height:"100%", borderRadius:2,
            width:`${item.progress}%`,
            background: item.status==="done" ? "#4aa08c" : "var(--accent)",
            transition:"width 0.4s ease",
          }}/>
        </div>
      </div>
      <span style={{ fontFamily:"var(--font)", fontSize:10, color:"var(--muted)", flexShrink:0 }}>{item.status}</span>
      <button onClick={()=>onCancel(item.id)} style={{
        background:"none", border:"none", color:"rgba(184,168,143,0.4)",
        cursor:"pointer", fontSize:12, padding:0, flexShrink:0,
      }}>✕</button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════ */
function ImageWorkspace() {
  const [images,       setImages]       = useState(MOCK_IMAGES);
  const [folders,      setFolders]      = useState(MOCK_FOLDERS);
  const [activeFolder, setActiveFolder] = useState("all");
  const [showStarred,  setShowStarred]  = useState(false);
  const [detailImg,    setDetailImg]    = useState(null);
  const [editImg,      setEditImg]      = useState(null);
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName,setNewFolderName]= useState("");

  // Generation state
  const [prompt,     setPrompt]     = useState("");
  const [negPrompt,  setNegPrompt]  = useState("");
  const [enhance,    setEnhance]    = useState(true);
  const [seed,       setSeed]       = useState("");
  const [lockSeed,   setLockSeed]   = useState(false);
  const [batchCount, setBatchCount] = useState(1);
  const [aspectRatio,setAspectRatio]= useState(ASPECT_RATIOS[0]);
  const [customRes,  setCustomRes]  = useState("1024x1024");
  const [negOpen,    setNegOpen]    = useState(false);
  const [moreOpen,   setMoreOpen]   = useState(false);
  const [queue,      setQueue]      = useState([
    { id:"q1", prompt:"A futuristic space station orbiting Jupiter", status:"68%", progress:68 },
    { id:"q2", prompt:"Medieval blacksmith at night", status:"queued", progress:0 },
  ]);

  // Chat state
  const [chatMessages, setChatMessages] = useState([
    { role:"ai", text:"I can help generate, describe, or edit images. What would you like to create?" },
  ]);
  const [chatInput, setChatInput] = useState("");

  const visibleImages = images.filter(img => {
    if (showStarred && !img.starred) return false;
    if (activeFolder === "all") return true;
    return img.folder === activeFolder;
  });

  const handleStar   = id => setImages(imgs => imgs.map(i => i.id===id ? {...i, starred:!i.starred} : i));
  const handleDelete = id => setImages(imgs => imgs.filter(i => i.id!==id));

  const handleGenerate = () => {
    if (!prompt.trim()) return;
    const res = aspectRatio.res || customRes;
    const newItem = { id:`q${Date.now()}`, prompt:prompt.trim(), status:"starting…", progress:0 };
    setQueue(q => [newItem, ...q]);
    let pct = 0;
    const iv = setInterval(() => {
      pct += Math.random()*18 + 7;
      if (pct >= 100) {
        pct = 100;
        clearInterval(iv);
        setQueue(q => q.map(i => i.id===newItem.id ? {...i, progress:100, status:"done"} : i));
        setTimeout(() => {
          for (let b = 0; b < batchCount; b++) {
            const baseSeed = lockSeed && seed ? parseInt(seed) + b : Math.floor(Math.random()*99999);
            const newImg = {
              id:`img${Date.now()}${b}`,
              prompt:prompt.trim(), negPrompt:negPrompt.trim(),
              seed:baseSeed, resolution:res, model:"dreamshaper_8",
              timestamp:new Date().toLocaleString("en-US",{month:"numeric",day:"numeric",year:"2-digit",hour:"numeric",minute:"2-digit"}),
              folder: activeFolder==="all"||activeFolder==="starred" ? "root" : activeFolder,
              starred:false,
              w:parseInt(res.split("x")[0]), h:parseInt(res.split("x")[1]),
            };
            setImages(imgs => [newImg, ...imgs]);
          }
          setQueue(q => q.filter(i => i.id!==newItem.id));
        }, 600);
      } else {
        setQueue(q => q.map(i => i.id===newItem.id ? {...i, progress:Math.round(pct), status:`${Math.round(pct)}%`} : i));
      }
    }, 280);
    if (!lockSeed) setPrompt("");
  };

  const sendChat = () => {
    if (!chatInput.trim()) return;
    const msg = chatInput.trim();
    setChatMessages(m => [...m, {role:"user",text:msg}]);
    setChatInput("");
    // Simulate AI response
    setTimeout(() => {
      setChatMessages(m => [...m, {role:"ai", text:`I'll help with that! Try generating: "${msg.split(" ").slice(0,4).join(" ")}…" — or I can enhance the idea further.`}]);
    }, 900);
  };

  const addFolder = () => {
    if (!newFolderName.trim()) return;
    setFolders(f => [...f, newFolderName.trim()]);
    setNewFolderName(""); setAddingFolder(false);
  };

  const res = aspectRatio.res || customRes;

  return (
    <div style={{ display:"flex", flexDirection:"column", flex:1, minHeight:0, overflow:"hidden" }}>
      {/* ── Main area ── */}
      <div style={{ flex:1, display:"flex", minHeight:0, overflow:"hidden" }}>

        {/* Left: Library nav */}
        <div style={{
          width:180, flexShrink:0, borderRight:"1px solid var(--stroke)",
          background:"rgba(16,12,8,0.92)", display:"flex", flexDirection:"column", overflow:"hidden",
        }}>
          <div style={{ padding:"12px 14px 8px", borderBottom:"1px solid var(--stroke)", flexShrink:0 }}>
            <span style={sectionLabel}>Library</span>
          </div>
          <div style={{ flex:1, overflow:"auto", padding:"6px 0" }}>
            {[
              {id:"all",     label:"All Images", count:images.length,               isStarred:false},
              {id:"starred", label:"★ Starred",  count:images.filter(i=>i.starred).length, isStarred:true},
            ].map(v => {
              const active = v.isStarred ? showStarred : (!showStarred && activeFolder===v.id);
              return (
                <NavRow key={v.id} label={v.label} count={v.count} active={active}
                  onClick={()=>{ setActiveFolder(v.isStarred?"all":v.id); setShowStarred(v.isStarred); }}
                />
              );
            })}
            <div style={{ height:1, background:"var(--stroke)", margin:"5px 14px" }}/>
            <div style={{ padding:"4px 14px 4px", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <span style={{...sectionLabel, fontSize:9}}>Folders</span>
              <button onClick={()=>setAddingFolder(true)} style={{
                background:"none", border:"none", color:"var(--muted)", cursor:"pointer", fontSize:17, lineHeight:1, padding:0,
              }}>+</button>
            </div>
            {folders.map(f => {
              const count = images.filter(i=>i.folder===f).length;
              const active = !showStarred && activeFolder===f;
              return (
                <NavRow key={f} label={`📁 ${f}`} count={count} active={active}
                  onClick={()=>{ setActiveFolder(f); setShowStarred(false); }}
                />
              );
            })}
            {addingFolder && (
              <div style={{ padding:"5px 14px", display:"flex", gap:4 }}>
                <input autoFocus value={newFolderName} onChange={e=>setNewFolderName(e.target.value)}
                  onKeyDown={e=>{ if(e.key==="Enter")addFolder(); if(e.key==="Escape")setAddingFolder(false); }}
                  placeholder="Name…"
                  style={{ flex:1, background:"rgba(255,255,255,0.06)", border:"1px solid var(--stroke)", borderRadius:5, color:"var(--ink)", fontFamily:"var(--font)", fontSize:12, padding:"3px 7px", outline:"none" }}
                />
                <button onClick={addFolder} className="btn-primary" style={{padding:"3px 7px",fontSize:11}}>✓</button>
              </div>
            )}
          </div>
          <div style={{ padding:"8px 14px", borderTop:"1px solid var(--stroke)", flexShrink:0 }}>
            <span style={{ fontFamily:"var(--font)", fontSize:11, color:"var(--muted)" }}>{images.length} images</span>
          </div>
        </div>

        {/* Center: Masonry grid */}
        <div style={{ flex:1, overflow:"auto", padding:"14px 16px", minWidth:0 }}>
          {visibleImages.length === 0 ? (
            <div style={{ height:"100%", display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:10 }}>
              <span style={{ fontFamily:"var(--font)", fontSize:14, color:"var(--muted)" }}>No images here yet</span>
              <span style={{ fontFamily:"var(--font)", fontSize:12, color:"rgba(184,168,143,0.35)" }}>Use the bar below to generate one</span>
            </div>
          ) : (
            <div style={{ columns:"3 180px", columnGap:10 }}>
              {visibleImages.map(img => (
                <ImageCard key={img.id} img={img}
                  onStar={handleStar}
                  onEdit={i => { setDetailImg(null); setEditImg(i); }}
                  onClick={setDetailImg}
                  onDragStart={img => console.log("drag", img.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right: Agent chat */}
        <div style={{
          width:260, flexShrink:0, borderLeft:"1px solid var(--stroke)",
          background:"rgba(16,12,8,0.92)", display:"flex", flexDirection:"column", overflow:"hidden",
        }}>
          <div style={{ padding:"12px 14px 8px", borderBottom:"1px solid var(--stroke)", flexShrink:0 }}>
            <span style={sectionLabel}>Agent Chat</span>
          </div>
          {/* Messages */}
          <div style={{ flex:1, overflow:"auto", padding:"12px 12px", display:"flex", flexDirection:"column", gap:10 }}>
            {chatMessages.map((m, i) => (
              <div key={i} style={{
                display:"flex", justifyContent:m.role==="user"?"flex-end":"flex-start",
              }}>
                {m.role==="ai" && (
                  <div style={{ display:"flex", gap:8, maxWidth:"88%" }}>
                    <div style={{ width:24, height:24, borderRadius:6, flexShrink:0, background:"rgba(74,160,140,0.2)", border:"1px solid rgba(74,160,140,0.4)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, color:"#7ecfc0", marginTop:2 }}>AI</div>
                    <div style={{ background:"rgba(27,22,16,0.9)", border:"1px solid var(--stroke)", borderRadius:"0 10px 10px 10px", padding:"8px 11px", fontFamily:"var(--font)", fontSize:12, color:"var(--ink)", lineHeight:1.5 }}>{m.text}</div>
                  </div>
                )}
                {m.role==="user" && (
                  <div style={{ background:"var(--accent)", borderRadius:"10px 10px 0 10px", padding:"8px 11px", maxWidth:"85%", fontFamily:"var(--font)", fontSize:12, color:"#fff", lineHeight:1.5 }}>{m.text}</div>
                )}
              </div>
            ))}
          </div>
          {/* Chat input */}
          <div style={{ padding:"8px 12px 10px", borderTop:"1px solid var(--stroke)", display:"flex", gap:6, flexShrink:0 }}>
            <input value={chatInput} onChange={e=>setChatInput(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter")sendChat(); }}
              placeholder="Message…"
              style={{ flex:1, background:"rgba(255,255,255,0.06)", border:"1px solid var(--stroke)", borderRadius:8, color:"var(--ink)", fontFamily:"var(--font)", fontSize:12, padding:"7px 10px", outline:"none" }}
            />
            <button onClick={sendChat} className="btn-primary" style={{ padding:"4px 12px", fontSize:12 }}>Send</button>
          </div>
        </div>
      </div>

      {/* ── Bottom bar: generation controls ── */}
      <div style={{
        borderTop:"1px solid var(--stroke)",
        background:"rgba(18,14,10,0.98)",
        flexShrink:0, padding:"10px 16px",
        display:"flex", flexDirection:"column", gap:8,
      }}>
        {/* Expanded options */}
        {(negOpen || moreOpen) && (
          <div style={{ display:"flex", gap:16, flexWrap:"wrap", paddingBottom:8, borderBottom:"1px solid var(--stroke)" }}>
            {negOpen && (
              <div style={{ flex:1, minWidth:220 }}>
                <label style={fldLabel}>Negative Prompt</label>
                <input value={negPrompt} onChange={e=>setNegPrompt(e.target.value)}
                  placeholder="What to exclude from the image…"
                  style={{ width:"100%", background:"rgba(255,255,255,0.06)", border:"1px solid var(--stroke)", borderRadius:8, color:"var(--ink)", fontFamily:"var(--font)", fontSize:13, padding:"7px 11px", outline:"none" }}
                />
              </div>
            )}
            {moreOpen && (<>
              {/* Aspect ratio */}
              <div>
                <label style={fldLabel}>Aspect Ratio</label>
                <div style={{ display:"flex", gap:4 }}>
                  {ASPECT_RATIOS.map(ar => (
                    <button key={ar.label} onClick={()=>setAspectRatio(ar)} style={{
                      padding:"4px 8px", borderRadius:6, border:"1px solid",
                      borderColor:aspectRatio.label===ar.label?"var(--accent)":"var(--stroke)",
                      background:aspectRatio.label===ar.label?"rgba(212,87,42,0.15)":"rgba(255,255,255,0.04)",
                      color:aspectRatio.label===ar.label?"var(--accent)":"var(--muted)",
                      fontFamily:"var(--font)", fontSize:11, cursor:"pointer",
                    }}>{ar.label}</button>
                  ))}
                </div>
                {aspectRatio.label==="Custom" && (
                  <input value={customRes} onChange={e=>setCustomRes(e.target.value)}
                    placeholder="e.g. 1280x720"
                    style={{ marginTop:5, background:"rgba(255,255,255,0.06)", border:"1px solid var(--stroke)", borderRadius:6, color:"var(--ink)", fontFamily:"var(--font)", fontSize:12, padding:"4px 8px", outline:"none", width:120 }}
                  />
                )}
              </div>
              {/* Seed */}
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                  <label style={{...fldLabel, marginBottom:0}}>Seed</label>
                  <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                    <span style={{ fontFamily:"var(--font)", fontSize:10, color:"var(--muted)" }}>Lock</span>
                    <MiniToggle value={lockSeed} onChange={setLockSeed}/>
                  </div>
                </div>
                <div style={{ display:"flex", gap:5 }}>
                  <input value={seed} onChange={e=>setSeed(e.target.value)}
                    placeholder={lockSeed?"Enter seed…":"Random"}
                    disabled={!lockSeed}
                    style={{ width:110, background:"rgba(255,255,255,0.06)", border:"1px solid var(--stroke)", borderRadius:6, color:"var(--ink)", fontFamily:"var(--font)", fontSize:12, padding:"5px 8px", outline:"none", opacity:lockSeed?1:0.45 }}
                  />
                  <button onClick={()=>setSeed(String(Math.floor(Math.random()*99999)))} disabled={!lockSeed}
                    style={{ background:"rgba(255,255,255,0.06)", border:"1px solid var(--stroke)", borderRadius:6, color:"var(--muted)", fontFamily:"var(--font)", fontSize:11, padding:"4px 8px", cursor:lockSeed?"pointer":"default", opacity:lockSeed?1:0.4 }}
                    title="Randomize">⟳</button>
                </div>
                {lockSeed && batchCount>1 && (
                  <div style={{ fontFamily:"var(--font)", fontSize:9, color:"#7ecfc0", marginTop:4 }}>Seed varies per batch item</div>
                )}
              </div>
              {/* Batch count */}
              <div>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                  <label style={{...fldLabel, marginBottom:0}}>Batch Count</label>
                  <span style={{ fontFamily:"var(--font)", fontSize:13, color:"var(--ink)", fontWeight:600 }}>{batchCount}</span>
                </div>
                <input type="range" min={1} max={8} value={batchCount} onChange={e=>setBatchCount(parseInt(e.target.value))}
                  style={{ width:120, accentColor:"var(--accent)" }}
                />
              </div>
            </>)}
          </div>
        )}

        {/* Queue (inline, above main row) */}
        {queue.length > 0 && (
          <div style={{ display:"flex", gap:8, overflow:"hidden", flexWrap:"nowrap" }}>
            {queue.map(item => <QueuePill key={item.id} item={item} onCancel={id=>setQueue(q=>q.filter(i=>i.id!==id))}/>)}
          </div>
        )}

        {/* Main row */}
        <div style={{ display:"flex", gap:8, alignItems:"flex-end" }}>
          {/* Prompt */}
          <div style={{ flex:1, position:"relative" }}>
            <input
              value={prompt} onChange={e=>setPrompt(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter"&&e.metaKey)handleGenerate(); }}
              placeholder="Describe the image you want to generate…"
              style={{
                width:"100%", background:"rgba(255,255,255,0.06)",
                border:"1px solid var(--stroke)", borderRadius:10,
                color:"var(--ink)", fontFamily:"var(--font)", fontSize:14,
                padding:"10px 14px", outline:"none",
              }}
            />
          </div>

          {/* Controls row */}
          <div style={{ display:"flex", gap:6, alignItems:"center", flexShrink:0 }}>
            {/* Enhance toggle */}
            <div style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", border:"1px solid var(--stroke)", borderRadius:8, background:"rgba(255,255,255,0.04)", cursor:"pointer" }} onClick={()=>setEnhance(v=>!v)}>
              <MiniToggle value={enhance} onChange={setEnhance}/>
              <span style={{ fontFamily:"var(--font)", fontSize:12, color:enhance?"var(--ink)":"var(--muted)" }}>Enhance</span>
            </div>

            {/* Neg prompt toggle */}
            <button onClick={()=>setNegOpen(v=>!v)} style={{
              padding:"6px 10px", borderRadius:8, border:"1px solid",
              borderColor: negOpen?"var(--accent)":"var(--stroke)",
              background: negOpen?"rgba(212,87,42,0.1)":"rgba(255,255,255,0.04)",
              color: negOpen?"var(--accent)":"var(--muted)",
              fontFamily:"var(--font)", fontSize:12, cursor:"pointer",
            }}>
              Negative {negPrompt ? "●" : ""}
            </button>

            {/* More options */}
            <button onClick={()=>setMoreOpen(v=>!v)} style={{
              padding:"6px 10px", borderRadius:8, border:"1px solid",
              borderColor:moreOpen?"var(--accent)":"var(--stroke)",
              background:moreOpen?"rgba(212,87,42,0.1)":"rgba(255,255,255,0.04)",
              color:moreOpen?"var(--accent)":"var(--muted)",
              fontFamily:"var(--font)", fontSize:12, cursor:"pointer",
            }}>
              {moreOpen ? "▲" : "▼"} More {res!=="1024x1024"||batchCount>1||seed ? "●" : ""}
            </button>

            {/* Generate */}
            <button onClick={handleGenerate} disabled={!prompt.trim()} className="btn-primary" style={{
              height:42, padding:"0 22px", fontSize:14, borderRadius:10,
              opacity:prompt.trim()?1:0.5,
            }}>
              Generate{batchCount>1?` ×${batchCount}`:""}
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      {detailImg && (
        <DetailModal img={detailImg} onClose={()=>setDetailImg(null)}
          onStar={handleStar} onEdit={i=>{setDetailImg(null);setEditImg(i);}} onDelete={id=>{handleDelete(id);setDetailImg(null);}}
        />
      )}
      {editImg && <EditModal img={editImg} onClose={()=>setEditImg(null)}/>}

      <style>{`
        @keyframes spin { to { transform:rotate(360deg); } }
        input[type=range] { -webkit-appearance:none; height:4px; border-radius:2px; background:rgba(255,255,255,0.1); cursor:pointer; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance:none; width:16px; height:16px; border-radius:8px; background:var(--accent); cursor:pointer; margin-top:-6px; }
        input[type=range]::-webkit-slider-runnable-track { height:4px; border-radius:2px; }
      `}</style>
    </div>
  );
}

/* ── tiny shared ── */
const sectionLabel = { fontFamily:"var(--font)", fontSize:10, fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:1.3 };
const fldLabel     = { display:"block", fontFamily:"var(--font)", fontSize:10, fontWeight:700, color:"var(--muted)", textTransform:"uppercase", letterSpacing:1, marginBottom:4 };

function NavRow({ label, count, active, onClick }) {
  return (
    <div onClick={onClick} style={{
      display:"flex", alignItems:"center", justifyContent:"space-between",
      padding:"5px 14px", cursor:"pointer",
      background: active?"rgba(212,87,42,0.1)":"transparent",
      borderLeft:"2px solid", borderLeftColor:active?"var(--accent)":"transparent",
      transition:"background 0.1s",
    }}>
      <span style={{ fontFamily:"var(--font)", fontSize:13, color:"var(--ink)" }}>{label}</span>
      <span style={{ fontFamily:"var(--font)", fontSize:11, color:"var(--muted)" }}>{count}</span>
    </div>
  );
}

Object.assign(window, { ImageWorkspace });
