from datetime import timedelta
from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, field_validator, model_validator
from backend.app.schemas.academics import TimetableCreate


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Window(StrictModel):
    day_of_week: int = Field(ge=0, le=6)
    start_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    end_time: str = Field(pattern=r"^\d{2}:\d{2}$")
    _clock = field_validator("start_time", "end_time")(TimetableCreate.valid_clock.__func__)

    @model_validator(mode="after")
    def order(self):
        if self.end_time <= self.start_time: raise ValueError("End must follow start. Split overnight windows.")
        return self


class Interval(StrictModel):
    start: AwareDatetime
    end: AwareDatetime

    @model_validator(mode="after")
    def order(self):
        if self.end <= self.start: raise ValueError("End must follow start")
        return self


class Availability(StrictModel):
    windows: list[Window] = Field(default_factory=list, max_length=28)
    exclusions: list[Interval] = Field(default_factory=list, max_length=100)


class Participants(StrictModel):
    participants: list[str] = Field(min_length=1, max_length=30)

    @field_validator("participants")
    @classmethod
    def distinct(cls, value):
        if len(set(value)) != len(value): raise ValueError("Choose each student once")
        return value


class SlotRequest(Interval, Participants):
    duration_minutes: int = Field(ge=15, le=240)

    @model_validator(mode="after")
    def horizon(self):
        if self.end - self.start > timedelta(days=14): raise ValueError("Choose a range of at most 14 days")
        return self


class EventCreate(Interval, Participants):
    topic: str = Field(min_length=1, max_length=160)

    @field_validator("topic")
    @classmethod
    def clean(cls, value):
        if not value.strip(): raise ValueError("Enter a topic")
        return value.strip()


class EventReschedule(Interval):
    revision: int = Field(ge=1)


class EventResponse(StrictModel):
    status: str = Field(pattern="^(accepted|declined)$")
    revision: int = Field(ge=1)
