import { useEffect, useState } from 'react'
import { StoreProvider, useStore, go } from './store'
import { Gate } from './views/Gate'
import { Gallery } from './views/Gallery'
import { Admin } from './views/Admin'

function Backdrop() {
  const { dark } = useStore()
  const [ok, setOk] = useState(false)
  const src = dark ? '/night.jpg' : '/day.jpg'
  useEffect(() => { setOk(false); const i = new Image(); i.onload = () => setOk(true); i.src = src }, [src])
  return <div className="backdrop" aria-hidden>{ok && <img src={src} alt="" className="ready" />}</div>
}
function Shell() {
  const { route, auth, toasts } = useStore()
  useEffect(() => {
    if (!auth) return
    if (route.name === 'gate' && (auth.viewer || auth.admin)) go('/g')
    if (route.name === 'gallery' && !auth.viewer && !auth.admin) go('/')
  }, [route, auth])
  return (
    <>
      <Backdrop />
      {auth === null ? null : route.name === 'admin' ? <Admin /> : route.name === 'gallery' && (auth.viewer || auth.admin) ? <Gallery /> : <Gate />}
      <div className="toasts">{toasts.map((t) => <div key={t.id} className="toast glass-strong">{t.text}</div>)}</div>
    </>
  )
}
export default function App() { return <StoreProvider><Shell /></StoreProvider> }
