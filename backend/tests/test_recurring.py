"""Epic 13 — recurring templates, proposals and materialisation.

The properties that matter: materialising twice proposes once (AD-33); a proposal becomes an
entry only when someone says so, unless the template opted in; a skip is remembered; the
anchor day survives a short month; and none of it crosses a user boundary.
"""

import datetime as dt

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.services.recurring import advance

TODAY = dt.date(2026, 9, 5)


def _category(client, user, name="Rent", kind="expense"):
    return client.post(
        "/api/categories", json={"name": name, "kind": kind}, headers=user["headers"]
    ).json()


def _template(client, user, **overrides):
    payload = {
        "kind": "expense",
        "amount": "1200.00",
        "cadence": "monthly",
        "start_on": "2026-07-01",
        "category_name": "Rent",
    } | overrides
    return client.post("/api/recurring/templates", json=payload, headers=user["headers"])


def _pending(client, user):
    response = client.get("/api/recurring/pending", headers=user["headers"])
    assert response.status_code == 200, response.text
    return response.json()["items"]


# ------------------------------------------------------------- cadence


@pytest.mark.parametrize(
    ("cadence", "anchor", "current", "expected"),
    [
        ("weekly", dt.date(2026, 1, 1), dt.date(2026, 1, 1), dt.date(2026, 1, 8)),
        ("monthly", dt.date(2026, 1, 15), dt.date(2026, 1, 15), dt.date(2026, 2, 15)),
        # December rolls into January without a special case.
        ("monthly", dt.date(2026, 12, 3), dt.date(2026, 12, 3), dt.date(2027, 1, 3)),
        # The 31st clamps to the short month...
        ("monthly", dt.date(2026, 1, 31), dt.date(2026, 1, 31), dt.date(2026, 2, 28)),
        # ...and recovers, because the anchor carries the intended day, not the last date.
        ("monthly", dt.date(2026, 1, 31), dt.date(2026, 2, 28), dt.date(2026, 3, 31)),
        ("yearly", dt.date(2024, 2, 29), dt.date(2024, 2, 29), dt.date(2025, 2, 28)),
    ],
)
def test_the_anchor_survives_a_short_month(cadence, anchor, current, expected):
    assert advance(cadence, anchor, current) == expected


# ------------------------------------------------------------ templates


def test_a_template_is_created_by_category_name_and_starts_due_on_its_start_date(client, user_a):
    created = _template(client, user_a)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["amount"] == "1200.00"
    assert body["next_due"] == "2026-07-01"
    assert body["auto"] is False
    assert body["paused"] is False
    # AD-12: the category was created by name, as on entries.
    names = [
        c["name"] for c in client.get("/api/categories", headers=user_a["headers"]).json()["items"]
    ]
    assert "Rent" in names


def test_both_or_neither_category_field_is_rejected(client, user_a):
    category = _category(client, user_a)
    both = _template(client, user_a, category_id=category["id"])
    assert both.status_code == 422
    payload = {
        "kind": "expense",
        "amount": "10.00",
        "cadence": "monthly",
        "start_on": "2026-07-01",
    }
    assert (
        client.post("/api/recurring/templates", json=payload, headers=user_a["headers"]).status_code
        == 422
    )


def test_a_template_cannot_use_a_category_of_the_other_kind(client, user_a):
    salary = _category(client, user_a, name="Salary", kind="income")
    response = _template(client, user_a, category_id=salary["id"], category_name=None)
    assert response.status_code == 404


def test_an_end_before_the_start_is_refused_by_validation_and_by_the_database(
    client, user_a, runtime_connection
):
    assert _template(client, user_a, end_on="2026-06-01").status_code == 422

    category = _category(client, user_a)
    conn = runtime_connection(user_a["id"])
    try:
        with pytest.raises(IntegrityError):
            conn.execute(
                text(
                    "INSERT INTO recurring_templates "
                    "(user_id, kind, category_id, amount, cadence, start_on, end_on, next_due) "
                    "VALUES (:uid, 'expense', :cid, 10, 'monthly', "
                    "DATE '2026-07-01', DATE '2026-06-01', DATE '2026-07-01')"
                ),
                {"uid": str(user_a["id"]), "cid": category["id"]},
            )
    finally:
        conn.close()


def test_a_template_can_be_paused_amended_and_deleted(client, user_a):
    template = _template(client, user_a).json()
    url = f"/api/recurring/templates/{template['id']}"

    amended = client.patch(
        url, json={"amount": "1250.00", "paused": True}, headers=user_a["headers"]
    )
    assert amended.status_code == 200
    assert amended.json()["amount"] == "1250.00"
    assert amended.json()["paused"] is True

    assert client.delete(url, headers=user_a["headers"]).status_code == 204
    assert client.get("/api/recurring/templates", headers=user_a["headers"]).json()["items"] == []


def test_another_users_template_is_404(client, user_a, user_b):
    template = _template(client, user_a).json()
    url = f"/api/recurring/templates/{template['id']}"
    assert client.patch(url, json={"amount": "1.00"}, headers=user_b["headers"]).status_code == 404
    assert client.delete(url, headers=user_b["headers"]).status_code == 404


# -------------------------------------------------------- materialising


def test_reading_the_pending_list_materialises_it_and_doing_so_twice_proposes_once(client, user_a):
    _template(client, user_a, start_on="2026-07-01")

    first = _pending(client, user_a)
    due = [row["due_on"] for row in first]
    assert due == sorted(due)
    assert "2026-07-01" in due and "2026-08-01" in due
    assert all(row["amount"] == "1200.00" for row in first)
    assert all(row["category_name"] == "Rent" for row in first)

    # AD-33: idempotent. The same dates are not proposed a second time.
    assert [row["id"] for row in _pending(client, user_a)] == [row["id"] for row in first]
    # And nothing was written to the ledger by merely looking.
    assert client.get("/api/entries", headers=user_a["headers"]).json()["items"] == []


def test_a_proposal_becomes_an_entry_only_when_confirmed(client, user_a):
    _template(client, user_a)
    proposal = _pending(client, user_a)[0]

    confirmed = client.post(
        f"/api/recurring/occurrences/{proposal['id']}/confirm", json={}, headers=user_a["headers"]
    )
    assert confirmed.status_code == 200, confirmed.text
    entry = confirmed.json()
    assert entry["amount"] == "1200.00"
    assert entry["occurred_on"] == proposal["due_on"]

    entries = client.get("/api/entries", headers=user_a["headers"]).json()["items"]
    assert [e["id"] for e in entries] == [entry["id"]]
    # It leaves the pending list and does not come back.
    assert proposal["id"] not in [row["id"] for row in _pending(client, user_a)]


def test_a_proposal_can_be_confirmed_with_a_corrected_amount(client, user_a):
    _template(client, user_a, amount="60.00", category_name="Electricity")
    proposal = _pending(client, user_a)[0]

    confirmed = client.post(
        f"/api/recurring/occurrences/{proposal['id']}/confirm",
        json={"amount": "72.40"},
        headers=user_a["headers"],
    )
    assert confirmed.json()["amount"] == "72.40"
    # The template keeps its own figure; a correction is not an edit.
    templates = client.get("/api/recurring/templates", headers=user_a["headers"]).json()["items"]
    assert templates[0]["amount"] == "60.00"


def test_confirming_twice_is_refused_and_creates_one_entry(client, user_a):
    _template(client, user_a)
    proposal = _pending(client, user_a)[0]
    url = f"/api/recurring/occurrences/{proposal['id']}/confirm"

    assert client.post(url, json={}, headers=user_a["headers"]).status_code == 200
    assert client.post(url, json={}, headers=user_a["headers"]).status_code == 409
    assert len(client.get("/api/entries", headers=user_a["headers"]).json()["items"]) == 1


def test_a_skip_is_remembered_rather_than_proposed_again(client, user_a):
    _template(client, user_a)
    proposal = _pending(client, user_a)[0]

    assert (
        client.post(
            f"/api/recurring/occurrences/{proposal['id']}/skip", headers=user_a["headers"]
        ).status_code
        == 204
    )
    assert proposal["id"] not in [row["id"] for row in _pending(client, user_a)]
    assert client.get("/api/entries", headers=user_a["headers"]).json()["items"] == []
    # A decided proposal cannot be confirmed after the fact.
    assert (
        client.post(
            f"/api/recurring/occurrences/{proposal['id']}/confirm",
            json={},
            headers=user_a["headers"],
        ).status_code
        == 409
    )


def test_an_auto_template_creates_its_entries_without_asking(client, user_a):
    _template(client, user_a, auto=True, start_on="2026-07-01")
    assert _pending(client, user_a) == []

    entries = client.get("/api/entries", headers=user_a["headers"]).json()["items"]
    assert len(entries) >= 2
    assert {e["amount"] for e in entries} == {"1200.00"}
    dates = sorted(e["occurred_on"] for e in entries)
    assert dates[0] == "2026-07-01" and dates[1] == "2026-08-01"

    # Reading again does not double them.
    before = len(entries)
    _pending(client, user_a)
    assert len(client.get("/api/entries", headers=user_a["headers"]).json()["items"]) == before


def test_a_paused_template_proposes_nothing_and_resumes_where_it_left_off(client, user_a):
    template = _template(client, user_a, start_on="2026-07-01").json()
    url = f"/api/recurring/templates/{template['id']}"
    client.patch(url, json={"paused": True}, headers=user_a["headers"])

    assert _pending(client, user_a) == []

    client.patch(url, json={"paused": False}, headers=user_a["headers"])
    resumed = _pending(client, user_a)
    assert "2026-07-01" in [row["due_on"] for row in resumed]


def test_a_template_stops_at_its_end_date(client, user_a):
    _template(client, user_a, start_on="2026-07-01", end_on="2026-08-01")
    due = sorted(row["due_on"] for row in _pending(client, user_a))
    assert due == ["2026-07-01", "2026-08-01"]


def test_deleting_a_template_takes_its_proposals_and_leaves_its_entries(client, user_a):
    template = _template(client, user_a).json()
    proposal = _pending(client, user_a)[0]
    entry = client.post(
        f"/api/recurring/occurrences/{proposal['id']}/confirm", json={}, headers=user_a["headers"]
    ).json()

    assert (
        client.delete(
            f"/api/recurring/templates/{template['id']}", headers=user_a["headers"]
        ).status_code
        == 204
    )

    assert _pending(client, user_a) == []
    # AD-21: the entry is a record of money that moved, not an attribute of the template.
    ids = [e["id"] for e in client.get("/api/entries", headers=user_a["headers"]).json()["items"]]
    assert entry["id"] in ids


def test_deleting_the_entry_keeps_the_occurrence(client, user_a, owner_engine):
    """ON DELETE SET NULL (entry_id): the decision is history, the entry is a separate record.

    The pair of constraints has to agree about this. An earlier CHECK said an entry exists
    exactly when the status is ``created``, which the SET NULL then violated — deleting an
    entry raised instead of releasing it.
    """
    _template(client, user_a)
    proposal = _pending(client, user_a)[0]
    entry = client.post(
        f"/api/recurring/occurrences/{proposal['id']}/confirm", json={}, headers=user_a["headers"]
    ).json()

    assert (
        client.delete(f"/api/entries/{entry['id']}", headers=user_a["headers"]).status_code == 204
    )

    with owner_engine.connect() as conn:
        row = conn.execute(
            text("SELECT status, entry_id FROM recurring_occurrences WHERE id = :id"),
            {"id": proposal["id"]},
        ).one()
    assert row.entry_id is None
    # The decision survives the entry: it was created, and that is not undone by a delete.
    assert row.status == "created"
    # It is not proposed again either: the decision stands.
    assert proposal["id"] not in [p["id"] for p in _pending(client, user_a)]


# ------------------------------------------------------------ isolation


def test_b_sees_none_of_as_templates_or_proposals(client, user_a, user_b, runtime_connection):
    _template(client, user_a)
    proposal = _pending(client, user_a)[0]

    assert client.get("/api/recurring/templates", headers=user_b["headers"]).json()["items"] == []
    assert _pending(client, user_b) == []
    assert (
        client.post(
            f"/api/recurring/occurrences/{proposal['id']}/confirm",
            json={},
            headers=user_b["headers"],
        ).status_code
        == 404
    )
    assert (
        client.post(
            f"/api/recurring/occurrences/{proposal['id']}/skip", headers=user_b["headers"]
        ).status_code
        == 404
    )

    conn = runtime_connection(user_b["id"])
    try:
        assert conn.execute(text("SELECT count(*) FROM recurring_templates")).scalar_one() == 0
        assert conn.execute(text("SELECT count(*) FROM recurring_occurrences")).scalar_one() == 0
        assert (
            conn.execute(
                text("UPDATE recurring_occurrences SET status = 'skipped' WHERE id = :id"),
                {"id": proposal["id"]},
            ).rowcount
            == 0
        )
    finally:
        conn.close()


def test_b_cannot_point_a_template_at_as_category(client, user_a, user_b, runtime_connection):
    category = _category(client, user_a)
    assert (
        _template(client, user_b, category_id=category["id"], category_name=None).status_code == 404
    )

    # AD-18: the composite foreign key refuses it even below the API.
    conn = runtime_connection(user_b["id"])
    try:
        with pytest.raises(IntegrityError):
            conn.execute(
                text(
                    "INSERT INTO recurring_templates "
                    "(user_id, kind, category_id, amount, cadence, start_on, next_due) "
                    "VALUES (:uid, 'expense', :cid, 10, 'monthly', "
                    "DATE '2026-07-01', DATE '2026-07-01')"
                ),
                {"uid": str(user_b["id"]), "cid": category["id"]},
            )
    finally:
        conn.close()
