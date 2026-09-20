/** Small authored pixel sprites, rendered identically across devices. */
export function PixelGuide({ className = "", ...props }) {
  return <svg className={`pixel-guide ${className}`} width="64" height="72" viewBox="0 0 32 36" fill="none" shapeRendering="crispEdges" aria-hidden="true" {...props}>
    <path fill="var(--ink)" d="M8 2h16v3h4v4h2v14h-4v4h-5v4h-3v4h-4v-4h-3v-4H6v-4H2V9h2V5h4z" />
    <path fill="var(--accent)" d="M9 5h14v3h4v13h-4v3h-5v5h-4v-5H9v-3H5V8h4z" />
    <path fill="var(--ink)" d="M10 11h3v5h-3zm10 0h3v5h-3zm-8 8h3v2h4v-2h3v4H12z" />
    <path fill="var(--coral)" d="M7 17h4v3H7zm15 0h4v3h-4z" />
    <path fill="var(--surface)" d="M9 6h7v2H9z" />
  </svg>;
}

/** Original stepped skyline: courtyard lanes, a city gate and modern Beijing. */
export function PixelCity({ className = "", ...props }) {
  return <svg className={`pixel-city ${className}`} viewBox="0 0 720 260" fill="none" shapeRendering="crispEdges" aria-hidden="true" {...props}>
    <path fill="#c7dce5" d="M0 130h35V99h33v31h26V82h32v48h30V62h28v68h42V95h29v35h36V78h34v52h51V94h34v36h35V49h29v81h43V75h33v55h44V38h24v92h40V84h27v46h46V64h27v66h25v88H0z" />
    <path fill="#9cb9c9" d="M63 153h33v-44h25v44h26V83h32v70h35v-25h27v25h210V74h38v79h25V93h34v60h28v-45h39v45h53V95h29v58h23v65H63z" />
    <path fill="#202d44" d="M484 60h45v18h8v18h8v18h8v18h8v18h8v30h-22v-20h-8v-18h-8v-18h-8v-18h-8V88h-9v102h-22zm63 90h50V34h30v18h8v18h8v18h8v114h-54v-28h-50zm74-80v80h12V96h-6V70z" />
    <path fill="#b0cad4" d="M491 73h6v10h-6zm0 22h6v10h-6zm0 22h6v10h-6zm0 22h6v10h-6zm0 22h6v10h-6zm113-87h6v12h-6zm0 24h6v12h-6zm0 24h6v12h-6zm0 24h6v12h-6z" />
    <path fill="#e77761" d="M231 131h206v84H231zm23-40h160v36H254z" />
    <path fill="#f5bf36" d="M287 62h94v7h12v8h16v8h18v9H241v-9h18v-8h16v-8h12zm-29 57h153v7h17v9h21v12H219v-12h22v-9h17z" />
    <path fill="#202d44" d="M236 147h196v8H236zm36 25h17v43h-17zm52 0h20v43h-20zm55 0h17v43h-17zM267 99h12v18h-12zm28 0h12v18h-12zm28 0h12v18h-12zm28 0h12v18h-12zm28 0h12v18h-12z" />
    <path fill="#fff1bf" d="M222 215h222v9H222zm-14 9h248v9H208z" />
    <path fill="#f5bf36" d="M330 35h5v27h-5zm5 0h26v14h-26z" />
    <path fill="#16735d" d="M11 192h20v-19h12v-20h13v20h13v19h19v41H11zm420 13h14v-25h12v-21h12v21h12v25h12v28h-62zm233-37h13v-26h13v26h13v25h17v40h-69v-40h13z" />
    <path fill="#eef4f6" d="M85 193h99v39H85z" />
    <path fill="#202d44" d="M79 184h15v-10h16v-10h49v10h16v10h16v12H79zm27 22h17v26h-17zm35 0h22v15h-22z" />
    <path fill="#e77761" d="M97 201h7v31h-7zm76 0h7v31h-7z" />
    <path fill="#202d44" d="M0 233h720v9H0z" />
    <path fill="#859bad" d="M0 242h720v18H0z" />
    <path stroke="#fffdf5" strokeWidth="3" strokeDasharray="24 18" d="M0 251h720" />
    <path fill="#f5bf36" d="M643 6h24v5h5v23h-5v5h-24v-5h-5V11h5z" />
    <path fill="#fffdf5" d="M41 34h29v-7h27v7h16v10H41zm385-18h19V9h28v7h18v10h-65z" />
    <path fill="#202d44" d="M177 188h5v45h-5z" />
    <path fill="#16735d" d="M149 184h63v22h-63z" />
    <text x="157" y="200" fill="#fffdf5" fontSize="12" fontFamily="sans-serif" fontWeight="700">北京胡同</text>
  </svg>;
}

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
