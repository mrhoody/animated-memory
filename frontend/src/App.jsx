import { useState, useCallback } from "react";
import "./App.css";

const DEFAULT_API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

function useApiCall() {
  const [results, setResults] = useState({});

  const call = useCallback(async (key, method, path, body) => {
    setResults((prev) => ({
      ...prev,
      [key]: { status: "loading", data: null, error: null, durationMs: null },
    }));

    const baseUrl = document.getElementById("apiBase")?.value || DEFAULT_API_BASE;
    const url = `${baseUrl.replace(/\/$/, "")}${path}`;
    const start = performance.now();

    try {
      const options = {
        method,
        headers: { "Content-Type": "application/json" },
      };
      if (body !== undefined) options.body = JSON.stringify(body);

      const res = await fetch(url, options);
      const durationMs = Math.round(performance.now() - start);
      let data;
      try {
        data = await res.json();
      } catch {
        data = await res.text();
      }
      setResults((prev) => ({
        ...prev,
        [key]: { status: res.ok ? "ok" : "error", data, durationMs, httpStatus: res.status },
      }));
    } catch (err) {
      const durationMs = Math.round(performance.now() - start);
      setResults((prev) => ({
        ...prev,
        [key]: { status: "error", error: err.message, data: null, durationMs },
      }));
    }
  }, []);

  return { results, call };
}

function ResultBox({ label, result }) {
  if (!result) return null;
  const isLoading = result.status === "loading";
  const isOk = result.status === "ok";

  return (
    <div className={`result-box ${isLoading ? "loading" : isOk ? "ok" : "error"}`}>
      <div className="result-header">
        <span className="result-label">{label}</span>
        {result.durationMs !== null && (
          <span className="result-timing">{result.durationMs} ms</span>
        )}
        {result.httpStatus && (
          <span className={`result-status ${isOk ? "status-ok" : "status-err"}`}>
            HTTP {result.httpStatus}
          </span>
        )}
      </div>
      {isLoading ? (
        <p className="result-body loading-text">Loading…</p>
      ) : result.error ? (
        <pre className="result-body error-text">{result.error}</pre>
      ) : (
        <pre className="result-body">{JSON.stringify(result.data, null, 2)}</pre>
      )}
    </div>
  );
}

function EndpointCard({ title, description, onRun, resultKey, results, children }) {
  return (
    <div className="card">
      <div className="card-header">
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {children}
      <button onClick={onRun}>Run</button>
      <ResultBox label={title} result={results[resultKey]} />
    </div>
  );
}

export default function App() {
  const { results, call } = useApiCall();
  const [echoInput, setEchoInput] = useState('{"hello":"world"}');
  const [fetchUrl, setFetchUrl] = useState("https://cloudflare.com");
  const [dnsHost, setDnsHost] = useState("cloudflare.com");

  return (
    <div className="app">
      <header>
        <h1>🔌 Connectivity Tester</h1>
        <p className="subtitle">
          Diagnose your Cloudflare Tunnel → Hetzner VPS connection
        </p>
      </header>

      <section className="config-section">
        <label htmlFor="apiBase">API Base URL</label>
        <input
          id="apiBase"
          type="text"
          defaultValue={DEFAULT_API_BASE}
          placeholder="https://api.yourdomain.com"
        />
        <p className="hint">
          Set <code>VITE_API_BASE_URL</code> in <code>.env</code> to persist this.
        </p>
      </section>

      <section className="grid">
        <EndpointCard
          title="GET /health"
          description="Returns 200 OK with a timestamp. Fastest smoke test."
          resultKey="health"
          results={results}
          onRun={() => call("health", "GET", "/health")}
        />

        <EndpointCard
          title="GET /whoami"
          description="Dumps request info: method, headers, Cloudflare headers, client IP."
          resultKey="whoami"
          results={results}
          onRun={() => call("whoami", "GET", "/whoami")}
        />

        <EndpointCard
          title="GET /cors-test"
          description="Confirms CORS is working and echoes the request origin."
          resultKey="cors"
          results={results}
          onRun={() => call("cors", "GET", "/cors-test")}
        />

        <EndpointCard
          title="POST /echo"
          description="Echoes the JSON body back. Tests POST + JSON parsing."
          resultKey="echo"
          results={results}
          onRun={() => {
            let body;
            try {
              body = JSON.parse(echoInput);
            } catch {
              body = { raw: echoInput };
            }
            call("echo", "POST", "/echo", body);
          }}
        >
          <textarea
            className="echo-input"
            value={echoInput}
            onChange={(e) => setEchoInput(e.target.value)}
            rows={3}
            placeholder='{"key":"value"}'
          />
        </EndpointCard>

        <EndpointCard
          title="GET /dns"
          description="Backend resolves a hostname via DNS — tests outbound DNS from the VPS."
          resultKey="dns"
          results={results}
          onRun={() => call("dns", "GET", `/dns?hostname=${encodeURIComponent(dnsHost)}`)}
        >
          <input
            type="text"
            value={dnsHost}
            onChange={(e) => setDnsHost(e.target.value)}
            placeholder="cloudflare.com"
          />
        </EndpointCard>

        <EndpointCard
          title="GET /fetch"
          description="Backend fetches a URL — tests outbound HTTP from the VPS."
          resultKey="fetch"
          results={results}
          onRun={() => call("fetch", "GET", `/fetch?url=${encodeURIComponent(fetchUrl)}`)}
        >
          <input
            type="text"
            value={fetchUrl}
            onChange={(e) => setFetchUrl(e.target.value)}
            placeholder="https://cloudflare.com"
          />
        </EndpointCard>
      </section>

      <footer>
        <p>
          Backend on Hetzner VPS · Frontend on Cloudflare Pages · Connected via Cloudflare Tunnel
        </p>
      </footer>
    </div>
  );
}
