"""Minimal persistent journey graph for the Emotion Editor PoC.

The module is inert unless DATABASE_URL (or JOURNEY_DATABASE_URL) is configured.
It stores no user text, account, contact, location, or device fingerprint data.
"""
import hashlib
import os
import secrets
import threading
import uuid
from datetime import datetime, timezone

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # Default /make-send remains available without journey dependencies.
    psycopg = None
    dict_row = None


DATABASE_URL = (os.environ.get("JOURNEY_DATABASE_URL") or os.environ.get("DATABASE_URL") or "").strip()
TOKEN_TTL_SECONDS = int(os.environ.get("REMIX_TOKEN_TTL", "7200"))
ALLOWED_CHANNELS = {"h5", "android_editor", "ios", "mini_program"}
_schema_lock = threading.Lock()
_schema_ready = False


SCHEMA = """
CREATE TABLE IF NOT EXISTS journeys (
    journey_id UUID PRIMARY KEY,
    root_video_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS videos (
    video_id UUID PRIMARY KEY,
    journey_id UUID NOT NULL REFERENCES journeys(journey_id),
    parent_video_id UUID REFERENCES videos(video_id),
    generation INTEGER NOT NULL CHECK (generation >= 0),
    character_id TEXT NOT NULL,
    emotion_id TEXT NOT NULL,
    source_channel TEXT NOT NULL,
    share_code TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE journeys DROP CONSTRAINT IF EXISTS journeys_root_video_id_fkey;
ALTER TABLE journeys ADD CONSTRAINT journeys_root_video_id_fkey
    FOREIGN KEY (root_video_id) REFERENCES videos(video_id) DEFERRABLE INITIALLY DEFERRED;
CREATE TABLE IF NOT EXISTS remix_tokens (
    token_hash CHAR(64) PRIMARY KEY,
    source_video_id UUID NOT NULL REFERENCES videos(video_id),
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    created_video_id UUID REFERENCES videos(video_id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS events (
    event_id UUID PRIMARY KEY,
    video_id UUID REFERENCES videos(video_id),
    journey_id UUID REFERENCES journeys(journey_id),
    event_type TEXT NOT NULL,
    source_channel TEXT NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS videos_journey_idx ON videos(journey_id);
CREATE INDEX IF NOT EXISTS videos_parent_idx ON videos(parent_video_id);
CREATE INDEX IF NOT EXISTS events_video_idx ON events(video_id);
CREATE INDEX IF NOT EXISTS events_journey_idx ON events(journey_id);
"""


class JourneyUnavailable(RuntimeError):
    pass


class InvalidRemixToken(ValueError):
    pass


def configured():
    return bool(DATABASE_URL and psycopg)


def _connect():
    if not DATABASE_URL:
        raise JourneyUnavailable("journey database is not configured")
    if psycopg is None:
        raise JourneyUnavailable("psycopg is not installed")
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def ensure_schema():
    global _schema_ready
    if _schema_ready:
        return
    with _schema_lock:
        if _schema_ready:
            return
        with _connect() as conn:
            with conn.cursor() as cur:
                cur.execute(SCHEMA)
        _schema_ready = True


def _id():
    return uuid.uuid4()


def _opaque(nbytes=24):
    return secrets.token_urlsafe(nbytes)


def _token_hash(token):
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _channel(value):
    return value if value in ALLOWED_CHANNELS else "h5"


def create_video(character_id, emotion_id, source_channel, remix_token=None):
    """Create an original node or a child node and consume remix_token atomically."""
    ensure_schema()
    video_id = _id()
    share_code = _opaque(18)
    channel = _channel(source_channel)
    with _connect() as conn:
        with conn.cursor() as cur:
            if remix_token:
                token_hash = _token_hash(remix_token)
                cur.execute(
                    """SELECT rt.source_video_id, rt.expires_at, rt.consumed_at,
                              v.journey_id, v.generation
                       FROM remix_tokens rt
                       JOIN videos v ON v.video_id = rt.source_video_id
                       WHERE rt.token_hash = %s
                       FOR UPDATE""",
                    (token_hash,),
                )
                source = cur.fetchone()
                now = datetime.now(timezone.utc)
                if not source or source["consumed_at"] is not None or source["expires_at"] <= now:
                    raise InvalidRemixToken("remix token is invalid, expired, or consumed")
                journey_id = source["journey_id"]
                parent_video_id = source["source_video_id"]
                generation = source["generation"] + 1
            else:
                journey_id = _id()
                parent_video_id = None
                generation = 0
                cur.execute("INSERT INTO journeys (journey_id) VALUES (%s)", (journey_id,))

            cur.execute(
                """INSERT INTO videos
                   (video_id, journey_id, parent_video_id, generation, character_id, emotion_id, source_channel, share_code)
                   VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                (video_id, journey_id, parent_video_id, generation, character_id, emotion_id, channel, share_code),
            )
            if generation == 0:
                cur.execute("UPDATE journeys SET root_video_id=%s WHERE journey_id=%s", (video_id, journey_id))
            else:
                cur.execute(
                    "UPDATE remix_tokens SET consumed_at=NOW(), created_video_id=%s WHERE token_hash=%s",
                    (video_id, _token_hash(remix_token)),
                )
            cur.execute(
                "INSERT INTO events (event_id, video_id, journey_id, event_type, source_channel) VALUES (%s,%s,%s,%s,%s)",
                (_id(), video_id, journey_id, "created", channel),
            )
            if generation > 0:
                cur.execute(
                    "INSERT INTO events (event_id, video_id, journey_id, event_type, source_channel) VALUES (%s,%s,%s,%s,%s)",
                    (_id(), video_id, journey_id, "remix_created", channel),
                )
    return {
        "video_id": str(video_id),
        "journey_id": str(journey_id),
        "parent_video_id": str(parent_video_id) if parent_video_id else None,
        "generation": generation,
        "share_code": share_code,
        "character_id": character_id,
        "emotion_id": emotion_id,
        "source_channel": channel,
    }


def create_remix_token(share_code):
    ensure_schema()
    token = _opaque(32)
    token_hash = _token_hash(token)
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT video_id FROM videos WHERE share_code=%s", (share_code,))
            source = cur.fetchone()
            if not source:
                return None
            cur.execute(
                """INSERT INTO remix_tokens (token_hash, source_video_id, expires_at)
                   VALUES (%s,%s,NOW() + (%s * INTERVAL '1 second'))""",
                (token_hash, source["video_id"], TOKEN_TTL_SECONDS),
            )
    return token


def resolve_remix_token(token, record_open=False, source_channel="h5"):
    ensure_schema()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT rt.source_video_id, rt.expires_at, rt.consumed_at, rt.created_video_id,
                          v.journey_id, v.generation, v.character_id, v.emotion_id
                   FROM remix_tokens rt
                   JOIN videos v ON v.video_id = rt.source_video_id
                   WHERE rt.token_hash=%s""",
                (_token_hash(token),),
            )
            row = cur.fetchone()
            now = datetime.now(timezone.utc)
            if not row or row["expires_at"] <= now:
                return None
            if record_open:
                cur.execute(
                    "INSERT INTO events (event_id, video_id, journey_id, event_type, source_channel) VALUES (%s,%s,%s,%s,%s)",
                    (_id(), row["source_video_id"], row["journey_id"], "remix_opened", _channel(source_channel)),
                )
    return {
        "source_video_id": str(row["source_video_id"]),
        "source_journey_id": str(row["journey_id"]),
        "character_id": row["character_id"],
        "emotion_id": row["emotion_id"],
        "source_generation": row["generation"],
        "next_generation": row["generation"] + 1,
        "consumed": row["consumed_at"] is not None,
        "created_video_id": str(row["created_video_id"]) if row["created_video_id"] else None,
        "expires_at": row["expires_at"].isoformat(),
    }


def record_event(video_id, event_type, source_channel):
    if event_type not in {"share_started", "remix_opened"}:
        raise ValueError("unsupported event")
    ensure_schema()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT journey_id FROM videos WHERE video_id=%s", (video_id,))
            row = cur.fetchone()
            if not row:
                return False
            cur.execute(
                "INSERT INTO events (event_id, video_id, journey_id, event_type, source_channel) VALUES (%s,%s,%s,%s,%s)",
                (_id(), video_id, row["journey_id"], event_type, _channel(source_channel)),
            )
    return True


def get_video(video_id):
    ensure_schema()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT video_id, journey_id, parent_video_id, generation, character_id,
                          emotion_id, source_channel, share_code, created_at
                   FROM videos WHERE video_id=%s""",
                (video_id,),
            )
            row = cur.fetchone()
    if not row:
        return None
    return {key: (str(value) if isinstance(value, uuid.UUID) else value.isoformat() if isinstance(value, datetime) else value) for key, value in row.items()}


def get_children(parent_video_id):
    ensure_schema()
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT video_id, journey_id, parent_video_id, generation, character_id,
                          emotion_id, source_channel, created_at
                   FROM videos WHERE parent_video_id=%s ORDER BY created_at""",
                (parent_video_id,),
            )
            rows = cur.fetchall()
    return [
        {key: (str(value) if isinstance(value, uuid.UUID) else value.isoformat() if isinstance(value, datetime) else value) for key, value in row.items()}
        for row in rows
    ]
