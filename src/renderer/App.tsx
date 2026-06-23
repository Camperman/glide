import { Sidebar } from './Sidebar'

export function App(): JSX.Element {
  return (
    <div className="app">
      <Sidebar />
      <main className="content" data-testid="content">
        <div className="placeholder">
          <h1>Glide</h1>
          <p>
            Phase 0 scaffold. Account containers render here in Phase 1.
          </p>
        </div>
      </main>
    </div>
  )
}
