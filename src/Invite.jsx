import { useEffect, useMemo, useState } from "react";
import qrcode from "qrcode-generator";
import { Icon, copyText } from "./UI.jsx";
import { inviteAddresses } from "./invite.js";

export function Invite({ onCopy }) {
  const [urls, setUrls] = useState(() => inviteAddresses(window.location.origin));
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(!urls.length);
  const [retry, setRetry] = useState(0);
  const url = urls.includes(selected) ? selected : urls[0];
  useEffect(() => {
    if (inviteAddresses(window.location.origin).length) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("timeout"), 8000);
    setLoading(true);
    fetch("/api/lan", { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error("lan_unavailable"); return response.json(); })
      .then(data => { if (!controller.signal.aborted) setUrls(inviteAddresses(window.location.origin, Array.isArray(data.urls) ? data.urls : [])); })
      .catch(() => { /* A missing address must never become a localhost QR. */ })
      .finally(() => { clearTimeout(timer); if (!controller.signal.aborted || controller.signal.reason === "timeout") setLoading(false); });
    return () => { clearTimeout(timer); controller.abort(); };
  }, [retry]);
  const qr = useMemo(() => {
    if (!url) return null;
    const code = qrcode(0, "M");
    code.addData(url);
    code.make();
    const size = code.getModuleCount();
    let path = "";
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      if (code.isDark(y, x)) path += `M${x + 4} ${y + 4}h1v1h-1z`;
    }
    return { path, size: size + 8 };
  }, [url]);
  async function copyInvite() {
    try { const copied = await copyText(url); onCopy?.(copied ? "邀请链接已复制" : "复制失败，请手动复制地址"); }
    catch { onCopy?.("复制失败，请手动复制地址"); }
  }
  return <div className="invite-pass">
    {qr ? <svg className="invite-qr" viewBox={`0 0 ${qr.size} ${qr.size}`} role="img" aria-label="扫码加入游戏" shapeRendering="crispEdges">
      <title>{url}</title><path fill="#fff" d={`M0 0h${qr.size}v${qr.size}H0z`} /><path fill="#202d44" d={qr.path} />
    </svg> : <div className="invite-placeholder" role="status"><Icon name="screen" size={32} /><span>{loading ? "正在获取入场地址" : "暂未获取到局域网地址"}</span></div>}
    <div className="invite-pass-copy"><span className="ticket-eyebrow">一人一部手机，一起开场</span><h2>扫码，加入这局</h2>
      <p>手机与主机连接同一局域网</p>
      {url ? <><p className="invite-url">{url}</p>{urls.length > 1 && <label className="invite-network">入场地址<select value={url} onChange={event => setSelected(event.target.value)} aria-label="选择入场地址">{urls.map(value => <option key={value} value={value}>{value}</option>)}</select></label>}
        <button className="text-btn" onClick={copyInvite}><Icon name="copy" size={16} />复制邀请链接</button></>
        : !loading && <><p className="small">可用局域网地址打开此页，或重新获取。</p><button className="text-btn" onClick={() => setRetry(value => value + 1)}>重新获取</button></>}
    </div>
  </div>;
}
