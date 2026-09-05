from pydantic import BaseModel, ConfigDict, Field


class PushKeyOut(BaseModel):
    """The VAPID public key a browser needs to subscribe. Public by design."""

    public_key: str


class SubscriptionIn(BaseModel):
    """Exactly what `PushSubscription.toJSON()` gives the client, flattened."""

    endpoint: str = Field(min_length=1, max_length=2000)
    p256dh: str = Field(min_length=1, max_length=200)
    auth: str = Field(min_length=1, max_length=200)


class UnsubscribeIn(BaseModel):
    endpoint: str = Field(min_length=1, max_length=2000)


class SubscriptionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    created_at: str


class PushStatusOut(BaseModel):
    """Whether push is configured on this instance, and whether this account has a device."""

    enabled: bool
    devices: int
