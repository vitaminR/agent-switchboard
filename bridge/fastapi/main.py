
from fastapi import FastAPI
from pydantic import BaseModel
import asyncio, os, json
import aioredis

REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379")
EVENTS = os.getenv("AGENT_EVENTS_STREAM", "agent:events")

app = FastAPI(title="Agent Patchbay REST Bridge", version="0.1.0")

class Publish(BaseModel):
    stream: str | None = None
    fields: dict

@app.on_event("startup")
async def startup():
    app.state.redis = await aioredis.from_url(REDIS_URL, decode_responses=True)

@app.post("/publish")
async def publish(p: Publish):
    stream = p.stream or EVENTS
    flat = []
    for k,v in p.fields.items():
        flat += [k, str(v)]
    id = await app.state.redis.xadd(stream, dict(p.fields))
    return {"ok": True, "stream": stream, "id": id}

@app.get("/healthz")
async def health():
    pong = await app.state.redis.ping()
    return {"redis": pong}
