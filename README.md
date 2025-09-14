# Agent switchboard — Redis + MCP ⚡️

**Build the future of agentic communication.** Agent SwitchBoard is a **Swiss‑army knife** for connecting agents, tools, and humans using **Redis Streams** and the **Model Context Protocol (MCP)**. It ships with:
- A production‑ready **MCP server** (Node) exposing Redis as a durable agent bus.
- A **REST bridge** (FastAPI) so **non‑MCP** agents can still publish/consume.
- **Docker Compose** for one‑command bring‑up (Redis + MCP + Bridge).
- Ready‑to‑paste **wiring examples** for **Gemini Code Assist**, **Claude Code**, and **GitHub Copilot**.

> **Why this repo?** Fragmented agent comms slow teams down. MCP standardizes *how* agents talk to tools; Redis gives you a fast, durable, observable message bus. SwitchBoard glues them together with pragmatic defaults.

---

## 1. Quickstart (Docker)
~~~bash
git clone <your-fork-url>
cd agent-switchboard
docker compose up --build -d
# check health
curl -s localhost:8002/healthz
~~~

Now point your MCP‑capable client at the **MCP server** (stdio) or the **HTTP bridge**:

- **Gemini Code Assist (local stdio)** → see `examples/gemini-settings.json`  
- **Claude Code (stdio/http)** → see `examples/claude-mcp.json`  
- **GitHub Copilot (stdio/http)** → see `examples/vscode-mcp.json`

---

## 2. Why **Redis + MCP**? (vs Kafka, RabbitMQ, DBs & Files)

**Redis Streams**:
- **Durable log** with IDs & replay; **consumer groups** for scale‑out.
- **Milliseconds latency**, minimal ops overhead.
- **Great for agent traffic**: tasks, results, heartbeats, audit trails.

**MCP**:
- An **open standard** for connecting LLMs/agents to tools and data.  
- Works across **Claude**, **Gemini**, **Copilot**, and **OpenAI Agents**.  
- **Integrate once** → reuse everywhere.

**Compared**:
- **Kafka/RabbitMQ:** powerful, but overkill for many teams; ops burden.  
- **Postgres LISTEN/NOTIFY:** lightweight pub/sub but not durable/replayable.  
- **Filesystem/HTTP-only:** easy, but brittle; no semantics for exactly‑once, acks, or back‑pressure.

References: MCP docs & guides from Anthropic, the protocol site, GitHub Copilot, and Gemini. (See repo footer for links.)

---

## 3. Architecture

```
MCP Clients (Claude | Gemini | Copilot | OpenAI Agents)
        │
        ├── STDIO ───────────────► Node MCP Server (this repo)
        │                           ├── Tools: xadd, xreadgroup, xack, xpending, publish, ping
        │                           └── Talks Redis Streams & Pub/Sub
        │
        └── HTTP/SSE (optional) ─► REST Bridge (FastAPI) ─► Redis
                                     └─ For non‑MCP agents (simple POST /publish)
```

---

## 4. Wiring (Local vs Cloud)

### 4.1 Local (on your dev box)
- **Gemini Code Assist: Chat** → `~/.gemini/settings.json` → `"mcpServers"` (see `examples/gemini-settings.json`).  
- **Claude Code** → `.mcp.json` / CLI with `type: "stdio" | "http"` (see `examples/claude-mcp.json`).  
- **GitHub Copilot Chat** → `.vscode/mcp.json` (see `examples/vscode-mcp.json`).

### 4.2 Cloud
- Host the **REST bridge** or a proper **HTTP/SSE MCP server** behind TLS.  
- For quick demos: `ngrok http 8002` → use `https://…/mcp` (when you add a proper MCP HTTP endpoint).  
- **OpenAI Agents / Responses**: register a **remote MCP** endpoint and call tools (see “Future Work: HTTP MCP Gateway”).

---

## 5. For non‑MCP agents: the **SwitchBoard** 🩹
- **REST publish**: `POST /publish` with `{ "fields": {...} }` → writes to `agent:events`.  
- **CLI feeders**: wrap existing shell scripts to post tasks & acks.  
- **Webhook sinks**: add small subscribers to forward Streams → webhooks/Slack.  
- **Goal:** be the catch‑all so every tool can participate, even before it speaks MCP.

---

## 6. Usage (MCP tools)

- **Health:** `redis_ping`  
- **Produce (durable):** `redis_xadd(stream="agent:events", fields={"from":"planner","type":"task","payload":"run lint"})`  
- **Group consume:** `redis_xgroup_create("agent:events","triage","$")` then  
  `redis_xreadgroup(stream="agent:events", group="triage", consumer="worker-1", id=">", block_ms=15000)`  
- **Ack:** `redis_xack(stream="agent:events", group="triage", ids=["<id>"])`  
- **Pending:** `redis_xpending(stream="agent:events", group="triage")`

---

## 7. Roadmap (help wanted)
- [ ] **HTTP/SSE MCP Gateway** container (serve `/mcp` per spec; proxy to Redis tools).  
- [ ] **Req/Rep helper** (`reply_to`, correlation IDs, timeouts).  
- [ ] **Consumer group ops**: `xclaim`, `xdel`, `xtrim`, `maxlen` policies.  
- [ ] **Observability**: dashboards for PEL size, throughput, latency.  
- [ ] **Adapters**: Slack, GitHub Actions, Jenkins, k6, Datadog, etc.  
- [ ] **Security**: TLS + auth for the bridge; secrets via env/Keychain.

---

## 8. Contributing
PRs welcome! Please open an issue with your use‑case (agent flavor, toolchain, cloud). We’ll grow this into the **community “SwitchBoard”** for agent comms.

---

## 9. Links & Credits (learn more)
- **MCP protocol:** https://modelcontextprotocol.io/  
- **Anthropic Claude Code + MCP:** https://docs.anthropic.com/en/docs/claude-code/mcp  
- **Gemini Code Assist + MCP:** https://developers.google.com/gemini-code-assist/docs/use-agentic-chat-pair-programmer  
- **GitHub Copilot + MCP:** https://docs.github.com/copilot/customizing-copilot/using-model-context-protocol/extending-copilot-chat-with-mcp

---

**License:** MIT
