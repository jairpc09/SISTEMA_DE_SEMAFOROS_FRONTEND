import { useCallback, useEffect, useRef, useState } from "react";

type Color = "red" | "yellow" | "green";
type SemaphoreId = "1" | "2";
type Mode = "manual" | "automatic";
type StateResponse = {
  mode: Mode;
  phase: string;
  detected: Record<SemaphoreId, boolean>;
  semaphores: Record<SemaphoreId, Color>;
  timing: { all_red_seconds: number };
  remaining_seconds: number | null;
};
type Role = "user" | "admin";
type HistoryEvent = {
  id: number;
  timestamp: string;
  category: string;
  message: string;
};

const API_BASE_URL = (
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000"
).replace(/\/$/, "");

const colorNames: Record<Color, string> = {
  red: "Rojo",
  yellow: "Amarillo",
  green: "Verde",
};

async function getState(): Promise<StateResponse> {
  const response = await fetch(`${API_BASE_URL}/api/state`);
  if (!response.ok) {
    throw new Error(`No se pudo leer el estado (HTTP ${response.status})`);
  }
  return response.json() as Promise<StateResponse>;
}

async function getHistory(): Promise<HistoryEvent[]> {
  const response = await fetch(`${API_BASE_URL}/api/history`);
  if (!response.ok) {
    throw new Error(`No se pudo leer el historial (HTTP ${response.status})`);
  }
  return response.json() as Promise<HistoryEvent[]>;
}

function App() {
  const [role, setRole] = useState<Role | null>(() =>
    sessionStorage.getItem("semaphore-role") === "admin" ||
    sessionStorage.getItem("semaphore-role") === "user"
      ? (sessionStorage.getItem("semaphore-role") as Role)
      : null,
  );
  const [selectedRole, setSelectedRole] = useState<Role>("user");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [semaphores, setSemaphores] = useState<StateResponse["semaphores"]>();
  const [mode, setMode] = useState<Mode>();
  const [phase, setPhase] = useState("");
  const [detected, setDetected] = useState<StateResponse["detected"]>();
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [redSeconds, setRedSeconds] = useState("1");
  const redSecondsDirty = useRef(false);
  const [timingBusy, setTimingBusy] = useState(false);
  const [history, setHistory] = useState<HistoryEvent[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<SemaphoreId | null>(null);
  const [modeBusy, setModeBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const state = await getState();
      setSemaphores(state.semaphores);
      setMode(state.mode);
      setPhase(state.phase);
      setDetected(state.detected);
      setRemainingSeconds(state.remaining_seconds ?? null);
      if (!redSecondsDirty.current) {
        setRedSeconds(String(state.timing?.all_red_seconds ?? 1));
      }
      setIsConnected(true);
      setLastUpdatedAt(new Date());
      setError("");
    } catch (reason) {
      setIsConnected(false);
      setError(
        reason instanceof Error ? reason.message : "Error al conectar con la API",
      );
    }
  }, []);

  const refreshHistory = useCallback(async () => {
    try {
      setHistory(await getHistory());
      setHistoryError("");
    } catch (reason) {
      setHistoryError(
        reason instanceof Error ? reason.message : "No se pudo actualizar el historial",
      );
    }
  }, []);

  useEffect(() => {
    if (!role) return;
    void refresh();
    void refreshHistory();
    const stateTimer = window.setInterval(() => void refresh(), 500);
    const historyTimer = window.setInterval(() => void refreshHistory(), 3000);
    return () => {
      window.clearInterval(stateTimer);
      window.clearInterval(historyTimer);
    };
  }, [refresh, refreshHistory, role]);

  async function login() {
    setLoginBusy(true);
    setLoginError("");
    try {
      if (selectedRole === "admin") {
        const response = await fetch(`${API_BASE_URL}/api/admin/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });
        if (!response.ok) {
          throw new Error(
            response.status === 401
              ? "Contraseña de administrador incorrecta."
              : `No se pudo iniciar sesión (HTTP ${response.status})`,
          );
        }
        const result = (await response.json()) as { token: string };
        sessionStorage.setItem("semaphore-admin-token", result.token);
      } else {
        sessionStorage.removeItem("semaphore-admin-token");
      }

      sessionStorage.setItem("semaphore-role", selectedRole);
      setPassword("");
      setRole(selectedRole);
    } catch (reason) {
      setLoginError(
        reason instanceof Error ? reason.message : "Error al iniciar sesión",
      );
    } finally {
      setLoginBusy(false);
    }
  }

  function logout() {
    sessionStorage.removeItem("semaphore-role");
    sessionStorage.removeItem("semaphore-admin-token");
    setRole(null);
  }

  function adminAuthorizationHeader(): Record<string, string> {
    const token = sessionStorage.getItem("semaphore-admin-token");
    return token ? { Authorization: `Bearer ${token}` } : {};
  }

  async function changeRedTime() {
    const seconds = Number(redSeconds);
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 60) {
      setError("El tiempo en rojo debe ser un número entre 1 y 60 segundos.");
      return;
    }

    setTimingBusy(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/timing`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...adminAuthorizationHeader(),
        },
        body: JSON.stringify({ all_red_seconds: seconds }),
      });
      if (!response.ok) {
        throw new Error(
          response.status === 409
            ? "El tiempo solo se puede ajustar en modo manual."
            : `No se pudo guardar el tiempo (HTTP ${response.status})`,
        );
      }
      redSecondsDirty.current = false;
      await refresh();
      await refreshHistory();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Error al guardar el tiempo",
      );
    } finally {
      setTimingBusy(false);
    }
  }

  async function changeMode(nextMode: Mode) {
    setModeBusy(true);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/mode`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...adminAuthorizationHeader(),
        },
        body: JSON.stringify({ mode: nextMode }),
      });
      if (!response.ok) {
        throw new Error(`No se pudo cambiar el modo (HTTP ${response.status})`);
      }
      await refresh();
      await refreshHistory();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Error al cambiar el modo",
      );
    } finally {
      setModeBusy(false);
    }
  }

  async function changeColor(id: SemaphoreId, color: Color) {
    setBusy(id);
    setError("");
    try {
      const response = await fetch(`${API_BASE_URL}/api/semaphores/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...adminAuthorizationHeader(),
        },
        body: JSON.stringify({ color }),
      });
      if (!response.ok) {
        if (response.status === 409) {
          throw new Error(
            "Pon el otro semáforo en rojo antes de cambiar este a amarillo o verde.",
          );
        }
        throw new Error(`No se pudo cambiar el color (HTTP ${response.status})`);
      }
      await refresh();
      await refreshHistory();
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Error al enviar el cambio",
      );
    } finally {
      setBusy(null);
    }
  }

  if (!role) {
    return (
      <main className="login-page">
        <section className="login-card" aria-label="Inicio de sesión">
          <p className="eyebrow">PROTOTIPO EDUCATIVO · ESP32</p>
          <h1>Control de semáforos</h1>
          <p className="subtitle">Selecciona el tipo de acceso.</p>

          <div className="role-options" role="radiogroup" aria-label="Rol">
            <button
              className={`role-button ${selectedRole === "user" ? "selected" : ""}`}
              type="button"
              role="radio"
              aria-checked={selectedRole === "user"}
              onClick={() => {
                setSelectedRole("user");
                setPassword("");
                setLoginError("");
              }}
            >
              Usuario
              <span>Solo consulta el estado</span>
            </button>
            <button
              className={`role-button ${selectedRole === "admin" ? "selected" : ""}`}
              type="button"
              role="radio"
              aria-checked={selectedRole === "admin"}
              onClick={() => {
                setSelectedRole("admin");
                setLoginError("");
              }}
            >
              Administrador
              <span>Controla los semáforos</span>
            </button>
          </div>

          {selectedRole === "admin" && (
            <label className="password-field">
              Contraseña
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void login();
                }}
                placeholder="Ingresa la contraseña"
                autoComplete="current-password"
              />
            </label>
          )}

          {loginError && <p className="error" role="alert">{loginError}</p>}

          <button
            className="login-button"
            type="button"
            disabled={loginBusy}
            onClick={() => void login()}
          >
            {loginBusy ? "Ingresando…" : "Entrar"}
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="app-header">
        <div>
          <p className="eyebrow">PROTOTIPO EDUCATIVO · ESP32</p>
          <h1>Control de semáforos</h1>
          <p className="subtitle">
            {role === "admin"
              ? "En automático, los sensores detectan vehículos; en manual, puedes elegir los colores."
              : "Vista de consulta: puedes revisar el estado de los semáforos y los sensores."}
          </p>
        </div>
        <div
          className={`connection-status ${isConnected ? "connected" : "disconnected"}`}
          aria-live="polite"
        >
          <span className="connection-dot" aria-hidden="true" />
          <span>
            <strong>{isConnected ? "Backend conectado" : "Sin conexión"}</strong>
            <small>
              {lastUpdatedAt
                ? `Última actualización: ${lastUpdatedAt.toLocaleTimeString()}`
                : "Esperando respuesta del backend…"}
            </small>
          </span>
        </div>
        <div className="account-controls">
          <span className="role-badge">{role === "admin" ? "Administrador" : "Usuario"}</span>
          <button className="logout-button" type="button" onClick={logout}>
            Cerrar sesión
          </button>
        </div>
      </header>

      {error && <p className="error" role="alert">{error}</p>}

      <section className="mode-panel" aria-label="Modo de control">
        <div>
          <h2>Modo de control</h2>
          <p>
            {mode === "automatic"
              ? "Automático: el ESP32 controla los cambios según los sensores."
              : mode === "manual"
                ? "Manual: selecciona los colores. Para cambiar uno a amarillo o verde, el otro debe estar en rojo."
                : "Conectando con el backend…"}
          </p>
          {mode === "automatic" && (
            <p className="countdown" aria-live="polite">
              {remainingSeconds === null
                ? phase.startsWith("green_")
                  ? `Verde extendido en el semáforo ${phase.slice(-1)} mientras detecta un vehículo`
                  : "Esperando el siguiente cambio…"
                : `Próximo cambio en ${remainingSeconds} s`}
            </p>
          )}
        </div>
        {role === "admin" && (
          <div className="controls">
            <button
              className={`button mode-button ${mode === "manual" ? "selected" : ""}`}
              disabled={!mode || modeBusy || mode === "manual"}
              onClick={() => void changeMode("manual")}
            >
              Manual
            </button>
            <button
              className={`button mode-button ${mode === "automatic" ? "selected" : ""}`}
              disabled={!mode || modeBusy || mode === "automatic"}
              onClick={() => void changeMode("automatic")}
            >
              Automático
            </button>
          </div>
        )}
      </section>

      {role === "admin" && mode === "manual" && (
        <section className="timing-panel" aria-label="Ajuste de tiempos">
          <div>
            <h2>Tiempo de pausa en rojo</h2>
            <p>Duración, en modo automático, con ambos semáforos en rojo (1–60 s).</p>
          </div>
          <label className="timing-control">
            Segundos
            <input
              type="number"
              min="1"
              max="60"
              step="1"
              value={redSeconds}
              onChange={(event) => {
                redSecondsDirty.current = true;
                setRedSeconds(event.target.value);
              }}
            />
          </label>
          <button
            className="button save-timing"
            disabled={timingBusy || !redSeconds}
            onClick={() => void changeRedTime()}
          >
            {timingBusy ? "Guardando…" : "Guardar tiempo"}
          </button>
        </section>
      )}

      <section className="grid" aria-label="Semáforos">
        {(["1", "2"] as const).map((id) => {
          const color = semaphores?.[id];
          const otherId: SemaphoreId = id === "1" ? "2" : "1";
          const otherColor = semaphores?.[otherId];
          return (
            <article className={`card ${color ? `is-${color}` : ""}`} key={id}>
              <div className="card-heading">
                <h2>Semáforo {id}</h2>
                <span className={`badge ${color ?? "offline"}`}>
                  {color ? colorNames[color] : "Conectando…"}
                </span>
              </div>
              <div className="lights" aria-label={`Estado: ${color ? colorNames[color] : "desconocido"}`}>
                {(["red", "yellow", "green"] as const).map((lamp) => (
                  <span
                    className={`light ${lamp} ${color === lamp ? "active" : ""}`}
                    key={lamp}
                    aria-hidden="true"
                  />
                ))}
              </div>
              {mode === "automatic" && (
                <p className={`vehicle-status ${detected?.[id] ? "detected" : "clear"}`}>
                  Sensor: {detected?.[id] ? "vehículo detectado" : "sin detección"}
                </p>
              )}
              {role === "admin" && (
                <div className="controls" aria-label={`Cambiar semáforo ${id}`}>
                  {(["red", "yellow", "green"] as const).map((lamp) => {
                    const blockedByOtherSemaphore =
                      lamp !== "red" &&
                      otherColor !== undefined &&
                      otherColor !== "red";
                    return (
                      <button
                        className={`button ${lamp}`}
                        disabled={
                          !semaphores ||
                          mode !== "manual" ||
                          busy === id ||
                          blockedByOtherSemaphore
                        }
                        key={lamp}
                        onClick={() => void changeColor(id, lamp)}
                        aria-pressed={color === lamp}
                        title={
                          blockedByOtherSemaphore
                            ? `El semáforo ${otherId} debe estar en rojo`
                            : undefined
                        }
                      >
                        {colorNames[lamp]}
                      </button>
                    );
                  })}
                </div>
              )}
            </article>
          );
        })}
      </section>
      <section className="history-panel" aria-label="Historial de eventos">
        <div className="history-heading">
          <div>
            <h2>Historial de eventos</h2>
            <p>Últimos cambios de modo, luces y sensores.</p>
          </div>
          <span className="history-count">{history.length} eventos</span>
        </div>
        {historyError && <p className="history-error" role="status">{historyError}</p>}
        {history.length === 0 ? (
          <p className="empty-history">Todavía no hay eventos registrados.</p>
        ) : (
          <ol className="history-list">
            {history.slice(0, 20).map((event) => (
              <li className="history-item" key={event.id}>
                <span className={`history-category ${event.category}`}>
                  {event.category}
                </span>
                <span className="history-message">{event.message}</span>
                <time dateTime={event.timestamp}>
                  {new Date(event.timestamp).toLocaleTimeString()}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
      <footer>
        Solo para una maqueta educativa con LEDs; no conectar a señales de tránsito
        reales ni usar para dirigir vehículos.
      </footer>
    </main>
  );
}

export default App;
