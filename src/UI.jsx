import { useEffect, useRef, useState } from "react";

const paths = {
  pin: (
    <>
      <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  arrow: (
    <>
      <path d="M4 12h16M14 6l6 6-6 6" />
    </>
  ),
  back: <path d="m14 6-6 6 6 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 8a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 4v.2" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 21v-3a6 6 0 0 1 12 0v3m2-16a3 3 0 0 1 0 6m2 4a5 5 0 0 1 2 4v2" />
    </>
  ),
  screen: (
    <>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 21h8m-4-4v4" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="12" height="13" rx="2" />
      <path d="M16 8V3H3v13h5" />
    </>
  ),
  search: (
    <>
      <circle cx="10" cy="10" r="6" />
      <path d="m15 15 6 6" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 3h8v6a4 4 0 0 1-8 0V3Zm0 2H3v3a5 5 0 0 0 5 5m8-8h5v3a5 5 0 0 1-5 5m-4 0v7m-5 1h10" />
    </>
  ),
  chevron: <path d="m6 14 6-6 6 6" />,
  undo: (
    <>
      <path d="M4 4v6h6M4 10a8 8 0 1 1 0 8" />
    </>
  ),
};
export function Icon({ name, size = 20, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name] || paths.pin}
    </svg>
  );
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
      "每题只有地点名。在无文字地图上拖动、缩放，点选位置，再按“确认位置”。提交前都能修改。",
      "盲猜",
    ],
    [
      "误差越小，排名越高",
      "三题全部完成后提交。全员提交或房主揭晓时，查看真实位置和总距离误差。",
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
