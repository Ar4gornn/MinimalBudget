"""The account's layout preferences (Epic 33, story 33.1, AD-49).

Stored sparse, returned resolved: a new account reads back exactly the app as it was, a
PATCH replaces only the top-level keys it carries, and everything the catalogue does not
allow is refused with a code the client can word.
"""

import pytest
from sqlalchemy import text

from app.services.preferences import resolve

DEFAULT_TABS = [
    {"id": "dashboard", "slot": "bar"},
    {"id": "entries", "slot": "bar"},
    {"id": "habits", "slot": "bar"},
    {"id": "stock", "slot": "bar"},
    {"id": "gym", "slot": "bar"},
    {"id": "plan", "slot": "top"},
    {"id": "grow", "slot": "top"},
    {"id": "recipes", "slot": "top"},
]
DEFAULT_CARDS = [
    {"id": card, "on": True}
    for card in (
        "stats", "pending", "reading", "quote", "restock",
        "budgets", "savings", "trends", "categories",
    )
]
DEFAULT = {
    "modules": {
        module: True
        for module in ("habits", "books", "mood", "stock", "gym", "recipes", "notes")
    },
    "phone": {"tabs": DEFAULT_TABS, "cards": DEFAULT_CARDS},
    "desktop": {"tabs": DEFAULT_TABS, "cards": DEFAULT_CARDS},
}


def _prefs(client, user):
    return client.get("/api/auth/me", headers=user["headers"]).json()["preferences"]


def _patch(client, user, body):
    return client.patch("/api/auth/me/preferences", json=body, headers=user["headers"])


def _moved(tabs, section_id, slot):
    return [{**tab, "slot": slot} if tab["id"] == section_id else tab for tab in tabs]


# --- defaults ---------------------------------------------------------------------------


def test_a_new_account_reads_back_the_app_as_it_was(client):
    """The acceptance criterion the migration hangs on: `{}` must resolve to today's
    layout, for a brand-new account and in the registration response itself."""
    created = client.post(
        "/api/auth/register",
        json={"email": "new@example.com", "password": "correct-horse-battery"},
    )
    assert created.status_code == 201
    assert created.json()["preferences"] == DEFAULT


def test_me_carries_them_resolved(client, user_a):
    assert _prefs(client, user_a) == DEFAULT


# --- replacing one subtree at a time ----------------------------------------------------


def test_modules_alone_leave_both_layouts_untouched(client, user_a):
    phone_tabs = _moved(_moved(DEFAULT_TABS, "gym", "top"), "recipes", "bar")
    assert _patch(client, user_a, {"phone": {"tabs": phone_tabs}}).status_code == 200

    answer = _patch(client, user_a, {"modules": {"gym": False}})
    assert answer.status_code == 200
    prefs = answer.json()["preferences"]
    assert prefs["modules"]["gym"] is False
    assert prefs["modules"]["books"] is True, "a module not sent stays on"
    assert prefs["phone"]["tabs"] == phone_tabs
    assert prefs["desktop"] == DEFAULT["desktop"]
    assert _prefs(client, user_a) == prefs


def test_one_layout_leaves_the_other_and_the_modules(client, user_a):
    _patch(client, user_a, {"modules": {"mood": False}})
    cards = [{"id": "budgets", "on": True}, {"id": "stats", "on": False}]
    prefs = _patch(client, user_a, {"desktop": {"cards": cards}}).json()["preferences"]

    assert prefs["modules"]["mood"] is False
    assert prefs["phone"] == DEFAULT["phone"]
    assert prefs["desktop"]["tabs"] == DEFAULT_TABS
    # The two sent keep their relative order and values; each of the other seven lands
    # after its default predecessor — so savings follows budgets, pending follows stats.
    assert {"id": "stats", "on": False} in prefs["desktop"]["cards"]
    assert [c["id"] for c in prefs["desktop"]["cards"]] == [
        "budgets", "savings", "trends", "categories",
        "stats", "pending", "reading", "quote", "restock",
    ]


def test_a_layout_replaces_its_whole_subtree(client, user_a):
    """`phone: {cards}` replaces `phone`, so tabs stored earlier fall back to the default.
    The client always sends a layout whole; this pins what happens when it does not."""
    _patch(client, user_a, {"phone": {"tabs": _moved(_moved(DEFAULT_TABS, "gym", "top"),
                                                     "plan", "bar")}})
    prefs = _patch(client, user_a, {"phone": {"cards": DEFAULT_CARDS}}).json()["preferences"]
    assert prefs["phone"]["tabs"] == DEFAULT_TABS


def test_desktop_has_no_caps(client, user_a):
    everything_in_the_bar = [{**tab, "slot": "bar"} for tab in DEFAULT_TABS]
    answer = _patch(client, user_a, {"desktop": {"tabs": everything_in_the_bar}})
    assert answer.status_code == 200
    assert answer.json()["preferences"]["desktop"]["tabs"] == everything_in_the_bar


def test_an_empty_patch_changes_nothing(client, user_a):
    _patch(client, user_a, {"modules": {"notes": False}})
    answer = _patch(client, user_a, {})
    assert answer.status_code == 200
    assert answer.json()["preferences"]["modules"]["notes"] is False


# --- refusals ---------------------------------------------------------------------------


def _without(tabs, section_id):
    return [tab for tab in tabs if tab["id"] != section_id]


@pytest.mark.parametrize(
    ("body", "code"),
    [
        ({"modules": {"chess": False}}, "pref_unknown_id"),
        ({"modules": {"dashboard": False}}, "pref_core_module"),
        ({"modules": {"entries": True}}, "pref_core_module"),
        ({"phone": {"tabs": [*DEFAULT_TABS[:-1], {"id": "chess", "slot": "top"}]}},
         "pref_unknown_id"),
        ({"phone": {"tabs": [*DEFAULT_TABS, DEFAULT_TABS[0]]}}, "pref_duplicate"),
        ({"desktop": {"tabs": _without(DEFAULT_TABS, "gym")}}, "pref_incomplete"),
        ({"desktop": {"tabs": []}}, "pref_incomplete"),
        # Six in the bar on a phone.
        ({"phone": {"tabs": _moved(DEFAULT_TABS, "plan", "bar")}}, "pref_slot_full"),
        # Four on top on a phone.
        ({"phone": {"tabs": _moved(DEFAULT_TABS, "gym", "top")}}, "pref_slot_full"),
        ({"phone": {"cards": [{"id": "weather", "on": True}]}}, "pref_unknown_id"),
        ({"desktop": {"cards": [{"id": "stats", "on": True}, {"id": "stats", "on": False}]}},
         "pref_duplicate"),
    ],
)
def test_the_catalogue_refuses_with_a_code(client, user_a, body, code):
    answer = _patch(client, user_a, body)
    assert answer.status_code == 422, answer.text
    assert answer.json()["code"] == code


@pytest.mark.parametrize(
    "body",
    [
        {"tablet": {"tabs": DEFAULT_TABS}},
        {"phone": {"tabs": _moved(DEFAULT_TABS, "gym", "side")}},
        {"phone": {"tabs": DEFAULT_TABS, "theme": "dark"}},
        {"phone": {"cards": [{"id": "stats", "on": "yes"}]}},
        {"phone": {"cards": [{"id": "stats"}]}},
        {"phone": {"cards": [{"id": "x" * 33, "on": True}]}},
        {"phone": {"cards": [{"id": "stats", "on": True}] * 33}},
        {"modules": {"gym": "off"}},
        {"modules": {f"m{i}": True for i in range(33)}},
    ],
)
def test_the_shape_is_the_schemas(client, user_a, body):
    answer = _patch(client, user_a, body)
    assert answer.status_code == 422
    assert answer.json()["code"] == "validation"


def test_a_refusal_writes_nothing(client, user_a):
    """Validation runs before the UPDATE: a batch with one bad key must not land its good
    one."""
    answer = _patch(
        client, user_a, {"modules": {"gym": False}, "phone": {"tabs": DEFAULT_TABS[:3]}}
    )
    assert answer.status_code == 422
    assert _prefs(client, user_a) == DEFAULT


def test_signed_out_is_refused(client):
    assert client.patch("/api/auth/me/preferences", json={}).status_code == 401


# --- the merge rule (resolve), on its own -----------------------------------------------


def test_an_id_that_no_longer_exists_is_dropped():
    stored = {
        "modules": {"chess": False, "gym": False},
        "phone": {"cards": [{"id": "weather", "on": True}, {"id": "budgets", "on": False}]},
    }
    prefs = resolve(stored)
    assert "chess" not in prefs["modules"]
    assert prefs["modules"]["gym"] is False
    assert [c["id"] for c in prefs["phone"]["cards"]] == [
        "stats", "pending", "reading", "quote", "restock",
        "budgets", "savings", "trends", "categories",
    ]
    assert {"id": "budgets", "on": False} in prefs["phone"]["cards"]


def test_a_missing_id_lands_after_its_default_predecessor():
    """What a card added by a later epic does to a layout stored before it existed: it
    appears after its default neighbour, wherever the person moved that neighbour."""
    stored_order = ["categories", "reading", "stats", "pending", "restock",
                    "budgets", "savings", "trends"]  # no "quote"
    prefs = resolve({"desktop": {"cards": [{"id": c, "on": True} for c in stored_order]}})
    assert [c["id"] for c in prefs["desktop"]["cards"]] == [
        "categories", "reading", "quote", "stats", "pending", "restock",
        "budgets", "savings", "trends",
    ]


def test_a_missing_first_id_goes_first():
    stored = [{"id": c["id"], "on": False} for c in DEFAULT_CARDS[1:]]
    prefs = resolve({"phone": {"cards": stored}})
    assert prefs["phone"]["cards"][0] == {"id": "stats", "on": True}


def test_a_missing_section_takes_its_default_slot():
    stored = [tab for tab in DEFAULT_TABS if tab["id"] != "recipes"]
    prefs = resolve({"phone": {"tabs": _moved(stored, "grow", "bar")}})
    assert prefs["phone"]["tabs"][-1] == {"id": "recipes", "slot": "top"}


@pytest.mark.parametrize(
    "stored",
    [None, [], "x", {"modules": [1]}, {"phone": "x"}, {"phone": {"tabs": [1, {"id": 3}]}},
     {"phone": {"tabs": [{"id": "gym", "slot": "side"}]}, "desktop": {"cards": [{"on": 1}]}}],
)
def test_resolve_reads_anything_and_never_raises(stored):
    assert resolve(stored) == DEFAULT


# --- tenancy and grants -----------------------------------------------------------------


def test_another_account_neither_sees_nor_changes_them(client, user_a, user_b,
                                                       runtime_connection):
    """AD-24: proved as the second user, not by reading the policy."""
    _patch(client, user_a, {"modules": {"gym": False}})
    _patch(client, user_b, {"modules": {"books": False}})

    assert _prefs(client, user_a)["modules"]["gym"] is False
    assert _prefs(client, user_a)["modules"]["books"] is True
    assert _prefs(client, user_b)["modules"]["gym"] is True

    with runtime_connection(user_b["id"]) as conn:
        seen = conn.execute(
            text("SELECT preferences FROM users WHERE id = :id"), {"id": user_a["id"]}
        ).all()
        changed = conn.execute(
            text("UPDATE users SET preferences = '{}' WHERE id = :id"), {"id": user_a["id"]}
        ).rowcount
        conn.commit()
    assert seen == []
    assert changed == 0
    assert _prefs(client, user_a)["modules"]["gym"] is False


def test_the_runtime_role_holds_the_column(owner_engine):
    """AD-19: without the grant every `/me` is a 500. The profile tests above would catch
    it too; this names the cause."""
    with owner_engine.connect() as conn:
        privileges = set(
            conn.execute(
                text(
                    "SELECT privilege_type FROM information_schema.column_privileges "
                    "WHERE grantee = 'everything_everywhere_app' AND table_name = 'users' "
                    "AND column_name = 'preferences'"
                )
            ).scalars()
        )
    assert {"SELECT", "UPDATE"} <= privileges


def test_the_column_holds_only_an_object(owner_engine):
    with owner_engine.connect() as conn:
        clause = conn.execute(
            text(
                "SELECT pg_get_constraintdef(oid) FROM pg_constraint "
                "WHERE conname = 'users_preferences_object'"
            )
        ).scalar_one()
    assert "jsonb_typeof(preferences)" in clause


# --- the push digest (story 33.3) -------------------------------------------------------


def _digest(user):
    from app.core.db import tenant_session
    from app.services import push

    with tenant_session(user["id"]) as session:
        return push.digest(session, user["id"])


def _low_milk_and_a_run(client, user):
    client.post("/api/inventory/spaces", json={"name": "Fridge"}, headers=user["headers"])
    client.post(
        "/api/inventory/items",
        json={"name": "Milk", "quantity": 0, "restock_below": 1, "space_name": "Fridge"},
        headers=user["headers"],
    )
    client.post(
        "/api/habits",
        json={"name": "Run", "schedule_kind": "daily", "target_count": 1, "remind": True},
        headers=user["headers"],
    )


def test_the_digest_leaves_out_a_module_that_is_off(client, user_a):
    """Off hides the UI and the notification that points at it; the rows stay."""
    _low_milk_and_a_run(client, user_a)
    before = _digest(user_a)
    assert before.low_items == 1
    assert before.habit_names == ["Run"]

    _patch(client, user_a, {"modules": {"stock": False}})
    stock_off = _digest(user_a)
    assert stock_off.low_items == 0
    assert "restock" not in stock_off.body
    assert stock_off.habit_names == ["Run"]

    _patch(client, user_a, {"modules": {"stock": True, "habits": False}})
    habits_off = _digest(user_a)
    assert habits_off.low_items == 1
    assert habits_off.habit_names == []
    assert "habit" not in habits_off.body


def test_both_off_and_nothing_pending_is_an_empty_digest(client, user_a):
    _low_milk_and_a_run(client, user_a)
    _patch(client, user_a, {"modules": {"stock": False, "habits": False}})
    assert _digest(user_a).empty
