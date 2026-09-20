import { useEffect, useRef, useState } from "react";

const paths = {
  pin: <path d="M8 2h8v2h4v4h2v8h-2v4h-4v4h-4v-4H8v-4H6V8h2V4h0zm2 6v8h8V8z" transform="translate(-2 -1)" fillRule="evenodd" />,
  arrow: <path d="M14 3h3v3h3v3h3v6h-3v3h-3v3h-3v-6H2V9h12z" />,
  back: <path d="M13 3h4v4h-4v4H9v2h4v4h4v4h-4v-4H9v-4H5v-2h4V7h4z" />,
  check: <path d="M19 4h4v4h-4v4h-4v4h-4v4H7v-4H3v-4H0V8h4v4h4v4h3v-4h4V8h4z" />,
  close: <path d="M3 3h4v4h4v4h2V7h4V3h4v4h-4v4h-4v2h4v4h4v4h-4v-4h-4v-4h-2v4H7v4H3v-4h4v-4h4v-2H7V7H3z" />,
  help: <path d="M6 2h12v2h4v16h-4v2H6v-2H2V4h4zm2 4v3h3V8h3v3h-3v5h3v-3h3V6zm3 12v2h3v-2z" fillRule="evenodd" />,
  users: <path d="M5 3h7v7H5zM2 13h13v9H2zM15 4h5v6h-5zM18 13h5v9h-5z" />,
  screen: <path d="M1 3h22v15h-9v3h5v2H5v-2h5v-3H1zm3 3v9h16V6z" fillRule="evenodd" />,
  copy: <path d="M2 2h14v4H6v10H2zm6 6h14v14H8zm3 3v8h8v-8z" fillRule="evenodd" />,
  search: <path d="M5 2h10v3h3v10h-3v3H5v-3H2V5h3zm1 4v8h8V6zm10 10h4v4h4v4h-4v-4h-4z" fillRule="evenodd" />,
  trophy: <path d="M6 2h12v3h5v8h-3v3h-5v3h4v4H5v-4h4v-3H4v-3H1V5h5zm-2 6v3h2V8zm14 0v3h2V8z" fillRule="evenodd" />,
  flag: <path d="M3 2h3v2h15v10H6v9H3zm3 4v6h6V6z" fillRule="evenodd" />,
  chevron: <path d="M10 4h4v4h4v4h4v4h-4v-4h-4V8h-4v4H6v4H2v-4h4V8h4z" />,
  undo: <path d="M6 2h4v5h9v3h3v9h-3v3H9v-4h9v-7h-8v5H6v-4H2V6h4z" />,
};
export function Icon({ name, size = 20, ...props }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true" {...props}>{paths[name] || paths.pin}</svg>;
}
export function Brand() {
  return (
    <span className="brand">
      <span className="brand-mark">
        <Icon name="pin" size={21} />
      </span>
      北京地标盲猜
    </span>
  );
}
export function Toast({ message }) {
  return message ? (
    <div className="toast" role="status">
      {message}
    </div>
  ) : null;
}
export function useToast() {
  const [toast, setToast] = useState("");
  const timer = useRef();
  useEffect(() => () => clearTimeout(timer.current), []);
  return {
    toast,
    showToast: (text) => {
      setToast(text);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setToast(""), 2600);
    },
  };
}
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand("copy");
    el.remove();
    return ok;
  }
}
export function Guide({ open, onClose }) {
  const ref = useRef(null);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (open) {
      setStep(0);
      ref.current?.showModal();
    } else ref.current?.close();
  }, [open]);
  const steps = [
    [
      "先出两道题",
      "搜索两个你熟悉的北京地点，确认位置后加入题库。出满两题，就准备好了。",
      "出题",
    ],
    [
      "凭记忆，猜三个点",
      "每题只有地点名。在无文字地图上拖动、缩放，点选位置，再点 ✅ 确认。第三题确认前可以修改和撤销。",
      "盲猜",
    ],
    [
      "误差越小，排名越高",
      "三题全部确认后自动提交，立即查看自己的真实位置与总误差。全员交卷或管理员揭晓后，公布最终排名。",
      "揭晓",
    ],
  ];
  return (
    <dialog
      ref={ref}
      className="guide-dialog"
      onCancel={onClose}
      onClose={() => {
        if (open) onClose();
      }}
      aria-labelledby="guide-title"
    >
      <div className="dialog-top">
        <span>怎么玩</span>
        <button className="icon-btn" aria-label="关闭指引" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div className="guide-steps" aria-label={`第 ${step + 1} 步，共 3 步`}>
        {steps.map((s, i) => (
          <span key={s[2]} className={i === step ? "active" : ""}>
            {i + 1}
            <small>{s[2]}</small>
          </span>
        ))}
      </div>
      <h2 id="guide-title">{steps[step][0]}</h2>
      <p>{steps[step][1]}</p>
      <p className="muted small">
        房主也可以一起玩。单人试玩时，三题均来自系统。
      </p>
      <div className="dialog-actions">
        <button className="text-btn" onClick={onClose}>
          跳过指引
        </button>
        <button
          className="primary"
          onClick={() => (step < 2 ? setStep(step + 1) : onClose())}
        >
          {step < 2 ? "下一步" : "开始探索"}
          <Icon name="arrow" />
        </button>
      </div>
    </dialog>
  );
}
export function ConfirmDialog({ value, onClose, onConfirm }) {
  const ref = useRef(null);
  useEffect(() => {
    if (value) ref.current?.showModal();
    else ref.current?.close();
  }, [value]);
  return (
    <dialog
      className="confirm-dialog"
      ref={ref}
      onCancel={onClose}
      aria-labelledby="confirm-title"
    >
      <h2 id="confirm-title">{value?.title}</h2>
      <p>{value?.message}</p>
      <div className="dialog-actions">
        <button className="secondary" onClick={onClose}>
          再等等
        </button>
        <button className="primary" onClick={onConfirm}>
          {value?.label}
        </button>
      </div>
    </dialog>
  );
}
