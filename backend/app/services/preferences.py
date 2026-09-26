"""The account's layout preferences (Epic 33, AD-49).

One ``jsonb`` column on ``users``, **sparse**: a key that is not stored means "the
default". So a card or a section added by a later epic appears for everyone without a data
migration, and the one function that fills the gaps is :func:`resolve`.

What is stored is what the client sent, validated here; what is returned is always
resolved, so the client never has to guess a default. Shape checks (types, lengths, the
two slot names) are the request schema's; everything that needs to know the catalogue
below — unknown ids, duplicates, completeness, the phone's caps — is here, with a code.
"""

import uuid

from sqlalchemy import bindparam, update
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Session

from app.core.errors import Invalid
from app.models.user import User

#: The eight sections, in their default order, with the slot each starts in. The first
#: five are the bottom tab bar on a phone (``.nav`` on a desktop); the last three are the
#: top bar (``.nav-extra``). Reproduces the app as it was before Epic 33.
SECTIONS: tuple[tuple[str, str], ...] = (
    ("dashboard", "bar"),
    ("entries", "bar"),
    ("habits", "bar"),
    ("stock", "bar"),
    ("gym", "bar"),
    ("plan", "top"),
    ("grow", "top"),
    ("recipes", "top"),
)

#: The budget itself. These can be moved, never switched off.
CORE_SECTIONS = frozenset({"dashboard", "entries", "plan", "grow"})

#: What can be switched off. Off hides the UI only; data and endpoints are untouched.
MODULES: tuple[str, ...] = ("habits", "books", "mood", "stock", "gym", "recipes", "notes")

#: Dashboard cards in today's render order, all shown by default.
CARDS: tuple[str, ...] = (
    "stats",
    "pending",
    "reading",
    "quote",
    "restock",
    "budgets",
    "savings",
    "trends",
    "categories",
)

LAYOUTS: tuple[str, ...] = ("phone", "desktop")

#: The phone top bar's content box is 335px at a 375px viewport, and French is the wide
#: language (Epic 27). Five tabs and three top links are what was measured to fit.
PHONE_CAPS = {"bar": 5, "top": 3}

_SECTION_IDS = tuple(section_id for section_id, _ in SECTIONS)
_DEFAULT_SLOT = dict(SECTIONS)


def _merge(stored: list[dict], catalogue: tuple[str, ...], make) -> list[dict]:
    """Stored order, minus ids that no longer exist, plus ids it lacks at their default place.

    A missing id is inserted after its nearest default predecessor that is already in the
    list, or first if it has none — so a card added after "reading" in a later epic lands
    after "reading" wherever the person moved it, instead of at the bottom.
    """
    known = set(catalogue)
    result: list[dict] = []
    seen: set[str] = set()
    for item in stored:
        item_id = item.get("id") if isinstance(item, dict) else None
        if item_id in known and item_id not in seen:
            result.append(item)
            seen.add(item_id)

    for index, item_id in enumerate(catalogue):
        if item_id in seen:
            continue
        position = 0
        for earlier in reversed(catalogue[:index]):
            if earlier in seen:
                position = next(i for i, it in enumerate(result) if it["id"] == earlier) + 1
                break
        result.insert(position, make(item_id))
        seen.add(item_id)
    return result


def _resolve_layout(stored: object) -> dict:
    layout = stored if isinstance(stored, dict) else {}
    tabs = _merge(
        [
            {"id": tab["id"], "slot": tab["slot"]}
            for tab in layout.get("tabs") or []
            if isinstance(tab, dict) and isinstance(tab.get("id"), str)
            and tab.get("slot") in ("bar", "top")
        ],
        _SECTION_IDS,
        lambda section_id: {"id": section_id, "slot": _DEFAULT_SLOT[section_id]},
    )
    cards = _merge(
        [
            {"id": card["id"], "on": card["on"]}
            for card in layout.get("cards") or []
            if isinstance(card, dict) and isinstance(card.get("id"), str)
            and isinstance(card.get("on"), bool)
        ],
        CARDS,
        lambda card_id: {"id": card_id, "on": True},
    )
    return {"tabs": tabs, "cards": cards}


def resolve(stored: object) -> dict:
    """The full preferences for a stored value, defaults filled in. Never raises: a stored
    value from an older catalogue is read, not refused."""
    prefs = stored if isinstance(stored, dict) else {}
    modules = prefs.get("modules") if isinstance(prefs.get("modules"), dict) else {}
    return {
        "modules": {
            module: modules[module] if isinstance(modules.get(module), bool) else True
            for module in MODULES
        },
        **{layout: _resolve_layout(prefs.get(layout)) for layout in LAYOUTS},
    }


def _no_duplicates(ids: list[str], what: str) -> None:
    seen: set[str] = set()
    for item_id in ids:
        if item_id in seen:
            raise Invalid(f"{what} {item_id!r} is listed twice", "pref_duplicate")
        seen.add(item_id)


def _check_modules(modules: dict[str, bool]) -> None:
    for module in modules:
        if module in CORE_SECTIONS:
            raise Invalid(f"{module!r} is part of the budget and cannot be turned off",
                          "pref_core_module")
        if module not in MODULES:
            raise Invalid(f"no module called {module!r}", "pref_unknown_id")


def _check_layout(name: str, layout: dict) -> None:
    tabs = layout.get("tabs")
    if tabs is not None:
        ids = [tab["id"] for tab in tabs]
        for section_id in ids:
            if section_id not in _DEFAULT_SLOT:
                raise Invalid(f"no section called {section_id!r}", "pref_unknown_id")
        _no_duplicates(ids, "section")
        # Complete, unlike the cards: a tab list that dropped a section would leave it
        # nowhere to be reached, and "hide" is what modules are for.
        if len(ids) != len(_SECTION_IDS):
            raise Invalid("the tab list must name every section once", "pref_incomplete")
        if name == "phone":
            for slot, cap in PHONE_CAPS.items():
                if sum(tab["slot"] == slot for tab in tabs) > cap:
                    raise Invalid(f"a phone fits at most {cap} in the {slot}", "pref_slot_full")

    cards = layout.get("cards")
    if cards is not None:
        ids = [card["id"] for card in cards]
        for card_id in ids:
            if card_id not in CARDS:
                raise Invalid(f"no dashboard card called {card_id!r}", "pref_unknown_id")
        _no_duplicates(ids, "card")


def validate(patch: dict) -> None:
    """Refuse, with a code, anything the catalogue does not allow. ``patch`` holds only
    the top-level keys the request sent, already shape-checked by the schema."""
    if "modules" in patch:
        _check_modules(patch["modules"])
    for layout in LAYOUTS:
        if layout in patch:
            _check_layout(layout, patch[layout])


def update_preferences(session: Session, user_id: uuid.UUID, patch: dict) -> None:
    """Replace each top-level key the patch carries; leave the others as stored.

    One ``UPDATE ... SET preferences = preferences || :patch``, not a read-modify-write:
    two tabs saving ``modules`` and ``phone`` at the same moment both land. Refusals are
    raised before anything is written.
    """
    validate(patch)
    if not patch:
        return
    session.execute(
        update(User)
        .where(User.id == user_id)
        .values(preferences=User.preferences.op("||")(bindparam("patch", patch, type_=JSONB)))
    )
    session.flush()
