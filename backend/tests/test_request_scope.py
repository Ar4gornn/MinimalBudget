"""When the request's transaction commits, relative to the response (AD-4, Epic 28).

FastAPI runs the exit code of a ``yield`` dependency — here, the commit in ``core.db`` —
**after the response is sent** unless the dependency is declared with ``scope="function"``.
Under the default, a client that writes and then reads (every ``await api.update…(); await
load()`` in the web client) can get a 200 for the write and then a list that does not yet
contain it: its GET arrives while the PATCH's transaction is still open on another thread.
Seen for real on the Books page: an edit answered 200 and the reload showed the row
unchanged. A commit that *fails* would also fail after the 200 had gone out.

The ``TestClient`` cannot show this: it waits for the whole ASGI cycle, teardown included,
before handing the response back, so a PATCH-then-GET in a test is always ordered. What can
be pinned is the declaration itself, and the one exception to it — the streaming export,
whose generator runs *while* the response is sent and therefore needs the session to
outlive the path function, or every RLS-filtered read inside it answers nothing.
"""

from fastapi import params

from app.api.export import StreamSession
from app.core.deps import AnonSession, DbSession


def _depends(annotated) -> params.Depends:
    (dependency,) = [m for m in annotated.__metadata__ if isinstance(m, params.Depends)]
    return dependency


def test_a_request_session_commits_before_the_response_is_sent():
    assert _depends(DbSession).scope == "function"
    assert _depends(AnonSession).scope == "function"


def test_the_streaming_export_keeps_its_session_until_the_last_chunk():
    """Made to fail on purpose by giving the export ``DbSession``: the CSV came back as a
    header with no rows, because the tenant setting went with the closed transaction."""
    assert _depends(StreamSession).scope == "request"
