/** Small authored pixel sprites, rendered identically across devices. */
export function PixelFace({ mood = 'happy', size = 48, ...props }) {
  return <svg className="pixel-face" width={size} height={size} viewBox="0 0 24 24" fill="none" shapeRendering="crispEdges" aria-hidden="true" {...props}>
    <path fill="var(--accent)" d="M6 1h12v2h3v3h2v12h-2v3h-3v2H6v-2H3v-3H1V6h2V3h3z" />
    <path fill="var(--ink)" d="M6 7h3v4H6zm9 0h3v4h-3z" />
    {mood === 'waiting' ? <path fill="var(--ink)" d="M8 15h8v3H8z" /> : <path fill="var(--ink)" d="M6 14h3v3h6v-3h3v3h-3v3H9v-3H6z" />}
    <path fill="var(--coral)" d="M3 12h3v3H3zm15 0h3v3h-3z" />
  </svg>;
}

export function PixelSkyline({ className = '', ...props }) {
  return <svg className={`pixel-skyline ${className}`} viewBox="0 0 480 172" fill="none" shapeRendering="crispEdges" aria-hidden="true" {...props}>
    <path fill="#343F61" d="M0 137h14V96h26v41h14V68h24v69h13V112h25v25h23V83h21v54h22v-34h21v34h32V76h21v61h25V96h21v41h13V52h28v85h17V87h23v50h18V68h24v69h15V109h29v28h21v35H0z" />
    <path fill="#8592AC" d="M24 112h4v5h-4zm37-31h4v5h-4zm0 14h4v5h-4zm39 29h4v5h-4zm51-28h4v5h-4zm42 20h4v5h-4zm50-27h4v5h-4zm83-24h5v6h-5zm0 15h5v6h-5zm0 15h5v6h-5zm39 5h4v5h-4zm42-18h4v5h-4zm0 14h4v5h-4zm39 24h4v5h-4z" />
    <path fill="#52D8B7" d="M57 154h22v-8h12v-12h8v-16h8v16h8v12h12v8h22v10H57z" />
    <path fill="#FF8C80" d="M183 106h114v43H183zM193 81h94v22h-94z" />
    <path fill="#FFD45C" d="M213 54h54v7h11v8h13v7h14v8H175v-8h14v-7h13v-8h11zm-29 43h112v7h12v7h12v9H160v-9h12v-7h12z" />
    <path fill="#171B2F" d="M202 124h12v25h-12zm32 0h12v25h-12zm32 0h12v25h-12zM204 88h8v10h-8zm19 0h8v10h-8zm26 0h8v10h-8zm19 0h8v10h-8z" />
    <path fill="#F4F0DC" d="M157 149h166v8H157zm-8 8h182v7H149zM94 34h5v5h5v5h-5v5h-5v-5h-5v-5h5zm274-6h5v5h5v5h-5v5h-5v-5h-5v-5h5z" />
    <path fill="#FFD45C" d="M429 23h18v4h5v18h-5v5h-18v-5h-5V27h5zM234 33h6v19h-6zm6 0h15v9h-15z" />
    <path fill="#52D8B7" d="M0 164h480v8H0z" />
  </svg>;
}
