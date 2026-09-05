"""Generate the VAPID key pair that push notifications need (Epic 18).

    python vapid.py

Prints three lines to paste into `.env`. Run once per instance and keep the private key as
you would any other secret — anyone holding it can send notifications that appear to come
from this app. Rotating it silently invalidates every existing subscription, which is
recoverable: each person turns notifications on again.

Prints to stdout deliberately, like `invite.py`: the operator is the only one running it,
and writing to `.env` on their behalf would clobber a file this script does not own.
"""

import base64

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid01


def _b64(raw: bytes) -> str:
    """URL-safe base64 without padding, which is what the Web Push spec and browsers use."""
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def main() -> int:
    vapid = Vapid01()
    vapid.generate_keys()

    private_numbers = vapid.private_key.private_numbers()
    private_raw = private_numbers.private_value.to_bytes(32, "big")

    # X9.62 uncompressed point is the form a browser expects in `applicationServerKey`.
    public = vapid.public_key.public_bytes(
        encoding=serialization.Encoding.X962,
        format=serialization.PublicFormat.UncompressedPoint,
    )

    print("# Paste into .env. Keep VAPID_PRIVATE_KEY secret.")
    print(f"VAPID_PUBLIC_KEY={_b64(public)}")
    print(f"VAPID_PRIVATE_KEY={_b64(private_raw)}")
    print("VAPID_SUBJECT=mailto:you@example.com  # a real address a push service can reach")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
