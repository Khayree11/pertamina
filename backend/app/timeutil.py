from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from .config import get_settings

TZ = ZoneInfo(get_settings().timezone)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def to_local(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(TZ)


def today_local(now: datetime | None = None) -> date:
    return to_local(now or utcnow()).date()


def end_of_local_day(d: date) -> datetime:
    """23:59:59 waktu lokal pada tanggal d, dikembalikan dalam UTC."""
    return (datetime.combine(d + timedelta(days=1), time(0, 0), tzinfo=TZ) - timedelta(seconds=1)).astimezone(
        timezone.utc
    )


def start_of_local_day(d: date) -> datetime:
    return datetime.combine(d, time(0, 0), tzinfo=TZ).astimezone(timezone.utc)


def local_at(d: date, hour: int, minute: int = 0) -> datetime:
    """Waktu lokal pada tanggal d (menit boleh > 59, dihitung sebagai offset)."""
    return (datetime.combine(d, time(hour, 0), tzinfo=TZ) + timedelta(minutes=minute)).astimezone(timezone.utc)


def fmt_local(dt: datetime | None, with_date: bool = True) -> str:
    if dt is None:
        return "-"
    loc = to_local(dt)
    months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
    if with_date:
        return f"{loc.day} {months[loc.month - 1]} {loc.year} {loc:%H:%M} WIB"
    return f"{loc:%H:%M} WIB"


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def iso_date(d: date | None) -> str | None:
    return d.isoformat() if d else None
