"""push subscriptions

Epic 18. A browser's push subscription: where to send, and the two keys that encrypt the
payload for it. One row per device per account, so signing in on a phone and a laptop gives
two.

The endpoint is unique across the table rather than per user, because it identifies a
browser install: if a device is handed over and someone else signs in on it, the row must
move to the new account rather than have both notified. Uniqueness across users is the only
way to say that.

Nothing here is a secret of ours — the keys belong to the browser and are useless without
the endpoint — but the rows are user data like any other, so AD-1 applies unchanged.

Revision ID: 0013
Revises: 0012
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

from migrations.rls import protect, unprotect

revision: str = "0013"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    uuid_type = sa.dialects.postgresql.UUID(as_uuid=True)

    op.create_table(
        "push_subscriptions",
        sa.Column("id", uuid_type, primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column(
            "user_id", uuid_type, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("endpoint", sa.Text, nullable=False, unique=True),
        sa.Column("p256dh", sa.Text, nullable=False),
        sa.Column("auth", sa.Text, nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        # The day a digest last went to this device. One a day at most: a reminder that
        # arrives every hour is a reminder nobody reads.
        sa.Column("notified_on", sa.Date, nullable=True),
    )
    op.create_index("push_subscriptions_user_id_idx", "push_subscriptions", ["user_id"])
    protect("push_subscriptions")

    # The device-handover problem, and the narrow hole that solves it.
    #
    # The endpoint is unique across the table, so when B signs in on the phone A used to
    # own, B's INSERT collides with A's row — and `ON CONFLICT DO UPDATE` cannot resolve it,
    # because row-level security will not show B a row belonging to A. Refusing instead
    # would leave A being notified about B's fridge from a phone A no longer holds.
    #
    # So: one SECURITY DEFINER function that can *only delete* a row by its endpoint. It is
    # deliberately weaker than a reassignment. It returns void, so it is not an oracle for
    # whether an endpoint exists; it cannot read a row, name its owner, or grant anything.
    # The worst it can do to a stranger — who would first have to know a push endpoint, an
    # unguessable per-install URL — is stop that device being notified, which is what
    # handing the device on means anyway. The insert that follows runs under the caller's
    # own tenancy like any other write. Same shape as AD-32's auth_set_password.
    op.execute(
        """
        CREATE FUNCTION push_release_endpoint(p_endpoint text)
        RETURNS void
        LANGUAGE sql
        SECURITY DEFINER
        SET search_path = public, pg_temp
        AS $$ DELETE FROM push_subscriptions WHERE endpoint = p_endpoint $$;
        """
    )
    op.execute("REVOKE ALL ON FUNCTION push_release_endpoint(text) FROM PUBLIC")
    from migrations.rls import APP_ROLE

    op.execute(f'GRANT EXECUTE ON FUNCTION push_release_endpoint(text) TO "{APP_ROLE}"')


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS push_release_endpoint(text)")
    unprotect("push_subscriptions")
    op.drop_table("push_subscriptions")
