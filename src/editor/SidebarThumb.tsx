import { useEffect, useState } from 'react'

export function SidebarThumb({ assetVariantId, alt = '' }: { assetVariantId?: string | null; alt?: string }) {
  const [failed, setFailed] = useState(false)

  useEffect(() => setFailed(false), [assetVariantId])

  if (!assetVariantId || failed) {
    return <span className="gp-side-thumb gp-side-thumb-empty" aria-hidden="true">—</span>
  }

  return (
    <img
      className="gp-side-thumb"
      src={`/rangers/${encodeURIComponent(assetVariantId)}/thumb.png`}
      alt={alt}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}
