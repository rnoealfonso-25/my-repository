import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerCameraDirection,
  CapacitorBarcodeScannerScanOrientation,
  CapacitorBarcodeScannerTypeHint,
} from '@capacitor/barcode-scanner'
import './App.css'

const DEFAULT_API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000'
const REQUEST_TIMEOUT_MS = 15000
const NAV_ITEMS = [
  { id: 'inicio', label: 'Inicio', icon: 'home' },
  { id: 'equipos', label: 'Equipos', icon: 'equipment' },
  { id: 'scanner', label: 'Scanner', icon: 'scan' },
  { id: 'registro', label: 'Agregar', icon: 'add' },
]

const SERVER_UNAVAILABLE_MESSAGE = 'Servidor no disponible. Espere mas tarde o reporte la incidencia.'

function normalizeApiUrl(url) {
  return url.trim().replace(/\/$/, '')
}

function isServerUnavailableError(err) {
  return err?.name === 'AbortError' || err instanceof TypeError || /failed to fetch|networkerror|load failed|tardo demasiado|no se pudo conectar/i.test(err?.message || '')
}

function apiErrorMessage(err) {
  return isServerUnavailableError(err) ? SERVER_UNAVAILABLE_MESSAGE : err.message
}

function resolveImageUrl(apiUrl, value) {
  if (!value) return ''
  if (/^https?:\/\//i.test(value) || value.startsWith('blob:') || value.startsWith('data:')) return value
  return `${apiUrl}${value.startsWith('/') ? value : `/${value}`}`
}

function parseScannedValue(value) {
  const raw = String(value || '').trim()
  if (!raw) return { type: 'empty', raw }
  if (/^\d+$/.test(raw)) return { type: 'id', id: Number.parseInt(raw, 10), raw }

  try {
    const data = JSON.parse(raw)
    return {
      type: 'draft',
      raw,
      descripcion: data.descripcion || data.description || raw,
      imagen: data.imagen || data.image || '',
    }
  } catch {
    return { type: 'draft', raw, descripcion: raw, imagen: '' }
  }
}


function NavIcon({ name }) {
  const commonProps = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' }

  if (name === 'home') {
    return <svg {...commonProps}><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10.5V20h13v-9.5" /><path d="M9.5 20v-6h5v6" /></svg>
  }

  if (name === 'equipment') {
    return <svg {...commonProps}><rect x="4" y="5" width="16" height="11" rx="2" /><path d="M8 20h8" /><path d="M12 16v4" /><path d="M8 9h3" /><path d="M8 12h8" /></svg>
  }

  if (name === 'scan') {
    return <svg {...commonProps}><path d="M4 7V5a1 1 0 0 1 1-1h2" /><path d="M17 4h2a1 1 0 0 1 1 1v2" /><path d="M20 17v2a1 1 0 0 1-1 1h-2" /><path d="M7 20H5a1 1 0 0 1-1-1v-2" /><path d="M8 8h2v2H8z" /><path d="M14 8h2v2h-2z" /><path d="M8 14h2v2H8z" /><path d="M14 14h2" /><path d="M16 14v2" /></svg>
  }

  return <svg {...commonProps}><rect x="5" y="5" width="14" height="14" rx="3" /><path d="M12 8v8" /><path d="M8 12h8" /></svg>
}

function App() {
  const apiUrl = useMemo(() => normalizeApiUrl(DEFAULT_API_URL), [])
  const fileInputRef = useRef(null)
  const cameraInputRef = useRef(null)
  const objectUrlRef = useRef('')

  const [activeView, setActiveView] = useState('inicio')
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => window.matchMedia('(min-width: 861px)').matches)
  const [equipos, setEquipos] = useState([])
  const [selectedEquipo, setSelectedEquipo] = useState(null)
  const [editingEquipo, setEditingEquipo] = useState(null)
  const [editForm, setEditForm] = useState({ descripcion: '', imagen: '' })
  const [query, setQuery] = useState('')
  const [form, setForm] = useState({ descripcion: '', imagenUrl: '', imagenFile: null })
  const [previewUrl, setPreviewUrl] = useState('')
  const [scanResult, setScanResult] = useState(null)
  const [status, setStatus] = useState('Listo')
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const filteredEquipos = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return equipos
    return equipos.filter((equipo) => equipo.descripcion.toLowerCase().includes(term))
  }, [equipos, query])

  async function request(path, options = {}) {
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

    try {
      const response = await fetch(`${apiUrl}${path}`, { ...options, signal: controller.signal })
      const data = await response.json().catch(() => null)
      if (!response.ok) throw new Error(data?.detail || 'No se pudo completar la solicitud.')
      return data
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(SERVER_UNAVAILABLE_MESSAGE, { cause: err })
      }
      if (err instanceof TypeError) {
        throw new Error(SERVER_UNAVAILABLE_MESSAGE, { cause: err })
      }
      throw err
    } finally {
      window.clearTimeout(timeout)
    }
  }

  async function loadEquipos() {
    setIsLoading(true)
    setError('')
    try {
      const data = await request('/equipos')
      setEquipos(data)
      setStatus(`${data.length} equipos cargados`)
    } catch (err) {
      setError(apiErrorMessage(err))
      setStatus('API no disponible')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    let ignore = false
    const controller = new AbortController()

    fetch(`${apiUrl}/equipos`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error('No se pudo conectar con la API.')
        return response.json()
      })
      .then((data) => {
        if (ignore) return
        setEquipos(data)
        setStatus(`${data.length} equipos cargados`)
        setError('')
      })
      .catch((err) => {
        if (ignore) return
        setError(apiErrorMessage(err))
        setStatus('API no disponible')
      })

    return () => {
      ignore = true
      controller.abort()
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    }
  }, [apiUrl])

  function setImageUrl(value) {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = ''
    }
    setForm((current) => ({ ...current, imagenUrl: value, imagenFile: null }))
    setPreviewUrl(value)
  }

  function handleImageFile(file) {
    if (!file) return
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current)
    const url = URL.createObjectURL(file)
    objectUrlRef.current = url
    setForm((current) => ({ ...current, imagenFile: file, imagenUrl: '' }))
    setPreviewUrl(url)
  }

  function resetForm() {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = ''
    }
    setForm({ descripcion: '', imagenUrl: '', imagenFile: null })
    setPreviewUrl('')
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (cameraInputRef.current) cameraInputRef.current.value = ''
  }


  function cancelCreateEquipo() {
    resetForm()
    setError('')
    setStatus('Listo')
    setActiveView('inicio')
  }


  function openEquipoDialog(equipo) {
    setSelectedEquipo(equipo)
    setEditingEquipo(null)
  }

  function startEditingEquipo(equipo) {
    setEditingEquipo(equipo)
    setEditForm({ descripcion: equipo.descripcion || '', imagen: equipo.imagen || '' })
    setError('')
  }

  function closeEquipoDialog() {
    setSelectedEquipo(null)
    setEditingEquipo(null)
  }

  async function updateEquipo(event) {
    event?.preventDefault()
    if (!editingEquipo) return
    if (!editForm.descripcion.trim()) {
      setError('La descripcion del equipo es obligatoria.')
      return
    }

    setIsLoading(true)
    setError('')
    setStatus('Actualizando equipo...')

    try {
      const equipo = await request(`/equipos/${editingEquipo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descripcion: editForm.descripcion.trim(),
          imagen: editForm.imagen.trim() || null,
        }),
      })
      setEquipos((current) => current.map((item) => (item.id === equipo.id ? equipo : item)).sort((a, b) => a.id - b.id))
      setSelectedEquipo(equipo)
      setEditingEquipo(null)
      setStatus('Equipo actualizado')
    } catch (err) {
      setError(apiErrorMessage(err))
      setStatus('No se pudo actualizar')
    } finally {
      setIsLoading(false)
    }
  }

  async function deleteEquipo(equipo) {
    if (!equipo) return
    const confirmed = window.confirm('Se eliminara este equipo. Esta accion no se puede deshacer. ?Continuar?')
    if (!confirmed) return

    setIsLoading(true)
    setError('')
    setStatus('Eliminando equipo...')

    try {
      await request(`/equipos/${equipo.id}`, { method: 'DELETE' })
      setEquipos((current) => current.filter((item) => item.id !== equipo.id))
      closeEquipoDialog()
      setStatus('Equipo eliminado')
    } catch (err) {
      setError(apiErrorMessage(err))
      setStatus('No se pudo eliminar')
    } finally {
      setIsLoading(false)
    }
  }

  async function createEquipo(event) {
    event?.preventDefault()
    if (!form.descripcion.trim()) {
      setError('La descripcion del equipo es obligatoria.')
      return
    }

    const body = new FormData()
    body.append('descripcion', form.descripcion.trim())
    if (form.imagenUrl.trim()) body.append('imagen_url', form.imagenUrl.trim())
    if (form.imagenFile) body.append('imagen_archivo', form.imagenFile)

    setIsLoading(true)
    setError('')
    setStatus('Registrando equipo...')

    try {
      const equipo = await request('/equipos/form', { method: 'POST', body })
      setEquipos((current) => [...current, equipo].sort((a, b) => a.id - b.id))
      setSelectedEquipo(equipo)
      resetForm()
      setActiveView('equipos')
      setStatus('Equipo registrado')
    } catch (err) {
      setError(apiErrorMessage(err))
      setStatus('No se pudo registrar')
    } finally {
      setIsLoading(false)
    }
  }

  async function openEquipoById(id) {
    setIsLoading(true)
    setError('')
    setStatus('Buscando equipo...')
    try {
      const equipo = await request(`/equipos/${id}`)
      openEquipoDialog(equipo)
      setScanResult({ type: 'id', id, raw: String(id), found: true })
      setStatus('Equipo encontrado')
    } catch (err) {
      setSelectedEquipo(null)
      setScanResult({ type: 'id', id, raw: String(id), found: false })
      setError(apiErrorMessage(err))
      setStatus('Sin coincidencias')
    } finally {
      setIsLoading(false)
    }
  }

  async function scanQr() {
    setIsLoading(true)
    setError('')
    setStatus('Abriendo camara...')

    try {
      const result = await CapacitorBarcodeScanner.scanBarcode({
        hint: CapacitorBarcodeScannerTypeHint.QR_CODE,
        scanInstructions: 'Alinea el codigo QR del equipo dentro del cuadro.',
        scanButton: false,
        scanText: 'Escanear',
        cameraDirection: CapacitorBarcodeScannerCameraDirection.BACK,
        scanOrientation: CapacitorBarcodeScannerScanOrientation.PORTRAIT,
        web: { showCameraSelection: true, scannerFPS: 10 },
      })

      const parsed = parseScannedValue(result?.ScanResult)
      setScanResult(parsed)

      if (parsed.type === 'id') {
        await openEquipoById(parsed.id)
        return
      }

      if (parsed.type === 'draft') {
        resetForm()
        setForm({ descripcion: parsed.descripcion, imagenUrl: parsed.imagen, imagenFile: null })
        setPreviewUrl(parsed.imagen)
        setActiveView('registro')
        setStatus('Datos escaneados cargados en el formulario')
        return
      }

      setStatus('Escaneo cancelado')
    } catch (err) {
      setError(err.message || 'No se pudo abrir el scanner.')
      setStatus('Error de scanner')
    } finally {
      setIsLoading(false)
    }
  }

  function renderActiveView() {
    if (activeView === 'inicio') {
      return (
        <section className="welcome-view animate-in">
          <div className="welcome-copy">
            <span className="eyebrow">Sistema para la gestión del Laboratorio de  Automática e Instrumentación</span>
            <h1>Bienvenido a AutLab</h1>
            <p>
              Administra equipos, adjunta imagenes y consulta fichas desde codigos QR en una interfaz preparada
              para web y app movil.
            </p>
            <div className="hero-actions">
              <button type="button" className="primary-action" onClick={() => setActiveView('scanner')}>Abrir scanner</button>
              <button type="button" className="secondary-action" onClick={() => setActiveView('equipos')}>Ver equipos</button>
            </div>
          </div>
          <div className="welcome-metrics">
            <div><strong>{equipos.length}</strong><span>Equipos registrados</span></div>
            <div><strong>{apiUrl.replace(/^https?:\/\//, '')}</strong><span>API activa</span></div>
          </div>
        </section>
      )
    }

    if (activeView === 'equipos') {
      return (
        <section className="content-card animate-in">
          <div className="section-heading">
            <div><span className="eyebrow">Inventario</span><h2>Listado de equipos</h2></div>
            <button type="button" className="secondary-action" onClick={loadEquipos} disabled={isLoading}>Actualizar</button>
          </div>
          <div className="search-box">
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                if (status === 'API no disponible') setError(SERVER_UNAVAILABLE_MESSAGE)
              }}
              placeholder="Buscar por descripcion"
            />
          </div>
          <div className="equipment-grid">
            {filteredEquipos.map((equipo) => (
              <button type="button" className="equipment-card" key={equipo.id} onClick={() => openEquipoDialog(equipo)}>
                <div className="thumb">
                  {equipo.imagen ? <img src={resolveImageUrl(apiUrl, equipo.imagen)} alt="" /> : <span>Sin imagen</span>}
                </div>
                <div><strong>Equipo</strong><p>{equipo.descripcion}</p></div>
              </button>
            ))}
            {filteredEquipos.length === 0 && <div className="empty-state">No hay equipos que coincidan.</div>}
          </div>
        </section>
      )
    }

    if (activeView === 'scanner') {
      return (
        <section className="content-card scanner-view animate-in">
          <div className="section-heading"><div><span className="eyebrow">Camara</span><h2>Scanner QR</h2></div></div>
          <div className="scanner-stage">
            <div className="scan-frame"><span /><span /><span /><span /></div>
            <button type="button" className="primary-action" onClick={scanQr} disabled={isLoading}>{isLoading ? 'Procesando...' : 'Escanear codigo QR'}</button>
          </div>
          {scanResult && (
            <div className="scan-result">
              <span className="eyebrow">Ultimo escaneo</span>
              <p>{scanResult.raw}</p>
              {scanResult.type === 'draft' && <button type="button" className="secondary-action" onClick={() => setActiveView('registro')}>Agregar a la base de datos</button>}
            </div>
          )}
        </section>
      )
    }

    return (
      <section className="content-card form-view animate-in">
        <div className="section-heading"><div><span className="eyebrow">Nuevo registro</span><h2>Agregar equipo</h2></div></div>
        <form className="equipment-form" onSubmit={createEquipo}>
          <label htmlFor="descripcion">Descripcion</label>
          <textarea id="descripcion" value={form.descripcion} onChange={(event) => setForm((current) => ({ ...current, descripcion: event.target.value }))} placeholder="Descripcion tecnica o identificacion del equipo" rows="4" />

          <div className="image-options">
            <div>
              <label htmlFor="imagenUrl">Imagen desde web</label>
              <input id="imagenUrl" value={form.imagenUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://servidor/imagen.jpg" />
            </div>
            <div className="file-actions">
              <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(event) => handleImageFile(event.target.files?.[0])} />
              <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={(event) => handleImageFile(event.target.files?.[0])} />
              <button type="button" className="secondary-action" onClick={() => fileInputRef.current?.click()}>Elegir archivo</button>
              <button type="button" className="secondary-action" onClick={() => cameraInputRef.current?.click()}>Usar camara</button>
            </div>
          </div>

          {previewUrl && <div className="image-preview"><img src={resolveImageUrl(apiUrl, previewUrl)} alt="Vista previa" /></div>}
          <div className="form-actions">
            <button type="submit" className="primary-action" disabled={isLoading}>{isLoading ? 'Guardando...' : 'Guardar equipo'}</button>
            <button type="button" className="secondary-action" onClick={cancelCreateEquipo} disabled={isLoading}>Cancelar</button>
          </div>
        </form>
      </section>
    )
  }

  return (
    <div className={`app-layout ${isSidebarOpen ? 'sidebar-open' : 'sidebar-collapsed'}`}>
      <aside className="sidebar" aria-label="Menu lateral">
        <div className="brand-block">
          <img className="brand-mark" src="/logo-menu.png" alt="AutLab" />
          <div className="brand-copy"><strong>AutLab</strong><span>Laboratorio</span></div>
        </div>
        <nav className="side-nav" aria-label="Principal">
          {NAV_ITEMS.map((item) => (
            <button
              type="button"
              key={item.id}
              className={activeView === item.id ? 'active' : ''}
              onClick={() => {
                setActiveView(item.id)
                if (window.matchMedia('(max-width: 860px)').matches) setIsSidebarOpen(false)
              }}
            >
              <span className="nav-icon"><NavIcon name={item.icon} /></span><b>{item.label}</b>
            </button>
          ))}
        </nav>
      </aside>

      {isSidebarOpen && <button type="button" className="sidebar-scrim" aria-label="Cerrar menu" onClick={() => setIsSidebarOpen(false)} />}

      <main className="main-shell">
        <header className="topbar">
          <button type="button" className="menu-toggle" aria-label="Abrir o cerrar menu" onClick={() => setIsSidebarOpen((value) => !value)}>
            <span />
            <span />
            <span />
          </button>
          <div><span className="eyebrow">AutLab</span><h1>{NAV_ITEMS.find((item) => item.id === activeView)?.label}</h1></div>
        </header>
        {error && <div className="notice error">{error}</div>}
        {renderActiveView()}
      </main>

      {selectedEquipo && (
        <div className="dialog-backdrop" role="presentation" onClick={closeEquipoDialog}>
          <section className="equipment-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="dialog-header">
              <div><span className="eyebrow">Ficha de equipo</span><h2>Equipo</h2></div>
              <button className="close-button" type="button" onClick={closeEquipoDialog} aria-label="Cerrar">X</button>
            </div>

            {editingEquipo?.id === selectedEquipo.id ? (
              <form className="edit-form" onSubmit={updateEquipo}>
                <label htmlFor="editDescripcion">Descripcion</label>
                <textarea
                  id="editDescripcion"
                  value={editForm.descripcion}
                  onChange={(event) => setEditForm((current) => ({ ...current, descripcion: event.target.value }))}
                  rows="4"
                />
                <label htmlFor="editImagen">Imagen</label>
                <input
                  id="editImagen"
                  value={editForm.imagen}
                  onChange={(event) => setEditForm((current) => ({ ...current, imagen: event.target.value }))}
                  placeholder="URL o ruta de imagen"
                />
                {editForm.imagen && <img className="equipment-image" src={resolveImageUrl(apiUrl, editForm.imagen)} alt="Vista previa" />}
                <div className="dialog-actions">
                  <button type="submit" className="primary-action" disabled={isLoading}>{isLoading ? 'Guardando...' : 'Guardar cambios'}</button>
                  <button type="button" className="secondary-action" onClick={() => setEditingEquipo(null)} disabled={isLoading}>Cancelar</button>
                </div>
              </form>
            ) : (
              <>
                {selectedEquipo.imagen && <img className="equipment-image" src={resolveImageUrl(apiUrl, selectedEquipo.imagen)} alt={selectedEquipo.descripcion} />}
                <table className="details-table"><tbody><tr><th>Descripcion</th><td>{selectedEquipo.descripcion}</td></tr><tr><th>Imagen</th><td>{selectedEquipo.imagen || 'Sin imagen'}</td></tr></tbody></table>
                <div className="dialog-actions">
                  <button type="button" className="primary-action" onClick={() => startEditingEquipo(selectedEquipo)} disabled={isLoading}>Editar</button>
                  <button type="button" className="danger-action" onClick={() => deleteEquipo(selectedEquipo)} disabled={isLoading}>{isLoading ? 'Eliminando...' : 'Eliminar'}</button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

export default App
